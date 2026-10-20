// ══════════════════════════════════════════════════════════════════════
// Adaptador de TUU (Haulmer) — "Pago Remoto": el terminal físico queda en
// "modo integración" y Nelyx le manda la solicitud de cobro por HTTP, sin
// cable ni red local (confirmado contra la referencia OpenAPI publicada en
// developers.tuu.cl el 20-oct-2026).
//
// IMPORTANTE — lo que está confirmado vs. lo que falta validar con una
// máquina real:
// - Crear solicitud (POST /PaymentRequest/Create) y Consultar solicitud
//   (GET /PaymentRequest/{id}): endpoint, headers y forma del body/respuesta
//   confirmados contra la referencia OpenAPI oficial.
// - idempotencyKey: el texto de la documentación dice que es obligatoria,
//   pero el schema del body ("PaymentRequestWithoutIdempotencyDto") no la
//   incluye como propiedad — se interpretó que va en un header, igual que
//   X-Idempotency-Key en el adaptador de Mercado Pago. Falta confirmar con
//   un cobro real si el header tiene que llamarse distinto.
// - Amount: se asume que son pesos chilenos enteros (sin decimales) — el
//   ejemplo de la documentación (3000) calza con un monto típico en CLP,
//   no con centavos. Falta confirmar con un cobro real.
// - validarApiKeyTuu(): no existe un endpoint documentado para "probar"
//   una API Key sin cobrar nada, así que se aprovecha que GET
//   /PaymentRequest/{id} con un ID inexistente responde 401 si la key es
//   inválida y 404 si es válida (la solicitud simplemente no existe) — es
//   una inferencia razonable de una API multi-tenant bien diseñada, pero
//   no está confirmada contra el comportamiento real.
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
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      "X-Idempotency-Key": crypto.randomUUID(),
    },
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
