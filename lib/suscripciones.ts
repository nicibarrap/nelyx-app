import { db } from "@/lib/db"

// ── Definición de planes ─────────────────────────────────────────────
export type PlanKey = "mensual" | "trimestral" | "semestral" | "anual"

export const PLANES: Record<PlanKey, { label: string; precio: number; meses: number }> = {
  mensual:    { label: "Mensual",    precio: 20000,  meses: 1 },
  trimestral: { label: "Trimestral", precio: 60000,  meses: 3 },
  semestral:  { label: "Semestral",  precio: 120000, meses: 6 },
  anual:      { label: "Anual",      precio: 240000, meses: 12 },
}

export const DIAS_PRUEBA_GRATUITA = 30
export const DIAS_GRACIA_PAGO = 5      // plazo para pagar un cobro antes de pasar a "vencido"
export const DIAS_ALERTA_PROXIMO = 5   // días antes del cobro para marcar "próximo a vencer"

export function esPlanValido(plan: string): plan is PlanKey {
  return plan in PLANES
}

export function precioDePlan(plan: string): number {
  return esPlanValido(plan) ? PLANES[plan].precio : 0
}

export function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha)
  d.setMonth(d.getMonth() + meses)
  return d
}

// ── Estados posibles de una suscripción ──────────────────────────────
export const ESTADOS_SUSCRIPCION = [
  "prueba_gratuita",
  "al_dia",
  "pendiente",
  "proximo_vencer",
  "vencido",
  "suspendido",
  "cancelado",
] as const
export type EstadoSuscripcion = typeof ESTADOS_SUSCRIPCION[number]

type SusRow = {
  id: string
  userId: string
  plan: string
  estado: string
  fechaFinPrueba: Date | null
  fechaProximoCobro: Date | null
  precioPlan: unknown
  cobros: { id: string; estado: string; fechaVencimiento: Date }[]
}

/**
 * Revisa todas las suscripciones activas (no suspendidas/canceladas) y aplica
 * las transiciones automáticas de estado + generación de cobros pendientes.
 * Se ejecuta al cargar /admin/clientes. Solo escribe en BD las filas que
 * realmente cambiaron, para mantener el rendimiento con cientos de clientes.
 */
export async function sincronizarSuscripciones() {
  const hoy = new Date()

  const suscripciones = await db.suscripcionNelyx.findMany({
    where: { estado: { notIn: ["suspendido", "cancelado"] } },
    select: {
      id: true, userId: true, plan: true, estado: true,
      fechaFinPrueba: true, fechaProximoCobro: true, precioPlan: true,
      cobros: { where: { estado: "pendiente" }, select: { id: true, estado: true, fechaVencimiento: true } },
    },
  })

  for (const sus of suscripciones as SusRow[]) {
    await aplicarTransicion(sus, hoy)
  }
}

async function aplicarTransicion(sus: SusRow, hoy: Date) {
  // 1) Prueba gratuita terminada → generar primer cobro (plan mensual por defecto)
  if (sus.estado === "prueba_gratuita" && sus.fechaFinPrueba && sus.fechaFinPrueba <= hoy) {
    const planFinal: PlanKey = esPlanValido(sus.plan) ? sus.plan : "mensual"
    const monto = precioDePlan(planFinal)
    const fechaVencimiento = new Date(sus.fechaFinPrueba)
    fechaVencimiento.setDate(fechaVencimiento.getDate() + DIAS_GRACIA_PAGO)

    await db.$transaction([
      db.cobroNelyx.create({
        data: {
          suscripcionId: sus.id,
          plan: planFinal,
          monto,
          fechaEmision: sus.fechaFinPrueba,
          fechaVencimiento,
          estado: "pendiente",
        },
      }),
      db.suscripcionNelyx.update({
        where: { id: sus.id },
        data: { plan: planFinal, precioPlan: monto, estado: "pendiente" },
      }),
    ])
    return
  }

  // 2) Cobro pendiente vencido → estado "vencido"
  const cobroPendiente = sus.cobros[0]
  if (cobroPendiente && cobroPendiente.fechaVencimiento <= hoy && sus.estado !== "vencido") {
    await db.$transaction([
      db.cobroNelyx.update({ where: { id: cobroPendiente.id }, data: { estado: "vencido" } }),
      db.suscripcionNelyx.update({ where: { id: sus.id }, data: { estado: "vencido" } }),
    ])
    return
  }

  // 3) Al día y llegó la fecha de próximo cobro → generar nuevo cobro
  if (sus.estado === "al_dia" && sus.fechaProximoCobro && sus.fechaProximoCobro <= hoy) {
    const planFinal: PlanKey = esPlanValido(sus.plan) ? sus.plan : "mensual"
    const monto = precioDePlan(planFinal)
    const fechaVencimiento = new Date(sus.fechaProximoCobro)
    fechaVencimiento.setDate(fechaVencimiento.getDate() + DIAS_GRACIA_PAGO)

    await db.$transaction([
      db.cobroNelyx.create({
        data: {
          suscripcionId: sus.id,
          plan: planFinal,
          monto,
          fechaEmision: sus.fechaProximoCobro,
          fechaVencimiento,
          estado: "pendiente",
        },
      }),
      db.suscripcionNelyx.update({ where: { id: sus.id }, data: { estado: "pendiente" } }),
    ])
    return
  }

  // 4) Al día pero se acerca el próximo cobro → "próximo a vencer" (solo visual/estado, sin generar cobro aún)
  if (sus.estado === "al_dia" && sus.fechaProximoCobro) {
    const diasRestantes = Math.ceil((sus.fechaProximoCobro.getTime() - hoy.getTime()) / 86400000)
    if (diasRestantes >= 0 && diasRestantes <= DIAS_ALERTA_PROXIMO) {
      await db.suscripcionNelyx.update({ where: { id: sus.id }, data: { estado: "proximo_vencer" } })
      return
    }
  }

  // 5) Estaba "próximo a vencer" pero el admin movió la fecha o pagó y ya no aplica → volver a "al_dia"
  if (sus.estado === "proximo_vencer" && sus.fechaProximoCobro) {
    const diasRestantes = Math.ceil((sus.fechaProximoCobro.getTime() - hoy.getTime()) / 86400000)
    if (diasRestantes > DIAS_ALERTA_PROXIMO) {
      await db.suscripcionNelyx.update({ where: { id: sus.id }, data: { estado: "al_dia" } })
    }
  }
}
