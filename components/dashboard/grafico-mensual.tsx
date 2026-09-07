"use client"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { formatCLP } from "@/lib/utils"
import { obtenerDatosGraficoAnual } from "@/app/actions/resumen-acciones"

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const MESES_ABREV = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

type PuntoMensual = { dia: string; ventas: number; gastos: number; neto: number; movimientos: number }
type PuntoAnual = { dia: string; mesCompleto: string; mesIndex: number; ventas: number; gastos: number; neto: number; movimientos: number }
type Vista = "mensual" | "anual"

function TooltipP({ active, payload, vista, mes, anio }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const titulo = vista === "mensual" ? `${d.dia} de ${MESES[mes]}, ${anio}` : `${d.mesCompleto} ${anio}`
  return (
    <div className="bg-[var(--c-card2)] border border-[#222] rounded-xl p-3 text-xs shadow-xl min-w-[170px]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[var(--c-text)] font-semibold">{titulo}</p>
        {vista === "mensual" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--c-card)] text-[var(--c-text3)]">{d.movimientos} mov.</span>}
      </div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="flex items-center gap-1.5 text-[var(--c-text3)]"><span className="w-2 h-2 rounded-full bg-green-500" />Ingresos</span>
        <span className="text-[var(--c-text)] font-semibold">{formatCLP(d.ventas)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="flex items-center gap-1.5 text-[var(--c-text3)]"><span className="w-2 h-2 rounded-full bg-red-500" />Gastos</span>
        <span className="text-[var(--c-text)] font-semibold">{formatCLP(d.gastos)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#222] mt-1.5 pt-1.5">
        <span className="flex items-center gap-1.5 text-[var(--c-text3)]"><span className="w-2 h-2 rounded-full bg-sky-500" />Resultado neto</span>
        <span className={`font-semibold ${d.neto >= 0 ? "text-sky-400" : "text-red-400"}`}>{formatCLP(d.neto)}</span>
      </div>
      {vista === "mensual" && (
        <Link href={`/dashboard/movimientos?mes=${mes}&anio=${anio}`}
          className="flex items-center justify-between gap-2 border-t border-[#222] mt-2 pt-2 text-sky-400 hover:text-sky-300 font-medium">
          Ver movimientos del día <span>›</span>
        </Link>
      )}
    </div>
  )
}

export function GraficoMensual({ datos, mes, anio }: { datos: PuntoMensual[]; mes: number; anio: number }) {
  const [vista, setVista] = useState<Vista>("mensual")
  const [datosAnual, setDatosAnual] = useState<PuntoAnual[] | null>(null)
  const [anioCacheado, setAnioCacheado] = useState<number | null>(null)
  const [cargandoAnual, setCargandoAnual] = useState(false)

  // Vista mensual: solo los días con actividad — sin renumerar, cada punto
  // conserva su fecha real (sección 6/7 del sprint).
  const datosMensualConMovimiento = useMemo(() => datos.filter(d => d.ventas > 0 || d.gastos > 0), [datos])
  const huboFiltrado = datosMensualConMovimiento.length > 0 && datosMensualConMovimiento.length < datos.length

  useEffect(() => {
    if (vista !== "anual") return
    if (anioCacheado === anio && datosAnual) return // ya en caché, no repetir la consulta
    setCargandoAnual(true)
    obtenerDatosGraficoAnual(anio)
      .then(res => { setDatosAnual(res); setAnioCacheado(anio) })
      .catch(() => setDatosAnual([]))
      .finally(() => setCargandoAnual(false))
  }, [vista, anio])

  const datosActivos = vista === "mensual" ? datosMensualConMovimiento : (datosAnual ?? [])
  const hayDatos = datosActivos.some(d => d.ventas > 0 || d.gastos > 0)
  // Máximo ~9 etiquetas visibles en el eje X, para que no se amontonen en
  // meses con muchos días de movimiento (sección 15: evitar overflow/superposición).
  const intervaloEjeX = datosActivos.length > 9 ? Math.ceil(datosActivos.length / 9) - 1 : 0

  // Totales e insights — se derivan de los mismos datos ya cargados en
  // memoria, no son una consulta ni un cálculo financiero nuevo.
  const totalIngresos = datosActivos.reduce((a, d) => a + d.ventas, 0)
  const totalGastos = datosActivos.reduce((a, d) => a + d.gastos, 0)
  const totalNeto = totalIngresos - totalGastos
  const labelPeriodo = (d: any) => vista === "mensual" ? `${d.dia} de ${MESES[mes]}` : d.mesCompleto
  const mejorIngreso = hayDatos ? datosActivos.reduce((max, d) => d.ventas > max.ventas ? d : max, datosActivos[0]) : null
  const mayorGasto = hayDatos ? datosActivos.reduce((max, d) => d.gastos > max.gastos ? d : max, datosActivos[0]) : null
  const mejorNeto = hayDatos ? datosActivos.reduce((max, d) => d.neto > max.neto ? d : max, datosActivos[0]) : null

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6 h-full flex flex-col">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-1.5">
            Ingresos vs Gastos
            <span className="text-[var(--c-text4)] text-xs cursor-help" title="Comparación de ingresos, gastos y resultado neto.">ⓘ</span>
          </h2>
          <p className="text-xs text-[var(--c-text4)] mt-0.5">Comparación de ingresos, gastos y resultado neto</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-1">
            <button type="button" onClick={() => setVista("mensual")}
              className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all ${vista === "mensual" ? "bg-sky-500/15 text-sky-400" : "text-[var(--c-text3)] hover:text-[var(--c-text)]"}`}>
              Mensual
            </button>
            <button type="button" onClick={() => setVista("anual")}
              className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all ${vista === "anual" ? "bg-sky-500/15 text-sky-400" : "text-[var(--c-text3)] hover:text-[var(--c-text)]"}`}>
              Anual
            </button>
          </div>
          <Link href={`/dashboard/movimientos?mes=${mes}&anio=${anio}`}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[var(--c-border)] text-xs font-semibold text-[var(--c-text2)] hover:bg-[var(--c-card2)] transition-all">
            📈 Ver detalles <span className="text-[10px]">⌄</span>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[var(--c-text3)]">Ingresos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[var(--c-text3)]">Gastos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full bg-sky-500" />
            <span className="text-[var(--c-text3)]">Resultado neto</span>
          </div>
        </div>
        {hayDatos && (
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-[10px] text-[var(--c-text4)]">Ingresos totales</p>
              <p className="text-sm font-bold text-green-400">{formatCLP(totalIngresos)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[var(--c-text4)]">Gastos totales</p>
              <p className="text-sm font-bold text-red-400">{formatCLP(totalGastos)}</p>
            </div>
            <div className="text-right flex items-center gap-1.5">
              <div>
                <p className="text-[10px] text-[var(--c-text4)]">Resultado neto</p>
                <p className={`text-sm font-bold ${totalNeto >= 0 ? "text-sky-400" : "text-red-400"}`}>{formatCLP(totalNeto)}</p>
              </div>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${totalNeto >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                {totalNeto >= 0 ? "↗" : "↘"}
              </span>
            </div>
          </div>
        )}
      </div>

      {vista === "anual" && cargandoAnual ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 min-h-[200px]">
          <span className="text-2xl mb-2 animate-pulse">📊</span>
          <p className="text-xs">Cargando datos del año...</p>
        </div>
      ) : !hayDatos ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-700 min-h-[200px]">
          <span className="text-3xl mb-2">📊</span>
          <p className="text-xs text-zinc-500">
            {vista === "mensual" ? "No hay movimientos en este período." : "No hay movimientos registrados durante este año."}
          </p>
          <p className="text-[10px] mt-1 text-zinc-800 max-w-[260px]">Registra una venta, ingreso o gasto para comenzar a visualizar tu evolución financiera.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datosActivos} barGap={2} barCategoryGap="30%">
              <defs>
                <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.9}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.5}/>
                </linearGradient>
                <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.9}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.5}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#111" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 9, fill: "#3f3f46" }} tickLine={false} axisLine={false}
                interval={intervaloEjeX}
                tickFormatter={(v: string, i: number) => vista === "mensual" ? `${v} ${MESES_ABREV[mes]}` : v} />
              {/* Eje izquierdo: barras (ingresos/gastos, siempre ≥ 0) */}
              <YAxis yAxisId="barras" tick={{ fontSize: 9, fill: "#3f3f46" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v/1000).toFixed(0)}k` : v} width={38} />
              {/* Eje derecho oculto, propio del Resultado neto — así un período con
                  pérdida grande no aplasta la escala de las barras. */}
              <YAxis yAxisId="neto" orientation="right" hide domain={["auto","auto"]} />
              <Tooltip content={<TooltipP vista={vista} mes={mes} anio={vista === "anual" ? anioCacheado : anio} />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
              <Bar yAxisId="barras" dataKey="ventas" fill="url(#colorVentas)" radius={[3,3,0,0]} maxBarSize={vista === "anual" ? 20 : 14} />
              <Bar yAxisId="barras" dataKey="gastos" fill="url(#colorGastos)" radius={[3,3,0,0]} maxBarSize={vista === "anual" ? 20 : 14} />
              <Line yAxisId="neto" type="monotone" dataKey="neto" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3, fill: "#0ea5e9" }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {vista === "mensual" && huboFiltrado && (
        <p className="text-[11px] text-[var(--c-text4)] mt-3 flex-shrink-0">✨ Solo se muestran los días en los que hubo movimientos.</p>
      )}

      {hayDatos && mejorIngreso && mayorGasto && mejorNeto && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-[var(--c-border2)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-emerald-500/10 flex items-center justify-center text-lg flex-shrink-0">📈</div>
            <div>
              <p className="text-[11px] text-[var(--c-text4)]">Mejor {vista === "mensual" ? "día" : "mes"} en ingresos</p>
              <p className="text-sm font-bold text-emerald-400">{labelPeriodo(mejorIngreso)}</p>
              <p className="text-[10px] text-[var(--c-text3)]">{formatCLP(mejorIngreso.ventas)} · {mejorIngreso.movimientos} mov.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-red-500/10 flex items-center justify-center text-lg flex-shrink-0">📉</div>
            <div>
              <p className="text-[11px] text-[var(--c-text4)]">Mayor gasto del {vista === "mensual" ? "día" : "mes"}</p>
              <p className="text-sm font-bold text-red-400">{labelPeriodo(mayorGasto)}</p>
              <p className="text-[10px] text-[var(--c-text3)]">{formatCLP(mayorGasto.gastos)} · {mayorGasto.movimientos} mov.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-sky-500/10 flex items-center justify-center text-lg flex-shrink-0">🔵</div>
            <div>
              <p className="text-[11px] text-[var(--c-text4)]">Mejor resultado neto</p>
              <p className={`text-sm font-bold ${mejorNeto.neto >= 0 ? "text-sky-400" : "text-red-400"}`}>{labelPeriodo(mejorNeto)}</p>
              <p className="text-[10px] text-[var(--c-text3)]">{formatCLP(mejorNeto.neto)} · {mejorNeto.movimientos} mov.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
