// ══════════════════════════════════════════════════════════════════════
// Adaptador de TUU (Haulmer) — "Pago Remoto": el terminal físico queda en
// "modo integración" y Nelyx le manda la solicitud de cobro por HTTP, sin
// cable ni red local.
//
// Re-confirmado el 24-oct-2026 contra el schema OpenAPI real publicado en
// developers.tuu.cl (no solo la tabla de la página general, que tiene
// algunas inconsistencias de mayúsculas/minúsculas con el schema real):
// - Body de creación (PaymentRequestWithoutIdempotencyDto): "Amount",
//   "Device", "Description" van tal cual en mayúscula — confirmado.
// - Amount: entero sin decimales, 100-99999999 — confirmado (el adaptador
//   de Mercado Pago sí tenía este bug con decimales; acá no).
// - Respuesta de ambos endpoints viene envuelta en { paymentRequest: {...} }
//   (confirmado con los ejemplos oficiales) — paymentRequestId/status se
//   leen de ahí, tal como ya hacía este archivo.
// - Los 6 estados (Pending/Sent/Canceled/Processing/Failed/Completed) y su
//   mapeo a pendiente/aprobado/rechazado — confirmados.
// - validarApiKeyTuu(): confirmado con los ejemplos oficiales de error — un
//   API Key inválido responde 401 (MR-000 "Not Authorized") y un ID de
//   solicitud inexistente con key válida responde 404 (MR-160 "Payment
//   Request doesn't exist"), sin importar si el ID existe o no.
// - X-Idempotency-Key (header): se sacó — NO es parte del contrato de este
//   endpoint. /PaymentRequest/Create es justamente el flujo "SIN
//   idempotencia"; la idempotencia real de TUU vive en un endpoint v2
//   aparte (POST /RemotePayment/v2/Create, con idempotencyKey en el BODY,
//   no en un header) que este adaptador no usa. El header viejo no rompía
//   nada (la API simplemente lo ignoraba), pero sugería una protección
//   contra cobros duplicados que en realidad no existe acá.
//
// Pendiente: nada de esto se ha probado todavía contra un terminal físico
// real — Haulmer no ofrece un ambiente de pruebas sin hardware.
// ══════════════════════════════════════════════════════════════════════

const BASE = "https://integrations.payment.haulmer.com"

/** ID improbable, solo para el truco de "probar conexión" — ver nota arriba. */
const ID_PRUEBA_CONEXION = 999999999

type ErrorTuu = { error: boolean; code?: string; message?: string }

async function leerError(res: Response, mensajePorDefecto: string): Promise<string> {
  const cuerpo: ErrorTuu | null = await res.json().catch(() => null)
  return cuerpo?.message ?? mensajePorDefecto
}

/** No hay forma de "probar" la API Key sin iniciar un cobro real, así que
 * se usa GET a un ID que no existe: 401 = key inválida, 404 = key válida
 * (la solicitud simplemente no existe). */
export async function validarApiKeyTuu(apiKey: string): Promise<true> {
  const res = await fetch(`${BASE}/PaymentRequest/${ID_PRUEBA_CONEXION}`, {
    headers: { "X-API-Key": apiKey },
  })
  if (res.status === 401) throw new Error("La API Key no es válida — revísala en tu Espacio de Trabajo de TUU")
  if (res.status === 404) return true
  throw new Error(await leerError(res, `TUU respondió con error (${res.status})`))
}

/** Le pide al terminal indicado (por su número de serie) que cobre un
 * monto. El cliente pone la tarjeta directo en la máquina. Devuelve el ID
 * de la solicitud creada, para poder consultar su resultado después. */
export async function crearSolicitudPagoTuu(apiKey: string, device: string, montoCLP: number, descripcion: string): Promise<{ paymentRequestId: number }> {
  const res = await fetch(`${BASE}/PaymentRequest/Create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ Amount: Math.round(montoCLP), Device: device, Description: descripcion }),
  })
  if (!res.ok) throw new Error(await leerError(res, `No se pudo iniciar el cobro (${res.status})`))
  const data = await res.json()
  return { paymentRequestId: data.paymentRequestId ?? data.paymentRequest?.paymentRequestId }
}

export type EstadoCobroTuu = "pendiente" | "aprobado" | "rechazado" | "desconocido"

/** Consulta el resultado de una solicitud ya creada. Se debe llamar
 * repetido cada 2-3 segundos desde que se crea la solicitud, hasta que
 * deje de estar "pendiente". */
export async function consultarSolicitudPagoTuu(apiKey: string, paymentRequestId: string): Promise<{ estado: EstadoCobroTuu; crudo: any }> {
  const res = await fetch(`${BASE}/PaymentRequest/${paymentRequestId}`, {
    headers: { "X-API-Key": apiKey },
  })
  if (!res.ok) throw new Error(await leerError(res, `No se pudo consultar el estado del cobro (${res.status})`))
  const data = await res.json()

  const estadoTuu: string | undefined = data?.paymentRequest?.status
  let estado: EstadoCobroTuu = "desconocido"
  if (!estadoTuu || estadoTuu === "Pending" || estadoTuu === "Sent" || estadoTuu === "Processing") estado = "pendiente"
  else if (estadoTuu === "Completed") estado = "aprobado"
  else if (estadoTuu === "Failed" || estadoTuu === "Canceled") estado = "rechazado"

  return { estado, crudo: data }
}
