"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { actualizarConfigNotificaciones } from "@/app/actions/notificaciones-acciones"

const OPCIONES: { key: string; label: string; icono: string }[] = [
  { key: "calendario",       label: "Calendario",                  icono: "📅" },
  { key: "tareas",           label: "Tareas",                      icono: "✅" },
  { key: "deudas",           label: "Deudas",                      icono: "🏦" },
  { key: "costosFijos",      label: "Costos fijos",                icono: "🏠" },
  { key: "cuentasCobrar",    label: "Cuentas por cobrar",           icono: "👤" },
  { key: "clientes",         label: "Clientes",                    icono: "🧑‍🤝‍🧑" },
  { key: "inventario",       label: "Inventario",                  icono: "📦" },
  { key: "reportes",         label: "Reportes",                    icono: "📊" },
  { key: "renovaciones",     label: "Renovaciones de suscripción", icono: "🔄" },
  { key: "alertasGenerales", label: "Alertas generales",           icono: "🔔" },
]

type Cfg = Record<string, boolean>

export function ConfigNotificacionesClient({ cfg }: { cfg: Cfg }) {
  const [valores, setValores] = useState<Cfg>(cfg)
  const [pending, start] = useTransition()

  function toggle(key: string) {
    const nuevo = { ...valores, [key]: !valores[key] }
    setValores(nuevo)
    start(async () => {
      const fd = new FormData()
      for (const o of OPCIONES) fd.set(o.key, nuevo[o.key] ? "on" : "off")
      await actualizarConfigNotificaciones(fd)
      toast.success("Preferencias guardadas")
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--c-border)]">
        <p className="text-sm font-bold text-[var(--c-text)]">Notificaciones</p>
        <p className="text-xs text-[var(--c-text3)] mt-0.5">Elige qué tipo de avisos quieres recibir, dentro de la app y como notificación push.</p>
      </div>
      <div className="divide-y divide-[var(--c-border2)]">
        {OPCIONES.map(o => (
          <div key={o.key} className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="text-base">{o.icono}</span>
              <span className="text-sm text-[var(--c-text2)] font-medium">{o.label}</span>
            </div>
            <button onClick={() => toggle(o.key)} disabled={pending}
              className={`w-10 h-6 rounded-full relative transition-all flex-shrink-0 disabled:opacity-50 ${valores[o.key] ? "bg-sky-500" : "bg-[var(--c-card2)] border border-[var(--c-border)]"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${valores[o.key] ? "translate-x-4" : ""}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
