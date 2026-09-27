"use client"
import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import {
  obtenerOCrearConversacion, obtenerMensajesCliente, enviarMensajeCliente, contarNoLeidosCliente,
} from "@/app/actions/soporte-acciones"

type Mensaje = { id: string; de: string; autorNombre: string | null; contenido: string; createdAt: string }

function tiempoRelativo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "Ahora"
  if (min < 60) return `Hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Hace ${h}h`
  return `Hace ${Math.round(h / 24)}d`
}

export function ChatSoporteWidget() {
  const [open, setOpen] = useState(false)
  const [conversacionId, setConversacionId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState("")
  const [noLeidos, setNoLeidos] = useState(0)
  const [pending, start] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Badge de no leídos mientras el panel está cerrado — más liviano que
  // abrir la conversación completa cada vez.
  useEffect(() => {
    let activo = true
    async function chequear() {
      const n = await contarNoLeidosCliente().catch(() => 0)
      if (activo) setNoLeidos(n)
    }
    chequear()
    const interval = setInterval(chequear, 20000)
    return () => { activo = false; clearInterval(interval) }
  }, [])

  async function cargarMensajes(id: string) {
    const data = await obtenerMensajesCliente(id)
    setMensajes(data as Mensaje[])
    setNoLeidos(0)
  }

  // Al abrir: obtiene (o crea) la conversación una sola vez.
  useEffect(() => {
    if (!open) return
    let activo = true
    obtenerOCrearConversacion().then(({ id }) => { if (activo) setConversacionId(id) })
    return () => { activo = false }
  }, [open])

  // Con la conversación ya conocida: carga inicial + polling mientras el
  // panel siga abierto. Efecto separado del anterior para que el
  // intervalo cierre sobre el conversacionId correcto (no uno viejo).
  useEffect(() => {
    if (!open || !conversacionId) return
    cargarMensajes(conversacionId)
    const interval = setInterval(() => cargarMensajes(conversacionId), 4000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversacionId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [mensajes])

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const contenido = texto.trim()
    if (!contenido || !conversacionId) return
    setTexto("")
    start(async () => {
      try {
        await enviarMensajeCliente(conversacionId, contenido, pathname)
        await cargarMensajes(conversacionId)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo enviar el mensaje")
      }
    })
  }

  const contenidoPanel = (
    <>
      <div className="px-4 py-3 border-b border-[var(--c-border2)] flex items-center gap-2.5 flex-shrink-0">
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)" }}>💬</span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[var(--c-text)]">Soporte Nelyx</p>
          <p className="text-[10px] text-[var(--c-text4)]">Normalmente responde en minutos</p>
        </div>
        <button onClick={() => setOpen(false)} className="ml-auto w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-[var(--c-text4)]">✕</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {mensajes.length === 0 ? (
          <p className="text-center text-xs text-[var(--c-text4)] py-8">
            ¿En qué te podemos ayudar? Escríbenos tu duda o el problema que tengas con la plataforma.
          </p>
        ) : mensajes.map(m => {
          const esCliente = m.de === "cliente"
          const esSistema = m.de === "sistema"
          return (
            <div key={m.id} className={`flex ${esCliente ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                esCliente ? "rounded-br-sm" : esSistema ? "rounded-bl-sm" : "rounded-bl-sm"
              }`} style={{
                background: esCliente ? "linear-gradient(135deg,#2563eb,#3b82f6)" : esSistema ? "var(--c-hover)" : "var(--c-card2, var(--c-hover))",
                color: esCliente ? "#fff" : "var(--c-text)",
              }}>
                {!esCliente && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{esSistema ? "Nelyx" : "Soporte Nelyx"}</p>}
                <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{m.contenido}</p>
                <p className={`text-[9px] mt-1 ${esCliente ? "text-white/60" : "text-[var(--c-text4)]"}`}>{tiempoRelativo(m.createdAt)}</p>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={enviar} className="p-3 border-t border-[var(--c-border2)] flex-shrink-0 flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe tu mensaje…" maxLength={2000}
          className="flex-1 h-10 rounded-xl px-3.5 text-sm outline-none border border-[var(--c-border2)] bg-[var(--c-hover)] text-[var(--c-text)] placeholder:text-[var(--c-text4)] focus:border-blue-400/50" />
        <button type="submit" disabled={pending || !texto.trim()}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all hover:brightness-110"
          style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)" }}>
          {pending ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "➤"}
        </button>
      </form>
    </>
  )

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-2xl text-white transition-transform hover:scale-105 active:scale-95"
        style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)", boxShadow: "0 8px 32px rgba(37,99,235,0.4)" }}
        aria-label="Abrir chat de soporte">
        {open ? "✕" : "💬"}
        {!open && noLeidos > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--c-bg)]">
            {noLeidos > 9 ? "9+" : noLeidos}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Desktop: panel anclado sobre la burbuja */}
          <div className="hidden sm:flex flex-col fixed bottom-24 right-6 z-40 w-[360px] h-[480px] max-h-[70vh] bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            {contenidoPanel}
          </div>

          {/* Mobile: bottom sheet a pantalla completa de ancho */}
          <div className="sm:hidden fixed inset-0 z-[90] flex items-end">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="relative w-full h-[85vh] bg-[var(--c-card)] border-t border-[var(--c-border)] rounded-t-3xl overflow-hidden flex flex-col animate-fade-up">
              <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-2.5 mb-1 flex-shrink-0" />
              {contenidoPanel}
            </div>
          </div>
        </>
      )}
    </>
  )
}
