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
    // flex-col hasta lg (no sm): en tablet vertical hay ancho de sobra para
    // que cada fila (buscador, método, chips) se vea ordenada en columna,
    // pero no el suficiente para que las 8 opciones de tipo quepan al lado
    // del buscador sin envolver en una torre angosta — eso es justo lo que
    // pasaba con el corte en sm. Desde lg (tablet horizontal y PC) sí hay
    // espacio real para la fila completa.
    <div className="flex flex-col lg:flex-row gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">🔍</span>
        <input value={q} onChange={e => handleQChange(e.target.value)}
          placeholder="Buscar por producto, descripción o cliente..."
          className="w-full bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl pl-9 pr-4 h-10 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors" />
      </div>
      <select value={metodoPago} onChange={e => actualizar({ metodoPago: e.target.value })}
        className="w-full lg:w-auto bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text2)] outline-none focus:border-sky-500 transition-colors">
        <option value="">Todos los métodos</option>
        {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      {/* En celular, los chips van en una tira con scroll horizontal en vez
          de envolver en varias filas — con 6 tipos + "Todos" + "Limpiar",
          envolver ocupa demasiado alto y empuja la tabla hacia abajo. Desde
          sm hay más ancho disponible, así que ahí sí se envuelven como
          siempre. */}
      <div className="flex gap-1.5 overflow-x-auto flex-nowrap sm:flex-wrap sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0">
        <button onClick={() => actualizar({ tipo: "" })} className={`flex-shrink-0 ${chip(!tipo)}`}>Todos</button>
        {TIPOS.map(t => (
          <button key={t} onClick={() => actualizar({ tipo: tipo === t ? "" : t })} className={`flex-shrink-0 ${chip(tipo === t)}`}>
            {ETIQUETAS[t].emoji} {ETIQUETAS[t].label}
          </button>
        ))}
        {hayFiltrosActivos && (
          <button onClick={() => { setQ(""); actualizar({ q: "", tipo: "", metodoPago: "" }) }}
            className="flex-shrink-0 text-xs px-3 py-2 rounded-xl border border-[var(--c-border)] text-[var(--c-text3)] hover:text-red-400 hover:border-red-500/20 transition-all">
            ✕ Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
