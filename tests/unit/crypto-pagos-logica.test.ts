import { describe, it, expect, beforeAll } from "vitest"
import crypto from "crypto"
import { cifrarToken, descifrarToken } from "@/lib/crypto-pagos"

beforeAll(() => {
  process.env.PAGOS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64")
})

describe("cifrarToken / descifrarToken", () => {
  it("descifra exactamente lo mismo que se cifró", () => {
    const original = "APP_USR-token-secreto-de-mercado-pago-123456"
    const cifrado = cifrarToken(original)
    expect(cifrado).not.toContain(original)
    expect(descifrarToken(cifrado)).toBe(original)
  })

  it("nunca guarda el token en texto plano reconocible", () => {
    const original = "APP_USR-otro-token-12345"
    const cifrado = cifrarToken(original)
    expect(cifrado.toLowerCase()).not.toContain("app_usr")
  })

  it("rechaza un valor manipulado (el authTag de GCM detecta la alteración)", () => {
    const cifrado = cifrarToken("un-token-cualquiera")
    const [iv, authTag, datos] = cifrado.split(":")
    const datosAlterados = `${iv}:${authTag}:${datos.slice(0, -2)}AA`
    expect(() => descifrarToken(datosAlterados)).toThrow()
  })

  it("falla con un mensaje claro si falta PAGOS_ENCRYPTION_KEY", () => {
    const original = process.env.PAGOS_ENCRYPTION_KEY
    delete process.env.PAGOS_ENCRYPTION_KEY
    try {
      expect(() => cifrarToken("algo")).toThrow(/PAGOS_ENCRYPTION_KEY/)
    } finally {
      process.env.PAGOS_ENCRYPTION_KEY = original
    }
  })
})
