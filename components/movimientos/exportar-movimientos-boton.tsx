"use client"
import { useState } from "react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { exportarMovimientosExcel } from "@/app/actions/acciones"

interface Props { mes: number; anio: number; q?: string; tipo?: string; metodoPago?: string; realizadoPor?: string; orden?: string }

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

export function ExportarMovimientosBoton({ mes, anio, q, tipo, metodoPago, realizadoPor, orden }: Props) {
  const [descargando, setDescargando] = useState(false)

  async function handleExportar() {
    setDescargando(true)
    try {
      const filas = await exportarMovimientosExcel({ mes, anio, q, tipo, metodoPago, realizadoPor, orden })

      const encabezados = ["Fecha", "Hora", "Tipo", "Medio de pago", "Detalle", "Monto"]
      const datos = filas.map(f => [f.fecha, f.hora, f.tipo, f.metodoPago, f.detalle, f.monto])
      const ws = XLSX.utils.aoa_to_sheet([encabezados, ...datos])

      // Mismo patrón que lib/importacion-productos.ts: anchos fijos +
      // formato de moneda en la columna de Monto, para que se abra ya
      // ordenada y legible en vez de una planilla en bruto.
      ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 40 }, { wch: 14 }]
      for (let i = 0; i < filas.length; i++) {
        const celdaMonto = ws[`F${i + 2}`]
        if (celdaMonto && typeof celdaMonto.v === "number") celdaMonto.z = '"$"#,##0'
      }
      const ultimaFila = Math.max(filas.length, 1) + 1
      ws["!autofilter"] = { ref: `A1:F${ultimaFila}` }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Movimientos")
      XLSX.writeFile(wb, `movimientos-${MESES[mes - 1] ?? mes}-${anio}.xlsx`)
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
      {descargando ? "Exportando..." : "⬇️ Exportar a Excel"}
    </button>
  )
}
