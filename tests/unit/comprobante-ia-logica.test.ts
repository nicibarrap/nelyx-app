import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { analizarComprobante } from "@/lib/comprobante-ia"

function mockFetchArchivoYClaude(textoClaude: string, { archivoOk = true, claudeOk = true, contentType = "image/png" } = {}) {
  const fetchSpy = vi.fn()
    // 1ª llamada: descargar el comprobante.
    .mockResolvedValueOnce({
      ok: archivoOk,
      headers: { get: () => contentType },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
    // 2ª llamada: la API de Anthropic.
    .mockResolvedValueOnce({
      ok: claudeOk,
      json: () => Promise.resolve({ content: [{ text: textoClaude }] }),
      text: () => Promise.resolve(JSON.stringify({ content: [{ text: textoClaude }] })),
    })
  global.fetch = fetchSpy as unknown as typeof fetch
  return fetchSpy
}

describe("analizarComprobante", () => {
  const original = process.env.ANTHROPIC_API_KEY

  beforeEach(() => { process.env.ANTHROPIC_API_KEY = "clave-de-prueba" })
  afterEach(() => { process.env.ANTHROPIC_API_KEY = original; vi.restoreAllMocks() })

  it("sin ANTHROPIC_API_KEY configurada, devuelve null sin llamar a la red", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    expect(await analizarComprobante("https://blob/comprobante.png")).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("devuelve el monto cuando Claude lo identifica con confianza", async () => {
    mockFetchArchivoYClaude("10000")
    expect(await analizarComprobante("https://blob/comprobante.png")).toEqual({ montoDetectado: 10000 })
  })

  it("tolera puntos de miles en la respuesta", async () => {
    mockFetchArchivoYClaude("10.000")
    expect(await analizarComprobante("https://blob/comprobante.png")).toEqual({ montoDetectado: 10000 })
  })

  it("devuelve null si Claude responde \"?\" (no identificó el monto)", async () => {
    mockFetchArchivoYClaude("?")
    expect(await analizarComprobante("https://blob/comprobante.png")).toBeNull()
  })

  it("devuelve null si no se pudo descargar el comprobante", async () => {
    const fetchSpy = mockFetchArchivoYClaude("10000", { archivoOk: false })
    expect(await analizarComprobante("https://blob/comprobante.png")).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1) // ni siquiera llega a llamar a Claude
  })

  it("devuelve null si la API de Anthropic responde con error (nunca lanza)", async () => {
    mockFetchArchivoYClaude("10000", { claudeOk: false })
    expect(await analizarComprobante("https://blob/comprobante.png")).toBeNull()
  })

  it("devuelve null si fetch lanza (sin internet, timeout, etc.)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch
    expect(await analizarComprobante("https://blob/comprobante.png")).toBeNull()
  })

  it("envía el archivo como documento PDF cuando el content-type es application/pdf", async () => {
    const fetchSpy = mockFetchArchivoYClaude("10000", { contentType: "application/pdf" })
    await analizarComprobante("https://blob/comprobante.pdf")
    const body = JSON.parse(fetchSpy.mock.calls[1][1].body)
    expect(body.messages[0].content[0].type).toBe("document")
    expect(body.messages[0].content[0].source.media_type).toBe("application/pdf")
  })
})
