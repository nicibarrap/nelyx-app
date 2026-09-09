"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { descartarAvisoVencimiento } from "@/app/actions/kardex-acciones"

interface Props {
  movimientoStockId: string
  productoNombre: string
  cantidad: number
  fechaVencimiento: string
  diasRestantes: number
}

export function FilaLotePorVencer({ movimientoStockId, productoNombre, cantidad, fechaVencimiento, diasRestantes }: Props) {
  const [oculto, setOculto] = useState(false)
  const [isPending, start] = useTransition()

  if (oculto) return null

  const urgente = diasRestantes <= 2
  const etiqueta = diasRestantes < 0 ? "Ya venció" : diasRestantes === 0 ? "Vence hoy" : diasRestantes === 1 ? "Vence mañana" : `Vence en ${diasRestantes} días`

  function handle() {
    start(async () => {
      try {
        await descartarAvisoVencimiento(movimientoStockId)
        setOculto(true)
      } catch {
        toast.error("No se pudo marcar como resuelto")
      }
    })
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center text-sm flex-shrink-0 ${urgente ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"}`}>🗓️</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--c-text)] truncate">{productoNombre}</p>
        <p className="text-xs text-[var(--c-text3)]">{cantidad} unidades · {new Date(fechaVencimiento).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</p>
      </div>
      <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold flex-shrink-0 ${urgente ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20"}`}>{etiqueta}</span>
      <button onClick={handle} disabled={isPending}
        className="text-[10px] px-2 py-1 rounded-full bg-[var(--c-card2)] text-[var(--c-text3)] hover:text-emerald-400 hover:bg-emerald-500/10 border border-[var(--c-border)] font-semibold flex-shrink-0 transition-all disabled:opacity-50">
        ✓
      </button>
    </div>
  )
}
