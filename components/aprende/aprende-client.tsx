"use client"
import { useState } from "react"
import { CONCEPTOS_APRENDE, CATEGORIAS_APRENDE } from "@/lib/conceptos-aprende"

type Concepto = typeof CONCEPTOS_APRENDE[number]

const MODULO_RELACIONADO: Record<string, { label: string; href: string }> = {
  "Ingresos": { label: "Movimientos", href: "/dashboard/movimientos" },
  "Gastos": { label: "Movimientos", href: "/dashboard/movimientos" },
  "Costos Fijos": { label: "Costos fijos", href: "/dashboard/costos-fijos" },
  "Utilidad Neta": { label: "Resumen", href: "/dashboard/resumen" },
  "Flujo de Caja": { label: "Resumen", href: "/dashboard/resumen" },
  "Margen de Ganancia": { label: "Reportes", href: "/dashboard/reportes" },
  "Punto de Equilibrio": { label: "Costos fijos", href: "/dashboard/costos-fijos" },
  "Inventario": { label: "Productos", href: "/dashboard/productos" },
  "Deudas": { label: "Deudas", href: "/dashboard/deudas" },
  "Retiro": { label: "Movimientos", href: "/dashboard/movimientos" },
  "Ingreso Extra": { label: "Movimientos", href: "/dashboard/movimientos" },
  "Disponible": { label: "Resumen", href: "/dashboard/resumen" },
  "Ticket Promedio": { label: "Reportes", href: "/dashboard/reportes" },
  "Código de Barras": { label: "Productos", href: "/dashboard/productos" },
  "Lotes y Fecha de Vencimiento": { label: "Productos", href: "/dashboard/productos" },
  "Cuentas por Cobrar": { label: "Cuentas por cobrar", href: "/dashboard/cuentas-cobrar" },
  "Centro de Cobranza": { label: "Cuentas por cobrar", href: "/dashboard/cuentas-cobrar" },
  "Segmentación de Clientes": { label: "Clientes", href: "/dashboard/clientes" },
  "Límite de Crédito Sugerido": { label: "Clientes", href: "/dashboard/clientes" },
  "Liquidez Proyectada": { label: "Resumen", href: "/dashboard/resumen" },
  "Costo Promedio Ponderado": { label: "Productos", href: "/dashboard/productos" },
  "Venta por Peso": { label: "Venta", href: "/dashboard/venta" },
}

// Agrupa la lista plana en el orden de CATEGORIAS_APRENDE — el array ya
// está ordenado por categoría, así que esto solo junta consecutivos.
function agruparPorCategoria(conceptos: readonly Concepto[]) {
  return CATEGORIAS_APRENDE.map(categoria => ({
    categoria,
    items: conceptos.filter(c => c.categoria === categoria),
  })).filter(g => g.items.length > 0)
}

const ETIQUETA_SECCION = "text-xs font-bold uppercase tracking-wider mb-1.5"
const TEXTO_CUERPO = "text-sm text-[var(--c-text2)] leading-relaxed"

function Seccion({ label, icon, color, bg, border, children, mono = false }: { label: string; icon: string; color: string; bg: string; border: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className={`${bg} border ${border} rounded-xl p-3.5`}>
      <p className={`${ETIQUETA_SECCION} ${color}`}>{icon} {label}</p>
      <p className={`${TEXTO_CUERPO} ${mono ? "font-mono" : ""}`}>{children}</p>
    </div>
  )
}

function PanelDetalle({ c, mostrarHeader = true, anterior, siguiente, onIr }: {
  c: Concepto
  mostrarHeader?: boolean
  anterior?: Concepto | null
  siguiente?: Concepto | null
  onIr?: (titulo: string) => void
}) {
  return (
    <div className="space-y-3">
      {mostrarHeader && (
        <div className="flex items-center gap-3 pb-4 border-b border-[var(--c-border)]">
          <span className="text-3xl flex-shrink-0">{c.emoji}</span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-text4)]">{c.categoria}</p>
            <h2 className="text-lg font-bold text-[var(--c-text)] truncate">{c.titulo}</h2>
          </div>
        </div>
      )}

      <div>
        <p className={`${ETIQUETA_SECCION} text-sky-400`}>📖 Definición</p>
        <p className={`${TEXTO_CUERPO} text-[var(--c-text)]`}>{c.def}</p>
      </div>

      <Seccion label="Cómo se calcula" icon="🧮" color="text-violet-400" bg="bg-violet-500/5" border="border-violet-500/15" mono>{c.calculo}</Seccion>
      <Seccion label="Ejemplo real" icon="📌" color="text-emerald-400" bg="bg-emerald-500/5" border="border-emerald-500/15">{c.ejemplo}</Seccion>
      <Seccion label="Consejo práctico" icon="💡" color="text-sky-400" bg="bg-sky-500/5" border="border-sky-500/15">{c.consejo}</Seccion>
      <Seccion label="Error común" icon="⚠️" color="text-red-400" bg="bg-red-500/5" border="border-red-500/15">{c.error}</Seccion>
      <Seccion label="Impacto en tu negocio" icon="🎯" color="text-violet-400" bg="bg-violet-500/5" border="border-violet-500/15">{c.impacto}</Seccion>

      {MODULO_RELACIONADO[c.titulo] && (
        <a href={MODULO_RELACIONADO[c.titulo].href}
          className="flex items-center justify-center gap-2 h-11 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all mt-2">
          Ir a {MODULO_RELACIONADO[c.titulo].label} →
        </a>
      )}

      {onIr && (anterior || siguiente) && (
        <div className="flex items-stretch gap-2 pt-3 mt-3 border-t border-[var(--c-border)]">
          <button type="button" disabled={!anterior} onClick={() => anterior && onIr(anterior.titulo)}
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] text-left disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--c-hover)] transition-all min-w-0">
            <span className="text-[var(--c-text4)] text-xs flex-shrink-0">←</span>
            <span className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-[var(--c-text4)]">Anterior</span>
              <span className="block text-xs font-semibold text-[var(--c-text2)] truncate">{anterior?.titulo ?? "—"}</span>
            </span>
          </button>
          <button type="button" disabled={!siguiente} onClick={() => siguiente && onIr(siguiente.titulo)}
            className="flex-1 flex items-center justify-end gap-2 px-3 py-2.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] text-right disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--c-hover)] transition-all min-w-0">
            <span className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-[var(--c-text4)]">Siguiente</span>
              <span className="block text-xs font-semibold text-[var(--c-text2)] truncate">{siguiente?.titulo ?? "—"}</span>
            </span>
            <span className="text-[var(--c-text4)] text-xs flex-shrink-0">→</span>
          </button>
        </div>
      )}
    </div>
  )
}

export function AprendeClient() {
  const [seleccionado, setSeleccionado] = useState<string>(CONCEPTOS_APRENDE[0].titulo)
  const indiceActivo = CONCEPTOS_APRENDE.findIndex(c => c.titulo === seleccionado)
  const conceptoActivo = CONCEPTOS_APRENDE[indiceActivo]
  const anterior = indiceActivo > 0 ? CONCEPTOS_APRENDE[indiceActivo - 1] : null
  const siguiente = indiceActivo < CONCEPTOS_APRENDE.length - 1 ? CONCEPTOS_APRENDE[indiceActivo + 1] : null
  const grupos = agruparPorCategoria(CONCEPTOS_APRENDE)

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
        <p className="text-sm text-[var(--c-text2)] leading-relaxed">
          No necesitas ser contador para entender tus números. Con conceptos simples puedes tomar mejores decisiones, evitar problemas y hacer crecer tu negocio.
        </p>
      </div>

      {/* ══════════════════════════════════════════
          DESKTOP (lg+): maestro-detalle — lista agrupada por capítulo a
          la izquierda, panel fijo a la derecha que cambia de contenido
          sin mover nada del layout ni obligar a scrollear la página.
      ══════════════════════════════════════════ */}
      <div className="hidden lg:grid grid-cols-[320px_1fr] gap-5 items-start">
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden sticky top-4 max-h-[calc(100vh-160px)] overflow-y-auto">
          {grupos.map(g => (
            <div key={g.categoria}>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--c-text4)] px-4 pt-3.5 pb-1.5 bg-[var(--c-card2)]">{g.categoria}</p>
              {g.items.map(c => {
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
          ))}
        </div>

        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6">
          <PanelDetalle c={conceptoActivo} anterior={anterior} siguiente={siguiente} onIr={setSeleccionado} />
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MOBILE/TABLET: acordeón agrupado por capítulo, mismo orden y
          mismos textos que la vista de escritorio.
      ══════════════════════════════════════════ */}
      <div className="lg:hidden space-y-5">
        {grupos.map(g => (
          <div key={g.categoria} className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--c-text4)] px-1">{g.categoria}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {g.items.map(c => (
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
        ))}
      </div>
    </div>
  )
}
