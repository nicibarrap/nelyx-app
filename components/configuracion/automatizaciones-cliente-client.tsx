"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { actualizarAutomatizacionCumpleanos } from "@/app/actions/automatizaciones-acciones"

type Valores = { cumpleanos: boolean }

export function AutomatizacionesClienteClient({ valores: valoresIniciales }: { valores: Valores }) {
  const [valores, setValores] = useState(valoresIniciales)
  const [pending, start] = useTransition()

  function toggle() {
    const nuevo = !valores.cumpleanos
    setValores({ cumpleanos: nuevo })
    start(async () => {
      try {
        await actualizarAutomatizacionCumpleanos(nuevo)
        toast.success(nuevo ? "Automatización activada" : "Automatización desactivada")
      } catch (err: any) {
        setValores({ cumpleanos: !nuevo })
        toast.error(err?.message ?? "No se pudo guardar")
      }
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--c-border)]">
        <p className="text-sm font-bold text-[var(--c-text)]">Automatizaciones de clientes</p>
        <p className="text-xs text-[var(--c-text3)] mt-0.5">Apagada por defecto — actívala si quieres que la app te avise para que saludes a tus clientes en su cumpleaños.</p>
      </div>
      <div className="flex items-start justify-between gap-3 px-5 py-3.5">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-base flex-shrink-0">🎂</span>
          <div className="min-w-0">
            <p className="text-sm text-[var(--c-text2)] font-medium">Avisarme el cumpleaños de un cliente</p>
            <p className="text-[11px] text-[var(--c-text4)] mt-0.5">Te notifica adentro de la app (y por push) el día del cumpleaños de un cliente, para que lo saludes tú mismo — Nelyx nunca le escribe directo al cliente.</p>
          </div>
        </div>
        <button onClick={toggle} disabled={pending}
          className={`w-10 h-6 rounded-full relative transition-all flex-shrink-0 disabled:opacity-50 ${valores.cumpleanos ? "bg-sky-500" : "bg-[var(--c-card2)] border border-[var(--c-border)]"}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${valores.cumpleanos ? "translate-x-4" : ""}`} />
        </button>
      </div>
    </div>
  )
}
