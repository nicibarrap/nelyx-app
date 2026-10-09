"use client"
import { useNavegacionPendiente } from "./navegacion-provider"

// Reemplaza al esqueleto gris que mostraba loading.tsx — ahora que las
// páginas de /dashboard ya no se transmiten por streaming (ver commit que
// quita loading.tsx), no hay nada que mostrar "mientras llega el HTML": la
// navegación completa recién se confirma cuando el módulo ya está listo.
// Este overlay cubre ese mismo instante, pero desde el navegador, con el
// mismo ícono X que ya se usa en el Sidebar colapsado (con sus dos
// variantes claro/oscuro, vía las clases .logo-dark/.logo-light).
//
// position: fixed (no absolute) a propósito — un overlay "absolute" queda
// anclado al contenido de la página anterior, así que si esa página estaba
// scrolleada (p. ej. Alertas con varias tarjetas) el ícono aparecía
// desplazado hacia donde estuviera ese scroll, distinto en cada módulo.
// "fixed" lo ancla al viewport real, siempre centrado sin importar cuánto
// scroll tenía la página que se está dejando. Fondo sólido (sin blur ni
// contenido de la página anterior asomando detrás) para una transición más
// limpia — cubre toda la pantalla (incluido el Sidebar) a propósito: es más
// prolijo que calcular en JS dónde termina el Sidebar para "recortar" el
// overlay justo ahí.
export function OverlayCargaModulo() {
  const { pendiente } = useNavegacionPendiente()

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
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--c-bg)] transition-opacity duration-150 ${
        pendiente ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <img src="/icon-x.png" alt="" aria-hidden="true" className="logo-dark w-16 h-16 object-contain animate-pulse-soft" />
      <img src="/icon-x-light.png" alt="" aria-hidden="true" className="logo-light w-16 h-16 object-contain animate-pulse-soft" />
      <span className="sr-only">Cargando módulo…</span>
    </div>
  )
}
