"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { TIPO_MOVIMIENTO_LABEL, type TipoMovimientoStock } from "@/lib/stock"
import { esSoloLectura, type ModuloKey } from "@/lib/permisos"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

/** Igual que getSession(), pero además rechaza a un empleado al que ese
 * módulo se le dejó en "solo lectura" — usarla en toda acción que CREE,
 * EDITE o ELIMINE algo (nunca en una que solo lea). */
async function getSessionEscritura(moduloKey: ModuloKey) {
  const session = await getSession()
  if (esSoloLectura(session.user.modulosPermitidos, moduloKey)) {
    throw new Error("Tu acceso a este módulo es solo de lectura")
  }
  return session
}

const PAGE_SIZE = 10

/**
 * Historial de Kardex de un producto, paginado (no carga todo el historial
 * de una sola vez — sección 9 del Sprint 2).
 */
export async function obtenerHistorialProducto(productoId: string, cursor?: string) {
  const session = await getSession()

  const prod = await db.producto.findFirst({ where: { id: productoId, userId: session.user.id }, select: { id: true } })
  if (!prod) throw new Error("Producto no encontrado")

  const items = await db.movimientoStock.findMany({
    where: { productoId, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { proveedor: { select: { nombre: true } } },
  })

  const hayMas = items.length > PAGE_SIZE
  const pagina = items.slice(0, PAGE_SIZE)

  return {
    items: pagina.map(m => ({
      id: m.id,
      tipo: m.tipo,
      tipoLabel: TIPO_MOVIMIENTO_LABEL[m.tipo as TipoMovimientoStock] ?? m.tipo,
      cantidad: m.cantidad,
      stockAnterior: m.stockAnterior,
      stockPosterior: m.stockPosterior,
      observacion: m.observacion,
      proveedorNombre: m.proveedor?.nombre ?? null,
      costoUnitario: m.costoUnitario ? Number(m.costoUnitario) : null,
      costoTotal: m.costoTotal ? Number(m.costoTotal) : null,
      fechaVencimiento: m.fechaVencimiento ? m.fechaVencimiento.toISOString() : null,
      avisoVencimientoDescartado: m.avisoVencimientoDescartado,
      createdAt: m.createdAt.toISOString(),
    })),
    siguienteCursor: hayMas ? pagina[pagina.length - 1].id : null,
  }
}

/**
 * Marca un aviso de vencimiento como "resuelto" — el dueño ya vendió o botó
 * ese lote. No toca el stock ni ningún número real, solo deja de mostrarlo
 * en Alertas para que no quede como ruido permanente.
 */
export async function descartarAvisoVencimiento(movimientoStockId: string) {
  const session = await getSessionEscritura("productos")
  const mov = await db.movimientoStock.findFirst({ where: { id: movimientoStockId, userId: session.user.id } })
  if (!mov) throw new Error("No encontrado")
  await db.movimientoStock.update({ where: { id: movimientoStockId }, data: { avisoVencimientoDescartado: true } })
}

/**
 * Todos los lotes con fecha de vencimiento informada, sin descartar,
 * ordenados del más próximo al menos próximo — para la sección "Productos
 * por vencer" de Alertas. El userId se toma de la sesión (no de un parámetro
 * del llamador): al ser una Server Action, es invocable directamente desde
 * el cliente con cualquier id, así que antes cualquiera podía leer los
 * lotes de inventario (vencimientos, cantidades) de otro usuario.
 */
export async function obtenerLotesPorVencer() {
  const session = await getSession()
  const userId = session.user.id
  const lotes = await db.movimientoStock.findMany({
    // Solo entradas (reposición / inventario inicial) — las ventas ahora
    // también heredan la fecha del lote de origen (para poder descontar
    // FIFO), pero eso no debe aparecer acá como si fuera un lote nuevo.
    where: { userId, fechaVencimiento: { not: null }, avisoVencimientoDescartado: false, tipo: { in: ["reposicion", "inventario_inicial"] } },
    include: { producto: { select: { nombre: true, activo: true } } },
    orderBy: { fechaVencimiento: "asc" },
  })
  return lotes
    .filter(l => l.producto.activo)
    .map(l => ({
      id: l.id,
      productoNombre: l.producto.nombre,
      cantidad: l.cantidad,
      fechaVencimiento: l.fechaVencimiento!.toISOString(),
    }))
}
