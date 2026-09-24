"use client"
import { useEffect, useRef } from "react"
import { signOut } from "next-auth/react"
import { toast } from "sonner"

// Un mostrador físico con un empleado logueado por PIN, dejado sin
// atención, queda expuesto a que cualquiera use esa sesión — el dueño
// nunca queda afectado (solo se activa para esEmpleado), y el tiempo es
// deliberadamente generoso para no interrumpir una venta lenta o una
// pausa corta.
const INACTIVIDAD_MS = 10 * 60 * 1000
const AVISO_ANTES_MS = 60 * 1000

export function AutoLogoutEmpleado({ esEmpleado }: { esEmpleado?: boolean }) {
  const timerLogout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!esEmpleado) return

    function reiniciar() {
      if (timerLogout.current) clearTimeout(timerLogout.current)
      if (timerAviso.current) clearTimeout(timerAviso.current)
      timerAviso.current = setTimeout(() => {
        toast.warning("Tu sesión se cerrará en 1 minuto por inactividad", { duration: 10000 })
      }, INACTIVIDAD_MS - AVISO_ANTES_MS)
      timerLogout.current = setTimeout(() => {
        signOut({ callbackUrl: "/auth/login" })
      }, INACTIVIDAD_MS)
    }

    const eventos = ["mousedown", "keydown", "touchstart", "scroll"] as const
    eventos.forEach(e => window.addEventListener(e, reiniciar, { passive: true }))
    reiniciar()

    return () => {
      eventos.forEach(e => window.removeEventListener(e, reiniciar))
      if (timerLogout.current) clearTimeout(timerLogout.current)
      if (timerAviso.current) clearTimeout(timerAviso.current)
    }
  }, [esEmpleado])

  return null
}
