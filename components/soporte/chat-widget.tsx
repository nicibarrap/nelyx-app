"use client"
import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import {
  obtenerMensajesCliente, enviarMensajeCliente, contarNoLeidosCliente,
  obtenerConversacionesCliente,
} from "@/app/actions/soporte-acciones"
import { crearSugerencia, obtenerMisSugerencias } from "@/app/actions/sugerencias-acciones"
import { validarArchivoAdjunto, subirAdjuntoSoporte, imagenDePortapapeles, type AdjuntoSubido } from "@/lib/soporte-adjuntos-cliente"

type Mensaje = {
  id: string; de: string; autorNombre: string | null; contenido: string; createdAt: string
  adjuntoUrl?: string | null; adjuntoNombre?: string | null; adjuntoTipo?: string | null; adjuntoEliminadoAuto?: boolean
}
type Conversacion = { id: string; estado: string; titulo: string; ultimoMensaje: string; ultimoMensajeAt: string; noLeidos: number }
type Sugerencia = { id: string; titulo: string; descripcion: string; estado: string; notaAdmin: string | null; createdAt: string; updatedAt: string }
type Vista = "inicio" | "mensajes" | "hilo" | "sugerencias" | "nueva-sugerencia"

function tiempoRelativo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return "Ahora"
  if (min < 60) return `Hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Hace ${h}h`
  return `Hace ${Math.round(h / 24)}d`
}

// ── Iconos ────────────────────────────────────────────────────────────────
// SVG en vez de emoji a propósito: un emoji de color (💬, 🏠, 💡…) lo
// dibuja la fuente del sistema operativo — varía entre Windows/Mac/Android/
// iOS, y en algún entorno con fuentes recortadas puede salir como un
// glyph roto. Un trazo simple con currentColor se ve idéntico en cualquier
// dispositivo y hereda el color del texto como cualquier ícono de verdad.
function IconChatBubble({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.1 0-2.1-.2-3-.6L5 21l1.1-3.8C4.8 15.9 4 14 4 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconHome({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconSend({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4.5 12 20 4.5 13 19l-2-6-6.5-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
function IconLightbulb({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconArrowLeft({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconPaperclip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M17.5 7.5 9 16a3 3 0 1 1-4.2-4.2L13 3.5a2 2 0 1 1 2.8 2.8L8 14a1 1 0 1 1-1.4-1.4l7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconImageMuted({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="9.5" r="1.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 15.5 15.5 11 6 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ESTADO_CFG: Record<string, { label: string; className: string }> = {
  nueva: { label: "Nueva", className: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  en_analisis: { label: "En análisis", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  planificado: { label: "Planificado", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  en_desarrollo: { label: "En desarrollo", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  implementado: { label: "Implementado", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  no_por_ahora: { label: "No por ahora", className: "bg-red-500/10 text-red-400 border-red-500/20" },
}

export function ChatSoporteWidget({ soloLectura = false }: { soloLectura?: boolean }) {
  const [open, setOpen] = useState(false)
  const [vista, setVista] = useState<Vista>("inicio")
  const [origenHilo, setOrigenHilo] = useState<Vista>("inicio")
  const [conversacionId, setConversacionId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [tituloSug, setTituloSug] = useState("")
  const [descripcionSug, setDescripcionSug] = useState("")
  const [texto, setTexto] = useState("")
  const [noLeidos, setNoLeidos] = useState(0)
  const [archivoAdjunto, setArchivoAdjunto] = useState<File | null>(null)
  const [previewAdjunto, setPreviewAdjunto] = useState<string | null>(null)
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false)
  const [pending, start] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()

  // El object URL de la vista previa se libera apenas deja de usarse (al
  // cambiar de archivo o sacarlo) — si no, cada selección deja una URL
  // colgando en memoria hasta que se recargue toda la página.
  useEffect(() => {
    return () => { if (previewAdjunto) URL.revokeObjectURL(previewAdjunto) }
  }, [previewAdjunto])

  function elegirArchivo(file: File | null) {
    if (!file) return
    const error = validarArchivoAdjunto(file)
    if (error) { toast.error(error); return }
    if (previewAdjunto) URL.revokeObjectURL(previewAdjunto)
    setArchivoAdjunto(file)
    setPreviewAdjunto(URL.createObjectURL(file))
  }

  function quitarAdjunto() {
    if (previewAdjunto) URL.revokeObjectURL(previewAdjunto)
    setArchivoAdjunto(null)
    setPreviewAdjunto(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function alPegar(e: React.ClipboardEvent) {
    const file = imagenDePortapapeles(e)
    if (file) { e.preventDefault(); elegirArchivo(file) }
  }

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

  async function cargarSugerencias() {
    const data = await obtenerMisSugerencias().catch(() => [])
    setSugerencias(data as Sugerencia[])
  }

  // Sin polling acá a propósito — el estado de una sugerencia cambia mucho
  // más lento que un mensaje de chat, así que basta con recargar cada vez
  // que se entra a la pestaña.
  useEffect(() => {
    if (!open || vista !== "sugerencias") return
    cargarSugerencias()
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
  function irASugerencias() { setVista("sugerencias") }

  // "Enviános un mensaje" desde Inicio siempre arranca un hilo aparte —
  // no reutiliza uno ya existente aunque siga abierto. Recién se crea en
  // la base de datos al mandar el primer mensaje (abajo en enviar()), así
  // que un clic sin escribir nada no deja conversaciones vacías fantasma.
  function abrirConversacionActiva() {
    setConversacionId(null)
    setMensajes([])
    setOrigenHilo("inicio")
    setVista("hilo")
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
    const archivo = archivoAdjunto
    if (!contenido && !archivo) return
    setTexto("")
    quitarAdjunto()

    // Burbuja optimista: aparece al tiro en vez de esperar la ida y vuelta
    // al servidor (creación de conversación + envío + recarga), que antes
    // se sentía lenta aunque el envío en sí fuera rápido. cargarMensajes()
    // más abajo reemplaza la lista completa con la versión real del
    // servidor, así que esta queda pisada naturalmente. Si hay adjunto, la
    // burbuja optimista muestra la vista previa local mientras se sube.
    const idOptimista = `optimista-${Date.now()}`
    const previewOptimista = archivo ? URL.createObjectURL(archivo) : undefined
    setMensajes(prev => [...prev, {
      id: idOptimista, de: "cliente", autorNombre: null, contenido, createdAt: new Date().toISOString(),
      adjuntoUrl: previewOptimista, adjuntoTipo: archivo?.type,
    }])

    start(async () => {
      try {
        let adjunto: AdjuntoSubido | undefined
        if (archivo) {
          setSubiendoAdjunto(true)
          try {
            adjunto = await subirAdjuntoSoporte(archivo)
          } finally {
            setSubiendoAdjunto(false)
          }
        }
        // Si venimos de "Enviános un mensaje" sin conversación creada aún,
        // conversacionId sigue null acá — enviarMensajeCliente crea el hilo
        // en el mismo envío (ver comentario en soporte-acciones.ts) y
        // devuelve su id recién creado.
        const real = await enviarMensajeCliente(conversacionId, contenido, pathname, adjunto)
        if (!real) return
        if ("error" in real) {
          setMensajes(prev => prev.filter(m => m.id !== idOptimista))
          setTexto(contenido)
          toast.error(real.error)
          return
        }
        // Reemplaza la burbuja optimista por la real en vez de volver a
        // pedir toda la conversación — antes eso era un segundo viaje
        // redondo completo al servidor (con sus propias consultas a la
        // base de datos) solo para traer lo mismo que ya está en pantalla
        // más este único mensaje nuevo, y se sentía como una demora extra.
        // La respuesta automática / de soporte sigue llegando igual por
        // el polling cada 4s mientras el hilo está abierto.
        const { conversacionId: idRecienCreado, ...mensajeReal } = real
        if (!conversacionId) setConversacionId(idRecienCreado)
        setMensajes(prev => prev.map(m => m.id === idOptimista ? mensajeReal : m))
      } catch (err) {
        setMensajes(prev => prev.filter(m => m.id !== idOptimista))
        setTexto(contenido)
        toast.error(err instanceof Error ? err.message : "No se pudo enviar el mensaje")
      } finally {
        if (previewOptimista) URL.revokeObjectURL(previewOptimista)
      }
    })
  }

  function enviarSugerencia(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      try {
        const resultado = await crearSugerencia(tituloSug, descripcionSug)
        if (resultado?.error) { toast.error(resultado.error); return }
        toast.success("¡Gracias por tu idea! La vamos a revisar.")
        setTituloSug("")
        setDescripcionSug("")
        setVista("sugerencias")
        await cargarSugerencias()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo enviar la sugerencia")
      }
    })
  }

  const vistaInicio = (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      <p className="text-base font-bold text-[var(--c-text)]">¿Cómo podemos ayudarte? 👋</p>
      <p className="text-xs text-[var(--c-text3)] leading-relaxed">
        Escríbenos tu duda o el problema que tengas con la plataforma — normalmente respondemos en minutos.
      </p>
      {soloLectura ? (
        <p className="text-[11px] text-[var(--c-text4)] leading-relaxed bg-[var(--c-hover)] border border-[var(--c-border2)] rounded-xl px-3.5 py-3">
          Solo puedes ver las conversaciones de Soporte — pídele al dueño que te habilite escribir.
        </p>
      ) : (
        <button onClick={abrirConversacionActiva} disabled={pending}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--c-border2)] bg-[var(--c-hover)] px-3.5 py-3 text-left transition-all hover:border-blue-400/40 disabled:opacity-60">
          <span className="text-xs font-semibold text-[var(--c-text)]">Envíanos un mensaje</span>
          <IconSend className="w-4 h-4 text-blue-400 flex-shrink-0" />
        </button>
      )}
      <button onClick={irASugerencias}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--c-border2)] bg-[var(--c-hover)] px-3.5 py-3 text-left transition-all hover:border-amber-400/40">
        <span className="text-xs font-semibold text-[var(--c-text)]">💡 Sugerir una idea</span>
        <IconLightbulb className="w-4 h-4 text-amber-400 flex-shrink-0" />
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

  const vistaSugerencias = (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      <p className="text-xs text-[var(--c-text3)] leading-relaxed">
        ¿Hay algo que te gustaría que Nelyx tuviera? Cuéntanoslo acá — es distinto del chat de Soporte: esto es para ideas, no para problemas técnicos.
      </p>
      {!soloLectura && (
        <button onClick={() => setVista("nueva-sugerencia")}
          className="w-full flex items-center justify-center gap-2 rounded-xl text-white text-xs font-semibold py-2.5 transition-all hover:brightness-110"
          style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
          <IconLightbulb className="w-4 h-4" /> Nueva sugerencia
        </button>
      )}
      {sugerencias.length === 0 ? (
        <p className="text-center text-xs text-[var(--c-text4)] py-6">Todavía no has enviado ninguna sugerencia.</p>
      ) : (
        <div className="space-y-2">
          {sugerencias.map(s => {
            const cfg = ESTADO_CFG[s.estado] ?? ESTADO_CFG.nueva
            return (
              <div key={s.id} className="rounded-xl border border-[var(--c-border2)] bg-[var(--c-hover)] px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--c-text)]">{s.titulo}</p>
                  <span className={`flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${cfg.className}`}>{cfg.label}</span>
                </div>
                <p className="text-[11px] text-[var(--c-text4)] mt-1 line-clamp-2">{s.descripcion}</p>
                {s.notaAdmin && (
                  <p className="text-[10px] text-[var(--c-text3)] mt-1.5 italic border-t border-[var(--c-border2)] pt-1.5">"{s.notaAdmin}"</p>
                )}
                <p className="text-[9px] text-[var(--c-text4)] mt-1.5">{tiempoRelativo(s.updatedAt)}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const vistaNuevaSugerencia = (
    <form onSubmit={enviarSugerencia} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      <div>
        <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Título</label>
        <input value={tituloSug} onChange={e => setTituloSug(e.target.value)} maxLength={120} required
          placeholder="Ej: Poder exportar a Excel"
          className="w-full h-10 rounded-xl px-3.5 text-sm outline-none border border-[var(--c-border2)] bg-[var(--c-hover)] text-[var(--c-text)] placeholder:text-[var(--c-text4)] focus:border-amber-400/50" />
      </div>
      <div>
        <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Cuéntanos más</label>
        <textarea value={descripcionSug} onChange={e => setDescripcionSug(e.target.value)} maxLength={2000} required rows={5}
          placeholder="¿Qué te gustaría que hiciera? ¿Para qué te serviría?"
          className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none border border-[var(--c-border2)] bg-[var(--c-hover)] text-[var(--c-text)] placeholder:text-[var(--c-text4)] focus:border-amber-400/50 resize-none" />
      </div>
      <button type="submit" disabled={pending || !tituloSug.trim() || !descripcionSug.trim()}
        className="w-full h-10 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all hover:brightness-110"
        style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
        {pending ? "Enviando..." : "Enviar sugerencia"}
      </button>
    </form>
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
                esCliente ? "rounded-br-sm" : "rounded-bl-sm"
              }`} style={{
                background: esCliente ? "linear-gradient(135deg,#2563eb,#3b82f6)" : esSistema ? "var(--c-hover)" : "var(--c-card2, var(--c-hover))",
                color: esCliente ? "#fff" : "var(--c-text)",
              }}>
                {!esCliente && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{esSistema ? "Nelyx" : "Soporte Nelyx"}</p>}
                {m.adjuntoEliminadoAuto ? (
                  <div className={`flex items-center gap-1.5 text-[11px] italic opacity-70 ${m.contenido ? "mb-1.5" : ""}`}>
                    <IconImageMuted className="w-3.5 h-3.5 flex-shrink-0" /> Imagen eliminada automáticamente
                  </div>
                ) : m.adjuntoUrl && (
                  <a href={m.adjuntoUrl} target="_blank" rel="noopener noreferrer" className={`block ${m.contenido ? "mb-1.5" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.adjuntoUrl} alt={m.adjuntoNombre ?? "Imagen adjunta"} className="max-w-full max-h-48 rounded-lg object-cover" />
                  </a>
                )}
                {m.contenido && <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{m.contenido}</p>}
                <p className={`text-[9px] mt-1 ${esCliente ? "text-white/60" : "text-[var(--c-text4)]"}`}>{tiempoRelativo(m.createdAt)}</p>
              </div>
            </div>
          )
        })}
      </div>

      {soloLectura ? (
        <p className="p-3 border-t border-[var(--c-border2)] flex-shrink-0 text-center text-[11px] text-[var(--c-text4)]">
          Solo puedes ver este hilo — pídele al dueño que te habilite responder.
        </p>
      ) : (
        <div className="border-t border-[var(--c-border2)] flex-shrink-0">
          {previewAdjunto && (
            <div className="px-3 pt-2.5 flex items-center gap-2">
              <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-[var(--c-border2)] flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewAdjunto} alt="Vista previa" className="w-full h-full object-cover" />
              </div>
              <span className="text-[11px] text-[var(--c-text4)] truncate flex-1">{archivoAdjunto?.name}</span>
              <button type="button" onClick={quitarAdjunto} className="w-6 h-6 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-[var(--c-text4)] flex-shrink-0" aria-label="Quitar imagen">
                <IconX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <form onSubmit={enviar} className="p-3 flex gap-2">
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
              onChange={e => elegirArchivo(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={pending}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--c-text3)] border border-[var(--c-border2)] hover:bg-[var(--c-hover)] disabled:opacity-40 transition-all flex-shrink-0"
              aria-label="Adjuntar imagen">
              <IconPaperclip className="w-4 h-4" />
            </button>
            <input value={texto} onChange={e => setTexto(e.target.value)} onPaste={alPegar} placeholder="Escribe tu mensaje…" maxLength={2000}
              className="flex-1 h-10 rounded-xl px-3.5 text-sm outline-none border border-[var(--c-border2)] bg-[var(--c-hover)] text-[var(--c-text)] placeholder:text-[var(--c-text4)] focus:border-blue-400/50" />
            <button type="submit" disabled={pending || (!texto.trim() && !archivoAdjunto)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-all hover:brightness-110 flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)" }}>
              {pending ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <IconSend className="w-4 h-4" />}
            </button>
          </form>
          {subiendoAdjunto && <p className="px-3 pb-2 -mt-2 text-[10px] text-[var(--c-text4)]">Subiendo imagen…</p>}
        </div>
      )}
    </>
  )

  const tituloVista: Partial<Record<Vista, string>> = {
    sugerencias: "Sugerencias", "nueva-sugerencia": "Nueva sugerencia",
  }

  const contenidoPanel = (
    <>
      <div className="px-4 py-3 border-b border-[var(--c-border2)] flex items-center gap-2.5 flex-shrink-0">
        {vista === "hilo" ? (
          <button onClick={volverDeHilo} className="w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-[var(--c-text3)] flex-shrink-0" aria-label="Volver">
            <IconArrowLeft className="w-4 h-4" />
          </button>
        ) : vista === "nueva-sugerencia" ? (
          <button onClick={() => setVista("sugerencias")} className="w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-[var(--c-text3)] flex-shrink-0" aria-label="Volver">
            <IconArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)" }}>
            <IconChatBubble className="w-4 h-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold text-[var(--c-text)]">{tituloVista[vista] ?? "Soporte Nelyx"}</p>
          <p className="text-[10px] text-[var(--c-text4)]">{tituloVista[vista] ? "Tus ideas para mejorar Nelyx" : "Normalmente responde en minutos"}</p>
        </div>
        <button onClick={() => setOpen(false)} className="ml-auto w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-[var(--c-text4)]" aria-label="Cerrar chat">
          <IconX className="w-4 h-4" />
        </button>
      </div>

      {vista === "inicio" && vistaInicio}
      {vista === "mensajes" && vistaMensajes}
      {vista === "hilo" && vistaHilo}
      {vista === "sugerencias" && vistaSugerencias}
      {vista === "nueva-sugerencia" && vistaNuevaSugerencia}

      {(vista === "inicio" || vista === "mensajes") && (
        <div className="flex items-center border-t border-[var(--c-border2)] flex-shrink-0">
          <button onClick={irAInicio} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-all ${vista === "inicio" ? "text-blue-400" : "text-[var(--c-text4)]"}`}>
            <IconHome className="w-4 h-4" />Inicio
          </button>
          <button onClick={irAMensajes} className={`relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-all ${vista === "mensajes" ? "text-blue-400" : "text-[var(--c-text4)]"}`}>
            <IconChatBubble className="w-4 h-4" />Mensajes
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
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
        style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)", boxShadow: "0 8px 32px rgba(37,99,235,0.4)" }}
        aria-label={open ? "Cerrar chat de soporte" : "Abrir chat de soporte"}>
        {open ? <IconChevronDown className="w-6 h-6" /> : <IconChatBubble className="w-6 h-6" />}
        {!open && noLeidos > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[var(--c-bg)]">
            {noLeidos > 9 ? "9+" : noLeidos}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Desktop: panel anclado sobre la burbuja */}
          <div className="hidden sm:flex flex-col fixed bottom-24 right-6 z-40 w-[360px] h-[520px] max-h-[70vh] bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
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
