"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ETIQUETAS } from "@/lib/utils"
import { FILTRO_DUENO } from "@/lib/movimientos-filtro-sentinel"

const TIPOS = ["VENTA", "GASTO", "COSTO_FIJO", "INGRESO_EXTRA", "DEVOLUCION", "RETIRO"]
const METODOS_PAGO = ["Efectivo", "Tarjeta", "Transferencia", "Débito", "Crédito", "Pendiente"]

const chip = (activo: boolean) =>
  `text-xs px-3 py-2 rounded-xl border font-medium transition-all whitespace-nowrap ${activo ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-[var(--c-card)] text-[var(--c-text2)] border-[var(--c-border)] hover:border-sky-500/20 hover:text-[var(--c-text)]"}`

export function FiltroMovimientos({ usuarios = [] }: { usuarios?: string[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const tipo = params.get("tipo") ?? ""
  const metodoPago = params.get("metodoPago") ?? ""
  const realizadoPor = params.get("realizadoPor") ?? ""
  // "recientes" es el default (mismo orden de siempre) — se omite de la URL
  // para no ensuciarla con el caso normal, solo aparece "?orden=antiguos"
  // cuando el usuario realmente lo cambia.
  const orden = params.get("orden") === "antiguos" ? "antiguos" : "recientes"

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

  const hayFiltrosActivos = !!(q || tipo || metodoPago || realizadoPor)

  return (
    // Los chips van siempre en su propia fila a lo ancho completo, nunca
    // compitiendo por espacio con el buscador y los selects — con los 3
    // juntos en la misma fila (bug real: así quedó al agregar el select de
    // "orden"), el navegador achica el contenedor de chips y el último
    // tipo (Retiro) quedaba huérfano, envuelto solo en su propia línea.
    <div className="flex flex-col gap-3">
      {/* flex-col hasta lg (no sm): en tablet vertical hay ancho de sobra
          para que buscador/método/orden se vean ordenados en columna, pero
          no el suficiente para los 3 en una fila sin apretarse. Desde lg
          (tablet horizontal y PC) sí hay espacio real para la fila completa. */}
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
        {/* Solo aparece si alguna vez un usuario adicional (empleado) quedó
            registrado en algún movimiento — en un negocio sin empleados,
            este select ni se muestra. */}
        {usuarios.length > 0 && (
          <select value={realizadoPor} onChange={e => actualizar({ realizadoPor: e.target.value })}
            className="w-full lg:w-auto bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text2)] outline-none focus:border-sky-500 transition-colors">
            <option value="">Todos los usuarios</option>
            <option value={FILTRO_DUENO}>👑 Tú (dueño)</option>
            {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
        {/* Orden por fecha — para llegar directo al día 1 del mes sin tener
            que paginar hasta el final cuando se quiere ver lo más antiguo. */}
        <select value={orden} onChange={e => actualizar({ orden: e.target.value === "recientes" ? "" : e.target.value })}
          title="Ordenar por fecha"
          className="w-full lg:w-auto bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text2)] outline-none focus:border-sky-500 transition-colors">
          <option value="recientes">↓ Más recientes primero</option>
          <option value="antiguos">↑ Más antiguos primero</option>
        </select>
      </div>
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
          <button onClick={() => { setQ(""); actualizar({ q: "", tipo: "", metodoPago: "", realizadoPor: "" }) }}
            className="flex-shrink-0 text-xs px-3 py-2 rounded-xl border border-[var(--c-border)] text-[var(--c-text3)] hover:text-red-400 hover:border-red-500/20 transition-all">
            ✕ Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
