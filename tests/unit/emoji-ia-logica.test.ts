import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { sugerirClasificacionIA } from "@/lib/emoji-ia"

function mockFetch(respuesta: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(respuesta),
    text: () => Promise.resolve(JSON.stringify(respuesta)),
  }) as unknown as typeof fetch
}

describe("sugerirClasificacionIA", () => {
  const original = process.env.ANTHROPIC_API_KEY

  beforeEach(() => { process.env.ANTHROPIC_API_KEY = "clave-de-prueba" })
  afterEach(() => { process.env.ANTHROPIC_API_KEY = original; vi.restoreAllMocks() })

  it("sin ANTHROPIC_API_KEY configurada, devuelve null sin llamar a la red", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    expect(await sugerirClasificacionIA("Tucapel Gran Selección")).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("devuelve emoji y categoría cuando la respuesta trae ambos de las listas permitidas", async () => {
    mockFetch({ content: [{ text: "🍚|Abarrotes" }] })
    expect(await sugerirClasificacionIA("Tucapel Gran Selección")).toEqual({ emoji: "🍚", categoria: "Abarrotes" })
  })

  it("tolera espacios alrededor del separador", async () => {
    mockFetch({ content: [{ text: "🥛 | Lácteos " }] })
    expect(await sugerirClasificacionIA("Soprole Gold Lúcuma y Nueces")).toEqual({ emoji: "🥛", categoria: "Lácteos" })
  })

  it("devuelve null si falta el separador o alguna de las dos partes", async () => {
    mockFetch({ content: [{ text: "🍚" }] })
    expect(await sugerirClasificacionIA("xyz123")).toBeNull()
  })

  it("devuelve null si el emoji no está en la lista permitida", async () => {
    mockFetch({ content: [{ text: "🤖|Abarrotes" }] })
    expect(await sugerirClasificacionIA("xyz123")).toBeNull()
  })

  it("devuelve null si la categoría no está en la lista permitida", async () => {
    mockFetch({ content: [{ text: "🍚|Juguetería" }] })
    expect(await sugerirClasificacionIA("xyz123")).toBeNull()
  })

  it("devuelve null si la respuesta no trae nada reconocible (ej. texto explicativo inesperado)", async () => {
    mockFetch({ content: [{ text: "No estoy seguro de qué producto es esto" }] })
    expect(await sugerirClasificacionIA("xyz123")).toBeNull()
  })

  it("devuelve null si la API responde con error (nunca lanza, para no romper el flujo de creación/escaneo)", async () => {
    mockFetch({ error: "server error" }, false)
    expect(await sugerirClasificacionIA("Tucapel Gran Selección")).toBeNull()
  })

  it("devuelve null si fetch lanza (sin internet, timeout, etc.)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch
    expect(await sugerirClasificacionIA("Tucapel Gran Selección")).toBeNull()
  })
})
