import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generarCostosDelMes } from "@/app/actions/acciones"
import { calcularMetricas, prepararGrafico, calcularVariacionPct, formatCLP } from "@/lib/utils"
import { hoyEnChile } from "@/lib/timezone"
import { getColorCategoria } from "@/lib/categorias"
import { getEmojiProducto } from "@/lib/emojis"
import { FiltroPeriodo } from "@/components/shared/filtro-periodo"
import { GraficoMensual } from "@/components/dashboard/grafico-mensual"
import Link from "next/link"

export const metadata: Metadata = { title: "Resumen" }
const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

export default async function ResumenPage({ searchParams }: { searchParams: { mes?: string; anio?: string } }) {
  const session = await auth()
  const hoy = hoyEnChile()
  const mes = parseInt(searchParams.mes ?? String(hoy.getMonth() + 1))
  const anio = parseInt(searchParams.anio ?? String(hoy.getFullYear()))
  const esMesActual = mes === hoy.getMonth() + 1 && anio === hoy.getFullYear()

  const mesAnt = mes === 1 ? 12 : mes - 1
  const anioAnt = mes === 1 ? anio - 1 : anio

  // Auto-generar costos fijos recurrentes del mes
  await generarCostosDelMes(session!.user.id, mes, anio)

  const [
    movimientos, deudas, todosMovimientos, costosFijosRecurrentes, cuentasPorCobrar,
    movimientosMesAnterior, cxcVencidasCount, cxcCreadasHoyCount, productosAlerta,
  ] = await Promise.all([
    db.movimiento.findMany({
      where: { userId: session!.user.id, fecha: { gte: new Date(anio,mes-1,1), lt: new Date(anio,mes,1) } },
      include: { producto: { select: { nombre: true } }, cliente: { select: { nombre: true, apellido: true } } },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }]
    }),
    db.deuda.findMany({ where: { userId: session!.user.id, pagada: false }, orderBy: { fechaVence: "asc" } }),
    Promise.all([
      db.movimiento.aggregate({ where: { userId: session!.user.id, tipo: { in: ["VENTA","INGRESO_EXTRA"] } }, _sum: { monto: true } }),
      db.movimiento.aggregate({ where: { userId: session!.user.id, tipo: { in: ["GASTO","COSTO_FIJO","RETIRO"] } }, _sum: { monto: true } })
    ]),
    db.costoFijoRecurrente.findMany({ where: { userId: session!.user.id, estado: 'activo' }, select: { id: true, nombre: true, monto: true, fechaInicio: true, fechaTermino: true } }),
    db.cuentaPorCobrar.aggregate({ where: { userId: session!.user.id, estado: { in: ["pendiente","parcial","vencida"] } }, _sum: { saldoPendiente: true }, _count: true }),
    // Mes anterior — solo los campos necesarios para las comparaciones (liviano, sin traer filas completas)
    db.movimiento.findMany({
      where: { userId: session!.user.id, fecha: { gte: new Date(anioAnt,mesAnt-1,1), lt: new Date(anioAnt,mesAnt,1) } },
      select: { tipo: true, monto: true, utilidad: true },
    }),
    db.cuentaPorCobrar.count({ where: { userId: session!.user.id, estado: "vencida" } }),
    db.cuentaPorCobrar.count({ where: { userId: session!.user.id, createdAt: { gte: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) } } }),
    db.producto.findMany({
      where: { userId: session!.user.id, activo: true, stock: { not: null } },
      select: { id: true, nombre: true, stock: true, stockMinimo: true },
    }),
  ])

  const [ingresosAgg, egresosAgg] = todosMovimientos as any
  const disponible = Number(ingresosAgg._sum.monto ?? 0) - Number(egresosAgg._sum.monto ?? 0)
  const costosFijosAplicables = costosFijosRecurrentes.filter(c => {
    const iMes = c.fechaInicio.getMonth() + 1, iAnio = c.fechaInicio.getFullYear()
    if (anio < iAnio || (anio === iAnio && mes < iMes)) return false
    if (c.fechaTermino) {
      const tMes = c.fechaTermino.getMonth() + 1, tAnio = c.fechaTermino.getFullYear()
      if (anio > tAnio || (anio === tAnio && mes > tMes)) return false
    }
    return true
  })
  const totalCostosFijos = costosFijosAplicables.reduce((a, c) => a + Number(c.monto), 0)

  // Próximo costo fijo a generarse este mes — para que el KPI no solo diga
  // "cuántos activos hay", sino también "cuándo viene el próximo".
  const diasDelMesActual = new Date(anio, mes, 0).getDate()
  const proximoCostoFijo = costosFijosAplicables
    .map(c => ({ nombre: c.nombre, monto: Number(c.monto), dia: Math.min(c.fechaInicio.getDate(), diasDelMesActual) }))
    .filter(c => c.dia >= hoy.getDate())
    .sort((a, b) => a.dia - b.dia)[0] ?? null

  const totalPorCobrar = Number(cuentasPorCobrar._sum.saldoPendiente ?? 0)
  const countPorCobrar = cuentasPorCobrar._count
  const totalPendiente = deudas.reduce((a,d) => a+Number(d.monto)-Number(d.montoPagado), 0)
  const m = calcularMetricas(movimientos, totalPendiente)

  // ── Comparación vs mes anterior (Financial Engine — misma lógica, sin duplicar) ──
  const ingresosAnt = movimientosMesAnterior.filter(mv => ["VENTA","INGRESO_EXTRA"].includes(mv.tipo)).reduce((a,mv) => a+Number(mv.monto), 0)
  const gastosAnt = movimientosMesAnterior.filter(mv => ["GASTO","COSTO_FIJO","RETIRO"].includes(mv.tipo)).reduce((a,mv) => a+Number(mv.monto), 0)
  const ventasAntCount = movimientosMesAnterior.filter(mv => mv.tipo === "VENTA").length
  const utilidadNetaAnt = ingresosAnt - gastosAnt
  const ventasConSnapshotAnt = movimientosMesAnterior.filter(mv => mv.tipo === "VENTA" && mv.utilidad != null)
  const utilidadBrutaAnt = ventasConSnapshotAnt.reduce((a,mv) => a+Number(mv.utilidad), 0)

  const pctIngresos = calcularVariacionPct(m.totalIngresos, ingresosAnt)
  const pctVentas = calcularVariacionPct(m.cantidadVentas, ventasAntCount)
  const pctUtilidadNeta = calcularVariacionPct(m.utilidadNeta, utilidadNetaAnt)

  // Disponible (acumulado histórico) — Hoy
  const hoyMovs = movimientos.filter(mv => new Date(mv.fecha).toDateString() === hoy.toDateString())
  const ventasHoy = hoyMovs.filter(mv => mv.tipo === "VENTA").reduce((a,mv) => a+Number(mv.monto), 0)
  const gastosHoy = hoyMovs.filter(mv => ["GASTO","COSTO_FIJO"].includes(mv.tipo)).reduce((a,mv) => a+Number(mv.monto), 0)
  const cobrosHoy = hoyMovs.filter(mv => mv.tipo === "INGRESO_EXTRA" && mv.categoria === "Cobros").reduce((a,mv) => a+Number(mv.monto), 0)
  const ventasHoyCount = hoyMovs.filter(mv => mv.tipo === "VENTA").length

  // Gastos por categoría — Top 5
  const gastosPorCat: Record<string, number> = {}
  movimientos.filter(mv => mv.tipo === "GASTO" || mv.tipo === "COSTO_FIJO").forEach(mv => {
    const cat = mv.categoria || "Sin categoría"
    gastosPorCat[cat] = (gastosPorCat[cat] || 0) + Number(mv.monto)
  })
  const topGastos = Object.entries(gastosPorCat).sort((a,b) => b[1]-a[1]).slice(0,5)

  // Productos más vendidos — Top 5, con utilidad/margen reales (Financial Engine)
  const conteoProductos: Record<string, { nombre: string; count: number; total: number; utilidad: number; conUtilidad: boolean }> = {}
  movimientos.filter(mv => mv.tipo === "VENTA" && mv.producto).forEach(mv => {
    const id = mv.productoId!
    if (!conteoProductos[id]) conteoProductos[id] = { nombre: mv.producto!.nombre, count: 0, total: 0, utilidad: 0, conUtilidad: false }
    conteoProductos[id].count++
    conteoProductos[id].total += Number(mv.monto)
    if (mv.utilidad != null) { conteoProductos[id].utilidad += Number(mv.utilidad); conteoProductos[id].conUtilidad = true }
  })
  const topProductos = Object.values(conteoProductos).sort((a,b) => b.count-a.count).slice(0,5)
  const totalVentasProductos = Object.values(conteoProductos).reduce((a,p) => a+p.total, 0)

  // Deudas próximas (7 días)
  const deudasProximas = deudas.filter(d => {
    if (!d.fechaVence) return false
    const diff = new Date(d.fechaVence).getTime() - hoy.getTime()
    return diff <= 7 * 24 * 60 * 60 * 1000 && diff > 0
  })

  // Alertas de inventario (para el widget) — mismos datos que usa el módulo Alertas
  const productosAgotados = productosAlerta.filter(p => p.stock === 0)
  const productosStockBajo = productosAlerta.filter(p => p.stock! > 0 && p.stockMinimo !== null && p.stock! <= p.stockMinimo)
  const totalAlertasPendientes = deudasProximas.length + cxcVencidasCount + productosAgotados.length + productosStockBajo.length

  // Utilidad Bruta real (Financial Engine) — a partir del snapshot de costo
  // guardado en cada venta, no de un cálculo aproximado con ingresos-gastos.
  const ventasConSnapshot = movimientos.filter(mv => mv.tipo === "VENTA" && mv.utilidad != null)
  const utilidadBrutaMes = ventasConSnapshot.reduce((a, mv) => a + Number(mv.utilidad), 0)
  const ingresosConSnapshot = ventasConSnapshot.reduce((a, mv) => a + Number(mv.monto), 0)
  const margenPromedioMes = ingresosConSnapshot > 0 ? Math.round((utilidadBrutaMes / ingresosConSnapshot) * 100) : null
  const margenNetoMes = m.totalIngresos > 0 ? Math.round((m.utilidadNeta / m.totalIngresos) * 100) : null
  const pctUtilidadBruta = ventasConSnapshotAnt.length > 0 ? calcularVariacionPct(utilidadBrutaMes, utilidadBrutaAnt) : null

  // Gráfico + Flujo acumulado (misma serie de datos, sin recalcular dos veces)
  const datosGrafico = prepararGrafico(movimientos, anio, mes)

  const diasParaPromedio = esMesActual ? hoy.getDate() : new Date(anio, mes, 0).getDate()
  const ventasPorDia = diasParaPromedio > 0 ? m.cantidadVentas / diasParaPromedio : 0

  // Liquidez proyectada: cuántos días te dura el disponible actual al ritmo
  // de gasto de este mes — mismo cálculo que tenía el módulo Flujo de Caja
  // (ya retirado), reutilizando datos que Resumen ya calcula.
  const diasTranscurridosMes = hoy.getDate()
  const tasaDiariaGastos = diasTranscurridosMes > 0 ? m.totalGastos / diasTranscurridosMes : 0
  const liquidezDias = tasaDiariaGastos > 0 ? Math.min(90, Math.round(disponible / tasaDiariaGastos)) : 90

  const cards = [
    { label: "Ingresos", valor: formatCLP(m.totalIngresos), sub: `${m.cantidadVentas} ventas`,
      tip: "Todo el dinero que entró este mes por ventas y otros ingresos. Fórmula: Ventas + Ingresos extra.",
      icon: "↑", color: "text-emerald-400", bg: "bg-emerald-500/12", border: "border-emerald-500/30", iconBg: "bg-emerald-500/30 text-emerald-400",
      variacion: pctIngresos },
    { label: "Ventas", valor: String(m.cantidadVentas), sub: `${ventasPorDia.toLocaleString("es-CL",{maximumFractionDigits:1})} por día`,
      tip: "La cantidad de ventas que registraste este mes — no es el monto, es el número de transacciones.",
      icon: "◈", color: "text-violet-400", bg: "bg-violet-500/12", border: "border-violet-500/30", iconBg: "bg-violet-500/30 text-violet-400",
      variacion: pctVentas },
    { label: "Utilidad bruta", valor: formatCLP(utilidadBrutaMes), sub: margenPromedioMes !== null ? `${margenPromedioMes}% de margen` : "Sin datos de costo",
      tip: "Lo que te queda de las ventas después de descontar solo el costo de los productos vendidos — sin restar gastos ni costos fijos todavía. Fórmula: Ingresos − Costo de los productos vendidos.",
      icon: "%", color: utilidadBrutaMes >= 0 ? "text-[var(--c-warning)]" : "text-red-400",
      bg: "bg-amber-500/12", border: "border-amber-500/30", iconBg: "bg-amber-500/30 text-[var(--c-warning)]",
      variacion: pctUtilidadBruta },
    { label: "Utilidad neta", valor: formatCLP(Math.abs(m.utilidadNeta)), sub: margenNetoMes !== null ? `${margenNetoMes}% de margen` : (m.utilidadNeta >= 0 ? "Ganancia" : "Pérdida"),
      tip: "Lo que realmente ganaste este mes, descontando todo: costo de los productos, gastos y costos fijos. Fórmula: Ingresos − Costo de productos − Gastos − Costos fijos.",
      icon: m.utilidadNeta >= 0 ? "↗" : "↘", color: m.utilidadNeta >= 0 ? "text-sky-400" : "text-red-400",
      bg: m.utilidadNeta >= 0 ? "bg-sky-500/12" : "bg-red-500/12", border: m.utilidadNeta >= 0 ? "border-sky-500/30" : "border-red-500/30",
      iconBg: m.utilidadNeta >= 0 ? "bg-sky-500/30 text-sky-400" : "bg-red-500/30 text-red-400",
      variacion: pctUtilidadNeta },
    { label: "Disponible", valor: formatCLP(disponible), sub: "Actualizado ahora",
      tip: "Tu saldo acumulado de siempre, no solo de este mes — todo lo que ha entrado menos todo lo que ha salido desde que empezaste a usar NELYX. Fórmula: Ingresos históricos totales − Egresos históricos totales.",
      icon: "◉", color: disponible >= 0 ? "text-emerald-400" : "text-red-400",
      bg: disponible >= 0 ? "bg-emerald-500/12" : "bg-red-500/12", border: disponible >= 0 ? "border-emerald-500/30" : "border-red-500/30",
      iconBg: disponible >= 0 ? "bg-emerald-500/30 text-emerald-400" : "bg-red-500/30 text-red-400",
      variacion: null },
    { label: "Por cobrar", valor: formatCLP(totalPorCobrar), sub: `${countPorCobrar} cuenta${countPorCobrar===1?"":"s"} pendiente${countPorCobrar===1?"":"s"}`,
      tip: "Plata que ya vendiste pero que tus clientes todavía no te pagan — ventas a crédito pendientes de cobro.",
      icon: "📋", color: totalPorCobrar > 0 ? "text-[var(--c-warning)]" : "text-emerald-400", bg: "bg-amber-500/12", border: "border-amber-500/30", iconBg: "bg-amber-500/30 text-[var(--c-warning)]",
      variacion: null },
    { label: "Costos fijos", valor: formatCLP(totalCostosFijos),
      sub: proximoCostoFijo ? `Próximo: ${proximoCostoFijo.nombre} (día ${proximoCostoFijo.dia})` : `${costosFijosAplicables.length} activo${costosFijosAplicables.length===1?"":"s"}`,
      tip: "Los gastos que se repiten todos los meses (arriendo, luz, internet, etc.) que ya están activos y aplican este mes.",
      icon: "🏠", color: "text-orange-400", bg: "bg-orange-500/12", border: "border-orange-500/30", iconBg: "bg-orange-500/30 text-orange-400",
      variacion: null },
    { label: "Liquidez", valor: `${liquidezDias} días`,
      sub: liquidezDias >= 30 ? "Saludable" : liquidezDias >= 15 ? "Moderado" : "Alerta",
      tip: "Cuántos días te dura tu disponible actual si sigues gastando al mismo ritmo de este mes. Fórmula: Disponible ÷ (Gastos de este mes ÷ días transcurridos).",
      icon: "🕐", color: liquidezDias >= 30 ? "text-emerald-400" : liquidezDias >= 15 ? "text-[var(--c-warning)]" : "text-red-400",
      bg: liquidezDias >= 30 ? "bg-emerald-500/12" : liquidezDias >= 15 ? "bg-amber-500/12" : "bg-red-500/12",
      border: liquidezDias >= 30 ? "border-emerald-500/30" : liquidezDias >= 15 ? "border-amber-500/30" : "border-red-500/30",
      iconBg: liquidezDias >= 30 ? "bg-emerald-500/30 text-emerald-400" : liquidezDias >= 15 ? "bg-amber-500/30 text-[var(--c-warning)]" : "bg-red-500/30 text-red-400",
      variacion: null },
  ]

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">{MESES[mes]} {anio}</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Resumen financiero</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FiltroPeriodo />
          <Link href="/dashboard/movimientos/nuevo"
            className="flex items-center gap-1.5 h-9 px-4 border border-[var(--c-border)] text-[var(--c-text2)] hover:bg-[var(--c-card2)] text-xs font-bold rounded-xl transition-all">
            + Otro movimiento
          </Link>
          <Link href="/dashboard/venta"
            className="flex items-center gap-1.5 h-9 px-4 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20">
            🛒 Nueva venta
          </Link>
        </div>
      </div>

      {/* Alertas */}
      {deudasProximas.length > 0 && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl px-5 py-3.5 flex items-center gap-3">
          <span className="text-[var(--c-warning)] text-base flex-shrink-0">⚠</span>
          <p className="text-sm font-medium text-amber-300 flex-1">
            {deudasProximas.length} deuda{deudasProximas.length > 1 ? "s" : ""} vence{deudasProximas.length > 1 ? "n" : ""} esta semana
          </p>
          <Link href="/dashboard/deudas" className="text-xs text-[var(--c-warning)] hover:text-amber-300 font-medium whitespace-nowrap">Ver alertas →</Link>
        </div>
      )}

      {/* Cards métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl p-4 card-hover`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider flex items-center gap-1 group relative">
                {c.label}
                <span className="text-[var(--c-text4)] normal-case font-normal cursor-help">ⓘ</span>
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-[11px] normal-case font-normal text-[var(--c-text2)] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-2xl">
                  {c.tip}
                </span>
              </p>
              <span className={`w-7 h-7 rounded-lg ${c.iconBg} flex items-center justify-center text-sm font-bold`}>{c.icon}</span>
            </div>
            <p className={`text-xl font-bold ${c.color} leading-none`}>{c.valor}</p>
            <p className="text-[11px] text-[var(--c-text3)] mt-2">{c.sub}</p>
            {c.variacion !== null && (
              <p className={`text-[10px] font-bold mt-1 ${c.variacion > 0 ? "text-emerald-400" : c.variacion < 0 ? "text-red-400" : "text-[var(--c-text4)]"}`}>
                {c.variacion > 0 ? "▲" : c.variacion < 0 ? "▼" : "="} {c.variacion !== 0 ? `${Math.abs(c.variacion)}% ` : ""}vs mes anterior
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Gráfico + Resumen del día */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <div className="lg:col-span-2 h-full">
          <GraficoMensual datos={datosGrafico} mes={mes} anio={anio} />
        </div>
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-[var(--c-text)] mb-1">Resumen del día</h3>
          <p className="text-[11px] text-[var(--c-text3)] mb-4">{hoy.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</p>
          <div className="space-y-1">
            {[
              { icon: "💰", label: "Ventas hoy",   valor: formatCLP(ventasHoy),          color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { icon: "🛒", label: "Gastos hoy",   valor: formatCLP(gastosHoy),           color: "text-red-400",     bg: "bg-red-500/10" },
              { icon: "✅", label: "Utilidad hoy", valor: formatCLP(ventasHoy-gastosHoy), color: ventasHoy-gastosHoy>=0?"text-sky-400":"text-red-400", bg: "bg-sky-500/10" },
              { icon: "🛍️", label: "Ventas realizadas", valor: String(ventasHoyCount), color: "text-violet-400", bg: "bg-violet-500/10" },
              { icon: "💵", label: "Cobros recibidos", valor: formatCLP(cobrosHoy), color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { icon: "📦", label: "Movimientos",  valor: String(hoyMovs.length),         color: "text-violet-400",  bg: "bg-violet-500/10" },
              { icon: "📋", label: "Cuentas por cobrar creadas", valor: String(cxcCreadasHoyCount), color: "text-[var(--c-warning)]", bg: "bg-amber-500/10" },
              { icon: "🔔", label: "Alertas pendientes", valor: String(totalAlertasPendientes), color: totalAlertasPendientes > 0 ? "text-red-400" : "text-emerald-400", bg: "bg-red-500/10" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-[var(--c-border2)] last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-xl ${item.bg} flex items-center justify-center text-sm flex-shrink-0`}>{item.icon}</div>
                  <span className="text-xs text-[var(--c-text2)] truncate">{item.label}</span>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ml-2 ${item.color}`}>{item.valor}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mayores gastos + Productos más vendidos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {topGastos.length > 0 && (
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">Mayores gastos</h3>
              <Link href="/dashboard/movimientos" className="text-xs text-sky-400 hover:text-sky-300 font-medium">Ver todo →</Link>
            </div>
            <p className="text-[11px] text-[var(--c-text4)] mb-4">{MESES[mes]} {anio}</p>
            <div className="space-y-3">
              {topGastos.map(([cat, monto]) => {
                const pct = m.totalGastos > 0 ? Math.round((monto / m.totalGastos) * 100) : 0
                const color = getColorCategoria(cat)
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-[var(--c-text2)] truncate flex-1">{cat}</span>
                      <span className="text-xs font-semibold text-[var(--c-text)] ml-2">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[var(--c-card2)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <p className="text-[10px] text-[var(--c-text3)] mt-1">{formatCLP(monto)}</p>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--c-border2)]">
              <span className="text-xs text-[var(--c-text3)]">Total gastos del mes</span>
              <span className="text-sm font-bold text-[var(--c-text)]">{formatCLP(m.totalGastos)}</span>
            </div>
          </div>
        )}

        {topProductos.length > 0 && (
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">Productos más vendidos</h3>
              <Link href="/dashboard/productos" className="text-xs text-sky-400 hover:text-sky-300 font-medium">Ver todo →</Link>
            </div>
            <p className="text-[11px] text-[var(--c-text4)] mb-4">{MESES[mes]} {anio}</p>
            <div className="space-y-3">
              {topProductos.map((p, i) => {
                const pct = totalVentasProductos > 0 ? Math.round((p.total / totalVentasProductos) * 100) : 0
                const margen = p.conUtilidad && p.total > 0 ? Math.round((p.utilidad / p.total) * 100) : null
                const color = i===0 ? "#fbbf24" : i===1 ? "#94a3b8" : i===2 ? "#b45309" : "#38bdf8"
                return (
                  <div key={p.nombre}>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="text-xs text-[var(--c-text2)] truncate flex-1">{getEmojiProducto(p.nombre)} {p.nombre}</span>
                      <span className="text-xs font-semibold text-[var(--c-text)] flex-shrink-0">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[var(--c-card2)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-[var(--c-text3)]">{p.count} unidades · {formatCLP(p.total)}</p>
                      {p.conUtilidad ? (
                        <p className={`text-[10px] font-medium ${p.utilidad >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCLP(p.utilidad)} util. {margen !== null ? `(${margen}%)` : ""}</p>
                      ) : (
                        <p className="text-[10px] text-[var(--c-text4)]">Sin costo</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--c-border2)]">
              <span className="text-xs text-[var(--c-text3)]">Total vendido en productos</span>
              <span className="text-sm font-bold text-[var(--c-text)]">{formatCLP(totalVentasProductos)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Alertas */}
      {(productosAgotados.length > 0 || productosStockBajo.length > 0) ? (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--c-text)]">Alertas</h3>
            <Link href="/dashboard/alertas" className="text-xs text-sky-400 hover:text-sky-300 font-medium">Ver todas →</Link>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {productosAgotados.slice(0,4).map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <p className="text-xs text-[var(--c-text2)]"><span className="font-semibold text-[var(--c-text)]">Sin stock:</span> {p.nombre}</p>
              </div>
            ))}
            {productosStockBajo.slice(0,4).map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                <p className="text-xs text-[var(--c-text2)]"><span className="font-semibold text-[var(--c-text)]">Stock bajo:</span> {p.nombre} · quedan {p.stock}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 flex items-center gap-2">
          <span className="text-base">✅</span>
          <p className="text-xs text-[var(--c-text3)]">Sin alertas de inventario pendientes</p>
        </div>
      )}
    </div>
  )
}
