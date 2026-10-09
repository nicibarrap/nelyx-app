"use client"
import { useRef } from "react"
import { OverlayCargaModulo } from "./overlay-carga-modulo"

// Dueño del <main> y de su ref — el overlay de carga necesita medir
// exactamente dónde está y qué tamaño tiene esta caja (sin contar Sidebar
// ni Header) para poder cubrir solo esa zona. Van juntos en un solo
// componente cliente porque el layout del dashboard es un Server
// Component y no puede usar useRef directamente.
export function ContenidoDashboard({ children }: { children: React.ReactNode }) {
  const mainRef = useRef<HTMLElement>(null)
  return (
    <>
      {/* pt-16 hasta md: espacio para el ☰ fijo del sidebar, que a partir
          de md ya no existe (sidebar siempre visible) — mismo breakpoint
          que el sidebar y el saludo del header. */}
      <main ref={mainRef} className="flex-1 p-4 lg:p-5 overflow-y-auto overflow-x-hidden pt-16 md:pt-4">
        {children}
      </main>
      <OverlayCargaModulo containerRef={mainRef} />
    </>
  )
}
