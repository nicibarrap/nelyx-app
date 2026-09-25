import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { notificar } from "@/lib/notificaciones"
import { enviarPushAUsuario } from "@/lib/push"
import { hoyEnChile, diasEntreChile } from "@/lib/timezone"
import { diaOcurrenciaEnMes, esAplicableEnMes } from "@/lib/costos-fijos"
import { reemplazarVariables, calcularNivelSugerido, PLANTILLAS_DEFAULT } from "@/lib/cobranza"
import { enviarEmail } from "@/lib/email"
import { formatCLP } from "@/lib/utils"
import * as Sentry from "@sentry/nextjs"

/**
 * Registra un evento como "ya procesado" (mismo mecanismo de idempotencia
 * que notificar(), la restricción @unique de claveUnica) SIN pasar por el
 * filtro de preferencias de notificaciones push del dueño — a diferencia
 * de un aviso interno, esto decide si se le manda o no un correo a un
 * CLIENTE, así que no debe depender de si el dueño tiene apagadas las
 * notificaciones push de la categoría "clientes" en Configuración.
 */
async function marcarEnviadoACliente(params: { userId: string; titulo: string; mensaje: string; accionUrl: string; claveUnica: string }) {
  try {
    await db.notificacion.create({
      data: { userId: params.userId, categoria: "clientes", prioridad: "baja", titulo: params.titulo, mensaje: params.mensaje, accionUrl: params.accionUrl, claveUnica: params.claveUnica },
    })
  } catch (err: any) {
    if (err?.code === "P2002") return false // ya se había enviado — no reenviar
    throw err
  }
  await enviarPushAUsuario(params.userId, { titulo: params.titulo, mensaje: params.mensaje, url: params.accionUrl })
  return true
}

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
    // A nivel de día, no solo de mes/año — un costo que ya terminó antes de
    // su día de cobro dentro del mismo mes no debe seguir avisando.
    if (!esAplicableEnMes(cf.fechaInicio, cf.fechaTermino, mesActual, anioActual)) return false
    const diaVence = diaOcurrenciaEnMes(cf.fechaInicio, mesActual, anioActual)
    const fechaVence = new Date(anioActual, mesActual - 1, diaVence)
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
  const deudas = await db.deuda.findMany({
    where: { pagada: false, fechaVence: { not: null } },
    include: { proveedor: { select: { id: true, telefono: true } } },
  })
  enviadas += await procesarEnLotes(deudas, 10, (d) => {
    if (!d.fechaVence) return Promise.resolve(false)
    const diff = diasEntreChile(ahora, d.fechaVence)
    if (diff === 1 || diff === 0) {
      const etiqueta = diff === 0 ? "hoy" : "mañana"
      // Cuando la deuda está vinculada a un proveedor real (no solo el
      // texto libre "acreedor"), el aviso lleva directo a su ficha y
      // suma su teléfono — un clic para llegar a quién hay que pagarle,
      // no solo a la lista genérica de Deudas.
      const monto = `Monto: ${Number(d.valorCuota ?? d.monto).toLocaleString("es-CL")}`
      const mensaje = d.proveedor?.telefono ? `${monto} · 📱 ${d.proveedor.telefono}` : monto
      const accionUrl = d.proveedor ? `/dashboard/proveedores?id=${d.proveedor.id}` : "/dashboard/deudas"
      return notificar({ userId: d.userId, categoria: "deudas", prioridad: "alta", titulo: `${d.acreedor}: cuota vence ${etiqueta}`, mensaje, accionUrl, claveUnica: `deuda:${d.id}:${diff===0?"hoy":"mañana"}:${hoyStr.slice(0,7)}` })
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

  // ── 8) COBRANZA AUTOMÁTICA POR CORREO (solo dueños que lo activaron) ───
  const usuariosCobranzaAuto = await db.user.findMany({
    where: { recordatoriosCobranzaAutoActivo: true },
    select: { id: true, nombre: true, negocio: true },
  })
  let cuentasParaEmail: Awaited<ReturnType<typeof db.cuentaPorCobrar.findMany>> = []
  if (usuariosCobranzaAuto.length > 0) {
    const idsActivos = usuariosCobranzaAuto.map(u => u.id)
    const [cuentasRaw, plantillasTodas] = await Promise.all([
      db.cuentaPorCobrar.findMany({
        where: { userId: { in: idsActivos }, estado: { in: ["pendiente", "parcial", "vencida"] }, fechaVence: { not: null } },
        include: { cliente: { select: { nombre: true, apellido: true, email: true } } },
      }),
      db.plantillaCobranza.findMany({ where: { userId: { in: idsActivos } } }),
    ])
    cuentasParaEmail = cuentasRaw
    const mapaUsuarios = new Map(usuariosCobranzaAuto.map(u => [u.id, u]))
    const mapaPlantillas = new Map(plantillasTodas.map(p => [`${p.userId}:${p.nivel}`, p.mensaje]))

    enviadas += await procesarEnLotes(cuentasRaw, 10, async (cc) => {
      if (!cc.fechaVence || !cc.cliente?.email) return false
      // Mismo signo que ya usa la sección 5 de este cron: positivo = faltan
      // días para vencer, negativo = días de atraso.
      const diff = diasEntreChile(ahora, cc.fechaVence)
      // Puntos de contacto: un recordatorio amistoso antes del vencimiento,
      // luego al día siguiente de vencer y cada semana de atraso — nunca a
      // diario, para no bombardear al cliente.
      const trigger = diff === 2 ? "pre2" : diff === -1 ? "atraso1" : [-7, -14, -21, -30].includes(diff) ? `atraso${-diff}` : null
      if (!trigger) return false

      const usuario = mapaUsuarios.get(cc.userId)
      if (!usuario) return false
      const diasAtraso = Math.max(0, -diff)
      const nivel = calcularNivelSugerido(diasAtraso)
      const nombreCliente = `${cc.cliente.nombre} ${cc.cliente.apellido ?? ""}`.trim()
      const vars = {
        nombreCliente,
        montoPendiente: formatCLP(Number(cc.saldoPendiente)),
        fechaVenta: new Date(cc.fechaVenta).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
        fechaVencimiento: cc.fechaVence.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
        numeroDocumento: `Factura #${cc.numero}`,
        nombreNegocio: usuario.negocio || usuario.nombre,
        usuarioEnvia: usuario.nombre,
        diasAtraso: String(diasAtraso),
      }
      const plantilla = mapaPlantillas.get(`${cc.userId}:${nivel}`) ?? PLANTILLAS_DEFAULT[nivel]
      const mensaje = reemplazarVariables(plantilla, vars)

      const yaEnviado = !(await marcarEnviadoACliente({
        userId: cc.userId,
        titulo: `Recordatorio automático enviado a ${nombreCliente}`,
        mensaje: `Correo de cobranza (Nivel ${nivel}) por ${vars.montoPendiente}.`,
        accionUrl: "/dashboard/cuentas-cobrar",
        claveUnica: `cobranza-auto:${cc.id}:${trigger}`,
      }))
      if (yaEnviado) return false

      const enviado = await enviarEmail({ to: cc.cliente.email, subject: `${vars.numeroDocumento} — Saldo pendiente ${vars.montoPendiente}`, text: mensaje })
      if (enviado) {
        await db.contactoCobranza.create({ data: { cuentaId: cc.id, clienteId: cc.clienteId, userId: cc.userId, canal: "email", nivel, mensaje } }).catch(() => {})
      }
      return enviado
    })
  }

  // ── 9) CUMPLEAÑOS DE CLIENTES (solo dueños que lo activaron) ────────────
  const usuariosCumpleanosAuto = await db.user.findMany({
    where: { recordatoriosCumpleanosAutoActivo: true },
    select: { id: true, nombre: true, negocio: true },
  })
  let clientesCumpleanos: Awaited<ReturnType<typeof db.cliente.findMany>> = []
  if (usuariosCumpleanosAuto.length > 0) {
    const mapaUsuariosCumple = new Map(usuariosCumpleanosAuto.map(u => [u.id, u]))
    clientesCumpleanos = await db.cliente.findMany({
      where: { userId: { in: usuariosCumpleanosAuto.map(u => u.id) }, activo: true, email: { not: null }, cumpleanos: { not: null } },
    })
    enviadas += await procesarEnLotes(clientesCumpleanos, 10, async (cl) => {
      if (!cl.cumpleanos || !cl.email) return false
      // Igual que fechaVence en Cuentas por Cobrar: la fecha se guarda como
      // "medianoche UTC de ese día", y ahora (hoyEnChile) ya representa el
      // calendario correcto de Chile — comparar mes/día directo funciona
      // porque el servidor corre en UTC en producción.
      if (cl.cumpleanos.getMonth() !== ahora.getMonth() || cl.cumpleanos.getDate() !== ahora.getDate()) return false

      const usuario = mapaUsuariosCumple.get(cl.userId)
      if (!usuario) return false
      const nombreCliente = `${cl.nombre} ${cl.apellido ?? ""}`.trim()
      const nombreNegocio = usuario.negocio || usuario.nombre
      const mensaje = `Hola ${nombreCliente}.\n\n¡Feliz cumpleaños! Todo el equipo de ${nombreNegocio} te desea un excelente día.\n\nGracias por confiar en nosotros.\n${nombreNegocio}`

      const yaEnviado = !(await marcarEnviadoACliente({
        userId: cl.userId,
        titulo: `🎂 Saludo de cumpleaños enviado a ${nombreCliente}`,
        mensaje: "Se envió un correo automático de cumpleaños.",
        accionUrl: "/dashboard/clientes",
        claveUnica: `cumple-auto:${cl.id}:${ahora.getFullYear()}`,
      }))
      if (yaEnviado) return false

      return enviarEmail({ to: cl.email, subject: `🎉 ¡Feliz cumpleaños de parte de ${nombreNegocio}!`, text: mensaje })
    })
  }

  return NextResponse.json({
    ok: true,
    revisadas: eventosHoy.length + tareasHoy.length + costosFijos.length + deudas.length + cuentas.length + productos.length + cuentasParaEmail.length + clientesCumpleanos.length,
    enviadas,
  })
}
