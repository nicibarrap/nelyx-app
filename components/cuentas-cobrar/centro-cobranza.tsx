"use client"
import { useState, useEffect, useTransition } from "react"
import { toast } from "sonner"
import { formatCLP } from "@/lib/utils"
import {
  NIVELES_COBRANZA, calcularNivelSugerido, reemplazarVariables,
  generarLinkWhatsapp, generarLinkGmail, type NivelCobranza,
} from "@/lib/cobranza"
import { registrarContactoCobranza, obtenerHistorialContactos, actualizarPlantillaCobranza } from "@/app/actions/cobranza-acciones"

type CuentaParaCobranza = {
  id: string
  numero: number
  saldoPendiente: number
  fechaVenta: string
  fechaVence: string | null
  diasAtraso: number
  cliente: { nombre: string; apellido: string | null; telefono: string | null; email: string | null }
}

interface Props {
  cuenta: CuentaParaCobranza
  plantillas: Record<NivelCobranza, string>
  nombreNegocio: string
  usuarioEnvia: string
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
}

function tiempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const dias = Math.floor(diff / 86400000)
  if (dias <= 0) return "hoy"
  if (dias === 1) return "hace 1 día"
  return `hace ${dias} días`
}

export function CentroCobranza({ cuenta, plantillas, nombreNegocio, usuarioEnvia }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isSaving, startSaving] = useTransition()
  const nivelSugerido = calcularNivelSugerido(cuenta.diasAtraso)
  const [nivel, setNivel] = useState<NivelCobranza>(nivelSugerido)
  const [plantillasLocal, setPlantillasLocal] = useState(plantillas)
  const [editando, setEditando] = useState(false)
  const [plantillaEditada, setPlantillaEditada] = useState("")
  const [historial, setHistorial] = useState<{ id: string; canal: string; nivel: number; createdAt: string }[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(true)

  useEffect(() => {
    setNivel(nivelSugerido)
    setEditando(false)
  }, [cuenta.id])

  useEffect(() => {
    setCargandoHistorial(true)
    obtenerHistorialContactos(cuenta.id)
      .then(setHistorial)
      .catch(() => toast.error("No se pudo cargar el historial de contactos"))
      .finally(() => setCargandoHistorial(false))
  }, [cuenta.id])

  const vars = {
    nombreCliente: cuenta.cliente.nombre,
    montoPendiente: formatCLP(cuenta.saldoPendiente),
    fechaVenta: formatFecha(cuenta.fechaVenta),
    fechaVencimiento: cuenta.fechaVence ? formatFecha(cuenta.fechaVence) : "sin fecha",
    numeroDocumento: `Factura #${cuenta.numero}`,
    nombreNegocio,
    usuarioEnvia,
    diasAtraso: String(Math.max(0, cuenta.diasAtraso)),
  }
  // Mientras se edita, el mensaje a enviar refleja el cambio en vivo (aunque
  // todavía no se haya guardado como predeterminado); si no, usa la plantilla guardada.
  const mensaje = reemplazarVariables(editando ? plantillaEditada : plantillasLocal[nivel], vars)

  function abrirEdicion() {
    setPlantillaEditada(plantillasLocal[nivel])
    setEditando(true)
  }

  function guardarPlantilla() {
    if (!plantillaEditada.trim()) { toast.error("El mensaje no puede estar vacío"); return }
    startSaving(async () => {
      try {
        await actualizarPlantillaCobranza(nivel, plantillaEditada)
        setPlantillasLocal(prev => ({ ...prev, [nivel]: plantillaEditada }))
        setEditando(false)
        toast.success("Mensaje guardado como predeterminado para este nivel")
      } catch (err: any) { toast.error(err?.message ?? "No se pudo guardar") }
    })
  }

  function registrarYAbrir(canal: "whatsapp" | "email", url: string) {
    window.open(url, "_blank")
    startTransition(async () => {
      try {
        await registrarContactoCobranza(cuenta.id, canal, nivel, mensaje)
        setHistorial(prev => [{ id: crypto.randomUUID(), canal, nivel, createdAt: new Date().toISOString() }, ...prev])
      } catch { toast.error("No se pudo registrar el contacto") }
    })
  }

  function handleWhatsapp() {
    if (!cuenta.cliente.telefono) { toast.error("Este cliente no tiene teléfono registrado"); return }
    registrarYAbrir("whatsapp", generarLinkWhatsapp(cuenta.cliente.telefono, mensaje))
  }

  function handleEmail() {
    if (!cuenta.cliente.email) { toast.error("Este cliente no tiene correo registrado"); return }
    registrarYAbrir("email", generarLinkGmail(cuenta.cliente.email, `${vars.numeroDocumento} — Saldo pendiente ${vars.montoPendiente}`, mensaje))
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--c-text)]">Centro de cobranza</p>
        <span className="text-[10px] text-sky-400 cursor-help" title="Elegí un nivel de mensaje y contactá a tu cliente por el canal que prefieras.">¿Cómo funciona?</span>
      </div>

      <div className="flex items-start gap-2 bg-sky-500/5 border border-sky-500/15 rounded-xl px-3.5 py-2.5">
        <span className="text-sm flex-shrink-0">💡</span>
        <p className="text-[11px] text-[var(--c-text2)]">Te ayudamos a recuperar tu dinero. Elegí un nivel de mensaje y contactá a tu cliente por el canal que prefieras.</p>
      </div>

      {/* Nivel sugerido */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold text-[var(--c-text)]">Nivel sugerido</p>
            <p className="text-[10px] text-[var(--c-text4)]">Según {Math.max(0, cuenta.diasAtraso)} días de atraso</p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${NIVELES_COBRANZA[nivelSugerido-1].bg} ${NIVELES_COBRANZA[nivelSugerido-1].color} border ${NIVELES_COBRANZA[nivelSugerido-1].border}`}>
            {NIVELES_COBRANZA[nivelSugerido-1].label}
          </span>
        </div>
        <div className="space-y-2">
          {NIVELES_COBRANZA.map(n => (
            <button key={n.nivel} type="button" onClick={() => { setNivel(n.nivel); setEditando(false) }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left ${nivel === n.nivel ? `${n.bg} ${n.border}` : "border-[var(--c-border)] hover:border-[var(--c-border2)]"}`}>
              <span className="text-base flex-shrink-0">{n.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${nivel === n.nivel ? n.color : "text-[var(--c-text2)]"}`}>{n.label}</p>
                <p className="text-[10px] text-[var(--c-text4)]">{n.rango}</p>
              </div>
              <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${nivel === n.nivel ? `${n.border.replace("border-", "border-")} bg-sky-500 border-sky-500` : "border-[var(--c-border)]"}`}>
                {nivel === n.nivel && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Canal de contacto */}
      <div>
        <p className="text-xs font-semibold text-[var(--c-text)] mb-2">Canal de contacto</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={handleWhatsapp} disabled={isPending}
            className="flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 text-xs font-bold transition-all disabled:opacity-50">
            💬 WhatsApp
          </button>
          <button type="button" onClick={handleEmail} disabled={isPending}
            className="flex items-center justify-center gap-2 h-10 rounded-xl bg-[var(--c-card2)] hover:bg-[var(--c-hover)] border border-[var(--c-border)] text-[var(--c-text2)] text-xs font-bold transition-all disabled:opacity-50">
            ✉️ Email
          </button>
        </div>
      </div>

      <button type="button" onClick={editando ? guardarPlantilla : abrirEdicion} disabled={isSaving}
        className="w-full h-10 rounded-xl border border-[var(--c-border)] text-[var(--c-text2)] hover:bg-[var(--c-card2)] text-xs font-semibold transition-all disabled:opacity-50">
        {editando ? (isSaving ? "Guardando..." : "💾 Guardar como predeterminado") : "✏️ Editar mensaje de este nivel"}
      </button>

      {editando ? (
        <div className="space-y-2">
          <p className="text-[10px] text-[var(--c-text4)]">
            Podés usar {"{nombreCliente}"}, {"{montoPendiente}"}, {"{fechaVenta}"}, {"{fechaVencimiento}"}, {"{numeroDocumento}"}, {"{diasAtraso}"} y {"{nombreNegocio}"} — se reemplazan automáticamente por cada cliente.
          </p>
          <textarea value={plantillaEditada} onChange={e => setPlantillaEditada(e.target.value)} rows={8}
            className="w-full bg-[var(--c-input)] border border-sky-500/30 rounded-xl p-3 text-xs text-[var(--c-text)] outline-none focus:border-sky-500 resize-none" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(false)} className="h-8 px-3 border border-[var(--c-border)] text-[var(--c-text3)] text-[11px] rounded-lg">Cancelar</button>
          </div>
          <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3">
            <p className="text-[10px] text-[var(--c-text4)] mb-1">Así se verá para {vars.nombreCliente}:</p>
            <p className="text-[11px] text-[var(--c-text2)] whitespace-pre-line">{mensaje}</p>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3">
          <p className="text-[11px] text-[var(--c-text2)] whitespace-pre-line">{mensaje}</p>
        </div>
      )}

      {/* Historial de contactos */}
      <div className="pt-2 border-t border-[var(--c-border2)]">
        <p className="text-xs font-semibold text-[var(--c-text)] mb-2">Historial de contactos</p>
        {cargandoHistorial ? (
          <p className="text-[11px] text-[var(--c-text4)]">Cargando...</p>
        ) : historial.length === 0 ? (
          <p className="text-[11px] text-[var(--c-text4)]">Todavía no has contactado a este cliente por esta cuenta.</p>
        ) : (
          <div className="space-y-2.5 max-h-56 overflow-y-auto">
            {historial.map(h => (
              <div key={h.id} className="flex items-center gap-2.5">
                <span className="text-sm flex-shrink-0">{h.canal === "whatsapp" ? "💬" : "✉️"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[11px] font-semibold text-[var(--c-text)]">{formatFecha(h.createdAt)}</p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--c-card2)] text-[var(--c-text3)]">Nivel {h.nivel}</span>
                  </div>
                  <p className="text-[10px] text-[var(--c-text4)]">{h.canal === "whatsapp" ? "WhatsApp" : "Email"} enviado {tiempoRelativo(h.createdAt)}</p>
                </div>
                <span className="text-[10px] text-emerald-400 flex-shrink-0">✓ Enviado</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
