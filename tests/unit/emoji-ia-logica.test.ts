import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { sugerirEmojiIA } from "@/lib/emoji-ia"

function mockFetch(respuesta: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(respuesta),
    text: () => Promise.resolve(JSON.stringify(respuesta)),
  }) as unknown as typeof fetch
}

describe("sugerirEmojiIA", () => {
  const original = process.env.ANTHROPIC_API_KEY

  beforeEach(() => { process.env.ANTHROPIC_API_KEY = "clave-de-prueba" })
  afterEach(() => { process.env.ANTHROPIC_API_KEY = original; vi.restoreAllMocks() })

  it("sin ANTHROPIC_API_KEY configurada, devuelve null sin llamar a la red", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    expect(await sugerirEmojiIA("Tucapel Gran Selección")).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("devuelve el emoji cuando la respuesta trae uno de la lista permitida", async () => {
    mockFetch({ content: [{ text: "🍚" }] })
    expect(await sugerirEmojiIA("Tucapel Gran Selección")).toBe("🍚")
  })

  it("devuelve null si la respuesta no trae ningún emoji de la lista permitida (ej. texto explicativo inesperado)", async () => {
    mockFetch({ content: [{ text: "No estoy seguro de qué producto es esto" }] })
    expect(await sugerirEmojiIA("xyz123")).toBeNull()
  })

  it("devuelve null si la API responde con error (nunca lanza, para no romper el flujo de escaneo)", async () => {
    mockFetch({ error: "server error" }, false)
    expect(await sugerirEmojiIA("Tucapel Gran Selección")).toBeNull()
  })

  it("devuelve null si fetch lanza (sin internet, timeout, etc.)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch
    expect(await sugerirEmojiIA("Tucapel Gran Selección")).toBeNull()
  })
})
