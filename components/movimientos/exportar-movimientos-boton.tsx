"use client"
import { useState } from "react"
import { toast } from "sonner"
import { exportarMovimientosCSV } from "@/app/actions/acciones"

interface Props { mes: number; anio: number; q?: string; tipo?: string; metodoPago?: string }

export function ExportarMovimientosBoton({ mes, anio, q, tipo, metodoPago }: Props) {
  const [descargando, setDescargando] = useState(false)

  async function handleExportar() {
    setDescargando(true)
    try {
      const csv = await exportarMovimientosCSV({ mes, anio, q, tipo, metodoPago })
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `movimientos-${String(mes).padStart(2, "0")}-${anio}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Archivo descargado")
    } catch {
      toast.error("No se pudo exportar")
    } finally {
      setDescargando(false)
    }
  }

  return (
    <button onClick={handleExportar} disabled={descargando}
      className="flex items-center gap-2 h-10 px-4 bg-[var(--c-card)] hover:bg-[var(--c-hover)] text-[var(--c-text2)] text-sm font-semibold rounded-xl border border-[var(--c-border)] transition-all disabled:opacity-60 whitespace-nowrap">
      {descargando ? "Exportando..." : "⬇️ Exportar"}
    </button>
  )
}
