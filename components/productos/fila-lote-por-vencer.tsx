interface Props {
  productoNombre: string
  cantidad: number
  fechaVencimiento: string
  diasRestantes: number
}

/**
 * Fila informativa de "Productos por vencer" — sin acción manual: el aviso
 * se resuelve solo apenas el lote se vende por completo (obtenerLotesPorVencer
 * deja de listarlo). No hay forma de ocultarlo a mano, para que nunca quede
 * una alerta real escondida por error.
 */
export function FilaLotePorVencer({ productoNombre, cantidad, fechaVencimiento, diasRestantes }: Props) {
  const urgente = diasRestantes <= 2
  const etiqueta = diasRestantes < 0 ? "Ya venció" : diasRestantes === 0 ? "Vence hoy" : diasRestantes === 1 ? "Vence mañana" : `Vence en ${diasRestantes} días`

  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center text-sm flex-shrink-0 ${urgente ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"}`}>🗓️</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--c-text)] truncate">{productoNombre}</p>
        <p className="text-xs text-[var(--c-text3)]">{cantidad} unidades · {new Date(fechaVencimiento).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</p>
      </div>
      <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold flex-shrink-0 ${urgente ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20"}`}>{etiqueta}</span>
    </div>
  )
}
