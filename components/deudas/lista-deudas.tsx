"use client"
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formatCLP, formatFechaCorta, ESTADO_CONFIG, EstadoDeuda } from "@/lib/utils"
import { eliminarDeuda, registrarPago } from "@/app/actions/acciones"

interface Deuda {
  id: string
  acreedor: string
  tipo: string
  entidad: string | null
  monto: any
  montoPagado: any
  descripcion: string | null
  fechaDeuda: Date
  fechaVence: Date | null
  fechaPrimerPago?: Date | null
  pagada: boolean
  interes: any
  saldoPendiente?: any
  cuotas: number | null
  cuotasPagadas: number
  valorCuota: any
  estado: EstadoDeuda
  pagos: { id: string; monto: any; fecha: Date; descripcion: string | null; createdAt: Date }[]
}

interface Props {
  deudas: Deuda[]
  filtroActual: string
  conteos: { todas: number; alDia: number; proximas: number; vencidas: number; pagadas: number }
}

const inp = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"


function calcularProximoPago(deuda: any): Date | null {
  if (deuda.fechaPrimerPago) {
    const pagadas = deuda.cuotasPagadas ?? 0
    const f = new Date(deuda.fechaPrimerPago)
    f.setMonth(f.getMonth() + pagadas)
    return f
  }
  return deuda.fechaVence ? new Date(deuda.fechaVence) : null
}

function getDiasRestantes(fecha: Date | null): number | null {
  if (!fecha) return null
  return Math.ceil((fecha.getTime() - new Date().getTime()) / 86400000)
}

function getAlertaBadge(dias: number | null) {
  if (dias === null) return null
  if (dias < 0) return { text: `${Math.abs(dias)} días de atraso`, cls: "bg-red-500/10 text-red-400 border-red-500/20" }
  if (dias === 0) return { text: "Vence hoy", cls: "bg-red-500/10 text-red-400 border-red-500/20" }
  if (dias === 1) return { text: "Vence mañana", cls: "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20" }
  if (dias <= 7)  return { text: `Faltan ${dias} días`, cls: "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20" }
  if (dias <= 15) return { text: `Faltan ${dias} días`, cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" }
  return null
}

export function ListaDeudas({ deudas, filtroActual, conteos }: Props) {
  const router = useRouter()
  const [deudaDetalle, setDeudaDetalle] = useState<Deuda | null>(null)
  const [showPago, setShowPago] = useState(false)
  const [pagoMontoDisplay, setPagoMontoDisplay] = useState("")
  const [pagoWarning, setPagoWarning] = useState<{ monto: number; cuota: number; saldo: number; fd: FormData } | null>(null)
  const [isPending, startTransition] = useTransition()

  const tabs = [
    { key: "todas", label: "Todas", count: conteos.todas },
    { key: "al-dia", label: "Al día", count: conteos.alDia },
    { key: "proximas", label: "Próximas", count: conteos.proximas },
    { key: "vencidas", label: "Vencidas", count: conteos.vencidas },
    { key: "pagadas", label: "Pagadas", count: conteos.pagadas },
  ]

  function handleFiltro(key: string) {
    router.push(`?filtro=${key}`)
  }

  function handleEliminar(id: string) {
    if (!confirm("¿Eliminar esta deuda?")) return
    startTransition(async () => {
      try {
        await eliminarDeuda(id)
        toast.success("Deuda eliminada")
        if (deudaDetalle?.id === id) setDeudaDetalle(null)
      } catch { toast.error("No se pudo eliminar") }
    })
  }

  function confirmarPago() {
    if (!deudaDetalle || !pagoWarning) return
    startTransition(async () => {
      try {
        await registrarPago(deudaDetalle.id, pagoWarning.fd)
        toast.success("Pago registrado correctamente")
        setPagoWarning(null)
        setShowPago(false)
      } catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  function handlePago(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!deudaDetalle) return
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    const monto = Number(fd.get("monto"))
    const saldo = Number(deudaDetalle.saldoPendiente ?? deudaDetalle.monto)
    const cuota = Number(deudaDetalle.valorCuota ?? 0)
    // Block: payment > remaining balance
    if (monto > saldo) {
      toast.error(`El pago ($${monto.toLocaleString("es-CL")}) supera el saldo pendiente ($${saldo.toLocaleString("es-CL")})`)
      return
    }
    // Warn: payment > cuota
    if (cuota > 0 && monto > cuota) {
      setPagoWarning({ monto, cuota, saldo, fd })
      return
    }
    const form2 = form
    startTransition(async () => {
      try {
        await registrarPago(deudaDetalle.id, fd)
        toast.success("Pago registrado correctamente")
        form2.reset()
        setShowPago(false)
      } catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  const saldoPendiente = deudaDetalle ? Number(deudaDetalle.monto) - Number(deudaDetalle.montoPagado) : 0
  const pctPagado = deudaDetalle ? Math.min(100, Math.round((Number(deudaDetalle.montoPagado) / Number(deudaDetalle.monto)) * 100)) : 0

  return (
    <>
    <div className="space-y-4">
      {/* Tabs */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
        <div className="flex overflow-x-auto border-b border-[var(--c-border)]">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => handleFiltro(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                filtroActual === t.key
                  ? "text-sky-400 border-b-2 border-sky-500 bg-sky-500/5"
                  : "text-[var(--c-text3)] hover:text-[var(--c-text2)]"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  filtroActual === t.key ? "bg-sky-500/20 text-sky-400" : "bg-zinc-800 text-[var(--c-text3)]"
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Lista */}
        {deudas.length === 0 ? (
          <div className="text-center py-12 text-[var(--c-text4)]">
            <span className="text-3xl block mb-2">💳</span>
            <p className="text-sm">Sin deudas en esta categoría</p>
          </div>
        ) : (
          <div className="divide-y divide-[#111]">
            {deudas.map(d => {
              const cfg = ESTADO_CONFIG[d.estado]
              const saldo = Number(d.monto) - Number(d.montoPagado)
              const pct = Math.min(100, Math.round((Number(d.montoPagado) / Number(d.monto)) * 100))
              const isSelected = deudaDetalle?.id === d.id

              return (
                <div
                  key={d.id}
                  onClick={() => setDeudaDetalle(isSelected ? null : d)}
                  className={`p-4 cursor-pointer transition-colors hover:bg-white/[0.02] ${isSelected ? "bg-sky-500/5" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center text-sm font-bold ${cfg.color} flex-shrink-0 mt-0.5`}>
                      {d.acreedor[0].toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--c-text)] truncate">{d.acreedor}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                          {d.estado}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-[var(--c-text3)] border border-zinc-700">
                          {d.tipo}
                        </span>
                      </div>
                      {d.descripcion && <p className="text-[10px] text-[var(--c-text3)] mt-0.5 truncate">{d.descripcion}</p>}

                      {/* Barra de progreso */}
                      {Number(d.montoPagado) > 0 && !d.pagada && (
                        <div className="mt-2">
                          <div className="h-1 bg-[var(--c-card2)] rounded-full overflow-hidden">
                            <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-[var(--c-text4)] mt-0.5">{pct}% pagado</p>
                        </div>
                      )}
                    </div>

                    {/* Monto */}
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className={`text-sm font-bold ${d.pagada ? "text-green-400" : "text-orange-400"}`}>
                        {formatCLP(saldo)}
                      </p>
                      <p className="text-[10px] text-[var(--c-text3)]">
                        {d.fechaVence ? formatFechaCorta(d.fechaVence) : "Sin fecha"}
                      </p>
                      {!d.pagada && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEliminar(d.id) }}
                          className="text-[10px] text-[var(--c-text4)] hover:text-red-400 mt-1 transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Panel de detalle */}
      {deudaDetalle && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-[#111]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--c-text)]">{deudaDetalle.acreedor}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${ESTADO_CONFIG[deudaDetalle.estado].color} ${ESTADO_CONFIG[deudaDetalle.estado].bg} ${ESTADO_CONFIG[deudaDetalle.estado].border}`}>
                {deudaDetalle.estado}
              </span>
            </div>
            <button onClick={() => setDeudaDetalle(null)} className="text-[var(--c-text3)] hover:text-[var(--c-text)]">×</button>
          </div>

          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-[var(--c-text3)] mb-1">Monto original</p>
              <p className="text-sm font-bold text-[var(--c-text)]">{formatCLP(Number(deudaDetalle.monto))}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--c-text3)] mb-1">Pagado</p>
              <p className="text-sm font-bold text-green-400">{formatCLP(Number(deudaDetalle.montoPagado))}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--c-text3)] mb-1">Saldo pendiente</p>
              <p className="text-sm font-bold text-orange-400">{formatCLP(saldoPendiente)}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--c-text3)] mb-1">Progreso</p>
              <p className="text-sm font-bold text-sky-400">{pctPagado}%</p>
            </div>
            {deudaDetalle.interes && (
              <div>
                <p className="text-[10px] text-[var(--c-text3)] mb-1">Interés mensual</p>
                <p className="text-sm font-bold text-violet-400">{Number(deudaDetalle.interes)}%</p>
              </div>
            )}
            {deudaDetalle.cuotas && (
              <div>
                <p className="text-[10px] text-[var(--c-text3)] mb-1">Cuotas</p>
                <p className="text-sm font-bold text-[var(--c-text)]">{deudaDetalle.cuotasPagadas}/{deudaDetalle.cuotas}</p>
              </div>
            )}
            {deudaDetalle.valorCuota && (
              <div>
                <p className="text-[10px] text-[var(--c-text3)] mb-1">Valor cuota</p>
                <p className="text-sm font-bold text-[var(--c-text)]">{formatCLP(Number(deudaDetalle.valorCuota))}</p>
              </div>
            )}
            {deudaDetalle.fechaVence && (
              <div>
                <p className="text-[10px] text-[var(--c-text3)] mb-1">Vencimiento</p>
                <p className="text-sm font-bold text-[var(--c-text)]">{formatFechaCorta(deudaDetalle.fechaVence)}</p>
              </div>
            )}
          </div>

          {/* Barra progreso */}
          <div className="px-5 pb-4">
            <div className="h-2 bg-[var(--c-card2)] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all" style={{ width: `${pctPagado}%` }} />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-[var(--c-text3)]">{pctPagado}% completado</span>
              {deudaDetalle.cuotas && (
                <span className="text-[10px] text-[var(--c-text3)]">Faltan {deudaDetalle.cuotas - deudaDetalle.cuotasPagadas} cuotas</span>
              )}
            </div>
          </div>

          {/* Botón registrar pago */}
          {!deudaDetalle.pagada && (
            <div className="px-5 pb-4">
              {!showPago ? (
                <button
                  onClick={() => setShowPago(true)}
                  className="w-full h-9 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold rounded-xl hover:bg-sky-500/20 transition-colors"
                >
                  + Registrar pago
                </button>
              ) : (
                <form onSubmit={handlePago} className="space-y-3 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4">
                  <p className="text-xs font-semibold text-[var(--c-text)]">Registrar pago</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-[var(--c-text3)] block mb-1">Monto ($) *</label>
                      <input name="monto" type="hidden" value={pagoMontoDisplay.replace(/\./g,"")} />
                      <input type="text" inputMode="numeric" required placeholder="0"
                        value={pagoMontoDisplay} onChange={e => { const v = e.target.value.replace(/[^0-9]/g,""); setPagoMontoDisplay(v ? Number(v).toLocaleString("es-CL") : "") }}
                        className={inp} />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--c-text3)] block mb-1">Fecha *</label>
                      <input name="fecha" type="date" required defaultValue={localToday()} className={inp} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-[var(--c-text3)] block mb-1">Descripción (opcional)</label>
                      <input name="descripcion" placeholder="Ej: Cuota 3 de 12" className={inp} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowPago(false)} className="flex-1 h-9 border border-[var(--c-border)] text-[var(--c-text3)] text-xs rounded-xl hover:bg-[var(--c-hover)]">Cancelar</button>
                    <button type="submit" disabled={isPending} className="flex-1 h-9 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-semibold rounded-xl">
                      {isPending ? "Registrando..." : "Confirmar pago"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Historial de pagos */}
          {deudaDetalle.pagos.length > 0 && (
            <div className="border-t border-[#111] px-5 py-4">
              <h4 className="text-xs font-semibold text-[var(--c-text)] mb-3">Historial de pagos</h4>
              <div className="space-y-2">
                {deudaDetalle.pagos.map((p, i) => {
                  const saldoTras = Number(deudaDetalle.monto) -
                    deudaDetalle.pagos.slice(i).reduce((a, pg) => a + Number(pg.monto), 0)
                  return (
                    <div key={p.id} className="grid grid-cols-3 gap-2 py-2 border-b border-[#0F0F0F] last:border-0">
                      <div>
                        <p className="text-[10px] text-[var(--c-text3)]">{formatFechaCorta(p.fecha)}</p>
                        {p.descripcion && <p className="text-[10px] text-[var(--c-text4)] truncate">{p.descripcion}</p>}
                      </div>
                      <p className="text-xs font-semibold text-green-400 text-center">{formatCLP(Number(p.monto))}</p>
                      <p className="text-xs text-orange-400 text-right">{formatCLP(Math.max(0, saldoTras))}</p>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[var(--c-border)]">
                <p className="text-[10px] text-[var(--c-text3)]">Fecha</p>
                <p className="text-[10px] text-[var(--c-text3)] text-center">Monto pagado</p>
                <p className="text-[10px] text-[var(--c-text3)] text-right">Saldo restante</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    {/* Modal: advertencia pago mayor a cuota */}
    {pagoWarning && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setPagoWarning(null)} />
        <div className="relative bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
          <p className="text-base font-bold text-[var(--c-warning)] mb-2">⚠️ Pago mayor a la cuota</p>
          <p className="text-sm text-[var(--c-text2)] mb-4">Estás registrando un pago superior al valor de la cuota programada. Este pago reducirá varias cuotas o disminuirá el saldo pendiente.</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-[var(--c-card2)] rounded-xl p-3 text-center">
              <p className="text-[10px] text-[var(--c-text3)]">Cuota programada</p>
              <p className="text-sm font-bold text-[var(--c-text)]">${pagoWarning.cuota.toLocaleString("es-CL")}</p>
            </div>
            <div className="bg-[var(--c-card2)] rounded-xl p-3 text-center">
              <p className="text-[10px] text-[var(--c-text3)]">Pago ingresado</p>
              <p className="text-sm font-bold text-[var(--c-warning)]">${pagoWarning.monto.toLocaleString("es-CL")}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setPagoWarning(null)}
              className="flex-1 h-10 border border-[var(--c-border)] text-[var(--c-text2)] text-sm rounded-xl hover:bg-[var(--c-card2)] transition-all">
              Cancelar
            </button>
            <button onClick={confirmarPago} disabled={isPending}
              className="flex-1 h-10 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
              Continuar pago
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
