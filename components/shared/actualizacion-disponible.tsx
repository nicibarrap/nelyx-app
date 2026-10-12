"use client"
import { useEffect, useRef, useState } from "react"

// Cada 10 minutos — ni tan seguido como para gastar red de alguien con
// la app abierta todo el día, ni tan poco como para que alguien se quede
// horas en una versión vieja sin saberlo.
const INTERVALO_MS = 10 * 60 * 1000

/**
 * Avisa (con un botón, no en silencio) cuando el servidor ya está
 * corriendo una versión distinta a la que esta pestaña tiene cargada —
 * por dos caminos:
 * 1. Sondeo de /api/build-id, comparado contra el build con el que se
 *    armó el bundle de esta pestaña (NEXT_PUBLIC_BUILD_ID) — al entrar,
 *    cada vez que la pestaña vuelve a primer plano (por si el deploy
 *    pasó mientras estaba en segundo plano) y cada 10 minutos mientras
 *    se queda abierta. `setInterval` por sí solo no alcanza: no dispara
 *    su primera revisión hasta que pasan los 10 minutos completos, así
 *    que alguien que mira la pestaña recién deployado no ve nada todavía.
 * 2. El layout despacha "nelyx:actualizacion-disponible" cuando detecta
 *    el patrón de error típico de un deploy nuevo (chunk/Server Action
 *    de la versión vieja que el servidor ya no reconoce) — antes esto
 *    recargaba la página sola, pudiendo perder un formulario a medio
 *    llenar; ahora solo lo ofrece, la persona decide cuándo.
 */
export function ActualizacionDisponible() {
  const [disponible, setDisponible] = useState(false)
  const yaAvisado = useRef(false)

  useEffect(() => {
    function avisar() {
      if (yaAvisado.current) return
      yaAvisado.current = true
      setDisponible(true)
    }

    window.addEventListener("nelyx:actualizacion-disponible", avisar)

    const buildIdActual = process.env.NEXT_PUBLIC_BUILD_ID
    async function revisar() {
      if (yaAvisado.current) return
      try {
        const res = await fetch("/api/build-id", { cache: "no-store" })
        const { buildId } = await res.json()
        if (buildId && buildIdActual && buildId !== buildIdActual) avisar()
      } catch {
        // Sin red en este momento puntual — no es señal de que haya una
        // versión nueva, se vuelve a intentar en el próximo ciclo.
      }
    }

    revisar()
    const intervalo = setInterval(revisar, INTERVALO_MS)
    function alVolverAPrimerPlano() {
      if (document.visibilityState === "visible") revisar()
    }
    document.addEventListener("visibilitychange", alVolverAPrimerPlano)

    return () => {
      window.removeEventListener("nelyx:actualizacion-disponible", avisar)
      document.removeEventListener("visibilitychange", alVolverAPrimerPlano)
      clearInterval(intervalo)
    }
  }, [])

  if (!disponible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto z-[100] animate-slide-right">
      <div className="flex items-center gap-3 bg-[var(--c-card)] border border-sky-500/30 shadow-xl shadow-black/20 rounded-2xl pl-4 pr-2 py-2">
        <span className="text-base flex-shrink-0">🚀</span>
        <p className="text-xs text-[var(--c-text2)] flex-1 sm:flex-initial sm:whitespace-nowrap">Hay una nueva versión disponible</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-8 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all flex-shrink-0"
        >
          Actualizar
        </button>
      </div>
    </div>
  )
}
