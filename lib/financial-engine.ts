// ══════════════════════════════════════════════════════════════════════
// FINANCIAL ENGINE — Única fuente oficial de cálculos financieros de NELYX.
//
// Ningún componente ni server action debe recalcular margen, utilidad o
// costo promedio por su cuenta — todos deben importar y usar las
// funciones de este archivo. Es un módulo puro (sin acceso a base de
// datos), así que es seguro usarlo tanto en Server Components, server
// actions, como en componentes cliente.
// ══════════════════════════════════════════════════════════════════════

export type Utilidad = { costo: number; utilidad: number; margen: number | null }

/**
 * Costo Promedio Ponderado (CPP) — el método de valorización oficial de
 * NELYX. Cuando entra stock nuevo a un costo distinto, el costo del
 * producto no se reemplaza: se pondera contra el stock que ya había.
 *
 * Ejemplo: 30 huevos a $166,67 c/u (stock previo) + compra de 30 huevos
 * a $190 c/u → nuevo costo = ((30×166,67)+(30×190))/60 = $178,33
 *
 * Preparado para poder incorporar FIFO en el futuro sin cambiar la firma
 * pública de esta función (quien la llama no sabe ni le importa el
 * método interno).
 */
export function costoPromedioPonderado(
  stockAnterior: number,
  costoAnterior: number,
  cantidadNueva: number,
  costoNuevo: number
): number {
  const stockTotal = stockAnterior + cantidadNueva
  if (stockTotal <= 0) return costoNuevo
  if (stockAnterior <= 0) return costoNuevo
  return ((stockAnterior * costoAnterior) + (cantidadNueva * costoNuevo)) / stockTotal
}

/** Utilidad y margen de una venta puntual. `costoUnitario` es el costo del
 * producto AL MOMENTO de la venta (snapshot), no el costo actual. */
export function calcularUtilidadVenta(ingreso: number, costoUnitario: number, cantidad: number): Utilidad {
  const costo = costoUnitario * cantidad
  const utilidad = ingreso - costo
  const margen = ingreso > 0 ? (utilidad / ingreso) * 100 : null
  return { costo, utilidad, margen }
}

/** Margen porcentual simple entre precio y costo (para fichas/tablas, sin cantidad). */
export function calcularMargenPorcentual(precio: number | null, costo: number | null): { ganancia: number; margen: number } | null {
  if (!precio || costo === null || costo === undefined) return null
  const ganancia = precio - costo
  const margen = precio > 0 ? (ganancia / precio) * 100 : 0
  return { ganancia, margen }
}

export type ValorInventarioItem = { stock: number; costo: number | null; precio: number | null }

/** Valorización total del inventario: costo real invertido vs. precio
 * potencial de venta y la utilidad que representa venderlo todo. */
export function calcularValorInventario(items: ValorInventarioItem[]) {
  let valorCosto = 0
  let valorVentaPotencial = 0
  for (const it of items) {
    valorCosto += it.stock * (it.costo ?? 0)
    valorVentaPotencial += it.stock * (it.precio ?? 0)
  }
  const utilidadPotencial = valorVentaPotencial - valorCosto
  const margenPotencial = valorVentaPotencial > 0 ? (utilidadPotencial / valorVentaPotencial) * 100 : null
  return { valorCosto, valorVentaPotencial, utilidadPotencial, margenPotencial }
}

/** Umbral por debajo del cual una venta se considera de "margen muy bajo"
 * para efectos de alertas automáticas (sección 13 del Sprint 4). */
export const MARGEN_BAJO_UMBRAL = 10 // %

export function clasificarMargenVenta(margen: number | null): "negativo" | "bajo" | "normal" | null {
  if (margen === null) return null
  if (margen < 0) return "negativo"
  if (margen < MARGEN_BAJO_UMBRAL) return "bajo"
  return "normal"
}
