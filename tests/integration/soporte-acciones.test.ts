import { describe, it, expect, vi, beforeEach } from "vitest"
import { db } from "@/lib/db"
import {
  contarNoLeidosCliente, obtenerConversacionesCliente, obtenerMensajesCliente, enviarMensajeCliente,
} from "@/app/actions/soporte-acciones"

// Mismo patrón que caja.test.ts / empleados-permisos.test.ts.
let sesionActual: { user: { id: string; esEmpleado?: boolean; name: string; role?: string; modulosPermitidos?: string[] | null } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
}))

// after() normalmente corre "en segundo plano" sin que el llamador la
// espere — acá se captura cada callback para poder esperarla a propósito
// (flushAfter) antes de revisar lo que escribió (la auto-respuesta, el
// aviso a soporte), en vez de que el test siga sin haber terminado.
const afterPromises: Promise<unknown>[] = []
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => { afterPromises.push(Promise.resolve().then(fn)) },
}))
async function flushAfter() {
  await Promise.all(afterPromises.splice(0))
}

beforeEach(() => { afterPromises.length = 0 })

async function crearDueno() {
  return db.user.create({
    data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" },
  })
}

function comoDueno(dueno: { id: string; nombre: string }) {
  sesionActual = { user: { id: dueno.id, esEmpleado: false, name: dueno.nombre, role: "USER", modulosPermitidos: null } }
}

function comoEmpleado(duenoId: string, nombre: string, modulosPermitidos: string[]) {
  sesionActual = { user: { id: duenoId, esEmpleado: true, name: nombre, role: "USER", modulosPermitidos } }
}

function comoAdmin(id: string) {
  sesionActual = { user: { id, esEmpleado: false, name: "Soporte Nelyx", role: "ADMIN", modulosPermitidos: null } }
}

describe("soporte-acciones — acceso de empleados al módulo \"soporte\"", () => {
  it("un empleado SIN el módulo \"soporte\" no ve nada y no puede escribir", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["venta"]) // "soporte" nunca se le habilitó

    expect(await contarNoLeidosCliente()).toBe(0)
    expect(await obtenerConversacionesCliente()).toEqual([])

    const resultado = await enviarMensajeCliente(null, "Hola, tengo una duda")
    expect(resultado && "error" in resultado ? resultado.error : null).toMatch(/no tienes acceso/i)

    const conversaciones = await db.conversacionSoporte.findMany({ where: { userId: dueno.id } })
    expect(conversaciones).toHaveLength(0)
  })

  it("un empleado CON el módulo \"soporte\" puede escribir, y el hilo queda atribuido al dueño de la cuenta", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["soporte"])

    const resultado = await enviarMensajeCliente(null, "¿Cómo registro una venta a crédito?")
    await flushAfter()
    expect(resultado && "error" in resultado).toBe(false)
    if (!resultado || "error" in resultado) throw new Error("no debería fallar")

    const conv = await db.conversacionSoporte.findFirstOrThrow({ where: { userId: dueno.id } })
    expect(conv.id).toBe(resultado.conversacionId)

    const mensajes = await db.mensajeSoporte.findMany({ where: { conversacionId: conv.id }, orderBy: { createdAt: "asc" } })
    expect(mensajes.map(m => m.de)).toEqual(["cliente", "sistema"])
    expect(mensajes[0].autorNombre).toBe("Ana")
  })

  it("un empleado con \"soporte:ro\" puede ver las conversaciones pero no escribir", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    const primero = await enviarMensajeCliente(null, "Primer mensaje del dueño")
    await flushAfter()
    if (!primero || "error" in primero) throw new Error("setup inválido")

    comoEmpleado(dueno.id, "Beto", ["soporte:ro"])
    const conversaciones = await obtenerConversacionesCliente()
    expect(conversaciones).toHaveLength(1)

    const resultado = await enviarMensajeCliente(primero.conversacionId, "Quiero responder")
    expect(resultado && "error" in resultado ? resultado.error : null).toMatch(/solo de lectura/i)
  })

  it("el dueño (sesión sin modulosPermitidos) siempre tiene acceso completo", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    const resultado = await enviarMensajeCliente(null, "Hola, necesito ayuda")
    await flushAfter()
    expect(resultado && "error" in resultado).toBe(false)
  })

  it("una cuenta ADMIN (Soporte Nelyx) no puede usar el widget de cliente", async () => {
    const admin = await crearDueno()
    comoAdmin(admin.id)

    expect(await contarNoLeidosCliente()).toBe(0)
    expect(await obtenerConversacionesCliente()).toEqual([])
    const resultado = await enviarMensajeCliente(null, "intento desde soporte")
    expect(resultado && "error" in resultado ? resultado.error : null).toMatch(/no tienes acceso/i)
  })
})

describe("enviarMensajeCliente — crea el hilo en el mismo envío (sin conversaciones vacías)", () => {
  it("con conversacionId null, crea la conversación y el primer mensaje en un solo llamado", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    const resultado = await enviarMensajeCliente(null, "Mi primer mensaje")
    await flushAfter()
    if (!resultado || "error" in resultado) throw new Error("no debería fallar")

    const conversaciones = await db.conversacionSoporte.findMany({ where: { userId: dueno.id } })
    expect(conversaciones).toHaveLength(1)
    const mensajesCliente = await db.mensajeSoporte.count({ where: { conversacionId: resultado.conversacionId, de: "cliente" } })
    expect(mensajesCliente).toBe(1)
  })

  it("sin ANTHROPIC_API_KEY en el entorno de test, el primer mensaje recibe el mensaje de respaldo automático", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    const resultado = await enviarMensajeCliente(null, "¿Qué es el costo promedio ponderado?")
    await flushAfter()
    if (!resultado || "error" in resultado) throw new Error("no debería fallar")

    const sistema = await db.mensajeSoporte.findFirstOrThrow({ where: { conversacionId: resultado.conversacionId, de: "sistema" } })
    expect(sistema.contenido.length).toBeGreaterThan(0)
  })
})

describe("enviarMensajeCliente — validaciones", () => {
  it("rechaza un mensaje demasiado largo sin crear ninguna conversación", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    const resultado = await enviarMensajeCliente(null, "a".repeat(2001))
    expect(resultado && "error" in resultado ? resultado.error : null).toMatch(/demasiado largo/i)
    expect(await db.conversacionSoporte.count({ where: { userId: dueno.id } })).toBe(0)
  })

  it("corta después de 20 mensajes del cliente en 5 minutos en el mismo hilo", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    const primero = await enviarMensajeCliente(null, "Mensaje inicial")
    await flushAfter()
    if (!primero || "error" in primero) throw new Error("setup inválido")

    // 19 mensajes más ya existen (sin pasar por la acción, para no hacer el
    // test lento) — el primero de arriba + estos 19 = 20 recientes.
    await db.mensajeSoporte.createMany({
      data: Array.from({ length: 19 }, () => ({
        conversacionId: primero.conversacionId, de: "cliente", autorNombre: "Cuenta de prueba", contenido: "spam",
      })),
    })

    const resultado = await enviarMensajeCliente(primero.conversacionId, "Mensaje número 21")
    expect(resultado && "error" in resultado ? resultado.error : null).toMatch(/escribiendo muy rápido/i)
  })
})

describe("enviarMensajeCliente — adjuntos", () => {
  it("permite un mensaje sin texto si trae una imagen adjunta", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    const resultado = await enviarMensajeCliente(null, "", undefined, {
      url: "https://blob.vercel-storage.com/captura.png", nombre: "captura.png", tipo: "image/png", tamano: 1000,
    })
    await flushAfter()
    expect(resultado && "error" in resultado).toBe(false)
    if (!resultado || "error" in resultado) throw new Error("no debería fallar")
    expect(resultado.adjuntoUrl).toBe("https://blob.vercel-storage.com/captura.png")
  })

  it("rechaza un tipo de archivo que no sea imagen, aunque el tamaño sea válido", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    const resultado = await enviarMensajeCliente(null, "mira esto", undefined, {
      url: "https://blob.vercel-storage.com/documento.pdf", nombre: "documento.pdf", tipo: "application/pdf", tamano: 1000,
    })
    expect(resultado && "error" in resultado ? resultado.error : null).toMatch(/solo se pueden adjuntar imágenes/i)
    expect(await db.conversacionSoporte.count({ where: { userId: dueno.id } })).toBe(0)
  })

  it("rechaza una imagen de más de 8MB", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    const resultado = await enviarMensajeCliente(null, "foto grande", undefined, {
      url: "https://blob.vercel-storage.com/foto.png", nombre: "foto.png", tipo: "image/png", tamano: 9 * 1024 * 1024,
    })
    expect(resultado && "error" in resultado ? resultado.error : null).toMatch(/demasiado grande/i)
  })
})

describe("obtenerMensajesCliente / enviarMensajeCliente — aislamiento entre cuentas", () => {
  it("una cuenta no puede leer ni escribir en el hilo de otra", async () => {
    const duenoA = await crearDueno()
    const duenoB = await crearDueno()
    comoDueno(duenoA)
    const deA = await enviarMensajeCliente(null, "Mensaje de la cuenta A")
    await flushAfter()
    if (!deA || "error" in deA) throw new Error("setup inválido")

    comoDueno(duenoB)
    await expect(obtenerMensajesCliente(deA.conversacionId)).rejects.toThrow(/no autorizado/i)
    await expect(enviarMensajeCliente(deA.conversacionId, "Intento desde B")).rejects.toThrow(/no autorizado/i)
  })
})
