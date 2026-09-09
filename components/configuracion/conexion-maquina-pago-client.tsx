"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { listarTerminalesParaConectar, conectarMercadoPago, desconectarPago, type TerminalMP } from "@/app/actions/pagos-acciones"

type Conexion = { id: string; proveedor: string; terminalId: string | null; activo: boolean; ultimaConexionOk: string | null }

const MARCAS = [
  { id: "mercadopago", nombre: "Mercado Pago", emoji: "🟡", disponible: true },
  { id: "transbank", nombre: "Transbank", emoji: "🔵", disponible: false },
  { id: "getnet", nombre: "Getnet", emoji: "🔴", disponible: false },
  { id: "bancoestado", nombre: "BancoEstado (CompraAquí)", emoji: "🟢", disponible: false },
]

export function ConexionMaquinaPagoClient({ conexiones: conexionesIniciales }: { conexiones: Conexion[] }) {
  const [conexiones, setConexiones] = useState(conexionesIniciales)
  const [marcaAbierta, setMarcaAbierta] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState("")
  const [terminales, setTerminales] = useState<TerminalMP[] | null>(null)
  const [terminalElegida, setTerminalElegida] = useState("")
  const [isPending, startTransition] = useTransition()

  const conexionMP = conexiones.find(c => c.proveedor === "mercadopago")

  function handleProbarConexion() {
    if (!accessToken.trim()) { toast.error("Ingresa tu Access Token primero"); return }
    startTransition(async () => {
      try {
        const lista = await listarTerminalesParaConectar(accessToken.trim())
        if (lista.length === 0) { toast.error("El token es válido, pero no encontré ninguna terminal asociada a esta cuenta"); return }
        setTerminales(lista)
        setTerminalElegida(lista[0].id)
        toast.success(`Encontré ${lista.length} terminal${lista.length === 1 ? "" : "es"}`)
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo conectar")
      }
    })
  }

  function handleConectar() {
    if (!terminalElegida) return
    startTransition(async () => {
      try {
        await conectarMercadoPago(accessToken.trim(), terminalElegida)
        toast.success("✅ Máquina conectada")
        setConexiones(prev => [...prev.filter(c => c.proveedor !== "mercadopago"), { id: "temp", proveedor: "mercadopago", terminalId: terminalElegida, activo: true, ultimaConexionOk: new Date().toISOString() }])
        setMarcaAbierta(null)
        setAccessToken("")
        setTerminales(null)
      } catch (err: any) {
        toast.error(err?.message ?? "Error al conectar")
      }
    })
  }

  function handleDesconectar(proveedor: string) {
    startTransition(async () => {
      try {
        await desconectarPago(proveedor)
        setConexiones(prev => prev.filter(c => c.proveedor !== proveedor))
        toast.success("Desconectado")
      } catch (err: any) {
        toast.error(err?.message ?? "Error")
      }
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
      <h2 className="text-sm font-bold text-[var(--c-text)] mb-1">💳 Máquinas de pago</h2>
      <p className="text-xs text-[var(--c-text3)] mb-4">Conecta tu máquina para cobrar directo desde Venta, sin tipear el monto dos veces.</p>

      <div className="space-y-2">
        {MARCAS.map(marca => {
          const conectada = conexiones.find(c => c.proveedor === marca.id)
          return (
            <div key={marca.id} className="border border-[var(--c-border)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{marca.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--c-text)]">{marca.nombre}</p>
                    {conectada && <p className="text-[10px] text-emerald-400">Conectado — terminal {conectada.terminalId}</p>}
                    {!marca.disponible && <p className="text-[10px] text-[var(--c-text4)]">Próximamente</p>}
                  </div>
                </div>
                {marca.disponible ? (
                  conectada ? (
                    <button onClick={() => handleDesconectar(marca.id)} disabled={isPending}
                      className="text-xs px-3 py-1.5 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/10 transition-all disabled:opacity-50">
                      Desconectar
                    </button>
                  ) : (
                    <button onClick={() => setMarcaAbierta(marcaAbierta === marca.id ? null : marca.id)}
                      className="text-xs px-3 py-1.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg hover:bg-sky-500/20 transition-all">
                      + Conectar
                    </button>
                  )
                ) : (
                  <span className="text-[10px] text-[var(--c-text4)] px-2">No disponible aún</span>
                )}
              </div>

              {marcaAbierta === marca.id && marca.id === "mercadopago" && !conectada && (
                <div className="px-4 pb-4 pt-1 border-t border-[var(--c-border)] space-y-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Access Token</label>
                    <input type="password" value={accessToken} onChange={e => { setAccessToken(e.target.value); setTerminales(null) }}
                      placeholder="APP_USR-..." className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">Lo encuentras en tu cuenta de Mercado Pago → Tus integraciones → Credenciales.</p>
                  </div>

                  {!terminales && (
                    <button onClick={handleProbarConexion} disabled={isPending}
                      className="h-9 px-4 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] text-xs font-semibold rounded-lg hover:border-sky-500/40 transition-all disabled:opacity-50">
                      {isPending ? "Buscando..." : "Probar conexión"}
                    </button>
                  )}

                  {terminales && (
                    <>
                      <div>
                        <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Terminal encontrada</label>
                        <select value={terminalElegida} onChange={e => setTerminalElegida(e.target.value)}
                          className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500">
                          {terminales.map(t => <option key={t.id} value={t.id}>{t.id} {t.operatingMode !== "PDV" ? "(⚠️ modo standalone)" : ""}</option>)}
                        </select>
                        {terminales.find(t => t.id === terminalElegida)?.operatingMode !== "PDV" && (
                          <p className="text-[10px] text-amber-500 mt-1">⚠️ Esta terminal está en modo "standalone" — hay que cambiarla a modo integrado (PDV) desde la app de Mercado Pago antes de poder cobrar desde Nelyx.</p>
                        )}
                      </div>
                      <button onClick={handleConectar} disabled={isPending}
                        className="h-10 px-4 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 w-full">
                        {isPending ? "Conectando..." : "✅ Conectar esta terminal"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
