"use client"
import { useState } from "react"

// Encabezado de sección en Configuración: en celular y tablet es un
// acordeón (colapsada por defecto, salvo defaultOpen) para no obligar a
// hacer scroll por toda la información de golpe — en pc (lg:+, donde ya
// sobra espacio horizontal) el contenido queda siempre visible y el
// encabezado deja de ser clickeable, igual que antes.
export function SeccionColapsable({ icon, titulo, defaultOpen = false, children }: { icon: string; titulo: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-1 lg:pointer-events-none lg:cursor-default">
        <span className="text-[11px] font-semibold text-[var(--c-text4)] uppercase tracking-wider">{icon} {titulo}</span>
        <span className={`lg:hidden text-[var(--c-text4)] text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      <div className={`${open ? "block" : "hidden"} lg:block`}>
        {children}
      </div>
    </div>
  )
}
