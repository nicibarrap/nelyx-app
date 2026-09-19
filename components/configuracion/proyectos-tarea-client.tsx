"use client"
import { useState, useTransition, useEffect } from "react"
import { toast } from "sonner"
import { crearProyectoTarea, editarProyectoTarea, eliminarProyectoTarea, actualizarEstadoEventoCalendario } from "@/app/actions/acciones"

const inp = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

// Paleta fija de colores para identificar proyectos/categorías de tareas —
// mismo criterio visual que el resto de NELYX (dot + fondo translúcido).
export const COLORES_PROYECTO: Record<string, string> = {
  azul:     "#0ea5e9",
  celeste:  "#38bdf8",
  violeta:  "#8b5cf6",
  rosado:   "#ec4899",
  rojo:     "#ef4444",
  naranjo:  "#f97316",
  amarillo: "#eab308",
  verde:    "#22c55e",
  esmeralda:"#10b981",
  cian:     "#06b6d4",
  indigo:   "#6366f1",
  slate:    "#64748b",
}

type Tarea = { id: string; titulo: string; estado: string; fecha: string; horaLimite: string | null }
type Proyecto = { id: string; nombre: string; descripcion: string | null; color: string; tareas: Tarea[] }

function fmtFecha(iso: string, hora: string | null) {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return hora ? `${dd}/${mm} · ${hora}` : `${dd}/${mm}`
}

function ModalProyecto({ editando, onClose }: { editando?: Proyecto | null; onClose: () => void }) {
  const [isPending, start] = useTransition()
  const [nombre, setNombre] = useState(editando?.nombre ?? "")
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? "")
  const [color, setColor] = useState(editando?.color ?? "azul")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    start(async () => {
      try {
        const fd = new FormData()
        fd.set("nombre", nombre); fd.set("descripcion", descripcion); fd.set("color", color)
        if (editando) { await editarProyectoTarea(editando.id, fd); toast.success("Proyecto actualizado") }
        else { await crearProyectoTarea(fd); toast.success("Proyecto creado") }
        onClose()
      } catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
          <p className="text-sm font-bold text-[var(--c-text)]">{editando ? "Editar proyecto" : "Nuevo proyecto"}</p>
          <button type="button" onClick={onClose} className="w-6 h-6 rounded-full bg-[var(--c-card2)] text-xs text-[var(--c-text3)] flex items-center justify-center hover:bg-[var(--c-hover)]">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Nombre *</label>
            <input required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Salud, Trabajo..." className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Opcional" className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COLORES_PROYECTO).map(([nombreColor, hex]) => (
                <button key={nombreColor} type="button" onClick={() => setColor(nombreColor)}
                  title={nombreColor}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                  style={{ backgroundColor: hex, outline: color === nombreColor ? `2px solid ${hex}` : "none", outlineOffset: 2, boxShadow: color === nombreColor ? "0 0 0 2px var(--c-card)" : "none" }}>
                  {color === nombreColor && <span className="text-white text-xs">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[var(--c-border)] flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-9 text-xs font-semibold border border-[var(--c-border)] text-[var(--c-text2)] rounded-lg hover:bg-[var(--c-card2)] transition-all">Cancelar</button>
          <button type="submit" disabled={isPending} className="flex-1 h-9 text-xs font-bold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white rounded-lg transition-all">
            {isPending ? "..." : editando ? "Guardar" : "Crear"}
          </button>
        </div>
      </form>
    </div>
  )
}

export function ProyectosTareaClient({ proyectos: proyectosIniciales }: { proyectos: Proyecto[] }) {
  const [proyectos, setProyectos] = useState(proyectosIniciales)
  // Las acciones de crear/editar/eliminar disparan revalidatePath, lo que hace
  // que Next.js vuelva a renderizar el Server Component padre y nos pase
  // props frescas — las reflejamos en el estado local para que se vean sin
  // recargar la página.
  useEffect(() => { setProyectos(proyectosIniciales) }, [proyectosIniciales])
  const [expandido, setExpandido] = useState<string | null>(null)
  const [modal, setModal] = useState<"nuevo" | Proyecto | null>(null)
  const [isPending, start] = useTransition()

  function handleToggleTarea(id: string, estado: string) {
    const nuevoEstado = estado === "completada" ? "pendiente" : "completada"
    setProyectos(prev => prev.map(p => ({ ...p, tareas: p.tareas.map(t => t.id === id ? { ...t, estado: nuevoEstado } : t) })))
    start(async () => { try { await actualizarEstadoEventoCalendario(id, nuevoEstado) } catch { toast.error("Error") } })
  }

  function handleEliminar(p: Proyecto) {
    if (!confirm(`¿Eliminar el proyecto "${p.nombre}"? Las tareas que tenía asignadas no se eliminan, solo quedan sin categoría.`)) return
    start(async () => {
      try {
        await eliminarProyectoTarea(p.id)
        setProyectos(prev => prev.filter(x => x.id !== p.id))
        if (expandido === p.id) setExpandido(null)
        toast.success("Proyecto eliminado")
      } catch (err: any) { toast.error(err?.message ?? "No se pudo eliminar") }
    })
  }

  const activo = expandido ? proyectos.find(p => p.id === expandido) ?? null : null

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-[var(--c-text)]">Categorías de tareas</h2>
        <button onClick={() => setModal("nuevo")} className="h-8 px-3 text-xs font-bold bg-sky-500 hover:bg-sky-400 text-white rounded-lg transition-all whitespace-nowrap">
          + Nuevo proyecto
        </button>
      </div>
      <p className="text-xs text-[var(--c-text3)] mb-4">Organiza tus tareas del Calendario en proyectos. Haz click en uno para ver sus tareas.</p>

      {proyectos.length === 0 ? (
        <p className="text-xs text-[var(--c-text4)] text-center py-6">Todavía no has creado ningún proyecto.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {proyectos.map(p => {
            const hex = COLORES_PROYECTO[p.color] ?? COLORES_PROYECTO.azul
            const total = p.tareas.length
            const completadas = p.tareas.filter(t => t.estado === "completada").length
            const pendientes = total - completadas
            const pct = total > 0 ? Math.round((completadas / total) * 100) : 0
            const isExpandido = expandido === p.id
            return (
              <div key={p.id} onClick={() => setExpandido(isExpandido ? null : p.id)}
                className={`cursor-pointer rounded-xl border-t-4 bg-[var(--c-card2)] border border-[var(--c-border)] p-3.5 transition-all hover:bg-[var(--c-hover)] ${isExpandido ? "ring-1 ring-sky-500/40" : ""}`}
                style={{ borderTopColor: hex }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
                    <p className="text-sm font-bold text-[var(--c-text)] truncate">{p.nombre}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setModal(p)} className="w-6 h-6 rounded-lg text-[11px] text-[var(--c-text4)] hover:text-sky-400 hover:bg-[var(--c-hover)] flex items-center justify-center transition-all">✏️</button>
                    <button onClick={() => handleEliminar(p)} disabled={isPending} className="w-6 h-6 rounded-lg text-[11px] text-[var(--c-text4)] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all">✕</button>
                  </div>
                </div>
                <p className="text-xs text-[var(--c-text3)] mt-1 truncate">{p.descripcion || "Sin descripción"}</p>
                <div className="h-1.5 bg-[var(--c-card)] rounded-full overflow-hidden mt-3">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: hex }} />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-[var(--c-text3)]">{total} {total === 1 ? "tarea" : "tareas"} · {pct}%</p>
                  <div className="flex items-center gap-1">
                    {pendientes > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-[var(--c-warning)]">{pendientes} pend.</span>}
                    {completadas > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">{completadas}✓</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activo && (
        <div className="mt-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] overflow-hidden animate-scale-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORES_PROYECTO[activo.color] ?? COLORES_PROYECTO.azul }} />
              <p className="text-sm font-bold text-[var(--c-text)]">{activo.nombre} — {activo.tareas.length} {activo.tareas.length === 1 ? "tarea" : "tareas"} · {activo.tareas.length > 0 ? Math.round((activo.tareas.filter(t => t.estado === "completada").length / activo.tareas.length) * 100) : 0}%</p>
            </div>
            <button onClick={() => setExpandido(null)} className="w-6 h-6 rounded-full bg-[var(--c-card)] text-xs text-[var(--c-text3)] flex items-center justify-center hover:bg-[var(--c-hover)]">✕</button>
          </div>
          {activo.tareas.length === 0 ? (
            <p className="px-4 py-6 text-xs text-[var(--c-text3)] text-center">Sin tareas asignadas a este proyecto todavía. Asígnalo al crear una tarea desde el Calendario.</p>
          ) : (
            <div className="divide-y divide-[var(--c-border2)] max-h-72 overflow-y-auto">
              {activo.tareas.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button onClick={() => handleToggleTarea(t.id, t.estado)} disabled={isPending}
                    className={`w-4 h-4 rounded-sm border-2 flex-shrink-0 flex items-center justify-center transition-all text-[10px] ${t.estado === "completada" ? "text-white" : "border-[var(--c-border)] hover:border-sky-400"}`}
                    style={t.estado === "completada" ? { backgroundColor: COLORES_PROYECTO[activo.color] ?? COLORES_PROYECTO.azul, borderColor: COLORES_PROYECTO[activo.color] ?? COLORES_PROYECTO.azul } : undefined}>
                    {t.estado === "completada" && "✓"}
                  </button>
                  <p className={`text-xs flex-1 truncate transition-all ${t.estado === "completada" ? "line-through text-[var(--c-text4)]" : "text-[var(--c-text)]"}`}>{t.titulo}</p>
                  <p className={`text-[10px] flex-shrink-0 ${t.estado === "completada" ? "text-[var(--c-text4)]" : "text-[var(--c-text3)]"}`}>{fmtFecha(t.fecha, t.horaLimite)}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${t.estado === "completada" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>
                    {t.estado === "completada" ? "✓ Lista" : "Pendiente"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <ModalProyecto
          editando={modal === "nuevo" ? null : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
