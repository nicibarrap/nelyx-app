import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { ingresarMovimiento, crearProducto, eliminarMovimiento } from "@/app/actions/acciones"
import { crearEmpleado, actualizarEmpleado } from "@/app/actions/empleados-acciones"

// Mismos stubs que calendario-repeticion.test.ts / costos-fijos.test.ts —
// acá sesionActual simula exactamente lo que arma lib/auth.ts para una
// sesión de empleado real: id = la cuenta DUEÑA (nunca el id propio del
// empleado), esEmpleado: true, modulosPermitidos = lo que el dueño le
// haya habilitado a ESE empleado.
let sesionActual: { user: { id: string; esEmpleado?: boolean; name: string; modulosPermitidos?: string[] | null } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// getSessionDueno (empleados-acciones.ts) pasa por verificarCuentaActivaOExpulsar,
// que llama a next/navigation's redirect() si la cuenta estuviera inactiva —
// nunca ocurre en estos tests (el dueño siempre queda activo), pero el
// módulo se importa igual, y next/navigation no existe fuera del runtime
// real de Next. Mismo mock que suscripciones-admin.test.ts.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
}))

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

// Regresión del hallazgo de esta auditoría: Movimiento.realizadoPorNombre
// (y "Actividad de usuarios") identifican a cada empleado por su NOMBRE,
// no por su id — dos empleados activos con el mismo nombre volvían ese
// historial ambiguo, justo lo que este módulo existe para evitar.
describe("crearEmpleado / actualizarEmpleado — no permiten dos empleados activos con el mismo nombre", () => {
  it("crearEmpleado rechaza un nombre que ya usa otro empleado activo (sin importar mayúsculas)", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    await crearEmpleado("Juan", "1111", ["venta"])
    // { error } como dato de retorno, no una excepción — ver comentario en
    // crearEmpleado (acciones.ts): un throw desde una Server Action pierde
    // su mensaje en producción.
    const resultado = await crearEmpleado("juan", "2222", ["venta"])
    expect(resultado?.error).toMatch(/ya tienes un usuario activo llamado/i)

    const empleados = await db.user.findMany({ where: { cuentaPrincipalId: dueno.id } })
    expect(empleados).toHaveLength(1)
  })

  it("crearEmpleado permite nombres distintos sin problema", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    await crearEmpleado("Juan", "1111", ["venta"])
    await crearEmpleado("Ana", "2222", ["venta"])

    const empleados = await db.user.findMany({ where: { cuentaPrincipalId: dueno.id } })
    expect(empleados).toHaveLength(2)
  })

  it("crearEmpleado permite reusar el nombre de un empleado ya desactivado", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    await crearEmpleado("Juan", "1111", ["venta"])
    const anterior = await db.user.findFirstOrThrow({ where: { cuentaPrincipalId: dueno.id, nombre: "Juan" } })
    await db.user.update({ where: { id: anterior.id }, data: { activo: false } })

    await expect(crearEmpleado("Juan", "2222", ["venta"])).resolves.toBeUndefined()
    const empleados = await db.user.findMany({ where: { cuentaPrincipalId: dueno.id, activo: true } })
    expect(empleados).toHaveLength(1)
  })

  it("actualizarEmpleado rechaza renombrar a un nombre que ya usa otro empleado activo", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    await crearEmpleado("Juan", "1111", ["venta"])
    await crearEmpleado("Ana", "2222", ["venta"])
    const ana = await db.user.findFirstOrThrow({ where: { cuentaPrincipalId: dueno.id, nombre: "Ana" } })

    const resultado = await actualizarEmpleado(ana.id, { nombre: "juan" })
    expect(resultado?.error).toMatch(/ya tienes un usuario activo llamado/i)
  })

  it("actualizarEmpleado permite guardar sin cambiar el nombre (no choca contra sí mismo)", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    await crearEmpleado("Juan", "1111", ["venta"])
    const juan = await db.user.findFirstOrThrow({ where: { cuentaPrincipalId: dueno.id, nombre: "Juan" } })

    await expect(actualizarEmpleado(juan.id, { nombre: "Juan", modulosPermitidos: ["venta", "productos"] })).resolves.toBeUndefined()
  })
})

// Regresión de esta misma auditoría: eliminar un movimiento no es lo mismo
// que registrar uno nuevo — un empleado con acceso COMPLETO de escritura a
// "movimientos" no debía poder borrar nada hasta que el dueño le habilite,
// aparte, "movimientos:eliminar". Además, cada eliminación debe dejar un
// rastro en RegistroEliminacion (ver eliminarMovimiento en acciones.ts).
describe("eliminarMovimiento — permiso aparte para eliminar + bitácora", () => {
  async function crearMovimientoDeGasto(userId: string) {
    return db.movimiento.create({
      data: { tipo: "GASTO", monto: 7500, fecha: new Date("2026-11-05"), categoria: "Insumos", descripcion: "Bolsas", userId },
    })
  }

  it("un empleado con acceso completo a movimientos, pero SIN \"movimientos:eliminar\", no puede eliminar", async () => {
    const dueno = await crearDueno()
    const mov = await crearMovimientoDeGasto(dueno.id)
    comoEmpleado(dueno.id, "Ana", ["movimientos"])

    // { error } como dato de retorno, no una excepción — ver comentario en
    // eliminarMovimiento (acciones.ts).
    const resultado = await eliminarMovimiento(mov.id)
    expect(resultado?.error).toMatch(/no tienes permiso para eliminar movimientos/i)
    await expect(db.movimiento.findUnique({ where: { id: mov.id } })).resolves.not.toBeNull()
    await expect(db.registroEliminacion.findMany({ where: { userId: dueno.id } })).resolves.toHaveLength(0)
  })

  it("un empleado con \"movimientos:eliminar\" sí puede eliminar, y queda registrado quién fue", async () => {
    const dueno = await crearDueno()
    const mov = await crearMovimientoDeGasto(dueno.id)
    comoEmpleado(dueno.id, "Ana", ["movimientos", "movimientos:eliminar"])

    await eliminarMovimiento(mov.id)

    await expect(db.movimiento.findUnique({ where: { id: mov.id } })).resolves.toBeNull()
    const registro = await db.registroEliminacion.findFirstOrThrow({ where: { userId: dueno.id } })
    expect(registro.eliminadoPorNombre).toBe("Ana")
    expect(registro.resumen).toContain("7.500")
    expect(registro.resumen).toContain("Bolsas")
  })

  it("el dueño siempre puede eliminar, y la bitácora no le atribuye el borrado a ningún empleado", async () => {
    const dueno = await crearDueno()
    const mov = await crearMovimientoDeGasto(dueno.id)
    comoDueno(dueno)

    await eliminarMovimiento(mov.id)

    const registro = await db.registroEliminacion.findFirstOrThrow({ where: { userId: dueno.id } })
    expect(registro.eliminadoPorNombre).toBeNull()
  })

  it("un empleado de solo lectura en movimientos sigue rechazado, aunque tuviera la marca de eliminar", async () => {
    const dueno = await crearDueno()
    const mov = await crearMovimientoDeGasto(dueno.id)
    // Caso defensivo: no debería poder darse desde la UI (SelectorModulos
    // limpia "eliminar" al pasar a solo lectura), pero si de todos modos
    // llegara así, esSoloLectura debe seguir ganando.
    comoEmpleado(dueno.id, "Ana", ["movimientos:ro", "movimientos:eliminar"])

    await expect(eliminarMovimiento(mov.id)).rejects.toThrow(/solo de lectura/i)
  })
})
