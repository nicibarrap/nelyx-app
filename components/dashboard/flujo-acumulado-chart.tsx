"use client"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { formatCLP } from "@/lib/utils"

function TooltipFlujo({ active, payload, label, mes, anio }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const MESES = ["","enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]
  return (
    <div className="bg-[var(--c-card2)] border border-[#222] rounded-xl p-3 text-xs shadow-xl min-w-[170px]">
      <p className="text-[var(--c-text2)] font-medium mb-2">{label} de {MESES[mes]}</p>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-[var(--c-text3)]">Disponible</span>
        <span className={`font-semibold ${d.acumulado >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCLP(d.acumulado)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-[var(--c-text3)]">Ingresos acum.</span>
        <span className="text-green-400 font-medium">{formatCLP(d.ingresosAcum)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-[var(--c-text3)]">Gastos acum.</span>
        <span className="text-red-400 font-medium">{formatCLP(d.gastosAcum)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#222] mt-1.5 pt-1.5">
        <span className="text-[var(--c-text4)]">Variación</span>
        <span className={`font-semibold ${d.variacion >= 0 ? "text-emerald-400" : "text-red-400"}`}>{d.variacion >= 0 ? "+" : ""}{formatCLP(d.variacion)}</span>
      </div>
    </div>
  )
}

export function FlujoAcumuladoChart({ datos, mes, anio }: { datos: { dia: string; acumulado: number; ingresosAcum: number; gastosAcum: number; variacion: number }[]; mes: number; anio: number }) {
  const hayDatos = datos.some(d => d.ingresosAcum > 0 || d.gastosAcum > 0)
  const saldoFinal = datos.length > 0 ? datos[datos.length - 1].acumulado : 0
  const ingresosFinal = datos.length > 0 ? datos[datos.length - 1].ingresosAcum : 0
  const gastosFinal = datos.length > 0 ? datos[datos.length - 1].gastosAcum : 0

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-1.5">
          Flujo acumulado del mes
          <span className="text-[var(--c-text4)] text-xs cursor-help" title="Cómo evoluciona tu disponible día a día, según todos tus movimientos reales.">ⓘ</span>
        </h3>
        {hayDatos && (
          <div className="flex items-center gap-4 text-xs">
            <span className="text-[var(--c-text4)]">Ingresos acum. <strong className="text-green-400 font-semibold">{formatCLP(ingresosFinal)}</strong></span>
            <span className="text-[var(--c-text4)]">Gastos acum. <strong className="text-red-400 font-semibold">{formatCLP(gastosFinal)}</strong></span>
          </div>
        )}
      </div>
      {!hayDatos ? (
        <div className="flex flex-col items-center justify-center h-40 text-zinc-700">
          <span className="text-2xl mb-1">📈</span>
          <p className="text-[11px]">Sin movimientos este mes todavía</p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={datos} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#111" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#3f3f46" }} tickLine={false} axisLine={false} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: "#3f3f46" }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v/1000).toFixed(0)}k` : v} width={40} />
              <Tooltip content={<TooltipFlujo mes={mes} anio={anio} />} cursor={{ stroke: "rgba(56,189,248,0.2)" }} />
              <Line type="monotone" dataKey="acumulado" stroke="#22c55e" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#22c55e" }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--c-border2)]">
            <span className="text-xs text-[var(--c-text4)]">Saldo acumulado</span>
            <span className={`text-base font-bold ${saldoFinal >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCLP(saldoFinal)}</span>
          </div>
        </>
      )}
    </div>
  )
}
