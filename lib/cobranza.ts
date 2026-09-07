// ══════════════════════════════════════════════════════════════════════
// Centro de Cobranza — lógica pura (sin acceso a base de datos), reutilizable
// tanto en el módulo Cuentas por Cobrar como en la ficha del Cliente.
// ══════════════════════════════════════════════════════════════════════

export type NivelCobranza = 1 | 2 | 3

export const NIVELES_COBRANZA: { nivel: NivelCobranza; label: string; rango: string; diasMin: number; diasMax: number | null; color: string; bg: string; border: string; icon: string }[] = [
  { nivel: 1, label: "Nivel 1 - Amistoso",      rango: "Hasta 7 días de atraso",   diasMin: -Infinity, diasMax: 7,  color: "text-emerald-400", bg: "bg-emerald-500/8",  border: "border-emerald-500/20", icon: "🌱" },
  { nivel: 2, label: "Nivel 2 - Recordatorio",  rango: "8 a 20 días de atraso",    diasMin: 8,         diasMax: 20, color: "text-amber-400",   bg: "bg-amber-500/8",    border: "border-amber-500/20",   icon: "⏰" },
  { nivel: 3, label: "Nivel 3 - Último aviso",  rango: "Más de 20 días de atraso", diasMin: 21,        diasMax: null, color: "text-red-400",    bg: "bg-red-500/8",      border: "border-red-500/20",     icon: "⚠️" },
]

/** Nivel sugerido automáticamente según los días de atraso de la cuenta.
 * Si aún no está vencida (atraso negativo o cero), se sugiere Nivel 1. */
export function calcularNivelSugerido(diasAtraso: number): NivelCobranza {
  if (diasAtraso <= 7) return 1
  if (diasAtraso <= 20) return 2
  return 3
}

export const PLANTILLAS_DEFAULT: Record<NivelCobranza, string> = {
  1: `Hola {nombreCliente}.

Esperamos que estés muy bien.

Te recordamos que tienes un saldo pendiente de {montoPendiente} correspondiente a la venta del {fechaVenta}.

Si ya realizaste el pago puedes ignorar este mensaje.

Muchas gracias.
{nombreNegocio}`,

  2: `Hola {nombreCliente}.

Te escribimos nuevamente porque tu saldo pendiente de {montoPendiente} (venta del {fechaVenta}) sigue sin registrar pago, con {diasAtraso} días de atraso.

Nos encantaría ayudarte a regularizarlo esta semana. ¿Puedes contarnos cuándo podrías realizar el pago?

Gracias por tu comprensión.
{nombreNegocio}`,

  3: `Hola {nombreCliente}.

Nos comunicamos porque tu saldo pendiente de {montoPendiente} (venta del {fechaVenta}) lleva {diasAtraso} días de atraso y no hemos podido contactarte con éxito.

Te pedimos regularizar esta situación a la brevedad. Si ya realizaste el pago o tienes alguna dificultad, por favor contáctanos para conversarlo.

{nombreNegocio}`,
}

export type VariablesMensaje = {
  nombreCliente: string
  montoPendiente: string
  fechaVenta: string
  fechaVencimiento: string
  numeroDocumento: string
  nombreNegocio: string
  usuarioEnvia: string
  diasAtraso: string
}

/** Reemplaza todas las variables {nombreCliente}, {montoPendiente}, etc. en
 * una plantilla — nunca se escribe información manualmente. */
export function reemplazarVariables(plantilla: string, vars: VariablesMensaje): string {
  return plantilla
    .replaceAll("{nombreCliente}", vars.nombreCliente)
    .replaceAll("{montoPendiente}", vars.montoPendiente)
    .replaceAll("{fechaVenta}", vars.fechaVenta)
    .replaceAll("{fechaVencimiento}", vars.fechaVencimiento)
    .replaceAll("{numeroDocumento}", vars.numeroDocumento)
    .replaceAll("{nombreNegocio}", vars.nombreNegocio)
    .replaceAll("{usuarioEnvia}", vars.usuarioEnvia)
    .replaceAll("{diasAtraso}", vars.diasAtraso)
}

/** Link de WhatsApp con el mensaje precargado — solo falta presionar Enviar.
 * Acepta teléfonos con o sin formato; asume Chile (+56) si no trae código de país. */
export function generarLinkWhatsapp(telefono: string, mensaje: string): string {
  let limpio = telefono.replace(/[^\d+]/g, "")
  if (!limpio.startsWith("+")) {
    limpio = limpio.startsWith("56") ? `+${limpio}` : `+56${limpio.replace(/^0/, "")}`
  }
  return `https://wa.me/${limpio.replace("+", "")}?text=${encodeURIComponent(mensaje)}`
}

/** Abre Gmail directamente en el navegador (no el cliente de correo del
 * sistema operativo) con destinatario, asunto y cuerpo precargados — usa la
 * cuenta de Google con la que ya se esté logueado en el navegador, y no
 * depende de qué programa de correo tenga configurado el usuario por defecto. */
export function generarLinkGmail(destinatario: string, asunto: string, mensaje: string): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: destinatario, su: asunto, body: mensaje })
  return `https://mail.google.com/mail/?${params.toString()}`
}
