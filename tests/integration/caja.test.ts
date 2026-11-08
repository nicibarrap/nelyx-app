import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { abrirCaja, cerrarCaja, obtenerCajaActual, obtenerHistorialCajas } from "@/app/actions/caja-acciones"

let sesionActual: { user: { id: string; esEmpleado?: boolean; name: string; modulosPermitidos?: string[] | null } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
}))

async function crearDueno() {
  const user = await db.user.create({
    data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" },
  })
  return user
}

function comoDueno(dueno: { id: string; nombre: string }) {
  sesionActual = { user: { id: dueno.id, esEmpleado: false, name: dueno.nombre, modulosPermitidos: null } }
}

function comoEmpleado(duenoId: string, nombre: string, modulosPermitidos: string[]) {
  sesionActual = { user: { id: duenoId, esEmpleado: true, name: nombre, modulosPermitidos } }
}

async function crearMovimiento(userId: string, tipo: string, monto: number, metodoPago: string | null) {
  return db.movimiento.create({ data: { tipo: tipo as any, monto, fecha: new Date(), metodoPago, userId } })
}

describe("obtenerCajaActual — sin caja abierta", () => {
  it("el dueño ve que no hay caja abierta y puede escribir", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    const actual = await obtenerCajaActual()
    expect(actual.abierta).toBeNull()
    expect(actual.montoEsperadoAhora).toBeNull()
    expect(actual.puedeEscribir).toBe(true)
  })
})

describe("abrirCaja", () => {
  it("crea una caja abierta con el monto de apertura indicado, sin empleado atribuido para el dueño", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    const actual = await obtenerCajaActual()
    expect(actual.abierta).not.toBeNull()
    expect(actual.abierta!.montoApertura).toBe(10000)
    expect(actual.abierta!.abiertoPorNombre).toBeNull()
  })

  it("atribuye la apertura al empleado que la hizo", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["caja"])
    await abrirCaja(5000)

    const actual = await obtenerCajaActual()
    expect(actual.abierta!.abiertoPorNombre).toBe("Ana")
  })

  it("rechaza abrir una segunda caja mientras la primera sigue abierta", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    // { error } como dato de retorno, no una excepción — ver comentario en
    // abrirCaja (caja-acciones.ts).
    const resultado = await abrirCaja(5000)
    expect(resultado?.error).toMatch(/ya hay una caja abierta/i)
  })

  it("rechaza un monto inválido", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    expect((await abrirCaja(-100))?.error).toMatch(/monto inválido/i)
    expect((await abrirCaja(NaN))?.error).toMatch(/monto inválido/i)
  })
})

describe("monto esperado — solo cuenta movimientos en Efectivo desde la apertura", () => {
  it("suma ventas/ingresos en efectivo, resta gastos/retiros en efectivo, ignora todo lo demás", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    await crearMovimiento(dueno.id, "VENTA", 5000, "Efectivo")
    await crearMovimiento(dueno.id, "VENTA", 8000, "Tarjeta") // no debe contar
    await crearMovimiento(dueno.id, "GASTO", 2000, "Efectivo")
    await crearMovimiento(dueno.id, "GASTO", 3000, "Transferencia") // no debe contar
    await crearMovimiento(dueno.id, "RETIRO", 1000, "Efectivo")
    await crearMovimiento(dueno.id, "INGRESO_EXTRA", 500, null) // sin método, no debe contar

    const actual = await obtenerCajaActual()
    // 10000 + 5000 - 2000 - 1000 = 12000
    expect(actual.montoEsperadoAhora).toBe(12000)
  })
})

describe("obtenerCajaActual — ventasPorMetodo (informativo, no filtra por método)", () => {
  it("agrupa TODO lo vendido del turno por método, a diferencia del cuadre que solo mira efectivo", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    await crearMovimiento(dueno.id, "VENTA", 5000, "Efectivo")
    await crearMovimiento(dueno.id, "VENTA", 8000, "Débito")
    await crearMovimiento(dueno.id, "VENTA", 3000, "Transferencia")
    await crearMovimiento(dueno.id, "GASTO", 1000, "Efectivo") // no es venta, no debe aparecer acá

    const actual = await obtenerCajaActual()
    expect(actual.ventasPorMetodo).toEqual([
      { metodo: "Débito", monto: 8000 },
      { metodo: "Efectivo", monto: 5000 },
      { metodo: "Transferencia", monto: 3000 },
    ])
  })
})

describe("cerrarCaja", () => {
  it("calcula esperado/diferencia y los deja fijos en el registro cerrado", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    await crearMovimiento(dueno.id, "VENTA", 5000, "Efectivo")

    await cerrarCaja(14500, "sobró un poco de vuelto")

    const historial = await obtenerHistorialCajas()
    expect(historial).toHaveLength(1)
    expect(historial[0].montoEsperado).toBe(15000)
    expect(historial[0].montoContado).toBe(14500)
    expect(historial[0].diferencia).toBe(-500)
    expect(historial[0].observacion).toBe("sobró un poco de vuelto")
    expect(historial[0].fechaCierre).not.toBeNull()
  })

  it("guarda el resumen de ventas por método del turno, para consulta futura en el historial", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    await crearMovimiento(dueno.id, "VENTA", 5000, "Efectivo")
    await crearMovimiento(dueno.id, "VENTA", 8000, "Débito")

    await cerrarCaja(15000)

    const historial = await obtenerHistorialCajas()
    expect(historial[0].ventasPorMetodoResumen).toBe("Débito $8.000 · Efectivo $5.000")
  })

  it("si no hubo ventas en el turno, el resumen queda null (no un string vacío)", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    await cerrarCaja(10000)

    const historial = await obtenerHistorialCajas()
    expect(historial[0].ventasPorMetodoResumen).toBeNull()
  })

  it("después de cerrar, no queda ninguna caja abierta", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    await cerrarCaja(10000)

    const actual = await obtenerCajaActual()
    expect(actual.abierta).toBeNull()
  })

  it("rechaza cerrar si no hay ninguna caja abierta", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    const resultado = await cerrarCaja(1000)
    expect(resultado?.error).toMatch(/no hay una caja abierta/i)
  })

  it("registra quién cerró, incluso si fue distinto a quien abrió", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["caja"])
    await abrirCaja(10000)
    comoEmpleado(dueno.id, "Beto", ["caja"])
    await cerrarCaja(10000)

    const historial = await obtenerHistorialCajas()
    expect(historial[0].abiertoPorNombre).toBe("Ana")
    expect(historial[0].cerradoPorNombre).toBe("Beto")
  })
})

describe("permisos — módulo \"caja\"", () => {
  it("un empleado sin el módulo \"caja\" no ve nada y no puede abrir", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana", ["venta"])

    const actual = await obtenerCajaActual()
    expect(actual.puedeEscribir).toBe(false)
    expect(actual.abierta).toBeNull()
    await expect(abrirCaja(1000)).rejects.toThrow(/no tienes acceso/i)
  })

  it("un empleado con \"caja:ro\" ve el estado pero no puede abrir ni cerrar", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    comoEmpleado(dueno.id, "Ana", ["caja:ro"])
    const actual = await obtenerCajaActual()
    expect(actual.abierta).not.toBeNull()
    expect(actual.puedeEscribir).toBe(false)
    await expect(cerrarCaja(10000)).rejects.toThrow(/solo de lectura/i)
  })
})
