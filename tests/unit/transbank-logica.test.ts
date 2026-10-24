import { describe, it, expect } from "vitest"
import { etiquetarPuerto } from "@/lib/pagos/transbank-cliente"

// getPorts() del SDK devuelve object[] genérico (no documentado) — esto
// prueba que, sea cual sea el nombre de campo real que use el Agente,
// siempre queda algo legible para mostrar en el selector de Configuración.
describe("etiquetarPuerto", () => {
  it("usa 'path' cuando existe (convención de la librería serialport)", () => {
    expect(etiquetarPuerto({ path: "/dev/tty.usbserial-1" })).toBe("/dev/tty.usbserial-1")
  })

  it("usa 'comName' cuando no hay 'path' (convención antigua de Windows)", () => {
    expect(etiquetarPuerto({ comName: "COM3" })).toBe("COM3")
  })

  it("usa 'port' cuando no hay 'path' ni 'comName'", () => {
    expect(etiquetarPuerto({ port: "COM4" })).toBe("COM4")
  })

  it("usa 'name' cuando no hay ninguno de los anteriores", () => {
    expect(etiquetarPuerto({ name: "USB Serial" })).toBe("USB Serial")
  })

  it("cae a JSON.stringify cuando el objeto no tiene ningún campo conocido", () => {
    expect(etiquetarPuerto({ algoRaro: 123 })).toBe(JSON.stringify({ algoRaro: 123 }))
  })
})
