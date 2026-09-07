"use client"
import { useState, useTransition, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { crearCuentaPorCobrar, registrarPagoCuenta, eliminarCuentaPorCobrar, registrarVenta } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"
import { CentroCobranza } from "@/components/cuentas-cobrar/centro-cobranza"

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }
const METODOS_PAGO = ["Efectivo","Transferencia","Débito","Crédito","Cheque","Otro"]
const SCORE_CFG = {
  excelente: { label: "Excelente pagador", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", dot: "🟢" },
  bueno:     { label: "Buen pagador",      color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20",     dot: "🟢" },
  irregular: { label: "Pago irregular",    color: "text-[var(--c-warning)]",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   dot: "🟡" },
  riesgo:    { label: "Riesgo alto",       color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     dot: "🔴" },
}
const ESTADO_CFG: any = {
  pendiente: { label: "Pendiente",  color: "text-sky-400",   bg: "bg-sky-500/10",   border: "border-sky-500/20" },
  parcial:   { label: "Parcial",    color: "text-[var(--c-warning)]", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  vencida:   { label: "Vencida",    color: "text-red-400",   bg: "bg-red-500/10",   border: "border-red-500/20" },
  pagada:    { label: "Pagada",     color: "text-emerald-400",bg: "bg-emerald-500/10",border: "border-emerald-500/20" },
}

type Cuenta = {
  id: string; numero: number; cliente: { id: string; nombre: string; apellido: string | null; empresa: string | null; telefono: string | null; email: string | null }
  movimientoId: string | null; montoOriginal: number; saldoPendiente: number; totalPagado: number
  fechaVenta: string; fechaVence: string | null; estado: string; observaciones: string | null
  diasAtraso: number; diasHastaVence: number | null; createdAt: string
  utilidadEsperada: number | null; utilidadRecibida: number | null; utilidadPendiente: number | null
  pagos: { id: string; monto: number; fecha: string; descripcion: string | null; metodoPago: string | null }[]
}

type ClienteOpt = { id: string; nombre: string; apellido: string | null; empresa: string | null; telefono: string | null }
type ProductoOpt = { id: string; nombre: string; precio: any; stock: number | null; stockMinimo: number | null }
type ScoreCliente = { id: string; score: "excelente"|"bueno"|"irregular"|"riesgo" }

interface Props {
  cuentasData: Cuenta[]
  clientes: ClienteOpt[]
  productos?: ProductoOpt[]
  scoreClientes: ScoreCliente[]
  metricas: { totalPorCobrar: number; totalVencido: number; totalPorVencer: number; cobradoEsteMes: number; tasaCobranza: number; diasPromedioMora: number; countPendientes: number; countVencidas: number; countPorVencer: number }
  nombreNegocio: string
  usuarioEnvia: string
  plantillas: Record<1|2|3, string>
}

const inp = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"
const sel = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

function getInitials(nombre: string, apellido?: string | null) {
  return (nombre[0] + (apellido?.[0] ?? nombre.split(" ")[1]?.[0] ?? "")).toUpperCase()
}
function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
}

function FormCuenta({ clientes, productos, onClose, onSuccess }: { clientes: ClienteOpt[]; productos: ProductoOpt[]; onClose: () => void; onSuccess: () => void }) {
  const [isPending, start] = useTransition()
  const [clienteSearch, setClienteSearch] = useState("")
  const [clienteId, setClienteId] = useState("")
  const [showDrop, setShowDrop] = useState(false)
  const clientesFiltrados = clientes.filter(c => `${c.nombre} ${c.apellido ?? ""} ${c.empresa ?? ""}`.toLowerCase().includes(clienteSearch.toLowerCase()))
  const clienteSel = clientes.find(c => c.id === clienteId)
  const [productoId, setProductoId] = useState("")
  const [cantidad, setCantidad] = useState(1)
  const productoSel = productos.find(p => p.id === productoId)
  const montoCalculado = productoSel?.precio ? Math.round(Number(productoSel.precio) * cantidad) : 0
  const stockInsuf = productoSel?.stock !== null && productoSel?.stock !== undefined && cantidad > productoSel.stock

  // Portal directo a document.body — mismo fix que en Clientes/Proveedores.
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!clienteId) { toast.error("Selecciona un cliente"); return }
    if (stockInsuf) { toast.error(`Stock insuficiente. Disponible: ${productoSel?.stock}`); return }
    const fd = new FormData(e.currentTarget)
    const fechaVence = (e.currentTarget.elements.namedItem("fechaVence") as HTMLInputElement)?.value ?? ""
    fd.append("clienteId", clienteId)
    start(async () => {
      try {
        if (productoId && productoSel) {
          // Credit sale with product - uses registrarVenta which handles stock deduction
          await registrarVenta(
            [{ productoId, nombre: productoSel.nombre, precio: Number(productoSel.precio ?? 0), cantidad }],
            localToday(),
            `Venta a crédito — ${productoSel.nombre}`,
            clienteId,
            0,
            "credito",
            fechaVence || undefined
          )
        } else {
          await crearCuentaPorCobrar(fd)
        }
        toast.success("Cuenta creada ✅"); onSuccess()
      }
      catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  if (!montado) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
        <div className="px-6 pt-5 pb-4 border-b border-[var(--c-border)] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--c-text)]">Nueva cuenta por cobrar</h2>
          <button onClick={onClose} className="text-[var(--c-text3)] w-8 h-8 rounded-xl hover:bg-[var(--c-hover)] flex items-center justify-center text-lg">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Cliente selector */}
          <div className="relative">
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Cliente *</label>
            <input value={clienteSel ? `${clienteSel.nombre} ${clienteSel.apellido ?? ""}`.trim() : clienteSearch}
              onChange={e => { setClienteSearch(e.target.value); setClienteId(""); setShowDrop(true) }}
              onFocus={() => setShowDrop(true)} onBlur={() => setTimeout(() => setShowDrop(false), 150)}
              placeholder="Buscar cliente..." className={inp} />
            {showDrop && clientesFiltrados.length > 0 && !clienteId && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl shadow-2xl z-50 max-h-44 overflow-y-auto">
                {clientesFiltrados.slice(0, 8).map(c => (
                  <button key={c.id} type="button" onMouseDown={() => { setClienteId(c.id); setClienteSearch(""); setShowDrop(false) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--c-hover)] text-left transition-all">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-[10px] font-bold text-sky-400">{getInitials(c.nombre, c.apellido)}</div>
                    <div><p className="text-sm font-semibold text-[var(--c-text)]">{c.nombre} {c.apellido ?? ""}</p>{c.empresa && <p className="text-[10px] text-[var(--c-text3)]">{c.empresa}</p>}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Producto opcional */}
          {productos.length > 0 && (
            <div className="space-y-2">
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block">Producto (opcional)</label>
              <select value={productoId} onChange={e => { setProductoId(e.target.value); setCantidad(1) }}
                className={sel}>
                <option value="">— Sin producto específico —</option>
                {productos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.stock !== null ? ` (Stock: ${p.stock})` : ""}</option>
                ))}
              </select>
              {productoSel && (
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-[var(--c-text3)]">Precio: {formatCLP(Number(productoSel.precio ?? 0))}</p>
                    {stockInsuf && <p className="text-[10px] text-red-400">⚠ Stock insuficiente ({productoSel.stock} disponibles)</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-[var(--c-text3)]">Cantidad:</label>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setCantidad(c => Math.max(1,c-1))} className="w-7 h-7 rounded-lg bg-[var(--c-input)] border border-[var(--c-border)] text-[var(--c-text)] flex items-center justify-center">−</button>
                      <span className="w-8 text-center text-sm font-bold text-[var(--c-text)]">{cantidad}</span>
                      <button type="button" onClick={() => setCantidad(c => c+1)} className="w-7 h-7 rounded-lg bg-[var(--c-input)] border border-[var(--c-border)] text-[var(--c-text)] flex items-center justify-center">+</button>
                    </div>
                  </div>
                  
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Monto *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
                {productoId ? (
                  <>
                    <input type="text" readOnly value={montoCalculado.toLocaleString("es-CL")}
                      className={`${inp} pl-6 bg-[var(--c-card2)] text-emerald-400 font-bold cursor-not-allowed`} />
                    <input type="hidden" name="monto" value={montoCalculado} />
                  </>
                ) : (
                  <input name="monto" type="number" required min="1" defaultValue={0} placeholder="0" className={`${inp} pl-6`} />
                )}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Fecha venta *</label>
              <input name="fechaVenta" type="date" required defaultValue={localToday()} className={inp} />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Fecha vencimiento</label>
            <input name="fechaVence" type="date" className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Observaciones</label>
            <input name="observaciones" placeholder="Ej: Cliente habitual, acordó pago en 30 días..." className={inp} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-11 border border-[var(--c-border)] text-[var(--c-text3)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all">Cancelar</button>
            <button type="submit" disabled={isPending} className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20">{isPending ? "Creando..." : "Crear cuenta"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

function FormPago({ cuenta, onClose, onSuccess }: { cuenta: Cuenta; onClose: () => void; onSuccess: () => void }) {
  const [isPending, start] = useTransition()
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      try { await registrarPagoCuenta(cuenta.id, fd); toast.success("Pago registrado ✅"); onSuccess() }
      catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }
  const pct = cuenta.montoOriginal > 0 ? Math.round((cuenta.totalPagado / cuenta.montoOriginal) * 100) : 0
  if (!montado) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
        <div className="px-6 pt-5 pb-4 border-b border-[var(--c-border)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[var(--c-text)]">Registrar pago</h2>
            <p className="text-xs text-[var(--c-text3)] mt-0.5">Cuenta #{cuenta.numero} · {cuenta.cliente.nombre}</p>
          </div>
          <button onClick={onClose} className="text-[var(--c-text3)] w-8 h-8 rounded-xl hover:bg-[var(--c-hover)] flex items-center justify-center text-lg">×</button>
        </div>
        <div className="px-6 pt-4">
          <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-[var(--c-text3)]">Saldo pendiente</span>
              <span className="text-sm font-bold text-red-400">{formatCLP(cuenta.saldoPendiente)}</span>
            </div>
            <div className="h-2 bg-[var(--c-border)] rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-[var(--c-text3)] mt-1">{pct}% pagado de {formatCLP(cuenta.montoOriginal)}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Monto *</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span><input name="monto" type="number" required min="1" max={cuenta.saldoPendiente} placeholder="0" className={`${inp} pl-6`} /></div>
            </div>
            <div>
              <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Fecha *</label>
              <input name="fecha" type="date" required defaultValue={localToday()} className={inp} />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Método de pago</label>
            <select name="metodoPago" className={sel}>{METODOS_PAGO.map(m => <option key={m}>{m}</option>)}</select>
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1.5">Descripción</label>
            <input name="descripcion" placeholder="Abono, pago completo..." className={inp} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 h-11 border border-[var(--c-border)] text-[var(--c-text3)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all">Cancelar</button>
            <button type="submit" disabled={isPending} className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">{isPending ? "Registrando..." : "Registrar pago"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

function DetalleCuenta({ cuenta, score, onClose, onPago, nombreNegocio, usuarioEnvia, plantillas }: { cuenta: Cuenta; score: string; onClose: () => void; onPago: () => void; nombreNegocio: string; usuarioEnvia: string; plantillas: Record<1|2|3, string> }) {
  const cfg = ESTADO_CFG[cuenta.estado] ?? ESTADO_CFG.pendiente
  const scoreCfg = SCORE_CFG[score as keyof typeof SCORE_CFG] ?? SCORE_CFG.excelente
  const pct = cuenta.montoOriginal > 0 ? Math.round((cuenta.totalPagado / cuenta.montoOriginal) * 100) : 0

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden h-full flex flex-col">
      <div className="px-5 py-4 border-b border-[var(--c-border)] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--c-text)]">Venta #{cuenta.numero}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>{cfg.label}</span>
          </div>
          <p className="text-xs text-[var(--c-text3)] mt-0.5">{cuenta.cliente.nombre} {cuenta.cliente.apellido ?? ""} · {cuenta.cliente.telefono ?? ""}</p>
        </div>
        <button onClick={onClose} className="text-[var(--c-text3)] w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-lg">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Info */}
        <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4 space-y-2">
          {[
            { label: "Fecha venta", val: formatFecha(cuenta.fechaVenta) },
            { label: "Vencimiento", val: cuenta.fechaVence ? formatFecha(cuenta.fechaVence) : "Sin fecha", color: cuenta.estado === "vencida" ? "text-red-400" : undefined },
            { label: "Monto total", val: formatCLP(cuenta.montoOriginal) },
            { label: "Saldo pendiente", val: formatCLP(cuenta.saldoPendiente), color: "text-red-400" },
            { label: "Estado", val: cfg.label, color: cfg.color },
            { label: "Días de atraso", val: cuenta.estado === "pagada" || cuenta.saldoPendiente === 0 ? "Al día ✓" : cuenta.diasAtraso > 0 ? `${cuenta.diasAtraso} días` : "—", color: cuenta.estado === "pagada" || cuenta.saldoPendiente === 0 ? "text-emerald-400" : cuenta.diasAtraso > 0 ? "text-red-400" : undefined },
            ...(cuenta.utilidadEsperada != null ? [
              { label: "Utilidad esperada", val: formatCLP(cuenta.utilidadEsperada), color: cuenta.utilidadEsperada >= 0 ? "text-emerald-400" : "text-red-400" },
              { label: "Utilidad pendiente de cobro", val: formatCLP(cuenta.utilidadPendiente ?? 0), color: "text-[var(--c-warning)]" },
            ] : []),
          ].map(r => (
            <div key={r.label} className="flex justify-between py-1 border-b border-[var(--c-border2)] last:border-0">
              <span className="text-xs text-[var(--c-text3)]">{r.label}</span>
              <span className={`text-xs font-semibold ${r.color ?? "text-[var(--c-text)]"}`}>{r.val}</span>
            </div>
          ))}
          {cuenta.observaciones && <p className="text-xs text-[var(--c-text3)] pt-1 italic">"{cuenta.observaciones}"</p>}
        </div>

        {/* Score */}
        <div className={`flex items-center gap-3 ${scoreCfg.bg} border ${scoreCfg.border} rounded-xl p-3`}>
          <span className="text-xl">{scoreCfg.dot}</span>
          <div>
            <p className={`text-xs font-bold ${scoreCfg.color}`}>{scoreCfg.label}</p>
            <p className="text-[10px] text-[var(--c-text3)]">Clasificación de este cliente</p>
          </div>
        </div>

        {/* Progreso */}
        <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4">
          <div className="flex justify-between mb-2">
            <span className="text-xs text-[var(--c-text3)]">Progreso de pago</span>
            <span className="text-xs font-bold text-[var(--c-text)]">{pct}%</span>
          </div>
          <div className="h-3 bg-[var(--c-border)] rounded-full overflow-hidden mb-2">
            <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-[var(--c-text3)]">{formatCLP(cuenta.totalPagado)} pagado de {formatCLP(cuenta.montoOriginal)}</p>
        </div>

        {/* Historial pagos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-[var(--c-text)]">Historial de pagos</p>
            {cuenta.estado !== "pagada" && (
              <button onClick={onPago} className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg transition-all">+ Registrar pago</button>
            )}
          </div>
          {cuenta.pagos.length === 0 ? (
            <div className="text-center py-6 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl">
              <p className="text-2xl mb-1">💳</p><p className="text-xs text-[var(--c-text3)]">Sin pagos registrados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cuenta.pagos.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-400">+{formatCLP(p.monto)}</p>
                    <p className="text-[10px] text-[var(--c-text3)]">{formatFecha(p.fecha)} · {p.metodoPago} {p.descripcion ? `· ${p.descripcion}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Centro de cobranza */}
        {cuenta.estado !== "pagada" && cuenta.saldoPendiente > 0 && (
          <CentroCobranza cuenta={cuenta} plantillas={plantillas} nombreNegocio={nombreNegocio} usuarioEnvia={usuarioEnvia} />
        )}

        {/* Acciones rápidas */}
        {cuenta.estado !== "pagada" && (
          <button onClick={onPago} className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold rounded-xl transition-all">💰 Registrar pago</button>
        )}
      </div>
    </div>
  )
}

export function CuentasCobrarClient({ cuentasData, clientes, scoreClientes, metricas, productos = [], nombreNegocio, usuarioEnvia, plantillas }: Props) {
  const [filtro, setFiltro] = useState<"todas"|"pendientes"|"vencidas"|"porVencer"|"pagadas">("todas")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showPago, setShowPago] = useState(false)

  const selected = useMemo(() => cuentasData.find(c => c.id === selectedId) ?? null, [cuentasData, selectedId])
  const scoreMap = useMemo(() => Object.fromEntries(scoreClientes.map(s => [s.id, s.score])), [scoreClientes])

  const filtradas = useMemo(() => {
    let list = cuentasData
    if (search) { const q = search.toLowerCase(); list = list.filter(c => `${c.cliente.nombre} ${c.cliente.apellido ?? ""} venta #${c.numero}`.toLowerCase().includes(q)) }
    switch (filtro) {
      case "pendientes":  return list.filter(c => c.estado === "pendiente")
      case "vencidas":    return list.filter(c => c.estado === "vencida")
      case "porVencer":   return list.filter(c => c.estado !== "pagada" && c.fechaVence && new Date(c.fechaVence) <= new Date(Date.now() + 7*86400000) && new Date(c.fechaVence) >= new Date())
      case "pagadas":     return list.filter(c => c.estado === "pagada")
    }
    return list
  }, [cuentasData, search, filtro])

  const [isPending, start] = useTransition()

  const TABS = [
    { key: "todas" as const, label: `Todas (${cuentasData.length})` },
    { key: "pendientes" as const, label: `Pendientes (${metricas.countPendientes - metricas.countVencidas})` },
    { key: "vencidas" as const, label: `Vencidas (${metricas.countVencidas})` },
    { key: "porVencer" as const, label: `Por vencer (${metricas.countPorVencer})` },
    { key: "pagadas" as const, label: `Pagadas (${cuentasData.filter(c=>c.estado==="pagada").length})` },
  ]

  return (
    <div className="space-y-5 animate-fade-up">
      {showForm && <FormCuenta clientes={clientes} productos={productos} onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); window.location.reload() }} />}
      {showPago && selected && <FormPago cuenta={selected} onClose={() => setShowPago(false)} onSuccess={() => { setShowPago(false); window.location.reload() }} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Cuentas por cobrar</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Gestiona y controla las ventas a crédito</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20 whitespace-nowrap">+ Nueva cuenta por cobrar</button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total por cobrar", val: formatCLP(metricas.totalPorCobrar), sub: `${metricas.countPendientes} pendientes`, icon: "💰", color: "text-sky-400" },
          { label: "Vencidas", val: formatCLP(metricas.totalVencido), sub: `${metricas.countVencidas} cuentas`, icon: "⚠️", color: "text-red-400" },
          { label: "Por vencer (7 días)", val: formatCLP(metricas.totalPorVencer), sub: `${metricas.countPorVencer} próximas`, icon: "📅", color: "text-[var(--c-warning)]" },
          { label: "Cobrado este mes", val: formatCLP(metricas.cobradoEsteMes), sub: "Recuperado", icon: "✅", color: "text-emerald-400" },
          { label: "Mora promedio", val: `${metricas.diasPromedioMora} días`, sub: "Promedio atraso", icon: "🕐", color: "text-violet-400" },
          { label: "Tasa cobranza", val: `${metricas.tasaCobranza}%`, sub: "Del total emitido", icon: "📊", color: metricas.tasaCobranza >= 80 ? "text-emerald-400" : "text-[var(--c-warning)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider leading-tight">{c.label}</p>
              <span className="text-base">{c.icon}</span>
            </div>
            <p className={`text-xl font-black ${c.color}`}>{c.val}</p>
            <p className="text-[10px] text-[var(--c-text3)] mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Lista */}
        <div className="lg:col-span-2 bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--c-border)]">
            <div className="flex gap-1 flex-wrap mb-3 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setFiltro(t.key)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold border whitespace-nowrap transition-all ${filtro === t.key ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "border-transparent text-[var(--c-text3)] hover:text-[var(--c-text)]"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente o número..."
                className="w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl pl-8 pr-3 text-xs text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors" />
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto flex-1">
            {filtradas.length === 0 ? (
              <div className="text-center py-16"><p className="text-4xl mb-3">📋</p><p className="text-sm text-[var(--c-text3)]">Sin cuentas en esta categoría</p></div>
            ) : (
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-[var(--c-border)] bg-[var(--c-card2)]">
                    {["Cliente","Documento","Vencimiento","Monto","Saldo","Estado","Días"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--c-text3)] uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(c => {
                    const cfg = ESTADO_CFG[c.estado] ?? ESTADO_CFG.pendiente
                    const score = scoreMap[c.cliente.id] ?? "excelente"
                    const sCfg = SCORE_CFG[score as keyof typeof SCORE_CFG]
                    return (
                      <tr key={c.id} onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                        className={`border-b border-[var(--c-border2)] cursor-pointer transition-all ${selectedId === c.id ? "bg-sky-500/5" : "hover:bg-[var(--c-hover)]"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-[10px] font-bold text-sky-400 flex-shrink-0">{getInitials(c.cliente.nombre, c.cliente.apellido)}</div>
                            <div>
                              <p className="font-semibold text-[var(--c-text)]">{c.cliente.nombre} {c.cliente.apellido ?? ""}</p>
                              <span className={`text-[9px] ${sCfg.color}`}>{sCfg.dot}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--c-text3)]">Venta #{c.numero}</td>
                        <td className="px-4 py-3">
                          {c.fechaVence ? <span className={c.estado === "vencida" ? "text-red-400 font-semibold" : "text-[var(--c-text2)]"}>{formatFecha(c.fechaVence)}</span> : <span className="text-[var(--c-text4)]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-[var(--c-text)]">{formatCLP(c.montoOriginal)}</td>
                        <td className={`px-4 py-3 font-bold ${c.saldoPendiente > 0 ? "text-red-400" : "text-emerald-400"}`}>{formatCLP(c.saldoPendiente)}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>{cfg.label}</span></td>
                        <td className={`px-4 py-3 font-semibold ${c.estado === "pagada" || c.saldoPendiente === 0 ? "text-emerald-400" : c.diasAtraso > 0 ? "text-red-400" : "text-[var(--c-text3)]"}`}>
                        {c.estado === "pagada" || c.saldoPendiente === 0 ? "✓" : c.diasAtraso > 0 ? `+${c.diasAtraso}` : c.diasHastaVence !== null ? `${c.diasHastaVence}d` : "—"}
                      </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Ranking clientes */}
          {cuentasData.filter(c => c.estado !== "pagada").length > 0 && (
            <div className="border-t border-[var(--c-border)] px-5 py-4">
              <p className="text-xs font-semibold text-[var(--c-text)] mb-3">Clientes con mayor deuda pendiente</p>
              <div className="space-y-2">
                {Object.entries(
                  cuentasData.filter(c => c.estado !== "pagada").reduce((acc: Record<string, { nombre: string; total: number; score: string }>, c) => {
                    const key = c.cliente.id
                    if (!acc[key]) acc[key] = { nombre: `${c.cliente.nombre} ${c.cliente.apellido ?? ""}`.trim(), total: 0, score: scoreMap[key] ?? "excelente" }
                    acc[key].total += c.saldoPendiente
                    return acc
                  }, {})
                ).sort((a, b) => b[1].total - a[1].total).slice(0, 4).map(([id, { nombre, total, score }], i) => {
                  const sCfg = SCORE_CFG[score as keyof typeof SCORE_CFG]
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[var(--c-text4)] w-4">#{i+1}</span>
                      <p className="flex-1 text-xs text-[var(--c-text)]">{nombre} <span className={`text-[10px] ${sCfg.color}`}>{sCfg.dot}</span></p>
                      <span className="text-xs font-bold text-red-400">{formatCLP(total)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Panel detalle */}
        <div>
          {selected ? (
            <DetalleCuenta cuenta={selected} score={scoreMap[selected.cliente.id] ?? "excelente"} onClose={() => setSelectedId(null)} onPago={() => setShowPago(true)} nombreNegocio={nombreNegocio} usuarioEnvia={usuarioEnvia} plantillas={plantillas} />
          ) : (
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl h-full flex items-center justify-center p-10 text-center min-h-[400px]">
              <div><p className="text-4xl mb-3">👈</p><p className="text-sm font-semibold text-[var(--c-text)]">Selecciona una cuenta</p><p className="text-xs text-[var(--c-text3)] mt-1">Haz clic en cualquier fila para ver el detalle</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
