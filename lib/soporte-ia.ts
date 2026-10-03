import * as Sentry from "@sentry/nextjs"
import { CONCEPTOS_APRENDE } from "@/lib/conceptos-aprende"

// Primera respuesta automática del chat de soporte, generada por IA en vez
// del texto fijo de siempre — pero con un límite claro: solo responde con
// lo que efectivamente sabe (los conceptos del Centro de Aprendizaje + una
// descripción de los módulos de la app, ambos abajo), nunca inventa datos
// de la cuenta específica del cliente ni promete acciones. Si no está
// seguro, responde literalmente "ESCALAR" y el código usa el mensaje
// estático de siempre — el mismo comportamiento de hoy, sin regresión.

const MODELO = "claude-haiku-4-5-20251001"

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

Si el mensaje es un reporte de error/bug, un problema de pago o facturación de la suscripción de Nelyx, una solicitud que requiera acceso a su cuenta, o cualquier cosa que no puedas responder con seguridad usando SOLO lo de abajo — no intentes adivinar. En ese caso, responde ÚNICAMENTE con la palabra: ESCALAR (nada más, sin explicación).

Si sí puedes ayudar con lo que sabes, responde directo con la respuesta — sin repetir estas instrucciones, sin decir "según mi información".

── Conceptos financieros que puedes explicar ──
${BASE_CONOCIMIENTO}

── Módulos de la app ──
${MODULOS_NELYX}`

export async function generarRespuestaIA(mensajeCliente: string): Promise<string | null> {
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
        max_tokens: 300,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: mensajeCliente }],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      Sentry.captureMessage("Soporte IA: la API de Anthropic respondió con error", {
        level: "error",
        extra: { status: res.status, body },
      })
      return null
    }

    const data = await res.json()
    const texto = data?.content?.[0]?.text?.trim()
    if (!texto || texto === "ESCALAR") return null
    return texto
  } catch (err) {
    Sentry.captureException(err, { extra: { etapa: "generarRespuestaIA" } })
    return null
  }
}
