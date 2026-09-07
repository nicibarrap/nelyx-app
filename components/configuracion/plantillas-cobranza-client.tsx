"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { actualizarPlantillaCobranza, restaurarPlantillaCobranza } from "@/app/actions/cobranza-acciones"
import { NIVELES_COBRANZA, type NivelCobranza } from "@/lib/cobranza"

export function PlantillasCobranzaClient({ plantillas }: { plantillas: Record<NivelCobranza, string> }) {
  const [textos, setTextos] = useState(plantillas)
  const [editandoNivel, setEditandoNivel] = useState<NivelCobranza | null>(null)
  const [isPending, startTransition] = useTransition()

  function guardar(nivel: NivelCobranza) {
    startTransition(async () => {
      try {
        await actualizarPlantillaCobranza(nivel, textos[nivel])
        toast.success("Plantilla guardada")
        setEditandoNivel(null)
      } catch (err: any) { toast.error(err?.message ?? "No se pudo guardar") }
    })
  }

  function restaurar(nivel: NivelCobranza) {
    startTransition(async () => {
      try {
        const original = await restaurarPlantillaCobranza(nivel)
        setTextos(prev => ({ ...prev, [nivel]: original }))
        toast.success("Plantilla restaurada al mensaje original")
      } catch { toast.error("No se pudo restaurar") }
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
      <h2 className="text-sm font-bold text-[var(--c-text)] mb-1">Plantillas de cobranza</h2>
      <p className="text-xs text-[var(--c-text3)] mb-4">
        Los mensajes que se usan al contactar a un cliente desde Cuentas por Cobrar. Podés usar {"{nombreCliente}"}, {"{montoPendiente}"}, {"{fechaVenta}"}, {"{fechaVencimiento}"}, {"{numeroDocumento}"}, {"{diasAtraso}"} y {"{nombreNegocio}"} — se reemplazan automáticamente.
      </p>
      <div className="space-y-3">
        {NIVELES_COBRANZA.map(n => (
          <div key={n.nivel} className={`rounded-xl border ${n.border} ${n.bg} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <p className={`text-xs font-bold ${n.color}`}>{n.icon} {n.label}</p>
              {editandoNivel !== n.nivel && (
                <button onClick={() => setEditandoNivel(n.nivel)} className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold">✏️ Editar</button>
              )}
            </div>
            {editandoNivel === n.nivel ? (
              <div className="space-y-2">
                <textarea value={textos[n.nivel]} onChange={e => setTextos(prev => ({ ...prev, [n.nivel]: e.target.value }))}
                  rows={7} className="w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl p-3 text-xs text-[var(--c-text)] outline-none focus:border-sky-500 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setEditandoNivel(null)} className="h-8 px-3 border border-[var(--c-border)] text-[var(--c-text3)] text-[11px] rounded-lg">Cancelar</button>
                  <button onClick={() => restaurar(n.nivel)} disabled={isPending} className="h-8 px-3 text-[11px] text-[var(--c-text3)] hover:text-red-400">Restaurar original</button>
                  <button onClick={() => guardar(n.nivel)} disabled={isPending} className="h-8 px-4 bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-bold rounded-lg ml-auto disabled:opacity-50">
                    {isPending ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--c-text2)] whitespace-pre-line line-clamp-3">{textos[n.nivel]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
