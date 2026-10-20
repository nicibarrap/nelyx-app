import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import * as Sentry from "@sentry/nextjs"

// SumUp llama acá cuando un cobro de lector (Reader Checkout) termina —
// confirmado contra el OpenAPI spec oficial de SumUp: el payload sigue el
// schema `ReaderCheckoutStatusChange`. No hay ningún mecanismo de firma
// documentado para este webhook (a diferencia de otros productos de SumUp
// como Open Banking), así que el `t` en la query string (un token random
// generado en iniciarCobroMaquina, ver app/actions/pagos-acciones.ts) es la
// única defensa real contra que alguien forje un "pago aprobado" — nunca
// viajó al navegador del vendedor, solo a SumUp dentro de `return_url`.
//
// Forma real del payload (confirmada contra el spec, no solo supuesta):
// {
//   "id": "<uuid>", "event_type": "<string>", "timestamp": "<date-time>",
//   "payload": {
//     "client_transaction_id": "<uuid>",  // la misma que devolvió el POST .../checkout
//     "merchant_code": "<string>",
//     "status": "successful" | "failed",
//     "transaction_id": "<uuid>"          // deprecado por SumUp a favor de client_transaction_id
//   }
// }
type ReaderCheckoutStatusChange = {
  payload?: {
    client_transaction_id?: string
    merchant_code?: string
    status?: string
  }
}

export async function POST(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("t")
    if (!token) return NextResponse.json({ error: "Falta token" }, { status: 404 })

    const body: ReaderCheckoutStatusChange | null = await req.json().catch(() => null)
    const payload = body?.payload

    // Mismo código de error (404) tanto si el token no existe como si los
    // datos no calzan — a propósito, para no darle a quien llame información
    // de cuál de los dos casos fue (¿token inválido? ¿datos no coinciden?).
    // El detalle sí queda en el log del servidor para poder depurarlo.
    const cobro = await db.cobroSumup.findUnique({ where: { webhookToken: token } })
    if (!cobro) {
      console.error("Webhook SumUp: token desconocido", { token })
      return NextResponse.json({ error: "No encontrado" }, { status: 404 })
    }
    if (!payload?.client_transaction_id || !payload?.status) {
      console.error("Webhook SumUp: payload sin la forma esperada", { cobroId: cobro.id, body })
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
    }
    if (payload.client_transaction_id !== cobro.clientTransactionId || payload.merchant_code !== cobro.merchantCode) {
      console.error("Webhook SumUp: client_transaction_id o merchant_code no coinciden con lo esperado", { cobroId: cobro.id, recibido: payload })
      return NextResponse.json({ error: "No encontrado" }, { status: 404 })
    }

    // Idempotente — si ya se resolvió (por una entrega repetida de SumUp,
    // algo normal en webhooks), no se vuelve a escribir. Evita que una
    // segunda entrega fuera de orden revierta un estado ya definitivo.
    if (cobro.estado !== "pendiente") return NextResponse.json({ ok: true })

    const estado = payload.status === "successful" ? "aprobado" : payload.status === "failed" ? "rechazado" : null
    if (!estado) {
      console.error("Webhook SumUp: status desconocido", { cobroId: cobro.id, status: payload.status })
      return NextResponse.json({ ok: true }) // se deja en "pendiente" — un status nuevo no documentado no debe tumbar el webhook
    }

    await db.cobroSumup.update({ where: { id: cobro.id }, data: { estado } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Error en webhook de SumUp:", err)
    Sentry.captureException(err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
