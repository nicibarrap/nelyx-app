import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { calcularProximoVencimientoPorProducto } from "@/lib/lotes"
import { ProductosClient } from "@/components/productos/productos-client"

export const metadata: Metadata = { title: "Productos" }

export default async function ProductosPage() {
  const session = await auth()

  const [productosRaw, movimientos, vencimientos, categoriasPersonalizadas, unidadesPersonalizadas] = await Promise.all([
    db.producto.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: "desc" },
      // select explícito: la lista nunca muestra imagenBase64 (confirmado -
      // no se usa en ningún lado del componente), y esa cadena puede pesar
      // bastante por cada producto, así que no tiene sentido traerla aquí.
      select: {
        id: true, nombre: true, precio: true, costo: true, descripcion: true,
        categoria: true, sku: true, codigoBarras: true, stock: true, stockMinimo: true,
        unidadMedida: true, unidadPersonalizada: true, formaVenta: true, controlaInventario: true,
        unidadVentaCantidad: true, unidadVentaTipo: true, ventaMinima: true, activo: true, createdAt: true,
      },
    }),
    // groupBy en vez de traer cada movimiento de venta histórico: un negocio
    // con meses/años de ventas podía significar decenas de miles de filas
    // descargadas y sumadas en JS en cada visita a esta página — la suma
    // ahora la hace la base de datos.
    db.movimiento.groupBy({
      by: ["productoId"],
      where: { userId: session!.user.id, tipo: "VENTA", productoId: { not: null } },
      _count: { _all: true },
      _sum: { monto: true },
    }),
    calcularProximoVencimientoPorProducto(session!.user.id),
    db.categoriaPersonalizada.findMany({
      where: { userId: session!.user.id, tipo: "PRODUCTO" },
      select: { nombre: true },
      orderBy: { nombre: "asc" }
    }),
    db.categoriaPersonalizada.findMany({
      where: { userId: session!.user.id, tipo: "UNIDAD_MEDIDA" },
      select: { nombre: true },
      orderBy: { nombre: "asc" }
    }),
  ])

  // Ventas e ingresos por producto — ya vienen agregados por la DB (groupBy).
  const ventasPorProducto: Record<string, { count: number; total: number }> = {}
  for (const g of movimientos) {
    if (!g.productoId) continue
    ventasPorProducto[g.productoId] = { count: g._count._all, total: Number(g._sum.monto ?? 0) }
  }

  const productosData = productosRaw.map(p => ({
    id: p.id,
    nombre: p.nombre,
    precio: p.precio ? Number(p.precio) : null,
    costo: p.costo ? Number(p.costo) : null,
    descripcion: p.descripcion,
    categoria: p.categoria,
    sku: p.sku,
    codigoBarras: p.codigoBarras,
    stock: p.stock,
    stockMinimo: p.stockMinimo,
    unidadMedida: p.unidadMedida,
    unidadPersonalizada: p.unidadPersonalizada,
    formaVenta: p.formaVenta,
    controlaInventario: p.controlaInventario,
    unidadVentaCantidad: p.unidadVentaCantidad,
    unidadVentaTipo: p.unidadVentaTipo,
    ventaMinima: p.ventaMinima,
    activo: p.activo,
    createdAt: p.createdAt,
    ventasCount: ventasPorProducto[p.id]?.count ?? 0,
    ingresosTotal: ventasPorProducto[p.id]?.total ?? 0,
    proximoVencimiento: vencimientos.get(p.id) ?? null,
  }))

  const customCategorias = categoriasPersonalizadas.map(c => c.nombre)
  const customUnidades = unidadesPersonalizadas.map(u => u.nombre)

  return <ProductosClient productosData={productosData} customCategorias={customCategorias} customUnidades={customUnidades} />
}
