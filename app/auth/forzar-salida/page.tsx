"use client"
import { useEffect } from "react"
import { signOut } from "next-auth/react"

// El middleware solo redirige acá por un motivo: /api/check-session
// encontró que esta cuenta (o la cuenta dueña de la que depende, si es un
// empleado) ya no está activa — suspendida por un administrador, o
// desactivada por el dueño del negocio. Mismo ícono X que ya se usa en el
// Sidebar colapsado y en el overlay de carga entre módulos
// (OverlayCargaModulo) — así la persona expulsada reconoce de inmediato
// que es la plataforma la que la está sacando, a propósito, no un error.
// Un pequeño retraso intencional (DEMORA_MS) para que la pantalla alcance
// a verse antes de saltar al login — sin él, signOut() redirige casi al
// instante y nunca llega a notarse.
const DEMORA_MS = 2200

export default function ForzarSalida() {
  useEffect(() => {
    const t = setTimeout(() => {
      signOut({ callbackUrl: "/auth/login?motivo=sesion-cerrada", redirect: true })
    }, DEMORA_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[var(--c-bg)] px-6 text-center">
      <img src="/icon-x.png" alt="Nelyx" className="logo-dark w-24 h-24 object-contain animate-pulse-soft" />
      <img src="/icon-x-light.png" alt="Nelyx" className="logo-light w-24 h-24 object-contain animate-pulse-soft" />
      <div className="max-w-xs">
        <p className="text-[var(--c-text)] text-base font-bold mb-2">Tu sesión fue cerrada</p>
        <p className="text-[var(--c-text3)] text-sm leading-relaxed">
          Esta cuenta fue desactivada o suspendida. Si crees que es un error, contacta a soporte.
        </p>
      </div>
    </div>
  )
}
