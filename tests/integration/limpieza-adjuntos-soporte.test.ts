import { describe, it, expect, vi, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { limpiarAdjuntosSoporte } from "@/lib/limpieza-adjuntos-soporte"

const delMock = vi.fn((_url: string) => Promise.resolve())
vi.mock("@vercel/blob", () => ({ del: (url: string) => delMock(url) }))

beforeEach(() => { delMock.mockClear() })

async function crearDueno() {
  return db.user.create({
    data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" },
  })
}

async function crearConversacionResuelta(userId: string, fechaResuelta: Date | null, estado = "resuelta") {
  return db.conversacionSoporte.create({ data: { userId, estado, fechaResuelta } })
}

async function crearMensajeConAdjunto(conversacionId: string, overrides: Partial<{ adjuntoUrl: string | null; adjuntoEliminadoAuto: boolean }> = {}) {
  return db.mensajeSoporte.create({
    data: {
      conversacionId, de: "cliente", contenido: "mira esta captura",
      adjuntoUrl: "https://blob.vercel-storage.com/captura-abc123.png",
      adjuntoNombre: "captura.png", adjuntoTipo: "image/png", adjuntoTamano: 123456,
      adjuntoEliminadoAuto: false,
      ...overrides,
    },
  })
}

// Un lunes y un martes cualesquiera, a mediodía UTC (sin ambigüedad de zona horaria).
const UN_LUNES = new Date("2026-11-09T12:00:00Z")
const UN_MARTES = new Date("2026-11-10T12:00:00Z")
const HACE_8_DIAS = new Date(UN_LUNES.getTime() - 8 * 24 * 60 * 60 * 1000)
const HACE_3_DIAS = new Date(UN_LUNES.getTime() - 3 * 24 * 60 * 60 * 1000)

describe("limpiarAdjuntosSoporte", () => {
  it("solo corre los lunes — cualquier otro día no hace nada, aunque haya adjuntos vencidos", async () => {
    const dueno = await crearDueno()
    const conv = await crearConversacionResuelta(dueno.id, HACE_8_DIAS)
    await crearMensajeConAdjunto(conv.id)

    const limpiados = await limpiarAdjuntosSoporte(UN_MARTES)
    expect(limpiados).toBe(0)
    expect(delMock).not.toHaveBeenCalled()
  })

  it("un lunes, borra el adjunto de una conversación resuelta hace 8 días y limpia la referencia en el mensaje", async () => {
    const dueno = await crearDueno()
    const conv = await crearConversacionResuelta(dueno.id, HACE_8_DIAS)
    const mensaje = await crearMensajeConAdjunto(conv.id)

    const limpiados = await limpiarAdjuntosSoporte(UN_LUNES)
    expect(limpiados).toBe(1)
    expect(delMock).toHaveBeenCalledWith("https://blob.vercel-storage.com/captura-abc123.png")

    const actualizado = await db.mensajeSoporte.findUniqueOrThrow({ where: { id: mensaje.id } })
    expect(actualizado.adjuntoUrl).toBeNull()
    expect(actualizado.adjuntoEliminadoAuto).toBe(true)
    // El texto del mensaje y el nombre/tipo originales del adjunto quedan
    // intactos — solo se borra el archivo en sí.
    expect(actualizado.contenido).toBe("mira esta captura")
    expect(actualizado.adjuntoNombre).toBe("captura.png")
  })

  it("no toca un adjunto de una conversación resuelta hace solo 3 días", async () => {
    const dueno = await crearDueno()
    const conv = await crearConversacionResuelta(dueno.id, HACE_3_DIAS)
    await crearMensajeConAdjunto(conv.id)

    const limpiados = await limpiarAdjuntosSoporte(UN_LUNES)
    expect(limpiados).toBe(0)
    expect(delMock).not.toHaveBeenCalled()
  })

  it("no toca un adjunto de una conversación todavía abierta, sin importar la fecha", async () => {
    const dueno = await crearDueno()
    const conv = await crearConversacionResuelta(dueno.id, null, "abierta")
    await crearMensajeConAdjunto(conv.id)

    const limpiados = await limpiarAdjuntosSoporte(UN_LUNES)
    expect(limpiados).toBe(0)
  })

  it("no reprocesa un adjunto que ya se limpió antes (idempotente)", async () => {
    const dueno = await crearDueno()
    const conv = await crearConversacionResuelta(dueno.id, HACE_8_DIAS)
    await crearMensajeConAdjunto(conv.id, { adjuntoUrl: null, adjuntoEliminadoAuto: true })

    const limpiados = await limpiarAdjuntosSoporte(UN_LUNES)
    expect(limpiados).toBe(0)
    expect(delMock).not.toHaveBeenCalled()
  })
})
