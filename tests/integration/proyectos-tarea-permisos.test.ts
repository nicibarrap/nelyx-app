import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { crearProyectoTarea, editarProyectoTarea, eliminarProyectoTarea } from "@/app/actions/acciones"

// Mismos stubs que calendario-repeticion.test.ts / caja.test.ts.
let sesionActual: { user: { id: string; esEmpleado?: boolean; name: string; modulosPermitidos?: string[] | null } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

async function crearDueno() {
  return db.user.create({ data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
}

function comoDueno(dueno: { id: string; nombre: string }) {
  sesionActual = { user: { id: dueno.id, esEmpleado: false, name: dueno.nombre, modulosPermitidos: null } }
}

function comoEmpleado(duenoId: string, nombre: string, modulosPermitidos: string[]) {
  sesionActual = { user: { id: duenoId, esEmpleado: true, name: nombre, modulosPermitidos } }
}

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

// Regresión de esta auditoría: crear/editar/eliminar un proyecto de tareas
// solo se puede hacer desde Configuración → Categorías (proyectos-tarea-
// client.tsx) — Calendario únicamente deja asignar un proyecto ya existente
// a una tarea, nunca administrarlos. Antes exigía el módulo "calendario"
// (arrastre de cuando esto vivía ahí, previo al PR #154), así que un
// empleado con acceso a Configuración pero sin Calendario veía los botones
// en pantalla pero cualquier click tiraba "No tienes acceso a este módulo".
describe("proyectos de tarea — permiso correcto es 'configuracion', no 'calendario'", () => {
  it("un empleado con 'configuracion' pero sin 'calendario' puede crear un proyecto", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["configuracion"])
    await crearProyectoTarea(formData({ nombre: "Marketing", color: "violeta" }))
    const proyecto = await db.proyectoTarea.findFirstOrThrow({ where: { userId: dueno.id } })
    expect(proyecto.nombre).toBe("Marketing")
  })

  it("un empleado con 'calendario' pero sin 'configuracion' NO puede crear un proyecto", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["calendario"])
    await expect(crearProyectoTarea(formData({ nombre: "Marketing", color: "violeta" }))).rejects.toThrow(/no tienes acceso/i)
  })

  it("un empleado con 'configuracion' pero sin 'calendario' puede editar un proyecto", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await crearProyectoTarea(formData({ nombre: "Marketing", color: "violeta" }))
    const proyecto = await db.proyectoTarea.findFirstOrThrow({ where: { userId: dueno.id } })

    comoEmpleado(dueno.id, "Ana", ["configuracion"])
    await editarProyectoTarea(proyecto.id, formData({ nombre: "Marketing digital", color: "rosado" }))
    const editado = await db.proyectoTarea.findUniqueOrThrow({ where: { id: proyecto.id } })
    expect(editado.nombre).toBe("Marketing digital")
  })

  it("un empleado con 'configuracion' pero sin 'calendario' puede eliminar un proyecto", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await crearProyectoTarea(formData({ nombre: "Marketing", color: "violeta" }))
    const proyecto = await db.proyectoTarea.findFirstOrThrow({ where: { userId: dueno.id } })

    comoEmpleado(dueno.id, "Ana", ["configuracion"])
    await eliminarProyectoTarea(proyecto.id)
    expect(await db.proyectoTarea.findUnique({ where: { id: proyecto.id } })).toBeNull()
  })
})
