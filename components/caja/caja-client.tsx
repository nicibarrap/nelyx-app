"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { abrirCaja, cerrarCaja } from "@/app/actions/caja-acciones"
import { formatCLP } from "@/lib/utils"

interface CierreCajaDTO {
  id: string
  montoApertura: number
  abiertoPorNombre: string | null
  fechaApertura: string
  montoEsperado: number | null
  montoContado: number | null
  diferencia: number | null
  observacion: string | null
  ventasPorMetodoResumen: string | null
  cerradoPorNombre: string | null
  fechaCierre: string | null
}

interface VentaPorMetodoDTO { metodo: string; monto: number }

interface Props {
  actual: { abierta: CierreCajaDTO | null; montoEsperadoAhora: number | null; ventasPorMetodo: VentaPorMetodoDTO[]; puedeEscribir: boolean }
  historialInicial: CierreCajaDTO[]
}

const inp = "w-full h-11 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"

function formatFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

// Nombres libres (vienen tal cual de Movimiento.metodoPago — "Efectivo",
// "Tarjeta", "Transferencia", "Débito", "Crédito", "Cheque", "Otro", o
// "Sin especificar" para movimientos viejos sin método guardado), así que
// el ícono es solo decorativo por nombre conocido, con un respaldo genérico
// para cualquier otro que aparezca.
const ICONO_METODO: Record<string, string> = {
  Efectivo: "💵", Tarjeta: "💳", Débito: "💳", Crédito: "💳",
  Transferencia: "🏛️", Cheque: "📝", Otro: "•",
}

function VentasPorMetodo({ ventas }: { ventas: VentaPorMetodoDTO[] }) {
  const total = ventas.reduce((a, v) => a + v.monto, 0)
  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6">
      <p className="text-sm font-bold text-[var(--c-text)] mb-1">💰 Ventas de este turno</p>
      <p className="text-[11px] text-[var(--c-text4)] mb-4">Todo lo vendido desde que abriste, por método de pago — informativo, no afecta el cuadre de arriba (eso solo mira el efectivo).</p>
      {ventas.length === 0 ? (
        <p className="text-xs text-[var(--c-text4)]">Todavía no hay ventas registradas en este turno.</p>
      ) : (
        <div className="space-y-2">
          {ventas.map(v => (
            <div key={v.metodo} className="flex items-center justify-between text-sm">
              <span className="text-[var(--c-text2)]">{ICONO_METODO[v.metodo] ?? "•"} {v.metodo}</span>
              <span className="font-semibold text-[var(--c-text)]">{formatCLP(v.monto)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm pt-2 mt-1 border-t border-[var(--c-border)]">
            <span className="font-semibold text-[var(--c-text2)]">Total del turno</span>
            <span className="font-bold text-[var(--c-text)]">{formatCLP(total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function TarjetaDiferencia({ diferencia }: { diferencia: number }) {
  if (diferencia === 0) {
    return <span className="text-xs font-semibold text-emerald-400">Cuadró exacto</span>
  }
  const sobra = diferencia > 0
  return (
    <span className={`text-xs font-semibold ${sobra ? "text-sky-400" : "text-red-400"}`}>
      {sobra ? "Sobraron" : "Faltaron"} {formatCLP(Math.abs(diferencia))}
    </span>
  )
}

export function CajaClient({ actual, historialInicial }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [montoAperturaDisplay, setMontoAperturaDisplay] = useState("")
  const [montoContadoDisplay, setMontoContadoDisplay] = useState("")
  const [observacion, setObservacion] = useState("")
  const [mostrarCierre, setMostrarCierre] = useState(false)

  const { abierta, montoEsperadoAhora, ventasPorMetodo, puedeEscribir } = actual
  // Sin estado propio a propósito: router.refresh() (tras abrir/cerrar)
  // vuelve a pedirle los datos al servidor y pasa un historialInicial
  // nuevo — envolverlo en useState lo habría dejado "pegado" en el valor
  // del primer render, porque React solo usa el valor inicial de useState
  // una vez, no en cada vez que cambian las props.
  const historial = historialInicial

  function handleAbrir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const monto = Number(montoAperturaDisplay.replace(/\./g, "")) || 0
    startTransition(async () => {
      try {
        const resultado = await abrirCaja(monto)
        if (resultado?.error) { toast.error(resultado.error); return }
        toast.success("Caja abierta")
        setMontoAperturaDisplay("")
        router.refresh()
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo abrir la caja")
      }
    })
  }

  function handleCerrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const monto = Number(montoContadoDisplay.replace(/\./g, "")) || 0
    startTransition(async () => {
      try {
        const resultado = await cerrarCaja(monto, observacion || undefined)
        if (resultado?.error) { toast.error(resultado.error); return }
        toast.success("Caja cerrada")
        setMontoContadoDisplay(""); setObservacion(""); setMostrarCierre(false)
        router.refresh()
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo cerrar la caja")
      }
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {!abierta ? (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6">
          <p className="text-sm font-bold text-[var(--c-text)] mb-1">▤ No hay una caja abierta</p>
          <p className="text-xs text-[var(--c-text3)] mb-4">Cuenta el efectivo que hay ahora en la caja (el fondo con el que partes el turno) y ábrela. Desde ese momento, Nelyx va a seguir el efectivo que entra y sale para que al cerrar puedas comparar contra lo que de verdad cuentes.</p>
          {puedeEscribir ? (
            <form onSubmit={handleAbrir} className="space-y-3">
              <div>
                <label className="text-xs text-[var(--c-text2)] block mb-1.5">Efectivo inicial ($) *</label>
                <input type="text" inputMode="numeric" required placeholder="0"
                  value={montoAperturaDisplay}
                  onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setMontoAperturaDisplay(v ? Number(v).toLocaleString("es-CL") : "") }}
                  className={`${inp} h-14 text-2xl font-bold text-center`} />
              </div>
              <button type="submit" disabled={isPending}
                className="w-full h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
                {isPending ? "Abriendo..." : "Abrir caja"}
              </button>
            </form>
          ) : (
            <p className="text-xs text-[var(--c-text4)]">Solo puedes ver este módulo — pídele al dueño que te habilite abrir y cerrar la caja.</p>
          )}
        </div>
      ) : (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-[var(--c-text)]">▤ Caja abierta</p>
              <p className="text-[11px] text-[var(--c-text4)]">
                Abierta por <span className="font-semibold text-[var(--c-text3)]">{abierta.abiertoPorNombre ?? "Tú (dueño)"}</span> — {formatFechaHora(abierta.fechaApertura)}
              </p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex-shrink-0">Abierta</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3">
              <p className="text-[10px] text-[var(--c-text4)] mb-0.5">Efectivo inicial</p>
              <p className="text-sm font-bold text-[var(--c-text)]">{formatCLP(abierta.montoApertura)}</p>
            </div>
            <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3">
              <p className="text-[10px] text-[var(--c-text4)] mb-0.5">Debería haber ahora</p>
              <p className="text-sm font-bold text-[var(--c-text)]">{formatCLP(montoEsperadoAhora ?? abierta.montoApertura)}</p>
            </div>
          </div>
          <p className="text-[10px] text-[var(--c-text4)] mb-4">Incluye solo lo pagado en efectivo (ventas, cobros, gastos, retiros y pagos de deuda) desde que abriste — lo pagado con tarjeta o transferencia no pasa por la caja física.</p>

          {!puedeEscribir ? (
            <p className="text-xs text-[var(--c-text4)]">Solo puedes ver este módulo — pídele al dueño que te habilite cerrar la caja.</p>
          ) : !mostrarCierre ? (
            <button onClick={() => setMostrarCierre(true)}
              className="w-full h-11 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-semibold rounded-xl hover:bg-sky-500/20 transition-all">
              Cerrar caja
            </button>
          ) : (
            <form onSubmit={handleCerrar} className="space-y-3 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4">
              <p className="text-xs font-semibold text-[var(--c-text)]">Contar y cerrar</p>
              <div>
                <label className="text-[10px] text-[var(--c-text3)] block mb-1">Efectivo contado ahora ($) *</label>
                <input type="text" inputMode="numeric" required placeholder="0"
                  value={montoContadoDisplay}
                  onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setMontoContadoDisplay(v ? Number(v).toLocaleString("es-CL") : "") }}
                  className={`${inp} h-12 text-xl font-bold text-center`} />
              </div>
              <div>
                <label className="text-[10px] text-[var(--c-text3)] block mb-1">Observación (opcional)</label>
                <input value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Ej: faltaron $500 del vuelto de la mañana" className={inp} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMostrarCierre(false)} className="flex-1 h-10 border border-[var(--c-border)] text-[var(--c-text3)] text-xs rounded-xl hover:bg-[var(--c-hover)]">Cancelar</button>
                <button type="submit" disabled={isPending} className="flex-1 h-10 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-semibold rounded-xl">
                  {isPending ? "Cerrando..." : "Confirmar cierre"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {abierta && <VentasPorMetodo ventas={ventasPorMetodo} />}

      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
        <p className="text-xs font-semibold text-[var(--c-text)] px-5 py-4 border-b border-[var(--c-border)]">Historial de cierres</p>
        {historial.length === 0 ? (
          <p className="text-xs text-[var(--c-text4)] text-center py-8">Todavía no has cerrado ninguna caja.</p>
        ) : (
          <div className="divide-y divide-[var(--c-border2)]">
            {historial.map(c => (
              <div key={c.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-[var(--c-text)]">
                    {formatFechaHora(c.fechaApertura)} → {c.fechaCierre ? formatFechaHora(c.fechaCierre) : "—"}
                  </p>
                  {c.diferencia != null && <TarjetaDiferencia diferencia={c.diferencia} />}
                </div>
                <p className="text-[10px] text-[var(--c-text4)] mt-0.5">
                  Abrió <span className="font-medium text-[var(--c-text3)]">{c.abiertoPorNombre ?? "Tú (dueño)"}</span>
                  {c.cerradoPorNombre !== c.abiertoPorNombre && c.cerradoPorNombre != null && <> · Cerró <span className="font-medium text-[var(--c-text3)]">{c.cerradoPorNombre}</span></>}
                  {" · "}Inicial {formatCLP(c.montoApertura)} · Esperado {formatCLP(c.montoEsperado ?? 0)} · Contado {formatCLP(c.montoContado ?? 0)}
                </p>
                {c.ventasPorMetodoResumen && <p className="text-[10px] text-[var(--c-text4)] mt-0.5">Ventas del turno: {c.ventasPorMetodoResumen}</p>}
                {c.observacion && <p className="text-[10px] text-[var(--c-text4)] mt-0.5 italic">"{c.observacion}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
