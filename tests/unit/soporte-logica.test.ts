import { describe, it, expect } from "vitest"
import { detectarUrgencia, necesitaRecordatorio } from "@/lib/soporte-logica"

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

describe("necesitaRecordatorio", () => {
  it("no hace falta si el último mensaje es de soporte", () => {
    const ahora = new Date("2026-01-01T12:20:00Z")
    expect(necesitaRecordatorio({ ultimoMensajeDe: "soporte", ultimoMensajeAt: new Date("2026-01-01T12:00:00Z"), recordatorioEnviado: false }, ahora)).toBe(false)
  })

  it("no hace falta si ya se mandó un recordatorio para esta espera", () => {
    const ahora = new Date("2026-01-01T12:20:00Z")
    expect(necesitaRecordatorio({ ultimoMensajeDe: "cliente", ultimoMensajeAt: new Date("2026-01-01T12:00:00Z"), recordatorioEnviado: true }, ahora)).toBe(false)
  })

  it("no hace falta si todavía no pasan 10 minutos", () => {
    const ahora = new Date("2026-01-01T12:05:00Z")
    expect(necesitaRecordatorio({ ultimoMensajeDe: "cliente", ultimoMensajeAt: new Date("2026-01-01T12:00:00Z"), recordatorioEnviado: false }, ahora)).toBe(false)
  })

  it("hace falta apenas pasan 10 minutos sin respuesta de soporte", () => {
    const ahora = new Date("2026-01-01T12:10:00Z")
    expect(necesitaRecordatorio({ ultimoMensajeDe: "cliente", ultimoMensajeAt: new Date("2026-01-01T12:00:00Z"), recordatorioEnviado: false }, ahora)).toBe(true)
  })
})
