import * as Sentry from "@sentry/nextjs"

// Respaldo con IA para getEmojiProducto() (lib/emojis.ts) — solo se llama
// cuando el nombre no calzó con ninguna palabra clave local (ej. "Tucapel
// Gran Selección" no dice "arroz" en ningún lado). Mismo patrón que
// lib/soporte-ia.ts: misma ANTHROPIC_API_KEY ya configurada en Vercel para
// las respuestas automáticas del chat de soporte — esto NO usa la cuenta
// personal de Claude.ai/Claude Code de nadie, es una cuenta de API aparte
// con su propia facturación. Con Haiku y una respuesta de un solo emoji,
// el costo por producto es una fracción de centavo.
//
// La respuesta se restringe a los mismos emojis que ya usa el sistema de
// palabras clave (ningún emoji "nuevo" o inconsistente) para que el
// resultado sea predecible — si Claude devuelve algo fuera de esta lista,
// se trata como un fallo y el llamador cae de vuelta al 📦 genérico.
const EMOJIS_PERMITIDOS = [
  "🥛", "🧀", "🥚", "🍞", "🍰", "🥤", "🧃", "💧", "🍺", "🍷", "🥃", "☕", "🍵",
  "🥩", "🍗", "🥓", "🐟", "🦐", "🌭", "🍎", "🍌", "🍊", "🍋", "🍇", "🍐", "🍉",
  "🍈", "🍓", "🍑", "🍍", "🥑", "🍅", "🥔", "🧅", "🧄", "🥕", "🥬", "🥒", "🌽",
  "🌶️", "🎃", "🍚", "🍝", "🫘", "🥜", "🌾", "🧂", "🫒", "🍫", "🍪", "🍬", "🍦",
  "🍟", "🚬", "🧴", "🧼", "🧻", "🧹", "🔋", "🔩", "🔨", "🎨", "🔌", "📏", "💡",
  "🐕", "🐈", "👟", "👕", "👖", "💊", "🥦", "🛒", "🧰", "📦",
]

const MODELO = "claude-haiku-4-5-20251001"

const SYSTEM_PROMPT = `Identificas el emoji que mejor representa un producto de almacén/supermercado chileno a partir de su nombre.

Responde ÚNICAMENTE con un emoji de esta lista, nada más — sin texto, sin explicación:
${EMOJIS_PERMITIDOS.join(" ")}

Si el nombre no da ninguna pista real de qué es (ej. solo una marca o un código), responde con 📦.`

/** Devuelve un emoji de EMOJIS_PERMITIDOS para el nombre dado, o null si no
 * se pudo (sin API key, error de red, o una respuesta fuera de la lista
 * permitida) — el llamador debe caer de vuelta al emoji genérico en ese caso. */
export async function sugerirEmojiIA(nombre: string): Promise<string | null> {
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
        max_tokens: 10,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: nombre }],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      Sentry.captureMessage("Emoji IA: la API de Anthropic respondió con error", {
        level: "error",
        extra: { status: res.status, body },
      })
      return null
    }

    const data = await res.json()
    const texto = (data?.content?.[0]?.text as string | undefined)?.trim()
    if (!texto) return null
    return EMOJIS_PERMITIDOS.find(e => texto.includes(e)) ?? null
  } catch (err) {
    Sentry.captureException(err, { extra: { etapa: "sugerirEmojiIA" } })
    return null
  }
}
