import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { EscanearNuevosClient } from "@/components/productos/escanear-nuevos-client"

export const metadata: Metadata = { title: "Escanear productos nuevos" }
export const dynamic = "force-dynamic"

export default async function EscanearNuevosPage() {
  const session = await auth()

  const productosExistentes = await db.producto.findMany({
    where: { userId: session!.user.id },
    select: { sku: true, codigoBarras: true },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/productos" className="text-[var(--c-text3)] hover:text-[var(--c-text)] transition-colors text-sm">← Productos</Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight flex items-center gap-2">📷 Escanear productos nuevos</h1>
        <p className="text-sm text-[var(--c-text3)] mt-0.5">Ideal para cargar muchos productos de una vez — escanea todo primero, completa los detalles después.</p>
      </div>
      <EscanearNuevosClient productosExistentes={productosExistentes} />
    </div>
  )
}
