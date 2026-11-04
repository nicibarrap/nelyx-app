"use client"
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }
import { useState, useTransition, useMemo } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { crearCostoRecurrente, crearCostoUnico, editarCostoRecurrente, actualizarEstadoCosto, eliminarCostoRecurrente, marcarCostoPagado, crearCategoriaPersonalizada } from "@/app/actions/acciones"
import { formatCLP, formatFechaCorta } from "@/lib/utils"
import { getColorCategoria } from "@/lib/categorias"
import type { FrecuenciaCosto } from "@/lib/costos-fijos"
import { CampoFecha } from "@/components/shared/campo-fecha"
import { InfoTooltip } from "@/components/shared/kpi-tooltip"

const CATEGORIAS = ["Arriendo","Internet","Agua","Luz","Gas","Software","Teléfono","Transporte","Seguro","Publicidad","Sueldos","Contador","Otros"]
const FRECUENCIA_LABEL: Record<FrecuenciaCosto, string> = { mensual: "Mensual", trimestral: "Trimestral", anual: "Anual" }

const inp = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"

type EstadoDerivado = "programado" | "pendiente" | "generado" | "pagado" | "pausado" | "finalizado"

type Costo = {
  id: string; nombre: string; monto: number; categoria: string | null
  descripcion: string | null; frecuencia: FrecuenciaCosto; fechaInicio: string; fechaTermino: string | null
  estado: string; estadoDerivado: EstadoDerivado; generacionId: string | null; createdAt: string
}

type ProximoCosto = Costo & { fechaRelevante: string }
type CostoUnico = { id: string; nombre: string; monto: number; fecha: string; categoria: string | null }
type MesProyectado = { mes: number; anio: number; total: number }

interface Props {
  costosData: Costo[]
  totalMes: number
  activosAplicablesCount: number
  ingresosActuales: number
  gastosVariables: number
  excedenteOperativo: number
  resultadoCobertura: number
  mes: number; anio: number
  conteoEstados: { programado: number; pendiente: number; generado: number; pagado: number }
  proximosCostos: ProximoCosto[]
  costosUnicosEsteMes: CostoUnico[]
  proyeccionMeses: MesProyectado[]
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

function descripcionFrecuencia(c: Pick<Costo, "frecuencia" | "fechaInicio">): string {
  const dia = new Date(c.fechaInicio).getUTCDate()
  if (c.frecuencia === "trimestral") return `Día ${dia}, cada 3 meses`
  if (c.frecuencia === "anual") return `${formatFechaCorta(c.fechaInicio)}, cada año`
  return `Día ${dia} de cada mes`
}

/** Campo de categoría con búsqueda + desplegable — reemplaza la grilla que
 * antes ocupaba toda la pantalla en el paso 2 del asistente. El patrón
 * onMouseDown+preventDefault en las opciones evita que el blur del input
 * cierre el desplegable antes de que el click de selección se registre. */
function ComboboxCategoria({ valor, onChange, dbCategorias }: { valor: string; onChange: (v: string) => void; dbCategorias: string[] }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState(valor)
  const todasCategorias = useMemo(
    () => [...CATEGORIAS, ...dbCategorias].filter((c, i, arr) => arr.findIndex(x => x.toLowerCase() === c.toLowerCase()) === i),
    [dbCategorias]
  )
  const filtradas = todasCategorias.filter(c => c.toLowerCase().includes(busqueda.trim().toLowerCase()))
  const esNueva = busqueda.trim() !== "" && !todasCategorias.some(c => c.toLowerCase() === busqueda.trim().toLowerCase())

  function seleccionar(c: string) {
    onChange(c)
    setBusqueda(c)
    setAbierto(false)
  }

  function cerrar() {
    setAbierto(false)
    const val = busqueda.trim()
    onChange(val)
    if (val && !todasCategorias.some(c => c.toLowerCase() === val.toLowerCase())) {
      crearCategoriaPersonalizada("COSTO_FIJO", val).catch(() => {})
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text4)] text-xs pointer-events-none">🔍</span>
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onBlur={cerrar}
          placeholder="Buscar categoría..."
          className={`${inp} pl-8`}
        />
      </div>
      {abierto && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl overflow-hidden max-h-44 overflow-y-auto shadow-xl">
          {filtradas.length > 0 ? filtradas.map(c => {
            const color = getColorCategoria(c)
            return (
              <button key={c} type="button" onMouseDown={e => e.preventDefault()} onClick={() => seleccionar(c)}
                className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-[var(--c-hover)] transition-colors flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[var(--c-text2)] truncate">{c}</span>
              </button>
            )
          }) : (
            <div className="px-3 py-2.5 text-[11px] text-[var(--c-text4)]">
              {esNueva ? <>Sin coincidencias — se creará <strong className="text-[var(--c-text3)]">&ldquo;{busqueda.trim()}&rdquo;</strong> como nueva categoría.</> : "Escribe para buscar una categoría."}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Formulario único de creación/edición de costo fijo — reemplaza el
 * asistente de 3 pasos por una sola pantalla con divulgación progresiva: el
 * tipo (Recurrente/Único) decide qué sección de "¿Cuándo?" se muestra, y la
 * frecuencia decide cómo se interpreta la fecha de inicio. Vive en un panel
 * lateral (drawer) sobre el tablero, no en una ruta ni paso aparte. */
function FormCostoDrawer({ mode, costoExistente, dbCategorias, onClose, onSuccess }: {
  mode: "crear" | "editar"
  costoExistente?: Costo
  dbCategorias: string[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [isPending, start] = useTransition()
  const [esRecurrente, setEsRecurrente] = useState(mode === "editar" ? true : true)
  const [nombre, setNombre] = useState(costoExistente?.nombre ?? "")
  const [categoria, setCategoria] = useState(costoExistente?.categoria ?? "")
  const [montoDisplay, setMontoDisplay] = useState(costoExistente ? costoExistente.monto.toLocaleString("es-CL") : "")
  const [descripcion, setDescripcion] = useState(costoExistente?.descripcion ?? "")
  const [frecuencia, setFrecuencia] = useState<FrecuenciaCosto>(costoExistente?.frecuencia ?? "mensual")
  const [fechaInicio, setFechaInicio] = useState(costoExistente ? costoExistente.fechaInicio.slice(0, 10) : localToday())
  const [fechaTermino, setFechaTermino] = useState(costoExistente?.fechaTermino ? costoExistente.fechaTermino.slice(0, 10) : "")
  const [fechaUnico, setFechaUnico] = useState(localToday())

  const fechaLabel = frecuencia === "mensual" ? "Se repite el día" : frecuencia === "trimestral" ? "Fecha de inicio (se repite cada 3 meses)" : "Fecha de inicio (se repite cada año)"

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    fd.set("nombre", nombre)
    fd.set("categoria", categoria)
    fd.set("descripcion", descripcion)
    fd.set("monto", montoDisplay.replace(/\./g, ""))

    start(async () => {
      try {
        if (mode === "editar" && costoExistente) {
          fd.set("fechaInicio", fechaInicio)
          fd.set("frecuencia", frecuencia)
          if (fechaTermino) fd.set("fechaTermino", fechaTermino)
          await editarCostoRecurrente(costoExistente.id, fd)
          toast.success("✅ Costo fijo actualizado")
        } else if (esRecurrente) {
          fd.set("fechaInicio", fechaInicio)
          fd.set("frecuencia", frecuencia)
          if (fechaTermino) fd.set("fechaTermino", fechaTermino)
          await crearCostoRecurrente(fd)
          toast.success("✅ Costo fijo recurrente creado")
        } else {
          fd.set("fecha", fechaUnico)
          await crearCostoUnico(fd)
          toast.success("✅ Costo único registrado")
        }
        onSuccess()
      } catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex justify-end" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        className="h-full w-full sm:w-[460px] sm:max-w-[92vw] bg-[var(--c-card)] border-l border-[var(--c-border)] flex flex-col animate-fade-up">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--c-border)] flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-[var(--c-text)]">{mode === "editar" ? "Editar costo fijo" : "Nuevo costo fijo"}</h3>
            <p className="text-[11px] text-[var(--c-text4)] mt-0.5">Todo en una pantalla — sin pasos extra.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            className="w-8 h-8 rounded-lg bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text3)] hover:text-[var(--c-text)] transition-colors flex-shrink-0">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {mode === "crear" && (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setEsRecurrente(true)}
                className={`text-left p-3.5 rounded-xl border-2 transition-all ${esRecurrente ? "border-sky-500 bg-sky-500/5" : "border-[var(--c-border)] bg-[var(--c-card2)]"}`}>
                <p className="text-sm font-bold text-[var(--c-text)]">🔄 Recurrente</p>
                <p className="text-[11px] text-[var(--c-text3)] mt-1">Se repite y se genera solo</p>
              </button>
              <button type="button" onClick={() => setEsRecurrente(false)}
                className={`text-left p-3.5 rounded-xl border-2 transition-all ${!esRecurrente ? "border-sky-500 bg-sky-500/5" : "border-[var(--c-border)] bg-[var(--c-card2)]"}`}>
                <p className="text-sm font-bold text-[var(--c-text)]">⚡ Único</p>
                <p className="text-[11px] text-[var(--c-text3)] mt-1">Un gasto puntual, una vez</p>
              </button>
            </div>
          )}

          <div className="space-y-3.5">
            <p className="text-[11px] font-bold text-[var(--c-text4)] uppercase tracking-wider">Información básica</p>
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Nombre *</label>
              <input required value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder={esRecurrente ? "Ej: Arriendo local" : "Ej: Permiso municipal"} className={inp} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Categoría</label>
              <ComboboxCategoria valor={categoria} onChange={setCategoria} dbCategorias={dbCategorias} />
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
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Descripción <span className="text-[var(--c-text4)] font-normal">(opcional)</span></label>
              <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
                placeholder="Ej: Arriendo bodega calle principal" className={inp} />
            </div>
          </div>

          {/* ¿Cuándo? — divulgación progresiva según tipo y frecuencia */}
          <div className="space-y-3.5 pt-1 border-t border-[var(--c-border2)]">
            <p className="text-[11px] font-bold text-[var(--c-text4)] uppercase tracking-wider pt-4">
              {esRecurrente ? "¿Cuándo se repite?" : "¿Cuándo fue el gasto?"}
            </p>

            {!esRecurrente ? (
              <div>
                <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Fecha del gasto *</label>
                <CampoFecha required value={fechaUnico} onChange={e => setFechaUnico(e.target.value)} className={inp} />
              </div>
            ) : (
              <div className="space-y-3.5">
                <div>
                  <span className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Frecuencia</span>
                  <div className="flex gap-2 flex-wrap">
                    {(Object.keys(FRECUENCIA_LABEL) as FrecuenciaCosto[]).map(f => (
                      <button key={f} type="button" onClick={() => setFrecuencia(f)}
                        className={`h-8 px-3.5 rounded-lg text-xs font-bold border transition-all ${frecuencia === f ? "bg-sky-500/15 border-sky-500/40 text-sky-400" : "border-[var(--c-border)] text-[var(--c-text3)] hover:bg-[var(--c-card2)]"}`}>
                        {FRECUENCIA_LABEL[f]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold inline-flex items-center gap-1.5">
                      {fechaLabel}
                      <InfoTooltip tip="El día (y, si es anual, el mes) de esta fecha es cuándo se repite siempre." />
                    </label>
                    <CampoFecha required value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className={`${inp} mt-1`} />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold inline-flex items-center gap-1.5">
                      Fecha de término
                      <InfoTooltip tip="Opcional — si la dejas vacía, este costo se repite indefinidamente hasta que lo pauses o elimines." />
                    </label>
                    <CampoFecha value={fechaTermino} min={fechaInicio} onChange={e => setFechaTermino(e.target.value)} className={`${inp} mt-1`} />
                  </div>
                </div>

                {fechaInicio && (
                  <div className="flex items-start gap-2 bg-sky-500/5 border border-sky-500/15 rounded-xl px-3.5 py-3">
                    <span className="text-sm flex-shrink-0">🔁</span>
                    <p className="text-xs text-[var(--c-text2)]">
                      Este costo se repetirá automáticamente {
                        frecuencia === "mensual" ? <>cada <strong className="text-[var(--c-text)]">día {new Date(fechaInicio + "T00:00:00").getDate()}</strong> de cada mes</>
                        : frecuencia === "trimestral" ? <>cada <strong className="text-[var(--c-text)]">3 meses</strong>, el día <strong className="text-[var(--c-text)]">{new Date(fechaInicio + "T00:00:00").getDate()}</strong></>
                        : <>cada <strong className="text-[var(--c-text)]">año</strong>, el <strong className="text-[var(--c-text)]">{formatFechaCorta(fechaInicio)}</strong></>
                      }, empezando el <strong className="text-[var(--c-text)]">{formatFechaCorta(fechaInicio)}</strong>
                      {fechaTermino ? <> hasta el <strong className="text-[var(--c-text)]">{formatFechaCorta(fechaTermino)}</strong></> : <>, sin fecha de término</>}. No necesitas hacer nada más — NELYX lo va a ir generando solo.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--c-border)] flex-shrink-0">
          <button type="submit" disabled={isPending || !nombre || !montoDisplay}
            className="w-full h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-all">
            {isPending ? "Guardando..." : mode === "editar" ? "✓ Guardar cambios" : esRecurrente ? "✓ Guardar costo fijo recurrente" : "✓ Registrar costo único"}
          </button>
        </div>
      </form>
    </div>
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
          <CampoFecha name="fecha" required defaultValue={localToday()} className={`${inp} h-9 text-xs`} />
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

/** Panel de detalle del costo seleccionado — se monta dos veces (fijo en
 * desktop, dentro de una hoja inferior en mobile) por eso vive como
 * subcomponente propio con `key={costo.id}` en el llamador, así su estado
 * local ("marcando pago") no se arrastra de un costo al siguiente. */
function PanelDetalle({ costo, isPending, onAbrirEditar, onEstado, onEliminar, onSuccessAccion }: {
  costo: Costo
  isPending: boolean
  onAbrirEditar: () => void
  onEstado: (id: string, estado: "activo" | "pausado" | "finalizado") => void
  onEliminar: (id: string, nombre: string) => void
  onSuccessAccion: () => void
}) {
  const [pagando, setPagando] = useState(false)
  const cfg = ESTADO_CONFIG[costo.estadoDerivado]

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
      <div className="flex items-center gap-3 pb-3.5 mb-3.5 border-b border-[var(--c-border2)]">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-base flex-shrink-0">🏠</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--c-text)] truncate">{costo.nombre}</p>
          <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.emoji} {cfg.label}</span>
        </div>
      </div>

      <p className="text-2xl font-bold text-orange-400">{formatCLP(costo.monto)} <span className="text-[11px] font-normal text-[var(--c-text4)]">/ {FRECUENCIA_LABEL[costo.frecuencia].toLowerCase()}</span></p>
      <p className="text-xs text-[var(--c-text3)] mt-1">
        {costo.categoria ?? "Sin categoría"} · {descripcionFrecuencia(costo)}
        {costo.fechaTermino && <> · hasta {formatFechaCorta(costo.fechaTermino)}</>}
      </p>

      {costo.estadoDerivado === "generado" && (
        <button onClick={() => setPagando(v => !v)} disabled={isPending}
          className="w-full h-10 mt-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
          💰 Marcar pagado
        </button>
      )}

      <div className="flex gap-2 mt-2.5">
        <button onClick={onAbrirEditar} disabled={isPending}
          className="flex-1 h-9 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text3)] hover:text-sky-400 text-xs font-semibold rounded-lg transition-all">
          ✏️ Editar
        </button>
        {costo.estado === "activo" ? (
          <button onClick={() => onEstado(costo.id, "pausado")} disabled={isPending}
            className="flex-1 h-9 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text3)] hover:text-[var(--c-warning)] text-xs font-semibold rounded-lg transition-all">
            ⏸ Pausar
          </button>
        ) : costo.estado === "pausado" ? (
          <button onClick={() => onEstado(costo.id, "activo")} disabled={isPending}
            className="flex-1 h-9 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-lg transition-all">
            ▶ Activar
          </button>
        ) : null}
        <button onClick={() => onEliminar(costo.id, costo.nombre)} disabled={isPending}
          className="flex-1 h-9 bg-red-500/5 border border-red-500/20 text-red-400 text-xs font-semibold rounded-lg hover:bg-red-500/10 transition-all">
          🗑️ Eliminar
        </button>
      </div>

      {pagando && <FormMarcarPagado costo={costo} onClose={() => setPagando(false)} onSuccess={() => { setPagando(false); onSuccessAccion() }} />}
    </div>
  )
}

export function CostosFijosClient({ costosData, totalMes, activosAplicablesCount, ingresosActuales, gastosVariables, excedenteOperativo, resultadoCobertura, mes, anio, conteoEstados: _conteoEstados, proximosCostos, costosUnicosEsteMes, proyeccionMeses, dbCategorias = [] }: Props) {
  const router = useRouter()
  const [drawer, setDrawer] = useState<{ mode: "crear" } | { mode: "editar"; costo: Costo } | null>(null)
  const [eliminando, setEliminando] = useState<{ id: string; nombre: string } | null>(null)
  const [isPending, start] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(costosData[0]?.id ?? null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas")

  const cubierto = resultadoCobertura >= 0
  const [showDetalle, setShowDetalle] = useState(() => !cubierto && totalMes > 0)
  const activos = costosData.filter(c => c.estado === "activo")
  const pagadoMonto = activos.filter(c => c.estadoDerivado === "pagado").reduce((a, c) => a + c.monto, 0)
  const pctCubierto = totalMes > 0 ? Math.max(0, Math.min(100, Math.round((excedenteOperativo / totalMes) * 100))) : 0
  const maxProyeccion = Math.max(totalMes, ...proyeccionMeses.map(p => p.total), 1)

  const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

  const categoriasEnLista = useMemo(
    () => Array.from(new Set(costosData.map(c => c.categoria).filter((c): c is string => !!c))).sort(),
    [costosData]
  )
  const term = search.trim().toLowerCase()
  const listaFiltrada = costosData.filter(c =>
    (categoriaFiltro === "todas" || c.categoria === categoriaFiltro) &&
    (term === "" || c.nombre.toLowerCase().includes(term) || (c.categoria ?? "").toLowerCase().includes(term))
  )
  const selected = costosData.find(c => c.id === selectedId) ?? null

  function handleSelect(id: string) { setSelectedId(id); setMobileDetailOpen(true) }

  function handleEstado(id: string, estado: "activo" | "pausado" | "finalizado") {
    start(async () => {
      try { await actualizarEstadoCosto(id, estado); toast.success("Estado actualizado"); router.refresh() }
      catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  function handleEliminarConfirmado() {
    if (!eliminando) return
    const { id } = eliminando
    start(async () => {
      try {
        await eliminarCostoRecurrente(id)
        toast.success("Eliminado")
        setEliminando(null)
        if (selectedId === id) setSelectedId(null)
        setMobileDetailOpen(false)
      }
      catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  const coberturaYProyeccion = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      {totalMes > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-1.5 min-w-0">
              <span className="truncate min-w-0">Cobertura financiera</span>
              <InfoTooltip tip="Compara lo que realmente te queda disponible (ingresos menos gastos variables) contra tus costos fijos del mes. A diferencia de mirar solo las ventas, esto evita mostrar 'cubierto' cuando en realidad el negocio está perdiendo dinero por gastos altos." className="flex-shrink-0" />
            </p>
            <span className="text-lg flex-shrink-0">{cubierto ? "✅" : "⚠️"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-[var(--c-card2)] rounded-xl p-2 sm:p-3 min-w-0">
              <p className="text-[10px] text-[var(--c-text3)] truncate">Ingresos</p>
              <p className="text-xs sm:text-sm font-bold text-emerald-400 whitespace-nowrap">{formatCLP(ingresosActuales)}</p>
            </div>
            <div className="bg-[var(--c-card2)] rounded-xl p-2 sm:p-3 min-w-0">
              <p className="text-[10px] text-[var(--c-text3)] truncate">Gastos variables</p>
              <p className="text-xs sm:text-sm font-bold text-red-400 whitespace-nowrap">{`−${formatCLP(gastosVariables)}`}</p>
            </div>
            <div className="bg-[var(--c-card2)] rounded-xl p-2 sm:p-3 min-w-0">
              <p className="text-[10px] text-[var(--c-text3)] truncate">Costos fijos</p>
              <p className="text-xs sm:text-sm font-bold text-orange-400 whitespace-nowrap">{`−${formatCLP(totalMes)}`}</p>
            </div>
          </div>
          <div className="h-3 bg-[var(--c-card2)] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${cubierto ? "bg-emerald-500" : pctCubierto >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, pctCubierto)}%` }} />
          </div>
          <p className={`text-sm font-semibold mt-3 ${cubierto ? "text-emerald-400" : "text-red-400"}`}>
            {cubierto
              ? `Costos fijos cubiertos — te queda un excedente de ${formatCLP(resultadoCobertura)}.`
              : `Faltan ${formatCLP(Math.abs(resultadoCobertura))} para cubrir los costos fijos del período.`}
          </p>
          {!cubierto && excedenteOperativo < 0 && (
            <p className="text-xs text-[var(--c-text3)] mt-1">Tus gastos variables ya superan tus ingresos este mes, antes de considerar costos fijos.</p>
          )}
        </div>
      )}

      {proyeccionMeses.some(p => p.total > 0) && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[var(--c-text)] mb-1 inline-flex items-center gap-1.5">
            📊 Proyección — próximos 3 meses
            <InfoTooltip tip="Suma de tus costos fijos recurrentes activos en cada uno de los próximos meses, según su fecha de inicio, frecuencia y término. No incluye costos únicos ni gastos variables." />
          </p>
          <p className="text-xs text-[var(--c-text3)] mb-4">Planifica tu caja con anticipación, no mes a mes.</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {proyeccionMeses.map(p => {
              const pct = Math.max(4, Math.round((p.total / maxProyeccion) * 100))
              return (
                <div key={`${p.anio}-${p.mes}`} className="bg-[var(--c-card2)] rounded-xl p-2.5 sm:p-3 border border-[var(--c-border)] min-w-0">
                  <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider truncate">
                    {MESES[p.mes]}{p.anio !== anio ? ` ${p.anio}` : ""}
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-orange-400 mt-1 truncate">{formatCLP(p.total)}</p>
                  <div className="h-1.5 bg-[var(--c-hover)] rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-orange-400/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Costos Fijos</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Recurrentes se generan automáticamente · Únicos se registran de una vez</p>
        </div>
        <button onClick={() => setDrawer({ mode: "crear" })}
          className="flex items-center gap-2 h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20 whitespace-nowrap">
          + Agregar costo fijo
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
          <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 min-w-0">
            <span className="truncate min-w-0">Total mensual</span>
            <InfoTooltip tip="Suma de los costos activos que aplican este mes. Los costos programados para meses futuros no se incluyen aquí." className="flex-shrink-0" />
          </p>
          <p className="text-xl font-bold text-orange-400">{formatCLP(totalMes)}</p>
          <p className="text-[11px] text-[var(--c-text3)] mt-1">{activosAplicablesCount} activo{activosAplicablesCount === 1 ? "" : "s"} este mes</p>
        </div>
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
          <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 min-w-0">
            <span className="truncate min-w-0">Pagado</span>
            <InfoTooltip tip="Suma de los costos de este mes cuyo pago ya fue confirmado. Este monto es el que realmente impacta tu flujo de caja." className="flex-shrink-0" />
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

      {/* Cobertura + proyección, colapsable (expandido por defecto si hay déficit) */}
      <div>
        <button type="button" onClick={() => setShowDetalle(v => !v)}
          className="flex items-center gap-2 text-[var(--c-text3)] hover:text-[var(--c-text2)] text-xs font-semibold transition-colors py-1">
          <span className={`inline-flex transition-transform ${showDetalle ? "rotate-90" : ""}`}>▸</span>
          {showDetalle ? "Ocultar cobertura y proyección" : "Ver cobertura y proyección"}
        </button>
        {showDetalle && coberturaYProyeccion}
      </div>

      {/* Búsqueda + filtro de categoría */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text4)] text-xs pointer-events-none">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar costo fijo..."
            className={`${inp} pl-8`} />
        </div>
        {categoriasEnLista.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button onClick={() => setCategoriaFiltro("todas")}
              className={`h-9 px-3 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all ${categoriaFiltro === "todas" ? "bg-sky-500/15 border-sky-500/40 text-sky-400" : "border-[var(--c-border)] text-[var(--c-text3)]"}`}>
              Todas <span className="opacity-60">({costosData.length})</span>
            </button>
            {categoriasEnLista.map(cat => {
              const count = costosData.filter(c => c.categoria === cat).length
              const activa = categoriaFiltro === cat
              return (
                <button key={cat} onClick={() => setCategoriaFiltro(cat)}
                  className={`h-9 px-3 rounded-lg text-xs font-semibold border whitespace-nowrap transition-all ${activa ? "bg-sky-500/15 border-sky-500/40 text-sky-400" : "border-[var(--c-border)] text-[var(--c-text3)]"}`}>
                  {cat} <span className="opacity-60">({count})</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Maestro-detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          {costosData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-3">🏠</p>
              <p className="text-sm text-[var(--c-text3)]">Sin costos fijos recurrentes</p>
              <button onClick={() => setDrawer({ mode: "crear" })} className="mt-3 text-xs text-sky-400 hover:text-sky-300">+ Agregar tu primer costo fijo</button>
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm text-[var(--c-text3)]">Ningún costo fijo coincide con la búsqueda.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--c-border2)]">
              {listaFiltrada.map(c => {
                const cfg = ESTADO_CONFIG[c.estadoDerivado]
                const activo = c.id === selectedId
                return (
                  <button key={c.id} onClick={() => handleSelect(c.id)}
                    className={`w-full text-left px-4 py-3.5 transition-all ${activo ? "bg-sky-500/5" : "hover:bg-[var(--c-hover)]"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-sm flex-shrink-0">🏠</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-semibold truncate ${activo ? "text-sky-400" : "text-[var(--c-text)]"}`}>{c.nombre}</p>
                          {c.categoria && <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/10 text-sky-400 rounded-full flex-shrink-0">{c.categoria}</span>}
                        </div>
                        <p className="text-[11px] text-[var(--c-text3)] mt-0.5 truncate">{descripcionFrecuencia(c)} · {FRECUENCIA_LABEL[c.frecuencia]}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-[var(--c-text)]">{formatCLP(c.monto)}</p>
                        <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.emoji} {cfg.label}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="px-5 py-3 border-t border-[var(--c-border2)] bg-[var(--c-card2)]">
            <p className="text-[11px] text-[var(--c-text3)]">🔄 Al llegar el día de generación el costo pasa a "Generado". Confirma el pago para que impacte tu flujo de caja.</p>
          </div>
        </div>

        {/* Detalle — fijo en desktop */}
        <div className="hidden lg:block sticky top-4">
          {selected ? (
            <PanelDetalle key={selected.id} costo={selected} isPending={isPending}
              onAbrirEditar={() => setDrawer({ mode: "editar", costo: selected })}
              onEstado={handleEstado} onEliminar={(id, nombre) => setEliminando({ id, nombre })}
              onSuccessAccion={() => router.refresh()} />
          ) : (
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6 text-center">
              <p className="text-sm text-[var(--c-text3)]">Selecciona un costo fijo para ver el detalle.</p>
            </div>
          )}
        </div>
      </div>

      {/* Costos únicos este mes */}
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

      {/* Detalle — hoja inferior en mobile/tablet */}
      {mobileDetailOpen && selected && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[65] bg-black/60 lg:hidden flex items-end" onClick={() => setMobileDetailOpen(false)}>
          <div className="bg-[var(--c-bg)] w-full max-h-[88vh] overflow-y-auto rounded-t-3xl p-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-1">
              <button onClick={() => setMobileDetailOpen(false)} aria-label="Cerrar"
                className="w-8 h-8 rounded-lg bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text3)]">✕</button>
            </div>
            <PanelDetalle key={selected.id} costo={selected} isPending={isPending}
              onAbrirEditar={() => { setMobileDetailOpen(false); setDrawer({ mode: "editar", costo: selected }) }}
              onEstado={handleEstado} onEliminar={(id, nombre) => setEliminando({ id, nombre })}
              onSuccessAccion={() => router.refresh()} />
          </div>
        </div>,
        document.body
      )}

      {/* Drawer crear/editar */}
      {drawer && (
        <FormCostoDrawer mode={drawer.mode} costoExistente={drawer.mode === "editar" ? drawer.costo : undefined}
          dbCategorias={dbCategorias}
          onClose={() => setDrawer(null)}
          onSuccess={() => { setDrawer(null); router.refresh() }} />
      )}

      {eliminando && <ConfirmarEliminarModal nombre={eliminando.nombre} isPending={isPending} onCancelar={() => setEliminando(null)} onConfirmar={handleEliminarConfirmado} />}
    </div>
  )
}

function ConfirmarEliminarModal({ nombre, isPending, onCancelar, onConfirmar }: { nombre: string; isPending: boolean; onCancelar: () => void; onConfirmar: () => void }) {
  if (typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={() => !isPending && onCancelar()}>
      <div className="bg-[var(--c-card)] border border-red-500/20 rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">⚠️</span>
          <p className="text-sm font-bold text-[var(--c-text)]">Eliminar "{nombre}"</p>
        </div>
        <p className="text-xs text-[var(--c-text2)] mb-2">
          Esto elimina el costo fijo recurrente de forma <strong className="text-red-400">permanente</strong> — no se puede deshacer. No se va a volver a generar en ningún mes futuro.
        </p>
        <p className="text-xs text-[var(--c-text2)] mb-4">
          Los pagos que ya confirmaste con este costo <strong className="text-emerald-400">no se borran</strong> — siguen apareciendo en Movimientos y Reportes, solo que sin el vínculo directo al costo fijo.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancelar} disabled={isPending}
            className="flex-1 h-10 border border-[var(--c-border)] text-[var(--c-text2)] text-sm rounded-xl hover:bg-[var(--c-card2)] transition-all disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={onConfirmar} disabled={isPending}
            className="flex-1 h-10 bg-red-500 hover:bg-red-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
            {isPending ? "Eliminando..." : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
