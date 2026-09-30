"use client"
import { forwardRef, useImperativeHandle, useRef } from "react"

/** <input type="date"> que abre el calendario nativo al hacer clic en
 * cualquier parte del campo, no solo en el pequeño ícono de calendario —
 * en computador, ese ícono es fácil de fallar y sin esto había que apuntar
 * justo ahí. showPicker() solo existe en Chrome/Edge; en navegadores que no
 * lo implementan (Safari, Firefox) el intento se ignora en silencio y el
 * campo se comporta como un <input type="date"> normal, sin romper nada. */
export const CampoFecha = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function CampoFecha({ onClick, ...props }, forwardedRef) {
    const innerRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement)

    return (
      <input
        {...props}
        type="date"
        ref={innerRef}
        onClick={e => {
          onClick?.(e)
          try { (innerRef.current as any)?.showPicker?.() } catch {}
        }}
      />
    )
  }
)
