"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { eliminarCategoriaPersonalizada, renombrarCategoriaPersonalizada, crearCategoriaPersonalizada } from "@/app/actions/acciones"
import { getColorCategoria } from "@/lib/categorias"

type Cat = { id: string; nombre: string; tipo: string }

const LABEL_TIPO: Record<string, string> = { PRODUCTO: "Productos", GASTO: "Gastos", COSTO_FIJO: "Costos fijos" }

export function CategoriasConfigClient({ categorias }: { categorias: Cat[] }) {
  const [items, setItems] = useState(categorias)
  const [isPending, startTransition] = useTransition()
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [nombreEdicion, setNombreEdicion] = useState("")
  const [nuevaCategoria, setNuevaCategoria] = useState("")
  const [creando, setCreando] = useState(false)

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

  function iniciarEdicion(cat: Cat) {
    setEditando(cat.id)
    setNombreEdicion(cat.nombre)
  }

  function guardarEdicion(cat: Cat) {
    const nuevoNombre = nombreEdicion.trim()
    if (!nuevoNombre || nuevoNombre === cat.nombre) { setEditando(null); return }
    startTransition(async () => {
      try {
        await renombrarCategoriaPersonalizada(cat.id, nuevoNombre)
        setItems(prev => prev.map(c => c.id === cat.id ? { ...c, nombre: nuevoNombre } : c))
        toast.success(`Categoría renombrada a "${nuevoNombre}"`)
        setEditando(null)
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo renombrar")
      }
    })
  }

  function handleCrear() {
    const nombre = nuevaCategoria.trim()
    if (!nombre) return
    setCreando(true)
    startTransition(async () => {
      try {
        await crearCategoriaPersonalizada("PRODUCTO", nombre)
        setItems(prev => prev.some(c => c.tipo === "PRODUCTO" && c.nombre.toLowerCase() === nombre.toLowerCase())
          ? prev
          : [...prev, { id: `tmp-${Date.now()}`, nombre, tipo: "PRODUCTO" }])
        setNuevaCategoria("")
        toast.success(`Categoría "${nombre}" creada`)
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo crear")
      }
      setCreando(false)
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
      <h2 className="text-sm font-bold text-[var(--c-text)] mb-1">Categorías personalizadas</h2>
      <p className="text-xs text-[var(--c-text3)] mb-4">
        Las categorías que se van creando desde Productos, Movimientos o Costos Fijos — más las que agregues acá. Renombrar o eliminar una de acá no afecta a nada que ya la tenga asignada — solo cambia cómo aparece como opción rápida al crear algo nuevo.
      </p>

      <div className="flex gap-2 mb-4">
        <input value={nuevaCategoria} onChange={e => setNuevaCategoria(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCrear() } }}
          placeholder="Nueva categoría de producto..."
          className="flex-1 min-w-0 h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-xs text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors" />
        <button onClick={handleCrear} disabled={creando || !nuevaCategoria.trim()}
          className="flex-shrink-0 h-10 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-bold transition-all">
          + Agregar
        </button>
      </div>

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
                  if (editando === c.id) {
                    return (
                      <div key={c.id} className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-xl border" style={{ borderColor: `${color}40` }}>
                        <input autoFocus value={nombreEdicion} onChange={e => setNombreEdicion(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") guardarEdicion(c); if (e.key === "Escape") setEditando(null) }}
                          className="w-28 h-6 bg-transparent text-xs text-[var(--c-text)] outline-none" />
                        <button onClick={() => guardarEdicion(c)} disabled={isPending}
                          className="w-5 h-5 rounded-lg hover:bg-emerald-500/20 hover:text-emerald-400 flex items-center justify-center transition-all">✓</button>
                        <button onClick={() => setEditando(null)}
                          className="w-5 h-5 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center transition-all">✕</button>
                      </div>
                    )
                  }
                  return (
                    <div key={c.id} className="flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-xl border text-xs font-medium"
                      style={{ backgroundColor: `${color}1A`, color, borderColor: `${color}40` }}>
                      {c.nombre}
                      <button onClick={() => iniciarEdicion(c)}
                        className="w-5 h-5 rounded-lg hover:bg-white/10 flex items-center justify-center transition-all">✏️</button>
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
