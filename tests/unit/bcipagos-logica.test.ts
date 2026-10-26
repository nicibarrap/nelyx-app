import { describe, it, expect } from "vitest"
import { armarMensajeVenta, parsearCapaAnidada } from "@/lib/pagos/bcipagos"

describe("armarMensajeVenta", () => {
  it("arma el mensaje de 3 capas anidadas tal como lo documenta BCI Pagos", () => {
    const mensaje = armarMensajeVenta("600045", "1852370411", "302ec8d7-eb0f-466e-bea4-1387d054a054", 1500, "TKT001")
    expect(mensaje.appId).toBe("600045")
    expect(mensaje.sn).toBe("1852370411")
    expect(mensaje.id).toBe("302ec8d7-eb0f-466e-bea4-1387d054a054")
    expect(mensaje.type).toBe("com.pax.nebula.message.Payment")

    const capaControl = JSON.parse(mensaje.jsonData)
    expect(capaControl.packageName).toBe("cl.bci.bcipagos.dev")
    expect(capaControl.category).toBe("cl.transformapp.payment.sale")

    const capaParametros = JSON.parse(capaControl.jsonData)
    expect(capaParametros.saleAmount).toBe(1500)
    expect(capaParametros.ticket).toBe("TKT001")
  })

  it("redondea el monto — CLP no tiene decimales", () => {
    const mensaje = armarMensajeVenta("600045", "sn1", "id1", 1500.7, "TKT001")
    const capaParametros = JSON.parse(JSON.parse(mensaje.jsonData).jsonData)
    expect(capaParametros.saleAmount).toBe(1501)
  })
})

// Bug real que esto prueba: el ejemplo oficial de la respuesta de BCI Pagos
// trae un ":" sobrante antes de la llave de apertura del jsonData interno
// ("jsonData":":{...}") — sin este manejo, JSON.parse revienta en cualquier
// respuesta real que siga el mismo formato que su propia documentación.
describe("parsearCapaAnidada", () => {
  it("parsea JSON normal sin problema", () => {
    expect(parsearCapaAnidada('{"a":1}')).toEqual({ a: 1 })
  })

  it("saca el ':' sobrante del ejemplo oficial de BCI Pagos antes de parsear", () => {
    expect(parsearCapaAnidada(':{"responseCode":0,"responseMessage":"Success"}')).toEqual({ responseCode: 0, responseMessage: "Success" })
  })
})
