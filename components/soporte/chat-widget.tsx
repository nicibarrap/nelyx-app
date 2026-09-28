"use client"
import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import {
  obtenerOCrearConversacion, obtenerMensajesCliente, enviarMensajeCliente, contarNoLeidosCliente,
  obtenerConversacionesCliente,
} from "@/app/actions/soporte-acciones"

type Mensaje = { id: string; de: string; autorNombre: string | null; contenido: string; createdAt: string }
type Conversacion = { id: string; estado: string; titulo: string; ultimoMensaje: string; ultimoMensajeAt: string; noLeidos: number }
type Vista = "inicio" | "mensajes" | "hilo"

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
  const [vista, setVista] = useState<Vista>("inicio")
  const [origenHilo, setOrigenHilo] = useState<Vista>("inicio")
  const [conversacionId, setConversacionId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
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

  // Al abrir el panel: siempre parte en Inicio.
  useEffect(() => {
    if (open) setVista("inicio")
  }, [open])

  async function cargarConversaciones() {
    const data = await obtenerConversacionesCliente().catch(() => [])
    setConversaciones(data as Conversacion[])
  }

  // Pestaña "Mensajes": carga la lista + refresca mientras siga abierta.
  useEffect(() => {
    if (!open || vista !== "mensajes") return
    cargarConversaciones()
    const interval = setInterval(cargarConversaciones, 8000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vista])

  async function cargarMensajes(id: string) {
    const data = await obtenerMensajesCliente(id)
    setMensajes(data as Mensaje[])
    // obtenerMensajesCliente ya marcó como leídos los mensajes de este
    // hilo — se recalcula el total (puede haber no leídos en otros hilos).
    const n = await contarNoLeidosCliente().catch(() => 0)
    setNoLeidos(n)
  }

  // Un hilo abierto: carga inicial + polling. Efecto separado del de arriba
  // para que el intervalo cierre sobre el conversacionId correcto (no uno
  // viejo por stale closure).
  useEffect(() => {
    if (!open || vista !== "hilo" || !conversacionId) return
    cargarMensajes(conversacionId)
    const interval = setInterval(() => cargarMensajes(conversacionId), 4000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vista, conversacionId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [mensajes])

  function irAMensajes() { setVista("mensajes") }
  function irAInicio() { setVista("inicio") }

  function abrirConversacionActiva() {
    start(async () => {
      const { id } = await obtenerOCrearConversacion()
      setConversacionId(id)
      setOrigenHilo("inicio")
      setVista("hilo")
    })
  }

  function abrirHilo(id: string) {
    setConversacionId(id)
    setOrigenHilo("mensajes")
    setVista("hilo")
  }

  function volverDeHilo() {
    setVista(origenHilo)
    setConversacionId(null)
    setMensajes([])
  }

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

  const vistaInicio = (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      <p className="text-base font-bold text-[var(--c-text)]">¿Cómo podemos ayudarte? 👋</p>
      <p className="text-xs text-[var(--c-text3)] leading-relaxed">
        Escríbenos tu duda o el problema que tengas con la plataforma — normalmente respondemos en minutos.
      </p>
      <button onClick={abrirConversacionActiva} disabled={pending}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--c-border2)] bg-[var(--c-hover)] px-3.5 py-3 text-left transition-all hover:border-blue-400/40 disabled:opacity-60">
        <span className="text-xs font-semibold text-[var(--c-text)]">Envíanos un mensaje</span>
        <span className="text-blue-400">➤</span>
      </button>
      {noLeidos > 0 && (
        <button onClick={irAMensajes} className="w-full text-left rounded-xl border border-blue-400/30 bg-blue-500/5 px-3.5 py-3 transition-all hover:bg-blue-500/10">
          <span className="text-xs font-semibold text-blue-400">Tienes respuestas nuevas — ver Mensajes →</span>
        </button>
      )}
    </div>
  )

  const vistaMensajes = (
    <div className="flex-1 overflow-y-auto">
      {conversaciones.length === 0 ? (
        <p className="text-center text-xs text-[var(--c-text4)] py-10 px-4">
          Aún no tienes conversaciones. Escríbenos tu primera duda desde Inicio.
        </p>
      ) : (
        <div className="divide-y divide-[var(--c-border2)]">
          {conversaciones.map(c => (
            <button key={c.id} onClick={() => abrirHilo(c.id)}
              className="w-full text-left px-4 py-3 flex items-start gap-2.5 transition-all hover:bg-[var(--c-hover)]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-[var(--c-text)] truncate">{c.titulo}</p>
                  {c.estado === "resuelta" && <span className="text-[9px] text-emerald-400 flex-shrink-0">✓ Resuelta</span>}
                </div>
                <p className="text-[11px] text-[var(--c-text4)] truncate mt-0.5">{c.ultimoMensaje}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[10px] text-[var(--c-text4)] whitespace-nowrap">{tiempoRelativo(c.ultimoMensajeAt)}</span>
                {c.noLeidos > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {c.noLeidos > 9 ? "9+" : c.noLeidos}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const vistaHilo = (
    <>
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

  const contenidoPanel = (
    <>
      <div className="px-4 py-3 border-b border-[var(--c-border2)] flex items-center gap-2.5 flex-shrink-0">
        {vista === "hilo" ? (
          <button onClick={volverDeHilo} className="w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-[var(--c-text3)] flex-shrink-0">←</button>
        ) : (
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)" }}>💬</span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold text-[var(--c-text)]">Soporte Nelyx</p>
          <p className="text-[10px] text-[var(--c-text4)]">Normalmente responde en minutos</p>
        </div>
        <button onClick={() => setOpen(false)} className="ml-auto w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-[var(--c-text4)]">✕</button>
      </div>

      {vista === "inicio" && vistaInicio}
      {vista === "mensajes" && vistaMensajes}
      {vista === "hilo" && vistaHilo}

      {vista !== "hilo" && (
        <div className="flex items-center border-t border-[var(--c-border2)] flex-shrink-0">
          <button onClick={irAInicio} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-all ${vista === "inicio" ? "text-blue-400" : "text-[var(--c-text4)]"}`}>
            <span className="text-sm">🏠</span>Inicio
          </button>
          <button onClick={irAMensajes} className={`relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-all ${vista === "mensajes" ? "text-blue-400" : "text-[var(--c-text4)]"}`}>
            <span className="text-sm">💬</span>Mensajes
            {noLeidos > 0 && (
              <span className="absolute top-1 right-[calc(50%-20px)] min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {noLeidos > 9 ? "9+" : noLeidos}
              </span>
            )}
          </button>
        </div>
      )}
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
