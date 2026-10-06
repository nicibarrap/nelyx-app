import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { VentaClient } from "@/components/ventas/venta-client"

export const metadata: Metadata = { title: "Venta" }
export const dynamic = "force-dynamic"

export default async function VentaPage() {
  const session = await auth()

  const [productosRaw, clientes, conexionPago] = await Promise.all([
    db.producto.findMany({
      where: { userId: session!.user.id, activo: true },
      select: { id: true, nombre: true, sku: true, codigoBarras: true, categoria: true, precio: true, costo: true, stock: true, formaVenta: true, unidadMedida: true, unidadPersonalizada: true, unidadVentaCantidad: true, unidadVentaTipo: true, ventaMinima: true },
      orderBy: { nombre: "asc" },
    }),
    db.cliente.findMany({ where: { userId: session!.user.id, activo: true }, select: { id: true, nombre: true, apellido: true, telefono: true, empresa: true, esVip: true }, orderBy: { nombre: "asc" } }),
    db.conexionPago.findFirst({ where: { userId: session!.user.id, proveedor: "mercadopago", activo: true } }),
  ])

  // precio/costo son Decimal de Prisma (instancias de clase, no objetos
  // planos) — React no permite pasarlas de un Server Component a un
  // Client Component (VentaClient es "use client"), mismo motivo por el
  // que /dashboard/deudas ya hace esta misma conversión.
  const productos = productosRaw.map(p => ({ ...p, precio: p.precio ? Number(p.precio) : null, costo: p.costo ? Number(p.costo) : null }))

  return <VentaClient productos={productos} clientes={clientes} conexionPagoActiva={!!conexionPago} />
}
