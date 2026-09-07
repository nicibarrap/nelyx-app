"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ingresarMovimiento, crearCategoriaPersonalizada } from "@/app/actions/acciones"
import { getCategoriasBase } from "@/lib/categorias"

const TIPOS = [
  { value: "GASTO",         label: "🛒 Gasto",         desc: "Pagaste algo",        a: "bg-red-500/20 border-red-500/50 text-red-300",         i: "border-[var(--c-border)] text-[var(--c-text2)] hover:border-red-900" },
  { value: "INGRESO_EXTRA", label: "➕ Ingreso Extra", desc: "Fuera de ventas",     a: "bg-sky-500/20 border-sky-500/50 text-sky-300",         i: "border-[var(--c-border)] text-[var(--c-text2)] hover:border-sky-900" },
  { value: "RETIRO",        label: "👝 Retiro",         desc: "Tu sueldo personal",  a: "bg-purple-500/20 border-purple-500/50 text-purple-300", i: "border-[var(--c-border)] text-[var(--c-text2)] hover:border-purple-900" },
]

const inp = "w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-4 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"

interface ProveedorOption { id: string; nombre: string; categoria: string | null; telefono: string | null }
interface Props {
  categoriasPersonalizadas?: { GASTO: string[]; COSTO_FIJO: string[] }
  proveedores?: ProveedorOption[]
}

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }

export function FormularioMovimiento({ categoriasPersonalizadas = { GASTO: [], COSTO_FIJO: [] }, proveedores = [] }: Props) {
  const router = useRouter()
  const [tipo, setTipo] = useState<string | null>(null)
  const [categoria, setCategoria] = useState<string>("")
  const [nuevaCat, setNuevaCat] = useState("")
  const [mostrarNuevaCat, setMostrarNuevaCat] = useState(false)
  const [catsPersonalizadas, setCatsPersonalizadas] = useState(categoriasPersonalizadas)
  const [isPending, startTransition] = useTransition()
  const [montoDisplay, setMontoDisplay] = useState("")
  const [isPendingCat, startTransitionCat] = useTransition()

  const [proveedorId, setProveedorId]   = useState<string>("")
  const [provSearch, setProvSearch]     = useState("")
  const [showProvDropdown, setShowProvDropdown] = useState(false)
  const provsFiltrados = proveedores.filter(p => provSearch.length === 0 || `${p.nombre} ${p.categoria ?? ""} ${p.telefono ?? ""}`.toLowerCase().includes(provSearch.toLowerCase()))
  const provSeleccionado = proveedores.find(p => p.id === proveedorId) ?? null

  const tipoActual = TIPOS.find((t) => t.value === tipo)
  const necesitaCategoria = tipo === "GASTO"
  const categoriasBase = tipo ? getCategoriasBase(tipo) : []
  const categoriasCustom = tipo === "GASTO" ? catsPersonalizadas.GASTO : tipo === "COSTO_FIJO" ? catsPersonalizadas.COSTO_FIJO : []
  const todasCategorias = [...categoriasBase, ...categoriasCustom.filter(c => !categoriasBase.includes(c))]

  function handleTipoChange(t: string) {
    setTipo(t)
    setCategoria("")
    setMostrarNuevaCat(false)
    setNuevaCat("")
  }

  // Registrar movimiento simple (GASTO, INGRESO_EXTRA, RETIRO)
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (necesitaCategoria && !categoria) { toast.error("Selecciona una categoría"); return }
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    startTransition(async () => {
      try {
        if (tipo === "GASTO" && proveedorId) fd.append("proveedorId", proveedorId)
        await ingresarMovimiento(fd)
        toast.success("¡Movimiento registrado!")
        form.reset(); setTipo(null); setCategoria("")
      } catch { toast.error("No se pudo guardar") }
    })
  }

  function handleCrearCategoria() {
    if (!nuevaCat.trim() || !tipo) return
    startTransitionCat(async () => {
      try {
        await crearCategoriaPersonalizada(tipo, nuevaCat.trim())
        const nombre = nuevaCat.trim()
        setCatsPersonalizadas(prev => ({ ...prev, [tipo]: [...(prev[tipo as keyof typeof prev] || []), nombre] }))
        setCategoria(nombre); setNuevaCat(""); setMostrarNuevaCat(false)
        toast.success(`Categoría "${nombre}" creada`)
      } catch { toast.error("No se pudo crear la categoría") }
    })
  }

  // ── RENDER ────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto space-y-6">

      {/* Selector de tipo */}
      <div>
        <p className="text-sm font-medium text-[var(--c-text2)] mb-3">¿Qué tipo de movimiento quieres registrar?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TIPOS.map((t) => (
            <button key={t.value} type="button" onClick={() => handleTipoChange(t.value)}
              className={`p-4 rounded-xl border-2 text-left transition-all bg-[var(--c-card)] ${tipo === t.value ? t.a : t.i}`}>
              <span className="font-semibold text-sm block">{t.label}</span>
              <span className="text-xs opacity-60 block mt-1">{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-2.5 mt-3">
          <span className="text-sm">🛒</span>
          <p className="text-xs text-[var(--c-text3)]">¿Quieres registrar una venta? Ve al módulo <Link href="/dashboard/venta" className="text-emerald-400 hover:text-emerald-300 font-semibold">Venta</Link>.</p>
        </div>
      </div>

      {/* Selector proveedor para GASTO */}
      {tipo === "GASTO" && proveedores.length > 0 && (
        <div className="relative">
          <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Proveedor (opcional)</label>
          <div className="relative">
            <input value={provSeleccionado ? provSeleccionado.nombre : provSearch}
              onChange={e => { setProvSearch(e.target.value); setProveedorId(""); setShowProvDropdown(true) }}
              onFocus={() => setShowProvDropdown(true)}
              onBlur={() => setTimeout(() => setShowProvDropdown(false), 150)}
              placeholder="Buscar proveedor..."
              className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors pr-8" />
            {proveedorId && <button type="button" onClick={() => { setProveedorId(""); setProvSearch("") }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--c-text3)] hover:text-[var(--c-text)] text-sm">×</button>}
          </div>
          {showProvDropdown && provsFiltrados.length > 0 && !proveedorId && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 max-h-44 overflow-y-auto">
              {provsFiltrados.slice(0, 8).map(p => (
                <button key={p.id} type="button"
                  onMouseDown={() => { setProveedorId(p.id); setProvSearch(""); setShowProvDropdown(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--c-hover)] transition-all text-left">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center text-[10px] font-bold text-orange-400 flex-shrink-0">{p.nombre[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{p.nombre}</p>
                    {p.categoria && <p className="text-[10px] text-[var(--c-text3)]">{p.categoria}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hint Costos Fijos */}
      {tipo === "GASTO" && (
        <div className="flex items-center gap-2 bg-orange-500/5 border border-orange-500/15 rounded-xl px-4 py-2.5">
          <span className="text-sm">🏠</span>
          <p className="text-xs text-[var(--c-text3)]">¿Es un gasto mensual fijo como arriendo o internet? Ve a <Link href="/dashboard/costos-fijos" className="text-orange-400 hover:text-orange-300 font-semibold">Costos Fijos</Link> para registrarlo como recurrente.</p>
        </div>
      )}

      {tipo && (
        <>
          {/* Selector de categoría */}
          {necesitaCategoria && (
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 space-y-3">
              <p className="text-xs font-semibold text-[var(--c-text)]">
                {tipo === "GASTO" ? "🛒 Categoría del gasto" : "🏠 Tipo de costo fijo"}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {todasCategorias.map((cat) => (
                  <button key={cat} type="button" onClick={() => setCategoria(cat)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all border ${
                      categoria === cat ? "bg-sky-500/15 border-sky-500/30 text-sky-300" : "bg-[var(--c-card2)] border-[var(--c-border)] text-[var(--c-text2)] hover:border-sky-500/30 hover:text-[var(--c-text)]"
                    }`}>
                    {cat}
                  </button>
                ))}
                <button type="button" onClick={() => setMostrarNuevaCat(!mostrarNuevaCat)}
                  className="px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all border border-dashed border-[var(--c-border)] text-[var(--c-text3)] hover:border-sky-500/30 hover:text-sky-400">
                  + Crear nueva
                </button>
              </div>
              {mostrarNuevaCat && (
                <div className="flex gap-2">
                  <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCrearCategoria())}
                    placeholder="Ej: Hielo, Gas parrilla, Bolsas..."
                    className="flex-1 h-10 bg-[var(--c-input)] border border-sky-500/30 rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none"
                    autoFocus />
                  <button type="button" onClick={handleCrearCategoria} disabled={!nuevaCat.trim() || isPendingCat}
                    className="h-10 px-4 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors">
                    {isPendingCat ? "..." : "Crear"}
                  </button>
                </div>
              )}
              {categoria && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--c-text3)]">Seleccionado:</span>
                  <span className="text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">{categoria}</span>
                  <button type="button" onClick={() => setCategoria("")} className="text-[10px] text-[var(--c-text3)] hover:text-red-400">✕</button>
                </div>
              )}
            </div>
          )}

          {/* Formulario simple */}
          {(!necesitaCategoria || categoria) && (
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6">
              <p className="text-sm font-semibold text-[var(--c-text)] mb-5">
                {tipoActual?.label}{categoria ? ` — ${categoria}` : ""}
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="hidden" name="tipo" value={tipo} />
                <input type="hidden" name="categoria" value={categoria} />
                <div>
                  <label className="text-xs text-[var(--c-text2)] block mb-1.5">Monto ($) *</label>
                  <input name="monto" type="hidden" value={montoDisplay.replace(/\./g,"")} />
                  <input type="text" inputMode="numeric" placeholder="0" required
                    value={montoDisplay} onChange={e => { const v = e.target.value.replace(/[^0-9]/g,""); setMontoDisplay(v ? Number(v).toLocaleString("es-CL") : "") }}
                    className={`${inp} h-16 text-3xl font-bold text-center`} />
                </div>
                <div>
                  <label className="text-xs text-[var(--c-text2)] block mb-1.5">Fecha *</label>
                  <input name="fecha" type="date" defaultValue={localToday()} required className={`${inp} h-11`} />
                </div>
                <div>
                  <label className="text-xs text-[var(--c-text2)] block mb-1.5">Descripción (opcional)</label>
                  <textarea name="descripcion" rows={2} placeholder="Agrega un detalle..." className={`${inp} py-3 resize-none`} />
                </div>
                <button type="submit" disabled={isPending}
                  className="w-full h-12 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                  {isPending ? "Guardando..." : "✅ Registrar"}
                </button>
              </form>
            </div>
          )}

          {necesitaCategoria && !categoria && (
            <div className="text-center py-4 text-[var(--c-text3)]">
              <p className="text-xs">← Selecciona una categoría para continuar</p>
            </div>
          )}
        </>
      )}

    </div>
  )
}
