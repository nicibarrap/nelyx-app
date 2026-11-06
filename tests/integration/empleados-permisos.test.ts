import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { ingresarMovimiento, crearProducto } from "@/app/actions/acciones"

// Mismos stubs que calendario-repeticion.test.ts / costos-fijos.test.ts —
// acá sesionActual simula exactamente lo que arma lib/auth.ts para una
// sesión de empleado real: id = la cuenta DUEÑA (nunca el id propio del
// empleado), esEmpleado: true, modulosPermitidos = lo que el dueño le
// haya habilitado a ESE empleado.
let sesionActual: { user: { id: string; esEmpleado?: boolean; name: string; modulosPermitidos?: string[] | null } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

async function crearDueno() {
  const user = await db.user.create({
    data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" },
  })
  return user
}

function comoEmpleado(duenoId: string, nombre: string, modulosPermitidos: string[]) {
  sesionActual = { user: { id: duenoId, esEmpleado: true, name: nombre, modulosPermitidos } }
}

function comoDueno(dueno: { id: string; nombre: string }) {
  sesionActual = { user: { id: dueno.id, esEmpleado: false, name: dueno.nombre, modulosPermitidos: null } }
}

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

// Regresión del hallazgo central de la auditoría de usuarios: getSessionEscritura
// solo rechazaba a un empleado marcado explícitamente "módulo:ro" (solo
// lectura) — un empleado al que un módulo directamente NO se le había
// habilitado (ni siquiera en modo lectura) pasaba de largo igual, porque la
// única barrera real para una Server Action (el middleware deja pasar esas
// llamadas a propósito) nunca llamaba a tieneAcceso().
describe("getSessionEscritura — un empleado no puede escribir fuera de sus módulos habilitados", () => {
  it("sin el módulo en absoluto (ni de solo lectura) la acción se rechaza", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["venta"]) // "movimientos" nunca se le habilitó

    await expect(ingresarMovimiento(formData({ tipo: "GASTO", monto: "5000", fecha: "2026-11-05", categoria: "Insumos" })))
      .rejects.toThrow("No tienes acceso a este módulo")

    const movimientos = await db.movimiento.findMany({ where: { userId: dueno.id } })
    expect(movimientos).toHaveLength(0)
  })

  it("con el módulo habilitado (lectura y escritura) la acción funciona y queda atribuida al empleado", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["movimientos"])

    await ingresarMovimiento(formData({ tipo: "GASTO", monto: "5000", fecha: "2026-11-05", categoria: "Insumos" }))

    const movimiento = await db.movimiento.findFirstOrThrow({ where: { userId: dueno.id } })
    expect(movimiento.realizadoPorNombre).toBe("Ana")
  })

  it("con el módulo en modo solo lectura (\"movimientos:ro\") la acción se sigue rechazando", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["movimientos:ro"])

    await expect(ingresarMovimiento(formData({ tipo: "GASTO", monto: "5000", fecha: "2026-11-05", categoria: "Insumos" })))
      .rejects.toThrow("Tu acceso a este módulo es solo de lectura")
  })

  it("el mismo chequeo aplica en otro módulo (productos), no solo en movimientos", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["venta"]) // "productos" nunca se le habilitó

    await expect(crearProducto(formData({ nombre: "Mani", precio: "1000", costo: "500" })))
      .rejects.toThrow("No tienes acceso a este módulo")

    const productos = await db.producto.findMany({ where: { userId: dueno.id } })
    expect(productos).toHaveLength(0)
  })

  it("el dueño (sesión sin modulosPermitidos) nunca se ve afectado por este chequeo", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    await ingresarMovimiento(formData({ tipo: "GASTO", monto: "5000", fecha: "2026-11-05", categoria: "Insumos" }))

    const movimiento = await db.movimiento.findFirstOrThrow({ where: { userId: dueno.id } })
    // El dueño nunca queda marcado como "realizado por" — ver comentario
    // del campo en el schema (solo se llena cuando fue un empleado).
    expect(movimiento.realizadoPorNombre).toBeNull()
  })
})
