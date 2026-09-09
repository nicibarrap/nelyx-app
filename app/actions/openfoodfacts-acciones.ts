"use server"
// ══════════════════════════════════════════════════════════════════════
// Open Food Facts — base de datos pública y gratuita de productos, usada
// para autocompletar nombre (y categoría) al escanear un código de fábrica
// ya conocido. Gratis, sin llave de API — solo exige identificarse con un
// User-Agent propio en cada llamada (condición de sus términos de uso).
// Cubre sobre todo productos alimenticios de marca — no todo lo que un
// almacén vende, así que el resultado "no encontrado" es normal y esperado.
// ══════════════════════════════════════════════════════════════════════
import { sugerirCategoria } from "@/lib/sugerencias-producto"

const USER_AGENT = "Nelyx - Plataforma de gestion para almacenes chilenos - https://nelyx.vercel.app"

// Open Food Facts clasifica cada producto con sus propias etiquetas (en
// inglés, ej. "en:dairies") — mucho más confiable que adivinar la
// categoría solo por palabras del nombre, porque conocen el producto real
// aunque el nombre no diga explícitamente "yogurt" (ej. "Gold Lúcuma y
// Nueces" de Soprole — el nombre no lo dice, pero OFF sabe que es lácteo).
const MAPEO_CATEGORIA_OFF: [string[], string][] = [
  [["dairies", "yogurts", "fermented-milk-products", "cheeses", "milks", "creams", "butters"], "Lácteos"],
  [["meats", "beef", "porks", "chickens", "sausages", "cold-cuts", "poultries"], "Carnes"],
  [["fishes", "seafood", "shellfish"], "Carnes"],
  [["fresh-fruits", "fruits", "canned-fruits"], "Frutas"],
  [["fresh-vegetables", "vegetables", "canned-vegetables"], "Verduras"],
  [["breads", "bakery-products", "pastries", "viennoiseries"], "Panadería"],
  [["beverages", "sodas", "waters", "juices", "plant-based-beverages", "energy-drinks", "beers", "wines"], "Bebidas"],
  [["cleaning-products", "detergents", "dishwashing-products"], "Limpieza"],
]

function categoriaDesdeOFF(categoriesTags: string[] | undefined): string | null {
  if (!categoriesTags?.length) return null
  const tags = categoriesTags.map(t => t.replace(/^\w+:/, "").toLowerCase())
  for (const [claves, categoria] of MAPEO_CATEGORIA_OFF) {
    if (tags.some(t => claves.includes(t))) return categoria
  }
  return null
}

export type ProductoOFF = { nombre: string; categoria: string | null }

export async function buscarEnOpenFoodFacts(codigoBarras: string): Promise<ProductoOFF | null> {
  const codigo = codigoBarras.trim()
  if (!codigo) return null
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codigo)}.json`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000), // no dejar a alguien esperando eterno si la red anda lenta
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.status !== 1 || !data?.product) return null

    const nombreCrudo: string | undefined = data.product.product_name_es || data.product.product_name || data.product.generic_name_es || data.product.generic_name
    if (!nombreCrudo?.trim()) return null

    // 1° intento: la clasificación real de Open Food Facts. 2° intento
    // (respaldo): nuestro propio sistema de palabras clave sobre el
    // nombre, para cuando OFF no trae una categoría que reconozcamos.
    const categoria = categoriaDesdeOFF(data.product.categories_tags) ?? sugerirCategoria(nombreCrudo).categoria

    return { nombre: nombreCrudo.trim(), categoria }
  } catch {
    return null // timeout, sin internet, o código no encontrado — todos se tratan igual: "no se pudo autocompletar"
  }
}
