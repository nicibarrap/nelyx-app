// ══════════════════════════════════════════════════════════════════════
// Insights automáticos de Clientes — lógica pura (sin acceso a base de
// datos), reutilizable tanto en el server component de Clientes como en
// tests. Todo se calcula a partir de datos que ya existen (fechas de
// compra, total comprado), sin campos nuevos que el dueño tenga que
// mantener a mano.
// ══════════════════════════════════════════════════════════════════════

export type SegmentoCliente = "nuevo" | "vip" | "frecuente" | "en_riesgo" | "inactivo" | "regular"

export const SEGMENTOS_CFG: Record<SegmentoCliente, { label: string; icon: string; color: string; bg: string; border: string }> = {
  nuevo:     { label: "Nuevo",     icon: "🆕", color: "text-sky-400",            bg: "bg-sky-500/10",     border: "border-sky-500/20" },
  vip:       { label: "Valioso",   icon: "💎", color: "text-violet-400",         bg: "bg-violet-500/10",  border: "border-violet-500/20" },
  frecuente: { label: "Frecuente", icon: "🔥", color: "text-emerald-400",        bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  en_riesgo: { label: "En riesgo", icon: "⏰", color: "text-[var(--c-warning)]", bg: "bg-amber-500/10",   border: "border-amber-500/20" },
  inactivo:  { label: "Inactivo",  icon: "💤", color: "text-[var(--c-text4)]",   bg: "bg-zinc-500/10",    border: "border-[var(--c-border)]" },
  regular:   { label: "Regular",   icon: "👤", color: "text-[var(--c-text3)]",   bg: "bg-[var(--c-card2)]", border: "border-[var(--c-border)]" },
}

/** Promedio de días entre compras consecutivas. Necesita al menos 2 fechas;
 * con menos, no hay patrón que calcular. */
export function calcularIntervaloPromedioDias(fechas: Date[]): number | null {
  if (fechas.length < 2) return null
  const ordenadas = [...fechas].sort((a, b) => a.getTime() - b.getTime())
  const rango = ordenadas[ordenadas.length - 1].getTime() - ordenadas[0].getTime()
  return rango / (ordenadas.length - 1) / 86400000
}

/** ¿Este cliente ya debería haber vuelto a comprar, según SU propio patrón
 * habitual? Compras muy seguidas (intervalo menor a 3 días) no dan un
 * patrón confiable, así que se ignoran para evitar falsos positivos. */
export function calcularDebioVolver(params: {
  activo: boolean
  compras: number
  intervaloPromedioDias: number | null
  diasSinCompra: number
}): boolean {
  const { activo, compras, intervaloPromedioDias, diasSinCompra } = params
  if (!activo || compras < 2 || intervaloPromedioDias === null || intervaloPromedioDias < 3) return false
  return diasSinCompra > intervaloPromedioDias * 1.5
}

/** Segmento automático (RFM simplificado) — complementa, sin reemplazar,
 * los flags manuales "Frecuente"/"VIP" que el dueño puede seguir marcando
 * a mano por sus propias razones. */
export function calcularSegmento(params: {
  activo: boolean
  compras: number
  diasSinCompra: number
  intervaloPromedioDias: number | null
  esValiosoPorMonto: boolean
}): SegmentoCliente {
  const { activo, compras, diasSinCompra, intervaloPromedioDias, esValiosoPorMonto } = params
  if (!activo) return "inactivo"
  if (compras <= 1) return "nuevo"
  if (calcularDebioVolver(params)) return "en_riesgo"
  if (esValiosoPorMonto) return "vip"
  if (intervaloPromedioDias !== null && intervaloPromedioDias >= 3 && diasSinCompra <= intervaloPromedioDias * 1.2) return "frecuente"
  return "regular"
}

/** Umbral de "valioso por monto": clientes con 2+ compras cuyo total
 * comprado está en el 15% más alto de la cartera (mínimo 1 cliente). */
export function calcularUmbralValioso(totalCompradoDeClientesConHistorial: number[]): number {
  if (totalCompradoDeClientesConHistorial.length === 0) return Infinity
  const ordenado = [...totalCompradoDeClientesConHistorial].sort((a, b) => b - a)
  const posicion = Math.max(0, Math.ceil(ordenado.length * 0.15) - 1)
  return ordenado[posicion]
}

/** Límite de crédito sugerido: un múltiplo del ticket promedio del propio
 * cliente, redondeado a un número fácil de leer. Sin historial suficiente
 * no hay base para sugerir nada. */
export function sugerirLimiteCredito(ticketPromedio: number, compras: number): number | null {
  if (compras < 2 || ticketPromedio <= 0) return null
  const bruto = ticketPromedio * 3
  return Math.max(10000, Math.round(bruto / 10000) * 10000)
}

/** Método de pago más usado por el cliente, a partir de su historial real
 * (ventas al contado con su medio de pago informado, más una entrada
 * "Crédito" por cada venta a crédito) — reemplaza el campo que antes había
 * que adivinar a mano al crear el cliente, sin ninguna compra todavía en
 * la que basarse. */
export function calcularMetodoPagoHabitual(metodos: (string | null)[]): string | null {
  const conteo = new Map<string, number>()
  for (const m of metodos) {
    if (!m) continue
    conteo.set(m, (conteo.get(m) ?? 0) + 1)
  }
  if (conteo.size === 0) return null
  return [...conteo.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** Frecuencia de compra en una etiqueta legible (mismas categorías que
 * antes se elegían a mano: Diaria/Semanal/Quincenal/Mensual/Eventual),
 * calculada a partir del intervalo promedio real entre compras. */
export function calcularFrecuenciaLabel(intervaloPromedioDias: number | null): string | null {
  if (intervaloPromedioDias === null) return null
  if (intervaloPromedioDias < 2) return "Diaria"
  if (intervaloPromedioDias < 10) return "Semanal"
  if (intervaloPromedioDias < 20) return "Quincenal"
  if (intervaloPromedioDias < 45) return "Mensual"
  return "Eventual"
}
