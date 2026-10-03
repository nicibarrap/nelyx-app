// Piezas puras del chat de soporte — separadas para poder probarlas sin
// tocar la DB, mismo patrón que lib/auth-logica.ts.

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

export const MENSAJE_AUTO_RESPUESTA =
  "¡Gracias por escribirnos! Un miembro de Soporte Nelyx va a responderte en breve. Mientras tanto, cuéntanos con el mayor detalle posible qué necesitas — así podemos ayudarte más rápido."

// Mensaje de cierre al marcar una conversación como resuelta (ver
// marcarConversacionResuelta en soporte-acciones.ts) — antes también se
// mandaba solo con un cron cada 4 min sin respuesta de soporte; ese disparo
// automático se sacó, ahora es solo manual.
export const MENSAJE_RECORDATORIO =
  "Esperamos haber solucionado tu problema 🙂 Si tienes cualquier otra duda, quedamos atentos."
