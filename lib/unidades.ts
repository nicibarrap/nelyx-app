// Sistema de unidades de medida — FASE 1.
//
// Estrategia de almacenamiento: el stock SIEMPRE se guarda como entero en la
// unidad mínima según la forma de venta:
//   - formaVenta "peso"    → stock en GRAMOS
//   - formaVenta "volumen" → stock en MILILITROS
//   - formaVenta "unidad"  → stock en conteo literal (unidades/cajas/etc.)
// Esto evita tener que cambiar las columnas Int existentes en la BD y
// mantiene intacta toda la lógica de descuento de stock ya implementada.

export type FormaVenta = "unidad" | "peso" | "volumen"

export const UNIDADES_MEDIDA = [
  { value: "unidad",       label: "Unidad",         forma: "unidad" as FormaVenta },
  { value: "kg",           label: "Kilogramos (Kg)",forma: "peso" as FormaVenta },
  { value: "g",            label: "Gramos (g)",     forma: "peso" as FormaVenta },
  { value: "L",            label: "Litros (L)",     forma: "volumen" as FormaVenta },
  { value: "ml",           label: "Mililitros (ml)",forma: "volumen" as FormaVenta },
  { value: "metro",        label: "Metro",          forma: "unidad" as FormaVenta },
  { value: "cm",           label: "Centímetros",    forma: "unidad" as FormaVenta },
  { value: "caja",         label: "Caja",           forma: "unidad" as FormaVenta },
  { value: "bolsa",        label: "Bolsa",          forma: "unidad" as FormaVenta },
  { value: "pack",         label: "Pack",           forma: "unidad" as FormaVenta },
  { value: "docena",       label: "Docena",         forma: "unidad" as FormaVenta },
  { value: "bandeja",      label: "Bandeja",        forma: "unidad" as FormaVenta },
  { value: "personalizada",label: "Personalizada…", forma: "unidad" as FormaVenta },
] as const

export type UnidadMedida = typeof UNIDADES_MEDIDA[number]["value"]

export function unidadesParaForma(forma: FormaVenta) {
  if (forma === "peso") return UNIDADES_MEDIDA.filter(u => u.value === "kg" || u.value === "g")
  if (forma === "volumen") return UNIDADES_MEDIDA.filter(u => u.value === "L" || u.value === "ml")
  return UNIDADES_MEDIDA.filter(u => u.forma === "unidad")
}

export function labelUnidad(unidadMedida: string, unidadPersonalizada?: string | null): string {
  if (unidadMedida === "personalizada") return unidadPersonalizada || "unidad personalizada"
  return UNIDADES_MEDIDA.find(u => u.value === unidadMedida)?.label.replace(/ \(.+\)/, "").replace("…", "") ?? unidadMedida
}

/** Factor para convertir un número ingresado en `unidadMedida` a la unidad interna (gramos/ml/conteo). */
export function factorAInterno(unidadMedida: string): number {
  if (unidadMedida === "kg" || unidadMedida === "L") return 1000
  return 1
}

/** Convierte un valor ingresado por el usuario (en la unidad que sea) al entero interno guardado en BD. */
export function aInterno(valor: number, unidadMedida: string): number {
  return Math.round(valor * factorAInterno(unidadMedida))
}

/** Convierte el valor interno (gramos/ml/conteo) de vuelta a la unidad de display del producto. */
export function deInterno(interno: number, unidadMedida: string): number {
  return interno / factorAInterno(unidadMedida)
}

/**
 * Formatea el stock interno para mostrarlo de forma amigable, sin exponer
 * nunca el valor crudo en gramos/ml — siempre en la unidad más natural.
 */
export function formatearStock(stockInterno: number | null, formaVenta: string, unidadMedida: string, unidadPersonalizada?: string | null): string {
  if (stockInterno === null) return "—"
  if (formaVenta === "peso") {
    if (stockInterno >= 1000) return `${limpiarDecimales(stockInterno / 1000)} Kg`
    return `${limpiarDecimales(stockInterno)} g`
  }
  if (formaVenta === "volumen") {
    if (stockInterno >= 1000) return `${limpiarDecimales(stockInterno / 1000)} L`
    return `${limpiarDecimales(stockInterno)} ml`
  }
  const label = labelUnidad(unidadMedida, unidadPersonalizada)
  const labelPlural = unidadMedida === "unidad" ? "unidades" : `${label.toLowerCase()}s`
  return `${stockInterno} ${stockInterno === 1 ? label.toLowerCase() : labelPlural}`
}

function limpiarDecimales(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace(".", ",")
}

/** Convierte un valor de una unidad a otra (kg↔g, L↔ml). Si son del mismo tipo de conteo, no convierte. */
export function convertirValor(valor: number, unidadOrigen: string, unidadDestino: string): number {
  if (unidadOrigen === unidadDestino) return valor
  const base = valor * factorAInterno(unidadOrigen)
  return base / factorAInterno(unidadDestino)
}

/** Unidades de entrada disponibles para el formulario de venta (peso/volumen). */
export function unidadesEntradaVenta(formaVenta: string): { value: string; label: string }[] {
  if (formaVenta === "peso") return [{ value: "kg", label: "Kg" }, { value: "g", label: "g" }]
  if (formaVenta === "volumen") return [{ value: "L", label: "L" }, { value: "ml", label: "ml" }]
  return [{ value: "unidad", label: "unidades" }]
}

// ── Presentación fija de venta (ej: "bolsas de 200g", "botellas de 500ml") ──
// Permite vender en paquetes de tamaño fijo aunque el stock se controle por
// peso/volumen. `unidadVentaCantidad` siempre está en la unidad INTERNA
// (gramos/ml). `precio` en ese caso es el precio POR PRESENTACIÓN, no por Kg/L.

export function stockEnPresentaciones(stockInterno: number | null, unidadVentaCantidad: number | null): number | null {
  if (stockInterno === null || !unidadVentaCantidad || unidadVentaCantidad <= 0) return null
  return Math.floor(stockInterno / unidadVentaCantidad)
}
