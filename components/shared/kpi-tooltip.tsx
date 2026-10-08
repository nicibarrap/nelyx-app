"use client"
import { useState, useRef, useCallback, useEffect } from "react"
import { Info } from "lucide-react"

const ANCHO_TOOLTIP = 224 // corresponde a w-56
const MARGEN_PANTALLA = 12 // separación mínima respecto al borde de la ventana

/**
 * Ícono "i" con una definición flotante — se usa junto a KPIs, encabezados
 * de gráficos, etc. en toda la app. Se mide a sí mismo al mostrarse y se
 * corre hacia el lado que haga falta si, centrado, se saldría de la
 * pantalla — así funciona igual de bien en la primera tarjeta de una fila,
 * en la última, o en cualquier tamaño de pantalla, sin necesitar saber de
 * antemano en qué columna de la grilla está. Se abre con hover (mouse) o
 * con un tap (pantallas táctiles, donde no existe hover) y se cierra solo
 * al sacar el mouse, tocar fuera, o perder el foco.
 */
export function InfoTooltip({ tip, className = "" }: { tip: string; className?: string }) {
  const [abierto, setAbierto] = useState(false)
  const [offsetX, setOffsetX] = useState(0)
  const wrapRef = useRef<HTMLSpanElement>(null)

  const ajustarPosicion = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const centro = rect.left + rect.width / 2
    const mitadTooltip = ANCHO_TOOLTIP / 2

    // El límite no es el borde de toda la ventana — el sidebar ocupa una
    // porción real a la izquierda, con más capa (z-index) por encima, así
    // que un tooltip "correctamente" posicionado según la ventana completa
    // puede terminar tapado detrás del sidebar. Se usa el <main> real
    // (el área de contenido, ya sin el sidebar) como límite verdadero.
    const areaContenido = el.closest("main")
    const limiteIzq = areaContenido ? areaContenido.getBoundingClientRect().left : 0
    const limiteDer = window.innerWidth

    let ajuste = 0
    const bordeIzquierdo = centro - mitadTooltip
    const bordeDerecho = centro + mitadTooltip
    if (bordeIzquierdo < limiteIzq + MARGEN_PANTALLA) {
      ajuste = (limiteIzq + MARGEN_PANTALLA) - bordeIzquierdo
    } else if (bordeDerecho > limiteDer - MARGEN_PANTALLA) {
      ajuste = (limiteDer - MARGEN_PANTALLA) - bordeDerecho
    }
    setOffsetX(ajuste)
  }, [])

  // En celular no hay "hover" real, así que el tap abre/cierra el tooltip —
  // y como ahí no existe un "mouse leave" que lo cierre solo, un toque o
  // click fuera del ícono lo cierra.
  useEffect(() => {
    if (!abierto) return
    function alTocarFuera(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("mousedown", alTocarFuera)
    document.addEventListener("touchstart", alTocarFuera)
    return () => {
      document.removeEventListener("mousedown", alTocarFuera)
      document.removeEventListener("touchstart", alTocarFuera)
    }
  }, [abierto])

  return (
    <span ref={wrapRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onMouseEnter={() => { ajustarPosicion(); setAbierto(true) }}
        onMouseLeave={() => setAbierto(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); ajustarPosicion(); setAbierto(s => !s) }}
        onKeyDown={(e) => { if (e.key === "Escape") setAbierto(false) }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        aria-label="Más información"
        className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[var(--c-text4)] hover:text-sky-400 hover:bg-sky-500/10 focus-visible:text-sky-400 focus-visible:bg-sky-500/10 outline-none transition-colors duration-150 cursor-help"
      >
        <Info className="w-full h-full" strokeWidth={2} />
      </button>
      <span
        role="tooltip"
        style={{ left: `calc(50% + ${offsetX}px)` }}
        className={`pointer-events-none absolute -translate-x-1/2 top-full mt-2 w-56 max-w-[calc(100vw-1.5rem)] bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-[11px] font-normal normal-case text-[var(--c-text2)] leading-relaxed z-30 shadow-2xl transition-opacity duration-150 ${abierto ? "opacity-100" : "opacity-0"}`}
      >
        {tip}
      </span>
    </span>
  )
}

/** Fila "ETIQUETA ⓘ" que usan las tarjetas de KPI — mismo InfoTooltip, con
 * la etiqueta en mayúsculas al lado. */
export function KpiTooltip({ label, tip }: { label: string; tip: string }) {
  return (
    <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider flex items-center gap-1.5">
      {label}
      <InfoTooltip tip={tip} />
    </p>
  )
}
