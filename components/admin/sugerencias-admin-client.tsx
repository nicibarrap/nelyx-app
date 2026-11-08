"use client"
import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { obtenerSugerenciasAdmin, actualizarEstadoSugerencia } from "@/app/actions/sugerencias-acciones"
import { ESTADOS_SUGERENCIA, type EstadoSugerencia } from "@/lib/sugerencias"
import { SincronizarPendiente } from "@/components/dashboard/navegacion-provider"

type Sugerencia = {
  id: string; titulo: string; descripcion: string; estado: string; notaAdmin: string | null
  autorNombre: string | null; createdAt: string; updatedAt: string; negocio: string
}

const ESTADO_CFG: Record<string, { label: string; className: string }> = {
  nueva: { label: "Nueva", className: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  en_analisis: { label: "En análisis", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  planificado: { label: "Planificado", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  en_desarrollo: { label: "En desarrollo", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  implementado: { label: "Implementado", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  no_por_ahora: { label: "No por ahora", className: "bg-red-500/10 text-red-400 border-red-500/20" },
}

function tiempoRelativo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "Ahora"
  if (min < 60) return `Hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Hace ${h}h`
  return `Hace ${Math.round(h / 24)}d`
}

export function SugerenciasAdminClient() {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [filtro, setFiltro] = useState<string>("todas")
  const [editandoNota, setEditandoNota] = useState<string | null>(null)
  const [notaDraft, setNotaDraft] = useState("")
  const [pending, start] = useTransition()

  async function cargar() {
    const data = await obtenerSugerenciasAdmin(filtro === "todas" ? undefined : filtro)
    setSugerencias(data as Sugerencia[])
  }

  useEffect(() => { cargar() }, [filtro]) // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarEstado(id: string, estado: EstadoSugerencia, conNota: boolean) {
    start(async () => {
      const resultado = await actualizarEstadoSugerencia(id, estado, conNota ? notaDraft : undefined)
      if (resultado?.error) { toast.error(resultado.error); return }
      toast.success("Estado actualizado — el dueño recibe un aviso")
      setEditandoNota(null)
      setNotaDraft("")
      await cargar()
    })
  }

  return (
    <div className="space-y-4 animate-fade-up pb-6">
      <div className="flex flex-col gap-3">
        <Link href="/admin/clientes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--c-text3)] hover:text-sky-400 transition-colors w-fit">
          ← Clientes NELYX
          <SincronizarPendiente />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">💡 Sugerencias</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Ideas que dejaron los negocios que usan Nelyx, desde el chat de Soporte.</p>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {["todas", ...ESTADOS_SUGERENCIA].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`flex-shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
              filtro === f ? "bg-sky-500/10 text-sky-400 border-sky-500/30" : "text-[var(--c-text3)] border-[var(--c-border2)] hover:text-[var(--c-text)]"
            }`}>
            {f === "todas" ? "Todas" : ESTADO_CFG[f]?.label ?? f}
          </button>
        ))}
      </div>

      {sugerencias.length === 0 ? (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl py-12 text-center text-sm text-[var(--c-text4)]">
          No hay sugerencias {filtro !== "todas" ? `en estado "${ESTADO_CFG[filtro]?.label}"` : "todavía"}.
        </div>
      ) : (
        <div className="space-y-3">
          {sugerencias.map(s => {
            const cfg = ESTADO_CFG[s.estado] ?? ESTADO_CFG.nueva
            const estaEditandoNota = editandoNota === s.id
            return (
              <div key={s.id} className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-sky-400">{s.negocio}{s.autorNombre ? ` · ${s.autorNombre}` : ""}</p>
                    <p className="text-sm font-bold text-[var(--c-text)] mt-0.5">{s.titulo}</p>
                  </div>
                  <span className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${cfg.className}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-[var(--c-text2)] leading-relaxed mt-2 whitespace-pre-wrap">{s.descripcion}</p>
                {s.notaAdmin && !estaEditandoNota && (
                  <p className="text-[11px] text-[var(--c-text3)] italic mt-2 border-t border-[var(--c-border2)] pt-2">Tu nota: "{s.notaAdmin}"</p>
                )}
                <p className="text-[10px] text-[var(--c-text4)] mt-2">Enviada {tiempoRelativo(s.createdAt)} · Actualizada {tiempoRelativo(s.updatedAt)}</p>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <select value={s.estado} disabled={pending}
                    onChange={e => cambiarEstado(s.id, e.target.value as EstadoSugerencia, estaEditandoNota)}
                    className="h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-xs text-[var(--c-text)] outline-none focus:border-sky-500">
                    {ESTADOS_SUGERENCIA.map(estado => <option key={estado} value={estado}>{ESTADO_CFG[estado].label}</option>)}
                  </select>
                  {!estaEditandoNota ? (
                    <button onClick={() => { setEditandoNota(s.id); setNotaDraft(s.notaAdmin ?? "") }}
                      className="text-[11px] text-[var(--c-text3)] hover:text-sky-400 font-semibold">
                      {s.notaAdmin ? "Editar nota" : "+ Agregar nota"}
                    </button>
                  ) : null}
                </div>

                {estaEditandoNota && (
                  <div className="flex gap-2 mt-2">
                    <input value={notaDraft} onChange={e => setNotaDraft(e.target.value)} maxLength={500}
                      placeholder="Ej: lo vamos a incluir en el próximo trimestre"
                      className="flex-1 h-9 bg-[var(--c-input)] border border-sky-500/30 rounded-xl px-3 text-xs text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none" />
                    <button onClick={() => cambiarEstado(s.id, s.estado as EstadoSugerencia, true)} disabled={pending}
                      className="h-9 px-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-semibold rounded-xl">
                      Guardar
                    </button>
                    <button onClick={() => { setEditandoNota(null); setNotaDraft("") }}
                      className="h-9 px-3 border border-[var(--c-border)] text-[var(--c-text3)] text-xs rounded-xl hover:bg-[var(--c-hover)]">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
