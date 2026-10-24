import { describe, it, expect, vi, afterEach } from "vitest"
import { consultarOrdenMercadoPago } from "@/lib/pagos/mercadopago"

// Bug real que esto prueba: la versión anterior solo miraba
// transactions.payments[0].status buscando "approved"/"rejected" — valores
// que la API de Orders de Point (confirmada contra la documentación oficial
// de Mercado Pago Point Chile) nunca devuelve. Una orden fallida, expirada o
// cancelada quedaba sin mapear ("desconocido"), y Venta se quedaba
// reintentando hasta agotar el timeout de 90s en vez de avisar de inmediato.
function mockFetchOrden(cuerpo: unknown) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) } as Response)))
}

afterEach(() => { vi.unstubAllGlobals() })

describe("consultarOrdenMercadoPago", () => {
  it("una orden 'processed' (acreditada) se lee como aprobada", async () => {
    mockFetchOrden({ status: "processed", status_detail: "accredited", transactions: { payments: [{ status: "processed" }] } })
    const { estado } = await consultarOrdenMercadoPago("token", "orden1")
    expect(estado).toBe("aprobado")
  })

  it("una orden 'failed' (rechazada en el terminal) se lee como rechazada, no 'desconocido'", async () => {
    mockFetchOrden({ status: "failed", transactions: { payments: [] } })
    const { estado } = await consultarOrdenMercadoPago("token", "orden2")
    expect(estado).toBe("rechazado")
  })

  it("una orden 'expired' (el cliente nunca pagó a tiempo) se lee como rechazada", async () => {
    mockFetchOrden({ status: "expired", transactions: { payments: [] } })
    const { estado } = await consultarOrdenMercadoPago("token", "orden3")
    expect(estado).toBe("rechazado")
  })

  it("una orden 'canceled' se lee como rechazada", async () => {
    mockFetchOrden({ status: "canceled", transactions: { payments: [] } })
    const { estado } = await consultarOrdenMercadoPago("token", "orden4")
    expect(estado).toBe("rechazado")
  })

  it("una orden recién creada o esperando al cliente en el terminal sigue pendiente", async () => {
    mockFetchOrden({ status: "at_terminal", transactions: { payments: [] } })
    const { estado } = await consultarOrdenMercadoPago("token", "orden5")
    expect(estado).toBe("pendiente")
  })
})
