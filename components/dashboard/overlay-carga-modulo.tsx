"use client"
import { useEffect, useRef, useState } from "react"
import { useNavegacionPendiente } from "./navegacion-provider"

type Rect = { top: number; left: number; width: number; height: number }

// Reemplaza al esqueleto gris que mostraba loading.tsx — ahora que las
// páginas de /dashboard ya no se transmiten por streaming (ver commit que
// quita loading.tsx), no hay nada que mostrar "mientras llega el HTML": la
// navegación completa recién se confirma cuando el módulo ya está listo.
// Este overlay cubre ese mismo instante, pero desde el navegador, con el
// mismo ícono X que ya se usa en el Sidebar colapsado (con sus dos
// variantes claro/oscuro, vía las clases .logo-dark/.logo-light).
//
// position: fixed (no absolute) a propósito — un overlay "absolute" dentro
// del contenedor de contenido queda anclado a SU scroll interno, así que si
// ese contenedor estaba scrolleado (p. ej. Alertas con varias tarjetas) el
// ícono aparecía desplazado según cuánto scroll tenía, distinto en cada
// módulo. "fixed" lo saca de ese flujo — se posiciona con top/left/width/
// height medidos en JS a partir de containerRef, así que queda inmune al
// scroll y, a la vez, acotado solo al área de contenido (sin tapar Sidebar
// ni Header) en vez de cubrir toda la pantalla.
//
// Sin containerRef (p. ej. en /admin, que no tiene Sidebar/Header propios)
// cubre toda la pantalla — ahí no hay nada que excluir.
export function OverlayCargaModulo({ containerRef }: { containerRef?: React.RefObject<HTMLElement | null> }) {
  const { pendiente } = useNavegacionPendiente()
  const [rect, setRect] = useState<Rect | null>(null)
  const ultimoRectRef = useRef<Rect | null>(null)

  useEffect(() => {
    const el = containerRef?.current
    if (!el) return
    const medir = () => {
      const r = el.getBoundingClientRect()
      const nuevo = { top: r.top, left: r.left, width: r.width, height: r.height }
      const anterior = ultimoRectRef.current
      // Evita un re-render en cada scroll/frame cuando en realidad no cambió nada.
      if (anterior && anterior.top === nuevo.top && anterior.left === nuevo.left && anterior.width === nuevo.width && anterior.height === nuevo.height) return
      ultimoRectRef.current = nuevo
      setRect(nuevo)
    }
    medir()
    const observer = new ResizeObserver(medir)
    observer.observe(el)
    window.addEventListener("resize", medir)
    return () => { observer.disconnect(); window.removeEventListener("resize", medir) }
  }, [containerRef])

  const estilo: React.CSSProperties = containerRef
    ? rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : { top: 0, left: 0, width: 0, height: 0 }
    : { inset: 0 }

  // Se mantiene siempre montado (solo cambia opacidad) en vez de
  // aparecer/desaparecer del DOM — así el navegador ya tiene los PNG del
  // logo en caché desde que se abre el dashboard, y no hay que esperar a
  // que carguen justo en el instante en que se necesitan (se nota sobre
  // todo con conexión lenta).
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={!pendiente}
      style={{ position: "fixed", ...estilo }}
      className={`z-40 flex items-center justify-center bg-[var(--c-bg)] transition-opacity duration-150 ${
        pendiente ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <img src="/icon-x.png" alt="" aria-hidden="true" className="logo-dark w-14 h-14 object-contain animate-pulse-soft" />
      <img src="/icon-x-light.png" alt="" aria-hidden="true" className="logo-light w-14 h-14 object-contain animate-pulse-soft" />
      <span className="sr-only">Cargando módulo…</span>
    </div>
  )
}
