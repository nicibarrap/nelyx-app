import * as Sentry from "@sentry/nextjs"
import { CONCEPTOS_APRENDE } from "@/lib/conceptos-aprende"

// Primera respuesta automática del chat de soporte, generada por IA en vez
// del texto fijo de siempre — pero con un límite claro: solo responde con
// lo que efectivamente sabe (los conceptos del Centro de Aprendizaje + una
// descripción de los módulos de la app, ambos abajo), nunca inventa datos
// de la cuenta específica del cliente ni promete acciones. Si no está
// seguro, responde literalmente "ESCALAR" y el código usa el mensaje
// estático de siempre — el mismo comportamiento de hoy, sin regresión.
//
// Groq (no Anthropic): es el mismo tipo de llamada — un modelo de lenguaje
// con un system prompt acotado — pero por API gratuita (sin costo, sin
// tarjeta), a cambio de un límite de mensajes/día más que suficiente para
// este uso. Groq expone una API compatible con el formato de OpenAI
// (chat completions), por eso el cuerpo de la petición y la respuesta se
// ven distintos a una llamada a Anthropic.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODELO = "llama-3.3-70b-versatile"

const BASE_CONOCIMIENTO = CONCEPTOS_APRENDE
  .map(c => `- ${c.titulo}: ${c.def} ${c.calculo}`)
  .join("\n")

const MODULOS_NELYX = `
- Resumen: panel principal con totales del día/mes, liquidez proyectada y alertas.
- Venta: registrar ventas (al contado o a crédito), con escáner de código de barras o búsqueda manual, venta por peso para productos sin unidad fija.
- Movimientos: historial de todo lo registrado (ventas, gastos, costos fijos, ingresos extra, retiros).
- Productos: catálogo con stock, costo promedio ponderado, lotes con fecha de vencimiento, ajuste de inventario.
- Clientes: ficha por cliente con segmentación automática (Nuevo, Valioso, Frecuente, En riesgo, Inactivo, Regular) y límite de crédito sugerido.
- Proveedores: ficha de cada proveedor con historial de compras.
- Deudas: lo que el negocio le debe a terceros (créditos, proveedores), con cuotas.
- Cuentas por Cobrar: lo que los clientes le deben al negocio, con Centro de Cobranza (mensajes automáticos por WhatsApp/email según días de atraso).
- Costos Fijos: gastos recurrentes mensuales (arriendo, luz, etc.), con recordatorios antes del vencimiento.
- Calendario: tareas, recordatorios y eventos.
- Reportes: gráfico de los últimos 12 meses, mapa de calor de mejores días/horas de venta, diagnóstico y oportunidades.
- Configuración: empleados con PIN y permisos por módulo, modo claro/oscuro, notificaciones.
- La app es instalable como aplicación (PWA) desde el navegador del celular.
`.trim()

const SYSTEM_PROMPT = `Eres el primer punto de contacto del chat de soporte de Nelyx, una plataforma chilena de gestión financiera e inventario para emprendedores y pequeños negocios (almacenes, ferias, locales).

Un cliente (dueño de un negocio que usa Nelyx) acaba de escribir su primer mensaje en un hilo de soporte nuevo. Tu trabajo es responder de inmediato, en español de Chile, cercano y directo — es un chat, no un correo formal. Máximo 3-4 frases.

SOLO puedes responder con lo que sabe de verdad: los conceptos financieros de abajo, y la descripción de los módulos de la app. NUNCA inventes información que no esté ahí, nunca prometas revisar o cambiar algo de la cuenta específica de este cliente (no tienes acceso a sus datos), y nunca dés consejo legal o tributario específico.

Responde ÚNICAMENTE con la palabra ESCALAR (nada más, sin explicación) si el mensaje es cualquiera de estos casos — no intentes adivinar ni responder algo parecido:
- Reporta un error, falla o algo que no funciona en algún módulo de la app.
- Pide una mejora, un cambio o una funcionalidad nueva que la plataforma no tiene hoy.
- Es un problema de pago o facturación de la suscripción de Nelyx.
- Necesita que alguien revise, cambie o acceda a datos específicos de SU cuenta (no puedes ver su cuenta).
- Cualquier otra cosa que no puedas responder con seguridad usando SOLO los conceptos y módulos de abajo.

Si el mensaje es una duda sobre cómo funciona la plataforma, qué significa un concepto financiero, o cómo se usa algún módulo — eso sí lo respondes tú, directo con la respuesta, sin repetir estas instrucciones ni decir "según mi información".

── Conceptos financieros que puedes explicar ──
${BASE_CONOCIMIENTO}

── Módulos de la app ──
${MODULOS_NELYX}`

export async function generarRespuestaIA(mensajeCliente: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 300,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: mensajeCliente },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      Sentry.captureMessage("Soporte IA: la API de Groq respondió con error", {
        level: "error",
        extra: { status: res.status, body },
      })
      return null
    }

    const data = await res.json()
    const texto = data?.choices?.[0]?.message?.content?.trim()
    if (!texto || texto === "ESCALAR") return null
    return texto
  } catch (err) {
    Sentry.captureException(err, { extra: { etapa: "generarRespuestaIA" } })
    return null
  }
}
