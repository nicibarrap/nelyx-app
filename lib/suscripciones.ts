import { db } from "@/lib/db"
import * as Sentry from "@sentry/nextjs"
import { type PlanKey, PLANES, esPlanValido, precioDePlan } from "@/lib/planes-nelyx"

// Re-exportadas acá para no romper los imports existentes
// (`from "@/lib/suscripciones"`) en el resto del código server-side — la
// fuente real de estos tres vive en lib/planes-nelyx.ts (ver su comentario).
export { type PlanKey, PLANES, esPlanValido, precioDePlan }

export const DIAS_PRUEBA_GRATUITA = 30
export const DIAS_GRACIA_PAGO = 5      // plazo para pagar un cobro antes de pasar a "vencido"
export const DIAS_ALERTA_PROXIMO = 5   // días antes del cobro para marcar "próximo a vencer"

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

  // Cada suscripción es independiente de las demás — se procesan en
  // paralelo (tandas acotadas) y se aísla el fallo de una sola en vez de
  // dejar que una fila con datos raros tumbe la carga de TODO el panel
  // admin (antes, un error sin capturar en cualquiera de ellas cortaba el
  // for y ninguna suscripción se terminaba de sincronizar esa vez).
  const TAMANO_LOTE = 10
  for (let i = 0; i < suscripciones.length; i += TAMANO_LOTE) {
    const lote = suscripciones.slice(i, i + TAMANO_LOTE) as SusRow[]
    const resultados = await Promise.allSettled(lote.map(sus => aplicarTransicion(sus, hoy)))
    for (const r of resultados) {
      if (r.status === "rejected") { console.error("Error al sincronizar suscripción:", r.reason); Sentry.captureException(r.reason) }
    }
  }
}

/**
 * Deja una fila en el historial de auditoría de la suscripción (visible en
 * /admin/clientes → ficha del cliente → "Ver historial"). adminNombre
 * omitido o null = lo disparó una transición automática, no un clic del
 * admin — ver el comentario del modelo en schema.prisma.
 */
export async function registrarEventoSuscripcion(suscripcionId: string, tipo: string, detalle?: string | null, adminNombre?: string | null) {
  await db.suscripcionNelyxEvento.create({
    data: { suscripcionId, tipo, detalle: detalle ?? null, adminNombre: adminNombre ?? null },
  })
}

/**
 * Al reactivar una suscripción suspendida o cancelada (desde /admin/clientes),
 * no se puede asumir "al_dia" a ciegas — si tenía un cobro pendiente o
 * vencido sin pagar antes de suspenderla, reactivar no debe borrar esa
 * deuda convirtiéndola en "al día" como si se hubiera pagado. Se recalcula
 * el estado real a partir de las mismas señales que usa
 * sincronizarSuscripciones (si sigue habiendo un cobro sin pagar, o si la
 * prueba gratuita todavía no terminaba).
 */
export async function determinarEstadoAlReactivar(suscripcionId: string): Promise<EstadoSuscripcion> {
  const hoy = new Date()
  const sus = await db.suscripcionNelyx.findUnique({
    where: { id: suscripcionId },
    select: {
      fechaFinPrueba: true,
      cobros: { where: { estado: { in: ["pendiente", "vencido"] } }, orderBy: { fechaVencimiento: "desc" }, take: 1, select: { fechaVencimiento: true } },
    },
  })
  if (!sus) return "al_dia"
  const cobroPendiente = sus.cobros[0]
  if (cobroPendiente) return cobroPendiente.fechaVencimiento <= hoy ? "vencido" : "pendiente"
  if (sus.fechaFinPrueba && sus.fechaFinPrueba > hoy) return "prueba_gratuita"
  return "al_dia"
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
      db.suscripcionNelyxEvento.create({
        data: { suscripcionId: sus.id, tipo: "cobro_generado", detalle: `Terminó la prueba gratuita — primer cobro de ${PLANES[planFinal].label} por $${monto}` },
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
      db.suscripcionNelyxEvento.create({
        data: { suscripcionId: sus.id, tipo: "vencido", detalle: "El cobro pendiente venció sin pagarse" },
      }),
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
      db.suscripcionNelyxEvento.create({
        data: { suscripcionId: sus.id, tipo: "cobro_generado", detalle: `Nuevo ciclo — cobro de ${PLANES[planFinal].label} por $${monto}` },
      }),
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
