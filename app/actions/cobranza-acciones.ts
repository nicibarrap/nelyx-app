"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { PLANTILLAS_DEFAULT, type NivelCobranza } from "@/lib/cobranza"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

/** Devuelve las 3 plantillas del usuario — si no ha personalizado alguna,
 * cae en la plantilla por defecto (nunca retorna vacío). */
export async function obtenerPlantillasCobranza() {
  const session = await getSession()
  const guardadas = await db.plantillaCobranza.findMany({ where: { userId: session.user.id } })
  const mapa = new Map(guardadas.map(p => [p.nivel, p.mensaje]))
  return {
    1: mapa.get(1) ?? PLANTILLAS_DEFAULT[1],
    2: mapa.get(2) ?? PLANTILLAS_DEFAULT[2],
    3: mapa.get(3) ?? PLANTILLAS_DEFAULT[3],
  } as Record<NivelCobranza, string>
}

export async function actualizarPlantillaCobranza(nivel: NivelCobranza, mensaje: string) {
  const session = await getSession()
  if (!mensaje.trim()) throw new Error("El mensaje no puede estar vacío")
  await db.plantillaCobranza.upsert({
    where: { userId_nivel: { userId: session.user.id, nivel } },
    update: { mensaje },
    create: { userId: session.user.id, nivel, mensaje },
  })
  revalidatePath("/dashboard/configuracion")
}

export async function restaurarPlantillaCobranza(nivel: NivelCobranza) {
  const session = await getSession()
  await db.plantillaCobranza.deleteMany({ where: { userId: session.user.id, nivel } })
  revalidatePath("/dashboard/configuracion")
  return PLANTILLAS_DEFAULT[nivel]
}

/** Registra que se contactó al cliente por un canal — es lo que permite
 * saber "cuándo fue el último contacto" sin tener que preguntarlo. */
export async function registrarContactoCobranza(cuentaId: string, canal: "whatsapp" | "email", nivel: NivelCobranza, mensaje: string) {
  const session = await getSession()
  const cuenta = await db.cuentaPorCobrar.findFirst({ where: { id: cuentaId, userId: session.user.id } })
  if (!cuenta) throw new Error("Cuenta no encontrada")

  await db.contactoCobranza.create({
    data: { cuentaId, clienteId: cuenta.clienteId, userId: session.user.id, canal, nivel, mensaje },
  })
  revalidatePath("/dashboard/cuentas-cobrar")
  revalidatePath("/dashboard/clientes")
}

export async function obtenerHistorialContactos(cuentaId: string) {
  const session = await getSession()
  const items = await db.contactoCobranza.findMany({
    where: { cuentaId, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  })
  return items.map(c => ({ id: c.id, canal: c.canal, nivel: c.nivel, createdAt: c.createdAt.toISOString() }))
}

/** Último contacto de una cuenta (para mostrarlo directamente en el listado
 * principal, ej. "WhatsApp enviado hace 3 días"), sin traer todo el historial. */
export async function obtenerUltimoContactoPorCuenta(cuentaIds: string[]) {
  const session = await getSession()
  if (cuentaIds.length === 0) return {}
  const items = await db.contactoCobranza.findMany({
    where: { cuentaId: { in: cuentaIds }, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { cuentaId: true, canal: true, nivel: true, createdAt: true },
  })
  const mapa: Record<string, { canal: string; nivel: number; createdAt: string }> = {}
  for (const it of items) {
    if (!mapa[it.cuentaId]) mapa[it.cuentaId] = { canal: it.canal, nivel: it.nivel, createdAt: it.createdAt.toISOString() }
  }
  return mapa
}
