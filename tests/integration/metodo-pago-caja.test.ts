import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { ingresarMovimiento, registrarPago, registrarPagoCuenta } from "@/app/actions/acciones"

// Mismos stubs que deudas.test.ts / race-conditions.test.ts.
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

// Regresión de esta auditoría: antes de este fix, un Gasto/Retiro/Ingreso
// Extra manual, un pago de deuda, o un cobro de cuenta por cobrar no
// guardaban ningún método de pago en el Movimiento resultante — lo que
// hacía imposible distinguir cuál de ellos pasó por la caja física en
// efectivo. Esto es justamente lo que necesita el cierre de caja
// (lib/caja.ts) para calcular el monto esperado.
describe("Movimiento.metodoPago queda guardado en todos los caminos que afectan la caja", () => {
  it("ingresarMovimiento (GASTO) sin método explícito asume Efectivo", async () => {
    await crearUsuario()
    await ingresarMovimiento(formData({ tipo: "GASTO", monto: "5000", fecha: "2026-11-05", categoria: "Insumos" }))
    const mov = await db.movimiento.findFirstOrThrow({ where: { userId: sesionActual!.user.id } })
    expect(mov.metodoPago).toBe("Efectivo")
  })

  it("ingresarMovimiento (RETIRO) respeta el método de pago enviado", async () => {
    await crearUsuario()
    await ingresarMovimiento(formData({ tipo: "RETIRO", monto: "10000", fecha: "2026-11-05", metodoPago: "Transferencia" }))
    const mov = await db.movimiento.findFirstOrThrow({ where: { userId: sesionActual!.user.id } })
    expect(mov.metodoPago).toBe("Transferencia")
  })

  it("registrarPago (deuda) sin método explícito asume Efectivo", async () => {
    const user = await crearUsuario()
    const deuda = await db.deuda.create({
      data: { acreedor: "Proveedor X", tipo: "Otros", monto: 50000, fechaDeuda: new Date(), userId: user.id },
    })
    await registrarPago(deuda.id, formData({ monto: "20000", fecha: "2026-11-05" }))
    const mov = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "GASTO" } })
    expect(mov.metodoPago).toBe("Efectivo")
  })

  it("registrarPago (deuda) respeta el método de pago enviado", async () => {
    const user = await crearUsuario()
    const deuda = await db.deuda.create({
      data: { acreedor: "Proveedor X", tipo: "Otros", monto: 50000, fechaDeuda: new Date(), userId: user.id },
    })
    await registrarPago(deuda.id, formData({ monto: "20000", fecha: "2026-11-05", metodoPago: "Transferencia" }))
    const mov = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "GASTO" } })
    expect(mov.metodoPago).toBe("Transferencia")
  })

  it("registrarPagoCuenta propaga el método de pago al Movimiento (antes quedaba sin guardar)", async () => {
    const user = await crearUsuario()
    const cuenta = await db.cuentaPorCobrar.create({
      data: { numero: 1, userId: user.id, montoOriginal: 15000, saldoPendiente: 15000, fechaVenta: new Date(), estado: "pendiente" },
    })
    await registrarPagoCuenta(cuenta.id, formData({ monto: "15000", fecha: "2026-11-05", metodoPago: "Débito" }))
    const mov = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "INGRESO_EXTRA" } })
    expect(mov.metodoPago).toBe("Débito")
  })

  it("registrarPagoCuenta sin método explícito asume Efectivo", async () => {
    const user = await crearUsuario()
    const cuenta = await db.cuentaPorCobrar.create({
      data: { numero: 1, userId: user.id, montoOriginal: 15000, saldoPendiente: 15000, fechaVenta: new Date(), estado: "pendiente" },
    })
    await registrarPagoCuenta(cuenta.id, formData({ monto: "15000", fecha: "2026-11-05" }))
    const mov = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "INGRESO_EXTRA" } })
    expect(mov.metodoPago).toBe("Efectivo")
  })
})
