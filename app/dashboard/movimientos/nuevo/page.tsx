import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { FormularioMovimiento } from "@/components/movimientos/formulario-movimiento"
import Link from "next/link"

export const metadata: Metadata = { title: "Nuevo movimiento" }

export default async function NuevoMovimientoPage() {
  const session = await auth()

  const [categoriasDB, proveedores] = await Promise.all([
    db.categoriaPersonalizada.findMany({ where: { userId: session!.user.id }, orderBy: { nombre: "asc" } }),
    db.proveedor.findMany({ where: { userId: session!.user.id, activo: true }, select: { id: true, nombre: true, categoria: true, telefono: true }, orderBy: { nombre: "asc" } }),
  ])

  const categoriasPersonalizadas = {
    GASTO: categoriasDB.filter(c => c.tipo === "GASTO").map(c => c.nombre),
    COSTO_FIJO: categoriasDB.filter(c => c.tipo === "COSTO_FIJO").map(c => c.nombre),
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/movimientos" className="text-[var(--c-text3)] hover:text-[var(--c-text)] transition-colors text-sm">← Movimientos</Link>
        <span className="text-[var(--c-text4)]">/</span>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Nuevo movimiento</h1>
        </div>
      </div>
      <FormularioMovimiento categoriasPersonalizadas={categoriasPersonalizadas} proveedores={proveedores} />
    </div>
  )
}
