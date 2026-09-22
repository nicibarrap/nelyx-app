import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { registrarPagoCuenta, marcarCostoPagado } from "@/app/actions/acciones"

// Mismos stubs que en email-case-insensitive.test.ts: acciones.ts importa
// NextAuth (vía getSession) y next/cache (revalidatePath), ninguno de los
// dos utilizables fuera del runtime de Next. vi.mock se hoistea antes que
// los imports de arriba.
let sesionActual: { user: { id: string; esEmpleado: boolean; name: string } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/push", () => ({ enviarPushAUsuario: vi.fn() }))

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

// Estos tests validan directamente el arreglo de condición de carrera del
// 21/09: dos pagos casi simultáneos sobre la MISMA cuenta/generación de
// costo ya no deben poder pisarse (lost update) ni duplicar el registro
// contable. Se dispara la operación dos veces en paralelo de verdad
// (Promise.allSettled), contra la base de datos real.
describe("registrarPagoCuenta bajo concurrencia real", () => {
  it("la contabilidad siempre cuadra con muchos pagos simultáneos (nunca se pierde ni se duplica uno)", async () => {
    const user = await crearUsuario()
    const cliente = await db.cliente.create({ data: { nombre: "Cliente X", userId: user.id } })
    const MONTO_ORIGINAL = 2000
    const cuenta = await db.cuentaPorCobrar.create({
      data: {
        numero: 1, clienteId: cliente.id, userId: user.id,
        montoOriginal: MONTO_ORIGINAL, saldoPendiente: MONTO_ORIGINAL,
        fechaVenta: new Date(), estado: "pendiente",
      },
    })

    // 8 pagos de 700 a la vez sobre una cuenta de 2000: como máximo 2
    // pueden aplicarse de verdad (1400 ≤ 2000, un tercero ya se pasaría).
    // Con el bug de antes (leer-calcular-escribir sin transacción), dos
    // pagos que se solapan pueden "ganar" ambos con el mismo saldo viejo:
    // el saldo final queda mal, pero los dos pagos SÍ quedan guardados —
    // la suma de pagos deja de coincidir con lo que bajó el saldo. Esa
    // es la invariante que se comprueba acá, sea cual sea la cantidad
    // exacta de pagos que gane la carrera.
    await Promise.allSettled(
      Array.from({ length: 8 }, () => registrarPagoCuenta(cuenta.id, formData({ monto: "700", fecha: new Date().toISOString() })))
    )

    const pagos = await db.pagoCuenta.findMany({ where: { cuentaId: cuenta.id } })
    const cuentaFinal = await db.cuentaPorCobrar.findUniqueOrThrow({ where: { id: cuenta.id } })
    const totalPagado = pagos.reduce((a, p) => a + Number(p.monto), 0)

    expect(Number(cuentaFinal.saldoPendiente)).toBe(MONTO_ORIGINAL - totalPagado)
    expect(Number(cuentaFinal.saldoPendiente)).toBeGreaterThanOrEqual(0)
  })
})

describe("marcarCostoPagado bajo concurrencia real", () => {
  it("dos clics simultáneos no duplican el movimiento contable", async () => {
    const user = await crearUsuario()
    const costo = await db.costoFijoRecurrente.create({
      data: { nombre: "Arriendo", monto: 100000, fechaInicio: new Date(), estado: "activo", userId: user.id },
    })
    const generacion = await db.generacionCosto.create({
      data: { costoFijoId: costo.id, mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), pagado: false },
    })

    const resultados = await Promise.allSettled([
      marcarCostoPagado(generacion.id, formData({ monto: "100000", fecha: new Date().toISOString() })),
      marcarCostoPagado(generacion.id, formData({ monto: "100000", fecha: new Date().toISOString() })),
    ])

    const exitosos = resultados.filter(r => r.status === "fulfilled")
    expect(exitosos.length).toBe(1)

    const movimientos = await db.movimiento.findMany({ where: { userId: user.id, tipo: "COSTO_FIJO" } })
    expect(movimientos.length).toBe(1)

    const generacionFinal = await db.generacionCosto.findUniqueOrThrow({ where: { id: generacion.id } })
    expect(generacionFinal.pagado).toBe(true)
    expect(generacionFinal.movimientoId).toBe(movimientos[0].id)
  })
})
