// ══════════════════════════════════════════════════════════════════════
// Clasificación de un producto a partir de las etiquetas de Open Food/
// Beauty/Products Facts (ej. "en:dairies") — mucho más confiable que
// adivinar la categoría o el emoji solo por palabras del nombre, porque
// esas etiquetas describen el producto real aunque el nombre no diga
// explícitamente "yogurt" (ej. "Gold Lúcuma y Nueces" de Soprole — el
// nombre no lo dice, pero la etiqueta sí sabe que es lácteo).
//
// El emoji va en la MISMA tabla que la categoría interna, no en una
// aparte: la etiqueta de OFF ya es más específica que nuestras 8
// categorías (ej. distingue "yogurts" de "cheeses", ambos "Lácteos" para
// nosotros) y ese detalle es justo lo que hace falta para un buen emoji.
// Se intenta de más específico a más genérico (una fila de arriba gana si
// el producto trae varias etiquetas que calzan). Reutiliza los mismos
// emojis que ya usan lib/emojis.ts y lib/emoji-ia.ts, para que da igual
// qué ruta reconoció el producto, el resultado se vea consistente.
//
// Vive aparte de app/actions/openfoodfacts-acciones.ts (y no ahí mismo)
// porque ese archivo es "use server" — solo puede exportar funciones
// async (ver su propio comentario sobre por qué ni siquiera un tipo se
// re-exporta desde ahí) — y esto es lógica pura, sin sesión ni red, que
// además conviene poder probar directo.
// ══════════════════════════════════════════════════════════════════════

const MAPEO_CLASIFICACION: [string[], string, string][] = [
  [["cookies", "biscuits", "sweet-biscuits", "sandwich-cookies", "wafers"], "Abarrotes", "🍪"],
  [["jams", "confitures", "fruit-jams", "marmalades", "fruit-spreads"], "Abarrotes", "🫙"],
  [["chocolates", "chocolate-candies", "filled-chocolates", "chocolate-bars"], "Abarrotes", "🍫"],
  [["candies", "sweets", "gums-and-candies", "lollipops"], "Abarrotes", "🍬"],
  [["ice-creams", "ice-cream", "sorbets"], "Abarrotes", "🍦"],
  [["chips-and-fries", "crisps", "salty-snacks", "appetizers"], "Abarrotes", "🍟"],
  [["breakfast-cereals", "cereals", "mueslis", "granolas"], "Abarrotes", "🌾"],
  [["coffees", "instant-coffees"], "Abarrotes", "☕"],
  [["teas", "infusions", "herbal-teas"], "Abarrotes", "🍵"],
  [["yogurts", "fermented-milk-products", "dairy-desserts", "fromage-frais"], "Lácteos", "🥛"],
  [["cheeses"], "Lácteos", "🧀"],
  [["dairies", "milks", "creams", "butters"], "Lácteos", "🥛"],
  [["sausages", "cold-cuts", "hams"], "Carnes", "🌭"],
  [["meats", "beef", "porks", "chickens", "poultries"], "Carnes", "🥩"],
  [["fishes", "seafood", "shellfish"], "Carnes", "🐟"],
  [["fresh-fruits", "fruits", "canned-fruits"], "Frutas", "🍎"],
  [["fresh-vegetables", "vegetables", "canned-vegetables"], "Verduras", "🥦"],
  [["breads"], "Panadería", "🍞"],
  [["bakery-products", "pastries", "viennoiseries", "cakes"], "Panadería", "🍰"],
  [["beers"], "Bebidas", "🍺"],
  [["wines"], "Bebidas", "🍷"],
  [["waters", "flavored-waters"], "Bebidas", "💧"],
  [["juices", "fruit-juices", "nectars"], "Bebidas", "🧃"],
  [["beverages", "sodas", "plant-based-beverages", "energy-drinks"], "Bebidas", "🥤"],
  [["cleaning-products", "detergents", "dishwashing-products"], "Limpieza", "🧴"],
  [["soaps", "shampoos", "hair-care", "skin-care"], "Limpieza", "🧼"],
  [["cosmetics", "perfumes"], "Limpieza", "🧴"],
]

export type ClasificacionProducto = { categoria: string | null; emoji: string | null }

/** `categoriesTags` llega tal cual lo entrega la API, ej. ["en:dairies",
 * "en:yogurts"] — se le saca el prefijo de idioma (el nuestro, da igual
 * cuál, porque las claves de MAPEO_CLASIFICACION siempre van en inglés). */
export function clasificarDesdeTags(categoriesTags: string[] | undefined): ClasificacionProducto {
  if (!categoriesTags?.length) return { categoria: null, emoji: null }
  const tags = categoriesTags.map(t => t.replace(/^\w+:/, "").toLowerCase())
  for (const [claves, categoria, emoji] of MAPEO_CLASIFICACION) {
    if (tags.some(t => claves.includes(t))) return { categoria, emoji }
  }
  return { categoria: null, emoji: null }
}
