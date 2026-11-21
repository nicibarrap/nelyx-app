"use server"
// ══════════════════════════════════════════════════════════════════════
// Open Food Facts, Open Beauty Facts y Open Products Facts — mismo
// proyecto, misma API, gratis y sin llave (solo exigen identificarse con
// un User-Agent propio, condición de sus términos de uso), usadas para
// autocompletar nombre y categoría al escanear un código de barras ya
// conocido. OFF cubre alimentos, OBF cosmética/cuidado personal, y OPF el
// resto (limpieza, varios) — se consultan en ese orden y se usa la primera
// que reconozca el código. Ninguna cubre todo lo que vende un almacén
// chileno, así que el resultado "no encontrado" sigue siendo normal.
// ══════════════════════════════════════════════════════════════════════
import { auth } from "@/lib/auth"
import { sugerirCategoria } from "@/lib/sugerencias-producto"
import { clasificarDesdeTags } from "@/lib/clasificacion-openfoodfacts"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"

const USER_AGENT = "Nelyx - Plataforma de gestion para almacenes chilenos - https://nelyx.vercel.app"

const FUENTES = [
  "https://world.openfoodfacts.org",
  "https://world.openbeautyfacts.org",
  "https://world.openproductsfacts.org",
]

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

export type ProductoEncontrado = { nombre: string; categoria: string | null; emoji: string | null }

async function buscarEnFuente(base: string, codigo: string): Promise<ProductoEncontrado | null> {
  try {
    const res = await fetch(`${base}/api/v2/product/${encodeURIComponent(codigo)}.json`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000), // no dejar a alguien esperando eterno si la red anda lenta
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.status !== 1 || !data?.product) return null

    const nombreCrudo: string | undefined = data.product.product_name_es || data.product.product_name || data.product.generic_name_es || data.product.generic_name
    if (!nombreCrudo?.trim()) return null

    // Estas bases a veces solo tienen cargado el nombre de la variante/sabor,
    // sin el nombre genérico del producto ni la marca (ej. "Gold Lúcuma y
    // Nueces" en vez de "Soprole Gold Lúcuma y Nueces", o "Tradición" en vez
    // de "Nescafé Tradición") — si la marca no aparece ya en el nombre, se la
    // antepone para que el producto quede identificable.
    const primeraMarca = (data.product.brands as string | undefined)?.split(",")[0]?.trim()
    const nombre = primeraMarca && !normalizar(nombreCrudo).includes(normalizar(primeraMarca))
      ? `${primeraMarca} ${nombreCrudo.trim()}`
      : nombreCrudo.trim()

    // 1° intento: la clasificación real de la fuente (trae también el
    // emoji, ver MAPEO_CLASIFICACION). 2° intento (respaldo): nuestro propio
    // sistema de palabras clave sobre el nombre, para cuando no trae una
    // categoría que reconozcamos — ahí no hay emoji todavía, lo resuelve
    // getEmojiProducto() en el cliente a partir del nombre/categoría.
    const clasificacion = clasificarDesdeTags(data.product.categories_tags)
    const categoria = clasificacion.categoria ?? sugerirCategoria(nombre).categoria

    return { nombre, categoria, emoji: clasificacion.emoji }
  } catch {
    return null // timeout, sin internet, o código no encontrado — todos se tratan igual: "no se pudo autocompletar"
  }
}

export async function buscarProductoPorCodigoBarras(codigoBarras: string): Promise<ProductoEncontrado | null> {
  // Sin esto, esta Server Action quedaba como un proxy abierto: cualquiera
  // en internet (sin cuenta en Nelyx) podía llamarla directo para hacer
  // consultas gratis a Open Food Facts/Open Beauty Facts/Open Products
  // Facts a través del servidor de Nelyx, sin límite — arriesgando que esos
  // servicios terminen bloqueando el User-Agent/IP de Nelyx por volumen
  // ajeno al uso real de la app.
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  await verificarCuentaActivaOExpulsar(session)
  const codigo = codigoBarras.trim()
  if (!codigo) return null
  for (const base of FUENTES) {
    const resultado = await buscarEnFuente(base, codigo)
    if (resultado) return resultado
  }
  return null
}
