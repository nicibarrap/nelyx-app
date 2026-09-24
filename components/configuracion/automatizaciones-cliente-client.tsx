"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { actualizarAutomatizacionesCliente } from "@/app/actions/automatizaciones-acciones"

const OPCIONES = [
  {
    key: "cobranza" as const,
    icono: "📧",
    label: "Recordatorios de cobranza por correo",
    descripcion: "Le envía un correo automático a tus clientes con saldo pendiente (2 días antes del vencimiento y luego cada cierto tiempo de atraso), usando tus plantillas de cobranza.",
  },
  {
    key: "cumpleanos" as const,
    icono: "🎂",
    label: "Saludo de cumpleaños por correo",
    descripcion: "Le envía un correo automático a un cliente el día de su cumpleaños (si le registraste la fecha y tiene correo).",
  },
]

export function AutomatizacionesClienteClient({ valores: valoresIniciales }: { valores: { cobranza: boolean; cumpleanos: boolean } }) {
  const [valores, setValores] = useState(valoresIniciales)
  const [pending, start] = useTransition()

  function toggle(key: "cobranza" | "cumpleanos") {
    const nuevo = !valores[key]
    setValores(prev => ({ ...prev, [key]: nuevo }))
    start(async () => {
      try {
        await actualizarAutomatizacionesCliente(key, nuevo)
        toast.success(nuevo ? "Automatización activada" : "Automatización desactivada")
      } catch (err: any) {
        setValores(prev => ({ ...prev, [key]: !nuevo }))
        toast.error(err?.message ?? "No se pudo guardar")
      }
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--c-border)]">
        <p className="text-sm font-bold text-[var(--c-text)]">Automatizaciones de clientes</p>
        <p className="text-xs text-[var(--c-text3)] mt-0.5">Apagadas por defecto — actívalas solo si quieres que la plataforma le escriba a tus clientes sin que tengas que hacerlo a mano.</p>
      </div>
      <div className="divide-y divide-[var(--c-border2)]">
        {OPCIONES.map(o => (
          <div key={o.key} className="flex items-start justify-between gap-3 px-5 py-3.5">
            <div className="flex items-start gap-3 min-w-0">
              <span className="text-base flex-shrink-0">{o.icono}</span>
              <div className="min-w-0">
                <p className="text-sm text-[var(--c-text2)] font-medium">{o.label}</p>
                <p className="text-[11px] text-[var(--c-text4)] mt-0.5">{o.descripcion}</p>
              </div>
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
