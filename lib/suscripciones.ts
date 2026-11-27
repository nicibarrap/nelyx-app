import { db } from "@/lib/db"
import * as Sentry from "@sentry/nextjs"

export const DIAS_PRUEBA_GRATUITA = 30
export const DIAS_GRACIA_PAGO = 5      // plazo para pagar un cobro antes de pasar a "vencido"
export const DIAS_ALERTA_PROXIMO = 5   // días antes del cobro para marcar "próximo a vencer"

export function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha)
  d.setMonth(d.getMonth() + meses)
  return d
}

/**
 * Código corto para que el cliente lo ponga en el comentario de la
 * transferencia (ej. "NLX-4F2A9C") — ayuda a calzar manualmente contra el
 * extracto del banco. Se calcula a partir del propio id del cobro (sin
 * columna ni generador nuevo): es estable y sirve también para cobros ya
 * existentes.
 */
export function referenciaCobro(cobroId: string): string {
  return `NLX-${cobroId.slice(-6).toUpperCase()}`
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
  planId: string | null
  estado: string
  fechaFinPrueba: Date | null
  fechaProximoCobro: Date | null
  precioPlan: unknown
  cobros: { id: string; estado: string; fechaVencimiento: Date }[]
}

type PlanVigente = { nombre: string; precio: number }

/**
 * Revisa todas las suscripciones activas (no suspendidas/canceladas) y aplica
 * las transiciones automáticas de estado + generación de cobros pendientes.
 * Corre todos los días desde el cron de notificaciones (antes solo se
 * ejecutaba al cargar /admin/clientes). Solo escribe en BD las filas que
 * realmente cambiaron, para mantener el rendimiento con cientos de clientes.
 */
export async function sincronizarSuscripciones() {
  const hoy = new Date()

  const suscripciones = await db.suscripcionNelyx.findMany({
    where: { estado: { notIn: ["suspendido", "cancelado"] } },
    select: {
      id: true, userId: true, planId: true, estado: true,
      fechaFinPrueba: true, fechaProximoCobro: true, precioPlan: true,
      cobros: { where: { estado: "pendiente" }, select: { id: true, estado: true, fechaVencimiento: true } },
    },
  })

  // Se traen de una sola vez todos los planes que de verdad están en uso
  // acá (en vez de uno por suscripción) — con cientos de clientes pero un
  // puñado de planes, esto evita un N+1 sin complicar aplicarTransicion.
  const idsPlanes = [...new Set(suscripciones.map(s => s.planId).filter((id): id is string => id !== null))]
  const planes = idsPlanes.length > 0
    ? await db.planNelyx.findMany({ where: { id: { in: idsPlanes } }, select: { id: true, nombre: true, precio: true } })
    : []
  const planesPorId = new Map<string, PlanVigente>(planes.map(p => [p.id, { nombre: p.nombre, precio: Number(p.precio) }]))

  // Cada suscripción es independiente de las demás — se procesan en
  // paralelo (tandas acotadas) y se aísla el fallo de una sola en vez de
  // dejar que una fila con datos raros tumbe la carga de TODO el panel
  // admin (antes, un error sin capturar en cualquiera de ellas cortaba el
  // for y ninguna suscripción se terminaba de sincronizar esa vez).
  const TAMANO_LOTE = 10
  for (let i = 0; i < suscripciones.length; i += TAMANO_LOTE) {
    const lote = suscripciones.slice(i, i + TAMANO_LOTE) as SusRow[]
    const resultados = await Promise.allSettled(lote.map(sus => aplicarTransicion(sus, hoy, planesPorId)))
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

async function aplicarTransicion(sus: SusRow, hoy: Date, planesPorId: Map<string, PlanVigente>) {
  // 1) Prueba gratuita terminada → generar primer cobro
  if (sus.estado === "prueba_gratuita" && sus.fechaFinPrueba && sus.fechaFinPrueba <= hoy) {
    // Sin plan asignado no hay con qué facturar — queda tal cual hasta que
    // el admin le asigne uno desde /admin/clientes (no debería pasar en el
    // flujo normal, crearClienteNelyx siempre exige elegir un plan).
    const plan = sus.planId ? planesPorId.get(sus.planId) : null
    if (!plan) return
    const fechaVencimiento = new Date(sus.fechaFinPrueba)
    fechaVencimiento.setDate(fechaVencimiento.getDate() + DIAS_GRACIA_PAGO)

    await db.$transaction([
      db.cobroNelyx.create({
        data: {
          suscripcionId: sus.id,
          plan: plan.nombre,
          monto: plan.precio,
          fechaEmision: sus.fechaFinPrueba,
          fechaVencimiento,
          estado: "pendiente",
        },
      }),
      db.suscripcionNelyx.update({
        where: { id: sus.id },
        data: { precioPlan: plan.precio, estado: "pendiente" },
      }),
      db.suscripcionNelyxEvento.create({
        data: { suscripcionId: sus.id, tipo: "cobro_generado", detalle: `Terminó la prueba gratuita — primer cobro de ${plan.nombre} por $${plan.precio}` },
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

  // 3) Al día y ya se entró a la ventana de aviso (DIAS_ALERTA_PROXIMO días
  // antes del próximo cobro, o ya se pasó la fecha) → generar el cobro YA,
  // no recién el día exacto. Así el cliente puede pagar por adelantado
  // desde "Mi suscripción" en vez de encontrarse sin nada que pagar
  // todavía mientras ve el aviso de "próximo a vencer".
  if (sus.estado === "al_dia" && sus.fechaProximoCobro) {
    const diasRestantes = Math.ceil((sus.fechaProximoCobro.getTime() - hoy.getTime()) / 86400000)
    if (diasRestantes <= DIAS_ALERTA_PROXIMO) {
      return generarCobroDeCiclo(sus, sus.fechaProximoCobro, hoy, planesPorId)
    }
  }

  // 4) Compatibilidad con suscripciones que ya hubieran quedado en el
  // estado legado "próximo a vencer" (este código ya no asigna ese estado
  // desde el paso 3 de arriba, pero una fila vieja puede seguir así hasta
  // que corra este sync de nuevo): generar el cobro si ya corresponde, o
  // volver a "al día" si el admin corrió la fecha y ya no aplica.
  if (sus.estado === "proximo_vencer" && sus.fechaProximoCobro) {
    const diasRestantes = Math.ceil((sus.fechaProximoCobro.getTime() - hoy.getTime()) / 86400000)
    if (diasRestantes <= DIAS_ALERTA_PROXIMO) {
      return generarCobroDeCiclo(sus, sus.fechaProximoCobro, hoy, planesPorId)
    }
    await db.suscripcionNelyx.update({ where: { id: sus.id }, data: { estado: "al_dia" } })
  }
}

async function generarCobroDeCiclo(sus: SusRow, fechaProximoCobro: Date, hoy: Date, planesPorId: Map<string, PlanVigente>) {
  const plan = sus.planId ? planesPorId.get(sus.planId) : null
  if (!plan) return
  const fechaVencimiento = new Date(fechaProximoCobro)
  fechaVencimiento.setDate(fechaVencimiento.getDate() + DIAS_GRACIA_PAGO)

  await db.$transaction([
    db.cobroNelyx.create({
      data: {
        suscripcionId: sus.id,
        plan: plan.nombre,
        monto: plan.precio,
        fechaEmision: hoy,
        fechaVencimiento,
        estado: "pendiente",
      },
    }),
    // precioPlan se refresca acá también: si el admin subió el precio del
    // plan desde la última vez, este nuevo ciclo ya cobra el precio
    // actual — nunca afecta cobros que ya se habían generado antes.
    db.suscripcionNelyx.update({ where: { id: sus.id }, data: { estado: "pendiente", precioPlan: plan.precio } }),
    db.suscripcionNelyxEvento.create({
      data: { suscripcionId: sus.id, tipo: "cobro_generado", detalle: `Nuevo ciclo — cobro de ${plan.nombre} por $${plan.precio}` },
    }),
  ])
}
