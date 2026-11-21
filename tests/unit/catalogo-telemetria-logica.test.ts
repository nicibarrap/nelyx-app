import { describe, it, expect, vi, beforeEach } from "vitest"

const captureMessage = vi.fn()
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...args: unknown[]) => captureMessage(...args) }))

const { registrarSiProductoQuedaSinEmoji } = await import("@/lib/catalogo-telemetria")

describe("registrarSiProductoQuedaSinEmoji", () => {
  beforeEach(() => { captureMessage.mockClear() })

  it("no avisa nada cuando el producto sí tiene un emoji confiable", () => {
    registrarSiProductoQuedaSinEmoji("Leche Entera", "Lácteos")
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it("avisa a Sentry, en nivel info, cuando el producto queda con el emoji genérico", () => {
    registrarSiProductoQuedaSinEmoji("Producto Rarísimo XYZ", null)
    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [mensaje, opciones] = captureMessage.mock.calls[0]
    expect(mensaje).toContain("Producto Rarísimo XYZ")
    expect(opciones.level).toBe("info")
    expect(opciones.tags).toEqual({ tipo: "catalogo-sin-clasificar" })
  })

  it("nunca lanza, ni siquiera si Sentry fallara (no debe poder romper la creación del producto)", () => {
    captureMessage.mockImplementationOnce(() => { throw new Error("Sentry caído") })
    expect(() => registrarSiProductoQuedaSinEmoji("Producto Rarísimo XYZ", null)).not.toThrow()
  })
})
