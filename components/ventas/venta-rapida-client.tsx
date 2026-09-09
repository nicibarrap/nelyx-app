"use client"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { registrarVenta } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"

const MONTOS_RAPIDOS = [1000, 2000, 5000, 10000]

type VentaDelDia = { id: string; monto: number; hora: string }

export function VentaRapidaClient({ onVolver }: { onVolver: () => void }) {
  const router = useRouter()
  const [monto, setMonto] = useState("")
  const [isPending, setIsPending] = useState(false)
  const [ventasHoy, setVentasHoy] = useState<VentaDelDia[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const montoNum = parseFloat(monto) || 0
  const totalHoy = ventasHoy.reduce((a, v) => a + v.monto, 0)

  function agregarDigito(d: string) {
    if (d === "C") { setMonto(""); return }
    if (d === "⌫") { setMonto(prev => prev.slice(0, -1)); return }
    setMonto(prev => (prev + d).replace(/^0+(?=\d)/, ""))
  }

  function agregarRapido(valor: number) {
    setMonto(prev => String((parseFloat(prev) || 0) + valor))
  }

  async function handleRegistrar() {
    if (montoNum <= 0) { toast.error("Ingresa un monto mayor a 0"); return }
    setIsPending(true)
    try {
      const hoy = new Date().toISOString().slice(0, 10)
      await registrarVenta(
        [{ productoId: null, nombre: "Venta rápida", precio: montoNum, cantidad: 1 }],
        hoy, undefined, null, undefined, "contado", undefined, "Efectivo"
      )
      setVentasHoy(prev => [{ id: crypto.randomUUID(), monto: montoNum, hora: new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) }, ...prev])
      toast.success(`✅ ${formatCLP(montoNum)} registrado`)
      setMonto("")
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo registrar la venta")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <button onClick={onVolver} className="text-sm text-[var(--c-text3)] hover:text-[var(--c-text)] transition-colors">← Volver a Venta</button>
        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">⚡ Venta rápida</span>
      </div>

      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-3 text-center">
        <p className="text-[11px] text-[var(--c-text3)]">Solo el monto — sin producto, sin cliente, siempre en efectivo.</p>
      </div>

      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
        <div className="flex items-center justify-center gap-1 mb-4">
          <span className="text-2xl font-black text-[var(--c-text4)]">$</span>
          <input ref={inputRef} value={monto ? Number(monto).toLocaleString("es-CL") : "0"} readOnly
            className="bg-transparent text-4xl font-black text-[var(--c-text)] text-center outline-none w-full" />
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {MONTOS_RAPIDOS.map(m => (
            <button key={m} onClick={() => agregarRapido(m)}
              className="h-10 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] text-xs font-bold text-[var(--c-text2)] hover:border-emerald-500/40 transition-all">
              +{m >= 1000 ? `${m / 1000}k` : m}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3", "C", "0", "⌫"].map(d => (
            <button key={d} onClick={() => agregarDigito(d)}
              className={`h-14 rounded-xl text-lg font-bold transition-all ${d === "C" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text)] hover:border-emerald-500/40"}`}>
              {d}
            </button>
          ))}
        </div>

        <button onClick={handleRegistrar} disabled={isPending || montoNum <= 0}
          className="w-full h-14 mt-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-base font-bold transition-all">
          {isPending ? "Registrando..." : "✅ Registrar venta"}
        </button>
      </div>

      {ventasHoy.length > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
            <p className="text-xs font-semibold text-[var(--c-text)]">Ventas rápidas de hoy</p>
            <p className="text-xs font-bold text-emerald-400">{formatCLP(totalHoy)}</p>
          </div>
          <div className="divide-y divide-[var(--c-border2)] max-h-52 overflow-y-auto">
            {ventasHoy.map(v => (
              <div key={v.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[var(--c-text4)]">{v.hora}</span>
                <span className="text-sm font-semibold text-[var(--c-text)]">{formatCLP(v.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
