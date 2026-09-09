import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { hoyEnChile } from "@/lib/timezone"
import { calcularVariacionPct } from "@/lib/utils"
import { ReportesClient } from "@/components/reportes/reportes-client"

export const metadata: Metadata = { title: "Reportes" }
export const dynamic = "force-dynamic"

function rangoMes(date: Date) {
  const inicio = new Date(date.getFullYear(), date.getMonth(), 1)
  const fin = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { inicio, fin }
}

const DIAS_NOMBRE = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
const MESES_CORTO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

export default async function ReportesPage() {
  const session = await auth()
  const userId = session!.user.id
  const hoy = hoyEnChile()
  const { inicio: inicioMes, fin: finMes } = rangoMes(hoy)
  const mesAnteriorRef = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const { inicio: inicioMesAnt, fin: finMesAnt } = rangoMes(mesAnteriorRef)
  const inicio12Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)

  const [
    movMesActual, movMesAnterior, mov12Meses,
    deudas, cuentasPorCobrar, costosFijos,
    productos, clientesAgg, clientesTodos,
  ] = await Promise.all([
    db.movimiento.findMany({
      where: { userId, fecha: { gte: inicioMes, lt: finMes } },
      include: { producto: { select: { nombre: true, costo: true, precio: true } }, cliente: { select: { nombre: true, apellido: true, metodoPago: true, createdAt: true } } },
    }),
    db.movimiento.findMany({
      where: { userId, fecha: { gte: inicioMesAnt, lt: finMesAnt } },
      include: { cliente: { select: { id: true } } },
    }),
    db.movimiento.findMany({
      where: { userId, fecha: { gte: inicio12Meses, lt: finMes }, tipo: { in: ["VENTA", "GASTO", "COSTO_FIJO", "INGRESO_EXTRA", "RETIRO"] } },
      select: { tipo: true, monto: true, fecha: true, clienteId: true, productoId: true },
    }),
    db.deuda.findMany({ where: { userId, pagada: false } }),
    db.cuentaPorCobrar.findMany({
      where: { userId, estado: { in: ["pendiente", "parcial", "vencida"] } },
      include: { cliente: { select: { nombre: true, apellido: true } } },
    }),
    db.costoFijoRecurrente.findMany({
      where: { userId, estado: "activo" },
      include: { generaciones: { where: { mes: hoy.getMonth() + 1, anio: hoy.getFullYear() } } },
    }),
    db.producto.findMany({ where: { userId, activo: true }, select: { id: true } }),
    db.movimiento.groupBy({
      by: ["clienteId"],
      where: { userId, tipo: "VENTA", clienteId: { not: null }, fecha: { gte: inicioMes, lt: finMes } },
      _sum: { monto: true },
      _count: true,
    }),
    db.cliente.findMany({ where: { userId }, select: { id: true, nombre: true, apellido: true, createdAt: true } }),
  ])

  // ── Base: mes actual ──
  const ventasMes = movMesActual.filter(m => m.tipo === "VENTA" || m.tipo === "INGRESO_EXTRA")
  const gastosMes = movMesActual.filter(m => m.tipo === "GASTO" || m.tipo === "COSTO_FIJO")
  const totalVentas = ventasMes.reduce((a, m) => a + Number(m.monto), 0)
  const totalGastos = gastosMes.reduce((a, m) => a + Number(m.monto), 0)
  const utilidadNeta = totalVentas - totalGastos

  // ── Mes anterior ──
  const ventasMesAnt = movMesAnterior.filter(m => m.tipo === "VENTA" || m.tipo === "INGRESO_EXTRA")
  const gastosMesAnt = movMesAnterior.filter(m => m.tipo === "GASTO" || m.tipo === "COSTO_FIJO")
  const totalVentasAnt = ventasMesAnt.reduce((a, m) => a + Number(m.monto), 0)
  const totalGastosAnt = gastosMesAnt.reduce((a, m) => a + Number(m.monto), 0)
  const utilidadNetaAnt = totalVentasAnt - totalGastosAnt

  const pct = calcularVariacionPct

  // ── Cuentas por cobrar (para diagnóstico) ──
  const cxcEmitidasMes = await db.cuentaPorCobrar.findMany({ where: { userId, fechaVenta: { gte: inicioMes, lt: finMes } }, select: { montoOriginal: true, saldoPendiente: true } })
  const totalEmitidoMes = cxcEmitidasMes.reduce((a, c) => a + Number(c.montoOriginal), 0)
  const totalCobradoDeEmitidoMes = cxcEmitidasMes.reduce((a, c) => a + (Number(c.montoOriginal) - Number(c.saldoPendiente)), 0)
  const pctRecuperacionCxc = totalEmitidoMes > 0 ? Math.round((totalCobradoDeEmitidoMes / totalEmitidoMes) * 100) : null

  // ── Productos: rentabilidad — usa el snapshot financiero de la venta
  // (Movimiento.utilidad) cuando existe. Este ranking ya no se muestra como
  // sección propia — solo alimenta Diagnóstico, Oportunidades y Resumen.
  const ventasPorProducto: Record<string, { nombre: string; ingresos: number; margen: number; unidades: number }> = {}
  for (const m of ventasMes) {
    if (!m.productoId || !m.producto) continue
    const key = m.productoId
    if (!ventasPorProducto[key]) ventasPorProducto[key] = { nombre: m.producto.nombre, ingresos: 0, margen: 0, unidades: 0 }
    const monto = Number(m.monto)
    let utilidadVenta: number
    if (m.utilidad != null) {
      utilidadVenta = Number(m.utilidad)
    } else {
      const precio = Number(m.producto.precio ?? 0)
      const costo = Number(m.producto.costo ?? 0)
      const margenUnitario = precio > 0 ? precio - costo : 0
      utilidadVenta = precio > 0 ? (margenUnitario / precio) * monto : monto * 0.25
    }
    ventasPorProducto[key].ingresos += monto
    ventasPorProducto[key].unidades += 1
    ventasPorProducto[key].margen += utilidadVenta
  }
  const productosRanking = Object.values(ventasPorProducto)
    .sort((a, b) => b.margen - a.margen)
    .slice(0, 6)
    .map(p => ({ ...p, margenPct: p.ingresos > 0 ? Math.round((p.margen / p.ingresos) * 100) : 0 }))

  const productoMasRentable = productosRanking[0]?.nombre ?? null
  const cogsEstimado = Object.values(ventasPorProducto).reduce((a, p) => a + (p.ingresos - p.margen), 0)

  const productoBajoMargenAltoVolumen = Object.values(ventasPorProducto)
    .filter(p => p.unidades >= 5 && p.ingresos > 0 && (p.margen / p.ingresos) < 0.2)
    .sort((a, b) => b.unidades - a.unidades)[0] ?? null

  const hace45d = new Date(hoy.getTime() - 45 * 86400000)
  const ventadosRecientes = new Set(
    (await db.movimiento.findMany({
      where: { userId, tipo: "VENTA", fecha: { gte: hace45d }, productoId: { not: null } },
      select: { productoId: true },
    })).map(m => m.productoId)
  )
  const productosSinMovimiento = productos.filter(p => !ventadosRecientes.has(p.id))

  // ── Clientes: usados solo para el Resumen ejecutivo — el ranking completo
  // ahora se muestra en el propio módulo Clientes, no duplicado acá ──
  const clientesInfoMap = new Map<string, { id: string; nombre: string; apellido: string | null }>(
    clientesTodos.map(c => [c.id, c])
  )
  const clientesAggOrdenado = [...clientesAgg].sort((a, b) => Number(b._sum.monto ?? 0) - Number(a._sum.monto ?? 0))
  const clienteTopAgg = clientesAggOrdenado[0] ?? null
  const clienteTop = clienteTopAgg?.clienteId ? (() => {
    const info = clientesInfoMap.get(clienteTopAgg.clienteId!)
    return info ? { nombre: `${info.nombre} ${info.apellido ?? ""}`.trim(), monto: Number(clienteTopAgg._sum.monto ?? 0) } : null
  })() : null
  const concentracionTop3 = (() => {
    const top3 = clientesAggOrdenado.slice(0, 3)
    const suma = top3.reduce((a, c) => a + Number(c._sum.monto ?? 0), 0)
    return totalVentas > 0 ? Math.round((suma / totalVentas) * 100) : 0
  })()

  // ── Día/hora de mayor venta (diagnóstico) y mapa de calor semanal completo
  // (día × hora), todo del mismo recorrido de datos, sin consulta nueva ──
  const ventasPorDiaSemana: Record<number, number> = {}
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const m of ventasMes) {
    const dow = new Date(m.fecha).getDay()
    ventasPorDiaSemana[dow] = (ventasPorDiaSemana[dow] ?? 0) + Number(m.monto)
    const hora = new Date(m.createdAt ?? m.fecha).getHours()
    heatmap[dow][hora] += Number(m.monto)
  }
  const diasOrdenados = Object.entries(ventasPorDiaSemana).sort((a, b) => b[1] - a[1])
  const mejorDia = diasOrdenados[0] ? DIAS_NOMBRE[Number(diasOrdenados[0][0])] : null
  const peorDia = diasOrdenados.length > 1 ? DIAS_NOMBRE[Number(diasOrdenados[diasOrdenados.length - 1][0])] : null

  // ── Método de pago (aproximado por cliente registrado) ──
  const ventasConCliente = ventasMes.filter(m => m.cliente)
  const montoEfectivo = ventasConCliente.filter(m => (m.cliente?.metodoPago ?? "Efectivo") === "Efectivo").reduce((a, m) => a + Number(m.monto), 0)
  const pctEfectivo = ventasConCliente.length > 0 ? Math.round((montoEfectivo / ventasConCliente.reduce((a, m) => a + Number(m.monto), 0)) * 100) : null

  // ── Rentabilidad — ya no es sección propia, se resume en 1 línea del diagnóstico ──
  const utilidadEstimada = totalVentas - cogsEstimado - totalGastos
  const baseRent = totalVentas > 0 ? totalVentas : 1
  const margenPor100 = Math.round((utilidadEstimada / baseRent) * 100)

  // ══════════════════════════════════════════
  // DIAGNÓSTICO DEL NEGOCIO
  // ══════════════════════════════════════════
  const diagnostico: string[] = []
  if (totalVentasAnt > 0) {
    const p = pct(utilidadNeta, utilidadNetaAnt)
    if (utilidadNetaAnt !== 0) diagnostico.push(p >= 0 ? `Tu utilidad ${p === 0 ? "se mantuvo estable" : `aumentó un ${p}%`} respecto al mes anterior.` : `Tu utilidad bajó un ${Math.abs(p)}% respecto al mes anterior.`)
  }
  if (pct(totalGastos, totalGastosAnt) > pct(totalVentas, totalVentasAnt) && totalGastosAnt > 0) {
    diagnostico.push(`Tus gastos crecieron más rápido (${pct(totalGastos, totalGastosAnt)}%) que tus ventas (${pct(totalVentas, totalVentasAnt)}%).`)
  }
  if (pctRecuperacionCxc !== null) {
    diagnostico.push(`Este mes recuperaste el ${pctRecuperacionCxc}% de las cuentas por cobrar que emitiste.`)
  }
  if (mejorDia && peorDia && mejorDia !== peorDia) {
    diagnostico.push(`Tus ventas de los ${mejorDia}s son las más altas; los ${peorDia}s son las más bajas.`)
  }
  diagnostico.push(`Por cada $100 que vendes, te quedan $${Math.max(0, margenPor100)} de utilidad, después de costos y gastos.`)
  if (diagnostico.length === 0) diagnostico.push("Aún no hay suficiente historial este mes para generar un diagnóstico detallado.")

  // ══════════════════════════════════════════
  // OPORTUNIDADES DETECTADAS
  // ══════════════════════════════════════════
  const oportunidades: string[] = []
  if (productosRanking.length >= 1) {
    const top3 = productosRanking.slice(0, 3).map(p => p.nombre).join(", ")
    oportunidades.push(`Puedes aumentar tu utilidad subiendo ~5% el precio de tus productos con mejor margen: ${top3}.`)
  }
  if (productoBajoMargenAltoVolumen) {
    oportunidades.push(`"${productoBajoMargenAltoVolumen.nombre}" se vende mucho pero tiene margen bajo — revisa su precio o su costo.`)
  }
  if (concentracionTop3 > 0) {
    oportunidades.push(`Tus 3 clientes más frecuentes representan el ${concentracionTop3}% de tus ingresos este mes.`)
  }
  if (mejorDia) oportunidades.push(`Los ${mejorDia}s son tu mejor día para vender — considera promociones o mayor stock ese día.`)
  if (productosSinMovimiento.length > 0) {
    oportunidades.push(`${productosSinMovimiento.length} producto${productosSinMovimiento.length > 1 ? "s" : ""} sin ventas hace más de 45 días — evalúa una promoción o descontinuarlos.`)
  }
  if (pctEfectivo !== null) {
    oportunidades.push(`Aproximadamente el ${pctEfectivo}% de tus ventas (por clientes registrados) son en efectivo.`)
  }
  if (oportunidades.length === 0) oportunidades.push("Sigue registrando movimientos para que aparezcan oportunidades personalizadas.")

  // ══════════════════════════════════════════
  // GRÁFICO GRANDE — últimos 12 meses, todos los movimientos desglosados
  // (reutiliza la misma consulta mov12Meses que antes alimentaba "Evolución")
  // ══════════════════════════════════════════
  const mesesMap: Record<string, { ingresos: number; gastos: number; costosFijos: number }> = {}
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1)
    mesesMap[`${d.getFullYear()}-${d.getMonth()}`] = { ingresos: 0, gastos: 0, costosFijos: 0 }
  }
  for (const m of mov12Meses) {
    const d = new Date(m.fecha)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!mesesMap[key]) continue
    const monto = Number(m.monto)
    if (m.tipo === "VENTA" || m.tipo === "INGRESO_EXTRA") mesesMap[key].ingresos += monto
    else if (m.tipo === "COSTO_FIJO") mesesMap[key].costosFijos += monto
    else mesesMap[key].gastos += monto // GASTO + RETIRO
  }
  const graficoAnual = Object.entries(mesesMap).map(([key, v]) => {
    const [y, mIdx] = key.split("-").map(Number)
    const gastosTotal = v.gastos + v.costosFijos
    return {
      mes: MESES_CORTO[mIdx], anio: y,
      ingresos: Math.round(v.ingresos), gastos: Math.round(v.gastos), costosFijos: Math.round(v.costosFijos),
      neto: Math.round(v.ingresos - gastosTotal),
    }
  })

  // ══════════════════════════════════════════
  // RESUMEN EJECUTIVO
  // ══════════════════════════════════════════
  const pctVentas = pct(totalVentas, totalVentasAnt)
  const pctGastos = pct(totalGastos, totalGastosAnt)
  const partes: string[] = []
  partes.push(`Durante este período el negocio ${pctVentas >= 0 ? `aumentó sus ventas un ${pctVentas}%` : `disminuyó sus ventas un ${Math.abs(pctVentas)}%`}${totalGastosAnt > 0 ? `, mientras los gastos ${pctGastos >= 0 ? `crecieron un ${pctGastos}%` : `bajaron un ${Math.abs(pctGastos)}%`}` : ""}.`)
  partes.push(utilidadNeta >= 0 ? `La utilidad se mantiene positiva, con ${Math.abs(margenPor100)}% de margen sobre las ventas.` : `La utilidad fue negativa este período — los gastos superaron a las ventas.`)
  if (productoMasRentable) partes.push(`El producto con mayor margen fue ${productoMasRentable}.`)
  if (clienteTop) partes.push(`El cliente más valioso fue ${clienteTop.nombre}, con ${formatearMonto(clienteTop.monto)} en compras.`)
  partes.push(oportunidades[0] ?? "")
  const resumenEjecutivo = partes.filter(Boolean).join(" ")

  function formatearMonto(n: number) { return `$${Math.round(n).toLocaleString("es-CL")}` }

  return (
    <ReportesClient
      data={{
        periodo: { inicio: inicioMes.toISOString(), fin: new Date(finMes.getTime() - 1).toISOString() },
        diagnostico,
        oportunidades,
        graficoAnual,
        heatmap,
        resumenEjecutivo,
        negocio: session?.user?.negocio ?? session?.user?.name ?? "Tu negocio",
      }}
    />
  )
}
