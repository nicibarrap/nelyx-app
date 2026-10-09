"use client"
import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { useLinkStatus } from "next/link"

type NavegacionCtx = { pendiente: boolean; setPendiente: (v: boolean) => void }
const Ctx = createContext<NavegacionCtx | null>(null)

// Guarda si hay una navegación entre módulos en curso — lo alimenta cada
// NavItem del Sidebar (vía useLinkStatus, por link) y lo consume el overlay
// del logo parpadeando en el área de contenido. Viven en componentes
// hermanos dentro del layout, por eso el estado se comparte acá en vez de
// pasarlo por props.
export function NavegacionProvider({ children }: { children: React.ReactNode }) {
  const [pendiente, setPendienteState] = useState(false)
  const setPendiente = useCallback((v: boolean) => setPendienteState(v), [])
  return <Ctx.Provider value={{ pendiente, setPendiente }}>{children}</Ctx.Provider>
}

export function useNavegacionPendiente() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useNavegacionPendiente debe usarse dentro de NavegacionProvider")
  return ctx
}

// Se coloca como hijo de cada <Link> del Sidebar. useLinkStatus() solo "ve"
// la navegación de SU PROPIO Link — por eso, aunque hay un NavItem por
// módulo, nunca se pisan entre sí: solo el que el usuario realmente tocó
// reporta pendiente=true.
export function SincronizarPendiente() {
  const { pending } = useLinkStatus()
  const { setPendiente } = useNavegacionPendiente()
  useEffect(() => { setPendiente(pending) }, [pending, setPendiente])
  return null
}
