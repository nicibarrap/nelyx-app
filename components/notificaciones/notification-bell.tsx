"use client"
import { useEffect, useState, useTransition } from "react"
import { obtenerNotificaciones, marcarLeida, marcarTodasLeidas } from "@/app/actions/notificaciones-acciones"
import Link from "next/link"

type Notif = { id: string; categoria: string; prioridad: string; titulo: string; mensaje: string; accionUrl: string | null; leida: boolean; createdAt: string }
type Filtro = "todas" | "no_leidas" | "leidas"

const PRIORIDAD_DOT: Record<string, string> = { alta: "bg-red-400", media: "bg-amber-400", baja: "bg-slate-400" }

function tiempoRelativo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "Ahora"
  if (min < 60) return `Hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Hace ${h}h`
  return `Hace ${Math.round(h / 24)}d`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>("todas")
  const [items, setItems] = useState<Notif[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [pending, start] = useTransition()

  async function cargar(f: Filtro = filtro) {
    const data = await obtenerNotificaciones(f)
    setItems(data as Notif[])
    setNoLeidas(data.filter((n: any) => !n.leida).length)
  }

  useEffect(() => {
    cargar("todas")
    const interval = setInterval(() => cargar(filtro), 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (open) cargar(filtro) }, [filtro, open])

  function click(n: Notif) {
    if (!n.leida) start(async () => { await marcarLeida(n.id); cargar(filtro) })
  }

  function todasLeidas() {
    start(async () => { await marcarTodasLeidas(); cargar(filtro) })
  }

  const contenido = (
    <>
      <div className="px-4 py-3 border-b border-[var(--c-border2)] flex items-center justify-between flex-shrink-0">
        <p className="text-xs font-bold text-[var(--c-text)]">Notificaciones</p>
        <button onClick={todasLeidas} disabled={pending} className="text-[10px] text-sky-400 hover:text-sky-300 disabled:opacity-50">Marcar todas leídas</button>
      </div>
      <div className="flex gap-1 px-3 py-2 border-b border-[var(--c-border2)] flex-shrink-0 overflow-x-auto">
        {([["todas","Todas"],["no_leidas","No leídas"],["leidas","Leídas"]] as [Filtro,string][]).map(([k,label]) => (
          <button key={k} onClick={() => setFiltro(k)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all whitespace-nowrap ${filtro===k?"bg-sky-500/10 text-sky-400":"text-[var(--c-text4)] hover:text-[var(--c-text)]"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border2)]">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-xs text-[var(--c-text4)] text-center">Sin notificaciones</p>
        ) : items.map(n => (
          <Link key={n.id} href={n.accionUrl ?? "#"} onClick={() => { click(n); setOpen(false) }}
            className={`flex items-start gap-2.5 px-4 py-3.5 sm:py-3 hover:bg-[var(--c-hover)] active:bg-[var(--c-hover)] transition-all min-w-0 ${!n.leida?"bg-sky-500/[0.03]":""}`}>
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${PRIORIDAD_DOT[n.prioridad]??"bg-slate-400"}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold truncate ${!n.leida?"text-[var(--c-text)]":"text-[var(--c-text3)]"}`}>{n.titulo}</p>
              <p className="text-[11px] sm:text-[10px] text-[var(--c-text4)] mt-0.5 break-words line-clamp-2">{n.mensaje}</p>
              <p className="text-[9px] text-[var(--c-text4)] mt-1">{tiempoRelativo(n.createdAt)}</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-4 py-3 sm:py-2.5 border-t border-[var(--c-border2)] flex-shrink-0">
        <Link href="/dashboard/configuracion" onClick={() => setOpen(false)} className="text-[11px] sm:text-[10px] text-sky-400 hover:text-sky-300">⚙️ Configurar notificaciones</Link>
      </div>
    </>
  )

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative w-8 h-8 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center transition-all">
        <span className="text-base">🔔</span>
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Desktop: dropdown anclado a la campana */}
          <div className="hidden sm:block fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="hidden sm:flex absolute right-0 top-full mt-2 w-80 bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl shadow-2xl z-20 overflow-hidden animate-scale-in flex-col max-h-[70vh]">
            {contenido}
          </div>

          {/* Mobile: bottom sheet a pantalla completa de ancho, evita overflow y clipping */}
          <div className="sm:hidden fixed inset-0 z-[90] flex items-end">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="relative w-full max-h-[80vh] bg-[var(--c-card)] border-t border-[var(--c-border)] rounded-t-3xl overflow-hidden flex flex-col animate-fade-up">
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-2.5 mb-1 flex-shrink-0" />
              {contenido}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
