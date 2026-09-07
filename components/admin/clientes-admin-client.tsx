"use client"
import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { formatCLP } from "@/lib/utils"
import {
  registrarPagoCobro, actualizarNotaCliente, crearSuscripcionParaUsuario, crearClienteNelyx,
  actualizarSuscripcion, cambiarEstadoCliente,
} from "@/app/actions/admin-acciones"

const PLANES_UI: Record<string, { label: string; precio: number; meses: number }> = {
  mensual:    { label: "Mensual",    precio: 20000,  meses: 1 },
  trimestral: { label: "Trimestral", precio: 60000,  meses: 3 },
  semestral:  { label: "Semestral",  precio: 120000, meses: 6 },
  anual:      { label: "Anual",      precio: 240000, meses: 12 },
}

type Pago = { id: string; fecha: string; monto: number; metodoPago: string; observacion: string | null; estado: string }
type Cobro = { id: string; plan: string; monto: number; fechaEmision: string; fechaVencimiento: string; estado: string }
type Cliente = {
  id: string; nombre: string; email: string; negocio: string | null; activo: boolean
  createdAt: string; estado: string; suscripcionId: string | null; plan: string; planLabel: string
  fechaInicio: string; fechaFinPrueba: string | null; fechaProximoCobro: string | null
  precioPlan: number; renovacionAutomatica: boolean
  ultimoAcceso: string | null; diasSinAcceso: number | null; notas: string | null
  salud: number; movimientos: number; productos: number; clientesCount: number; ventas: number
  cobroPendiente: Cobro | null; historialCobros: Cobro[]; pagos: Pago[]
}
type Metricas = {
  activos: number; enPrueba: number; proximosVencer: number; pendientes: number; vencidos: number
  suspendidos: number; cancelados: number; mrr: number; pagosPendientes: number; montoPendiente: number
  tasaRenovacion: number; total: number
}
type Alerta = { tipo: string; mensaje: string; clienteId: string; color: string }

type Filtro = "todos" | "prueba_gratuita" | "al_dia" | "pendiente" | "proximo_vencer" | "vencido" | "suspendido" | "cancelado"

const ESTADO_CFG: Record<string, { label: string; cls: string; dot: string }> = {
  prueba_gratuita: { label: "Prueba gratuita",  cls: "bg-blue-500/10 text-blue-400 border-blue-500/20",       dot: "bg-blue-400" },
  al_dia:          { label: "Al día",           cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  pendiente:       { label: "Pendiente",        cls: "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20",    dot: "bg-amber-400" },
  proximo_vencer:  { label: "Próximo a vencer", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400" },
  vencido:         { label: "Vencido",          cls: "bg-red-500/10 text-red-400 border-red-500/20",          dot: "bg-red-400" },
  suspendido:      { label: "Suspendido",       cls: "bg-slate-500/10 text-slate-400 border-slate-500/20",    dot: "bg-slate-400" },
  cancelado:       { label: "Cancelado",        cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",       dot: "bg-zinc-400" },
}

function initials(name: string) { return name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() }
function fmtDate(iso: string | null) { if (!iso) return "—"; return new Date(iso).toLocaleDateString("es-CL", { day:"2-digit", month:"short", year:"numeric" }) }
function diasHasta(iso: string | null) { if (!iso) return null; return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) }
function saludLabel(s: number) { return s >= 80 ? "Excelente" : s >= 60 ? "Buena" : s >= 40 ? "Riesgo" : "Crítico" }
function saludColor(s: number) { return s >= 80 ? "text-emerald-400" : s >= 60 ? "text-[var(--c-warning)]" : "text-red-400" }
function saludBar(s: number) { return s >= 80 ? "#4ade80" : s >= 60 ? "#facc15" : "#f87171" }

function MetricCard({ icon, label, value, sub, subColor }: { icon: string; label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-[var(--c-text3)] font-medium">{label}</span>
      </div>
      <p className="text-2xl font-black text-[var(--c-text)] leading-none mb-1">{value}</p>
      {sub && <p className={`text-[11px] font-semibold ${subColor ?? "text-[var(--c-text4)]"}`}>{sub}</p>}
    </div>
  )
}

function SaludBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: saludBar(value) }} />
      </div>
      <span className="text-xs font-semibold" style={{ color: saludBar(value) }}>{value}%</span>
    </div>
  )
}

// ── Banner de alertas ─────────────────────────────────────────────────
function AlertasBanner({ alertas, onSelect }: { alertas: Alerta[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(true)
  if (alertas.length === 0) return null
  const colorCls: Record<string, string> = {
    blue: "border-blue-500/20 bg-blue-500/5 text-blue-300",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-300",
    red: "border-red-500/20 bg-red-500/5 text-red-300",
    slate: "border-slate-500/20 bg-slate-500/5 text-slate-300",
  }
  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3">
        <span className="text-xs font-bold text-[var(--c-text)] flex items-center gap-2">🔔 Alertas <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10">{alertas.length}</span></span>
        <span className="text-[var(--c-text4)] text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {alertas.map((a, i) => (
            <button key={i} onClick={() => onSelect(a.clienteId)}
              className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium ${colorCls[a.color] ?? colorCls.slate}`}>
              {a.mensaje}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FormPago({ cobro, onClose }: { cobro: Cobro; onClose: () => void }) {
  const [pending, start] = useTransition()
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set("cobroId", cobro.id)
    start(async () => { await registrarPagoCobro(fd); toast.success("✅ Pago registrado"); onClose() })
  }
  const inp = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500"
  return (
    <form onSubmit={submit} className="space-y-3 p-3 bg-[var(--c-card2)] rounded-xl border border-[var(--c-border)]">
      <p className="text-xs font-bold text-[var(--c-text)]">Registrar pago — {formatCLP(cobro.monto)}</p>
      <select name="metodoPago" className={inp}><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="otro">Otro</option></select>
      <input name="observacion" placeholder="Observación (opcional)" className={inp} />
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 h-8 text-xs border border-[var(--c-border)] rounded-lg text-[var(--c-text3)] hover:bg-[var(--c-hover)]">Cancelar</button>
        <button type="submit" disabled={pending} className="flex-1 h-8 text-xs bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg disabled:opacity-50">{pending ? "..." : "Confirmar pago"}</button>
      </div>
    </form>
  )
}

function FormEditarSuscripcion({ c, onClose }: { c: Cliente; onClose: () => void }) {
  const [pending, start] = useTransition()
  const [plan, setPlan] = useState(c.plan in PLANES_UI ? c.plan : "mensual")
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!c.suscripcionId) return
    const fd = new FormData(e.currentTarget)
    fd.set("suscripcionId", c.suscripcionId)
    start(async () => { await actualizarSuscripcion(fd); toast.success("✅ Suscripción actualizada"); onClose() })
  }
  const inp = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500"
  const proximoCobroDefault = c.fechaProximoCobro ? c.fechaProximoCobro.slice(0, 10) : ""
  return (
    <form onSubmit={submit} className="space-y-3 p-3 bg-[var(--c-card2)] rounded-xl border border-[var(--c-border)]">
      <p className="text-xs font-bold text-[var(--c-text)]">Editar suscripción</p>
      <div>
        <label className="text-[10px] text-[var(--c-text4)]">Plan</label>
        <select name="plan" value={plan} onChange={e => setPlan(e.target.value)} className={inp}>
          {Object.entries(PLANES_UI).map(([key, p]) => (
            <option key={key} value={key}>{p.label} — {formatCLP(p.precio)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-[var(--c-text4)]">Fecha próximo cobro</label>
        <input name="fechaProximoCobro" type="date" defaultValue={proximoCobroDefault} className={inp} />
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--c-text2)]">
        <input name="renovacionAutomatica" type="checkbox" defaultChecked={c.renovacionAutomatica} className="accent-sky-500" />
        Renovación automática
      </label>
      <label className="flex items-center gap-2 text-xs text-[var(--c-text2)]">
        <input name="generarCobroAhora" type="checkbox" className="accent-sky-500" />
        Generar cobro por el nuevo plan ahora ({formatCLP(PLANES_UI[plan]?.precio ?? 0)})
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 h-8 text-xs border border-[var(--c-border)] rounded-lg text-[var(--c-text3)] hover:bg-[var(--c-hover)]">Cancelar</button>
        <button type="submit" disabled={pending} className="flex-1 h-8 text-xs bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-lg disabled:opacity-50">{pending ? "..." : "Guardar"}</button>
      </div>
    </form>
  )
}

function FormNuevoCliente({ onClose }: { onClose: () => void }) {
  const [pending, start] = useTransition()
  const [plan, setPlan] = useState("prueba_gratuita")
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => { await crearClienteNelyx(fd); toast.success("✅ Cliente creado"); onClose() })
  }
  const inp = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500"
  const sel = "w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)"}}>
      <form onSubmit={submit} className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-[var(--c-text)]">Nuevo cliente</p>
          <button type="button" onClick={onClose} className="text-[var(--c-text4)] hover:text-[var(--c-text)] text-lg">✕</button>
        </div>
        <input name="nombre" required placeholder="Nombre completo *" className={inp} />
        <input name="email" type="email" required placeholder="Email *" className={inp} />
        <input name="negocio" placeholder="Nombre del negocio" className={inp} />
        <input name="password" type="password" placeholder="Contraseña (def: nelyx2024)" className={inp} />
        <div>
          <label className="text-[10px] text-[var(--c-text4)]">Plan</label>
          <select name="plan" value={plan} onChange={e => setPlan(e.target.value)} className={sel}>
            <option value="prueba_gratuita">🎁 Prueba gratuita (1 mes)</option>
            {Object.entries(PLANES_UI).map(([key, p]) => (
              <option key={key} value={key}>{p.label} — {formatCLP(p.precio)}</option>
            ))}
          </select>
          {plan === "prueba_gratuita" ? (
            <p className="text-[10px] text-blue-400 mt-1">No se generará ningún cobro durante el mes de prueba.</p>
          ) : (
            <p className="text-[10px] text-[var(--c-warning)] mt-1">Se generará un cobro pendiente de {formatCLP(PLANES_UI[plan].precio)} de inmediato.</p>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 h-10 text-sm border border-[var(--c-border)] rounded-xl text-[var(--c-text3)] hover:bg-[var(--c-hover)]">Cancelar</button>
          <button type="submit" disabled={pending} className="flex-1 h-10 text-sm bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl disabled:opacity-50">{pending ? "Creando..." : "Crear cliente"}</button>
        </div>
      </form>
    </div>
  )
}

function DetailPanel({ c, onClose }: { c: Cliente; onClose: () => void }) {
  const [showPago, setShowPago] = useState(false)
  const [showEditar, setShowEditar] = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const [nota, setNota] = useState(c.notas ?? "")
  const [pending, start] = useTransition()
  const cfg = ESTADO_CFG[c.estado] ?? ESTADO_CFG.al_dia

  function guardarNota() {
    if (!c.suscripcionId) return
    start(async () => { await actualizarNotaCliente(c.suscripcionId!, nota); toast.success("Nota guardada") })
  }
  function crearSuscripcion() {
    start(async () => { await crearSuscripcionParaUsuario(c.id); toast.success("Suscripción creada") })
  }
  function toggleSuspender() {
    if (!c.suscripcionId) return
    const nuevoEstado = c.estado === "suspendido" ? "al_dia" : "suspendido"
    if (!confirm(nuevoEstado === "suspendido" ? "¿Suspender esta cuenta?" : "¿Reactivar esta cuenta?")) return
    start(async () => { await cambiarEstadoCliente(c.suscripcionId!, nuevoEstado); toast.success("Estado actualizado") })
  }
  function cancelar() {
    if (!c.suscripcionId) return
    if (!confirm("¿Cancelar definitivamente esta suscripción?")) return
    start(async () => { await cambiarEstadoCliente(c.suscripcionId!, "cancelado"); toast.success("Suscripción cancelada") })
  }

  const diasRestantesPrueba = c.estado === "prueba_gratuita" ? diasHasta(c.fechaFinPrueba) : null
  const diasParaRenovar = (c.estado === "al_dia" || c.estado === "proximo_vencer") ? diasHasta(c.fechaProximoCobro) : null

  const historialCompleto = useMemo(() => {
    const items: { fecha: string; label: string; monto: number; badge: string; badgeColor: string }[] = []
    for (const p of c.pagos) items.push({ fecha: p.fecha, label: `Pago (${p.metodoPago})`, monto: p.monto, badge: "Pagado", badgeColor: "text-emerald-400" })
    for (const cobro of c.historialCobros) {
      if (cobro.estado !== "pagado") {
        items.push({ fecha: cobro.fechaEmision, label: `Cobro ${cobro.plan}`, monto: cobro.monto, badge: cobro.estado === "vencido" ? "Vencido" : "Pendiente", badgeColor: cobro.estado === "vencido" ? "text-red-400" : "text-[var(--c-warning)]" })
      }
    }
    return items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  }, [c.pagos, c.historialCobros])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-[var(--c-text)] flex-shrink-0"
            style={{background:"linear-gradient(135deg,#3b82f6,#8b5cf6)"}}>
            {initials(c.nombre)}
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--c-text)]">{c.negocio ?? c.nombre}</p>
            <p className="text-[11px] text-[var(--c-text4)]">{c.email}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-[var(--c-card2)] text-[var(--c-text4)] text-sm flex items-center justify-center hover:bg-[var(--c-hover)]">✕</button>
      </div>

      <div className="flex gap-2 px-5 py-3 border-b border-[var(--c-border)] flex-shrink-0">
        <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${cfg.cls}`}>{cfg.label}</span>
        <span className="text-xs px-2.5 py-1 rounded-full border border-[var(--c-border)] text-[var(--c-text3)]">{c.planLabel}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Suscripción */}
        {c.suscripcionId ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-[var(--c-text)]">Suscripción</p>
              <button onClick={() => setShowEditar(!showEditar)} className="text-xs text-sky-400 hover:text-sky-300">✎ Editar suscripción</button>
            </div>

            {showEditar && <div className="mb-3"><FormEditarSuscripcion c={c} onClose={() => setShowEditar(false)} /></div>}

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              {[
                ["Plan actual", c.planLabel],
                ["Precio", c.precioPlan > 0 ? `${formatCLP(c.precioPlan)}` : "Gratis"],
                ["Estado", cfg.label],
                ["Renovación automática", c.renovacionAutomatica ? "Activada" : "Desactivada"],
                c.estado === "prueba_gratuita"
                  ? ["Tiempo restante de prueba", diasRestantesPrueba !== null ? `${diasRestantesPrueba}d` : "—"]
                  : ["Días para renovar", diasParaRenovar !== null ? `${diasParaRenovar}d` : "—"],
                [c.estado === "prueba_gratuita" ? "Fin de prueba" : "Próximo cobro", fmtDate(c.estado === "prueba_gratuita" ? c.fechaFinPrueba : c.fechaProximoCobro)],
              ].map(([k, v]) => (
                <div key={k}><p className="text-[var(--c-text4)]">{k}</p><p className="text-[var(--c-text)] font-semibold mt-0.5">{v}</p></div>
              ))}
            </div>

            {c.cobroPendiente && (
              <div className="mt-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <p className="text-xs text-amber-300 font-semibold">Monto próximo: {formatCLP(c.cobroPendiente.monto)}</p>
                <p className="text-[10px] text-[var(--c-text4)] mt-0.5">Vence {fmtDate(c.cobroPendiente.fechaVencimiento)}</p>
              </div>
            )}

            <button onClick={() => setShowHistorial(!showHistorial)}
              className="mt-3 text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
              🧾 Ver historial de suscripción {showHistorial ? "▲" : "▼"}
            </button>
            {showHistorial && (
              <div className="mt-2 space-y-1.5">
                {historialCompleto.length === 0 ? <p className="text-xs text-[var(--c-text4)]">Sin movimientos registrados.</p> : (
                  historialCompleto.map((h, i) => (
                    <div key={i} className="flex items-center justify-between bg-[var(--c-card2)] rounded-lg px-3 py-1.5 text-xs">
                      <div>
                        <p className="text-[var(--c-text)] font-semibold">{formatCLP(h.monto)} · {h.label}</p>
                        <p className="text-[var(--c-text4)]">{fmtDate(h.fecha)}</p>
                      </div>
                      <span className={`font-semibold ${h.badgeColor}`}>{h.badge}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs text-[var(--c-text4)] mb-2">Sin suscripción configurada.</p>
            <button onClick={crearSuscripcion} disabled={pending}
              className="text-xs text-sky-400 hover:text-sky-300">+ Crear suscripción</button>
          </div>
        )}

        {/* Uso y actividad */}
        <div>
          <p className="text-xs font-bold text-[var(--c-text)] mb-3">Uso y actividad</p>
          <div className="mb-3">
            <p className="text-[11px] text-[var(--c-text4)] mb-1">Salud del cliente</p>
            <p className={`text-2xl font-black ${saludColor(c.salud)}`}>{c.salud}%</p>
            <p className={`text-xs font-semibold ${saludColor(c.salud)}`}>{saludLabel(c.salud)}</p>
            <div className="mt-1.5 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${c.salud}%`, background: saludBar(c.salud) }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["Último acceso", c.ultimoAcceso ? `Hace ${c.diasSinAcceso}d` : "Nunca"],
              ["Días sin ingresar", c.diasSinAcceso !== null ? `${c.diasSinAcceso} días` : "—"],
              ["Movimientos", c.movimientos],
              ["Productos", c.productos],
              ["Clientes", c.clientesCount],
              ["Ventas registradas", c.ventas],
            ].map(([k, v]) => (
              <div key={k as string} className="bg-[var(--c-card2)] rounded-lg p-2">
                <p className="text-[var(--c-text4)]">{k}</p>
                <p className="text-[var(--c-text)] font-bold mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pago form */}
        {showPago && c.cobroPendiente && (
          <FormPago cobro={c.cobroPendiente} onClose={() => setShowPago(false)} />
        )}

        {/* Acciones rápidas */}
        <div>
          <p className="text-xs font-bold text-[var(--c-text)] mb-2">Acciones rápidas</p>
          <div className="grid grid-cols-3 gap-2">
            {c.cobroPendiente && (
              <button onClick={() => setShowPago(!showPago)} disabled={pending}
                className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] hover:bg-[var(--c-hover)] transition-all disabled:opacity-50">
                <span className="text-lg">💵</span>
                <span className="text-[9px] font-semibold text-center text-emerald-400">Registrar pago</span>
              </button>
            )}
            <button onClick={toggleSuspender} disabled={pending}
              className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] hover:bg-[var(--c-hover)] transition-all disabled:opacity-50">
              <span className="text-lg">🚫</span>
              <span className={`text-[9px] font-semibold text-center ${c.estado === "suspendido" ? "text-emerald-400" : "text-red-400"}`}>{c.estado === "suspendido" ? "Reactivar" : "Suspender"}</span>
            </button>
            {c.estado !== "cancelado" && (
              <button onClick={cancelar} disabled={pending}
                className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] hover:bg-[var(--c-hover)] transition-all disabled:opacity-50">
                <span className="text-lg">✕</span>
                <span className="text-[9px] font-semibold text-center text-zinc-400">Cancelar</span>
              </button>
            )}
          </div>
        </div>

        {/* Notas internas */}
        <div>
          <p className="text-xs font-bold text-[var(--c-text)] mb-2">Notas internas</p>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder="Notas sobre este cliente..."
            className="w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 py-2 text-xs text-[var(--c-text)] outline-none focus:border-sky-500 resize-none placeholder:text-[var(--c-text4)]" />
          <button onClick={guardarNota} disabled={pending}
            className="mt-1.5 text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50">Guardar nota</button>
        </div>
      </div>
    </div>
  )
}

export function ClientesAdminClient({ clientes, metricas, alertas }: { clientes: Cliente[]; metricas: Metricas; alertas: Alerta[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [busqueda, setBusqueda] = useState("")
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [showNuevo, setShowNuevo] = useState(false)

  const filtrados = useMemo(() => {
    let list = clientes
    if (filtro !== "todos") list = list.filter(c => c.estado === filtro)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      list = list.filter(c => c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.negocio?.toLowerCase().includes(q)))
    }
    return list
  }, [clientes, filtro, busqueda])

  const selectedUpdated = selected ? clientes.find(c => c.id === selected.id) ?? selected : null

  const TABS: { key: Filtro; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: metricas.total },
    { key: "prueba_gratuita", label: "Prueba gratuita", count: metricas.enPrueba },
    { key: "al_dia", label: "Al día", count: metricas.activos },
    { key: "pendiente", label: "Pendientes", count: metricas.pendientes },
    { key: "proximo_vencer", label: "Próximos a vencer", count: metricas.proximosVencer },
    { key: "vencido", label: "Vencidos", count: metricas.vencidos },
    { key: "suspendido", label: "Suspendidos", count: metricas.suspendidos },
  ]

  function seleccionarPorId(id: string) {
    const c = clientes.find(x => x.id === id)
    if (c) setSelected(c)
  }

  return (
    <div className="space-y-4 animate-fade-up pb-6">
      {showNuevo && <FormNuevoCliente onClose={() => setShowNuevo(false)} />}

      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/resumen" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--c-text3)] hover:text-sky-400 transition-colors w-fit">
          ← Volver al Dashboard
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Clientes NELYX</h1>
            <p className="text-sm text-[var(--c-text3)] mt-0.5">Panel administrativo de suscripciones — solo visible para ti.</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente..."
                className="h-9 pl-8 pr-4 w-full sm:w-48 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl text-sm text-[var(--c-text)] outline-none focus:border-sky-500 placeholder:text-[var(--c-text4)]" />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--c-text4)] text-sm">🔍</span>
            </div>
            <button onClick={() => setShowNuevo(true)}
              className="h-9 px-4 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap">
              + Nuevo cliente
            </button>
          </div>
        </div>
      </div>

      <AlertasBanner alertas={alertas} onSelect={seleccionarPorId} />

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard icon="👥" label="Clientes al día" value={String(metricas.activos)} sub={`${metricas.total} en total`} />
        <MetricCard icon="🎁" label="En prueba gratuita" value={String(metricas.enPrueba)} />
        <MetricCard icon="⏰" label="Próximos vencimientos" value={String(metricas.proximosVencer)} sub="En los próximos días" subColor="text-orange-400" />
        <MetricCard icon="⚠️" label="Pagos pendientes" value={String(metricas.pagosPendientes)} sub={`Total ${formatCLP(metricas.montoPendiente)}`} subColor="text-red-400" />
        <MetricCard icon="💰" label="MRR" value={formatCLP(metricas.mrr)} sub="Ingreso mensual recurrente" subColor="text-emerald-400" />
        <MetricCard icon="🔄" label="Tasa de renovación" value={`${metricas.tasaRenovacion}%`} sub={metricas.tasaRenovacion >= 80 ? "Excelente" : "A mejorar"} subColor={metricas.tasaRenovacion >= 80 ? "text-emerald-400" : "text-[var(--c-warning)]"} />
      </div>

      {/* Main area */}
      <div className={`grid gap-4 ${selectedUpdated ? "lg:grid-cols-[1fr_340px]" : "grid-cols-1"}`}>
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 pt-3 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setFiltro(t.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${filtro === t.key ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" : "text-[var(--c-text4)] hover:text-[var(--c-text)]"}`}>
                {t.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filtro === t.key ? "bg-sky-500/20" : "bg-white/5"}`}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Tabla — desktop / tablet */}
          <div className="hidden md:block mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--c-border2)]">
                  {["Cliente", "Estado", "Plan", "Inicio", "Próximo cobro", "Monto", "Salud", "Último acceso", ""].map(h => (
                    <th key={h} className="text-left text-[var(--c-text4)] font-semibold px-4 py-2.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--c-border2)]">
                {filtrados.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-[var(--c-text4)]">Sin clientes</td></tr>
                ) : filtrados.map(c => {
                  const cfg = ESTADO_CFG[c.estado] ?? ESTADO_CFG.al_dia
                  const isSelected = selectedUpdated?.id === c.id
                  const fechaRelevante = c.estado === "prueba_gratuita" ? c.fechaFinPrueba : c.fechaProximoCobro
                  return (
                    <tr key={c.id} onClick={() => setSelected(isSelected ? null : c)}
                      className={`cursor-pointer transition-all ${isSelected ? "bg-sky-500/5" : "hover:bg-[var(--c-hover)]"}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-[var(--c-text)] flex-shrink-0"
                            style={{background:"linear-gradient(135deg,#3b82f6,#8b5cf6)"}}>
                            {initials(c.nombre)}
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--c-text)] whitespace-nowrap">{c.negocio ?? c.nombre}</p>
                            <p className="text-[var(--c-text4)]">{c.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--c-text2)] whitespace-nowrap">{c.planLabel}</td>
                      <td className="px-4 py-3 text-[var(--c-text2)] whitespace-nowrap">{fmtDate(c.fechaInicio)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className={c.estado === "vencido" ? "text-red-400 font-semibold" : c.estado === "proximo_vencer" ? "text-orange-400 font-semibold" : "text-[var(--c-text2)]"}>
                          {fmtDate(fechaRelevante)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[var(--c-text2)] whitespace-nowrap">{c.precioPlan > 0 ? formatCLP(c.precioPlan) : "Gratis"}</td>
                      <td className="px-4 py-3"><SaludBar value={c.salud} /></td>
                      <td className="px-4 py-3 text-[var(--c-text2)] whitespace-nowrap">
                        {c.diasSinAcceso === null ? "Nunca" : c.diasSinAcceso === 0 ? "Hoy" : c.diasSinAcceso === 1 ? "Hace 1 día" : `Hace ${c.diasSinAcceso} días`}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={e => { e.stopPropagation(); setSelected(isSelected ? null : c) }}
                          className="text-[var(--c-text4)] hover:text-[var(--c-text)] text-base">···</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Cards — mobile */}
          <div className="md:hidden mt-3 px-3 pb-3 space-y-2">
            {filtrados.length === 0 ? (
              <p className="text-center py-10 text-[var(--c-text4)] text-sm">Sin clientes</p>
            ) : filtrados.map(c => {
              const cfg = ESTADO_CFG[c.estado] ?? ESTADO_CFG.al_dia
              const fechaRelevante = c.estado === "prueba_gratuita" ? c.fechaFinPrueba : c.fechaProximoCobro
              return (
                <button key={c.id} onClick={() => setSelected(c)}
                  className="w-full text-left bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 active:bg-[var(--c-hover)] transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-[var(--c-text)] flex-shrink-0"
                        style={{background:"linear-gradient(135deg,#3b82f6,#8b5cf6)"}}>
                        {initials(c.nombre)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--c-text)] text-sm truncate">{c.negocio ?? c.nombre}</p>
                        <p className="text-[var(--c-text4)] text-[11px] truncate">{c.email}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap flex-shrink-0 ${cfg.cls}`}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2.5 text-[11px]">
                    <span className="text-[var(--c-text3)]">{c.planLabel} · {c.precioPlan > 0 ? formatCLP(c.precioPlan) : "Gratis"}</span>
                    <span className={c.estado === "vencido" ? "text-red-400 font-semibold" : c.estado === "proximo_vencer" ? "text-orange-400 font-semibold" : "text-[var(--c-text4)]"}>
                      {fmtDate(fechaRelevante)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {filtrados.length > 0 && (
            <div className="px-4 py-3 border-t border-[var(--c-border2)] text-xs text-[var(--c-text4)]">
              Mostrando {filtrados.length} de {metricas.total} clientes
            </div>
          )}
        </div>

        {/* Detail panel — desktop: columna lateral */}
        {selectedUpdated && (
          <div className="hidden lg:block bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden min-h-[500px]">
            <DetailPanel c={selectedUpdated} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>

      {/* Detail panel — mobile: bottom sheet */}
      {selectedUpdated && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-h-[88vh] bg-[var(--c-card)] border-t border-[var(--c-border)] rounded-t-3xl overflow-hidden flex flex-col animate-fade-up">
            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mt-2.5 mb-1 flex-shrink-0" />
            <DetailPanel c={selectedUpdated} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}
    </div>
  )
}
