import * as Sentry from "@sentry/nextjs"

// Lee el comprobante que el cliente subió (imagen o PDF) y le pregunta a
// Claude cuánto dice que se transfirió — mismo patrón que lib/emoji-ia.ts
// y lib/soporte-ia.ts (misma ANTHROPIC_API_KEY ya configurada en Vercel,
// cuenta de API aparte, nunca la de Claude.ai/Claude Code de nadie).
//
// Esto NUNCA aprueba un pago por sí solo — es solo una ayuda visual para
// que el admin, al revisar, vea de un vistazo si el monto detectado calza
// con lo que se le cobraba ("✅ el monto coincide") en vez de tener que
// mirar la imagen y calcular a mano. La decisión de confirmar o rechazar
// sigue siendo 100% del admin.
const MODELO = "claude-haiku-5-5"

const SYSTEM_PROMPT = `Lees comprobantes de transferencias bancarias chilenas (capturas de pantalla de apps de bancos, o PDF).

Responde ÚNICAMENTE con el monto transferido, en pesos chilenos, solo dígitos sin puntos, comas ni símbolos (ejemplo: "10000" para $10.000).

Si la imagen no es un comprobante de transferencia, o no puedes identificar con confianza el monto transferido, responde exactamente "?" sin nada más.`

export type AnalisisComprobante = { montoDetectado: number }

function extraerMonto(texto: string | undefined): AnalisisComprobante | null {
  const limpio = texto?.trim()
  if (!limpio || limpio === "?") return null
  const soloDigitos = limpio.replace(/[^\d]/g, "")
  const montoDetectado = Number(soloDigitos)
  if (!soloDigitos || !Number.isFinite(montoDetectado) || montoDetectado <= 0) return null
  return { montoDetectado }
}

/**
 * Descarga el comprobante y le pide a Claude el monto transferido. Devuelve
 * null ante cualquier fallo (sin API key, el archivo no se pudo descargar,
 * error de red, respuesta fuera de formato) — el llamador simplemente no
 * muestra la ayuda visual en ese caso, nunca bloquea la revisión manual.
 */
export async function analizarComprobante(comprobanteUrl: string): Promise<AnalisisComprobante | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const resArchivo = await fetch(comprobanteUrl)
    if (!resArchivo.ok) return null
    const contentType = resArchivo.headers.get("content-type") ?? "image/png"
    const esPdf = contentType.includes("pdf")
    const base64 = Buffer.from(await resArchivo.arrayBuffer()).toString("base64")

    const contenidoArchivo = esPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: contentType, data: base64 } }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 20,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [contenidoArchivo, { type: "text", text: "¿Cuál es el monto transferido en este comprobante?" }] }],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      Sentry.captureMessage("Análisis de comprobante: la API de Anthropic respondió con error", {
        level: "error",
        extra: { status: res.status, body },
      })
      return null
    }

    const data = await res.json()
    return extraerMonto(data?.content?.[0]?.text)
  } catch (err) {
    Sentry.captureException(err, { extra: { etapa: "analizarComprobante" } })
    return null
  }
}
