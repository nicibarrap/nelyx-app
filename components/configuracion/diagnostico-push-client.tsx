"use client"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { asegurarSuscripcionPush, estadoActualPush } from "@/components/notificaciones/push-client"

const MOTIVO_LABEL: Record<string, string> = {
  sin_soporte: "Este navegador no soporta notificaciones push.",
  sin_permiso: "No has dado permiso de notificaciones en el navegador.",
  sin_vapid_key: "Falta configuración del servidor (clave pública). Contacta al soporte.",
  sw_no_listo: "El Service Worker no respondió a tiempo. Recarga la página e intenta de nuevo.",
  error_suscripcion: "El navegador rechazó la suscripción push.",
  error_guardado: "No se pudo guardar la suscripción en el servidor.",
}

export function DiagnosticoPushClient() {
  const [estado, setEstado] = useState<{ permiso: string; suscrito: boolean; swActivo: boolean } | null>(null)
  const [cargando, setCargando] = useState(false)

  async function refrescar() {
    const e = await estadoActualPush()
    setEstado(e)
  }

  useEffect(() => { refrescar() }, [])

  async function activar() {
    setCargando(true)
    try {
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission()
        if (perm !== "granted") { toast.error("Permiso denegado en el navegador."); return }
      }
      if (Notification.permission === "denied") {
        toast.error("Bloqueaste las notificaciones en este navegador. Debes habilitarlas manualmente desde el ícono 🔒 junto a la URL.")
        return
      }
      const r = await asegurarSuscripcionPush()
      if (r.ok === true) toast.success("Notificaciones activadas correctamente")
      else if (r.ok === false) toast.error(MOTIVO_LABEL[r.motivo] ?? "No se pudo activar")
    } finally {
      setCargando(false)
      refrescar()
    }
  }

  async function probar() {
    setCargando(true)
    try {
      const res = await fetch("/api/notificaciones/test", { method: "POST" })
      const data = await res.json()
      if (data.ok) toast.success(`Enviada a ${data.dispositivos} dispositivo(s). Debería llegar en segundos.`)
      else toast.error(data.error ?? "No se pudo enviar")
    } catch {
      toast.error("Error de red al enviar la prueba")
    } finally {
      setCargando(false)
    }
  }

  const permisoOk = estado?.permiso === "granted"
  const todoOk = permisoOk && estado?.suscrito && estado?.swActivo

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--c-border)]">
        <p className="text-sm font-bold text-[var(--c-text)]">Diagnóstico de notificaciones push</p>
        <p className="text-xs text-[var(--c-text3)] mt-0.5">Verifica que las notificaciones lleguen realmente a este dispositivo.</p>
      </div>
      <div className="px-5 py-4 space-y-2.5">
        {[
          ["Permiso del navegador", permisoOk, estado?.permiso ?? "…"],
          ["Service Worker activo", estado?.swActivo ?? false, estado?.swActivo ? "Activo" : "Inactivo"],
          ["Suscripción push guardada", estado?.suscrito ?? false, estado?.suscrito ? "Sí" : "No"],
        ].map(([label, ok, val]) => (
          <div key={label as string} className="flex items-center justify-between text-xs">
            <span className="text-[var(--c-text3)]">{label as string}</span>
            <span className={`font-semibold px-2 py-0.5 rounded-full ${ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {ok ? "✓ " : "✕ "}{val as string}
            </span>
          </div>
        ))}
      </div>
      <div className="px-5 py-3.5 border-t border-[var(--c-border2)] flex gap-2">
        <button onClick={activar} disabled={cargando}
          className="flex-1 h-9 text-xs bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-all disabled:opacity-50">
          {todoOk ? "Reactivar" : "Activar notificaciones"}
        </button>
        <button onClick={probar} disabled={cargando || !todoOk}
          className="flex-1 h-9 text-xs border border-[var(--c-border)] text-[var(--c-text2)] hover:bg-[var(--c-hover)] font-bold rounded-xl transition-all disabled:opacity-50">
          Enviar prueba
        </button>
      </div>
    </div>
  )
}
