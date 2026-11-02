import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { ingresarMovimiento } from "@/app/actions/acciones"

// Mismos stubs que en race-conditions.test.ts / deudas.test.ts.
let sesionActual: { user: { id: string; esEmpleado: boolean; name: string } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

async function crearUsuario() {
  const user = await db.user.create({
    data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" },
  })
  sesionActual = { user: { id: user.id, esEmpleado: false, name: user.nombre } }
  return user
}

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

// Un Retiro es plata del dueño saliendo del negocio, no un costo
// operativo — debería bajar el Disponible (sí es caja real) pero no la
// Utilidad. Antes se contaba igual que cualquier Gasto en ambos casos.
describe("ingresarMovimiento — Retiro no debe bajar la Utilidad", () => {
  it("un Retiro queda con montoNoOperativo = monto completo", async () => {
    await crearUsuario()
    await ingresarMovimiento(formData({ tipo: "RETIRO", monto: "80000", fecha: new Date().toISOString(), descripcion: "Sueldo personal" }))

    const mov = await db.movimiento.findFirstOrThrow({ where: { userId: sesionActual!.user.id, tipo: "RETIRO" } })
    expect(Number(mov.monto)).toBe(80000)
    expect(Number(mov.montoNoOperativo)).toBe(80000)
  })

  it("un Gasto normal queda con montoNoOperativo = 0 (sin cambios de comportamiento)", async () => {
    await crearUsuario()
    await ingresarMovimiento(formData({ tipo: "GASTO", monto: "15000", fecha: new Date().toISOString(), descripcion: "Insumos" }))

    const mov = await db.movimiento.findFirstOrThrow({ where: { userId: sesionActual!.user.id, tipo: "GASTO" } })
    expect(Number(mov.montoNoOperativo)).toBe(0)
  })
})
