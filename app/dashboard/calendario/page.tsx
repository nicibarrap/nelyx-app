import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { hoyEnChile } from "@/lib/timezone"
import { CalendarioClient } from "@/components/calendario/calendario-client"

export const metadata: Metadata = { title: "Calendario" }
export const dynamic = "force-dynamic"

export default async function CalendarioPage() {
  const session = await auth()
  const userId = session!.user.id
  const hoy = hoyEnChile()
  const anio = hoy.getFullYear()
  const inicioAnio = new Date(anio, 0, 1)
  const finAnio = new Date(anio + 1, 2, 1)

  const [
    costosFijos, deudas, cuentasPorCobrar, eventosCalendario, movimientos,
    deudasRecientes, pagosDeuda, pagosCuenta, generacionesRecientes, clientesRecientes, tareasCompletadasRecientes,
  ] = await Promise.all([
    db.costoFijoRecurrente.findMany({
      where: { userId, estado: "activo" },
      include: { generaciones: { where: { anio } } },
    }),
    db.deuda.findMany({ where: { userId, pagada: false }, orderBy: { fechaVence: "asc" } }),
    db.cuentaPorCobrar.findMany({
      where: { userId, estado: { in: ["pendiente","parcial","vencida"] }, fechaVence: { not: null } },
      include: { cliente: { select: { nombre: true, apellido: true } } },
      orderBy: { fechaVence: "asc" },
    }),
    db.eventoCalendario.findMany({
      where: { userId, fecha: { gte: inicioAnio, lt: finAnio } },
      orderBy: [{ fecha: "asc" }],
    }),
    db.movimiento.findMany({
      where: { userId, fecha: { gte: new Date(anio, Math.max(0, hoy.getMonth() - 1), 1) } },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 400,
    }),
    // ── Actividad reciente ──────────────────────────────────────────────
    db.deuda.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, acreedor: true, monto: true, createdAt: true } }),
    db.pagoDeuda.findMany({ where: { deuda: { userId } }, orderBy: { createdAt: "desc" }, take: 6, include: { deuda: { select: { acreedor: true } } } }),
    db.pagoCuenta.findMany({ where: { cuenta: { userId } }, orderBy: { createdAt: "desc" }, take: 6, include: { cuenta: { include: { cliente: { select: { nombre: true, apellido: true } } } } } }),
    db.generacionCosto.findMany({ where: { costoFijo: { userId }, pagado: true }, orderBy: { createdAt: "desc" }, take: 6, include: { costoFijo: { select: { nombre: true } } } }),
    db.cliente.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, nombre: true, apellido: true, createdAt: true } }),
    db.eventoCalendario.findMany({ where: { userId, tipo: "tarea", estado: "completada" }, orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, titulo: true, updatedAt: true } }),
  ])

  // Ventas (de movimientos, ya cargados arriba)
  const ventasRecientes = movimientos.filter(m => m.tipo === "VENTA").slice(0, 6)

  type Actividad = { id: string; icono: string; titulo: string; detalle: string; monto: number | null; fecha: string }
  const actividadReciente: Actividad[] = []

  for (const m of ventasRecientes) {
    actividadReciente.push({ id: `act-venta-${m.id}`, icono: "📈", titulo: "Venta registrada", detalle: m.descripcion ?? m.categoria ?? "Venta", monto: Number(m.monto), fecha: m.fecha.toISOString() })
  }
  for (const d of deudasRecientes) {
    actividadReciente.push({ id: `act-deuda-${d.id}`, icono: "🏦", titulo: "Deuda registrada", detalle: d.acreedor, monto: -Number(d.monto), fecha: d.createdAt.toISOString() })
  }
  for (const p of pagosDeuda) {
    actividadReciente.push({ id: `act-pagodeuda-${p.id}`, icono: "✅", titulo: "Deuda pagada", detalle: p.deuda.acreedor, monto: -Number(p.monto), fecha: p.createdAt.toISOString() })
  }
  for (const p of pagosCuenta) {
    const nombreCliente = `${p.cuenta.cliente.nombre} ${p.cuenta.cliente.apellido ?? ""}`.trim()
    actividadReciente.push({ id: `act-pagocuenta-${p.id}`, icono: "💰", titulo: "Cuenta por cobrar pagada", detalle: nombreCliente, monto: Number(p.monto), fecha: p.createdAt.toISOString() })
  }
  for (const g of generacionesRecientes) {
    actividadReciente.push({ id: `act-costofijo-${g.id}`, icono: "🏠", titulo: "Costo fijo generado", detalle: g.costoFijo.nombre, monto: null, fecha: g.createdAt.toISOString() })
  }
  for (const c of clientesRecientes) {
    actividadReciente.push({ id: `act-cliente-${c.id}`, icono: "👤", titulo: "Cliente registrado", detalle: `${c.nombre} ${c.apellido ?? ""}`.trim(), monto: null, fecha: c.createdAt.toISOString() })
  }
  for (const t of tareasCompletadasRecientes) {
    actividadReciente.push({ id: `act-tarea-${t.id}`, icono: "☑️", titulo: "Tarea completada", detalle: t.titulo, monto: null, fecha: t.updatedAt.toISOString() })
  }

  actividadReciente.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  const data = {
    hoy: hoy.toISOString(),
    costosFijos: costosFijos.map(c => ({
      id: c.id, nombre: c.nombre, monto: Number(c.monto),
      categoria: c.categoria,
      fechaInicio: c.fechaInicio.toISOString(),
      fechaTermino: c.fechaTermino?.toISOString() ?? null,
      generaciones: c.generaciones.map(g => ({ id: g.id, mes: g.mes, anio: g.anio, pagado: g.pagado })),
    })),
    deudas: deudas.map(d => ({
      id: d.id, acreedor: d.acreedor, monto: Number(d.monto),
      valorCuota: d.valorCuota ? Number(d.valorCuota) : null,
      fechaVence: d.fechaVence?.toISOString() ?? null,
      fechaPrimerPago: d.fechaPrimerPago?.toISOString() ?? null,
    })),
    cuentasPorCobrar: cuentasPorCobrar.map(cc => ({
      id: cc.id, numero: cc.numero,
      clienteNombre: `${cc.cliente.nombre} ${cc.cliente.apellido ?? ""}`.trim(),
      monto: Number(cc.montoOriginal), saldoPendiente: Number(cc.saldoPendiente),
      fechaVence: cc.fechaVence?.toISOString() ?? null, estado: cc.estado,
    })),
    eventosCalendario: eventosCalendario.map(e => ({
      id: e.id, titulo: e.titulo, descripcion: e.descripcion,
      fecha: e.fecha.toISOString(), tipo: e.tipo, estado: e.estado,
      prioridad: e.prioridad, horaLimite: (e as any).horaLimite ?? null,
    })),
    movimientos: movimientos.map(m => ({
      id: m.id, tipo: m.tipo, monto: Number(m.monto),
      fecha: m.fecha.toISOString(), descripcion: m.descripcion, categoria: m.categoria,
    })),
    actividadReciente,
  }

  return <CalendarioClient data={data} />
}
