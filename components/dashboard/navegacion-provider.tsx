"use client"
import { createContext, useContext, useState, useCallback, useEffect, useTransition } from "react"
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
  const navegarA = useCallback((href: string) => { startTransition(() => { router.push(href) }) }, [router])
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
