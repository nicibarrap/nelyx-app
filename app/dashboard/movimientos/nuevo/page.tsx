import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { FormularioMovimiento } from "@/components/movimientos/formulario-movimiento"
import Link from "next/link"

export const metadata: Metadata = { title: "Movimientos" }

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
      {/* Mismo patrón que Venta: esta pantalla es la entrada directa desde el
          sidebar (el registro, no un listado), con el historial accesible
          aparte en vez de ser la vista por defecto — antes el sidebar caía
          en el historial y "+ Nuevo" quedaba como una acción secundaria,
          invertido respecto a cómo funciona Venta.
          max-w-xl: mismo ancho que FormularioMovimiento más abajo (que ya
          trae su propio max-w-xl mx-auto) — sin esto el encabezado quedaba
          a lo ancho completo de la página y el formulario angosto debajo,
          desalineados entre sí. */}
      <div className="max-w-xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-xl flex-shrink-0">⇄</div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--c-text)] tracking-tight">Movimientos</h1>
            <p className="text-xs text-[var(--c-text3)]">Registra un gasto, ingreso extra o retiro</p>
          </div>
        </div>
        <Link href="/dashboard/movimientos"
          className="flex-shrink-0 flex items-center gap-2 h-9 px-4 bg-[var(--c-card2)] hover:bg-[var(--c-hover)] text-[var(--c-text2)] text-xs font-bold rounded-xl border border-[var(--c-border)] transition-all whitespace-nowrap">
          📜 Historial
        </Link>
      </div>
      <FormularioMovimiento categoriasPersonalizadas={categoriasPersonalizadas} proveedores={proveedores} />
    </div>
  )
}
