"use client"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { marcarPermisoDecidido } from "@/app/actions/notificaciones-acciones"
import { asegurarSuscripcionPush } from "@/components/notificaciones/push-client"

/** Modal que pide permiso de notificaciones la primera vez que el usuario entra. */
export function PermisoNotificacionesModal({ yaPedido }: { yaPedido: boolean }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (yaPedido) return
    if (typeof Notification === "undefined") return
    if (Notification.permission !== "default") return
    const t = setTimeout(() => setShow(true), 1500)
    return () => clearTimeout(t)
  }, [yaPedido])

  async function permitir() {
    setShow(false)
    try {
      const perm = await Notification.requestPermission()
      if (perm === "granted") {
        const resultado = await asegurarSuscripcionPush()
        if (resultado.ok === false) {
          // No lo escondemos: si falla, lo dejamos visible en Configuración
          // para reintentar, en vez de perderlo en silencio para siempre.
          console.warn("[push] No se pudo completar la suscripción:", resultado.motivo, resultado.detalle)
          toast.error("No pudimos activar las notificaciones. Puedes reintentar en Configuración.")
        }
      }
    } finally {
      await marcarPermisoDecidido()
    }
  }

  async function ahoraNo() {
    setShow(false)
    await marcarPermisoDecidido()
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6 w-full max-w-sm text-center animate-scale-in">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-2xl mb-4">🔔</div>
        <p className="text-sm font-bold text-[var(--c-text)] mb-2">¿Deseas recibir recordatorios importantes de tu negocio?</p>
        <p className="text-xs text-[var(--c-text3)] mb-5 leading-relaxed">Te avisaremos de pagos, deudas, tareas y vencimientos incluso cuando no tengas la app abierta.</p>
        <div className="flex gap-2">
          <button onClick={ahoraNo} className="flex-1 h-10 text-sm border border-[var(--c-border)] rounded-xl text-[var(--c-text3)] hover:bg-[var(--c-hover)] transition-all">Ahora no</button>
          <button onClick={permitir} className="flex-1 h-10 text-sm bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-all">Permitir</button>
        </div>
      </div>
    </div>
  )
}
