"use client"
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { crearCostoRecurrente, crearCostoUnico, actualizarEstadoCosto, eliminarCostoRecurrente, marcarCostoPagado, crearCategoriaPersonalizada } from "@/app/actions/acciones"
import { formatCLP, formatFechaCorta } from "@/lib/utils"
import { getColorCategoria } from "@/lib/categorias"

const CATEGORIAS = ["Arriendo","Internet","Agua","Luz","Gas","Software","Teléfono","Transporte","Seguro","Publicidad","Sueldos","Contador","Otros"]

const inp = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"
const sel = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

type EstadoDerivado = "programado" | "pendiente" | "generado" | "pagado" | "pausado" | "finalizado"

type Costo = {
  id: string; nombre: string; monto: number; categoria: string | null
  descripcion: string | null; fechaInicio: string; fechaTermino: string | null
  estado: string; estadoDerivado: EstadoDerivado; generacionId: string | null; createdAt: string
}

type ProximoCosto = Costo & { fechaRelevante: string }
type CostoUnico = { id: string; nombre: string; monto: number; fecha: string; categoria: string | null }

interface Props {
  costosData: Costo[]
  totalMes: number
  ingresosActuales: number
  gastosVariables: number
  excedenteOperativo: number
  resultadoCobertura: number
  mes: number; anio: number
  conteoEstados: { programado: number; pendiente: number; generado: number; pagado: number }
  proximosCostos: ProximoCosto[]
  costosUnicosEsteMes: CostoUnico[]
  dbCategorias?: string[]
}

const ESTADO_CONFIG: Record<EstadoDerivado, { label: string; emoji: string; cls: string }> = {
  programado: { label: "Programado", emoji: "📅", cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  pendiente:  { label: "Pendiente",  emoji: "⏳", cls: "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20" },
  generado:   { label: "Generado",   emoji: "🧾", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  pagado:     { label: "Pagado",     emoji: "✅", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  pausado:    { label: "Pausado",    emoji: "⏸",  cls: "bg-[var(--c-card2)] text-[var(--c-text3)] border-[var(--c-border)]" },
  finalizado: { label: "Finalizado", emoji: "✓",  cls: "bg-[var(--c-card2)] text-[var(--c-text3)] border-[var(--c-border)]" },
}

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block ml-1.5 align-middle">
      <button type="button"
        onClick={(e) => { e.preventDefault(); setShow(s => !s) }}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        className="w-4 h-4 rounded-full bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text3)] text-[10px] inline-flex items-center justify-center hover:border-sky-500/40 hover:text-sky-400 transition-all">
        ⓘ
      </button>
      {show && (
        <span className="absolute z-30 left-1/2 -translate-x-1/2 top-6 w-56 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl p-3 text-[11px] text-[var(--c-text2)] shadow-2xl leading-relaxed">
          {text}
        </span>
      )}
    </span>
  )
}

function FormCosto({ onSuccess, dbCategorias = [] }: { onSuccess: () => void; dbCategorias?: string[] }) {
  const [isPending, start] = useTransition()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [esRecurrente, setEsRecurrente] = useState(true)
  const [montoDisplay, setMontoDisplay] = useState("")
  const [datosBasicos, setDatosBasicos] = useState({ nombre: "", categoria: "", descripcion: "" })
  const [customCats, setCustomCats] = useState<string[]>([])
  const [customCatInput, setCustomCatInput] = useState("")
  const [fechaInicio, setFechaInicio] = useState(localToday())
  const [fechaTermino, setFechaTermino] = useState("")
  const todasCategorias = [...CATEGORIAS, ...dbCategorias, ...customCats].filter((c, i, arr) => arr.findIndex(x => x.toLowerCase() === c.toLowerCase()) === i)

  function agregarCategoria() {
    const cat = customCatInput.trim()
    if (!cat) return
    if (todasCategorias.some(c => c.toLowerCase() === cat.toLowerCase())) {
      setDatosBasicos(s => ({ ...s, categoria: todasCategorias.find(c => c.toLowerCase() === cat.toLowerCase()) ?? cat }))
      setCustomCatInput("")
      return
    }
    setCustomCats(prev => [...prev, cat])
    setDatosBasicos(s => ({ ...s, categoria: cat }))
    setCustomCatInput("")
    crearCategoriaPersonalizada("COSTO_FIJO", cat)
      .then(() => toast.success(`Categoría "${cat}" creada`))
      .catch(() => toast.error("No se pudo guardar la categoría en el servidor, pero quedó seleccionada para este costo"))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    // Los pasos anteriores se desmontan del DOM al avanzar, así que los
    // valores se toman del estado de React (no solo del DOM actual)
    fd.set("nombre", datosBasicos.nombre)
    fd.set("categoria", datosBasicos.categoria)
    fd.set("descripcion", datosBasicos.descripcion)
    fd.set("monto", montoDisplay.replace(/\./g, ""))
    if (esRecurrente) {
      fd.set("fechaInicio", fechaInicio)
      if (fechaTermino) fd.set("fechaTermino", fechaTermino)
    }
    const form = e.currentTarget
    start(async () => {
      try {
        if (esRecurrente) {
          await crearCostoRecurrente(fd)
          toast.success("✅ Costo fijo recurrente creado")
        } else {
          await crearCostoUnico(fd)
          toast.success("✅ Costo único registrado")
        }
        form.reset()
        setStep(1)
        setMontoDisplay("")
        setFechaInicio(localToday())
        setFechaTermino("")
        onSuccess()
      } catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Indicador de pasos */}
      <div className="flex items-center gap-2">
        {[1, 2, esRecurrente ? 3 : null].filter(Boolean).map((n, i, arr) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${step === n ? "bg-sky-500 text-white" : step! > (n as number) ? "bg-emerald-500/20 text-emerald-400" : "bg-[var(--c-card2)] text-[var(--c-text4)]"}`}>
              {step! > (n as number) ? "✓" : n}
            </div>
            {i < arr.length - 1 && <div className={`h-0.5 flex-1 rounded ${step! > (n as number) ? "bg-emerald-500/30" : "bg-[var(--c-border)]"}`} />}
          </div>
        ))}
      </div>

      {/* PASO 1: Tipo de costo */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--c-text)]">¿Qué tipo de costo quieres registrar?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => setEsRecurrente(true)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${esRecurrente ? "border-sky-500 bg-sky-500/5" : "border-[var(--c-border)] bg-[var(--c-card2)]"}`}>
              <p className="text-sm font-bold text-[var(--c-text)]">🔄 Recurrente</p>
              <p className="text-xs text-[var(--c-text3)] mt-1">Arriendo, internet, agua, luz, software, contador.</p>
              <p className="text-[11px] text-sky-400 mt-2">Se repetirá automáticamente todos los meses.</p>
            </button>
            <button type="button" onClick={() => setEsRecurrente(false)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${!esRecurrente ? "border-sky-500 bg-sky-500/5" : "border-[var(--c-border)] bg-[var(--c-card2)]"}`}>
              <p className="text-sm font-bold text-[var(--c-text)]">⚡ Único</p>
              <p className="text-xs text-[var(--c-text3)] mt-1">Permiso municipal, reparación, mantención puntual.</p>
              <p className="text-[11px] text-sky-400 mt-2">Se registrará una sola vez.</p>
            </button>
          </div>
          <button type="button" onClick={() => setStep(2)}
            className="w-full h-11 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all">
            Continuar →
          </button>
        </div>
      )}

      {/* PASO 2: Información básica */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--c-text)]">Información básica</p>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Nombre *</label>
            <input name="nombre" required value={datosBasicos.nombre} onChange={e => setDatosBasicos(s => ({ ...s, nombre: e.target.value }))}
              placeholder={esRecurrente ? "Ej: Arriendo local" : "Ej: Permiso municipal"} className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Categoría</label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {todasCategorias.map(c => {
                const color = getColorCategoria(c)
                const activa = datosBasicos.categoria === c
                return (
                  <button key={c} type="button" onClick={() => setDatosBasicos(s => ({ ...s, categoria: activa ? "" : c }))}
                    className="px-2.5 py-2 rounded-xl text-xs font-medium text-left transition-all border truncate"
                    style={activa ? { backgroundColor: `${color}1A`, color, borderColor: `${color}40` } : { borderColor: "var(--c-border)", color: "var(--c-text2)" }}>
                    {c}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <input value={customCatInput} onChange={e => setCustomCatInput(e.target.value)} placeholder="Nueva categoría..."
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); agregarCategoria() } }}
                className={`${inp} h-8 text-xs flex-1`} />
              <button type="button" onClick={agregarCategoria} className="h-8 px-3 bg-sky-500/10 text-sky-400 text-xs font-semibold rounded-lg border border-sky-500/20 hover:bg-sky-500/20 whitespace-nowrap">+ Agregar</button>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Monto ($) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
              <input type="text" inputMode="numeric" required placeholder="0"
                value={montoDisplay} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setMontoDisplay(v ? Number(v).toLocaleString("es-CL") : "") }}
                className={`${inp} pl-6`} />
            </div>
          </div>
          {!esRecurrente && (
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Fecha del gasto *</label>
              <input name="fecha" type="date" required defaultValue={localToday()} className={inp} />
            </div>
          )}
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Descripción (opcional)</label>
            <input name="descripcion" value={datosBasicos.descripcion} onChange={e => setDatosBasicos(s => ({ ...s, descripcion: e.target.value }))}
              placeholder="Ej: Arriendo bodega calle principal" className={inp} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)}
              className="flex-1 h-11 border border-[var(--c-border)] text-[var(--c-text2)] text-sm font-semibold rounded-xl hover:bg-[var(--c-card2)] transition-all">
              ← Atrás
            </button>
            {esRecurrente ? (
              <button type="button" onClick={() => setStep(3)} disabled={!datosBasicos.nombre || !montoDisplay}
                className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-all">
                Continuar →
              </button>
            ) : (
              <button type="submit" disabled={isPending}
                className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
                {isPending ? "Guardando..." : "✓ Registrar costo único"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* PASO 3: Configuración de generación (solo recurrente) */}
      {step === 3 && esRecurrente && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--c-text)]">¿Cuándo se repite?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold inline-flex items-center">
                Fecha de inicio *
                <InfoTip text="El día del mes de esta fecha es el día en que se repetirá siempre (ej: si eliges el 5, se repite cada día 5)." />
              </label>
              <input type="date" required value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className={`${inp} mt-1`} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold inline-flex items-center">
                Fecha de término
                <InfoTip text="Opcional — si la dejas vacía, este costo se repite indefinidamente hasta que lo pauses o elimines." />
              </label>
              <input type="date" value={fechaTermino} min={fechaInicio} onChange={e => setFechaTermino(e.target.value)} className={`${inp} mt-1`} />
              <p className="text-[10px] text-[var(--c-text4)] mt-1">Opcional — déjalo vacío si no tiene fecha de fin</p>
            </div>
          </div>

          {fechaInicio && (
            <div className="flex items-start gap-2 bg-sky-500/5 border border-sky-500/15 rounded-xl px-3.5 py-3">
              <span className="text-sm flex-shrink-0">🔁</span>
              <p className="text-xs text-[var(--c-text2)]">
                Este costo se repetirá automáticamente cada <strong className="text-[var(--c-text)]">día {new Date(fechaInicio + "T00:00:00").getDate()}</strong> de cada mes, empezando el <strong className="text-[var(--c-text)]">{formatFechaCorta(fechaInicio)}</strong>
                {fechaTermino ? <> hasta el <strong className="text-[var(--c-text)]">{formatFechaCorta(fechaTermino)}</strong></> : <>, sin fecha de término</>}. No necesitas hacer nada más — NELYX lo va a ir generando solo cada mes.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(2)}
              className="flex-1 h-11 border border-[var(--c-border)] text-[var(--c-text2)] text-sm font-semibold rounded-xl hover:bg-[var(--c-card2)] transition-all">
              ← Atrás
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
              {isPending ? "Guardando..." : "✓ Agregar costo fijo recurrente"}
            </button>
          </div>
        </div>
      )}
    </form>
  )
}

function FormMarcarPagado({ costo, onClose, onSuccess }: { costo: Costo; onClose: () => void; onSuccess: () => void }) {
  const [isPending, start] = useTransition()
  const [montoDisplay, setMontoDisplay] = useState(costo.monto.toLocaleString("es-CL"))

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("monto", montoDisplay.replace(/\./g, ""))
    start(async () => {
      try {
        await marcarCostoPagado(costo.generacionId!, fd)
        toast.success("✅ Pago registrado correctamente")
        onSuccess()
      } catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-3 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl space-y-3">
      <p className="text-xs font-semibold text-[var(--c-text2)]">Confirmar pago de "{costo.nombre}"</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[var(--c-text3)] block mb-1">Monto pagado</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-xs">$</span>
            <input type="text" inputMode="numeric" required value={montoDisplay}
              onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setMontoDisplay(v ? Number(v).toLocaleString("es-CL") : "") }}
              className={`${inp} h-9 pl-6 text-xs`} />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-[var(--c-text3)] block mb-1">Fecha de pago</label>
          <input name="fecha" type="date" required defaultValue={localToday()} className={`${inp} h-9 text-xs`} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onClose}
          className="flex-1 h-9 border border-[var(--c-border)] text-[var(--c-text3)] text-xs font-semibold rounded-lg hover:bg-[var(--c-card)] transition-all">
          Cancelar
        </button>
        <button type="submit" disabled={isPending}
          className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all">
          {isPending ? "..." : "✓ Confirmar pago"}
        </button>
      </div>
    </form>
  )
}

export function CostosFijosClient({ costosData, totalMes, ingresosActuales, gastosVariables, excedenteOperativo, resultadoCobertura, mes, anio, conteoEstados, proximosCostos, costosUnicosEsteMes, dbCategorias = [] }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  const cubierto = resultadoCobertura >= 0
  const activos = costosData.filter(c => c.estado === "activo")
  const pagadoMonto = activos.filter(c => c.estadoDerivado === "pagado").reduce((a, c) => a + c.monto, 0)
  // Para la barra visual: qué % del total mensual queda cubierto por el excedente operativo real
  const pctCubierto = totalMes > 0 ? Math.max(0, Math.min(100, Math.round((excedenteOperativo / totalMes) * 100))) : 0

  const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

  function handleEstado(id: string, estado: "activo" | "pausado" | "finalizado") {
    start(async () => {
      try { await actualizarEstadoCosto(id, estado); toast.success("Estado actualizado") }
      catch { toast.error("Error") }
    })
  }

  function handleEliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    start(async () => {
      try { await eliminarCostoRecurrente(id); toast.success("Eliminado") }
      catch { toast.error("Error") }
    })
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Costos Fijos</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Recurrentes se generan automáticamente · Únicos se registran de una vez</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20 whitespace-nowrap">
          {showForm ? "✕ Cancelar" : "+ Agregar costo fijo"}
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
          <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2 inline-flex items-center">
            Total mensual
            <InfoTip text="Suma de los costos activos que aplican este mes. Los costos programados para meses futuros no se incluyen aquí." />
          </p>
          <p className="text-xl font-bold text-orange-400">{formatCLP(totalMes)}</p>
          <p className="text-[11px] text-[var(--c-text3)] mt-1">{activos.length - conteoEstados.programado} activos este mes</p>
        </div>
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
          <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2 inline-flex items-center">
            Pagado
            <InfoTip text="Suma de los costos de este mes cuyo pago ya fue confirmado. Este monto es el que realmente impacta tu flujo de caja." />
          </p>
          <p className="text-xl font-bold text-emerald-400">{formatCLP(pagadoMonto)}</p>
          <p className="text-[11px] text-[var(--c-text3)] mt-1">{MESES[mes]} {anio}</p>
        </div>
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
          <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2">Próximo vencimiento</p>
          {proximosCostos.length > 0 ? (
            <>
              <p className="text-xl font-bold text-sky-400 truncate">{proximosCostos[0].nombre}</p>
              <p className="text-[11px] text-[var(--c-text3)] mt-1">{formatFechaCorta(proximosCostos[0].fechaRelevante)} · {formatCLP(proximosCostos[0].monto)}</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-[var(--c-text3)]">—</p>
              <p className="text-[11px] text-[var(--c-text3)] mt-1">Sin costos próximos</p>
            </>
          )}
        </div>
      </div>

      {/* Panel de estados */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4">
        <p className="text-[11px] font-semibold text-[var(--c-text3)] uppercase tracking-wider mb-3">Resumen de estados</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(["programado", "pendiente", "generado", "pagado"] as const).map(key => (
            <div key={key} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${ESTADO_CONFIG[key].cls}`}>
              <span className="text-xs font-semibold">{ESTADO_CONFIG[key].emoji} {ESTADO_CONFIG[key].label}</span>
              <span className="text-sm font-bold">{conteoEstados[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cobertura financiera real */}
      {totalMes > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-[var(--c-text)] inline-flex items-center">
              Cobertura financiera de costos fijos
              <InfoTip text="Compara lo que realmente te queda disponible (ingresos menos gastos variables) contra tus costos fijos del mes. A diferencia de mirar solo las ventas, esto evita mostrar 'cubierto' cuando en realidad el negocio está perdiendo dinero por gastos altos." />
            </p>
            <span className="text-lg">{cubierto ? "✅" : "⚠️"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-[var(--c-card2)] rounded-xl p-3">
              <p className="text-[10px] text-[var(--c-text3)]">Ingresos</p>
              <p className="text-sm font-bold text-emerald-400">{formatCLP(ingresosActuales)}</p>
            </div>
            <div className="bg-[var(--c-card2)] rounded-xl p-3">
              <p className="text-[10px] text-[var(--c-text3)]">Gastos variables</p>
              <p className="text-sm font-bold text-red-400">−{formatCLP(gastosVariables)}</p>
            </div>
            <div className="bg-[var(--c-card2)] rounded-xl p-3">
              <p className="text-[10px] text-[var(--c-text3)]">Costos fijos</p>
              <p className="text-sm font-bold text-orange-400">−{formatCLP(totalMes)}</p>
            </div>
          </div>
          <div className="h-3 bg-[var(--c-card2)] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${cubierto ? "bg-emerald-500" : pctCubierto >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, pctCubierto)}%` }} />
          </div>
          <p className={`text-sm font-semibold mt-3 ${cubierto ? "text-emerald-400" : "text-red-400"}`}>
            {cubierto
              ? `Tus costos fijos están cubiertos. Te queda un excedente de ${formatCLP(resultadoCobertura)}.`
              : `Faltan ${formatCLP(Math.abs(resultadoCobertura))} para cubrir los costos fijos del período.`}
          </p>
          {!cubierto && excedenteOperativo < 0 && (
            <p className="text-xs text-[var(--c-text3)] mt-1">Tus gastos variables ya superan tus ingresos este mes, antes de considerar costos fijos.</p>
          )}
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="bg-[var(--c-card)] border border-sky-500/20 rounded-2xl p-5 animate-fade-up">
          <h3 className="text-sm font-bold text-[var(--c-text)] mb-4">Nuevo costo fijo</h3>
          <FormCosto onSuccess={() => { setShowForm(false); window.location.reload() }} dbCategorias={dbCategorias} />
        </div>
      )}

      {/* Próximos costos */}
      {proximosCostos.length > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--c-border)]">
            <h3 className="text-sm font-semibold text-[var(--c-text)]">📅 Próximos costos</h3>
          </div>
          <div className="divide-y divide-[var(--c-border2)]">
            {proximosCostos.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--c-text)] truncate">{c.nombre}</p>
                  <p className="text-xs text-[var(--c-text3)]">{c.categoria ?? "Sin categoría"} · {formatFechaCorta(c.fechaRelevante)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${ESTADO_CONFIG[c.estadoDerivado].cls}`}>{ESTADO_CONFIG[c.estadoDerivado].label}</span>
                  <span className="text-sm font-bold text-orange-400">{formatCLP(c.monto)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Costos únicos recientes */}
      {costosUnicosEsteMes.length > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--c-border)]">
            <h3 className="text-sm font-semibold text-[var(--c-text)]">⚡ Costos únicos este mes</h3>
          </div>
          <div className="divide-y divide-[var(--c-border2)]">
            {costosUnicosEsteMes.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--c-text)] truncate">{c.nombre}</p>
                  <p className="text-xs text-[var(--c-text3)]">{c.categoria ?? "Sin categoría"} · {formatFechaCorta(c.fecha)}</p>
                </div>
                <span className="text-sm font-bold text-orange-400 flex-shrink-0">{formatCLP(c.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista completa */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--c-border)]">
          <h3 className="text-sm font-semibold text-[var(--c-text)]">Costos fijos recurrentes</h3>
        </div>
        {costosData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-3">🏠</p>
            <p className="text-sm text-[var(--c-text3)]">Sin costos fijos recurrentes</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-sky-400 hover:text-sky-300">+ Agregar tu primer costo fijo</button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--c-border2)]">
            {costosData.map(c => (
              <div key={c.id} className="px-4 py-4 hover:bg-[var(--c-hover)] transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-base flex-shrink-0 mt-0.5">🏠</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[var(--c-text)]">{c.nombre}</p>
                      {c.categoria && <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/10 text-sky-400 rounded-full">{c.categoria}</span>}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${ESTADO_CONFIG[c.estadoDerivado].cls}`}>
                        {ESTADO_CONFIG[c.estadoDerivado].emoji} {ESTADO_CONFIG[c.estadoDerivado].label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--c-text3)] mt-0.5">
                      Día {new Date(c.fechaInicio).getUTCDate()} de cada mes · Recurrente
                      {c.fechaTermino && <> · hasta {formatFechaCorta(c.fechaTermino)}</>}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-sm font-bold text-orange-400">{formatCLP(c.monto)} <span className="text-[10px] text-[var(--c-text4)] font-normal">/ mes</span></p>
                      <div className="flex gap-1.5">
                        {c.estadoDerivado === "generado" && (
                          <button onClick={() => setPagandoId(pagandoId === c.id ? null : c.id)} disabled={isPending}
                            className="text-[10px] px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-all">💰 Marcar pagado</button>
                        )}
                        {c.estado === "activo"
                          ? <button onClick={() => handleEstado(c.id, "pausado")} disabled={isPending} className="text-[10px] px-2.5 py-1 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text3)] rounded-lg hover:text-[var(--c-warning)] transition-all">Pausar</button>
                          : c.estado === "pausado"
                            ? <button onClick={() => handleEstado(c.id, "activo")} disabled={isPending} className="text-[10px] px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg transition-all">Activar</button>
                            : null}
                        <button onClick={() => handleEliminar(c.id, c.nombre)} disabled={isPending}
                          className="text-[10px] px-2.5 py-1 bg-red-500/5 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/10 transition-all">Eliminar</button>
                      </div>
                    </div>
                    {pagandoId === c.id && (
                      <FormMarcarPagado costo={c} onClose={() => setPagandoId(null)} onSuccess={() => { setPagandoId(null); window.location.reload() }} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="px-5 py-3 border-t border-[var(--c-border2)] bg-[var(--c-card2)]">
          <p className="text-[11px] text-[var(--c-text3)]">🔄 Al llegar el día de generación el costo pasa a "Generado". Confirma el pago para que impacte tu flujo de caja.</p>
        </div>
      </div>
    </div>
  )
}
