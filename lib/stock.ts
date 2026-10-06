import { db } from "@/lib/db"
import { costoPromedioPonderado } from "@/lib/financial-engine"

export const TIPOS_MOVIMIENTO_STOCK = [
  "venta", "reposicion", "ajuste_manual", "correccion", "producto_danado",
  "merma", "consumo_interno", "regalo", "devolucion", "inventario_inicial", "otro",
] as const
export type TipoMovimientoStock = typeof TIPOS_MOVIMIENTO_STOCK[number]

export const TIPO_MOVIMIENTO_LABEL: Record<TipoMovimientoStock, string> = {
  venta: "Venta",
  reposicion: "Reposición",
  ajuste_manual: "Ajuste manual",
  correccion: "Corrección",
  producto_danado: "Producto dañado",
  merma: "Merma",
  consumo_interno: "Consumo interno",
  regalo: "Regalo",
  devolucion: "Devolución",
  inventario_inicial: "Inventario inicial",
  otro: "Otro",
}

type RegistrarMovimientoParams = {
  productoId: string
  userId: string
  tipo: TipoMovimientoStock
  /** Delta a aplicar al stock — positivo = entrada, negativo = salida. Ya en unidad interna (gramos/ml/conteo). */
  cantidad: number
  observacion?: string | null
  proveedorId?: string | null
  movimientoId?: string | null
  costoUnitario?: number | null
  /** Fecha en que vence este lote específico (solo tiene sentido en entradas de stock — reposición o inventario inicial). Opcional. */
  fechaVencimiento?: Date | null
  /** Por defecto, una salida que pide más de lo que hay se "clampa" en
   * silencio a lo que realmente queda (comportamiento histórico — lo
   * necesitan ajustes/reversiones administrativas, que no deben fallar
   * solo porque el stock actual ya no calza exacto). En cambio, para una
   * VENTA real esto debe rechazar la operación completa: si no se rechaza,
   * el Kardex queda bien pero el dinero de la venta se registra igual por
   * el monto completo, aunque el producto ya no estuviera disponible —
   * típicamente porque otra venta del mismo producto se adelantó por una
   * fracción de segundo. Activar esto en cualquier llamada que represente
   * una venta real. */
  exigirStockSuficiente?: boolean
}

export class StockInsuficienteError extends Error {
  constructor(public nombreProducto: string, public stockDisponible: number) {
    super(`Stock insuficiente para "${nombreProducto}" — alguien más acaba de vender las últimas unidades. Intenta de nuevo.`)
    this.name = "StockInsuficienteError"
  }
}

/**
 * Único punto de entrada para modificar el stock de un producto en toda
 * la plataforma. Dos garantías:
 *
 * 1. Atomicidad real: usa `SELECT ... FOR UPDATE` dentro de una
 *    transacción, así que si dos operaciones tocan el mismo producto al
 *    mismo tiempo, Postgres serializa el acceso (la segunda espera a que
 *    la primera termine) en vez de que una pise el resultado de la otra.
 * 2. Trazabilidad obligatoria: cada llamada exitosa deja un registro en
 *    el Kardex (`MovimientoStock`) con el stock antes/después reales.
 *
 * Si el producto no controla inventario (stock=null), no hace nada y
 * devuelve null — no se genera Kardex para productos sin stock.
 */
export async function registrarMovimientoStock(params: RegistrarMovimientoParams) {
  const { productoId, userId, tipo, cantidad, observacion, proveedorId, movimientoId, costoUnitario, fechaVencimiento, exigirStockSuficiente } = params
  if (!productoId || !cantidad || cantidad === 0) return null

  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ stock: number | null; controlaInventario: boolean; costo: number | null; precio: number | null; unidadVentaCantidad: number | null; nombre: string }[]>`
      SELECT stock, "controlaInventario", costo, precio, "unidadVentaCantidad", nombre FROM "Producto" WHERE id = ${productoId} AND "userId" = ${userId} FOR UPDATE
    `
    const row = rows[0]
    if (!row || !row.controlaInventario || row.stock === null) return null

    const stockAnterior = row.stock
    const stockPosterior = Math.max(0, stockAnterior + cantidad)
    const cantidadReal = stockPosterior - stockAnterior
    if (cantidadReal === 0) return null
    if (exigirStockSuficiente && cantidad < 0 && cantidadReal !== cantidad) {
      throw new StockInsuficienteError(row.nombre, stockAnterior)
    }

    // Costo Promedio Ponderado: solo se recalcula en ENTRADAS de inventario
    // con costo unitario informado (reposiciones). Las salidas (ventas,
    // mermas, etc.) nunca modifican el costo del producto. Si el producto
    // se vende en presentación fija (bolsas, botellas...), su costo está
    // guardado "por presentación" — el costo que se informa acá al reponer
    // es "por unidad de compra" (ej. por Kg), una unidad totalmente
    // distinta, así que promediarlos daría un costo corrupto. Para esos
    // productos no se toca el costo automáticamente: solo se actualiza el
    // stock, y el costo por presentación se ajusta a mano si cambió.
    const dataUpdate: { stock: number; costo?: number } = { stock: stockPosterior }
    let cambioCosto: { costoAnterior: number; costoNuevo: number; precioActual: number | null } | null = null
    if (tipo === "reposicion" && costoUnitario != null && cantidadReal > 0 && !row.unidadVentaCantidad) {
      const costoAnterior = row.costo ?? costoUnitario
      const costoNuevo = costoPromedioPonderado(stockAnterior, costoAnterior, cantidadReal, costoUnitario)
      dataUpdate.costo = costoNuevo
      // Solo vale la pena avisar si el costo realmente cambió (y ya existía
      // uno antes — no molestar la primera vez que se le pone costo).
      if (row.costo != null && Math.round(costoNuevo) !== Math.round(costoAnterior)) {
        cambioCosto = { costoAnterior, costoNuevo, precioActual: row.precio }
      }
    }

    await tx.producto.update({ where: { id: productoId }, data: dataUpdate })

    const movimiento = await tx.movimientoStock.create({
      data: {
        productoId, userId, tipo, cantidad: cantidadReal,
        stockAnterior, stockPosterior,
        observacion: observacion ?? null,
        proveedorId: proveedorId ?? null,
        movimientoId: movimientoId ?? null,
        costoUnitario: costoUnitario ?? null,
        costoTotal: costoUnitario != null ? Math.round(Math.abs(cantidadReal) * costoUnitario) : null,
        fechaVencimiento: fechaVencimiento ?? null,
      },
    })

    return { movimiento, cambioCosto }
  })
}
