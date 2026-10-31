"use client"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

interface PanelLateralProps {
  abierto: boolean
  onClose: () => void
  children: React.ReactNode
}

// Ficha de detalle que se desliza desde la derecha y queda fija en el
// mismo lugar de la pantalla sin importar el scroll de la lista de atrás
// — reemplaza el patrón anterior de incrustar el detalle en el flujo
// normal de la página (arriba de la lista en Productos, abajo en
// Deudas), que obligaba a scrollear para encontrarlo según dónde se
// hubiera hecho click. En celular ocupa toda la pantalla (w-full): ahí
// "al lado" no tiene sentido, así que se comporta como una vista de
// detalle a pantalla completa, con el mismo botón de cerrar que ya trae
// cada ficha.
//
// Portal a document.body (mismo patrón que el modal de "Eliminar
// producto" en productos-client.tsx): position:fixed queda atrapado
// dentro de cualquier ancestro con transform si no se saca del árbol
// normal. montado evita el mismatch de SSR (document no existe en el
// servidor).
export function PanelLateral({ abierto, onClose, children }: PanelLateralProps) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])

  useEffect(() => {
    if (!abierto) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [abierto, onClose])

  if (!abierto || !montado) return null

  return createPortal(
    // z-[60]: por debajo de los modales que se abren DESDE adentro del
    // panel (confirmar eliminar producto, z-[70]; aviso de cambio de
    // costo, z-[80]; advertencia de pago en Deudas, z-[200]) — todos
    // deben quedar por encima del panel mismo, nunca tapados por él.
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:w-[460px] max-w-full bg-[var(--c-card)] sm:border-l border-[var(--c-border)] shadow-2xl overflow-y-auto animate-panel-in">
        {children}
      </div>
    </div>,
    document.body
  )
}
