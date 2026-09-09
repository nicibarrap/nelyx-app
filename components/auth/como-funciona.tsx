"use client"
import { useState } from "react"

const MODULOS = [
  { icon: "🛒", title: "Ventas", desc: "Registra ingresos fácilmente.", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { icon: "📦", title: "Inventario", desc: "Controla stock y productos.", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { icon: "🏠", title: "Costos fijos", desc: "Gestiona gastos recurrentes.", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  { icon: "🏦", title: "Deudas", desc: "Controla cuotas y vencimientos.", color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { icon: "📋", title: "Cuentas por cobrar", desc: "Centro de cobranza con WhatsApp y correo.", color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
]

export function ComoFunciona() {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border border-white/10 transition-all"
        style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
          </svg>
          <span className="text-sm font-semibold text-white">Ver cómo funciona Nelyx</span>
        </div>
        <svg className={`w-5 h-5 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && (
        <div className="mt-3 space-y-2 animate-fade-up">
          {MODULOS.map(({ icon, title, desc, color, bg }) => (
            <div key={title} className={`flex items-center gap-4 p-4 rounded-xl border ${bg}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${bg} border`}>{icon}</div>
              <div>
                <p className={`text-sm font-bold ${color}`}>{title}</p>
                <p className="text-xs text-white/50">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
