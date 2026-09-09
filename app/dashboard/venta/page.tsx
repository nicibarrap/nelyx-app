import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { VentaClient } from "@/components/ventas/venta-client"

export const metadata: Metadata = { title: "Venta" }
export const dynamic = "force-dynamic"

export default async function VentaPage() {
  const session = await auth()

  const [productos, clientes, conexionPago] = await Promise.all([
    db.producto.findMany({
      where: { userId: session!.user.id, activo: true },
      select: { id: true, nombre: true, sku: true, codigoBarras: true, categoria: true, precio: true, costo: true, stock: true, formaVenta: true, unidadMedida: true, unidadPersonalizada: true, unidadVentaCantidad: true, unidadVentaTipo: true, ventaMinima: true },
      orderBy: { nombre: "asc" },
    }),
    db.cliente.findMany({ where: { userId: session!.user.id, activo: true }, select: { id: true, nombre: true, apellido: true, telefono: true, empresa: true, esVip: true }, orderBy: { nombre: "asc" } }),
    db.conexionPago.findFirst({ where: { userId: session!.user.id, proveedor: "mercadopago", activo: true } }),
  ])

  return <VentaClient productos={productos} clientes={clientes} conexionPagoActiva={!!conexionPago} />
}
