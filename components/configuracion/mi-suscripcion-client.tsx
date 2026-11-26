"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { formatCLP, formatFechaCorta } from "@/lib/utils"
import { reportarPagoCliente, type MiSuscripcionDTO } from "@/app/actions/suscripcion-cliente-acciones"
import { validarComprobantePago, subirComprobantePago } from "@/lib/comprobante-pago-cliente"
import type { DatosBancariosDTO } from "@/app/actions/datos-bancarios-acciones"

const ESTADO_CFG: Record<string, { label: string; cls: string }> = {
  prueba_gratuita: { label: "Prueba gratuita", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  al_dia: { label: "Al día", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  pendiente: { label: "Pago pendiente", cls: "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20" },
  proximo_vencer: { label: "Próximo a vencer", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  vencido: { label: "Vencido", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  suspendido: { label: "Suspendida", cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  cancelado: { label: "Cancelada", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
}

function CampoCopiable({ label, value }: { label: string; value: string }) {
  function copiar() {
    if (!value) return
    navigator.clipboard?.writeText(value).then(() => toast.success("Copiado")).catch(() => {})
  }
  return (
    <div className="flex items-center justify-between gap-2 bg-[var(--c-card2)] rounded-lg px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] text-[var(--c-text4)]">{label}</p>
        <p className="text-sm font-semibold text-[var(--c-text)] truncate">{value || "—"}</p>
      </div>
      {value && (
        <button type="button" onClick={copiar} className="text-xs text-sky-400 hover:text-sky-300 flex-shrink-0 whitespace-nowrap">Copiar</button>
      )}
    </div>
  )
}

function FormSubirComprobante({ cobroId, monto, reintento, onSubmitted }: { cobroId: string; monto: number; reintento: boolean; onSubmitted: () => void }) {
  const [pending, start] = useTransition()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  function onChangeArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) { setArchivo(null); return }
    const error = validarComprobantePago(file)
    if (error) { toast.error(error); e.target.value = ""; setArchivo(null); return }
    setArchivo(file)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!archivo) { toast.error("Adjunta el comprobante primero"); return }
    setSubiendo(true)
    start(async () => {
      try {
        const comprobanteUrl = await subirComprobantePago(archivo)
        const fd = new FormData()
        fd.set("cobroId", cobroId)
        fd.set("comprobanteUrl", comprobanteUrl)
        const resultado = await reportarPagoCliente(fd)
        if (resultado?.error) { toast.error(resultado.error); return }
        toast.success("✅ Comprobante enviado — queda pendiente de revisión")
        onSubmitted()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo subir el comprobante")
      } finally {
        setSubiendo(false)
      }
    })
  }

  const ocupado = pending || subiendo
  return (
    <form onSubmit={submit} className="space-y-3 p-3 bg-[var(--c-card2)] rounded-xl border border-[var(--c-border)]">
      <p className="text-xs font-bold text-[var(--c-text)]">{reintento ? "Sube un nuevo comprobante" : "Adjuntar comprobante de pago"} — {formatCLP(monto)}</p>
      <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={onChangeArchivo}
        className="block w-full text-xs text-[var(--c-text2)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sky-500 file:text-white file:text-xs file:font-semibold file:cursor-pointer" />
      <p className="text-[10px] text-[var(--c-text4)]">Imagen o PDF, máximo 8MB. Se conserva por 5 días y luego se elimina automáticamente.</p>
      <button type="submit" disabled={ocupado || !archivo}
        className="w-full h-9 text-xs bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-lg disabled:opacity-50">
        {ocupado ? "Enviando..." : "Enviar comprobante"}
      </button>
    </form>
  )
}

export function MiSuscripcionClient({ suscripcion, datosBancarios }: { suscripcion: MiSuscripcionDTO; datosBancarios: DatosBancariosDTO }) {
  const [sus, setSus] = useState(suscripcion)
  const cfg = ESTADO_CFG[sus.estado] ?? ESTADO_CFG.al_dia

  // Tras enviar un comprobante, lo reflejamos de inmediato en esta misma
  // pantalla sin esperar un refresh completo de la página (el revalidatePath
  // del servidor ya lo deja correcto para la próxima carga, esto es solo
  // para feedback inmediato dentro de la misma sesión).
  function marcarEnvioOptimista() {
    if (!sus.cobroPendiente) return
    setSus({ ...sus, cobroPendiente: { ...sus.cobroPendiente, pagoEnRevision: { id: "optimista", comprobanteUrl: null, fecha: new Date().toISOString() }, pagoRechazado: null } })
  }

  if (!sus.tieneSuscripcion) {
    return <p className="text-sm text-[var(--c-text3)]">Todavía no tienes una suscripción configurada — contáctanos si crees que esto es un error.</p>
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${cfg.cls}`}>{cfg.label}</span>
          <span className="text-xs px-2.5 py-1 rounded-full border border-[var(--c-border)] text-[var(--c-text3)]">{sus.planLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
          <div><p className="text-[var(--c-text4)]">Precio</p><p className="text-[var(--c-text)] font-semibold mt-0.5">{sus.precioPlan > 0 ? `${formatCLP(sus.precioPlan)} cada ${sus.planMeses === 1 ? "mes" : `${sus.planMeses} meses`}` : "Gratis"}</p></div>
          <div>
            <p className="text-[var(--c-text4)]">{sus.estado === "prueba_gratuita" ? "Fin de prueba" : "Próximo cobro"}</p>
            <p className="text-[var(--c-text)] font-semibold mt-0.5">{(sus.estado === "prueba_gratuita" ? sus.fechaFinPrueba : sus.fechaProximoCobro) ? formatFechaCorta((sus.estado === "prueba_gratuita" ? sus.fechaFinPrueba : sus.fechaProximoCobro)!) : "—"}</p>
          </div>
        </div>
      </div>

      {sus.cobroPendiente && (
        <div>
          <p className="text-xs font-bold text-[var(--c-text)] mb-2">Pago pendiente — {formatCLP(sus.cobroPendiente.monto)}</p>
          <p className="text-[11px] text-[var(--c-text4)] mb-3">Vence el {formatFechaCorta(sus.cobroPendiente.fechaVencimiento)}. Transfiere a los datos bancarios de abajo y adjunta el comprobante.</p>

          {sus.cobroPendiente.pagoEnRevision ? (
            <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <p className="text-xs text-blue-300 font-semibold">🕐 Tu comprobante está en revisión</p>
              <p className="text-[11px] text-[var(--c-text4)] mt-1">Enviado el {formatFechaCorta(sus.cobroPendiente.pagoEnRevision.fecha)}. Te avisamos apenas se confirme.</p>
              {sus.cobroPendiente.pagoEnRevision.comprobanteUrl && (
                <a href={sus.cobroPendiente.pagoEnRevision.comprobanteUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-400 hover:text-sky-300 mt-1 inline-block">Ver comprobante enviado</a>
              )}
            </div>
          ) : (
            <>
              {sus.cobroPendiente.pagoRechazado && (
                <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/5 mb-3">
                  <p className="text-xs text-red-300 font-semibold">El comprobante anterior fue rechazado</p>
                  {sus.cobroPendiente.pagoRechazado.motivoRechazo && <p className="text-[11px] text-[var(--c-text4)] mt-1">Motivo: {sus.cobroPendiente.pagoRechazado.motivoRechazo}</p>}
                </div>
              )}
              <FormSubirComprobante cobroId={sus.cobroPendiente.id} monto={sus.cobroPendiente.monto} reintento={!!sus.cobroPendiente.pagoRechazado} onSubmitted={marcarEnvioOptimista} />
            </>
          )}
        </div>
      )}

      <div>
        <p className="text-xs font-bold text-[var(--c-text)] mb-2">Datos para transferir</p>
        <div className="space-y-2">
          <CampoCopiable label="Banco" value={datosBancarios.banco} />
          <CampoCopiable label="Tipo de cuenta" value={datosBancarios.tipoCuenta} />
          <CampoCopiable label="Número de cuenta" value={datosBancarios.numeroCuenta} />
          <CampoCopiable label="RUT" value={datosBancarios.rutTitular} />
          <CampoCopiable label="Nombre del titular" value={datosBancarios.nombreTitular} />
          <CampoCopiable label="Email" value={datosBancarios.email} />
        </div>
      </div>

      {sus.historialPagos.length > 0 && (
        <div>
          <p className="text-xs font-bold text-[var(--c-text)] mb-2">Historial de pagos</p>
          <div className="space-y-1.5">
            {sus.historialPagos.map(p => {
              const badge = p.estado === "pagado" ? { label: "Pagado", cls: "text-emerald-400" }
                : p.estado === "pendiente_confirmacion" ? { label: "En revisión", cls: "text-blue-400" }
                : p.estado === "rechazado" ? { label: "Rechazado", cls: "text-red-400" }
                : { label: p.estado, cls: "text-[var(--c-text4)]" }
              return (
                <div key={p.id} className="flex items-center justify-between bg-[var(--c-card2)] rounded-lg px-3 py-1.5 text-xs gap-2">
                  <div className="min-w-0">
                    <p className="text-[var(--c-text)] font-semibold">{formatCLP(p.monto)}</p>
                    <p className="text-[var(--c-text4)]">{formatFechaCorta(p.fecha)}</p>
                  </div>
                  <span className={`font-semibold whitespace-nowrap flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
