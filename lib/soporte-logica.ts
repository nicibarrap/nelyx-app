// Piezas puras del chat de soporte — separadas para poder probarlas sin
// tocar la DB, mismo patrón que lib/auth-logica.ts.

const MINUTOS_RECORDATORIO = 10

const PALABRAS_URGENTES = [
  "error", "no funciona", "no anda", "no puedo", "no me deja", "caído", "caido",
  "bug", "falla", "fallo", "perdí", "perdi", "urgente", "no carga", "se cayó", "se cayo",
]

/** ¿El mensaje del cliente suena urgente? Detección simple por palabras
 * clave — barato de calcular y suficiente para priorizar visualmente en
 * el inbox de soporte, sin depender de una llamada a un modelo externo. */
export function detectarUrgencia(texto: string): boolean {
  const normalizado = texto.toLowerCase()
  return PALABRAS_URGENTES.some(p => normalizado.includes(p))
}

/** ¿Corresponde mandar el recordatorio automático de "¿sigues ahí?"? Solo
 * si el último mensaje es del cliente, pasaron ≥10 minutos, y no se había
 * mandado ya uno para esta misma espera. */
export function necesitaRecordatorio(
  conv: { ultimoMensajeDe: string; ultimoMensajeAt: Date; recordatorioEnviado: boolean },
  ahora: Date = new Date()
): boolean {
  if (conv.ultimoMensajeDe !== "cliente" || conv.recordatorioEnviado) return false
  const minutosPasados = (ahora.getTime() - conv.ultimoMensajeAt.getTime()) / 60000
  return minutosPasados >= MINUTOS_RECORDATORIO
}

export const MENSAJE_AUTO_RESPUESTA =
  "¡Gracias por escribirnos! Un miembro de Soporte Nelyx va a responderte en breve. Mientras tanto, cuéntanos con el mayor detalle posible qué necesitas — así podemos ayudarte más rápido."

export const MENSAJE_RECORDATORIO =
  "Seguimos por acá — si todavía necesitas ayuda, cuéntanos y te respondemos apenas podamos 🙂"
