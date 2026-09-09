import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { calcularEstadoDeuda, formatCLP, formatFechaCorta, ESTADO_CONFIG } from "@/lib/utils"
import { obtenerLotesPorVencer } from "@/app/actions/kardex-acciones"
import { FilaLotePorVencer } from "@/components/productos/fila-lote-por-vencer"
import Link from "next/link"

export const metadata: Metadata = { title: "Alertas" }

export default async function AlertasPage() {
  const session = await auth()
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

  const en7Dias = new Date(hoy.getTime() + 7 * 86400000)
  const mananaDate = new Date(hoy.getTime() + 86400000)
  const mesActual = hoy.getMonth() + 1
  const anioActual = hoy.getFullYear()
  const diaActual = hoy.getDate()

  const [deudas, productosRaw, movsMes, cuentasVencidas, cuentasProximas, costosFijos, lotesPorVencer] = await Promise.all([
    db.deuda.findMany({ where: { userId: session!.user.id, pagada: false }, orderBy: { fechaVence: "asc" } }),
    db.producto.findMany({ where: { userId: session!.user.id, activo: true, stock: { not: null } }, select: { id: true, nombre: true, stock: true, stockMinimo: true } }),
    db.movimiento.findMany({
      where: { userId: session!.user.id, tipo: "VENTA", productoId: { not: null }, fecha: { gte: inicioMes } },
      select: { productoId: true, monto: true, producto: { select: { nombre: true } } }
    }),
    db.cuentaPorCobrar.findMany({
      where: { userId: session!.user.id, estado: "vencida", saldoPendiente: { gt: 0 } },
      include: { cliente: { select: { nombre: true, apellido: true } } },
      take: 5, orderBy: { fechaVence: "asc" }
    }),
    db.cuentaPorCobrar.findMany({
      where: { userId: session!.user.id, estado: { in: ["pendiente","parcial"] }, fechaVence: { gte: hoy, lte: en7Dias } },
      include: { cliente: { select: { nombre: true, apellido: true } } },
      take: 5, orderBy: { fechaVence: "asc" }
    }),
    db.costoFijoRecurrente.findMany({
      where: { userId: session!.user.id, estado: "activo" },
      include: { generaciones: { where: { mes: mesActual, anio: anioActual } } }
    }),
    obtenerLotesPorVencer(session!.user.id),
  ])

  // Alertas de costos fijos (computadas, sin tabla dedicada)
  function costoAplicableEsteMes(fechaInicio: Date, fechaTermino: Date | null) {
    const iMes = fechaInicio.getMonth() + 1, iAnio = fechaInicio.getFullYear()
    if (anioActual < iAnio || (anioActual === iAnio && mesActual < iMes)) return false
    if (fechaTermino) {
      const tMes = fechaTermino.getMonth() + 1, tAnio = fechaTermino.getFullYear()
      if (anioActual > tAnio || (anioActual === tAnio && mesActual > tMes)) return false
    }
    return true
  }
  const costosGeneraMañana = costosFijos.filter(c => costoAplicableEsteMes(c.fechaInicio, c.fechaTermino) && c.generaciones.length === 0 && c.fechaInicio.getDate() === mananaDate.getDate())
  const costosPendientesAtrasados = costosFijos.filter(c => costoAplicableEsteMes(c.fechaInicio, c.fechaTermino) && c.generaciones.length === 0 && c.fechaInicio.getDate() <= diaActual)
  const costosGeneradosSinPagar = costosFijos.filter(c => c.generaciones.length > 0 && !c.generaciones[0].pagado)
  const costosPagadosRecientes = costosFijos.filter(c => c.generaciones.length > 0 && c.generaciones[0].pagado && c.generaciones[0].fechaPagado && (hoy.getTime() - new Date(c.generaciones[0].fechaPagado).getTime()) < 3 * 86400000)

  // Alertas deudas
  const deudasConEstado = deudas.map(d => ({ ...d, estado: calcularEstadoDeuda(d) }))
  const vencidas = deudasConEstado.filter(d => d.estado === "Vencida")
  const proximas = deudasConEstado.filter(d => d.estado === "Próxima a vencer")
  const alDia = deudasConEstado.filter(d => d.estado === "Al día" || d.estado === "Parcialmente pagada")

  // Alertas inventario
  const agotados = productosRaw.filter(p => p.stock === 0)
  const stockBajo = productosRaw.filter(p => p.stock! > 0 && p.stockMinimo !== null && p.stock! <= p.stockMinimo)
  const lotesConDias = lotesPorVencer.map(l => ({
    ...l,
    diasRestantes: Math.ceil((new Date(l.fechaVencimiento).getTime() - hoy.getTime()) / 86400000),
  }))

  // Top vendidos este mes
  const ventasProd: Record<string, { nombre: string; count: number }> = {}
  for (const mv of movsMes) {
    const id = mv.productoId!
    if (!ventasProd[id]) ventasProd[id] = { nombre: mv.producto?.nombre ?? "—", count: 0 }
    ventasProd[id].count += 1
  }
  const topProductos = Object.values(ventasProd).sort((a, b) => b.count - a.count).slice(0, 5)

  const totalAlertas = vencidas.length + proximas.length + agotados.length + stockBajo.length + costosGeneraMañana.length + costosPendientesAtrasados.length + costosGeneradosSinPagar.length + lotesConDias.length

  const alertasDeuda = [
    ...vencidas.map(d => ({ id: d.id, tipo: "error" as const, titulo: `Deuda vencida: ${d.acreedor}`, desc: `Venció el ${d.fechaVence ? formatFechaCorta(d.fechaVence) : "—"}`, monto: Number(d.monto)-Number(d.montoPagado) })),
    ...proximas.map(d => {
      const dias = d.fechaVence ? Math.ceil((new Date(d.fechaVence).getTime()-hoy.getTime())/86400000) : null
      return { id: d.id, tipo: "warning" as const, titulo: `Pago próximo: ${d.acreedor}`, desc: dias !== null ? `Vence en ${dias} día${dias!==1?"s":""}` : "Próxima a vencer", monto: Number(d.monto)-Number(d.montoPagado) }
    }),
    ...alDia.map(d => ({ id: d.id, tipo: "info" as const, titulo: `Deuda al día: ${d.acreedor}`, desc: d.fechaVence ? `Vence el ${formatFechaCorta(d.fechaVence)}` : "Sin fecha", monto: Number(d.monto)-Number(d.montoPagado) })),
  ]

  const iconoTipo = { error: "🔴", warning: "🟠", info: "🔵" }
  const colorTipo = { error: "bg-red-500/5 border-red-500/20 text-red-400", warning: "bg-orange-500/5 border-orange-500/20 text-orange-400", info: "bg-sky-500/5 border-sky-500/20 text-sky-400" }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Alertas</h1>
          <p className="text-xs text-[var(--c-text3)] mt-0.5">Notificaciones importantes de tu negocio</p>
        </div>
        {totalAlertas > 0 && (
          <span className="h-8 px-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse-soft" />
            {totalAlertas} activas
          </span>
        )}
      </div>

      {/* Resumen cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Deudas vencidas",        val: vencidas.length + cuentasVencidas.length, color: "text-red-400",    bg: "border-red-500/20",   icon: "🔴" },
          { label: "Próximos pagos (7 días)", val: proximas.length + cuentasProximas.length, color: "text-[var(--c-warning)]",  bg: "border-amber-500/20", icon: "🟠" },
          { label: "Sin stock",               val: agotados.length,  color: "text-red-400",    bg: "border-red-500/20",   icon: "📦" },
          { label: "Stock bajo",              val: stockBajo.length, color: "text-[var(--c-warning)]",  bg: "border-amber-500/20", icon: "⚠️" },
          { label: "Por vencer",              val: lotesConDias.length, color: "text-[var(--c-warning)]", bg: "border-amber-500/20", icon: "🗓️" },
          { label: "Costos fijos pendientes", val: costosPendientesAtrasados.length + costosGeneraMañana.length, color: "text-[var(--c-warning)]", bg: "border-amber-500/20", icon: "🏠" },
        ].map(c => (
          <div key={c.label} className={`bg-[var(--c-card)] border ${c.bg} rounded-2xl p-4 text-center`}>
            <p className="text-xl mb-1">{c.icon}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.val}</p>
            <p className="text-[10px] text-[var(--c-text3)] mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Alertas inventario */}
        {(agotados.length > 0 || stockBajo.length > 0) && (
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">⚠️ Alertas de inventario</h3>
              <Link href="/dashboard/productos" className="text-xs text-sky-400 hover:text-sky-300">Ver todos →</Link>
            </div>
            <div className="divide-y divide-[var(--c-border2)]">
              {agotados.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-sm flex-shrink-0">📦</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{p.nombre}</p>
                    <p className="text-xs text-[var(--c-text3)]">Sin stock disponible</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold flex-shrink-0">Agotado</span>
                </div>
              ))}
              {stockBajo.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-sm flex-shrink-0">⚠️</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{p.nombre}</p>
                    <p className="text-xs text-[var(--c-text3)]">{p.stock} unidades (mínimo {p.stockMinimo})</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-[var(--c-warning)] border border-amber-500/20 font-semibold flex-shrink-0">Stock bajo</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Productos por vencer */}
        {lotesConDias.length > 0 && (
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">🗓️ Productos por vencer</h3>
              <span className="text-[10px] text-[var(--c-text4)]">Del más urgente al menos urgente</span>
            </div>
            <div className="divide-y divide-[var(--c-border2)]">
              {lotesConDias.map(l => (
                <FilaLotePorVencer key={l.id} movimientoStockId={l.id} productoNombre={l.productoNombre} cantidad={l.cantidad} fechaVencimiento={l.fechaVencimiento} diasRestantes={l.diasRestantes} />
              ))}
            </div>
          </div>
        )}

        {/* Alertas costos fijos */}
        {(costosGeneraMañana.length > 0 || costosPendientesAtrasados.length > 0 || costosGeneradosSinPagar.length > 0 || costosPagadosRecientes.length > 0) && (
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">🏠 Alertas de costos fijos</h3>
              <Link href="/dashboard/costos-fijos" className="text-xs text-sky-400 hover:text-sky-300">Ver todos →</Link>
            </div>
            <div className="divide-y divide-[var(--c-border2)]">
              {costosGeneraMañana.map(c => (
                <div key={`manana-${c.id}`} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sm flex-shrink-0">📅</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{c.nombre}</p>
                    <p className="text-xs text-[var(--c-text3)]">Se genera mañana</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold flex-shrink-0">Mañana</span>
                </div>
              ))}
              {costosPendientesAtrasados.map(c => (
                <div key={`pendiente-${c.id}`} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-sm flex-shrink-0">⏳</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{c.nombre}</p>
                    <p className="text-xs text-[var(--c-text3)]">Pendiente de generar — día {c.fechaInicio.getDate()}</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-[var(--c-warning)] border border-amber-500/20 font-semibold flex-shrink-0">Pendiente</span>
                </div>
              ))}
              {costosGeneradosSinPagar.map(c => (
                <div key={`generado-${c.id}`} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sm flex-shrink-0">🧾</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{c.nombre}</p>
                    <p className="text-xs text-[var(--c-text3)]">Generado, falta confirmar pago</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold flex-shrink-0">Generado</span>
                </div>
              ))}
              {costosPagadosRecientes.map(c => (
                <div key={`pagado-${c.id}`} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-sm flex-shrink-0">✅</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{c.nombre}</p>
                    <p className="text-xs text-[var(--c-text3)]">Pago confirmado recientemente</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex-shrink-0">Pagado</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Más vendidos */}
        {topProductos.length > 0 && (
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">🏆 Más vendidos (este mes)</h3>
              <Link href="/dashboard/productos" className="text-xs text-sky-400 hover:text-sky-300">Ver todos →</Link>
            </div>
            <div className="p-5 space-y-3">
              {topProductos.map((p, i) => (
                <div key={p.nombre} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-5 text-center ${i===0?"text-[var(--c-warning)]":i===1?"text-slate-300":i===2?"text-amber-700":"text-[var(--c-text4)]"}`}>{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--c-text)] font-medium truncate">{p.nombre}</p>
                    <div className="h-1.5 bg-[var(--c-card2)] rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full" style={{ width: `${Math.max(15,(p.count/topProductos[0].count)*100)}%` }} />
                    </div>
                  </div>
                  <span className="text-[11px] text-[var(--c-text3)] flex-shrink-0">{p.count} ventas</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deudas */}
        {alertasDeuda.length > 0 && (
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">💳 Alertas de deudas</h3>
              <Link href="/dashboard/deudas" className="text-xs text-sky-400 hover:text-sky-300">Ver todas →</Link>
            </div>
            <div className="space-y-3 p-5">
              {alertasDeuda.map((a) => (
                <div key={`${a.tipo}-${a.id}`} className={`border rounded-xl p-3.5 ${colorTipo[a.tipo]}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">{iconoTipo[a.tipo]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--c-text)]">{a.titulo}</p>
                      <p className="text-xs mt-0.5 opacity-80">{a.desc}</p>
                      <p className="text-xs font-bold text-[var(--c-text)] mt-1">{formatCLP(a.monto)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sin alertas */}
        {totalAlertas === 0 && topProductos.length === 0 && (
          <div className="lg:col-span-2 bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-12 text-center">
            <span className="text-4xl block mb-3">✅</span>
            <p className="text-sm font-semibold text-[var(--c-text)]">Todo en orden</p>
            <p className="text-xs text-[var(--c-text3)] mt-1">No tienes alertas pendientes</p>
          </div>
        )}
      </div>
    </div>
  )
}
