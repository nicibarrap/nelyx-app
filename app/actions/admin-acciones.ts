"use server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { PLANES, PlanKey, esPlanValido, precioDePlan, sumarMeses, DIAS_PRUEBA_GRATUITA, DIAS_GRACIA_PAGO } from "@/lib/suscripciones"
import { cancelarNotificacionesPorPrefijo } from "@/lib/notificaciones"

async function getAdminSession() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN" || session.user.esEmpleado) throw new Error("No autorizado")
  return session
}

/** 12 caracteres al azar — suficiente para una clave temporal de un solo uso. */
function generarPasswordAleatoria(): string {
  return randomBytes(9).toString("base64url").slice(0, 12)
}

// ── Crear cliente ──────────────────────────────────────────────────────
// Todo cliente nuevo arranca con el primer mes gratis, sea cual sea el
// plan elegido — el plan real recién se cobra cuando termina la prueba
// (ver aplicarTransicion en lib/suscripciones.ts). El dueño de la cuenta
// nunca ve ni define una contraseña acá: la define él mismo desde el link
// de invitación (ver enviarInvitacionCliente en password-reset-acciones.ts).
export async function crearClienteNelyx(formData: FormData) {
  await getAdminSession()
  const nombre = formData.get("nombre") as string
  const email = formData.get("email") as string
  const negocio = formData.get("negocio") as string | null
  const planSeleccionado = (formData.get("plan") as string) || "mensual"
  const fechaInicioInput = formData.get("fechaInicio") as string | null

  const plan: PlanKey = esPlanValido(planSeleccionado) ? planSeleccionado : "mensual"
  const fechaInicio = fechaInicioInput ? new Date(fechaInicioInput) : new Date()

  // Contraseña al azar que nadie conoce — solo para llenar la columna NOT
  // NULL hasta que el cliente cree la suya propia vía invitación.
  const hashed = await bcrypt.hash(generarPasswordAleatoria(), 10)

  const user = await db.user.create({
    data: {
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      negocio: negocio?.trim() || null,
      activo: true,
      rol: "USER",
    },
  })

  const fechaFinPrueba = new Date(fechaInicio)
  fechaFinPrueba.setDate(fechaFinPrueba.getDate() + DIAS_PRUEBA_GRATUITA)
  await db.suscripcionNelyx.create({
    data: {
      userId: user.id,
      plan,
      estado: "prueba_gratuita",
      fechaInicio,
      fechaFinPrueba,
      precioPlan: 0,
    },
  })

  revalidatePath("/admin/clientes")
  return { id: user.id }
}

/**
 * Reintenta ante conflicto de concurrencia (P2034) en una transacción
 * Serializable — mismo patrón que `conTransaccionSerializable` en
 * acciones.ts, duplicado acá porque es un helper interno de implementación,
 * no algo que valga la pena acoplar entre módulos.
 */
async function conTransaccionSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const INTENTOS_MAX = 5
  for (let intento = 1; intento <= INTENTOS_MAX; intento++) {
    try {
      return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (err: any) {
      const esConflictoConcurrencia = err?.code === "P2034"
      if (!esConflictoConcurrencia || intento === INTENTOS_MAX) throw err
      await new Promise(r => setTimeout(r, 30 + Math.random() * 70))
    }
  }
  throw new Error("No se pudo completar la operación por alta concurrencia, intenta de nuevo")
}

// ── Registrar pago de un cobro pendiente ───────────────────────────────
export async function registrarPagoCobro(formData: FormData) {
  await getAdminSession()
  const cobroId = formData.get("cobroId") as string
  const metodoPago = (formData.get("metodoPago") as string) || "transferencia"
  const observacion = (formData.get("observacion") as string | null) || null

  const cobroBase = await db.cobroNelyx.findUnique({ where: { id: cobroId }, include: { suscripcion: true } })
  if (!cobroBase) return

  const resultado = await conTransaccionSerializable(async (tx) => {
    // Se relee "estado" DENTRO de la transacción: dos clics casi
    // simultáneos en "Registrar pago" no deben poder crear dos PagoNelyx
    // para el mismo cobro.
    const cobro = await tx.cobroNelyx.findUnique({ where: { id: cobroId } })
    if (!cobro || cobro.estado === "pagado") return null

    const pago = await tx.pagoNelyx.create({
      data: {
        suscripcionId: cobro.suscripcionId,
        monto: cobro.monto,
        metodoPago,
        observacion,
        estado: "pagado",
      },
    })

    const plan: PlanKey = esPlanValido(cobro.plan) ? cobro.plan : "mensual"
    const fechaProximoCobro = sumarMeses(new Date(), PLANES[plan].meses)

    await tx.cobroNelyx.update({ where: { id: cobroId }, data: { estado: "pagado", pagoId: pago.id } })
    await tx.suscripcionNelyx.update({
      where: { id: cobro.suscripcionId },
      data: { estado: "al_dia", fechaProximoCobro },
    })
    await tx.user.update({ where: { id: cobroBase.suscripcion.userId }, data: { activo: true } })
    return cobro.suscripcionId
  })

  if (!resultado) return
  await cancelarNotificacionesPorPrefijo(`nelyx:${resultado}:pagopendiente`)

  revalidatePath("/admin/clientes")
}

// ── Editar suscripción (plan, fechas, precio, estado, renovación) ─────
export async function actualizarSuscripcion(formData: FormData) {
  await getAdminSession()
  const suscripcionId = formData.get("suscripcionId") as string
  const plan = formData.get("plan") as string
  const fechaProximoCobroRaw = formData.get("fechaProximoCobro") as string | null
  const renovacionAutomatica = formData.get("renovacionAutomatica") === "on"
  const generarCobroAhora = formData.get("generarCobroAhora") === "on"

  const sus = await db.suscripcionNelyx.findUnique({ where: { id: suscripcionId } })
  if (!sus) return

  const planFinal: PlanKey = esPlanValido(plan) ? plan : "mensual"
  const nuevoPrecio = precioDePlan(planFinal)
  const fechaProximoCobro = fechaProximoCobroRaw ? new Date(fechaProximoCobroRaw) : sus.fechaProximoCobro

  await db.suscripcionNelyx.update({
    where: { id: suscripcionId },
    data: { plan: planFinal, precioPlan: nuevoPrecio, fechaProximoCobro, renovacionAutomatica },
  })

  // Si cambió de plan y se pide generar el cobro del nuevo monto de inmediato
  if (generarCobroAhora) {
    const fechaVencimiento = new Date()
    fechaVencimiento.setDate(fechaVencimiento.getDate() + DIAS_GRACIA_PAGO)
    await db.$transaction([
      db.cobroNelyx.create({
        data: {
          suscripcionId,
          plan: planFinal,
          monto: nuevoPrecio,
          fechaEmision: new Date(),
          fechaVencimiento,
          estado: "pendiente",
        },
      }),
      db.suscripcionNelyx.update({ where: { id: suscripcionId }, data: { estado: "pendiente" } }),
    ])
  }

  revalidatePath("/admin/clientes")
}

// ── Suspender / reactivar / cancelar ───────────────────────────────────
export async function cambiarEstadoCliente(suscripcionId: string, estado: "suspendido" | "al_dia" | "cancelado") {
  await getAdminSession()
  const sus = await db.suscripcionNelyx.findUnique({ where: { id: suscripcionId } })
  if (!sus) return
  await db.suscripcionNelyx.update({ where: { id: suscripcionId }, data: { estado } })
  await db.user.update({ where: { id: sus.userId }, data: { activo: estado === "al_dia" } })
  revalidatePath("/admin/clientes")
}

export async function actualizarNotaCliente(suscripcionId: string, nota: string) {
  await getAdminSession()
  await db.suscripcionNelyx.update({ where: { id: suscripcionId }, data: { notas: nota } })
  revalidatePath("/admin/clientes")
}

export async function crearSuscripcionParaUsuario(userId: string) {
  await getAdminSession()
  const existe = await db.suscripcionNelyx.findUnique({ where: { userId } })
  if (existe) return
  const fechaInicio = new Date()
  const fechaFinPrueba = new Date(fechaInicio)
  fechaFinPrueba.setDate(fechaFinPrueba.getDate() + DIAS_PRUEBA_GRATUITA)
  await db.suscripcionNelyx.create({
    data: { userId, plan: "mensual", estado: "prueba_gratuita", fechaInicio, fechaFinPrueba, precioPlan: 0 },
  })
  revalidatePath("/admin/clientes")
}
