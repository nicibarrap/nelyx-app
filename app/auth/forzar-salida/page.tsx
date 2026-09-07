"use client"
import { useEffect } from "react"
import { signOut } from "next-auth/react"

export default function ForzarSalida() {
  useEffect(() => {
    signOut({ callbackUrl: "/auth/login", redirect: true })
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: "#030b1f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: "3px solid rgba(59,130,246,0.3)", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Cerrando sesión...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
