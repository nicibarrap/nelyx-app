// ══════════════════════════════════════════════════════════════════════
// Adaptador de Mercado Pago Point — implementa las llamadas reales a su
// API (confirmadas contra la documentación oficial el 21-ago-2026:
// https://www.mercadopago.cl/developers/es/docs/mp-point/payment-processing).
//
// IMPORTANTE — lo que está confirmado vs. lo que falta validar con la
// máquina real:
// - listarTerminales() y crearOrden(): formato de endpoint, headers y
//   body confirmados contra la documentación oficial.
// - consultarOrden(): el endpoint en sí está confirmado, pero el campo
//   exacto que indica "aprobado" vs "rechazado" dentro de la respuesta
//   (dentro de transactions.payments[]) hay que verificarlo con una
//   transacción real — la documentación no mostró ese detalle completo.
//   Dejé la función devolviendo la respuesta cruda además de mi mejor
//   estimación, para poder ajustarlo apenas se pruebe en el local mañana.
// ══════════════════════════════════════════════════════════════════════

const BASE = "https://api.mercadopago.com"

export type TerminalMP = {
  id: string
  posId: number
  storeId: string
  operatingMode: "PDV" | "STANDALONE" | "UNDEFINED"
}

/** Trae las terminales asociadas a la cuenta — se usa al conectar, para que
 * el dueño elija de una lista en vez de escribir el ID de memoria. */
export async function listarTerminalesMercadoPago(accessToken: string): Promise<TerminalMP[]> {
  const res = await fetch(`${BASE}/terminals/v1/list?limit=50`, {
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error("El Access Token no es válido — revísalo en tu panel de Mercado Pago Developers")
    throw new Error(`Mercado Pago respondió con error (${res.status})`)
  }
  const data = await res.json()
  const terminales = data?.data?.terminals ?? []
  return terminales.map((t: any) => ({
    id: t.id, posId: t.pos_id, storeId: t.store_id, operatingMode: t.operating_mode,
  }))
}

/** Le pide a la terminal indicada que cobre un monto — el cliente pone la
 * tarjeta y la clave directo en la máquina. Devuelve el ID de la orden
 * creada, para poder consultar su resultado después. */
export async function crearOrdenMercadoPago(accessToken: string, terminalId: string, montoCLP: number, referenciaExterna: string): Promise<{ orderId: string }> {
  const res = await fetch(`${BASE}/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      type: "point",
      external_reference: referenciaExterna,
      expiration_time: "PT5M", // 5 minutos para que el cliente pague, antes de que expire sola
      transactions: { payments: [{ amount: montoCLP.toFixed(2) }] },
      config: { point: { terminal_id: terminalId, print_on_terminal: "no_ticket" } },
    }),
  })
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => null)
    throw new Error(cuerpo?.message ?? `No se pudo iniciar el cobro (${res.status})`)
  }
  const data = await res.json()
  return { orderId: data.id }
}

export type EstadoOrdenMP = "pendiente" | "aprobado" | "rechazado" | "desconocido"

/** Consulta el resultado de una orden ya creada. Se debe llamar repetido
 * cada 2-3 segundos desde que se crea la orden, hasta que deje de estar
 * "pendiente" (el cliente tarda unos segundos en poner la tarjeta). */
export async function consultarOrdenMercadoPago(accessToken: string, orderId: string): Promise<{ estado: EstadoOrdenMP; crudo: any }> {
  const res = await fetch(`${BASE}/v1/orders/${orderId}`, {
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`No se pudo consultar el estado del cobro (${res.status})`)
  const data = await res.json()

  // Mejor estimación del estado — verificar y ajustar con una transacción
  // real mañana si no coincide exactamente.
  const estadoPago = data?.transactions?.payments?.[0]?.status
  let estado: EstadoOrdenMP = "desconocido"
  if (!estadoPago || estadoPago === "pending" || estadoPago === "in_process") estado = "pendiente"
  else if (estadoPago === "approved" || estadoPago === "processed") estado = "aprobado"
  else if (estadoPago === "rejected" || estadoPago === "cancelled") estado = "rechazado"

  return { estado, crudo: data }
}
