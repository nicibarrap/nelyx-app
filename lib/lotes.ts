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

/**
 * El lote que corresponde vender primero (el más próximo a vencer entre los
 * que todavía tienen stock) — se usa al registrar una venta para "amarrar"
 * la salida a ese lote en silencio, sin pedirle nada al cajero. Si el
 * producto no tiene ningún lote con vencimiento, devuelve null y la venta
 * sigue funcionando exactamente igual que siempre.
 */
export async function obtenerLoteFIFO(productoId: string, userId: string): Promise<Date | null> {
  const lotes = await calcularLotesProducto(productoId, userId)
  return lotes.length > 0 ? new Date(lotes[0].fechaVencimiento) : null
}

/**
 * Igual que obtenerLoteFIFO, pero para TODOS los productos del usuario a la
 * vez — una sola consulta en vez de una por producto, pensado para listas
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
