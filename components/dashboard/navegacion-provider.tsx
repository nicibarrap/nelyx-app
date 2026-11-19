"use client"
import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { useLinkStatus } from "next/link"

type NavegacionCtx = { pendiente: boolean; setPendiente: (v: boolean) => void; navegarA: (href: string) => void }
const Ctx = createContext<NavegacionCtx | null>(null)

// navegarA(href) — la usa el Sidebar (riel y vista previa flotante) para
// cambiar de módulo. Hace una navegación DURA de verdad (window.location),
// no router.push(): se probó router.push() (navegación "suave" de Next)
// envuelto en startTransition con un respaldo de recarga dura a los 3
// segundos si se quedaba pegado, pero el síntoma real que seguía
// reportando el dueño no era quedarse pegado — era directamente mostrar
// "no tienes acceso" a un módulo recién otorgado, sin que ningún respaldo
// basado en tiempo pudiera distinguir eso de un rechazo legítimo. Tres
// veces seguidas encontramos una variante nueva del mismo problema de
// fondo: el router del lado del cliente de Next.js (su caché de
// navegación, su prefetch automático) puede quedar desincronizado
// respecto al middleware server-side en el instante justo en que el
// dueño cambia los permisos de un empleado ya conectado. La única forma
// de que esto deje de pasar DE VERDAD, para cualquier módulo, es que cada
// cambio de módulo dispare una navegación real del navegador — nunca
// router.push() — así el middleware se vuelve a consultar desde cero,
// sin ninguna caché del cliente de por medio, exactamente igual que un
// F5. Mismo motivo por el que login-form.tsx ya hace esto para entrar al
// dashboard (ver su comentario). El costo es perder la transición
// instantánea tipo SPA entre módulos — se acepta a propósito, porque acá
// "más rápido" nunca debería ganarle a "siempre correcto".
export function NavegacionProvider({ children }: { children: React.ReactNode }) {
  const [pendienteManual, setPendienteState] = useState(false)
  const setPendiente = useCallback((v: boolean) => setPendienteState(v), [])
  const navegarA = useCallback((href: string) => {
    const destino = new URL(href, window.location.origin).pathname
    if (destino === window.location.pathname) return
    // setPendiente(true) antes de cambiar window.location — sin esto,
    // OverlayCargaModulo (pensado justo para cubrir este instante, ver su
    // propio comentario) nunca llegaba a mostrarse en un click del Sidebar:
    // nada lo activaba. En conexión rápida no se notaba (la navegación dura
    // terminaba casi al instante), pero en una conexión lenta la pantalla
    // quedaba en blanco — sin overlay, sin esqueleto de carga (loading.tsx
    // ya no existe, ver comentario de OverlayCargaModulo) — hasta que
    // terminara de llegar la página completa.
    setPendienteState(true)
    window.location.href = href
  }, [])
  return <Ctx.Provider value={{ pendiente: pendienteManual, setPendiente, navegarA }}>{children}</Ctx.Provider>
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
