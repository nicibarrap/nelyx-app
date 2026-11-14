"use client"
import { createContext, useContext, useState, useCallback, useEffect, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { useLinkStatus } from "next/link"

type NavegacionCtx = { pendiente: boolean; setPendiente: (v: boolean) => void; navegarA: (href: string) => void }
const Ctx = createContext<NavegacionCtx | null>(null)

// Guarda si hay una navegación entre módulos en curso — lo consume el
// overlay del logo parpadeando en el área de contenido. Dos formas de
// alimentarlo, según quién dispara la navegación:
//
// 1) navegarA(href): la usa el Sidebar (riel y vista previa flotante). El
//    router.push vive ACÁ, en el Provider — que nunca se desmonta mientras
//    dura la navegación entre módulos del dashboard — en vez de en el
//    <Link> que el usuario tocó. Así, si ese <Link> específico desaparece
//    del DOM a mitad de la navegación (p. ej. al sacar el mouse de la
//    vista previa flotante del riel colapsado, que se cierra sola), el
//    isPending de este useTransition sigue reflejando la navegación real
//    hasta que termina — no se "corta" con el elemento que la disparó.
// 2) SincronizarPendiente, hijo de un <Link> normal fuera del Sidebar (p.
//    ej. "Volver al Dashboard" en /admin): ese Link nunca se desmonta a
//    mitad de camino, así que reportar su propio useLinkStatus() alcanza.
export function NavegacionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pendienteManual, setPendienteState] = useState(false)
  const [isPending, startTransition] = useTransition()
  const setPendiente = useCallback((v: boolean) => setPendienteState(v), [])
  // Identifica cuál es el click de navegación MÁS RECIENTE — si el usuario
  // toca dos módulos seguidos, solo el último debería poder activar el
  // respaldo de abajo; uno viejo que recién ahora "se vence" no debe forzar
  // una recarga hacia un destino que el usuario ya dejó atrás.
  const navegacionEnCurso = useRef(0)
  const navegarA = useCallback((href: string) => {
    const destino = new URL(href, window.location.origin).pathname
    if (destino === window.location.pathname) return
    const idEstaNavegacion = ++navegacionEnCurso.current
    startTransition(() => { router.push(href) })
    // Red de seguridad: router.push() dentro de un sidebar cuyo propio
    // Link recién apareció (un módulo que el dueño le acaba de dar a este
    // empleado) puede quedarse "pegado" — observado en vivo probando esto:
    // la URL nunca cambia y el overlay de carga queda dando vueltas para
    // siempre, sin que el usuario pueda hacer nada salvo recargar él
    // mismo. Si después de un tiempo razonable la URL sigue sin cambiar,
    // se fuerza una navegación dura — mismo motivo que AutoRevalidarPermisos
    // y que login-form.tsx ya usan para esto: cuando el router del cliente
    // no se puede confiar del todo, una navegación real del navegador
    // nunca se queda pegada a medio camino.
    setTimeout(() => {
      if (navegacionEnCurso.current === idEstaNavegacion && window.location.pathname !== destino) {
        window.location.href = href
      }
    }, 3000)
  }, [router])
  return <Ctx.Provider value={{ pendiente: isPending || pendienteManual, setPendiente, navegarA }}>{children}</Ctx.Provider>
}

export function useNavegacionPendiente() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useNavegacionPendiente debe usarse dentro de NavegacionProvider")
  return ctx
}

// Se coloca como hijo de un <Link> normal (fuera del Sidebar — ver nota
// arriba sobre navegarA). useLinkStatus() solo "ve" la navegación de SU
// PROPIO Link.
export function SincronizarPendiente() {
  const { pending } = useLinkStatus()
  const { setPendiente } = useNavegacionPendiente()
  useEffect(() => { setPendiente(pending) }, [pending, setPendiente])
  return null
}
