"use client"
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { formatCLP } from "@/lib/utils"

type PuntoAnual = { mes: string; anio: number; ingresos: number; gastos: number; costosFijos: number; neto: number }

type ReportData = {
  periodo: { inicio: string; fin: string }
  diagnostico: string[]
  oportunidades: string[]
  graficoAnual: PuntoAnual[]
  heatmap: number[][] // [día 0-6][hora 0-23], día 0 = domingo
  resumenEjecutivo: string
  negocio: string
}

function ListaCard({ title, icon, color, items, emptyText }: { title: string; icon: string; color: string; items: string[]; emptyText: string }) {
  return (
    <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card)] p-5 flex flex-col">
      <p className={`text-sm font-bold mb-3 flex items-center gap-2 ${color}`}>
        <span>{icon}</span>{title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--c-text4)] flex-1">{emptyText}</p>
      ) : (
        <div className="space-y-2.5 flex-1">
          {items.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`text-xs mt-0.5 flex-shrink-0 ${color}`}>●</span>
              <p className="text-xs text-[var(--c-text2)] leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TooltipAnual({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: PuntoAnual = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-[var(--c-card2)] border border-[#222] rounded-xl p-3 text-xs shadow-xl min-w-[170px]">
      <p className="text-[var(--c-text)] font-semibold mb-2">{d.mes} {d.anio}</p>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="flex items-center gap-1.5 text-[var(--c-text3)]"><span className="w-2 h-2 rounded-full bg-green-500" />Ingresos</span>
        <span className="text-[var(--c-text)] font-semibold">{formatCLP(d.ingresos)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="flex items-center gap-1.5 text-[var(--c-text3)]"><span className="w-2 h-2 rounded-full bg-red-500" />Gastos</span>
        <span className="text-[var(--c-text)] font-semibold">{formatCLP(d.gastos)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="flex items-center gap-1.5 text-[var(--c-text3)]"><span className="w-2 h-2 rounded-full bg-orange-500" />Costos fijos</span>
        <span className="text-[var(--c-text)] font-semibold">{formatCLP(d.costosFijos)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#222] mt-1.5 pt-1.5">
        <span className="flex items-center gap-1.5 text-[var(--c-text3)]"><span className="w-2 h-2 rounded-full bg-sky-500" />Resultado neto</span>
        <span className={`font-semibold ${d.neto >= 0 ? "text-sky-400" : "text-red-400"}`}>{formatCLP(d.neto)}</span>
      </div>
    </div>
  )
}

const DIAS_CORTO = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]

function MapaCalor({ heatmap }: { heatmap: number[][] }) {
  const max = Math.max(1, ...heatmap.flat())
  // Agrupa en bloques de 3 horas para que la grilla sea legible en celular
  const BLOQUES = [[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23]]
  const labelBloque = (b: number[]) => `${b[0]}-${b[b.length-1]+1}h`

  function colorCelda(valor: number) {
    if (valor <= 0) return "rgba(56,189,248,0.04)"
    const intensidad = Math.min(1, valor / max)
    return `rgba(56,189,248,${0.12 + intensidad * 0.75})`
  }

  return (
    <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card)] p-5 print-section">
      <p className="text-sm font-semibold text-[var(--c-text)]">Cuándo vendes más</p>
      <p className="text-[11px] text-[var(--c-text4)] mt-0.5 mb-4">Entre más intenso el color, más ventas en ese día y horario — de un vistazo, sin leer números.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="w-10" />
              {BLOQUES.map((b, i) => (
                <th key={i} className="text-[9px] text-[var(--c-text4)] font-normal pb-1">{labelBloque(b)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1,2,3,4,5,6,0].map(dia => (
              <tr key={dia}>
                <td className="text-[10px] text-[var(--c-text3)] pr-1 text-right">{DIAS_CORTO[dia]}</td>
                {BLOQUES.map((b, i) => {
                  const valor = b.reduce((a, h) => a + heatmap[dia][h], 0)
                  return (
                    <td key={i} className="rounded-lg h-9" style={{ backgroundColor: colorCelda(valor) }} title={valor > 0 ? formatCLP(valor) : undefined} />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ReportesClient({ data }: { data: ReportData }) {
  const fInicio = new Date(data.periodo.inicio)
  const fFin = new Date(data.periodo.fin)
  const periodoLabel = `${fInicio.getUTCDate()} — ${fFin.getUTCDate()} ${fFin.toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })}`

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Reportes</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">El diagnóstico de tu negocio, sin repetir lo que ya ves en otros módulos.</p>
        </div>
        <div className="flex gap-2">
          <span className="h-10 px-4 flex items-center gap-2 text-sm border border-[var(--c-border)] bg-[var(--c-card)] rounded-xl text-[var(--c-text2)] capitalize">
            📅 {periodoLabel}
          </span>
        </div>
      </div>

      {/* Resumen ejecutivo */}
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5 print-section">
        <p className="text-xs font-bold text-sky-400 mb-2 flex items-center gap-2">📋 Resumen ejecutivo</p>
        <p className="text-sm text-[var(--c-text2)] leading-relaxed">{data.resumenEjecutivo}</p>
      </div>

      {/* Diagnóstico + Oportunidades */}
      <div className="grid lg:grid-cols-2 gap-4 print-section">
        <ListaCard title="Diagnóstico del negocio" icon="🩺" color="text-sky-400" items={data.diagnostico} emptyText="Sin datos suficientes este período." />
        <ListaCard title="Oportunidades detectadas" icon="💡" color="text-[var(--c-warning)]" items={data.oportunidades} emptyText="Sin oportunidades detectadas por ahora." />
      </div>

      {/* Gráfico grande — últimos 12 meses, todos los movimientos */}
      <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card)] p-5 print-section">
        <p className="text-sm font-semibold text-[var(--c-text)]">Evolución anual — todos los movimientos</p>
        <p className="text-[11px] text-[var(--c-text4)] mt-0.5 mb-4">Últimos 12 meses: ingresos, gastos, costos fijos y resultado neto, mes a mes.</p>
        <div className="flex items-center gap-4 text-xs mb-3">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-[var(--c-text3)]">Ingresos</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[var(--c-text3)]">Gastos</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500" /><span className="text-[var(--c-text3)]">Costos fijos</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 rounded-full bg-sky-500" /><span className="text-[var(--c-text3)]">Resultado neto</span></div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data.graficoAnual} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="barras" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v/1000).toFixed(0)}k` : v} width={40} />
            <YAxis yAxisId="neto" orientation="right" hide domain={["auto","auto"]} />
            <Tooltip content={<TooltipAnual />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
            <Bar yAxisId="barras" dataKey="ingresos" fill="#22c55e" radius={[3,3,0,0]} maxBarSize={22} />
            <Bar yAxisId="barras" dataKey="gastos" stackId="egresos" fill="#ef4444" radius={[0,0,0,0]} maxBarSize={22} />
            <Bar yAxisId="barras" dataKey="costosFijos" stackId="egresos" fill="#fb923c" radius={[3,3,0,0]} maxBarSize={22} />
            <Line yAxisId="neto" type="monotone" dataKey="neto" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3, fill: "#0ea5e9" }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Mapa de calor semanal — reemplaza "Hábitos del negocio" con algo visual */}
      <MapaCalor heatmap={data.heatmap} />
    </div>
  )
}
