"use client"
import { useState } from "react"
import { CONCEPTOS_APRENDE } from "@/lib/conceptos-aprende"

type Concepto = typeof CONCEPTOS_APRENDE[number]

const MODULO_RELACIONADO: Record<string, { label: string; href: string }> = {
  "Ingresos": { label: "Movimientos", href: "/dashboard/movimientos" },
  "Gastos": { label: "Movimientos", href: "/dashboard/movimientos" },
  "Costos Fijos": { label: "Costos fijos", href: "/dashboard/costos-fijos" },
  "Utilidad Neta": { label: "Resumen", href: "/dashboard/resumen" },
  "Flujo de Caja": { label: "Resumen", href: "/dashboard/resumen" },
  "Margen de Ganancia": { label: "Reportes", href: "/dashboard/reportes" },
  "Inventario": { label: "Productos", href: "/dashboard/productos" },
  "Deudas": { label: "Deudas", href: "/dashboard/deudas" },
  "Retiro": { label: "Movimientos", href: "/dashboard/movimientos" },
  "Ingreso Extra": { label: "Movimientos", href: "/dashboard/movimientos" },
  "Disponible": { label: "Resumen", href: "/dashboard/resumen" },
  "Ticket Promedio": { label: "Reportes", href: "/dashboard/reportes" },
  "Código de Barras": { label: "Productos", href: "/dashboard/productos" },
  "Cuentas por Cobrar": { label: "Cuentas por cobrar", href: "/dashboard/cuentas-cobrar" },
  "Centro de Cobranza": { label: "Cuentas por cobrar", href: "/dashboard/cuentas-cobrar" },
  "Liquidez Proyectada": { label: "Resumen", href: "/dashboard/resumen" },
  "Costo Promedio Ponderado": { label: "Productos", href: "/dashboard/productos" },
  "Venta por Peso": { label: "Venta", href: "/dashboard/venta" },
}

function PanelDetalle({ c, mostrarHeader = true }: { c: Concepto; mostrarHeader?: boolean }) {
  return (
    <div className="space-y-3">
      {mostrarHeader && (
        <div className="flex items-center gap-3 pb-4 border-b border-[var(--c-border)]">
          <span className="text-3xl flex-shrink-0">{c.emoji}</span>
          <h2 className="text-lg font-bold text-[var(--c-text)]">{c.titulo}</h2>
        </div>
      )}

      <div>
        <p className="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-1.5">📖 Definición</p>
        <p className="text-sm text-[var(--c-text)] leading-relaxed">{c.def}</p>
      </div>

      <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl p-3">
        <p className="text-[11px] font-bold text-violet-400 uppercase tracking-wider mb-1">🧮 Cómo se calcula</p>
        <p className="text-xs text-[var(--c-text2)] leading-relaxed font-mono">{c.calculo}</p>
      </div>

      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
        <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1">📌 Ejemplo real</p>
        <p className="text-xs text-[var(--c-text2)] leading-relaxed">{c.ejemplo}</p>
      </div>

      <div className="bg-sky-500/5 border border-sky-500/15 rounded-xl p-3">
        <p className="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-1">💡 Consejo práctico</p>
        <p className="text-xs text-[var(--c-text2)] leading-relaxed">{c.consejo}</p>
      </div>

      <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3">
        <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-1">⚠️ Error común</p>
        <p className="text-xs text-[var(--c-text2)] leading-relaxed">{c.error}</p>
      </div>

      <div className="bg-violet-500/5 border border-violet-500/15 rounded-xl p-3">
        <p className="text-[11px] font-bold text-violet-400 uppercase tracking-wider mb-1">🎯 Impacto en tu negocio</p>
        <p className="text-xs text-[var(--c-text2)] leading-relaxed">{c.impacto}</p>
      </div>

      {MODULO_RELACIONADO[c.titulo] && (
        <a href={MODULO_RELACIONADO[c.titulo].href}
          className="flex items-center justify-center gap-2 h-11 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all mt-2">
          Ir a {MODULO_RELACIONADO[c.titulo].label} →
        </a>
      )}
    </div>
  )
}

export function AprendeClient() {
  const [seleccionado, setSeleccionado] = useState<string>(CONCEPTOS_APRENDE[0].titulo)
  const conceptoActivo = CONCEPTOS_APRENDE.find(c => c.titulo === seleccionado)!

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Centro de aprendizaje</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Conceptos financieros explicados simple para emprendedores reales</p>
        </div>
        <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-2.5">
          <span>📚</span>
          <span className="text-xs font-semibold text-sky-400">{CONCEPTOS_APRENDE.length} conceptos explicados</span>
        </div>
      </div>

      {/* Intro card */}
      <div className="bg-gradient-to-r from-sky-500/10 to-violet-500/10 border border-sky-500/20 rounded-2xl p-5">
        <p className="text-sm font-semibold text-[var(--c-text)] mb-1">💡 ¿Por qué aprender finanzas?</p>
        <p className="text-xs text-[var(--c-text2)] leading-relaxed">
          No necesitas ser contador para entender tus números. Con conceptos simples puedes tomar mejores decisiones, evitar problemas y hacer crecer tu negocio.
        </p>
      </div>

      {/* ══════════════════════════════════════════
          DESKTOP (lg+): maestro-detalle — lista a la izquierda,
          panel fijo a la derecha que cambia de contenido sin mover
          nada del layout ni obligar a scrollear la página entera.
      ══════════════════════════════════════════ */}
      <div className="hidden lg:grid grid-cols-[320px_1fr] gap-5 items-start">
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden sticky top-4 max-h-[calc(100vh-160px)] overflow-y-auto">
          {CONCEPTOS_APRENDE.map(c => {
            const activo = c.titulo === seleccionado
            return (
              <button key={c.titulo} onClick={() => setSeleccionado(c.titulo)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--c-border)] last:border-0 transition-all ${activo ? "bg-sky-500/10" : "hover:bg-[var(--c-hover)]"}`}>
                <span className="text-lg flex-shrink-0">{c.emoji}</span>
                <span className={`text-sm flex-1 min-w-0 truncate ${activo ? "font-bold text-sky-400" : "font-medium text-[var(--c-text2)]"}`}>{c.titulo}</span>
                {activo && <span className="text-sky-400 text-xs flex-shrink-0">→</span>}
              </button>
            )
          })}
        </div>

        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6">
          <PanelDetalle c={conceptoActivo} />
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MOBILE: acordeón, igual que antes.
      ══════════════════════════════════════════ */}
      <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CONCEPTOS_APRENDE.map(c => (
          <details key={c.titulo} className="group bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
            <summary className="flex items-center gap-3 p-5 cursor-pointer list-none hover:bg-[var(--c-hover)] transition-all select-none">
              <span className="text-2xl flex-shrink-0">{c.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--c-text)]">{c.titulo}</p>
                <p className="text-xs text-[var(--c-text3)] mt-0.5 line-clamp-1">{c.def}</p>
              </div>
              <span className="text-[var(--c-text4)] text-xs flex-shrink-0 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="px-5 pb-5 border-t border-[var(--c-border)] pt-4">
              <PanelDetalle c={c} mostrarHeader={false} />
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
