"use client"
import { useRouter, useSearchParams } from "next/navigation"
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const sel = "h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text2)] outline-none focus:border-sky-500 cursor-pointer"
export function FiltroPeriodo() {
  const router = useRouter()
  const params = useSearchParams()
  const hoy = new Date()
  const mes = params.get("mes") ?? String(hoy.getMonth()+1).padStart(2,"0")
  const anio = params.get("anio") ?? String(hoy.getFullYear())
  // Preserva cualquier otro filtro ya activo en la URL (búsqueda, tipo,
  // método de pago, página) — antes esto pisaba la query string entera,
  // así que cambiar de mes borraba sin querer los demás filtros aplicados.
  // Al cambiar de período también se resetea "page": la página 3 de
  // octubre no tiene sentido al mirar noviembre.
  const update = (m: string, a: string) => {
    const next = new URLSearchParams(params.toString())
    next.set("mes", m); next.set("anio", a); next.delete("page")
    router.push(`?${next.toString()}`)
  }
  return (
    <div className="flex items-center gap-2">
      <select value={mes} onChange={(e) => update(e.target.value, anio)} className={sel}>
        {MESES.map((m,i) => <option key={i} value={String(i+1).padStart(2,"0")}>{m}</option>)}
      </select>
      <select value={anio} onChange={(e) => update(mes, e.target.value)} className={sel}>
        {[2024,2025,2026,2027].map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  )
}
