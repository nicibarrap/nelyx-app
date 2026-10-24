// ══════════════════════════════════════════════════════════════════════
// Adaptador de Mercado Pago Point — implementa las llamadas reales a su
// API (confirmadas contra la documentación oficial el 21-ago-2026:
// https://www.mercadopago.cl/developers/es/docs/mp-point/payment-processing).
//
// IMPORTANTE — lo que está confirmado vs. lo que falta validar con la
// máquina real:
// - listarTerminales() y crearOrden(): formato de endpoint, headers y
//   body confirmados contra la documentación oficial (type: "point",
//   expiration_time ISO 8601, config.point.terminal_id/print_on_terminal,
//   X-Idempotency-Key) — re-confirmado el 24-oct-2026, sin cambios.
// - consultarOrden(): el endpoint está confirmado. El mapeo de estados se
//   corrigió el 24-oct-2026 contra la tabla oficial de estados de Point
//   Chile (mercadopago.cl/developers/.../mp-point/resources/status-order-
//   transaction): el código anterior solo miraba
//   transactions.payments[0].status y buscaba "approved"/"rejected" —
//   valores que la API de Orders de Point NUNCA devuelve. Los estados
//   reales son, a nivel de ORDEN (data.status): created, at_terminal,
//   action_required (pendiente) · processed (aprobado, con status_detail
//   "accredited") · failed, expired, canceled (rechazado). Con el mapeo
//   viejo, un pago realmente rechazado/expirado en el terminal quedaba
//   como "desconocido" — ni aprobado ni rechazado — y Venta se quedaba
//   reintentando hasta agotar el timeout de 90s en vez de avisar al
//   cajero de inmediato. Sigue pendiente la prueba contra una terminal
//   real para confirmarlo en producción (ver nota en payment-processing.md).
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
      // CLP no tiene decimales — la API de Orders exige el monto como string
      // SIN decimales ("1000", no "1000.00"): confirmado en vivo contra el
      // sandbox el 24-oct-2026, "1000.00" responde 400 "does not match
      // pattern". Con .toFixed(2) (como estaba antes) la creación de la
      // orden fallaba siempre — este bug es anterior al de consultarOrden
      // y lo tapaba por completo: nunca se llegaba siquiera a crear un
      // cobro real.
      transactions: { payments: [{ amount: String(Math.round(montoCLP)) }] },
      config: { point: { terminal_id: terminalId, print_on_terminal: "no_ticket" } },
    }),
  })
  if (!res.ok) {
    // La API no siempre devuelve un "message" al nivel raíz — el formato
    // real de error es { errors: [{ code, message, details }] } (confirmado
    // en vivo). Con solo cuerpo?.message, el motivo real del rechazo se
    // perdía y siempre se mostraba el mensaje genérico.
    const cuerpo = await res.json().catch(() => null)
    const mensaje = cuerpo?.message ?? cuerpo?.errors?.[0]?.message
    throw new Error(mensaje ?? `No se pudo iniciar el cobro (${res.status})`)
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

  // El estado real de un cobro Point vive principalmente en la ORDEN
  // (data.status), no solo en transactions.payments[] — una orden puede
  // fallar/expirar/cancelarse sin que exista ningún intento de pago
  // (ej. el cliente nunca acercó la tarjeta). Se revisan ambos niveles
  // y se prioriza cualquier señal de estado final, sea cual sea.
  const estadoOrden: string | undefined = data?.status
  const estadoPago: string | undefined = data?.transactions?.payments?.[0]?.status
  const ESTADOS_APROBADOS = new Set(["processed", "approved", "accredited"])
  const ESTADOS_RECHAZADOS = new Set(["failed", "expired", "canceled", "cancelled", "rejected"])

  let estado: EstadoOrdenMP = "pendiente"
  if (ESTADOS_APROBADOS.has(estadoOrden ?? "") || ESTADOS_APROBADOS.has(estadoPago ?? "")) estado = "aprobado"
  else if (ESTADOS_RECHAZADOS.has(estadoOrden ?? "") || ESTADOS_RECHAZADOS.has(estadoPago ?? "")) estado = "rechazado"

  return { estado, crudo: data }
}
