import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { crearDeuda, registrarPago, editarDeuda } from "@/app/actions/acciones"

// Mismos stubs que en race-conditions.test.ts: acciones.ts importa NextAuth
// (vía getSession) y next/cache (revalidatePath), ninguno de los dos
// utilizable fuera del runtime de Next. vi.mock se hoistea antes que los
// imports de arriba.
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

// Reproduce el bug de producción (PR #73): una deuda donde el usuario deja
// "Monto original" vacío y solo carga cuota mensual + Nº de cuotas no debe
// poder quedar con monto=0 — eso dejaba cualquier intento de pago posterior
// rechazado por "el pago supera el saldo pendiente ($0)" sin que nada en la
// UI explicara por qué.
describe("crearDeuda — respaldo de monto cuando 'Monto original' queda vacío", () => {
  it("usa cuota × cuotas como monto si no se informa el monto original", async () => {
    await crearUsuario()
    await crearDeuda(formData({
      acreedor: "Banco Falso", tipo: "Crédito bancario",
      monto: "0", cuotaManual: "50000", cuotas: "2",
      fechaDeuda: new Date().toISOString(),
    }))

    const deuda = await db.deuda.findFirstOrThrow({ where: { acreedor: "Banco Falso" } })
    expect(Number(deuda.monto)).toBe(100000)
  })

  it("rechaza la deuda si ni el monto ni la cuota alcanzan para calcular un total", async () => {
    await crearUsuario()
    await expect(crearDeuda(formData({
      acreedor: "Banco Falso", tipo: "Otros",
      monto: "0", cuotaManual: "0", cuotas: "0",
      fechaDeuda: new Date().toISOString(),
    }))).rejects.toThrow()
  })
})

describe("registrarPago", () => {
  it("marca la deuda 'pagada' y suma cuotasPagadas cuando el pago cubre el saldo total", async () => {
    await crearUsuario()
    const deuda = await db.deuda.create({
      data: { acreedor: "Proveedor X", tipo: "Otros", monto: 100000, cuotas: 2, valorCuota: 50000, fechaDeuda: new Date(), userId: sesionActual!.user.id },
    })

    await registrarPago(deuda.id, formData({ monto: "50000", fecha: new Date().toISOString() }))
    const tras1 = await db.deuda.findUniqueOrThrow({ where: { id: deuda.id } })
    expect(tras1.pagada).toBe(false)
    expect(tras1.cuotasPagadas).toBe(1)

    await registrarPago(deuda.id, formData({ monto: "50000", fecha: new Date().toISOString() }))
    const tras2 = await db.deuda.findUniqueOrThrow({ where: { id: deuda.id } })
    expect(tras2.pagada).toBe(true)
    expect(tras2.cuotasPagadas).toBe(2)
    expect(Number(tras2.montoPagado)).toBe(100000)
  })

  // Esto es exactamente lo que le pasó al usuario en producción con la
  // deuda "banco bice": monto=0 por el bug ya corregido arriba, y cada
  // intento de pago quedaba rechazado en silencio (el toast de error existe,
  // pero nada en la UI distinguía ese rechazo de "ya está todo pagado").
  it("rechaza un pago si no hay saldo pendiente, en vez de aceptarlo silenciosamente", async () => {
    await crearUsuario()
    const deuda = await db.deuda.create({
      data: { acreedor: "Deuda en cero", tipo: "Otros", monto: 0, cuotas: 2, valorCuota: 50000, fechaDeuda: new Date(), userId: sesionActual!.user.id },
    })

    await expect(registrarPago(deuda.id, formData({ monto: "50000", fecha: new Date().toISOString() }))).rejects.toThrow(/saldo pendiente/)
    const pagos = await db.pagoDeuda.findMany({ where: { deudaId: deuda.id } })
    expect(pagos).toHaveLength(0)
  })
})

describe("editarDeuda", () => {
  it("rechaza bajar el total por debajo de lo ya pagado", async () => {
    await crearUsuario()
    const deuda = await db.deuda.create({
      data: { acreedor: "Proveedor Y", tipo: "Otros", monto: 100000, montoPagado: 60000, cuotas: 2, valorCuota: 50000, fechaDeuda: new Date(), userId: sesionActual!.user.id },
    })

    await expect(editarDeuda(deuda.id, formData({
      acreedor: "Proveedor Y", tipo: "Otros",
      monto: "40000", cuotaManual: "20000", cuotas: "2",
      fechaDeuda: new Date().toISOString(),
    }))).rejects.toThrow(/ya pagado/)
  })

  it("recalcula 'pagada' si el nuevo total ya no coincide con lo pagado", async () => {
    await crearUsuario()
    const deuda = await db.deuda.create({
      data: { acreedor: "Proveedor Z", tipo: "Otros", monto: 100000, montoPagado: 100000, pagada: true, cuotas: 2, valorCuota: 50000, fechaDeuda: new Date(), userId: sesionActual!.user.id },
    })

    // Se descubre que la deuda real era de 150.000, no 100.000 — ya no
    // debería figurar como "Pagada" solo porque lo estaba con el total viejo.
    await editarDeuda(deuda.id, formData({
      acreedor: "Proveedor Z", tipo: "Otros",
      monto: "150000", cuotaManual: "75000", cuotas: "2",
      fechaDeuda: new Date().toISOString(),
    }))

    const tras = await db.deuda.findUniqueOrThrow({ where: { id: deuda.id } })
    expect(tras.pagada).toBe(false)
  })
})
