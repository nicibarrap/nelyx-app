"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { eliminarCategoriaPersonalizada } from "@/app/actions/acciones"
import { getColorCategoria } from "@/lib/categorias"

type Cat = { id: string; nombre: string; tipo: string }

const LABEL_TIPO: Record<string, string> = { PRODUCTO: "Productos", GASTO: "Gastos", COSTO_FIJO: "Costos fijos" }

export function CategoriasConfigClient({ categorias }: { categorias: Cat[] }) {
  const [items, setItems] = useState(categorias)
  const [isPending, startTransition] = useTransition()
  const [eliminando, setEliminando] = useState<string | null>(null)

  const grupos = Object.entries(
    items.reduce((acc, c) => { (acc[c.tipo] ??= []).push(c); return acc }, {} as Record<string, Cat[]>)
  )

  function handleEliminar(cat: Cat) {
    setEliminando(cat.id)
    startTransition(async () => {
      try {
        await eliminarCategoriaPersonalizada(cat.id)
        setItems(prev => prev.filter(c => c.id !== cat.id))
        toast.success(`Categoría "${cat.nombre}" eliminada`)
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo eliminar")
      }
      setEliminando(null)
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
      <h2 className="text-sm font-bold text-[var(--c-text)] mb-1">Categorías personalizadas</h2>
      <p className="text-xs text-[var(--c-text3)] mb-4">
        Las categorías que creaste desde Productos, Movimientos o Costos Fijos. Eliminar una de acá no afecta a nada que ya la tenga asignada — solo deja de aparecer como opción rápida al crear algo nuevo.
      </p>

      {grupos.length === 0 ? (
        <p className="text-xs text-[var(--c-text4)] text-center py-4">Todavía no has creado ninguna categoría personalizada.</p>
      ) : (
        <div className="space-y-4">
          {grupos.map(([tipo, cats]) => (
            <div key={tipo}>
              <p className="text-[11px] font-semibold text-[var(--c-text3)] uppercase tracking-wide mb-2">{LABEL_TIPO[tipo] ?? tipo}</p>
              <div className="flex flex-wrap gap-2">
                {cats.map(c => {
                  const color = getColorCategoria(c.nombre)
                  return (
                    <div key={c.id} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-xl border text-xs font-medium"
                      style={{ backgroundColor: `${color}1A`, color, borderColor: `${color}40` }}>
                      {c.nombre}
                      <button onClick={() => handleEliminar(c)} disabled={isPending && eliminando === c.id}
                        className="w-5 h-5 rounded-lg hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-all disabled:opacity-40">
                        {isPending && eliminando === c.id ? "…" : "✕"}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
