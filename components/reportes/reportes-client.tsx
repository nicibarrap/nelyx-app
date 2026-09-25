"use client"
import { useState } from "react"
import Link from "next/link"
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { formatCLP } from "@/lib/utils"

type PuntoAnual = { mes: string; anio: number; ingresos: number; gastos: number; costosFijos: number; neto: number }
type ItemReporte = { texto: string; href?: string; label?: string }

type ReportData = {
  periodo: { inicio: string; fin: string }
  diagnostico: ItemReporte[]
  oportunidades: ItemReporte[]
  graficoAnual: PuntoAnual[]
  heatmapMonto: number[][] // [día 0-6][hora 0-23], día 0 = domingo — suma de $ vendidos
  heatmapCantidad: number[][] // mismo formato — cantidad de ventas (no monto)
  semanasDeDatos: number // para avisar cuando la muestra todavía es chica
  resumenEjecutivo: string
  negocio: string
}

function ListaCard({ title, icon, color, items, emptyText }: { title: string; icon: string; color: string; items: ItemReporte[]; emptyText: string }) {
  return (
    <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card)] p-5 flex flex-col">
      <p className={`text-sm font-bold mb-3 flex items-center gap-2 ${color}`}>
        <span>{icon}</span>{title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--c-text4)] flex-1">{emptyText}</p>
      ) : (
        <div className="space-y-2.5 flex-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`text-xs mt-0.5 flex-shrink-0 ${color}`}>●</span>
              <div className="min-w-0">
                <p className="text-xs text-[var(--c-text2)] leading-relaxed">{it.texto}</p>
                {it.href && (
                  <Link href={it.href} className={`text-[11px] font-semibold hover:underline mt-0.5 inline-block ${color}`}>
                    {it.label ?? "Ver más"} →
                  </Link>
                )}
              </div>
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
    <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-xs shadow-xl min-w-[170px]">
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
      <div className="flex items-center justify-between gap-3 border-t border-[var(--c-border)] mt-1.5 pt-1.5">
        <span className="flex items-center gap-1.5 text-[var(--c-text3)]"><span className="w-2 h-2 rounded-full bg-sky-500" />Resultado neto</span>
        <span className={`font-semibold ${d.neto >= 0 ? "text-sky-400" : "text-red-400"}`}>{formatCLP(d.neto)}</span>
      </div>
    </div>
  )
}

const DIAS_CORTO = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]

function MapaCalor({ heatmapMonto, heatmapCantidad, semanasDeDatos }: { heatmapMonto: number[][]; heatmapCantidad: number[][]; semanasDeDatos: number }) {
  const [modo, setModo] = useState<"monto" | "cantidad">("monto")
  const heatmap = modo === "monto" ? heatmapMonto : heatmapCantidad
  const max = Math.max(1, ...heatmap.flat())
  // Agrupa en bloques de 3 horas para que la grilla sea legible en celular
  const BLOQUES = [[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23]]
  const labelBloque = (b: number[]) => `${b[0]}-${b[b.length-1]+1}h`

  function alphaCelda(valor: number) {
    if (valor <= 0) return 0.04
    const intensidad = Math.min(1, valor / max)
    return 0.12 + intensidad * 0.75
  }
  function colorCelda(valor: number) {
    return `rgba(56,189,248,${alphaCelda(valor)})`
  }
  // Con poca intensidad la celda es casi transparente — se ve el fondo real
  // de la tarjeta (blanco en modo claro, oscuro en modo oscuro). Texto
  // blanco fijo ahí queda invisible en modo claro. Solo con suficiente
  // intensidad el celeste satura lo bastante como para que el blanco
  // funcione en ambos modos.
  function textoLegible(valor: number) {
    return alphaCelda(valor) >= 0.45
  }

  function formatoCelda(valor: number) {
    if (valor <= 0) return undefined
    return modo === "monto" ? formatCLP(valor) : `${valor} venta${valor === 1 ? "" : "s"}`
  }

  // Texto compacto para que quepa DENTRO del recuadro sin desbordarse —
  // el monto exacto completo sigue disponible al pasar el mouse (title).
  function formatoMillones(valor: number) {
    return `$${(valor / 1_000_000).toFixed(valor % 1_000_000 === 0 ? 0 : 1)}M`
  }
  // Para celular: abreviado siempre ($134k) — poco espacio horizontal.
  // Para PC/pantallas grandes: el monto completo ($134.320) — sí hay
  // espacio, y es más preciso de un vistazo. Los millones se abrevian
  // en cualquier pantalla, ya que un número completo ahí sería enorme.
  function formatoCompactoMovil(valor: number) {
    if (valor <= 0) return ""
    if (modo === "cantidad") return String(valor)
    if (valor >= 1_000_000) return formatoMillones(valor)
    if (valor >= 1_000) return `$${Math.round(valor / 1000)}k`
    return `$${valor}`
  }
  function formatoCompletoEscritorio(valor: number) {
    if (valor <= 0) return ""
    if (modo === "cantidad") return String(valor)
    if (valor >= 1_000_000) return formatoMillones(valor)
    return formatCLP(valor)
  }

  return (
    <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-card)] p-5 print-section">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-0.5">
        <p className="text-sm font-semibold text-[var(--c-text)]">Cuándo vendes más</p>
        <div className="flex bg-[var(--c-card2)] border border-[var(--c-border)] rounded-lg p-0.5">
          <button onClick={() => setModo("monto")} className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-all ${modo === "monto" ? "bg-sky-500/15 text-sky-400" : "text-[var(--c-text3)]"}`}>Por monto</button>
          <button onClick={() => setModo("cantidad")} className={`text-[10px] px-2.5 py-1 rounded-md font-semibold transition-all ${modo === "cantidad" ? "bg-sky-500/15 text-sky-400" : "text-[var(--c-text3)]"}`}>Por N° de ventas</button>
        </div>
      </div>
      <p className="text-[11px] text-[var(--c-text4)] mt-1 mb-1">
        {modo === "monto" ? "Entre más intenso el color, más dinero vendiste en ese día y horario." : "Entre más intenso el color, más clientes atendiste en ese día y horario — útil para decidir cuándo necesitas más gente en el mostrador."}
      </p>
      <p className="text-[10px] text-[var(--c-text4)]/80 mb-4">
        {semanasDeDatos > 0 && semanasDeDatos < 8 && <span className="text-[var(--c-warning)]">⚠️ Basado en solo {semanasDeDatos} semana{semanasDeDatos === 1 ? "" : "s"} de datos — el patrón se vuelve más confiable con más historial. </span>}
        La hora es cuando registraste la venta en Nelyx; si sueles anotar varias ventas juntas al final del día, el horario real puede variar.
      </p>
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
                  const legible = textoLegible(valor)
                  return (
                    <td key={i} className="rounded-lg h-10 text-center align-middle" style={{ backgroundColor: colorCelda(valor) }} title={formatoCelda(valor)}>
                      {valor > 0 && (
                        <span className={`text-[10px] font-semibold whitespace-nowrap ${legible ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" : "text-[var(--c-text)]"}`}>
                          <span className="sm:hidden">{formatoCompactoMovil(valor)}</span>
                          <span className="hidden sm:inline">{formatoCompletoEscritorio(valor)}</span>
                        </span>
                      )}
                    </td>
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
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs mb-3">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-[var(--c-text3)]">Ingresos</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[var(--c-text3)]">Gastos</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500" /><span className="text-[var(--c-text3)]">Costos fijos</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 rounded-full bg-sky-500" /><span className="text-[var(--c-text3)]">Resultado neto</span></div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data.graficoAnual} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "var(--c-text3)" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="barras" tick={{ fontSize: 10, fill: "var(--c-text3)" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v/1000).toFixed(0)}k` : v} width={40} />
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
      <MapaCalor heatmapMonto={data.heatmapMonto} heatmapCantidad={data.heatmapCantidad} semanasDeDatos={data.semanasDeDatos} />
    </div>
  )
}
