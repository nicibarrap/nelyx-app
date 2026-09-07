import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { notificar } from "@/lib/notificaciones"
import { hoyEnChile, diasEntreChile } from "@/lib/timezone"

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

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

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
  for (const ev of eventosHoy) {
    if (!ev.horaLimite) continue
    const [hh, mm] = ev.horaLimite.split(":").map(Number)
    const fechaEvento = new Date(ev.fecha)
    fechaEvento.setHours(hh, mm, 0, 0)
    const minutosFaltan = Math.round((fechaEvento.getTime() - ahora.getTime()) / 60000)

    if (minutosFaltan <= 30 && minutosFaltan > 25) {
      if (await notificar({ userId: ev.userId, categoria: "calendario", prioridad: "media", titulo: `Faltan 30 minutos: ${ev.titulo}`, mensaje: "Tu evento está por comenzar.", accionUrl: "/dashboard/calendario", claveUnica: `evt:${ev.id}:30` })) enviadas++
    } else if (minutosFaltan <= 10 && minutosFaltan > 5) {
      if (await notificar({ userId: ev.userId, categoria: "calendario", prioridad: "alta", titulo: `Faltan 10 minutos: ${ev.titulo}`, mensaje: "Tu evento está por comenzar.", accionUrl: "/dashboard/calendario", claveUnica: `evt:${ev.id}:10` })) enviadas++
    } else if (minutosFaltan <= 0 && minutosFaltan > -5) {
      if (await notificar({ userId: ev.userId, categoria: "calendario", prioridad: "alta", titulo: `Comienza ahora: ${ev.titulo}`, mensaje: "Tu evento está comenzando.", accionUrl: "/dashboard/calendario", claveUnica: `evt:${ev.id}:start` })) enviadas++
    }
  }

  // ── 2) TAREAS pendientes que vencen hoy (sin hora específica) ──────────
  const tareasHoy = await db.eventoCalendario.findMany({
    where: { tipo: "tarea", estado: "pendiente", horaLimite: null, fecha: { gte: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()), lt: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1) } },
  })
  for (const t of tareasHoy) {
    if (await notificar({ userId: t.userId, categoria: "tareas", prioridad: "media", titulo: `Tarea de hoy: ${t.titulo}`, mensaje: "Recordatorio de tarea pendiente para hoy.", accionUrl: "/dashboard/calendario", claveUnica: `tarea:${t.id}:${hoyStr}` })) enviadas++
  }

  // ── 3) COSTOS FIJOS: 7/3/1/0 días antes + 2 días de atraso ─────────────
  const costosFijos = await db.costoFijoRecurrente.findMany({
    where: { estado: "activo" },
    include: { generaciones: { where: { mes: ahora.getMonth() + 1, anio: ahora.getFullYear() } } },
  })
  for (const cf of costosFijos) {
    const gen = cf.generaciones[0]
    if (gen?.pagado) continue
    const mesActual = ahora.getMonth() + 1, anioActual = ahora.getFullYear()
    const iMes = cf.fechaInicio.getMonth() + 1, iAnio = cf.fechaInicio.getFullYear()
    if (anioActual < iAnio || (anioActual === iAnio && mesActual < iMes)) continue
    if (cf.fechaTermino) {
      const tMes = cf.fechaTermino.getMonth() + 1, tAnio = cf.fechaTermino.getFullYear()
      if (anioActual > tAnio || (anioActual === tAnio && mesActual > tMes)) continue
    }
    const totalDiasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate()
    const diaVence = Math.min(cf.fechaInicio.getDate(), totalDiasMes)
    const fechaVence = new Date(ahora.getFullYear(), ahora.getMonth(), diaVence)
    const diff = diasEntreChile(ahora, fechaVence)

    if ([7, 3, 1, 0].includes(diff)) {
      const etiqueta = diff === 0 ? "hoy" : diff === 1 ? "mañana" : `en ${diff} días`
      if (await notificar({ userId: cf.userId, categoria: "costosFijos", prioridad: diff <= 1 ? "alta" : "media", titulo: `${cf.nombre} vence ${etiqueta}`, mensaje: "Costo fijo pendiente de registrar.", accionUrl: "/dashboard/costos-fijos", claveUnica: `cf:${cf.id}:${ahora.getFullYear()}-${ahora.getMonth()+1}:${diff}` })) enviadas++
    } else if (diff === -2) {
      if (await notificar({ userId: cf.userId, categoria: "costosFijos", prioridad: "alta", titulo: `${cf.nombre} sigue sin registrarse`, mensaje: "Han pasado 2 días desde el vencimiento.", accionUrl: "/dashboard/costos-fijos", claveUnica: `cf:${cf.id}:${ahora.getFullYear()}-${ahora.getMonth()+1}:atraso2` })) enviadas++
    }
  }

  // ── 4) DEUDAS: vence mañana / hoy ───────────────────────────────────────
  const deudas = await db.deuda.findMany({ where: { pagada: false, fechaVence: { not: null } } })
  for (const d of deudas) {
    if (!d.fechaVence) continue
    const diff = diasEntreChile(ahora, d.fechaVence)
    if (diff === 1 || diff === 0) {
      const etiqueta = diff === 0 ? "hoy" : "mañana"
      if (await notificar({ userId: d.userId, categoria: "deudas", prioridad: "alta", titulo: `${d.acreedor}: cuota vence ${etiqueta}`, mensaje: `Monto: ${Number(d.valorCuota ?? d.monto).toLocaleString("es-CL")}`, accionUrl: "/dashboard/deudas", claveUnica: `deuda:${d.id}:${diff===0?"hoy":"mañana"}:${hoyStr.slice(0,7)}` })) enviadas++
    }
  }

  // ── 5) CUENTAS POR COBRAR: vence mañana / venció ────────────────────────
  const cuentas = await db.cuentaPorCobrar.findMany({ where: { estado: { in: ["pendiente", "parcial", "vencida"] }, fechaVence: { not: null } }, include: { cliente: { select: { nombre: true, apellido: true } } } })
  for (const cc of cuentas) {
    if (!cc.fechaVence) continue
    const diff = diasEntreChile(ahora, cc.fechaVence)
    const nombreCliente = `${cc.cliente.nombre} ${cc.cliente.apellido ?? ""}`.trim()
    if (diff === 1) {
      if (await notificar({ userId: cc.userId, categoria: "cuentasCobrar", prioridad: "media", titulo: `Cobro a ${nombreCliente} vence mañana`, mensaje: `Saldo: ${Number(cc.saldoPendiente).toLocaleString("es-CL")}`, accionUrl: "/dashboard/cuentas-cobrar", claveUnica: `cxc:${cc.id}:mañana` })) enviadas++
    } else if (diff <= 0 && cc.estado === "vencida") {
      if (await notificar({ userId: cc.userId, categoria: "cuentasCobrar", prioridad: "alta", titulo: `Cobro a ${nombreCliente} venció`, mensaje: `Saldo pendiente: ${Number(cc.saldoPendiente).toLocaleString("es-CL")}`, accionUrl: "/dashboard/cuentas-cobrar", claveUnica: `cxc:${cc.id}:vencida` })) enviadas++
    }
  }

  // ── 6) INVENTARIO: stock bajo / agotado ─────────────────────────────────
  const productos = await db.producto.findMany({ where: { activo: true, stock: { not: null } }, select: { id: true, nombre: true, stock: true, stockMinimo: true, userId: true } })
  for (const p of productos) {
    if (p.stock === null) continue
    if (p.stock === 0) {
      if (await notificar({ userId: p.userId, categoria: "inventario", prioridad: "alta", titulo: `${p.nombre} agotado`, mensaje: "Sin stock disponible.", accionUrl: "/dashboard/productos", claveUnica: `stock:${p.id}:agotado:${hoyStr}` })) enviadas++
    } else if (p.stockMinimo !== null && p.stock <= p.stockMinimo) {
      if (await notificar({ userId: p.userId, categoria: "inventario", prioridad: "media", titulo: `${p.nombre} con stock bajo`, mensaje: `Quedan ${p.stock} unidades.`, accionUrl: "/dashboard/productos", claveUnica: `stock:${p.id}:bajo:${hoyStr}` })) enviadas++
    }
  }

  // ── 7) CLIENTES NELYX (solo admin) ──────────────────────────────────────
  const admin = await db.user.findFirst({ where: { rol: "ADMIN" } })
  if (admin) {
    const suscripciones = await db.suscripcionNelyx.findMany({ where: { estado: { notIn: ["cancelado"] } }, include: { user: { select: { nombre: true, negocio: true } } } })
    for (const s of suscripciones) {
      const nombreCliente = s.user.negocio ?? s.user.nombre
      if (s.estado === "prueba_gratuita" && s.fechaFinPrueba) {
        const diff = diasEntreChile(ahora, s.fechaFinPrueba)
        if (diff >= 0 && diff <= 3) {
          if (await notificar({ userId: admin.id, categoria: "renovaciones", prioridad: "media", titulo: `${nombreCliente}: prueba termina en ${diff}d`, mensaje: "La prueba gratuita está por finalizar.", accionUrl: "/admin/clientes", claveUnica: `nelyx:${s.id}:pruebafin:${hoyStr}` })) enviadas++
        }
      } else if (s.estado === "proximo_vencer") {
        if (await notificar({ userId: admin.id, categoria: "renovaciones", prioridad: "media", titulo: `${nombreCliente}: suscripción vence pronto`, mensaje: "Se acerca la fecha de renovación.", accionUrl: "/admin/clientes", claveUnica: `nelyx:${s.id}:proximovencer:${hoyStr}` })) enviadas++
      } else if (s.estado === "pendiente" || s.estado === "vencido") {
        if (await notificar({ userId: admin.id, categoria: "renovaciones", prioridad: "alta", titulo: `${nombreCliente}: pago pendiente`, mensaje: "Tiene un cobro sin pagar.", accionUrl: "/admin/clientes", claveUnica: `nelyx:${s.id}:pagopendiente:${hoyStr}` })) enviadas++
      } else if (s.estado === "suspendido") {
        if (await notificar({ userId: admin.id, categoria: "renovaciones", prioridad: "baja", titulo: `${nombreCliente}: cuenta suspendida`, mensaje: "El cliente está suspendido.", accionUrl: "/admin/clientes", claveUnica: `nelyx:${s.id}:suspendido:${hoyStr}` })) enviadas++
      }
    }
  }

  return NextResponse.json({ ok: true, revisadas: eventosHoy.length + tareasHoy.length + costosFijos.length + deudas.length + cuentas.length + productos.length, enviadas })
}
