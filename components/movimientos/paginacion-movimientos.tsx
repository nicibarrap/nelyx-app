"use client"
import { useRouter, useSearchParams } from "next/navigation"

const btn = "min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"

export function PaginacionMovimientos({ paginaActual, totalPaginas }: { paginaActual: number; totalPaginas: number }) {
  const router = useRouter()
  const params = useSearchParams()

  if (totalPaginas <= 1) return null

  function irA(pagina: number) {
    const next = new URLSearchParams(params.toString())
    if (pagina <= 1) next.delete("page"); else next.set("page", String(pagina))
    router.push(`?${next.toString()}`)
  }

  // Ventana de hasta 5 números alrededor de la página actual, en vez de
  // listar las 15+ páginas que puede llegar a haber en un mes con
  // movimiento alto — con bordes recortados contra 1 y totalPaginas.
  const inicio = Math.max(1, Math.min(paginaActual - 2, totalPaginas - 4))
  const fin = Math.min(totalPaginas, inicio + 4)
  const numeros = Array.from({ length: fin - inicio + 1 }, (_, i) => inicio + i)

  return (
    <div className="flex items-center justify-center gap-1.5 pt-4">
      <button onClick={() => irA(paginaActual - 1)} disabled={paginaActual <= 1}
        className={`${btn} text-[var(--c-text2)] hover:bg-[var(--c-hover)]`}>←</button>
      {inicio > 1 && <span className="text-[var(--c-text4)] text-xs px-1">…</span>}
      {numeros.map(n => (
        <button key={n} onClick={() => irA(n)}
          className={`${btn} ${n === paginaActual ? "bg-sky-500 text-white" : "text-[var(--c-text2)] hover:bg-[var(--c-hover)]"}`}>
          {n}
        </button>
      ))}
      {fin < totalPaginas && <span className="text-[var(--c-text4)] text-xs px-1">…</span>}
      <button onClick={() => irA(paginaActual + 1)} disabled={paginaActual >= totalPaginas}
        className={`${btn} text-[var(--c-text2)] hover:bg-[var(--c-hover)]`}>→</button>
    </div>
  )
}
