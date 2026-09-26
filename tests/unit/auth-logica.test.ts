import { describe, it, expect } from "vitest"
import { estaBloqueado, calcularNuevoEstadoTrasFallo, necesitaLimpiarEstado, ipDeRequest, tokenResetValido } from "@/lib/auth-logica"

// Estos tests cubren exactamente la lógica que falló hoy en producción:
// el contador de intentos fallidos y el cálculo del bloqueo de 15 minutos.
describe("estaBloqueado", () => {
  it("no está bloqueado si nunca se fijó bloqueadoHastaPin", () => {
    expect(estaBloqueado({ bloqueadoHastaPin: null })).toBe(false)
  })

  it("está bloqueado si la fecha de bloqueo es futura", () => {
    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000)
    expect(estaBloqueado({ bloqueadoHastaPin: enUnaHora })).toBe(true)
  })

  it("ya no está bloqueado si la fecha de bloqueo ya pasó", () => {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000)
    expect(estaBloqueado({ bloqueadoHastaPin: haceUnaHora })).toBe(false)
  })
})

describe("calcularNuevoEstadoTrasFallo", () => {
  it("solo incrementa el contador en los primeros 4 intentos, sin bloquear", () => {
    expect(calcularNuevoEstadoTrasFallo(0)).toEqual({ intentosFallidosPin: 1, bloqueadoHastaPin: null })
    expect(calcularNuevoEstadoTrasFallo(3)).toEqual({ intentosFallidosPin: 4, bloqueadoHastaPin: null })
  })

  it("bloquea exactamente en el 5to intento fallido, y reinicia el contador a 0", () => {
    const resultado = calcularNuevoEstadoTrasFallo(4)
    expect(resultado.intentosFallidosPin).toBe(0)
    expect(resultado.bloqueadoHastaPin).not.toBeNull()
  })

  it("el bloqueo dura 15 minutos desde 'ahora'", () => {
    const ahora = new Date("2026-01-01T12:00:00Z")
    const resultado = calcularNuevoEstadoTrasFallo(4, ahora)
    expect(resultado.bloqueadoHastaPin?.toISOString()).toBe("2026-01-01T12:15:00.000Z")
  })
})

describe("necesitaLimpiarEstado", () => {
  it("no hace falta limpiar si ya estaba limpio", () => {
    expect(necesitaLimpiarEstado({ intentosFallidosPin: 0, bloqueadoHastaPin: null })).toBe(false)
  })

  it("hace falta limpiar si quedaban intentos fallidos previos", () => {
    expect(necesitaLimpiarEstado({ intentosFallidosPin: 2, bloqueadoHastaPin: null })).toBe(true)
  })

  it("hace falta limpiar si quedaba un bloqueo (aunque ya haya expirado)", () => {
    expect(necesitaLimpiarEstado({ intentosFallidosPin: 0, bloqueadoHastaPin: new Date("2020-01-01") })).toBe(true)
  })
})

describe("ipDeRequest", () => {
  it("toma la primera IP de x-forwarded-for cuando hay varias (proxy encadenado)", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })
    expect(ipDeRequest(req)).toBe("1.2.3.4")
  })

  it("cae a x-real-ip si no hay x-forwarded-for", () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } })
    expect(ipDeRequest(req)).toBe("9.9.9.9")
  })

  it("devuelve 'desconocida' sin ningún header ni request", () => {
    expect(ipDeRequest(undefined)).toBe("desconocida")
  })
})

describe("tokenResetValido", () => {
  it("es válido si no se usó y todavía no expira", () => {
    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000)
    expect(tokenResetValido({ expiresAt: enUnaHora, usedAt: null })).toBe(true)
  })

  it("no es válido si ya se usó, aunque no haya expirado", () => {
    const enUnaHora = new Date(Date.now() + 60 * 60 * 1000)
    expect(tokenResetValido({ expiresAt: enUnaHora, usedAt: new Date() })).toBe(false)
  })

  it("no es válido si ya expiró, aunque no se haya usado", () => {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000)
    expect(tokenResetValido({ expiresAt: haceUnaHora, usedAt: null })).toBe(false)
  })

  it("respeta el 'ahora' explícito para la comparación de expiración", () => {
    const ahora = new Date("2026-01-01T12:00:00Z")
    const expira = new Date("2026-01-01T12:30:00Z")
    expect(tokenResetValido({ expiresAt: expira, usedAt: null }, ahora)).toBe(true)
    expect(tokenResetValido({ expiresAt: expira, usedAt: null }, new Date("2026-01-01T13:00:00Z"))).toBe(false)
  })
})
