"use client"
import { useEffect, useState, type ReactNode } from "react"
import { SeccionColapsable } from "./seccion-colapsable"

export interface SeccionConfig { id: string; icon: string; titulo: string; content: ReactNode }

// En celular/tablet se deja igual que siempre: acordeón apilado, una
// columna, nada más que tocar. En escritorio (lg+) se arma el patrón de
// menú lateral + panel — mismo estilo de ítem activo que el Sidebar
// principal — mostrando solo la sección elegida, en vez de forzar scroll
// por todas de una.
//
// Un solo layout montado a la vez (nunca los dos a la vez con uno oculto
// por CSS): cada sección trae componentes con su propio estado (toggles,
// formularios de conexión de pago, etc.) y montarlos duplicados —uno
// visible, uno escondido— generaría dos instancias independientes de ese
// estado y IDs repetidos en el DOM. Por eso la detección de escritorio
// pasa por matchMedia en un efecto: el primer render (servidor y cliente,
// antes de montar) siempre asume celular, así la primera pintada nunca
// desentona con lo que mandó el servidor.
export function ConfiguracionLayout({ secciones }: { secciones: SeccionConfig[] }) {
  const [activaId, setActivaId] = useState(secciones[0].id)
  const [esEscritorio, setEsEscritorio] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    setEsEscritorio(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setEsEscritorio(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  if (!esEscritorio) {
    return (
      <div className="space-y-5">
        {secciones.map((s, i) => (
          <SeccionColapsable key={s.id} icon={s.icon} titulo={s.titulo} defaultOpen={i === 0}>
            {s.content}
          </SeccionColapsable>
        ))}
      </div>
    )
  }

  const seccionActiva = secciones.find(s => s.id === activaId) ?? secciones[0]
  return (
    <div className="flex items-start gap-6">
      <nav className="w-60 flex-shrink-0 sticky top-0 space-y-1">
        {secciones.map(s => {
          const activa = s.id === seccionActiva.id
          return (
            <button key={s.id} type="button" onClick={() => setActivaId(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all ${
                activa
                  ? "bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm"
                  : "text-[var(--c-text2)] border border-transparent hover:text-[var(--c-text)] hover:bg-[var(--c-card2)]"
              }`}>
              <span className="text-base w-5 text-center flex-shrink-0">{s.icon}</span>
              <span className="truncate">{s.titulo}</span>
            </button>
          )
        })}
      </nav>
      <div className="flex-1 min-w-0">
        {seccionActiva.content}
      </div>
    </div>
  )
}
