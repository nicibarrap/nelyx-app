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
    db.movimiento.findMany({
      where: { userId: session!.user.id, tipo: "VENTA", productoId: { not: null } },
      select: { productoId: true, monto: true },
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

  // Calcular ventas e ingresos por producto
  const ventasPorProducto: Record<string, { count: number; total: number }> = {}
  for (const mv of movimientos) {
    const id = mv.productoId!
    if (!ventasPorProducto[id]) ventasPorProducto[id] = { count: 0, total: 0 }
    ventasPorProducto[id].count++
    ventasPorProducto[id].total += Number(mv.monto)
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
