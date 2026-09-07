"use client"
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }
import { useState, useTransition, useEffect } from "react"
import { toast } from "sonner"
import { crearDeuda, editarDeuda } from "@/app/actions/acciones"
import { formatCLP, formatMoneyInput, parseMoney } from "@/lib/utils"

const TIPOS_DEUDA = ["Crédito bancario","Tarjeta de crédito","Préstamo personal","Crédito hipotecario","Crédito automotriz","Deuda proveedor","Préstamo familiar","Otros"]

function formatMiles(n: number): string {
  return n > 0 ? n.toLocaleString("es-CL") : ""
}

function parseMiles(s: string): number {
  return parseInt(s.replace(/\D/g, "")) || 0
}

function calcularFechaVence(fechaPrimerPago: string, cuotas: number): string {
  if (!fechaPrimerPago || !cuotas) return ""
  const f = new Date(fechaPrimerPago)
  f.setMonth(f.getMonth() + cuotas - 1)
  return f.toISOString().split("T")[0]
}

const inp = "w-full h-11 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-4 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 transition-all"
const sel = "w-full h-11 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-4 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-all"

type DeudaEditar = {
  id: string; acreedor: string; tipo: string; entidad: string | null
  monto: number; valorCuota: number | null; cuotas: number | null
  fechaDeuda: Date; fechaVence: Date | null; fechaPrimerPago: Date | null
  descripcion: string | null
}

interface Props { deudaEditar?: DeudaEditar | null; onClose?: () => void }

export function FormularioDeuda({ deudaEditar, onClose }: Props = {}) {
  const [open, setOpen] = useState(!!deudaEditar)
  const [isPending, start] = useTransition()

  const [acreedor, setAcreedor]     = useState(deudaEditar?.acreedor ?? "")
  const [tipo, setTipo]             = useState(deudaEditar?.tipo ?? "Crédito bancario")
  const [entidad, setEntidad]       = useState(deudaEditar?.entidad ?? "")
  const [monto, setMonto]           = useState(deudaEditar?.monto ?? 0)
  const [montoDisplay, setMontoDisplay] = useState(deudaEditar?.monto ? formatMiles(deudaEditar.monto) : "")
  const [cuota, setCuota]           = useState(deudaEditar?.valorCuota ?? 0)
  const [cuotaDisplay, setCuotaDisplay] = useState(deudaEditar?.valorCuota ? formatMiles(deudaEditar.valorCuota) : "")
  const [cuotas, setCuotas]         = useState(deudaEditar?.cuotas?.toString() ?? "")
  const [fechaDeuda, setFechaDeuda] = useState(deudaEditar?.fechaDeuda?.toISOString().split("T")[0] ?? localToday())
  const [fechaPrimerPago, setFechaPrimerPago] = useState(deudaEditar?.fechaPrimerPago?.toISOString().split("T")[0] ?? "")
  const [fechaVence, setFechaVence] = useState(deudaEditar?.fechaVence?.toISOString().split("T")[0] ?? "")
  const [descripcion, setDescripcion] = useState(deudaEditar?.descripcion ?? "")

  const cuotasNum = Math.min(360, Math.max(1, parseInt(cuotas) || 0))
  const totalPagar = cuota > 0 && cuotasNum > 0 ? cuota * cuotasNum : 0
  const totalInteres = monto > 0 && totalPagar > monto ? totalPagar - monto : 0

  useEffect(() => {
    if (fechaPrimerPago && cuotasNum > 0) setFechaVence(calcularFechaVence(fechaPrimerPago, cuotasNum))
  }, [fechaPrimerPago, cuotasNum])

  function handleClose() { setOpen(false); onClose?.() }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!acreedor.trim()) { toast.error("Ingresa el acreedor"); return }
    if (!monto && !cuota) { toast.error("Ingresa el monto o la cuota"); return }

    const fd = new FormData()
    fd.append("acreedor", acreedor)
    fd.append("tipo", tipo)
    fd.append("entidad", entidad)
    fd.append("monto", monto.toString())
    fd.append("cuotaManual", cuota.toString())
    fd.append("cuotas", cuotasNum.toString())
    fd.append("fechaDeuda", fechaDeuda)
    if (fechaPrimerPago) fd.append("fechaPrimerPago", fechaPrimerPago)
    if (fechaVence) fd.append("fechaVence", fechaVence)
    fd.append("descripcion", descripcion)

    start(async () => {
      try {
        if (deudaEditar) { await editarDeuda(deudaEditar.id, fd); toast.success("Deuda actualizada ✅") }
        else { await crearDeuda(fd); toast.success("Deuda registrada ✅") }
        handleClose()
      } catch (err: any) { toast.error(err?.message ?? "Error al guardar") }
    })
  }

  return (
    <>
      {!deudaEditar && (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20">
          + Nueva deuda
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative w-full max-w-lg bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-scale-in">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-[var(--c-border)] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-base">💳</div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--c-text)]">{deudaEditar ? "Editar deuda" : "Nueva deuda"}</h2>
                  <p className="text-[10px] text-[var(--c-text3)]">Registra tu deuda para controlar los pagos</p>
                </div>
              </div>
              <button onClick={handleClose} className="text-[var(--c-text3)] hover:text-[var(--c-text)] w-8 h-8 rounded-xl hover:bg-[var(--c-hover)] flex items-center justify-center text-lg transition-all">×</button>
            </div>

            <form id="form-deuda-inner" onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {/* Info general */}
              <div>
                <p className="text-[11px] font-bold text-[var(--c-text3)] uppercase tracking-wider mb-3">1. ¿A quién le debes?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Acreedor *</label>
                    <input value={acreedor} onChange={e => setAcreedor(e.target.value)} required placeholder="Banco Falabella, proveedor..." className={inp} />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Tipo de deuda</label>
                    <select value={tipo} onChange={e => setTipo(e.target.value)} className={sel}>
                      {TIPOS_DEUDA.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Montos */}
              <div>
                <p className="text-[11px] font-bold text-[var(--c-text3)] uppercase tracking-wider mb-3">2. Montos</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Monto original ($)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
                      <input value={montoDisplay} onChange={e => { const n = parseMiles(e.target.value); setMonto(n); setMontoDisplay(formatMiles(n)) }}
                        placeholder="1.500.000" className={`${inp} pl-7`} inputMode="numeric" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Cuota mensual ($) *</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
                      <input value={cuotaDisplay} onChange={e => { const n = parseMiles(e.target.value); setCuota(n); setCuotaDisplay(formatMiles(n)) }}
                        placeholder="185.420" className={`${inp} pl-7`} inputMode="numeric" required />
                    </div>
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">La cuota que te entrega el banco</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Nº de cuotas</label>
                    <input value={cuotas} onChange={e => setCuotas(e.target.value.replace(/\D/g,""))}
                      placeholder="12" className={inp} inputMode="numeric" />
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">Mín 1 · Máx 360</p>
                  </div>
                </div>

                {/* Resumen simple */}
                {cuota > 0 && cuotasNum > 0 && (
                  <div className="mt-3 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-[var(--c-text3)]">Total a pagar</p>
                      <p className="text-sm font-bold text-[var(--c-text)]">{formatCLP(totalPagar)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--c-text3)]">Cuotas</p>
                      <p className="text-sm font-bold text-sky-400">{cuotasNum} meses</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Fechas */}
              <div>
                <p className="text-[11px] font-bold text-[var(--c-text3)] uppercase tracking-wider mb-3">3. Fechas</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Fecha de la deuda</label>
                    <input type="date" value={fechaDeuda} onChange={e => setFechaDeuda(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Fecha primer pago</label>
                    <input type="date" value={fechaPrimerPago} onChange={e => setFechaPrimerPago(e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Fecha último pago</label>
                    <input type="date" value={fechaVence} onChange={e => setFechaVence(e.target.value)} className={inp} />
                    {fechaPrimerPago && cuotasNum > 0 && <p className="text-[10px] text-sky-400 mt-1">Auto-calculada ✓</p>}
                  </div>
                </div>
                {fechaPrimerPago && (
                  <div className="mt-3 flex items-center gap-2 bg-sky-500/5 border border-sky-500/15 rounded-xl px-4 py-2.5">
                    <span className="text-sky-400 text-sm">📅</span>
                    <p className="text-xs text-sky-400 font-medium">
                      Próximo pago: {new Date(fechaPrimerPago).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                    </p>
                  </div>
                )}
              </div>

              {/* Descripción */}
              <div>
                <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Descripción (opcional)</label>
                <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
                  placeholder="Ej: Crédito para capital de trabajo, renovación local..." className={inp} />
              </div>
            </form>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--c-border)] flex gap-3 flex-shrink-0">
              <button type="button" onClick={handleClose}
                className="flex-1 h-11 border border-[var(--c-border)] text-[var(--c-text3)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all">
                Cancelar
              </button>
              <button form="form-deuda-inner" type="submit" disabled={isPending}
                className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20">
                {isPending ? "Guardando..." : (deudaEditar ? "Actualizar deuda" : "Registrar deuda")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
