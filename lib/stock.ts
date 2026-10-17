import { db } from "@/lib/db"
import { costoPromedioPonderado } from "@/lib/financial-engine"

export const TIPOS_MOVIMIENTO_STOCK = [
  "venta", "reposicion", "ajuste_manual", "correccion", "producto_danado",
  "merma", "consumo_interno", "regalo", "devolucion", "devolucion_proveedor",
  "devolucion_cliente", "inventario_inicial", "otro",
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
  // "devolucion" ya no se ofrece al dueño del negocio (ver devolucion_proveedor
  // / devolucion_cliente) — se mantiene solo porque eliminarMovimiento
  // (acciones.ts) la sigue usando internamente para revertir el stock cuando
  // se borra un Movimiento (ej. se elimina una Venta), y porque el Kardex
  // histórico ya tiene filas reales con este tipo que deben seguir mostrándose.
  devolucion: "Devolución",
  devolucion_proveedor: "Devolución a proveedor",
  devolucion_cliente: "Devolución de cliente",
  inventario_inicial: "Inventario inicial",
  otro: "Otro",
}

/**
 * Motivos de salida de stock que representan una PÉRDIDA ECONÓMICA real del
 * negocio — el inventario se dio de baja sin que haya una venta detrás, así
 * que si no se registra el gasto correspondiente, Utilidad neta y Disponible
 * quedan artificialmente altos (el activo desaparece pero nada lo refleja).
 * `ajustarStock` usa esta lista para registrar automáticamente un Gasto al
 * costo del producto cuando corresponde. "Corrección" y "Otro" quedan fuera
 * a propósito: una corrección de conteo no es necesariamente una pérdida
 * NUEVA (puede ir en cualquier dirección y a veces solo corrige un error de
 * conteo previo), y "Otro" es un cajón de sastre sin un motivo claro — para
 * ambos, es mejor que el dueño registre el gasto a mano si corresponde, en
 * vez de asumirlo automáticamente. "Devolución a proveedor" tampoco entra:
 * nunca se registró un gasto al comprar el inventario (ver comentario en
 * `reposicion` más abajo), así que no hay nada que revertir.
 */
export const MOTIVOS_PERDIDA_RECONOCIDA: TipoMovimientoStock[] = [
  "merma", "producto_danado", "regalo", "consumo_interno",
]

/**
 * Direcciones de stock que tiene sentido registrar con cada motivo al
 * ajustar stock a mano (ver `ajustarStock`) — una compra nunca resta stock,
 * una merma/producto dañado/consumo interno/regalo nunca lo suman. Única
 * fuente de verdad: la UI (productos-client.tsx) la usa para mostrar solo
 * los botones que tienen sentido, y `ajustarStock` la vuelve a validar acá
 * mismo por si se llama directo (la UI no es el único borde de confianza).
 * "venta", "inventario_inicial" y "ajuste_manual" no pasan por este flujo
 * (tienen su propio origen), así que no necesitan entrada acá — cuando no
 * hay entrada para un motivo, se permiten ambas direcciones.
 */
export const DIRECCION_MOTIVO_AJUSTE: Partial<Record<TipoMovimientoStock, { agregar: boolean; reducir: boolean }>> = {
  reposicion: { agregar: true, reducir: false },
  correccion: { agregar: true, reducir: true },
  producto_danado: { agregar: false, reducir: true },
  merma: { agregar: false, reducir: true },
  consumo_interno: { agregar: false, reducir: true },
  regalo: { agregar: false, reducir: true },
  // Bloqueado en ambas direcciones a propósito: "devolucion" ya no se ofrece
  // como opción — ver el comentario en TIPO_MOVIMIENTO_LABEL. Esto no afecta
  // a eliminarMovimiento, que llama a registrarMovimientoStock directo y
  // nunca pasa por esta validación.
  devolucion: { agregar: false, reducir: false },
  // Antes era una sola "Devolución" bidireccional que mezclaba dos eventos
  // de negocio completamente distintos — devolver mercadería a TU proveedor
  // (el stock sale) vs. que un cliente te devuelva algo que te compró (el
  // stock vuelve a entrar) — y esa ambigüedad hacía imposible decidir el
  // efecto financiero correcto de cada una. Separadas, cada una queda
  // unidireccional igual que el resto de los motivos de salida/entrada.
  devolucion_proveedor: { agregar: false, reducir: true },
  devolucion_cliente: { agregar: true, reducir: false },
  otro: { agregar: true, reducir: true },
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
