"use client"
import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  obtenerConversacionesAdmin, obtenerMensajesAdmin, enviarMensajeSoporte, marcarConversacionResuelta,
} from "@/app/actions/soporte-acciones"

type Conversacion = {
  id: string; estado: string; negocio: string; ultimoMensajeDe: string
  ultimoMensajeAt: string; ultimoMensaje: string; urgente: boolean; noLeidos: number
}
type Mensaje = { id: string; de: string; autorNombre: string | null; contenido: string; paginaOrigen: string | null; createdAt: string }

const RESPUESTAS_RAPIDAS = [
  "¡Hola! Estamos revisando tu caso, en un momento te contamos más 🙂",
  "¿Nos puedes enviar una captura de pantalla para entenderlo mejor?",
  "Listo, quedó resuelto de nuestro lado. ¿Puedes confirmar que ya te funciona?",
  "Gracias por avisarnos — ya estamos trabajando en eso.",
]

function tiempoRelativo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "Ahora"
  if (min < 60) return `Hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Hace ${h}h`
  return `Hace ${Math.round(h / 24)}d`
}

export function SoporteAdminClient({ conversacionInicialId }: { conversacionInicialId: string | null }) {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
  const [seleccionada, setSeleccionada] = useState<string | null>(conversacionInicialId)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState("")
  const [soloAbiertas, setSoloAbiertas] = useState(true)
  const [pending, start] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  async function cargarLista() {
    const data = await obtenerConversacionesAdmin()
    setConversaciones(data as Conversacion[])
  }

  useEffect(() => {
    cargarLista()
    const interval = setInterval(cargarLista, 10000)
    return () => clearInterval(interval)
  }, [])

  async function cargarMensajes(id: string) {
    const data = await obtenerMensajesAdmin(id)
    setMensajes(data as Mensaje[])
  }

  useEffect(() => {
    if (!seleccionada) return
    cargarMensajes(seleccionada)
    const interval = setInterval(() => cargarMensajes(seleccionada), 5000)
    return () => clearInterval(interval)
  }, [seleccionada])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [mensajes])

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const contenido = texto.trim()
    if (!contenido || !seleccionada) return
    setTexto("")
    start(async () => {
      try {
        await enviarMensajeSoporte(seleccionada, contenido)
        await cargarMensajes(seleccionada)
        await cargarLista()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo enviar")
      }
    })
  }

  function toggleResuelta(id: string, estadoActual: string) {
    start(async () => {
      await marcarConversacionResuelta(id, estadoActual !== "resuelta")
      await cargarLista()
    })
  }

  const lista = conversaciones.filter(c => !soloAbiertas || c.estado === "abierta")
  const conv = conversaciones.find(c => c.id === seleccionada)

  return (
    <div className="space-y-4 animate-fade-up pb-6">
      <div className="flex flex-col gap-3">
        <Link href="/admin/clientes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--c-text3)] hover:text-sky-400 transition-colors w-fit">
          ← Clientes NELYX
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Soporte NELYX</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Conversaciones en vivo con los negocios que usan la plataforma.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[70vh] min-h-[500px]">
        {/* Lista de conversaciones */}
        <div className={`bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl flex flex-col overflow-hidden ${seleccionada ? "hidden lg:flex" : "flex"}`}>
          <div className="px-3 py-2.5 border-b border-[var(--c-border2)] flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-bold text-[var(--c-text)]">Conversaciones</span>
            <button onClick={() => setSoloAbiertas(!soloAbiertas)}
              className={`text-[10px] px-2 py-1 rounded-lg font-semibold ${soloAbiertas ? "bg-sky-500/10 text-sky-400" : "text-[var(--c-text4)]"}`}>
              {soloAbiertas ? "Solo abiertas" : "Todas"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--c-border2)]">
            {lista.length === 0 ? (
              <p className="px-4 py-8 text-xs text-[var(--c-text4)] text-center">Sin conversaciones</p>
            ) : lista.map(c => (
              <button key={c.id} onClick={() => setSeleccionada(c.id)}
                className={`w-full text-left px-3.5 py-3 hover:bg-[var(--c-hover)] transition-all ${seleccionada === c.id ? "bg-sky-500/[0.06]" : ""}`}>
                <div className="flex items-center gap-2">
                  {c.urgente && <span className="text-xs">🔴</span>}
                  <p className="text-xs font-semibold text-[var(--c-text)] truncate flex-1">{c.negocio}</p>
                  {c.noLeidos > 0 && <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{c.noLeidos}</span>}
                </div>
                <p className="text-[11px] text-[var(--c-text4)] mt-0.5 truncate">{c.ultimoMensajeDe === "cliente" ? "" : "Tú: "}{c.ultimoMensaje}</p>
                <p className="text-[9px] text-[var(--c-text4)] mt-1">{tiempoRelativo(c.ultimoMensajeAt)} {c.estado === "resuelta" && "· Resuelta"}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Hilo de mensajes */}
        <div className={`bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl flex-col overflow-hidden ${seleccionada ? "flex" : "hidden lg:flex"}`}>
          {!seleccionada || !conv ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--c-text4)]">Elige una conversación</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-[var(--c-border2)] flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setSeleccionada(null)} className="lg:hidden w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-[var(--c-text4)]">←</button>
                <p className="text-sm font-bold text-[var(--c-text)] truncate flex-1">{conv.negocio}</p>
                <button onClick={() => toggleResuelta(conv.id, conv.estado)} disabled={pending}
                  className={`text-[10px] px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap ${conv.estado === "resuelta" ? "bg-slate-500/10 text-slate-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                  {conv.estado === "resuelta" ? "Reabrir" : "✓ Marcar resuelta"}
                </button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                {mensajes.map(m => {
                  const esSoporte = m.de === "soporte"
                  const esSistema = m.de === "sistema"
                  return (
                    <div key={m.id} className={`flex ${esSoporte ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${esSoporte ? "rounded-br-sm" : "rounded-bl-sm"}`}
                        style={{ background: esSoporte ? "linear-gradient(135deg,#2563eb,#3b82f6)" : "var(--c-hover)", color: esSoporte ? "#fff" : "var(--c-text)" }}>
                        {!esSoporte && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{esSistema ? "Mensaje automático" : m.autorNombre || "Cliente"}</p>}
                        <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{m.contenido}</p>
                        <div className={`flex items-center gap-1.5 mt-1 text-[9px] ${esSoporte ? "text-white/60" : "text-[var(--c-text4)]"}`}>
                          <span>{tiempoRelativo(m.createdAt)}</span>
                          {m.paginaOrigen && !esSoporte && !esSistema && <span>· desde {m.paginaOrigen}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="px-4 py-2 border-t border-[var(--c-border2)] flex-shrink-0 flex gap-1.5 overflow-x-auto">
                {RESPUESTAS_RAPIDAS.map(r => (
                  <button key={r} onClick={() => setTexto(r)}
                    className="flex-shrink-0 text-[10px] px-2.5 py-1.5 rounded-full border border-[var(--c-border2)] text-[var(--c-text3)] hover:border-sky-400/40 hover:text-sky-400 transition-all whitespace-nowrap">
                    {r.length > 32 ? r.slice(0, 32) + "…" : r}
                  </button>
                ))}
              </div>

              <form onSubmit={enviar} className="p-3 border-t border-[var(--c-border2)] flex-shrink-0 flex gap-2">
                <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Responder como Soporte Nelyx…" maxLength={2000}
                  className="flex-1 h-10 rounded-xl px-3.5 text-sm outline-none border border-[var(--c-border2)] bg-[var(--c-hover)] text-[var(--c-text)] placeholder:text-[var(--c-text4)] focus:border-sky-400/50" />
                <button type="submit" disabled={pending || !texto.trim()}
                  className="h-10 px-4 rounded-xl text-white text-sm font-bold disabled:opacity-40 transition-all hover:brightness-110"
                  style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)" }}>
                  Enviar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
