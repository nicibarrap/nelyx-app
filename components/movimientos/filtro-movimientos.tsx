"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ETIQUETAS } from "@/lib/utils"

const TIPOS = ["VENTA", "GASTO", "COSTO_FIJO", "INGRESO_EXTRA", "DEVOLUCION", "RETIRO"]
const METODOS_PAGO = ["Efectivo", "Tarjeta", "Transferencia", "Débito", "Crédito", "Pendiente"]

const chip = (activo: boolean) =>
  `text-xs px-3 py-2 rounded-xl border font-medium transition-all whitespace-nowrap ${activo ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-[var(--c-card)] text-[var(--c-text2)] border-[var(--c-border)] hover:border-sky-500/20 hover:text-[var(--c-text)]"}`

export function FiltroMovimientos() {
  const router = useRouter()
  const params = useSearchParams()
  const tipo = params.get("tipo") ?? ""
  const metodoPago = params.get("metodoPago") ?? ""

  // Input local para que tipear se sienta instantáneo — el push al router
  // (y por lo tanto la consulta al servidor) se demora 400ms desde la
  // última tecla, así que no se dispara una navegación por cada letra.
  const [q, setQ] = useState(params.get("q") ?? "")
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function actualizar(cambios: Record<string, string>) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(cambios)) {
      if (v) next.set(k, v); else next.delete(k)
    }
    // Cualquier cambio de filtro vuelve a la página 1 — quedarse en la
    // página 4 al activar un filtro que deja solo 1 página es confuso.
    next.delete("page")
    router.push(`?${next.toString()}`)
  }

  function handleQChange(valor: string) {
    setQ(valor)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => actualizar({ q: valor }), 400)
  }

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  const hayFiltrosActivos = !!(q || tipo || metodoPago)

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">🔍</span>
        <input value={q} onChange={e => handleQChange(e.target.value)}
          placeholder="Buscar por producto, descripción o cliente..."
          className="w-full bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl pl-9 pr-4 h-10 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors" />
      </div>
      <select value={metodoPago} onChange={e => actualizar({ metodoPago: e.target.value })}
        className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text2)] outline-none focus:border-sky-500 transition-colors">
        <option value="">Todos los métodos</option>
        {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => actualizar({ tipo: "" })} className={chip(!tipo)}>Todos</button>
        {TIPOS.map(t => (
          <button key={t} onClick={() => actualizar({ tipo: tipo === t ? "" : t })} className={chip(tipo === t)}>
            {ETIQUETAS[t].emoji} {ETIQUETAS[t].label}
          </button>
        ))}
        {hayFiltrosActivos && (
          <button onClick={() => { setQ(""); actualizar({ q: "", tipo: "", metodoPago: "" }) }}
            className="text-xs px-3 py-2 rounded-xl border border-[var(--c-border)] text-[var(--c-text3)] hover:text-red-400 hover:border-red-500/20 transition-all">
            ✕ Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
