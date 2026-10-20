"use client"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { formatCLP, formatFecha, ETIQUETAS } from "@/lib/utils"
import { eliminarMovimiento } from "@/app/actions/acciones"
import { getColorCategoria } from "@/lib/categorias"
import { getEmojiProducto } from "@/lib/emojis"
import { TZ_CHILE } from "@/lib/timezone"

// Mismos íconos que el selector de método de pago en Venta — así el
// mismo método se reconoce de un vistazo en ambas pantallas. "Débito" y
// "Crédito" ya no se generan para ventas nuevas (se fusionaron en
// "Tarjeta"), pero se mantienen acá para que las ventas antiguas sigan
// mostrando su ícono correcto.
const ICONO_METODO_PAGO: Record<string, string> = {
  "Efectivo": "💵", "Tarjeta": "💳", "Débito": "💳", "Crédito": "🏦", "Transferencia": "🏛️", "Pendiente": "📄",
}

export function TablaMovimientos({ movimientos }: { movimientos: any[] }) {
  const [isPending, startTransition] = useTransition()
  // La hora (a diferencia de la fecha) se muestra recién después de montar:
  // Node (servidor) y el navegador pueden traer datos de Intl ligeramente
  // distintos para el mismo locale/huso horario (p. ej. el espacio antes de
  // "a. m." difiere) — eso basta para que React marque un mismatch de
  // hidratación y descarte TODO el HTML del servidor, no solo esta hora.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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

  // Clave estable para agrupar por día — la fecha se guarda como medianoche
  // UTC de ese día (mismo criterio que formatFecha), así que tomar los
  // primeros 10 caracteres del ISO evita cualquier ambigüedad de huso horario.
  const claveDia = (fecha: string | Date) => new Date(fecha).toISOString().slice(0, 10)
  const labelDia = (fecha: string | Date) =>
    new Date(fecha).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

  return (
    <div>
      {movimientos.map((m, idx) => {
        const et = ETIQUETAS[m.tipo]
        const esIngreso = m.tipo === "VENTA" || m.tipo === "INGRESO_EXTRA"
        const colorCat = m.categoria ? getColorCategoria(m.categoria) : null
        const esNuevoDia = idx === 0 || claveDia(m.fecha) !== claveDia(movimientos[idx - 1].fecha)

        return (
          <div key={m.id}>
          {esNuevoDia && (
            <div className={`flex items-center gap-3 ${idx === 0 ? "pb-2" : "pt-5 pb-2"}`}>
              <span className="text-[11px] font-bold text-[var(--c-text3)] capitalize whitespace-nowrap">{labelDia(m.fecha)}</span>
              <div className="flex-1 h-px bg-[var(--c-border2)]" />
            </div>
          )}
          <div className={`flex items-center justify-between py-3 px-1 hover:bg-white/[0.02] rounded-lg transition-colors ${!esNuevoDia ? "border-t border-[#1A1A1A]" : ""}`}>
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
                  {m.metodoPago && <span className="text-[10px] text-[var(--c-text4)] truncate">{ICONO_METODO_PAGO[m.metodoPago] ?? "💳"} {m.metodoPago}</span>}
                </div>
                {m.descripcion && <p className="text-xs text-[var(--c-text3)] truncate mt-0.5">{m.descripcion}</p>}
                <p className="text-[10px] text-[var(--c-text4)] mt-0.5">
                  {formatFecha(m.fecha)}
                  {m.realizadoPorNombre && <span className="opacity-60"> · {m.realizadoPorNombre}</span>}
                  {mounted && m.createdAt && ` · ${new Date(m.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: TZ_CHILE })}`}
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
          </div>
        )
      })}
    </div>
  )
}
