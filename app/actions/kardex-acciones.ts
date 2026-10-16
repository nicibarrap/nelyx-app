"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { TIPO_MOVIMIENTO_LABEL, type TipoMovimientoStock } from "@/lib/stock"
import { calcularLotesProducto } from "@/lib/lotes"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  await verificarCuentaActivaOExpulsar(session)
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

  const [items, lotesVigentes] = await Promise.all([
    db.movimientoStock.findMany({
      where: { productoId, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { proveedor: { select: { nombre: true } } },
    }),
    calcularLotesProducto(productoId, session.user.id),
  ])
  // Un lote ya vendido por completo (cantidadRestante llegó a 0) no debe
  // seguir mostrando el chip "Vence..." como vigente — calcularLotesProducto
  // ya filtra esos lotes agotados (mismo cálculo que usa la sección "Lotes
  // con vencimiento" de esta misma ficha), así que un lote figura acá como
  // vigente solo si de verdad todavía queda stock de esa fecha exacta.
  const fechasVigentes = new Set(lotesVigentes.map(l => l.fechaVencimiento))

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
      loteVigente: m.fechaVencimiento ? fechasVigentes.has(m.fechaVencimiento.toISOString()) : false,
      createdAt: m.createdAt.toISOString(),
    })),
    siguienteCursor: hayMas ? pagina[pagina.length - 1].id : null,
  }
}

/**
 * Todos los lotes con fecha de vencimiento informada, sin descartar y que
 * TODAVÍA tengan stock real, ordenados del más próximo al menos próximo —
 * para la sección "Productos por vencer" de Alertas. El userId se toma de
 * la sesión (no de un parámetro del llamador): al ser una Server Action, es
 * invocable directamente desde el cliente con cualquier id, así que antes
 * cualquiera podía leer los lotes de inventario (vencimientos, cantidades)
 * de otro usuario.
 */
export async function obtenerLotesPorVencer() {
  const session = await getSession()
  const userId = session.user.id
  const [entradas, todosLosMovimientos] = await Promise.all([
    db.movimientoStock.findMany({
      // Solo entradas (reposición / inventario inicial) — las ventas ahora
      // también heredan la fecha del lote de origen (para poder descontar
      // FIFO), pero eso no debe aparecer acá como si fuera un lote nuevo.
      where: { userId, fechaVencimiento: { not: null }, tipo: { in: ["reposicion", "inventario_inicial"] } },
      include: { producto: { select: { nombre: true, activo: true } } },
      orderBy: { fechaVencimiento: "asc" },
    }),
    // Cantidad real restante por lote (producto + fecha exacta de
    // vencimiento) — mismo cálculo que calcularLotesProducto, pero para
    // todos los productos de una sola pasada. Un lote deja de listarse acá
    // automáticamente apenas se vende por completo — no hay forma manual de
    // ocultar un aviso que sigue vigente.
    db.movimientoStock.findMany({
      where: { userId, fechaVencimiento: { not: null } },
      select: { productoId: true, fechaVencimiento: true, cantidad: true },
    }),
  ])

  const restantePorLote = new Map<string, number>()
  for (const m of todosLosMovimientos) {
    const clave = `${m.productoId}|${m.fechaVencimiento!.toISOString()}`
    restantePorLote.set(clave, (restantePorLote.get(clave) ?? 0) + m.cantidad)
  }

  // Un mismo lote (producto + fecha exacta de vencimiento) puede tener más
  // de una entrada de reposición — ej. se repuso, se vendió por completo, y
  // luego se volvió a reponer con la misma fecha de vencimiento (coincide
  // justo con la del lote ya agotado). Antes cada entrada generaba su
  // propia fila en la lista, así que el mismo producto/fecha aparecía
  // duplicado (dos filas mostrando la misma cantidad restante). Se agrupa
  // acá por lote: una sola fila, juntando los ids de todas las entradas que
  // la forman.
  const porLote = new Map<string, { ids: string[]; productoId: string; productoNombre: string; fechaVencimiento: string }>()
  for (const l of entradas) {
    if (!l.producto.activo) continue
    const clave = `${l.productoId}|${l.fechaVencimiento!.toISOString()}`
    const existente = porLote.get(clave)
    if (existente) {
      existente.ids.push(l.id)
    } else {
      porLote.set(clave, { ids: [l.id], productoId: l.productoId, productoNombre: l.producto.nombre, fechaVencimiento: l.fechaVencimiento!.toISOString() })
    }
  }

  return Array.from(porLote.values())
    .map(l => ({
      ids: l.ids,
      productoNombre: l.productoNombre,
      cantidad: restantePorLote.get(`${l.productoId}|${l.fechaVencimiento}`) ?? 0,
      fechaVencimiento: l.fechaVencimiento,
    }))
    .filter(l => l.cantidad > 0)
    .sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime())
}
