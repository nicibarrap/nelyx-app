import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { registrarVenta, eliminarMovimiento } from "@/app/actions/acciones"
import { registrarMovimientoStock } from "@/lib/stock"
import { calcularLotesProducto } from "@/lib/lotes"
import { obtenerLotesPorVencer, obtenerHistorialProducto } from "@/app/actions/kardex-acciones"

// Mismos stubs que race-conditions.test.ts: acciones.ts importa NextAuth
// (vía getSession) y next/cache (revalidatePath), ninguno de los dos
// utilizable fuera del runtime de Next.
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

// Bug real reportado: una venta que vende más unidades de las que hay en el
// lote más próximo a vencer amarraba la salida COMPLETA a ese único lote
// (obtenerLoteFIFO devolvía una sola fecha). El lote siguiente quedaba
// intacto en el cálculo aunque parte de la venta en realidad hubiera salido
// de él — el stock total del producto bajaba bien, pero la suma por lote ya
// no coincidía con él. Arreglo: calcularConsumoFIFO reparte la venta entre
// tantos lotes como haga falta, en orden de vencimiento.
describe("Venta que cruza varios lotes (FIFO)", () => {
  it("reparte la salida entre lotes y dejan el que sobra con la cantidad correcta", async () => {
    const user = await crearUsuario()
    const producto = await db.producto.create({
      data: {
        userId: user.id, nombre: "Ollas", controlaInventario: true, stock: 0,
        costo: 1017, precio: 1525, unidadMedida: "unidad", formaVenta: "unidad",
      },
    })

    // Lote 1: 1 unidad, vence antes. Lote 2: 2 unidades, vence después —
    // exactamente el escenario reportado.
    await registrarMovimientoStock({
      productoId: producto.id, userId: user.id, tipo: "reposicion",
      cantidad: 1, fechaVencimiento: new Date("2026-08-27"),
    })
    await registrarMovimientoStock({
      productoId: producto.id, userId: user.id, tipo: "reposicion",
      cantidad: 2, fechaVencimiento: new Date("2026-10-16"),
    })

    const lotesAntes = await calcularLotesProducto(producto.id, user.id)
    expect(lotesAntes).toHaveLength(2)
    expect(lotesAntes[0].cantidadRestante).toBe(1)
    expect(lotesAntes[1].cantidadRestante).toBe(2)

    // Venta de 2 unidades: agota el lote 1 (1 unidad) y saca 1 más del lote 2.
    await registrarVenta(
      [{ productoId: producto.id, nombre: producto.nombre, precio: 1525, cantidad: 2 }],
      new Date().toISOString(),
    )

    const productoFinal = await db.producto.findUniqueOrThrow({ where: { id: producto.id } })
    expect(productoFinal.stock).toBe(1)

    const lotesDespues = await calcularLotesProducto(producto.id, user.id)
    expect(lotesDespues).toHaveLength(1)
    expect(lotesDespues[0].numero).toBe(1)
    expect(lotesDespues[0].cantidadRestante).toBe(1)
    expect(lotesDespues[0].fechaVencimiento).toBe(new Date("2026-10-16").toISOString())

    // El Kardex de la venta debe tener una fila por lote tocado, cada una
    // amarrada a su propia fecha de vencimiento (no las dos a la misma).
    const movVenta = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA" } })
    const kardexVenta = await db.movimientoStock.findMany({ where: { movimientoId: movVenta.id }, orderBy: { fechaVencimiento: "asc" } })
    expect(kardexVenta).toHaveLength(2)
    expect(kardexVenta[0].cantidad).toBe(-1)
    expect(kardexVenta[0].fechaVencimiento?.toISOString()).toBe(new Date("2026-08-27").toISOString())
    expect(kardexVenta[1].cantidad).toBe(-1)
    expect(kardexVenta[1].fechaVencimiento?.toISOString()).toBe(new Date("2026-10-16").toISOString())
  })

  it("eliminar la venta devuelve cada unidad a su lote de origen, no a un lote sin fecha", async () => {
    const user = await crearUsuario()
    const producto = await db.producto.create({
      data: {
        userId: user.id, nombre: "Ollas", controlaInventario: true, stock: 0,
        costo: 1017, precio: 1525, unidadMedida: "unidad", formaVenta: "unidad",
      },
    })
    await registrarMovimientoStock({
      productoId: producto.id, userId: user.id, tipo: "reposicion",
      cantidad: 1, fechaVencimiento: new Date("2026-08-27"),
    })
    await registrarMovimientoStock({
      productoId: producto.id, userId: user.id, tipo: "reposicion",
      cantidad: 2, fechaVencimiento: new Date("2026-10-16"),
    })

    await registrarVenta(
      [{ productoId: producto.id, nombre: producto.nombre, precio: 1525, cantidad: 2 }],
      new Date().toISOString(),
    )
    const movVenta = await db.movimiento.findFirstOrThrow({ where: { userId: user.id, tipo: "VENTA" } })

    await eliminarMovimiento(movVenta.id)

    const productoFinal = await db.producto.findUniqueOrThrow({ where: { id: producto.id } })
    expect(productoFinal.stock).toBe(3)

    const lotesFinal = await calcularLotesProducto(producto.id, user.id)
    expect(lotesFinal).toHaveLength(2)
    expect(lotesFinal[0].cantidadRestante).toBe(1)
    expect(lotesFinal[1].cantidadRestante).toBe(2)
  })
})

// Bug real reportado: al vender por completo un lote con fecha de
// vencimiento, seguía apareciendo en "Productos por vencer" (Alertas) y el
// botón "✓ Resuelto" seguía ofreciéndose en el historial del producto —
// ambos leían la cantidad de la reposición original, nunca lo que de verdad
// quedaba en ese lote. El dueño tenía que marcarlo manualmente aunque ya no
// quedara ni una unidad por vencer.
describe("Alertas de vencimiento se resuelven solas al agotarse el lote", () => {
  it("obtenerLotesPorVencer deja de listar un lote apenas se vende por completo", async () => {
    const user = await crearUsuario()
    const producto = await db.producto.create({
      data: {
        userId: user.id, nombre: "Platano", controlaInventario: true, stock: 0,
        costo: 900, precio: 1688, unidadMedida: "unidad", formaVenta: "unidad",
      },
    })
    const fechaVencimiento = new Date(Date.now() + 86400000) // mañana
    await registrarMovimientoStock({
      productoId: producto.id, userId: user.id, tipo: "reposicion",
      cantidad: 2, fechaVencimiento,
    })

    const antes = await obtenerLotesPorVencer()
    expect(antes.some(l => l.productoNombre === "Platano")).toBe(true)

    await registrarVenta(
      [{ productoId: producto.id, nombre: producto.nombre, precio: 1688, cantidad: 2 }],
      new Date().toISOString(),
    )

    const despues = await obtenerLotesPorVencer()
    expect(despues.some(l => l.productoNombre === "Platano")).toBe(false)
  })

  it("obtenerHistorialProducto marca loteVigente=false y oculta '✓ Resuelto' una vez agotado el lote", async () => {
    const user = await crearUsuario()
    const producto = await db.producto.create({
      data: {
        userId: user.id, nombre: "Platano", controlaInventario: true, stock: 0,
        costo: 900, precio: 1688, unidadMedida: "unidad", formaVenta: "unidad",
      },
    })
    const fechaVencimiento = new Date(Date.now() + 86400000)
    await registrarMovimientoStock({
      productoId: producto.id, userId: user.id, tipo: "reposicion",
      cantidad: 2, fechaVencimiento,
    })

    const historialAntes = await obtenerHistorialProducto(producto.id)
    const entradaAntes = historialAntes.items.find(i => i.tipo === "reposicion")!
    expect(entradaAntes.loteVigente).toBe(true)

    await registrarVenta(
      [{ productoId: producto.id, nombre: producto.nombre, precio: 1688, cantidad: 2 }],
      new Date().toISOString(),
    )

    const historialDespues = await obtenerHistorialProducto(producto.id)
    const entradaDespues = historialDespues.items.find(i => i.tipo === "reposicion")!
    expect(entradaDespues.loteVigente).toBe(false)
  })

  it("una reposición nueva de otro lote no se ve afectada por el lote ya agotado de otra fecha", async () => {
    const user = await crearUsuario()
    const producto = await db.producto.create({
      data: {
        userId: user.id, nombre: "Platano", controlaInventario: true, stock: 0,
        costo: 900, precio: 1688, unidadMedida: "unidad", formaVenta: "unidad",
      },
    })
    await registrarMovimientoStock({
      productoId: producto.id, userId: user.id, tipo: "reposicion",
      cantidad: 2, fechaVencimiento: new Date(Date.now() + 86400000),
    })
    await registrarVenta(
      [{ productoId: producto.id, nombre: producto.nombre, precio: 1688, cantidad: 2 }],
      new Date().toISOString(),
    )
    // Lote nuevo, fecha distinta, con stock real — este sí debe seguir
    // apareciendo normalmente, con su cantidad real.
    await registrarMovimientoStock({
      productoId: producto.id, userId: user.id, tipo: "reposicion",
      cantidad: 2, fechaVencimiento: new Date(Date.now() + 8 * 86400000),
    })

    const lotes = await obtenerLotesPorVencer()
    const delProducto = lotes.filter(l => l.productoNombre === "Platano")
    expect(delProducto).toHaveLength(1)
    expect(delProducto[0].cantidad).toBe(2)
  })
})
