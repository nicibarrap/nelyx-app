import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { registrarVenta, registrarCambioProducto, obtenerMovimientoParaCambio } from "@/app/actions/acciones"
import { registrarMovimientoStock } from "@/lib/stock"
import { calcularLotesProducto } from "@/lib/lotes"

// Mismos stubs que lotes-fifo.test.ts: acciones.ts importa NextAuth (vía
// getSession) y next/cache (revalidatePath), ninguno de los dos utilizable
// fuera del runtime de Next.
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

async function crearProducto(userId: string, nombre: string, costo: number, precio: number) {
  return db.producto.create({
    data: { userId, nombre, controlaInventario: true, stock: 0, costo, precio, unidadMedida: "unidad", formaVenta: "unidad" },
  })
}

describe("Cambio de producto — registrarCambioProducto", () => {
  it("diferencia > 0: crea DEVOLUCION (monto negativo) y VENTA nueva enlazadas, sin tocar la venta original", async () => {
    const user = await crearUsuario()
    const vinoChico = await crearProducto(user.id, "Vino chico", 500, 1000)
    const vinoGrande = await crearProducto(user.id, "Vino grande", 800, 1500)
    await registrarMovimientoStock({ productoId: vinoChico.id, userId: user.id, tipo: "reposicion", cantidad: 5, fechaVencimiento: new Date("2026-12-01") })
    await registrarMovimientoStock({ productoId: vinoGrande.id, userId: user.id, tipo: "reposicion", cantidad: 5, fechaVencimiento: new Date("2026-12-01") })

    await registrarVenta([{ productoId: vinoChico.id, nombre: vinoChico.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    const origen = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: vinoChico.id } })

    const resultado = await registrarCambioProducto(
      origen.id,
      [{ productoId: vinoGrande.id, nombre: vinoGrande.nombre, precio: 1500, cantidad: 1 }],
      new Date().toISOString(), null, "Efectivo",
    )
    expect(resultado.ok).toBe(true)

    // La venta original sigue exactamente igual que antes.
    const origenFresh = await db.movimiento.findUniqueOrThrow({ where: { id: origen.id } })
    expect(origenFresh.tipo).toBe("VENTA")
    expect(Number(origenFresh.monto)).toBe(1000)

    const devolucion = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "DEVOLUCION" } })
    expect(Number(devolucion.monto)).toBe(-1000) // negado — ver comentario en acciones.ts
    expect(devolucion.movimientoVinculadoId).toBe(origen.id)
    expect(devolucion.productoId).toBe(vinoChico.id)

    const ventaNueva = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: vinoGrande.id } })
    expect(Number(ventaNueva.monto)).toBe(1500)
    expect(ventaNueva.movimientoVinculadoId).toBe(devolucion.id)

    // Stock: el chico vuelve a 5 (se devolvió la unidad), el grande baja a 4.
    const chicoFinal = await db.producto.findUniqueOrThrow({ where: { id: vinoChico.id } })
    const grandeFinal = await db.producto.findUniqueOrThrow({ where: { id: vinoGrande.id } })
    expect(chicoFinal.stock).toBe(5)
    expect(grandeFinal.stock).toBe(4)
  })

  it("diferencia < 0: la suma implícita (venta nueva + devolución) da el monto negativo a devolver", async () => {
    const user = await crearUsuario()
    const caro = await crearProducto(user.id, "Caro", 1200, 2000)
    const barato = await crearProducto(user.id, "Barato", 400, 1000)
    await registrarMovimientoStock({ productoId: caro.id, userId: user.id, tipo: "reposicion", cantidad: 3, fechaVencimiento: new Date("2026-12-01") })
    await registrarMovimientoStock({ productoId: barato.id, userId: user.id, tipo: "reposicion", cantidad: 3, fechaVencimiento: new Date("2026-12-01") })

    await registrarVenta([{ productoId: caro.id, nombre: caro.nombre, precio: 2000, cantidad: 1 }], new Date().toISOString())
    const origen = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: caro.id } })

    const resultado = await registrarCambioProducto(
      origen.id,
      [{ productoId: barato.id, nombre: barato.nombre, precio: 1000, cantidad: 1 }],
      new Date().toISOString(), null, "Efectivo",
    )
    expect(resultado.ok).toBe(true)

    const devolucion = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "DEVOLUCION" } })
    const ventaNueva = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: barato.id } })
    // -2000 (devolución) + 1000 (venta nueva) = -1000 → se le devuelven $1000 al cliente.
    expect(Number(devolucion.monto) + Number(ventaNueva.monto)).toBe(-1000)
  })

  it("diferencia == 0: no hace falta metodoPago y el cambio se registra igual", async () => {
    const user = await crearUsuario()
    const a = await crearProducto(user.id, "A", 500, 1000)
    const b = await crearProducto(user.id, "B", 500, 1000)
    await registrarMovimientoStock({ productoId: a.id, userId: user.id, tipo: "reposicion", cantidad: 2, fechaVencimiento: new Date("2026-12-01") })
    await registrarMovimientoStock({ productoId: b.id, userId: user.id, tipo: "reposicion", cantidad: 2, fechaVencimiento: new Date("2026-12-01") })

    await registrarVenta([{ productoId: a.id, nombre: a.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    const origen = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: a.id } })

    const resultado = await registrarCambioProducto(
      origen.id,
      [{ productoId: b.id, nombre: b.nombre, precio: 1000, cantidad: 1 }],
      new Date().toISOString(), null, undefined,
    )
    expect(resultado.ok).toBe(true)

    const ventaNueva = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: b.id } })
    expect(ventaNueva.metodoPago).toBeNull()
  })

  it("devuelve el stock exactamente a los lotes originales cuando la venta cruzó varios lotes, y la venta nueva consume FIFO normal", async () => {
    const user = await crearUsuario()
    const vino = await crearProducto(user.id, "Vino", 500, 1000)
    const jugo = await crearProducto(user.id, "Jugo", 300, 800)
    // Lote 1: 1 unidad (vence antes), Lote 2: 2 unidades (vence después) — mismo escenario que lotes-fifo.test.ts.
    await registrarMovimientoStock({ productoId: vino.id, userId: user.id, tipo: "reposicion", cantidad: 1, fechaVencimiento: new Date("2026-08-27") })
    await registrarMovimientoStock({ productoId: vino.id, userId: user.id, tipo: "reposicion", cantidad: 2, fechaVencimiento: new Date("2026-10-16") })
    await registrarMovimientoStock({ productoId: jugo.id, userId: user.id, tipo: "reposicion", cantidad: 5, fechaVencimiento: new Date("2026-09-01") })

    // Venta de 2 unidades de vino: agota el lote 1 y saca 1 del lote 2.
    await registrarVenta([{ productoId: vino.id, nombre: vino.nombre, precio: 1000, cantidad: 2 }], new Date().toISOString())
    const origen = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: vino.id } })

    const resultado = await registrarCambioProducto(
      origen.id,
      [{ productoId: jugo.id, nombre: jugo.nombre, precio: 800, cantidad: 1 }],
      new Date().toISOString(), null, "Efectivo",
    )
    expect(resultado.ok).toBe(true)

    // El vino vuelve a sus 2 lotes originales, cada uno con su cantidad exacta.
    const lotesVino = await calcularLotesProducto(vino.id, user.id)
    expect(lotesVino).toHaveLength(2)
    const lote1 = lotesVino.find(l => l.fechaVencimiento === new Date("2026-08-27").toISOString())!
    const lote2 = lotesVino.find(l => l.fechaVencimiento === new Date("2026-10-16").toISOString())!
    expect(lote1.cantidadRestante).toBe(1)
    expect(lote2.cantidadRestante).toBe(2)

    const vinoFinal = await db.producto.findUniqueOrThrow({ where: { id: vino.id } })
    expect(vinoFinal.stock).toBe(3)

    // El jugo salió del único lote que tiene, por FIFO normal.
    const jugoFinal = await db.producto.findUniqueOrThrow({ where: { id: jugo.id } })
    expect(jugoFinal.stock).toBe(4)
  })

  it("rechaza cambiar dos veces la misma venta", async () => {
    const user = await crearUsuario()
    const a = await crearProducto(user.id, "A", 500, 1000)
    const b = await crearProducto(user.id, "B", 500, 1000)
    const c = await crearProducto(user.id, "C", 500, 1000)
    await registrarMovimientoStock({ productoId: a.id, userId: user.id, tipo: "reposicion", cantidad: 1, fechaVencimiento: new Date("2026-12-01") })
    await registrarMovimientoStock({ productoId: b.id, userId: user.id, tipo: "reposicion", cantidad: 1, fechaVencimiento: new Date("2026-12-01") })
    await registrarMovimientoStock({ productoId: c.id, userId: user.id, tipo: "reposicion", cantidad: 1, fechaVencimiento: new Date("2026-12-01") })

    await registrarVenta([{ productoId: a.id, nombre: a.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    const origen = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: a.id } })

    const primero = await registrarCambioProducto(origen.id, [{ productoId: b.id, nombre: b.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    expect(primero.ok).toBe(true)

    const segundo = await registrarCambioProducto(origen.id, [{ productoId: c.id, nombre: c.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    expect(segundo.ok).toBe(false)
    expect(segundo.error).toMatch(/ya fue cambiada/)

    // obtenerMovimientoParaCambio también lo rechaza, con el mismo motivo.
    await expect(obtenerMovimientoParaCambio(origen.id)).rejects.toThrow(/ya fue cambiada/)
  })

  it("maneja una venta original sin clienteId, y usa el clienteId del origen si el cambio no manda uno propio", async () => {
    const user = await crearUsuario()
    const a = await crearProducto(user.id, "A", 500, 1000)
    const b = await crearProducto(user.id, "B", 500, 1000)
    await registrarMovimientoStock({ productoId: a.id, userId: user.id, tipo: "reposicion", cantidad: 1, fechaVencimiento: new Date("2026-12-01") })
    await registrarMovimientoStock({ productoId: b.id, userId: user.id, tipo: "reposicion", cantidad: 1, fechaVencimiento: new Date("2026-12-01") })

    // Venta sin cliente asociado — caso común, no todas las ventas tienen uno.
    await registrarVenta([{ productoId: a.id, nombre: a.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    const origen = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: a.id } })
    expect(origen.clienteId).toBeNull()

    const resultado = await registrarCambioProducto(origen.id, [{ productoId: b.id, nombre: b.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    expect(resultado.ok).toBe(true)

    const ventaNueva = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: b.id } })
    expect(ventaNueva.clienteId).toBeNull()
  })

  it("rechaza el cambio si el producto nuevo no tiene stock suficiente", async () => {
    const user = await crearUsuario()
    const a = await crearProducto(user.id, "A", 500, 1000)
    const b = await crearProducto(user.id, "B", 500, 1000)
    await registrarMovimientoStock({ productoId: a.id, userId: user.id, tipo: "reposicion", cantidad: 1, fechaVencimiento: new Date("2026-12-01") })
    // b se queda sin stock a propósito.

    await registrarVenta([{ productoId: a.id, nombre: a.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    const origen = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: a.id } })

    const resultado = await registrarCambioProducto(origen.id, [{ productoId: b.id, nombre: b.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    expect(resultado.ok).toBe(false)
    expect(resultado.error).toMatch(/Stock insuficiente/)
  })

  it("rechaza el cambio si la venta no tiene producto asociado (ej. monto libre)", async () => {
    const user = await crearUsuario()
    const b = await crearProducto(user.id, "B", 500, 1000)
    await registrarMovimientoStock({ productoId: b.id, userId: user.id, tipo: "reposicion", cantidad: 1, fechaVencimiento: new Date("2026-12-01") })

    // Venta de monto libre, sin producto.
    await registrarVenta([{ productoId: null, nombre: "Venta", precio: 5000, cantidad: 1 }], new Date().toISOString())
    const origen = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA", productoId: null } })

    await expect(obtenerMovimientoParaCambio(origen.id)).rejects.toThrow(/no tiene un producto asociado/)
    const resultado = await registrarCambioProducto(origen.id, [{ productoId: b.id, nombre: b.nombre, precio: 1000, cantidad: 1 }], new Date().toISOString())
    expect(resultado.ok).toBe(false)
    expect(resultado.error).toMatch(/no tiene un producto asociado/)
  })
})
