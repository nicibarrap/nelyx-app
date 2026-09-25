"use client"
import { useState } from "react"

// Encabezado de sección en Configuración: acordeón (colapsada por
// defecto, salvo defaultOpen) para no obligar a hacer scroll por toda la
// información de golpe. Antes esto solo pasaba en celular/tablet — en pc
// todo quedaba forzado a expandido, lo que con varias secciones (algunas
// cortas, otras largas) dejaba columnas muy desparejas y una sensación de
// desorden. Ahora se comporta igual en todos los tamaños de pantalla.
export function SeccionColapsable({ icon, titulo, defaultOpen = false, children }: { icon: string; titulo: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-semibold text-[var(--c-text4)] uppercase tracking-wider">{icon} {titulo}</span>
        <span className={`text-[var(--c-text4)] text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && children}
    </div>
  )
}
