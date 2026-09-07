import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCLP(monto: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(monto)
}

export function formatFecha(fecha: Date | string): string {
  return new Date(fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
}

export function formatFechaCorta(fecha: Date | string): string {
  return new Date(fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
}

export const ETIQUETAS: Record<string, { label: string; emoji: string; color: string }> = {
  VENTA:         { label: "Venta",         emoji: "💰", color: "text-green-400 border-green-800 bg-green-950" },
  GASTO:         { label: "Gasto",         emoji: "🛒", color: "text-red-400 border-red-800 bg-red-950" },
  COSTO_FIJO:    { label: "Costo Fijo",    emoji: "🏠", color: "text-orange-400 border-orange-800 bg-orange-950" },
  INGRESO_EXTRA: { label: "Ingreso Extra", emoji: "➕", color: "text-sky-400 border-sky-800 bg-sky-950" },
  RETIRO:        { label: "Retiro",        emoji: "👝", color: "text-purple-400 border-purple-800 bg-purple-950" },
}

export const TIPOS_DEUDA = ["Banco", "Proveedor", "Tarjeta de crédito", "Préstamo personal", "Mercadería", "Servicios", "Impuestos", "Otros"]

export type EstadoDeuda = "Pagada" | "Vencida" | "Próxima a vencer" | "Parcialmente pagada" | "Al día" | "Pendiente"

export function calcularEstadoDeuda(deuda: {
  pagada: boolean
  monto: any
  montoPagado: any
  fechaVence: Date | null | undefined
}): EstadoDeuda {
  if (deuda.pagada) return "Pagada"
  const hoy = new Date()
  const montoPagado = Number(deuda.montoPagado)
  const monto = Number(deuda.monto)
  if (deuda.fechaVence) {
    const vence = new Date(deuda.fechaVence)
    if (vence < hoy) return "Vencida"
    const diffDias = Math.ceil((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDias <= 7) return "Próxima a vencer"
  }
  if (montoPagado > 0 && montoPagado < monto) return "Parcialmente pagada"
  return "Al día"
}

export const ESTADO_CONFIG: Record<EstadoDeuda, { color: string; bg: string; border: string }> = {
  "Pagada":              { color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  "Vencida":             { color: "text-red-400",   bg: "bg-red-500/10",   border: "border-red-500/20" },
  "Próxima a vencer":    { color: "text-orange-400",bg: "bg-orange-500/10",border: "border-orange-500/20" },
  "Parcialmente pagada": { color: "text-sky-400",   bg: "bg-sky-500/10",   border: "border-sky-500/20" },
  "Al día":              { color: "text-emerald-400",bg:"bg-emerald-500/10",border:"border-emerald-500/20" },
  "Pendiente":           { color: "text-zinc-400",  bg: "bg-zinc-500/10",  border: "border-zinc-500/20" },
}

export function calcularMetricas(movimientos: any[], deudasPendientes: number) {
  const ingresos = movimientos.filter((m) => ["VENTA","INGRESO_EXTRA"].includes(m.tipo)).reduce((a,m) => a+Number(m.monto), 0)
  const gastos = movimientos.filter((m) => ["GASTO","COSTO_FIJO","RETIRO"].includes(m.tipo)).reduce((a,m) => a+Number(m.monto), 0)
  return {
    totalVentas: movimientos.filter((m) => m.tipo === "VENTA").reduce((a,m) => a+Number(m.monto), 0),
    totalIngresos: ingresos,
    totalGastos: gastos,
    utilidadNeta: ingresos - gastos,
    cantidadVentas: movimientos.filter((m) => m.tipo === "VENTA").length,
    deudasPendientes,
  }
}

export function prepararGrafico(movimientos: any[], anio: number, mes: number) {
  const dias = new Date(anio, mes, 0).getDate()
  return Array.from({ length: dias }, (_, i) => {
    const d = movimientos.filter((m) => new Date(m.fecha).getDate() === i + 1)
    const ventas = d.filter((m) => ["VENTA","INGRESO_EXTRA"].includes(m.tipo)).reduce((a,m) => a+Number(m.monto), 0)
    const gastos = d.filter((m) => ["GASTO","COSTO_FIJO","RETIRO"].includes(m.tipo)).reduce((a,m) => a+Number(m.monto), 0)
    return {
      dia: String(i + 1).padStart(2, "0"),
      ventas,
      gastos,
      neto: ventas - gastos,
      movimientos: d.length,
    }
  })
}

const NOMBRES_MES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const NOMBRES_MES_ABREV = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

/** Igual que prepararGrafico pero agregado por mes en vez de por día — misma
 * definición de ingresos/gastos, para que la vista Anual del gráfico use
 * exactamente la misma lógica financiera que la vista Mensual. Los 12 meses
 * siempre se incluyen (aunque estén en $0), a diferencia de la vista mensual. */
export function prepararGraficoAnual(movimientos: any[], anio: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = movimientos.filter((m) => new Date(m.fecha).getMonth() === i)
    const ventas = d.filter((m) => ["VENTA","INGRESO_EXTRA"].includes(m.tipo)).reduce((a,m) => a+Number(m.monto), 0)
    const gastos = d.filter((m) => ["GASTO","COSTO_FIJO","RETIRO"].includes(m.tipo)).reduce((a,m) => a+Number(m.monto), 0)
    return {
      dia: NOMBRES_MES_ABREV[i],
      mesCompleto: NOMBRES_MES[i],
      mesIndex: i + 1,
      ventas,
      gastos,
      neto: ventas - gastos,
      movimientos: d.length,
    }
  })
}

/** Variación porcentual entre un valor actual y uno anterior — única fuente
 * de este cálculo en toda la plataforma (Resumen y Reportes lo comparten). */
export function calcularVariacionPct(actual: number, anterior: number): number {
  if (anterior === 0) return actual > 0 ? 100 : 0
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 100)
}

/** Flujo acumulado día a día del mes, a partir de la misma serie que ya usa
 * el gráfico de Ingresos vs Gastos — no es una fuente de datos distinta,
 * solo una vista acumulada de la misma información. */
export function calcularFlujoAcumulado(datosGrafico: { dia: string; ventas: number; gastos: number }[]) {
  let acumulado = 0, ingresosAcum = 0, gastosAcum = 0
  return datosGrafico.map(d => {
    ingresosAcum += d.ventas
    gastosAcum += d.gastos
    const anterior = acumulado
    acumulado += d.ventas - d.gastos
    return { dia: d.dia, acumulado, ingresosAcum, gastosAcum, variacion: acumulado - anterior }
  })
}

/** Format a number as CLP while typing (e.g. 40000 → "40.000") */
export function formatMoneyInput(value: string | number): string {
  const num = typeof value === "string" ? value.replace(/\D/g, "") : String(Math.round(Number(value)))
  if (!num) return ""
  return Number(num).toLocaleString("es-CL")
}

/** Parse a formatted money string back to number */
export function parseMoney(formatted: string): number {
  return Number(formatted.replace(/\./g, "").replace(/,/g, "").replace(/[^0-9]/g, "")) || 0
}
