import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { abrirCaja, cerrarCaja, obtenerCajaActual, obtenerHistorialCajas, resolverCajaParaMovimiento } from "@/app/actions/caja-acciones"

let sesionActual: { user: { id: string; esEmpleado?: boolean; name: string; modulosPermitidos?: string[] | null; empleadoId?: string } } | null = null
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

// Crea una fila real de empleado con empleadoId, igual que un login real
// por PIN — ver el mismo comentario en empleados-permisos.test.ts. Devuelve
// el id real del empleado, para los tests que necesitan simular un
// movimiento creado por él sin pasar por un cambio de sesión.
async function comoEmpleado(duenoId: string, nombre: string, modulosPermitidos: string[]) {
  const empleado = await db.user.create({
    data: { nombre, email: `empleado-${Math.random()}@nelyx.local`, password: "x", cuentaPrincipalId: duenoId, pin: "x", modulosPermitidos, activo: true },
  })
  sesionActual = { user: { id: duenoId, esEmpleado: true, name: nombre, modulosPermitidos, empleadoId: empleado.id } }
  return empleado
}

// Igual que el código real (ver cada sitio en acciones.ts que crea un
// Movimiento): resuelve a cuál caja abierta queda ligado, según quién lo
// hizo — sin esto, un movimiento creado acá no participaría de ningún
// cuadre aunque haya una caja abierta, porque obtenerCajaActual/cerrarCaja
// filtran por cierreCajaId, no por rango de fechas.
async function crearMovimiento(userId: string, tipo: string, monto: number, metodoPago: string | null, empleadoId: string | null = null) {
  const cierreCajaId = await resolverCajaParaMovimiento(db, userId, empleadoId)
  return db.movimiento.create({ data: { tipo: tipo as any, monto, fecha: new Date(), metodoPago, userId, realizadoPorEmpleadoId: empleadoId, cierreCajaId } })
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
    await comoEmpleado(dueno.id, "Ana", ["caja"])
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

describe("obtenerCajaActual — gastosPorMetodo (informativo, no filtra por método)", () => {
  it("agrupa TODO lo gastado del turno por método, igual que ventasPorMetodo pero para egresos", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    await crearMovimiento(dueno.id, "COSTO_FIJO", 1500, "Efectivo")
    await crearMovimiento(dueno.id, "GASTO", 2000, "Transferencia")
    await crearMovimiento(dueno.id, "VENTA", 5000, "Efectivo") // no es gasto, no debe aparecer acá

    const actual = await obtenerCajaActual()
    expect(actual.gastosPorMetodo).toEqual([
      { metodo: "Transferencia", monto: 2000 },
      { metodo: "Efectivo", monto: 1500 },
    ])
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

  it("guarda el resumen de gastos por método del turno — así se puede verificar que un costo fijo en efectivo sí quedó contado, no solo confiar en el número final", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(50000)
    await crearMovimiento(dueno.id, "COSTO_FIJO", 20000, "Efectivo")
    await crearMovimiento(dueno.id, "GASTO", 3000, "Transferencia")

    await cerrarCaja(30000)

    const historial = await obtenerHistorialCajas()
    expect(historial[0].gastosPorMetodoResumen).toBe("Efectivo $20.000 · Transferencia $3.000")
    expect(historial[0].montoEsperado).toBe(30000) // 50000 - 20000 (solo el de efectivo)
  })

  it("si no hubo gastos en el turno, el resumen de gastos queda null (no un string vacío)", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    await cerrarCaja(10000)

    const historial = await obtenerHistorialCajas()
    expect(historial[0].gastosPorMetodoResumen).toBeNull()
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

  it("registra quién cerró, incluso si fue distinto a quien abrió — visible para el dueño", async () => {
    const dueno = await crearDueno()
    await comoEmpleado(dueno.id, "Ana", ["caja"])
    await abrirCaja(10000)
    await comoEmpleado(dueno.id, "Beto", ["caja"])
    await cerrarCaja(10000)

    // El historial completo (de cualquier operador) solo lo ve el dueño —
    // ver describe("visibilidad del historial...") más abajo.
    comoDueno(dueno)
    const historial = await obtenerHistorialCajas()
    expect(historial[0].abiertoPorNombre).toBe("Ana")
    expect(historial[0].cerradoPorNombre).toBe("Beto")
  })
})

describe("permisos — módulo \"caja\"", () => {
  it("un empleado sin el módulo \"caja\" no ve nada y no puede abrir", async () => {
    const dueno = await crearDueno()
    await comoEmpleado(dueno.id, "Ana", ["venta"])

    const actual = await obtenerCajaActual()
    expect(actual.puedeEscribir).toBe(false)
    expect(actual.abierta).toBeNull()
    const resultado = await abrirCaja(1000)
    expect(resultado?.error).toMatch(/no tienes acceso/i)
  })

  it("un empleado con \"caja:ro\" ve el estado pero no puede abrir ni cerrar", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    await comoEmpleado(dueno.id, "Ana", ["caja:ro"])
    const actual = await obtenerCajaActual()
    expect(actual.abierta).not.toBeNull()
    expect(actual.puedeEscribir).toBe(false)
    const resultado = await cerrarCaja(10000)
    expect(resultado?.error).toMatch(/solo de lectura/i)
  })
})

// Caso real: en una feria, el dueño y uno o más ayudantes venden al mismo
// tiempo, cada uno con su propio fondo de cambio — no hay una sola caja
// física compartida. Estos tests cubren que cada uno pueda tener la suya
// abierta en paralelo, sin que se mezclen entre sí ni con el comportamiento
// de siempre (una sola caja compartida) cuando solo una está abierta.
describe("cajas concurrentes — un operador puede tener la suya sin afectar la de otro", () => {
  it("el dueño y un empleado pueden tener cada uno su propia caja abierta a la vez", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    expect(await abrirCaja(10000)).toBeUndefined()

    await comoEmpleado(dueno.id, "Ana", ["caja"])
    expect(await abrirCaja(5000)).toBeUndefined()

    // Ana ve su propia caja, pero no la visión de conjunto de las demás —
    // esa es exclusiva del dueño (ver describe de visibilidad más abajo).
    const deAna = await obtenerCajaActual()
    expect(deAna.abierta?.montoApertura).toBe(5000)
    expect(deAna.otrasAbiertas).toHaveLength(0)

    comoDueno(dueno)
    const delDueno = await obtenerCajaActual()
    expect(delDueno.abierta?.montoApertura).toBe(10000)
    expect(delDueno.otrasAbiertas).toHaveLength(1)
    expect(delDueno.otrasAbiertas[0].abiertoPorNombre).toBe("Ana")
  })

  it("un segundo empleado también puede abrir la suya sin que ninguna de las otras dos se vea afectada", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    await comoEmpleado(dueno.id, "Ana", ["caja"])
    await abrirCaja(5000)

    await comoEmpleado(dueno.id, "Beto", ["caja"])
    expect(await abrirCaja(3000)).toBeUndefined()

    // Beto ve la suya, pero no las ajenas.
    const deBeto = await obtenerCajaActual()
    expect(deBeto.abierta?.montoApertura).toBe(3000)
    expect(deBeto.otrasAbiertas).toHaveLength(0)

    // El dueño sí ve las tres (la propia no cuenta como "otra").
    comoDueno(dueno)
    const delDueno = await obtenerCajaActual()
    expect(delDueno.otrasAbiertas.map(o => o.montoApertura).sort((a, b) => a - b)).toEqual([3000, 5000])
  })

  it("cada caja concurrente cuenta solo el efectivo de su propio operador, sin mezclarse con la de otro", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    const ana = await comoEmpleado(dueno.id, "Ana", ["caja"])
    const sesionDeAna = sesionActual
    await abrirCaja(5000)

    // Venta del dueño en efectivo — no debe entrar en el cuadre de Ana.
    await crearMovimiento(dueno.id, "VENTA", 8000, "Efectivo", null)
    // Venta de Ana en efectivo — no debe entrar en el cuadre del dueño.
    await crearMovimiento(dueno.id, "VENTA", 2000, "Efectivo", ana.id)

    comoDueno(dueno)
    expect((await obtenerCajaActual()).montoEsperadoAhora).toBe(18000) // 10000 + 8000

    sesionActual = sesionDeAna
    expect((await obtenerCajaActual()).montoEsperadoAhora).toBe(7000) // 5000 + 2000
  })

  it("un movimiento creado sin caja propia, habiendo una sola abierta en la cuenta, sigue sumando a esa (caso de siempre: una sola caja compartida)", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)

    // Un empleado SIN caja propia abierta vende contra la única caja
    // compartida que hay — igual que siempre, antes de que existieran las
    // cajas concurrentes.
    await crearMovimiento(dueno.id, "VENTA", 4000, "Efectivo", "empleado-sin-caja-propia")

    expect((await obtenerCajaActual()).montoEsperadoAhora).toBe(14000)
  })

  it("cierra una caja ajena pasando su id explícito, sin tocar la propia del que cierra", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    const ana = await comoEmpleado(dueno.id, "Ana", ["caja"])
    await abrirCaja(5000)
    const cajaDeAna = (await obtenerCajaActual()).abierta!

    comoDueno(dueno)
    const resultado = await cerrarCaja(5000, "cierre de fin de turno de Ana", cajaDeAna.id)
    expect(resultado).toBeUndefined()

    // La del dueño sigue abierta — cerrar la de Ana no la tocó.
    expect((await obtenerCajaActual()).abierta?.montoApertura).toBe(10000)

    const historial = await obtenerHistorialCajas()
    const cerradaDeAna = historial.find(h => h.id === cajaDeAna.id)
    expect(cerradaDeAna?.abiertoPorNombre).toBe("Ana")
    expect(cerradaDeAna?.montoContado).toBe(5000)
  })
})

// La visión de conjunto (cuáles otras cajas están abiertas ahora, y el
// historial de TODAS las que se han cerrado, sin importar quién) es
// exclusiva del dueño — sirve para que pueda supervisar todo el negocio.
// Un empleado solo ve su propio estado y su propio historial.
describe("visibilidad de conjunto — solo el dueño ve todas las cajas (abiertas e historial)", () => {
  it("un empleado no ve 'otrasAbiertas' aunque haya otras cajas abiertas en la cuenta", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    await comoEmpleado(dueno.id, "Ana", ["caja"])
    // Con la del dueño ya abierta, Ana necesita abrir la suya propia para
    // que exista una "otra" que podría aparecerle — si no abre la suya,
    // ve la del dueño como "la" caja compartida (comportamiento de
    // siempre cuando solo hay una abierta en toda la cuenta).
    await abrirCaja(5000)

    const actual = await obtenerCajaActual()
    expect(actual.abierta?.montoApertura).toBe(5000) // la propia de Ana
    expect(actual.otrasAbiertas).toHaveLength(0) // no ve la del dueño ahí
  })

  it("un empleado no ve en su historial las cajas que abrió/cerró otro operador", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    await cerrarCaja(10000)

    await comoEmpleado(dueno.id, "Ana", ["caja"])
    await abrirCaja(5000)
    await cerrarCaja(5000)

    const historialDeAna = await obtenerHistorialCajas()
    expect(historialDeAna).toHaveLength(1)
    expect(historialDeAna[0].abiertoPorNombre).toBe("Ana")
  })

  it("el dueño ve en su historial las cajas de todos los operadores", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await abrirCaja(10000)
    await cerrarCaja(10000)

    await comoEmpleado(dueno.id, "Ana", ["caja"])
    await abrirCaja(5000)
    await cerrarCaja(5000)

    comoDueno(dueno)
    const historialDelDueno = await obtenerHistorialCajas()
    expect(historialDelDueno).toHaveLength(2)
  })
})
