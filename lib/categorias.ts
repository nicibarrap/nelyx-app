export const CATEGORIAS_GASTO = [
  "Mercadería",
  "Transporte",
  "Delivery",
  "Marketing / Publicidad",
  "Herramientas",
  "Mantención",
  "Insumos",
  "Combustible",
  "Comisiones",
  "Servicios externos",
  "Packaging",
  "Otros",
]

export const CATEGORIAS_COSTO_FIJO = [
  "Arriendo",
  "Luz",
  "Agua",
  "Internet",
  "Sueldos",
  "Software / Suscripciones",
  "Patentes / Permisos",
  "Contador",
  "Seguridad",
  "Bodega",
  "Otros",
]

export function getCategoriasBase(tipo: string): string[] {
  if (tipo === "GASTO") return CATEGORIAS_GASTO
  if (tipo === "COSTO_FIJO") return CATEGORIAS_COSTO_FIJO
  return []
}

export const COLORES_CATEGORIA: Record<string, string> = {
  "Mercadería":              "#38bdf8",
  "Transporte":              "#818cf8",
  "Delivery":                "#34d399",
  "Marketing / Publicidad":  "#fb923c",
  "Herramientas":            "#f472b6",
  "Mantención":              "#a3e635",
  "Insumos":                 "#facc15",
  "Combustible":             "#f87171",
  "Comisiones":              "#c084fc",
  "Servicios externos":      "#22d3ee",
  "Packaging":               "#4ade80",
  "Arriendo":                "#f97316",
  "Luz":                     "#eab308",
  "Agua":                    "#06b6d4",
  "Internet":                "#8b5cf6",
  "Sueldos":                 "#ec4899",
  "Software / Suscripciones":"#14b8a6",
  "Patentes / Permisos":     "#f43f5e",
  "Contador":                "#6366f1",
  "Seguridad":               "#84cc16",
  "Bodega":                  "#d946ef",
  "Otros":                   "#94a3b8",
  // Categorías de producto (antes vivían en un mapa aparte, duplicado, en
  // productos-client.tsx — ahora es la misma fuente para todo NELYX)
  "Bebidas":                 "#3b82f6",
  "Carnes":                  "#ef4444",
  "Verduras":                "#22c55e",
  "Abarrotes":               "#f59e0b",
  "Limpieza":                "#06b6d4",
  "Accesorios":              "#8b5cf6",
  "Panadería":               "#f97316",
  "Frutas":                  "#ec4899",
  "Lácteos":                 "#0ea5e9",
}

// Paleta amplia para categorías personalizadas (no predefinidas) — se elige
// siempre el mismo color para el mismo nombre de categoría, calculado a
// partir del texto, así cada categoría nueva queda con un color distinto y
// consistente sin tener que mantenerla a mano en COLORES_CATEGORIA.
const PALETA_CATEGORIA_PERSONALIZADA = [
  "#38bdf8", "#f472b6", "#a3e635", "#facc15", "#c084fc", "#22d3ee",
  "#4ade80", "#f97316", "#eab308", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f43f5e", "#6366f1", "#84cc16", "#d946ef", "#fb923c", "#34d399",
  "#818cf8", "#f87171",
]

export function getColorCategoria(categoria: string): string {
  if (COLORES_CATEGORIA[categoria]) return COLORES_CATEGORIA[categoria]
  let hash = 0
  for (let i = 0; i < categoria.length; i++) hash = (hash * 31 + categoria.charCodeAt(i)) >>> 0
  return PALETA_CATEGORIA_PERSONALIZADA[hash % PALETA_CATEGORIA_PERSONALIZADA.length]
}
