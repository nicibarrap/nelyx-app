"use client"
import { useEffect } from "react"
import { signOut } from "next-auth/react"

// El middleware solo redirige acá por un motivo: /api/check-session
// encontró que esta cuenta (o la cuenta dueña de la que depende, si es un
// empleado) ya no está activa — suspendida por un administrador, o
// desactivada por el dueño del negocio. Antes esta pantalla era un spinner
// genérico ("Cerrando sesión...") sin explicar nada, así que a la persona
// expulsada le quedaba la duda de si fue un error técnico o algo
// intencional. Un pequeño retraso a propósito (ver DEMORA_MS) para que el
// mensaje alcance a leerse antes de saltar al login — sin él, signOut()
// redirige casi al instante y el texto nunca llega a verse.
const DEMORA_MS = 2500

export default function ForzarSalida() {
  useEffect(() => {
    const t = setTimeout(() => {
      signOut({ callbackUrl: "/auth/login?motivo=sesion-cerrada", redirect: true })
    }, DEMORA_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: "#030b1f", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: 22 }}>
          🚫
        </div>
        <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Tu sesión fue cerrada</p>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.5 }}>
          Esta cuenta fue desactivada o suspendida. Si crees que es un error, contacta a soporte.
        </p>
        <div style={{ width: 28, height: 28, border: "3px solid rgba(59,130,246,0.3)", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "20px auto 0" }} />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
