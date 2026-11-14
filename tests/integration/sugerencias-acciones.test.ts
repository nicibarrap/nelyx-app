import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import {
  crearSugerencia, obtenerMisSugerencias, obtenerSugerenciasAdmin, actualizarEstadoSugerencia,
  contarNuevasSugerenciasAdmin,
} from "@/app/actions/sugerencias-acciones"

let sesionActual: { user: { id: string; esEmpleado?: boolean; name: string; role?: string; modulosPermitidos?: string[] | null; empleadoId?: string } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
}))

async function crearDueno() {
  return db.user.create({
    data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" },
  })
}

function comoDueno(dueno: { id: string; nombre: string }) {
  sesionActual = { user: { id: dueno.id, esEmpleado: false, name: dueno.nombre, role: "USER", modulosPermitidos: null } }
}

// Crea una fila real de empleado con empleadoId, igual que un login real
// por PIN — ver el mismo comentario en empleados-permisos.test.ts.
async function comoEmpleado(duenoId: string, nombre: string, modulosPermitidos: string[]) {
  const empleado = await db.user.create({
    data: { nombre, email: `empleado-${Math.random()}@nelyx.local`, password: "x", cuentaPrincipalId: duenoId, pin: "x", modulosPermitidos, activo: true },
  })
  sesionActual = { user: { id: duenoId, esEmpleado: true, name: nombre, role: "USER", modulosPermitidos, empleadoId: empleado.id } }
}

function comoAdmin(id: string) {
  sesionActual = { user: { id, esEmpleado: false, name: "Soporte Nelyx", role: "ADMIN", modulosPermitidos: null } }
}

describe("crearSugerencia — gateada por el mismo permiso \"soporte\" del chat", () => {
  it("un empleado sin el módulo \"soporte\" no puede sugerir nada", async () => {
    const dueno = await crearDueno()
    await comoEmpleado(dueno.id, "Ana", ["venta"])

    const resultado = await crearSugerencia("Exportar a Excel", "Sería útil para contabilidad")
    expect(resultado?.error).toMatch(/no tienes acceso/i)
    expect(await db.sugerencia.count({ where: { userId: dueno.id } })).toBe(0)
  })

  it("un empleado con \"soporte\" puede sugerir, y queda atribuida con su nombre", async () => {
    const dueno = await crearDueno()
    await comoEmpleado(dueno.id, "Ana", ["soporte"])

    const resultado = await crearSugerencia("Exportar a Excel", "Sería útil para contabilidad")
    expect(resultado).toBeUndefined()

    const s = await db.sugerencia.findFirstOrThrow({ where: { userId: dueno.id } })
    expect(s.autorNombre).toBe("Ana")
    expect(s.estado).toBe("nueva")
  })

  it("el dueño siempre tiene acceso", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    expect(await crearSugerencia("Idea del dueño", "Descripción de la idea")).toBeUndefined()
  })

  it("una cuenta ADMIN (Soporte Nelyx) no puede sugerir desde el widget de cliente", async () => {
    const admin = await crearDueno()
    comoAdmin(admin.id)
    const resultado = await crearSugerencia("Intento", "desde soporte")
    expect(resultado?.error).toMatch(/no tienes acceso/i)
  })

  it("rechaza título o descripción vacíos, o un título demasiado largo", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    expect((await crearSugerencia("", "algo"))?.error).toMatch(/título/i)
    expect((await crearSugerencia("algo", ""))?.error).toMatch(/descripción/i)
    expect((await crearSugerencia("a".repeat(121), "algo"))?.error).toMatch(/demasiado largo/i)
  })
})

describe("obtenerMisSugerencias — aislado por cuenta", () => {
  it("una cuenta no ve las sugerencias de otra", async () => {
    const duenoA = await crearDueno()
    const duenoB = await crearDueno()
    comoDueno(duenoA)
    await crearSugerencia("Idea de A", "descripción A")

    comoDueno(duenoB)
    await crearSugerencia("Idea de B", "descripción B")

    expect(await obtenerMisSugerencias()).toHaveLength(1)
    const [sugerenciaB] = await obtenerMisSugerencias()
    expect(sugerenciaB.titulo).toBe("Idea de B")
  })
})

describe("panel admin de Sugerencias", () => {
  it("lista todas las sugerencias de todas las cuentas, con el negocio de cada una", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await crearSugerencia("Idea visible para admin", "detalle")

    comoAdmin((await crearDueno()).id)
    const lista = await obtenerSugerenciasAdmin()
    expect(lista.some(s => s.titulo === "Idea visible para admin")).toBe(true)
  })

  it("filtra por estado cuando se pasa uno", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await crearSugerencia("Sigue nueva", "detalle")

    const admin = await crearDueno()
    comoAdmin(admin.id)
    const soloNuevas = await obtenerSugerenciasAdmin("nueva")
    expect(soloNuevas.length).toBeGreaterThan(0)
    expect(soloNuevas.every(s => s.estado === "nueva")).toBe(true)

    const soloImplementadas = await obtenerSugerenciasAdmin("implementado")
    expect(soloImplementadas).toHaveLength(0)
  })

  it("actualizarEstadoSugerencia cambia el estado y guarda la nota, y contarNuevasSugerenciasAdmin baja", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await crearSugerencia("Para marcar en análisis", "detalle")
    const creada = await db.sugerencia.findFirstOrThrow({ where: { userId: dueno.id } })

    const admin = await crearDueno()
    comoAdmin(admin.id)
    const antes = await contarNuevasSugerenciasAdmin()

    await actualizarEstadoSugerencia(creada.id, "en_analisis", "la estamos revisando")

    const actualizada = await db.sugerencia.findUniqueOrThrow({ where: { id: creada.id } })
    expect(actualizada.estado).toBe("en_analisis")
    expect(actualizada.notaAdmin).toBe("la estamos revisando")
    expect(await contarNuevasSugerenciasAdmin()).toBe(antes - 1)
  })

  it("un empleado (no ADMIN) no puede usar las acciones de panel admin", async () => {
    const dueno = await crearDueno()
    await comoEmpleado(dueno.id, "Ana", ["soporte"])
    await expect(obtenerSugerenciasAdmin()).rejects.toThrow(/no autorizado/i)
  })
})
