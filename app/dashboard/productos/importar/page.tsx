import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ImportarProductosClient } from "@/components/productos/importar-productos-client"

export const metadata: Metadata = { title: "Importar productos" }
export const dynamic = "force-dynamic"
// importarProductosMasivo (acciones.ts) procesa hasta 2000 filas en un for
// secuencial (un db.producto.create + un registrarMovimientoStock por fila
// con stock inicial) — con un archivo grande, el límite por defecto de una
// función serverless se queda corto. Mismo valor ya usado en venta/page.tsx
// para el mismo tipo de problema (una Server Action que puede tardar más
// de lo normal).
export const maxDuration = 100

export default async function ImportarProductosPage() {
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
        <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight flex items-center gap-2">📥 Importación masiva de productos</h1>
        <p className="text-sm text-[var(--c-text3)] mt-0.5">Carga tu catálogo de una sola vez desde un Excel.</p>
      </div>
      <ImportarProductosClient productosExistentes={productosExistentes} />
    </div>
  )
}
