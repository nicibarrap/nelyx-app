import { Prisma, TipoMovimiento } from "@prisma/client"

export interface FiltrosMovimientos {
  userId: string
  mes: number
  anio: number
  q?: string
  tipo?: string
  metodoPago?: string
}

const TIPOS_VALIDOS = new Set(Object.values(TipoMovimiento))

/**
 * Arma el WHERE de Movimiento a partir de los filtros de la pantalla de
 * Historial (período, tipo, método de pago, búsqueda de texto). Vive acá
 * — no en page.tsx ni en acciones.ts directamente — para que el listado
 * paginado y la exportación a CSV filtren exactamente lo mismo: si un día
 * cambia un criterio de búsqueda, se cambia en un solo lugar y ambos
 * quedan consistentes entre sí.
 */
export function construirWhereMovimientos(f: FiltrosMovimientos): Prisma.MovimientoWhereInput {
  const where: Prisma.MovimientoWhereInput = {
    userId: f.userId,
    fecha: { gte: new Date(f.anio, f.mes - 1, 1), lt: new Date(f.anio, f.mes, 1) },
  }
  if (f.tipo && TIPOS_VALIDOS.has(f.tipo as TipoMovimiento)) where.tipo = f.tipo as TipoMovimiento
  if (f.metodoPago) where.metodoPago = f.metodoPago

  const q = f.q?.trim()
  if (q) {
    where.OR = [
      { descripcion: { contains: q, mode: "insensitive" } },
      { categoria: { contains: q, mode: "insensitive" } },
      { producto: { nombre: { contains: q, mode: "insensitive" } } },
      { cliente: { nombre: { contains: q, mode: "insensitive" } } },
      { cliente: { apellido: { contains: q, mode: "insensitive" } } },
    ]
  }
  return where
}
