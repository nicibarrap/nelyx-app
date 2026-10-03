import { describe, it, expect } from "vitest"
import { detectarUrgencia } from "@/lib/soporte-logica"

describe("detectarUrgencia", () => {
  it("detecta palabras clave de urgencia sin importar mayúsculas", () => {
    expect(detectarUrgencia("Tengo un ERROR al guardar la venta")).toBe(true)
    expect(detectarUrgencia("La plataforma no funciona hace 10 minutos")).toBe(true)
    expect(detectarUrgencia("Es urgente, no puedo vender")).toBe(true)
  })

  it("no marca como urgente un mensaje normal", () => {
    expect(detectarUrgencia("¿Cómo agrego un producto nuevo?")).toBe(false)
    expect(detectarUrgencia("Gracias por la ayuda de ayer")).toBe(false)
  })
})
