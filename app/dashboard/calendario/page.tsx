import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { hoyEnChile } from "@/lib/timezone"
import { obtenerProyectosTarea, generarOcurrenciasPendientes } from "@/app/actions/acciones"
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

  // Extiende el horizonte materializado de tareas recurrentes antes de leer
  // eventosCalendario — mismo patrón perezoso que generarCostosDelMes.
  await generarOcurrenciasPendientes(userId)

  const [costosFijos, deudas, cuentasPorCobrar, eventosCalendario, proyectosTarea] = await Promise.all([
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
    obtenerProyectosTarea(),
  ])

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
      clienteNombre: cc.cliente ? `${cc.cliente.nombre} ${cc.cliente.apellido ?? ""}`.trim() : "Cliente eliminado",
      monto: Number(cc.montoOriginal), saldoPendiente: Number(cc.saldoPendiente),
      fechaVence: cc.fechaVence?.toISOString() ?? null, estado: cc.estado,
    })),
    eventosCalendario: eventosCalendario.map(e => ({
      id: e.id, titulo: e.titulo, descripcion: e.descripcion,
      fecha: e.fecha.toISOString(), tipo: e.tipo, estado: e.estado,
      prioridad: e.prioridad, horaLimite: (e as any).horaLimite ?? null,
      proyectoId: (e as any).proyectoId ?? null, serieId: (e as any).serieId ?? null,
    })),
    proyectosTarea: proyectosTarea.map(p => ({ id: p.id, nombre: p.nombre, color: p.color })),
  }

  return <CalendarioClient data={data} />
}
