import { describe, it, expect, vi, afterEach } from "vitest"
import { consultarOrdenMercadoPago, crearOrdenMercadoPago } from "@/lib/pagos/mercadopago"

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

// Bug real, confirmado en vivo contra el sandbox de Mercado Pago el
// 24-oct-2026: CLP no tiene decimales, y la API de Orders exige el monto
// como string SIN decimales ("1000"). La versión anterior mandaba
// montoCLP.toFixed(2) ("1000.00"), que la API rechaza con 400 "does not
// match pattern" — la creación de la orden fallaba SIEMPRE, antes incluso
// de llegar al bug de mapeo de estados de arriba.
describe("crearOrdenMercadoPago", () => {
  it("manda el monto como string sin decimales (CLP no tiene centavos)", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "orden-x" }) } as Response))
    vi.stubGlobal("fetch", fetchMock)

    await crearOrdenMercadoPago("token", "terminal-1", 1500, "ref-1")

    const [, opciones] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(opciones.body as string)
    expect(body.transactions.payments[0].amount).toBe("1500")
  })

  it("si la API rechaza el pedido, muestra el motivo real (errors[0].message), no solo el genérico", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: false, status: 400,
      json: () => Promise.resolve({ errors: [{ code: "property_value", message: "'$.transactions.payments[0].amount' - does not match pattern" }] }),
    } as Response)))

    await expect(crearOrdenMercadoPago("token", "terminal-1", 1500, "ref-1"))
      .rejects.toThrow(/does not match pattern/)
  })
})
