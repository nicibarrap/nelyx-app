"use client"
import { useTransition } from "react"
import { toast } from "sonner"
import { formatCLP, formatFecha, ETIQUETAS } from "@/lib/utils"
import { eliminarMovimiento } from "@/app/actions/acciones"
import { getColorCategoria } from "@/lib/categorias"
import { getEmojiProducto } from "@/lib/emojis"

export function TablaMovimientos({ movimientos }: { movimientos: any[] }) {
  const [isPending, startTransition] = useTransition()

  function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este movimiento?")) return
    startTransition(async () => {
      try { await eliminarMovimiento(id); toast.success("Eliminado") }
      catch { toast.error("No se pudo eliminar") }
    })
  }

  if (movimientos.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--c-text4)]">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-sm">Sin movimientos en este período</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#1A1A1A]">
      {movimientos.map((m) => {
        const et = ETIQUETAS[m.tipo]
        const esIngreso = m.tipo === "VENTA" || m.tipo === "INGRESO_EXTRA"
        const colorCat = m.categoria ? getColorCategoria(m.categoria) : null

        return (
          <div key={m.id} className="flex items-center justify-between py-3 px-1 hover:bg-white/[0.02] rounded-lg transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl flex-shrink-0">{et.emoji}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${et.color}`}>{et.label}</span>
                  {m.categoria && !m.producto && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium"
                      style={{ color: colorCat!, borderColor: `${colorCat}30`, backgroundColor: `${colorCat}10` }}>
                      {m.categoria}
                    </span>
                  )}
                  {m.producto && <span className="text-[10px] text-[var(--c-text3)] truncate">{getEmojiProducto(m.producto.nombre)} {m.producto.nombre}</span>}
                  {m.cliente && <span className="text-[10px] text-sky-400/80 truncate">👤 {m.cliente.nombre} {m.cliente.apellido ?? ""}</span>}
                </div>
                {m.descripcion && <p className="text-xs text-[var(--c-text3)] truncate mt-0.5">{m.descripcion}</p>}
                <p className="text-[10px] text-[var(--c-text4)] mt-0.5">
                  {formatFecha(m.fecha)}
                  {m.createdAt && ` · ${new Date(m.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <div className="text-right">
                <span className={`text-base font-bold ${esIngreso ? "text-green-400" : "text-red-400"}`}>
                  {esIngreso ? "+" : "−"}{formatCLP(Number(m.monto))}
                </span>
                {m.tipo === "VENTA" && m.utilidad != null && (
                  <p className={`text-[10px] font-semibold ${Number(m.utilidad) >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                    {Number(m.utilidad) >= 0 ? "+" : ""}{formatCLP(Number(m.utilidad))} util. {m.margen != null ? `(${Number(m.margen).toFixed(0)}%)` : ""}
                  </p>
                )}
                <p className={`text-[9px] font-medium mt-0.5 ${esIngreso ? "text-emerald-400/60" : "text-[var(--c-text4)]"}`}>{esIngreso ? "Pagado" : "Registrado"}</p>
              </div>
              <button onClick={() => handleEliminar(m.id)} disabled={isPending}
                className="p-1.5 text-zinc-700 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors">🗑</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
