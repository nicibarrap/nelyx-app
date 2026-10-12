import { db } from "@/lib/db"

export type LoteProducto = {
  fechaVencimiento: string // ISO
  cantidadRestante: number // en unidad interna (gramos/ml/conteo)
  numero: number // 1 = el que se vende primero (el más próximo a vencer entre los que quedan)
}

/**
 * Calcula los lotes VIGENTES de un producto — agrupando todas las entradas
 * (reposición / inventario inicial) y salidas (ventas ya atribuidas a un
 * lote) que comparten exactamente la misma fecha de vencimiento.
 *
 * No es una tabla propia: se calcula al vuelo sumando el Kardex existente
 * (entradas positivas, salidas negativas — el campo `cantidad` ya viene con
 * signo), así que nunca puede desincronizarse del stock real. Cuando un
 * lote llega a 0, simplemente deja de aparecer — y el que le seguía pasa
 * a ser el "número 1" solo, sin que nadie mueva nada a mano.
 */
export async function calcularLotesProducto(productoId: string, userId: string): Promise<LoteProducto[]> {
  const movimientos = await db.movimientoStock.findMany({
    where: { productoId, userId, fechaVencimiento: { not: null } },
    select: { cantidad: true, fechaVencimiento: true },
  })

  const porFecha = new Map<string, number>()
  for (const m of movimientos) {
    const clave = m.fechaVencimiento!.toISOString()
    porFecha.set(clave, (porFecha.get(clave) ?? 0) + m.cantidad)
  }

  const lotes = Array.from(porFecha.entries())
    .map(([fechaVencimiento, cantidadRestante]) => ({ fechaVencimiento, cantidadRestante }))
    .filter(l => l.cantidadRestante > 0)
    .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime())

  return lotes.map((l, i) => ({ ...l, numero: i + 1 }))
}

export type ConsumoLote = { fechaVencimiento: Date | null; cantidad: number }

/**
 * Reparte una salida de stock (venta, merma, etc.) entre los lotes vigentes
 * en orden FIFO (el más próximo a vencer primero), agotando cada lote por
 * completo antes de pasar al siguiente. Si la cantidad pedida supera lo que
 * queda en todos los lotes con vencimiento (o el producto no tiene ninguno),
 * el resto queda sin lote (fechaVencimiento: null) — se amarra igual que
 * antes de que existiera el seguimiento por lotes.
 *
 * Antes, la salida completa se amarraba entera al primer lote (el que vence
 * primero) sin importar cuánto tuviera: si la venta superaba lo que había
 * en ese lote, los lotes siguientes quedaban con cantidades que ya no
 * reflejaban la venta real (parecían intactos aunque se hubiera vendido
 * parte de su stock).
 */
export async function calcularConsumoFIFO(productoId: string, userId: string, cantidadNecesaria: number): Promise<ConsumoLote[]> {
  if (cantidadNecesaria <= 0) return []
  const lotes = await calcularLotesProducto(productoId, userId)
  const plan: ConsumoLote[] = []
  let restante = cantidadNecesaria
  for (const lote of lotes) {
    if (restante <= 0) break
    const consumo = Math.min(restante, lote.cantidadRestante)
    plan.push({ fechaVencimiento: new Date(lote.fechaVencimiento), cantidad: consumo })
    restante -= consumo
  }
  if (restante > 0) plan.push({ fechaVencimiento: null, cantidad: restante })
  return plan
}

/**
 * Igual que calcularLotesProducto (toma el lote que vence primero), pero
 * para TODOS los productos del usuario a la vez — una sola consulta en vez
 * de una por producto, pensado para listas
 * (la vista general de Productos). Devuelve solo los productos que sí
 * tienen al menos un lote vigente, con su fecha más próxima.
 */
export async function calcularProximoVencimientoPorProducto(userId: string): Promise<Map<string, { fechaVencimiento: string; diasRestantes: number }>> {
  const movimientos = await db.movimientoStock.findMany({
    where: { userId, fechaVencimiento: { not: null } },
    select: { productoId: true, cantidad: true, fechaVencimiento: true },
  })

  // Agrupa por producto + fecha exacta, igual que calcularLotesProducto,
  // pero para todos los productos de una sola pasada.
  const porProductoYFecha = new Map<string, number>()
  for (const m of movimientos) {
    const clave = `${m.productoId}|${m.fechaVencimiento!.toISOString()}`
    porProductoYFecha.set(clave, (porProductoYFecha.get(clave) ?? 0) + m.cantidad)
  }

  const hoy = new Date()
  const resultado = new Map<string, { fechaVencimiento: string; diasRestantes: number }>()
  for (const [clave, cantidadRestante] of Array.from(porProductoYFecha)) {
    if (cantidadRestante <= 0) continue
    const [productoId, fechaVencimiento] = clave.split("|")
    const diasRestantes = Math.ceil((new Date(fechaVencimiento).getTime() - hoy.getTime()) / 86400000)
    const actual = resultado.get(productoId)
    if (!actual || new Date(fechaVencimiento).getTime() < new Date(actual.fechaVencimiento).getTime()) {
      resultado.set(productoId, { fechaVencimiento, diasRestantes })
    }
  }
  return resultado
}
