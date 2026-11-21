"use client"
import { useState, useEffect } from "react"
import { obtenerLotesProductoAccion } from "@/app/actions/lotes-acciones"

type Lote = { numero: number; fechaVencimiento: string; cantidadRestante: number }

export function LotesProducto({ productoId, labelUnidad }: { productoId: string; labelUnidad: string }) {
  const [lotes, setLotes] = useState<Lote[] | null>(null)

  useEffect(() => {
    obtenerLotesProductoAccion(productoId).then(setLotes).catch(() => setLotes([]))
  }, [productoId])

  // Mientras carga, o si no hay ningún lote con vencimiento, no se muestra
  // nada — no todos los productos necesitan esto (detergente, pilas, etc.)
  if (!lotes || lotes.length === 0) return null

  return (
    <div className="px-5 pb-5 border-t border-[var(--c-border)] pt-4">
      <p className="text-xs font-semibold text-[var(--c-text)] mb-1 flex items-center gap-1.5">📦 Lotes con vencimiento</p>
      <p className="text-[10px] text-[var(--c-text4)] mb-3">El Lote 1 es el que se descuenta primero en cada venta — cuando se agota, el que sigue pasa a ser el 1 solo.</p>
      <div className="flex flex-col gap-2">
        {lotes.map(l => (
          <div key={l.fechaVencimiento} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${l.numero === 1 ? "bg-emerald-500/5 border-emerald-500/25" : "bg-[var(--c-card2)] border-[var(--c-border)]"}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${l.numero === 1 ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--c-hover)] text-[var(--c-text3)]"}`}>Lote {l.numero}</span>
              {l.numero === 1 && <span className="text-[9px] text-emerald-400 truncate">Se vende primero</span>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-[var(--c-text)]">{l.cantidadRestante} {labelUnidad}</p>
              <p className="text-[10px] text-[var(--c-text4)]">Vence {new Date(l.fechaVencimiento).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
