import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { notificar } from "@/lib/notificaciones"
import { hoyEnChile, diasEntreChile } from "@/lib/timezone"
import * as Sentry from "@sentry/nextjs"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get("authorization")
  if (header === `Bearer ${secret}`) return true
  const url = new URL(req.url)
  return url.searchParams.get("secret") === secret
}

/**
 * Procesa un arreglo en tandas de tamaño acotado, en paralelo dentro de
 * cada tanda. Dos motivos:
 * 1. Antes cada sección hacía un `for` secuencial con `await notificar(...)`
 *    uno por uno — con más clientes en la plataforma, el tiempo total crece
 *    linealmente con la cantidad de filas y arriesga superar maxDuration
 *    (60s) y cortarse a mitad de camino.
 * 2. `Promise.allSettled` aísla el fallo de un ítem del resto: antes, un
 *    solo error sin capturar (ej. un push que falla) cortaba TODA la
 *    corrida, incluidas las secciones siguientes, porque los await eran
 *    secuenciales sin try/catch.
 */
async function procesarEnLotes<T>(items: T[], tamanoLote: number, fn: (item: T) => Promise<boolean>): Promise<number> {
  let enviadas = 0
  for (let i = 0; i < items.length; i += tamanoLote) {
    const lote = items.slice(i, i + tamanoLote)
    const resultados = await Promise.allSettled(lote.map(fn))
    for (const r of resultados) {
      if (r.status === "fulfilled" && r.value) enviadas++
      else if (r.status === "rejected") { console.error("Error en notificación del cron:", r.reason); Sentry.captureException(r.reason) }
    }
  }
  return enviadas
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  // Todo el cuerpo va envuelto: si una sola consulta falla (ej. corte breve
  // de conexión a la DB), antes la corrida completa moría sin dejar rastro
  // más que el 500 genérico de Next — ahora queda logueado y se responde
  // con una forma predecible, para poder monitorear el cron desde afuera.
  try {
    return await ejecutarCron()
  } catch (err) {
    console.error("Error en cron de notificaciones:", err)
    Sentry.captureException(err)
    return NextResponse.json({ ok: false, error: "Error interno al procesar notificaciones" }, { status: 500 })
  }
}

async function ejecutarCron() {
  const ahora = hoyEnChile()
  const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}-${String(ahora.getDate()).padStart(2,"0")}`
  let enviadas = 0

  // ── 1) CALENDARIO: tareas/recordatorios/eventos con horaLimite hoy ─────
  const eventosHoy = await db.eventoCalendario.findMany({
    where: {
      estado: { in: ["pendiente", "en_progreso"] },
      fecha: { gte: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()), lt: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1) },
      horaLimite: { not: null },
    },
  })
  enviadas += await procesarEnLotes(eventosHoy, 10, async (ev) => {
    if (!ev.horaLimite) return false
    const [hh, mm] = ev.horaLimite.split(":").map(Number)
    const fechaEvento = new Date(ev.fecha)
    fechaEvento.setHours(hh, mm, 0, 0)
    const minutosFaltan = Math.round((fechaEvento.getTime() - ahora.getTime()) / 60000)

    if (minutosFaltan <= 30 && minutosFaltan > 25) {
      return await notificar({ userId: ev.userId, categoria: "calendario", prioridad: "media", titulo: `Faltan 30 minutos: ${ev.titulo}`, mensaje: "Tu evento está por comenzar.", accionUrl: "/dashboard/calendario", claveUnica: `evt:${ev.id}:30` })
    } else if (minutosFaltan <= 10 && minutosFaltan > 5) {
      return await notificar({ userId: ev.userId, categoria: "calendario", prioridad: "alta", titulo: `Faltan 10 minutos: ${ev.titulo}`, mensaje: "Tu evento está por comenzar.", accionUrl: "/dashboard/calendario", claveUnica: `evt:${ev.id}:10` })
    } else if (minutosFaltan <= 0 && minutosFaltan > -5) {
      return await notificar({ userId: ev.userId, categoria: "calendario", prioridad: "alta", titulo: `Comienza ahora: ${ev.titulo}`, mensaje: "Tu evento está comenzando.", accionUrl: "/dashboard/calendario", claveUnica: `evt:${ev.id}:start` })
    }
    return false
  })

  // ── 2) TAREAS pendientes que vencen hoy (sin hora específica) ──────────
  const tareasHoy = await db.eventoCalendario.findMany({
    where: { tipo: "tarea", estado: "pendiente", horaLimite: null, fecha: { gte: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()), lt: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1) } },
  })
  enviadas += await procesarEnLotes(tareasHoy, 10, (t) =>
    notificar({ userId: t.userId, categoria: "tareas", prioridad: "media", titulo: `Tarea de hoy: ${t.titulo}`, mensaje: "Recordatorio de tarea pendiente para hoy.", accionUrl: "/dashboard/calendario", claveUnica: `tarea:${t.id}:${hoyStr}` })
  )

  // ── 3) COSTOS FIJOS: 7/3/1/0 días antes + 2 días de atraso ─────────────
  const costosFijos = await db.costoFijoRecurrente.findMany({
    where: { estado: "activo" },
    include: { generaciones: { where: { mes: ahora.getMonth() + 1, anio: ahora.getFullYear() } } },
  })
  enviadas += await procesarEnLotes(costosFijos, 10, async (cf) => {
    const gen = cf.generaciones[0]
    if (gen?.pagado) return false
    const mesActual = ahora.getMonth() + 1, anioActual = ahora.getFullYear()
    const iMes = cf.fechaInicio.getMonth() + 1, iAnio = cf.fechaInicio.getFullYear()
    if (anioActual < iAnio || (anioActual === iAnio && mesActual < iMes)) return false
    if (cf.fechaTermino) {
      const tMes = cf.fechaTermino.getMonth() + 1, tAnio = cf.fechaTermino.getFullYear()
      if (anioActual > tAnio || (anioActual === tAnio && mesActual > tMes)) return false
    }
    const totalDiasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate()
    const diaVence = Math.min(cf.fechaInicio.getDate(), totalDiasMes)
    const fechaVence = new Date(ahora.getFullYear(), ahora.getMonth(), diaVence)
    const diff = diasEntreChile(ahora, fechaVence)

    if ([7, 3, 1, 0].includes(diff)) {
      const etiqueta = diff === 0 ? "hoy" : diff === 1 ? "mañana" : `en ${diff} días`
      return await notificar({ userId: cf.userId, categoria: "costosFijos", prioridad: diff <= 1 ? "alta" : "media", titulo: `${cf.nombre} vence ${etiqueta}`, mensaje: "Costo fijo pendiente de registrar.", accionUrl: "/dashboard/costos-fijos", claveUnica: `cf:${cf.id}:${ahora.getFullYear()}-${ahora.getMonth()+1}:${diff}` })
    } else if (diff === -2) {
      return await notificar({ userId: cf.userId, categoria: "costosFijos", prioridad: "alta", titulo: `${cf.nombre} sigue sin registrarse`, mensaje: "Han pasado 2 días desde el vencimiento.", accionUrl: "/dashboard/costos-fijos", claveUnica: `cf:${cf.id}:${ahora.getFullYear()}-${ahora.getMonth()+1}:atraso2` })
    }
    return false
  })

  // ── 4) DEUDAS: vence mañana / hoy ───────────────────────────────────────
  const deudas = await db.deuda.findMany({ where: { pagada: false, fechaVence: { not: null } } })
  enviadas += await procesarEnLotes(deudas, 10, (d) => {
    if (!d.fechaVence) return Promise.resolve(false)
    const diff = diasEntreChile(ahora, d.fechaVence)
    if (diff === 1 || diff === 0) {
      const etiqueta = diff === 0 ? "hoy" : "mañana"
      return notificar({ userId: d.userId, categoria: "deudas", prioridad: "alta", titulo: `${d.acreedor}: cuota vence ${etiqueta}`, mensaje: `Monto: ${Number(d.valorCuota ?? d.monto).toLocaleString("es-CL")}`, accionUrl: "/dashboard/deudas", claveUnica: `deuda:${d.id}:${diff===0?"hoy":"mañana"}:${hoyStr.slice(0,7)}` })
    }
    return Promise.resolve(false)
  })

  // ── 5) CUENTAS POR COBRAR: vence mañana / venció ────────────────────────
  const cuentas = await db.cuentaPorCobrar.findMany({ where: { estado: { in: ["pendiente", "parcial", "vencida"] }, fechaVence: { not: null } }, include: { cliente: { select: { nombre: true, apellido: true } } } })
  enviadas += await procesarEnLotes(cuentas, 10, (cc) => {
    if (!cc.fechaVence) return Promise.resolve(false)
    const diff = diasEntreChile(ahora, cc.fechaVence)
    const nombreCliente = cc.cliente ? `${cc.cliente.nombre} ${cc.cliente.apellido ?? ""}`.trim() : "Cliente eliminado"
    if (diff === 1) {
      return notificar({ userId: cc.userId, categoria: "cuentasCobrar", prioridad: "media", titulo: `Cobro a ${nombreCliente} vence mañana`, mensaje: `Saldo: ${Number(cc.saldoPendiente).toLocaleString("es-CL")}`, accionUrl: "/dashboard/cuentas-cobrar", claveUnica: `cxc:${cc.id}:mañana` })
    } else if (diff <= 0 && cc.estado === "vencida") {
      return notificar({ userId: cc.userId, categoria: "cuentasCobrar", prioridad: "alta", titulo: `Cobro a ${nombreCliente} venció`, mensaje: `Saldo pendiente: ${Number(cc.saldoPendiente).toLocaleString("es-CL")}`, accionUrl: "/dashboard/cuentas-cobrar", claveUnica: `cxc:${cc.id}:vencida` })
    }
    return Promise.resolve(false)
  })

  // ── 6) INVENTARIO: stock bajo / agotado ─────────────────────────────────
  const productos = await db.producto.findMany({ where: { activo: true, stock: { not: null } }, select: { id: true, nombre: true, stock: true, stockMinimo: true, userId: true } })
  enviadas += await procesarEnLotes(productos, 10, (p) => {
    if (p.stock === null) return Promise.resolve(false)
    if (p.stock === 0) {
      return notificar({ userId: p.userId, categoria: "inventario", prioridad: "alta", titulo: `${p.nombre} agotado`, mensaje: "Sin stock disponible.", accionUrl: "/dashboard/productos", claveUnica: `stock:${p.id}:agotado:${hoyStr}` })
    } else if (p.stockMinimo !== null && p.stock <= p.stockMinimo) {
      return notificar({ userId: p.userId, categoria: "inventario", prioridad: "media", titulo: `${p.nombre} con stock bajo`, mensaje: `Quedan ${p.stock} unidades.`, accionUrl: "/dashboard/productos", claveUnica: `stock:${p.id}:bajo:${hoyStr}` })
    }
    return Promise.resolve(false)
  })

  // ── 7) CLIENTES NELYX (solo admin) ──────────────────────────────────────
  const admin = await db.user.findFirst({ where: { rol: "ADMIN" } })
  if (admin) {
    const suscripciones = await db.suscripcionNelyx.findMany({ where: { estado: { notIn: ["cancelado"] } }, include: { user: { select: { nombre: true, negocio: true } } } })
    enviadas += await procesarEnLotes(suscripciones, 10, (s) => {
      const nombreCliente = s.user.negocio ?? s.user.nombre
      if (s.estado === "prueba_gratuita" && s.fechaFinPrueba) {
        const diff = diasEntreChile(ahora, s.fechaFinPrueba)
        if (diff >= 0 && diff <= 3) {
          return notificar({ userId: admin.id, categoria: "renovaciones", prioridad: "media", titulo: `${nombreCliente}: prueba termina en ${diff}d`, mensaje: "La prueba gratuita está por finalizar.", accionUrl: "/admin/clientes", claveUnica: `nelyx:${s.id}:pruebafin:${hoyStr}` })
        }
      } else if (s.estado === "proximo_vencer") {
        return notificar({ userId: admin.id, categoria: "renovaciones", prioridad: "media", titulo: `${nombreCliente}: suscripción vence pronto`, mensaje: "Se acerca la fecha de renovación.", accionUrl: "/admin/clientes", claveUnica: `nelyx:${s.id}:proximovencer:${hoyStr}` })
      } else if (s.estado === "pendiente" || s.estado === "vencido") {
        return notificar({ userId: admin.id, categoria: "renovaciones", prioridad: "alta", titulo: `${nombreCliente}: pago pendiente`, mensaje: "Tiene un cobro sin pagar.", accionUrl: "/admin/clientes", claveUnica: `nelyx:${s.id}:pagopendiente:${hoyStr}` })
      } else if (s.estado === "suspendido") {
        return notificar({ userId: admin.id, categoria: "renovaciones", prioridad: "baja", titulo: `${nombreCliente}: cuenta suspendida`, mensaje: "El cliente está suspendido.", accionUrl: "/admin/clientes", claveUnica: `nelyx:${s.id}:suspendido:${hoyStr}` })
      }
      return Promise.resolve(false)
    })
  }

  return NextResponse.json({ ok: true, revisadas: eventosHoy.length + tareasHoy.length + costosFijos.length + deudas.length + cuentas.length + productos.length, enviadas })
}
