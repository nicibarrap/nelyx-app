"use client"
import { useState, useRef } from "react"

const ANCHO_TOOLTIP = 224 // corresponde a w-56
const MARGEN_PANTALLA = 12 // separación mínima respecto al borde de la ventana

/**
 * Igual que un tooltip centrado normal, pero se mide a sí mismo al abrirse
 * y se corre hacia el lado que haga falta si, centrado, se saldría de la
 * pantalla — así funciona igual de bien en la primera tarjeta de una fila,
 * en la última, o en cualquier tamaño de pantalla, sin necesitar saber de
 * antemano en qué columna de la grilla está.
 */
export function KpiTooltip({ label, tip }: { label: string; tip: string }) {
  const contenedorRef = useRef<HTMLParagraphElement>(null)
  const [offsetX, setOffsetX] = useState(0)

  function ajustarPosicion() {
    const el = contenedorRef.current
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
  }

  return (
    <p ref={contenedorRef} onMouseEnter={ajustarPosicion} onTouchStart={ajustarPosicion}
      className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider flex items-center gap-1 group relative">
      {label}
      <span className="text-[var(--c-text4)] normal-case font-normal cursor-help">ⓘ</span>
      <span
        style={{ left: `calc(50% + ${offsetX}px)` }}
        className="pointer-events-none absolute -translate-x-1/2 top-full mt-2 w-56 max-w-[calc(100vw-1.5rem)] bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-[11px] normal-case font-normal text-[var(--c-text2)] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-2xl">
        {tip}
      </span>
    </p>
  )
}
