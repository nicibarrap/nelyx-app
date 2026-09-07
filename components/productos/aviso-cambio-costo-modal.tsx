"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { actualizarPrecioProducto, posponerAvisoCosto } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"

export type AvisoCosto = {
  productoId: string
  productoNombre: string
  costoAnterior: number
  costoNuevo: number
  precioActual: number | null
  precioSugerido: number | null
  margenActual: number | null
}

/**
 * Modal que aparece tras reponer stock a un costo distinto al que ya
 * tenías — sugiere un precio de venta nuevo que mantiene el mismo margen %
 * que ya tenías, sin imponerlo. Reutilizado tanto por "Ajustar stock"
 * (un producto) como por "Actualizar inventario" (varios, uno por uno).
 */
export function AvisoCambioCostoModal({ aviso, onCerrar }: { aviso: AvisoCosto; onCerrar: () => void }) {
  const [isPending, start] = useTransition()

  function aceptar() {
    if (!aviso.precioSugerido) { onCerrar(); return }
    start(async () => {
      try {
        await actualizarPrecioProducto(aviso.productoId, aviso.precioSugerido!)
        toast.success(`Precio de "${aviso.productoNombre}" actualizado a ${formatCLP(aviso.precioSugerido!)}`)
        onCerrar()
      } catch { toast.error("No se pudo actualizar el precio"); onCerrar() }
    })
  }

  function ahoraNo() {
    start(async () => {
      try { await posponerAvisoCosto(aviso.productoNombre, aviso.costoAnterior, aviso.costoNuevo) } catch {}
      onCerrar()
    })
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 max-w-sm w-full">
        <p className="text-sm font-bold text-[var(--c-text)] mb-1">💰 El costo de "{aviso.productoNombre}" cambió</p>
        <p className="text-xs text-[var(--c-text3)] mb-4">
          De {formatCLP(aviso.costoAnterior)} a <span className="text-[var(--c-text)] font-semibold">{formatCLP(aviso.costoNuevo)}</span> (promedio ponderado).
        </p>

        {aviso.precioSugerido != null ? (
          <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-3 mb-4">
            <p className="text-[11px] text-[var(--c-text3)]">Para mantener tu margen actual del {aviso.margenActual}%:</p>
            <p className="text-lg font-black text-sky-400 mt-1">{formatCLP(aviso.precioActual!)} → {formatCLP(aviso.precioSugerido)}</p>
          </div>
        ) : (
          <p className="text-xs text-[var(--c-text3)] mb-4">Aún no tienes un precio de venta cargado para este producto — ponlo desde su ficha cuando quieras.</p>
        )}

        <div className="flex gap-2">
          <button onClick={ahoraNo} disabled={isPending} className="flex-1 h-10 border border-[var(--c-border)] text-[var(--c-text3)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all disabled:opacity-50">
            Ahora no
          </button>
          {aviso.precioSugerido != null && (
            <button onClick={aceptar} disabled={isPending} className="flex-1 h-10 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
              {isPending ? "..." : "Actualizar precio"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
