"use client"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { formatCLP } from "@/lib/utils"

const COLORES = ["#38bdf8","#818cf8","#34d399","#fb923c","#f472b6","#a3e635","#facc15","#94a3b8"]

interface Props {
  datos: { tipo: string; monto: number; cantidad: number }[]
  total: number
}

function TooltipP({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl p-3 text-xs">
      <p className="text-[var(--c-text)] font-semibold mb-1">{d.tipo}</p>
      <p className="text-zinc-400">{formatCLP(d.monto)}</p>
      <p className="text-zinc-600">{d.cantidad} deuda{d.cantidad !== 1 ? "s" : ""}</p>
    </div>
  )
}

export function GraficoDeudas({ datos, total }: Props) {
  return (
    <div className="bg-[#0D0D0D] border border-[#151515] rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-[var(--c-text)] mb-4">Deudas por tipo</h3>

      <div className="relative">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={datos}
              dataKey="monto"
              nameKey="tipo"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
            >
              {datos.map((_, i) => (
                <Cell key={i} fill={COLORES[i % COLORES.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<TooltipP />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Centro */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-xs font-bold text-[var(--c-text)]">{formatCLP(total)}</p>
            <p className="text-[9px] text-zinc-600">Total</p>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="space-y-2 mt-3">
        {datos.map((d, i) => {
          const pct = total > 0 ? Math.round((d.monto / total) * 100) : 0
          return (
            <div key={d.tipo} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORES[i % COLORES.length] }} />
              <span className="text-[10px] text-zinc-400 flex-1 truncate">{d.tipo}</span>
              <span className="text-[10px] text-zinc-600">{pct}%</span>
              <span className="text-[10px] font-medium text-zinc-300">{formatCLP(d.monto)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
