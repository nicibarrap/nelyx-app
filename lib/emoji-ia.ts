import * as Sentry from "@sentry/nextjs"

// Respaldo con IA para getEmojiProducto()/sugerirCategoria() (lib/emojis.ts,
// lib/sugerencias-producto.ts) — solo se llama cuando el nombre no calzó con
// ninguna palabra clave local (ej. "Tucapel Gran Selección" no dice "arroz"
// en ningún lado). Mismo patrón que lib/soporte-ia.ts: misma
// ANTHROPIC_API_KEY ya configurada en Vercel para las respuestas automáticas
// del chat de soporte — esto NO usa la cuenta personal de Claude.ai/Claude
// Code de nadie, es una cuenta de API aparte con su propia facturación. Con
// Haiku y una respuesta de pocas palabras, el costo por producto es una
// fracción de centavo (bien por debajo de $1 CLP).
//
// Devuelve emoji y categoría JUNTOS, en una sola llamada — pedirlos por
// separado costaría el doble sin ninguna ganancia real (ambos se deciden
// con la misma información: el nombre del producto).
//
// Ambas respuestas se restringen a listas fijas (los mismos emojis que ya
// usa el sistema de palabras clave, y las mismas categorías internas) para
// que el resultado sea predecible — si Claude devuelve algo fuera de esas
// listas, se trata como un fallo y el llamador cae de vuelta a lo genérico.
const EMOJIS_PERMITIDOS = [
  "🥛", "🧀", "🥚", "🍞", "🍰", "🥤", "🧃", "💧", "🍺", "🍷", "🥃", "☕", "🍵",
  "🥩", "🍗", "🥓", "🐟", "🦐", "🌭", "🍎", "🍌", "🍊", "🍋", "🍇", "🍐", "🍉",
  "🍈", "🍓", "🍑", "🍍", "🥑", "🍅", "🥔", "🧅", "🧄", "🥕", "🥬", "🥒", "🌽",
  "🌶️", "🎃", "🍚", "🍝", "🫘", "🥜", "🌾", "🧂", "🫒", "🍫", "🍪", "🍬", "🍦", "🫙",
  "🍟", "🚬", "🧴", "🧼", "🧻", "🧹", "🔋", "🔩", "🔨", "🎨", "🔌", "📏", "💡",
  "🐕", "🐈", "👟", "👕", "👖", "💊", "🥦", "🛒", "🧰", "📦",
]

// Mismas 10 categorías internas que EMOJI_POR_CATEGORIA en lib/emojis.ts y
// que ya usa el resto de la app (ver prisma schema / formularios de
// producto) — nunca una categoría inventada que no calce con ningún filtro.
const CATEGORIAS_PERMITIDAS = [
  "Lácteos", "Carnes", "Verduras", "Frutas", "Panadería",
  "Bebidas", "Abarrotes", "Limpieza", "Accesorios", "Otros",
]

const MODELO = "claude-haiku-5-5"

const SYSTEM_PROMPT = `Identificas el emoji y la categoría que mejor representan un producto de almacén/supermercado chileno a partir de su nombre.

Responde ÚNICAMENTE en el formato "emoji|categoría", sin texto adicional antes ni después.

El emoji debe ser exactamente uno de esta lista:
${EMOJIS_PERMITIDOS.join(" ")}

La categoría debe ser exactamente una de esta lista (tal cual está escrita):
${CATEGORIAS_PERMITIDAS.join(", ")}

Si el nombre no da ninguna pista real de qué es (ej. solo una marca o un código), responde "📦|Otros".`

export type ClasificacionIA = { emoji: string; categoria: string }

/** Devuelve {emoji, categoria} para el nombre dado (ambos de las listas
 * permitidas), o null si no se pudo (sin API key, error de red, o una
 * respuesta fuera de formato/listas permitidas) — el llamador debe caer de
 * vuelta a lo genérico en ese caso, nunca bloquear el flujo por esto. */
export async function sugerirClasificacionIA(nombre: string): Promise<ClasificacionIA | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 20,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: nombre }],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      Sentry.captureMessage("Clasificación IA: la API de Anthropic respondió con error", {
        level: "error",
        extra: { status: res.status, body },
      })
      return null
    }

    const data = await res.json()
    const texto = (data?.content?.[0]?.text as string | undefined)?.trim()
    if (!texto) return null

    const [parteEmoji, parteCategoria] = texto.split("|").map(p => p?.trim())
    const emoji = parteEmoji ? EMOJIS_PERMITIDOS.find(e => parteEmoji.includes(e)) : undefined
    const categoria = parteCategoria ? CATEGORIAS_PERMITIDAS.find(c => c === parteCategoria) : undefined
    if (!emoji || !categoria) return null
    return { emoji, categoria }
  } catch (err) {
    Sentry.captureException(err, { extra: { etapa: "sugerirClasificacionIA" } })
    return null
  }
}
