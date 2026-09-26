"use server"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { enviarEmail } from "@/lib/email"
import { tokenResetValido } from "@/lib/auth-logica"

// Límites — mismo espíritu que el rate limit de login (SUPABASE_SQL_RATE_LIMIT_LOGIN),
// pero acá se cuenta tanto por IP (alguien probando muchos correos
// inventados) como por email (alguien "bombardeando" la bandeja de un
// mismo usuario con links de reset).
const MAX_SOLICITUDES_POR_IP = 10
const VENTANA_IP_MINUTOS = 15
const MAX_SOLICITUDES_POR_EMAIL = 3
const VENTANA_EMAIL_MINUTOS = 60
const EXPIRA_EN_MINUTOS = 30

const MENSAJE_GENERICO = "Si ese correo está registrado, te enviamos un link para restablecer tu contraseña."

// next/headers(), no el Request de NextAuth — acá estamos en un Server
// Action, no en el callback authorize() de lib/auth.ts.
async function ipActual(): Promise<string> {
  const h = await headers()
  const xff = h.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return h.get("x-real-ip")?.trim() || "desconocida"
}

function hashToken(tokenPlano: string): string {
  return crypto.createHash("sha256").update(tokenPlano).digest("hex")
}

export async function solicitarResetPassword(emailInput: string): Promise<{ ok: boolean; mensaje: string }> {
  const email = emailInput.trim().toLowerCase()
  if (!email) return { ok: false, mensaje: "Ingresa tu correo." }
  const ip = await ipActual()

  // Se registra SIEMPRE, exista o no la cuenta — es lo único que permite
  // contar y frenar a alguien probando correos al azar.
  await db.intentoResetPassword.create({ data: { ip, email } }).catch(() => {})
  // Limpieza oportunista, igual que IntentoLoginFallido — no hace falta
  // un cron aparte para que esta tabla no crezca indefinidamente.
  if (Math.random() < 0.05) {
    const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await db.intentoResetPassword.deleteMany({ where: { createdAt: { lt: haceUnDia } } }).catch(() => {})
    await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: haceUnDia } } }).catch(() => {})
  }

  if (ip !== "desconocida") {
    const desdeIp = new Date(Date.now() - VENTANA_IP_MINUTOS * 60 * 1000)
    const intentosIp = await db.intentoResetPassword.count({ where: { ip, createdAt: { gte: desdeIp } } })
    if (intentosIp > MAX_SOLICITUDES_POR_IP) return { ok: true, mensaje: MENSAJE_GENERICO }
  }

  const desdeEmail = new Date(Date.now() - VENTANA_EMAIL_MINUTOS * 60 * 1000)
  const intentosEmail = await db.intentoResetPassword.count({ where: { email, createdAt: { gte: desdeEmail } } })
  if (intentosEmail > MAX_SOLICITUDES_POR_EMAIL) return { ok: true, mensaje: MENSAJE_GENERICO }

  // Solo cuentas dueñas (cuentaPrincipalId null) — los empleados entran
  // por PIN, no tienen una contraseña propia que recuperar por acá.
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, cuentaPrincipalId: null, activo: true },
  })
  // Mismo mensaje exista o no la cuenta — nunca delatar si un correo está
  // registrado (permitiría a cualquiera "escanear" emails reales).
  if (!user) return { ok: true, mensaje: MENSAJE_GENERICO }

  const tokenPlano = crypto.randomBytes(32).toString("hex")
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(tokenPlano),
      expiresAt: new Date(Date.now() + EXPIRA_EN_MINUTOS * 60 * 1000),
    },
  })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const link = `${baseUrl}/auth/restablecer?token=${tokenPlano}`
  await enviarEmail({
    to: user.email,
    subject: "Restablece tu contraseña — Nelyx",
    text: `Hola ${user.nombre},\n\nRecibimos una solicitud para restablecer tu contraseña de Nelyx. Este link es válido por ${EXPIRA_EN_MINUTOS} minutos:\n\n${link}\n\nSi no fuiste vos quien lo pidió, ignora este correo — tu contraseña actual sigue funcionando.`,
  })

  return { ok: true, mensaje: MENSAJE_GENERICO }
}

export async function validarTokenReset(tokenPlano: string): Promise<{ valido: boolean }> {
  if (!tokenPlano) return { valido: false }
  const registro = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(tokenPlano) } })
  if (!registro || !tokenResetValido(registro)) return { valido: false }
  return { valido: true }
}

export async function resetearPassword(tokenPlano: string, nuevaPassword: string): Promise<{ ok: boolean }> {
  if (!nuevaPassword || nuevaPassword.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.")
  const registro = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(tokenPlano) } })
  if (!registro || !tokenResetValido(registro)) throw new Error("Este link ya no es válido. Solicita uno nuevo.")

  const hash = await bcrypt.hash(nuevaPassword, 10)
  await db.$transaction([
    // Limpia también cualquier bloqueo por intentos fallidos previo — un
    // reset exitoso es un buen punto para empezar de cero.
    db.user.update({ where: { id: registro.userId }, data: { password: hash, intentosFallidosPin: 0, bloqueadoHastaPin: null } }),
    db.passwordResetToken.update({ where: { id: registro.id }, data: { usedAt: new Date() } }),
    // Invalida cualquier otro link de reset pendiente de esta misma
    // cuenta — si alguien pidió varios, cambiar la contraseña con uno
    // no debería dejar los demás todavía activos.
    db.passwordResetToken.updateMany({
      where: { userId: registro.userId, usedAt: null, id: { not: registro.id } },
      data: { usedAt: new Date() },
    }),
  ])

  return { ok: true }
}
