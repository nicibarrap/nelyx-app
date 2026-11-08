"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { tieneAcceso, esSoloLectura } from "@/lib/permisos"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"
import { calcularMontoEsperado, calcularDiferencia, METODO_PAGO_EFECTIVO } from "@/lib/caja"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  await verificarCuentaActivaOExpulsar(session)
  return session
}

/** Igual que el resto de las acciones del proyecto: el único módulo acá es
 * "caja", así que no hace falta parametrizarlo. */
async function getSessionEscritura() {
  const session = await getSession()
  if (!tieneAcceso(session.user.modulosPermitidos, "caja")) {
    throw new Error("No tienes acceso a este módulo")
  }
  if (esSoloLectura(session.user.modulosPermitidos, "caja")) {
    throw new Error("Tu acceso a este módulo es solo de lectura")
  }
  return session
}

/** Mismo patrón que acciones.ts/admin-acciones.ts: reintenta si dos
 * aperturas o cierres casi simultáneos (dos personas, dos clics) chocan en
 * Serializable, en vez de dejar pasar el conflicto como un error crudo. */
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

function serializeCierre(c: {
  id: string; montoApertura: Prisma.Decimal; abiertoPorNombre: string | null; fechaApertura: Date
  montoEsperado: Prisma.Decimal | null; montoContado: Prisma.Decimal | null; diferencia: Prisma.Decimal | null
  observacion: string | null; cerradoPorNombre: string | null; fechaCierre: Date | null
}) {
  return {
    id: c.id,
    montoApertura: Number(c.montoApertura),
    abiertoPorNombre: c.abiertoPorNombre,
    fechaApertura: c.fechaApertura.toISOString(),
    montoEsperado: c.montoEsperado != null ? Number(c.montoEsperado) : null,
    montoContado: c.montoContado != null ? Number(c.montoContado) : null,
    diferencia: c.diferencia != null ? Number(c.diferencia) : null,
    observacion: c.observacion,
    cerradoPorNombre: c.cerradoPorNombre,
    fechaCierre: c.fechaCierre ? c.fechaCierre.toISOString() : null,
  }
}

/** Estado de la caja para pintar la pantalla: si hay una abierta, incluye
 * cuánto efectivo debería haber EN ESTE INSTANTE si se cerrara ahora mismo
 * (vista previa — el cálculo real y definitivo se vuelve a hacer dentro de
 * cerrarCaja, con la hora exacta de ese momento, no esta). */
export async function obtenerCajaActual() {
  const session = await getSession()
  const puedeEscribir = tieneAcceso(session.user.modulosPermitidos, "caja") && !esSoloLectura(session.user.modulosPermitidos, "caja")
  if (!tieneAcceso(session.user.modulosPermitidos, "caja")) return { abierta: null, montoEsperadoAhora: null, puedeEscribir: false }

  const abierta = await db.cierreCaja.findFirst({ where: { userId: session.user.id, fechaCierre: null }, orderBy: { fechaApertura: "desc" } })
  if (!abierta) return { abierta: null, montoEsperadoAhora: null, puedeEscribir }

  const movs = await db.movimiento.findMany({
    where: { userId: session.user.id, metodoPago: METODO_PAGO_EFECTIVO, createdAt: { gte: abierta.fechaApertura } },
    select: { tipo: true, monto: true },
  })
  const montoEsperadoAhora = calcularMontoEsperado(Number(abierta.montoApertura), movs.map(m => ({ tipo: m.tipo, monto: Number(m.monto) })))
  return { abierta: serializeCierre(abierta), montoEsperadoAhora, puedeEscribir }
}

// Las dos acciones devuelven { error } en vez de lanzar un Error para los
// casos esperados (monto inválido, caja ya abierta, etc.): un throw desde
// una Server Action pierde su mensaje en producción (Next.js lo reemplaza
// por uno genérico al cruzar al cliente — protocolo de React Flight), así
// que un dato de retorno normal es la única forma confiable de que el
// mensaje real llegue a la pantalla.
export async function abrirCaja(montoInicial: number): Promise<{ error: string } | undefined> {
  const session = await getSessionEscritura()
  if (isNaN(montoInicial) || montoInicial < 0) return { error: "Monto inválido" }

  const error = await conTransaccionSerializable(async (tx) => {
    // Releído DENTRO de la transacción — dos clics en "Abrir caja" casi
    // simultáneos (o dos personas) no deben poder crear dos cajas abiertas
    // a la vez para la misma cuenta.
    const yaAbierta = await tx.cierreCaja.findFirst({ where: { userId: session.user.id, fechaCierre: null } })
    if (yaAbierta) return "Ya hay una caja abierta. Cierra esa primero para poder abrir una nueva."
    await tx.cierreCaja.create({
      data: {
        userId: session.user.id,
        montoApertura: montoInicial,
        abiertoPorNombre: session.user.esEmpleado ? session.user.name : null,
      },
    })
    return undefined
  })
  if (error) return { error }
  revalidatePath("/dashboard/caja")
}

export async function cerrarCaja(montoContado: number, observacion?: string): Promise<{ error: string } | undefined> {
  const session = await getSessionEscritura()
  if (isNaN(montoContado) || montoContado < 0) return { error: "Monto inválido" }

  const error = await conTransaccionSerializable(async (tx) => {
    const abierta = await tx.cierreCaja.findFirst({ where: { userId: session.user.id, fechaCierre: null }, orderBy: { fechaApertura: "desc" } })
    if (!abierta) return "No hay una caja abierta"

    const fechaCierre = new Date()
    const movs = await tx.movimiento.findMany({
      where: { userId: session.user.id, metodoPago: METODO_PAGO_EFECTIVO, createdAt: { gte: abierta.fechaApertura, lte: fechaCierre } },
      select: { tipo: true, monto: true },
    })
    const montoEsperado = calcularMontoEsperado(Number(abierta.montoApertura), movs.map(m => ({ tipo: m.tipo, monto: Number(m.monto) })))
    const diferencia = calcularDiferencia(montoContado, montoEsperado)

    await tx.cierreCaja.update({
      where: { id: abierta.id },
      data: {
        montoEsperado, montoContado, diferencia,
        observacion: observacion?.trim() || null,
        cerradoPorNombre: session.user.esEmpleado ? session.user.name : null,
        fechaCierre,
      },
    })
    return undefined
  })
  if (error) return { error }
  revalidatePath("/dashboard/caja")
}

export async function obtenerHistorialCajas(limite: number = 30) {
  const session = await getSession()
  if (!tieneAcceso(session.user.modulosPermitidos, "caja")) return []
  const cierres = await db.cierreCaja.findMany({
    where: { userId: session.user.id, fechaCierre: { not: null } },
    orderBy: { fechaApertura: "desc" },
    take: limite,
  })
  return cierres.map(serializeCierre)
}
