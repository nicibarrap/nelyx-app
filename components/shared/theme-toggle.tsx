"use client"
import { useEffect, useState } from "react"

/**
 * Interruptor de modo claro/oscuro — oscuro sigue siendo el que se ve por
 * defecto al entrar; este botón deja pasar al claro como variante opcional,
 * guardando la preferencia para que no se pierda entre sesiones.
 */
export function ThemeToggle() {
  const [esClaro, setEsClaro] = useState(false)

  useEffect(() => {
    setEsClaro(document.documentElement.classList.contains("light"))
  }, [])

  function toggle() {
    const nuevoEsClaro = !esClaro
    document.documentElement.classList.toggle("light", nuevoEsClaro)
    localStorage.setItem("nelyx-theme", nuevoEsClaro ? "light" : "dark")
    setEsClaro(nuevoEsClaro)
  }

  return (
    <button onClick={toggle} title={esClaro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className="w-9 h-9 rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] hover:bg-[var(--c-hover)] flex items-center justify-center text-base transition-all flex-shrink-0">
      {esClaro ? "🌙" : "☀️"}
    </button>
  )
}
