import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ReponerInventarioClient } from "@/components/productos/reponer-inventario-client"

export const metadata: Metadata = { title: "Actualizar inventario" }
export const dynamic = "force-dynamic"

export default async function ReponerInventarioPage() {
  const session = await auth()

  const [productosRaw, proveedores] = await Promise.all([
    db.producto.findMany({
      where: { userId: session!.user.id, activo: true, controlaInventario: true },
      select: { id: true, nombre: true, sku: true, codigoBarras: true, stock: true, costo: true, formaVenta: true, unidadMedida: true, unidadPersonalizada: true, unidadVentaCantidad: true },
      orderBy: { nombre: "asc" },
    }),
    db.proveedor.findMany({ where: { userId: session!.user.id, activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ])

  // costo es Decimal de Prisma — no se puede pasar tal cual de un Server
  // Component a un Client Component (ReponerInventarioClient es "use client").
  const productos = productosRaw.map(p => ({ ...p, costo: p.costo ? Number(p.costo) : null }))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/productos" className="text-[var(--c-text3)] hover:text-[var(--c-text)] transition-colors text-sm">← Productos</Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight flex items-center gap-2">📦 Actualizar inventario</h1>
        <p className="text-sm text-[var(--c-text3)] mt-0.5">Escanea los productos de una compra y suma el stock de todos de una sola vez.</p>
      </div>
      <ReponerInventarioClient productos={productos} proveedores={proveedores} />
    </div>
  )
}
