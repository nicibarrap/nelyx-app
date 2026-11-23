"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { tieneAcceso, esSoloLectura } from "@/lib/permisos"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"
import { calcularMontoEsperado, calcularDiferencia, agruparVentasPorMetodo, agruparGastosPorMetodo, formatearVentasPorMetodo, METODO_PAGO_EFECTIVO, type VentaPorMetodo } from "@/lib/caja"
import { formatCLP } from "@/lib/utils"

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

/** null = el dueño, igual criterio que abiertoPorNombre/realizadoPorNombre
 * en todo el resto del proyecto. */
function operadorDe(session: { user: { esEmpleado?: boolean; empleadoId?: string | null } }): string | null {
  return session.user.esEmpleado ? (session.user.empleadoId ?? null) : null
}

/** A cuál caja abierta debe quedar ligado un movimiento recién creado, dado
 * quién lo hizo (empleadoId null = dueño). Se llama UNA SOLA VEZ al crear
 * el movimiento (ver cada sitio en acciones.ts que llama a
 * db.movimiento.create/tx.movimiento.create) — el resultado queda grabado
 * para siempre en Movimiento.cierreCajaId, nunca se recalcula después.
 *
 * Regla, en este orden:
 *  1. Si el operador (dueño o este empleado puntual) tiene su propia caja
 *     abierta, el movimiento se liga a esa — así cada caja concurrente
 *     solo recibe lo que su propio operador vendió/gastó, sin mezclarse
 *     con la de otro.
 *  2. Si no tiene una propia, pero hay EXACTAMENTE UNA caja abierta en toda
 *     la cuenta (de cualquier otro operador), se liga a esa — es el caso
 *     de siempre: una sola caja física compartida, donde cualquiera puede
 *     vender contra ella aunque no la haya abierto él mismo.
 *  3. Si no hay ninguna abierta, o hay más de una y ninguna es la suya,
 *     queda sin caja (null) — no hay forma segura de decidir sola, y el
 *     movimiento igual se crea con normalidad, solo que no participa de
 *     ningún cuadre.
 */
export async function resolverCajaParaMovimiento(
  tx: Prisma.TransactionClient,
  userId: string,
  empleadoId: string | null,
): Promise<string | null> {
  const abiertas = await tx.cierreCaja.findMany({ where: { userId, fechaCierre: null }, select: { id: true, empleadoId: true } })
  const propia = abiertas.find(c => c.empleadoId === empleadoId)
  if (propia) return propia.id
  return abiertas.length === 1 ? abiertas[0].id : null
}

function serializeCierre(c: {
  id: string; montoApertura: Prisma.Decimal; abiertoPorNombre: string | null; fechaApertura: Date
  montoEsperado: Prisma.Decimal | null; montoContado: Prisma.Decimal | null; diferencia: Prisma.Decimal | null
  observacion: string | null; ventasPorMetodoResumen: string | null; gastosPorMetodoResumen: string | null
  cerradoPorNombre: string | null; fechaCierre: Date | null
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
    ventasPorMetodoResumen: c.ventasPorMetodoResumen,
    gastosPorMetodoResumen: c.gastosPorMetodoResumen,
    cerradoPorNombre: c.cerradoPorNombre,
    fechaCierre: c.fechaCierre ? c.fechaCierre.toISOString() : null,
  }
}

function serializeOtraAbierta(c: { id: string; abiertoPorNombre: string | null; montoApertura: Prisma.Decimal; fechaApertura: Date }) {
  return { id: c.id, abiertoPorNombre: c.abiertoPorNombre, montoApertura: Number(c.montoApertura), fechaApertura: c.fechaApertura.toISOString() }
}

export type OtraCajaAbiertaDTO = ReturnType<typeof serializeOtraAbierta>

/** Estado de la caja para pintar la pantalla: si HAY UNA PROPIA abierta
 * (del mismo operador que está mirando la pantalla — dueño o empleado
 * puntual), incluye cuánto efectivo debería haber EN ESTE INSTANTE si se
 * cerrara ahora mismo (vista previa — el cálculo real y definitivo se
 * vuelve a hacer dentro de cerrarCaja, no esta). "otrasAbiertas" lista las
 * demás cajas abiertas en la cuenta (de otros operadores) — puede haber
 * más de una a la vez (ver resolverCajaParaMovimiento) — pero SOLO para el
 * dueño: la visión de conjunto de todas las cajas es suya, un empleado
 * únicamente ve el estado de la suya propia. */
export async function obtenerCajaActual() {
  const session = await getSession()
  const tieneModulo = tieneAcceso(session.user.modulosPermitidos, "caja")
  const puedeEscribir = tieneModulo && !esSoloLectura(session.user.modulosPermitidos, "caja")
  const vacio = { abierta: null, montoEsperadoAhora: null, ventasPorMetodo: [] as VentaPorMetodo[], gastosPorMetodo: [] as VentaPorMetodo[], otrasAbiertas: [] as OtraCajaAbiertaDTO[], puedeEscribir }
  if (!tieneModulo) return vacio

  const operador = operadorDe(session)
  const todasAbiertas = await db.cierreCaja.findMany({ where: { userId: session.user.id, fechaCierre: null }, orderBy: { fechaApertura: "desc" } })
  const propia = todasAbiertas.find(c => c.empleadoId === operador) ?? null
  // El "fallback" a la caja única compartida (mostrar la de otro operador
  // como si fuera "la mía") solo aplica a quien NO tiene forma de abrir la
  // suya propia: el dueño (que de todos modos tiene visión de conjunto más
  // abajo) o un empleado de solo lectura. Un empleado CON acceso de
  // escritura que no tiene la suya propia debe ver "no hay caja abierta" y
  // poder abrir una — nunca heredar ni poder cerrar la de otro operador sin
  // que se la hayan mostrado explícitamente (ver "otrasAbiertas").
  const puedeHeredarCompartida = !session.user.esEmpleado || !puedeEscribir
  const abierta = propia ?? (puedeHeredarCompartida && todasAbiertas.length === 1 ? todasAbiertas[0] : null)
  const otrasAbiertas = session.user.esEmpleado ? [] : todasAbiertas.filter(c => c.id !== abierta?.id).map(serializeOtraAbierta)
  if (!abierta) return { ...vacio, otrasAbiertas }

  // Ligado directo por cierreCajaId (fijado al crear cada movimiento, ver
  // resolverCajaParaMovimiento) — ya no hace falta filtrar por rango de
  // fechas: con esto alcanza, aunque haya otras cajas abiertas en paralelo.
  const movs = await db.movimiento.findMany({
    where: { cierreCajaId: abierta.id },
    select: { tipo: true, monto: true, metodoPago: true },
  })
  const movsParsed = movs.map(m => ({ tipo: m.tipo, monto: Number(m.monto), metodoPago: m.metodoPago }))
  const montoEsperadoAhora = calcularMontoEsperado(Number(abierta.montoApertura), movsParsed.filter(m => m.metodoPago === METODO_PAGO_EFECTIVO))
  const ventasPorMetodo = agruparVentasPorMetodo(movsParsed)
  const gastosPorMetodo = agruparGastosPorMetodo(movsParsed)
  return { abierta: serializeCierre(abierta), montoEsperadoAhora, ventasPorMetodo, gastosPorMetodo, otrasAbiertas, puedeEscribir }
}

// Las dos acciones devuelven { error } en vez de lanzar un Error para los
// casos esperados (monto inválido, caja ya abierta, etc.): un throw desde
// una Server Action pierde su mensaje en producción (Next.js lo reemplaza
// por uno genérico al cruzar al cliente — protocolo de React Flight), así
// que un dato de retorno normal es la única forma confiable de que el
// mensaje real llegue a la pantalla. Ese mismo motivo cubría solo las
// validaciones de negocio de acá abajo — el throw de getSessionEscritura()
// (sin acceso al módulo, o solo lectura) quedaba sin cubrir, así que ahora
// todo el cuerpo de ambas funciones queda envuelto en try/catch.
export async function abrirCaja(montoInicial: number): Promise<{ error: string } | undefined> {
 try {
  const session = await getSessionEscritura()
  if (isNaN(montoInicial) || montoInicial < 0) return { error: "Monto inválido" }
  const operador = operadorDe(session)

  const error = await conTransaccionSerializable(async (tx) => {
    // Releído DENTRO de la transacción — dos clics en "Abrir caja" casi
    // simultáneos (o dos personas) no deben poder crear dos cajas abiertas
    // a la vez para el mismo operador (dueño, o este mismo empleado).
    const yaAbierta = await tx.cierreCaja.findFirst({ where: { userId: session.user.id, empleadoId: operador, fechaCierre: null } })
    if (yaAbierta) return "Ya hay una caja abierta. Cierra esa primero para poder abrir una nueva."
    await tx.cierreCaja.create({
      data: {
        userId: session.user.id,
        empleadoId: operador,
        montoApertura: montoInicial,
        abiertoPorNombre: session.user.esEmpleado ? session.user.name : null,
      },
    })
    return undefined
  })
  if (error) return { error }
  revalidatePath("/dashboard/caja")
 } catch (err) {
  return { error: err instanceof Error ? err.message : "No se pudo abrir la caja." }
 }
}

/** cierreCajaId es opcional — sin él, cierra la caja propia del operador
 * que llama (dueño o este mismo empleado); si no tiene una propia, SOLO el
 * dueño cae al fallback de "la única caja abierta en la cuenta" (mismo
 * comportamiento de siempre, de cuando solo podía existir una a la vez) —
 * un empleado sin caja propia nunca cierra la de otro de forma implícita,
 * ni siquiera si es la única abierta. Con cierreCajaId, cierra esa caja
 * puntual sin importar quién la abrió — así el dueño puede cerrar la de un
 * empleado al final del día, pasándole el id que ve en "otrasAbiertas". */
export async function cerrarCaja(montoContado: number, observacion?: string, cierreCajaId?: string): Promise<{ error: string } | undefined> {
 try {
  const session = await getSessionEscritura()
  if (isNaN(montoContado) || montoContado < 0) return { error: "Monto inválido" }
  const operador = operadorDe(session)

  const error = await conTransaccionSerializable(async (tx) => {
    let abierta
    if (cierreCajaId) {
      abierta = await tx.cierreCaja.findFirst({ where: { id: cierreCajaId, userId: session.user.id, fechaCierre: null } })
    } else {
      const todasAbiertas = await tx.cierreCaja.findMany({ where: { userId: session.user.id, fechaCierre: null } })
      const propia = todasAbiertas.find(c => c.empleadoId === operador)
      abierta = propia ?? (!session.user.esEmpleado && todasAbiertas.length === 1 ? todasAbiertas[0] : undefined)
    }
    if (!abierta) return "No hay una caja abierta"

    const fechaCierre = new Date()
    const movs = await tx.movimiento.findMany({
      where: { cierreCajaId: abierta.id },
      select: { tipo: true, monto: true, metodoPago: true },
    })
    const movsParsed = movs.map(m => ({ tipo: m.tipo, monto: Number(m.monto), metodoPago: m.metodoPago }))
    const montoEsperado = calcularMontoEsperado(Number(abierta.montoApertura), movsParsed.filter(m => m.metodoPago === METODO_PAGO_EFECTIVO))
    const diferencia = calcularDiferencia(montoContado, montoEsperado)
    const ventasPorMetodoResumen = formatearVentasPorMetodo(agruparVentasPorMetodo(movsParsed), formatCLP) || null
    const gastosPorMetodoResumen = formatearVentasPorMetodo(agruparGastosPorMetodo(movsParsed), formatCLP) || null

    await tx.cierreCaja.update({
      where: { id: abierta.id },
      data: {
        montoEsperado, montoContado, diferencia,
        observacion: observacion?.trim() || null,
        ventasPorMetodoResumen,
        gastosPorMetodoResumen,
        cerradoPorNombre: session.user.esEmpleado ? session.user.name : null,
        fechaCierre,
      },
    })
    return undefined
  })
  if (error) return { error }
  revalidatePath("/dashboard/caja")
 } catch (err) {
  return { error: err instanceof Error ? err.message : "No se pudo cerrar la caja." }
 }
}

/** El dueño ve el historial de TODAS las cajas de la cuenta (cualquier
 * operador) — es la visión de conjunto que le sirve para supervisar. Un
 * empleado solo ve el historial de las que él mismo abrió/cerró, no el de
 * sus compañeros ni el del dueño. */
export async function obtenerHistorialCajas(limite: number = 30) {
  const session = await getSession()
  if (!tieneAcceso(session.user.modulosPermitidos, "caja")) return []
  const operador = operadorDe(session)
  const cierres = await db.cierreCaja.findMany({
    where: {
      userId: session.user.id,
      fechaCierre: { not: null },
      ...(session.user.esEmpleado ? { empleadoId: operador } : {}),
    },
    orderBy: { fechaApertura: "desc" },
    take: limite,
  })
  return cierres.map(serializeCierre)
}
