"use client"
import { useState, useTransition, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { crearCliente, actualizarCliente, eliminarCliente, crearNotaCliente, eliminarNotaCliente, toggleActivoCliente } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"
import { CentroCobranza } from "@/components/cuentas-cobrar/centro-cobranza"
import type { NivelCobranza } from "@/lib/cobranza"

const TIPOS = ["Minorista","Mayorista","Empresa","Distribuidor","Particular"]
const FRECUENCIAS = ["Diaria","Semanal","Quincenal","Mensual","Eventual"]
const METODOS_PAGO = ["Efectivo","Transferencia","Débito","Crédito","Mixto"]
const AVATAR_COLORS = ["bg-sky-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-red-500","bg-pink-500","bg-teal-500","bg-orange-500"]

type Cliente = {
  id: string; nombre: string; apellido: string | null; empresa: string | null
  telefono: string | null; email: string | null; direccion: string | null; ciudad: string | null
  tipoCliente: string | null; frecuenciaCompra: string | null; metodoPago: string | null
  diasPago: number | null; esFrecuente: boolean; esVip: boolean; permiteCredito: boolean
  activo: boolean; observaciones: string | null; createdAt: string
  totalComprado: number; ultimaActividad: string; diasSinCompra: number
  deudaPendiente: number; compras: number; ticketPromedio: number; inactivo: boolean
  movimientos: { monto: number; fecha: string; tipo: string; descripcion: string | null }[]
  cuentasPorCobrar?: { id: string; numero: number; monto: number; saldoPendiente: number; estado: string; fecha: string; fechaVence: string | null; diasAtraso: number; descripcion: string | null }[]
  notas: { id: string; texto: string; createdAt: string }[]
}

function getAvatarColor(name: string): string {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

function getInitials(nombre: string, apellido?: string | null): string {
  const a = nombre[0]?.toUpperCase() ?? ""
  const b = (apellido?.[0] ?? nombre.split(" ")[1]?.[0] ?? "").toUpperCase()
  return a + b
}

function formatRelative(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias === 0) return "Hoy"
  if (dias === 1) return "Hace 1 día"
  if (dias < 30) return `Hace ${dias} días`
  if (dias < 365) return `Hace ${Math.floor(dias/30)} mes${Math.floor(dias/30)>1?"es":""}`
  return `Hace ${Math.floor(dias/365)} año${Math.floor(dias/365)>1?"s":""}`
}

const inp = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"
const sel = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

function Avatar({ nombre, apellido, size = "md" }: { nombre: string; apellido?: string | null; size?: "sm"|"md"|"lg" }) {
  const sizes = { sm: "w-9 h-9 text-xs", md: "w-11 h-11 text-sm", lg: "w-16 h-16 text-xl" }
  return (
    <div className={`${sizes[size]} ${getAvatarColor(nombre)} rounded-2xl flex items-center justify-center font-bold text-[var(--c-text)] flex-shrink-0`}>
      {getInitials(nombre, apellido)}
    </div>
  )
}

function FormCliente({ cliente, onClose, onSuccess }: { cliente?: Cliente | null; onClose: () => void; onSuccess: () => void }) {
  const [isPending, start] = useTransition()
  const isEdit = !!cliente

  // Portal directo a document.body — evita que el modal quede atrapado
  // dentro del contenedor animado de la página (mismo fix que en Proveedores).
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      try {
        if (isEdit) { await actualizarCliente(cliente!.id, fd); toast.success("Cliente actualizado") }
        else { await crearCliente(fd); toast.success("Cliente creado ✅") }
        onSuccess()
      } catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  if (!montado) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in">
        <div className="px-6 pt-5 pb-4 border-b border-[var(--c-border)] flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold text-[var(--c-text)]">{isEdit ? "Editar cliente" : "Nuevo cliente"}</h2>
          <button onClick={onClose} className="text-[var(--c-text3)] hover:text-[var(--c-text)] w-8 h-8 rounded-xl hover:bg-[var(--c-hover)] flex items-center justify-center text-lg transition-all">×</button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-bold text-[var(--c-text3)] uppercase tracking-wider mb-3">Información básica</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Nombre *</label><input name="nombre" required defaultValue={cliente?.nombre} placeholder="Juan" className={inp} /></div>
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Apellido</label><input name="apellido" defaultValue={cliente?.apellido ?? ""} placeholder="Pérez" className={inp} /></div>
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Empresa</label><input name="empresa" defaultValue={cliente?.empresa ?? ""} placeholder="Almacén Don Pepe" className={inp} /></div>
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Teléfono</label><input name="telefono" defaultValue={cliente?.telefono ?? ""} placeholder="+56 9 1234 5678" className={inp} /></div>
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Email</label><input name="email" type="email" defaultValue={cliente?.email ?? ""} placeholder="juan@email.com" className={inp} /></div>
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Ciudad</label><input name="ciudad" defaultValue={cliente?.ciudad ?? ""} placeholder="Santiago" className={inp} /></div>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--c-text3)] uppercase tracking-wider mb-3">Datos comerciales</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Tipo cliente</label><select name="tipoCliente" defaultValue={cliente?.tipoCliente ?? "Minorista"} className={sel}>{TIPOS.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Frecuencia compra</label><select name="frecuenciaCompra" defaultValue={cliente?.frecuenciaCompra ?? ""} className={sel}><option value="">Sin definir</option>{FRECUENCIAS.map(f=><option key={f}>{f}</option>)}</select></div>
              <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Método pago habitual</label><select name="metodoPago" defaultValue={cliente?.metodoPago ?? "Efectivo"} className={sel}>{METODOS_PAGO.map(m=><option key={m}>{m}</option>)}</select></div>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--c-text3)] uppercase tracking-wider mb-3">Configuración</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: "esFrecuente", label: "Cliente frecuente", defaultChecked: cliente?.esFrecuente },
                { name: "esVip", label: "Cliente VIP ⭐", defaultChecked: cliente?.esVip },
                { name: "permiteCredito", label: "Permite crédito", defaultChecked: cliente?.permiteCredito },
              ].map(opt => (
                <label key={opt.name} className="flex items-center gap-2 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 cursor-pointer hover:border-sky-500/30 transition-all">
                  <input type="checkbox" name={opt.name} defaultChecked={opt.defaultChecked} className="accent-sky-500" />
                  <span className="text-xs font-medium text-[var(--c-text2)]">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Observaciones</label><textarea name="observaciones" defaultValue={cliente?.observaciones ?? ""} rows={2} placeholder="Notas sobre el cliente..." className={`${inp} h-auto py-2.5 resize-none`} /></div>
        </form>
        <div className="px-6 py-4 border-t border-[var(--c-border)] flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="flex-1 h-11 border border-[var(--c-border)] text-[var(--c-text3)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all">Cancelar</button>
          <button type="submit" form="" onClick={(e) => { const form = e.currentTarget.closest('.fixed')?.querySelector('form'); if (form) form.requestSubmit() }} disabled={isPending} className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20">
            {isPending ? "Guardando..." : (isEdit ? "Actualizar" : "Crear cliente")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function ClientePanel({ cliente, onClose, onEdit, nombreNegocio, usuarioEnvia, plantillas }: { cliente: Cliente; onClose: () => void; onEdit: () => void; nombreNegocio: string; usuarioEnvia: string; plantillas: Record<NivelCobranza, string> }) {
  const [tab, setTab] = useState<"resumen"|"compras"|"notas"|"cuentas">("resumen")
  const [nota, setNota] = useState("")
  const [isPending, start] = useTransition()
  const cuentasPendientes = (cliente.cuentasPorCobrar ?? []).filter(cc => cc.estado !== "pagada")
  const [cuentaExpandidaId, setCuentaExpandidaId] = useState<string | null>(cuentasPendientes[0]?.id ?? null)

  function handleNota() {
    if (!nota.trim()) return
    start(async () => {
      try { await crearNotaCliente(cliente.id, nota); setNota(""); toast.success("Nota agregada") }
      catch { toast.error("Error al agregar nota") }
    })
  }

  function handleToggleActivo() {
    start(async () => {
      try {
        await toggleActivoCliente(cliente.id, !cliente.activo)
        toast.success(cliente.activo ? "Cliente desactivado" : "Cliente reactivado")
        onClose()
      } catch { toast.error("Error") }
    })
  }

  const TABS = [
    { key: "resumen", label: "Resumen" },
    { key: "compras", label: `Compras (${cliente.compras})` },
    ...(cuentasPendientes.length > 0 ? [{ key: "cuentas" as const, label: `Cuentas por cobrar (${cuentasPendientes.length})` }] : []),
    { key: "notas", label: `Notas (${cliente.notas.length})` },
  ] as const

  return (
    <div className="flex flex-col h-full bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--c-border)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar nombre={cliente.nombre} apellido={cliente.apellido} size="lg" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-[var(--c-text)]">{cliente.nombre} {cliente.apellido ?? ""}</h2>
                {cliente.esFrecuente && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">Frecuente</span>}
                {cliente.esVip && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-[var(--c-warning)] border border-amber-500/20 font-semibold">⭐ VIP</span>}
                {cliente.deudaPendiente > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">Con deuda</span>}
                {(!cliente.activo || cliente.inactivo) && <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-500/10 text-[var(--c-text4)] border border-[var(--c-border)] font-semibold">{"Inactivo"}</span>}
              </div>
              {cliente.empresa && <p className="text-xs text-[var(--c-text3)] mt-0.5">🏪 {cliente.empresa}</p>}
              {cliente.telefono && <p className="text-xs text-[var(--c-text3)]">📱 {cliente.telefono}</p>}
              {cliente.email && <p className="text-xs text-[var(--c-text3)]">✉️ {cliente.email}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleToggleActivo}
              className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                cliente.activo
                  ? "bg-[var(--c-card2)] border-[var(--c-border)] text-[var(--c-text3)] hover:border-amber-500/30 hover:text-[var(--c-warning)]"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
              }`}>
              {cliente.activo ? "⏸ Desactivar" : "▶ Reactivar"}
            </button>
            <button onClick={onEdit} className="text-xs px-3 py-1.5 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] rounded-xl hover:border-sky-500/30 hover:text-sky-400 transition-all">✏️ Editar</button>
            <button onClick={onClose} className="text-[var(--c-text3)] w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-lg">×</button>
          </div>
        </div>

        {/* Stats rápidas */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: "Total comprado", valor: formatCLP(cliente.totalComprado), color: "text-emerald-400" },
            { label: "Deuda pendiente", valor: formatCLP(cliente.deudaPendiente), color: cliente.deudaPendiente > 0 ? "text-red-400" : "text-[var(--c-text3)]" },
            { label: "Ticket promedio", valor: formatCLP(Math.round(cliente.ticketPromedio)), color: "text-sky-400" },
            { label: "Última compra", valor: formatRelative(cliente.ultimaActividad), color: "text-[var(--c-text2)]" },
          ].map(s => (
            <div key={s.label} className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-center">
              <p className={`text-sm font-bold ${s.color}`}>{s.valor}</p>
              <p className="text-[10px] text-[var(--c-text3)] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${tab === t.key ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" : "text-[var(--c-text3)] hover:text-[var(--c-text)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "resumen" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold text-[var(--c-text3)] uppercase tracking-wider mb-2">Información general</p>
                <div className="space-y-2 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4">
                  {[
                    { label: "Tipo cliente", val: cliente.tipoCliente ?? "—" },
                    { label: "Cliente desde", val: new Date(cliente.createdAt).toLocaleDateString("es-CL") },
                    { label: "Frecuencia compra", val: cliente.frecuenciaCompra ?? "—" },
                    { label: "Método pago", val: cliente.metodoPago ?? "—" },
                    { label: "Días promedio pago", val: cliente.diasPago ? `${cliente.diasPago} días` : "—" },
                    { label: "Estado", val: cliente.activo ? "Activo" : "Inactivo", color: cliente.activo ? "text-emerald-400" : "text-[var(--c-text4)]" },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between py-1 border-b border-[var(--c-border2)] last:border-0">
                      <span className="text-xs text-[var(--c-text3)]">{r.label}</span>
                      <span className={`text-xs font-semibold ${(r as any).color ?? "text-[var(--c-text)]"}`}>{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[var(--c-text3)] uppercase tracking-wider mb-2">Estadísticas</p>
                <div className="space-y-2 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4">
                  {[
                    { label: "Total compras", val: String(cliente.compras) },
                    { label: "Monto total", val: formatCLP(cliente.totalComprado), color: "text-emerald-400" },
                    { label: "Ticket promedio", val: formatCLP(Math.round(cliente.ticketPromedio)), color: "text-sky-400" },
                    { label: "Días sin compra", val: `${cliente.diasSinCompra} días`, color: cliente.diasSinCompra > 30 ? "text-[var(--c-warning)]" : "text-[var(--c-text)]" },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between py-1 border-b border-[var(--c-border2)] last:border-0">
                      <span className="text-xs text-[var(--c-text3)]">{r.label}</span>
                      <span className={`text-xs font-bold ${(r as any).color ?? "text-[var(--c-text)]"}`}>{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {cliente.observaciones && (
              <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4">
                <p className="text-[10px] font-semibold text-[var(--c-text3)] uppercase tracking-wider mb-1">Observaciones</p>
                <p className="text-sm text-[var(--c-text2)]">{cliente.observaciones}</p>
              </div>
            )}
          </div>
        )}

        {tab === "compras" && (
          <div className="space-y-2">
            {/* Resumen compras */}
            {cliente.compras > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-center">
                  <p className="text-base font-bold text-emerald-400">{cliente.compras}</p>
                  <p className="text-[10px] text-[var(--c-text3)]">Compras</p>
                </div>
                <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-sky-400">{formatCLP(cliente.totalComprado)}</p>
                  <p className="text-[10px] text-[var(--c-text3)]">Total</p>
                </div>
                <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-violet-400">{formatCLP(Math.round(cliente.ticketPromedio))}</p>
                  <p className="text-[10px] text-[var(--c-text3)]">Ticket prom.</p>
                </div>
              </div>
            )}
            {/* Lista compras - crédito + contado */}
            {(cliente.movimientos.filter(m => m.tipo === "VENTA").length + (cliente.cuentasPorCobrar?.length ?? 0)) === 0 ? (
              <div className="text-center py-10">
                <p className="text-3xl mb-2">🛒</p>
                <p className="text-sm text-[var(--c-text3)]">Sin compras registradas</p>
                <p className="text-xs text-[var(--c-text4)] mt-1">Las ventas asociadas a este cliente aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(cliente.cuentasPorCobrar ?? []).map((cc) => (
                  <div key={cc.id} className="flex items-center justify-between bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3 hover:bg-[var(--c-hover)] transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sm flex-shrink-0">📋</div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--c-text)]">{cc.descripcion ?? `Venta #${cc.numero}`}</p>
                        <p className="text-xs text-[var(--c-text3)]">{new Date(cc.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-sky-400">{formatCLP(cc.monto)}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cc.estado === "pagada" ? "bg-emerald-500/10 text-emerald-400" : cc.estado === "vencida" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-[var(--c-warning)]"}`}>{cc.estado === "pagada" ? "✓ Pagada" : cc.estado === "vencida" ? "Vencida" : "Pendiente"}</span>
                    </div>
                  </div>
                ))}
                {cliente.movimientos.filter(m => m.tipo === "VENTA").map((m, i) => (
                  <div key={i} className="flex items-center justify-between bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3 hover:bg-[var(--c-hover)] transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-sm flex-shrink-0">💰</div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--c-text)]">{m.descripcion ?? "Venta"}</p>
                        <p className="text-xs text-[var(--c-text3)]">{new Date(m.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">+{formatCLP(m.monto)}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold">✓ Pagada</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "cuentas" && (
          <div className="space-y-4">
            <div className="space-y-2">
              {cuentasPendientes.map(cc => {
                const expandida = cuentaExpandidaId === cc.id
                const cfg = cc.estado === "vencida" ? { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", label: "Vencida" } : { color: "text-[var(--c-warning)]", bg: "bg-amber-500/10", border: "border-amber-500/20", label: cc.estado === "parcial" ? "Parcial" : "Pendiente" }
                return (
                  <div key={cc.id} className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl overflow-hidden">
                    <button onClick={() => setCuentaExpandidaId(expandida ? null : cc.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--c-hover)] transition-all text-left">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--c-text)]">Factura #{cc.numero}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>{cfg.label}</span>
                        </div>
                        <p className="text-xs text-[var(--c-text3)] mt-0.5">Venta del {new Date(cc.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-red-400">{formatCLP(cc.saldoPendiente)}</p>
                        <span className="text-[var(--c-text4)] text-xs">{expandida ? "▲" : "▼"}</span>
                      </div>
                    </button>
                    {expandida && (
                      <div className="p-4 pt-0">
                        <CentroCobranza
                          cuenta={{ id: cc.id, numero: cc.numero, saldoPendiente: cc.saldoPendiente, fechaVenta: cc.fecha, fechaVence: cc.fechaVence, diasAtraso: cc.diasAtraso, cliente: { nombre: cliente.nombre, apellido: cliente.apellido, telefono: cliente.telefono, email: cliente.email } }}
                          plantillas={plantillas} nombreNegocio={nombreNegocio} usuarioEnvia={usuarioEnvia}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === "notas" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={nota} onChange={e => setNota(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleNota()}
                placeholder="Agregar nota rápida..." className={`${inp} flex-1`} />
              <button onClick={handleNota} disabled={!nota.trim() || isPending}
                className="h-10 px-4 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
                +
              </button>
            </div>
            {cliente.notas.length === 0 ? (
              <div className="text-center py-8"><p className="text-2xl mb-2">📝</p><p className="text-sm text-[var(--c-text3)]">Sin notas aún</p></div>
            ) : (
              cliente.notas.map(n => (
                <div key={n.id} className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3">
                  <p className="text-sm text-[var(--c-text2)]">{n.texto}</p>
                  <p className="text-[10px] text-[var(--c-text4)] mt-1">{new Date(n.createdAt).toLocaleDateString("es-CL")}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  clientesData: Cliente[]
  metricas: { totalVentasMes: number; conDeuda: number; frecuentes: number; inactivos: number; ticketProm: number }
  nombreNegocio: string
  usuarioEnvia: string
  plantillas: Record<NivelCobranza, string>
}

export function ClientesClient({ clientesData, metricas, nombreNegocio, usuarioEnvia, plantillas }: Props) {
  const [search, setSearch] = useState("")
  const [filtro, setFiltro] = useState<"todos"|"deuda"|"frecuentes"|"inactivos">("todos")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)

  const selected = useMemo(() => clientesData.find(c => c.id === selectedId) ?? null, [clientesData, selectedId])

  // Clientes más valiosos — antes vivía duplicado en Reportes; ahora vive
  // acá, calculado sobre los mismos datos que ya se cargaron para la lista,
  // sin ninguna consulta nueva al servidor.
  const clientesMasValiosos = useMemo(() =>
    [...clientesData].filter(c => c.totalComprado > 0).sort((a, b) => b.totalComprado - a.totalComprado).slice(0, 5),
    [clientesData])

  const filtrados = useMemo(() => {
    let list = clientesData
    if (search) { const q = search.toLowerCase(); list = list.filter(c => `${c.nombre} ${c.apellido ?? ""} ${c.empresa ?? ""} ${c.telefono ?? ""}`.toLowerCase().includes(q)) }
    switch (filtro) {
      case "deuda":    return list.filter(c => c.deudaPendiente > 0)
      case "frecuentes": return list.filter(c => c.esFrecuente)
      case "inactivos":  return list.filter(c => c.inactivo || !c.activo)
    }
    return list
  }, [clientesData, search, filtro])

  const TABS_FILTRO = [
    { key: "todos" as const, label: `Todos (${clientesData.length})` },
    { key: "deuda" as const, label: `Con deuda (${metricas.conDeuda})` },
    { key: "frecuentes" as const, label: `Frecuentes (${metricas.frecuentes})` },
    { key: "inactivos" as const, label: `Inactivos (${metricas.inactivos})` },
  ]

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Modal form */}
      {(showForm || editando) && (
        <FormCliente
          cliente={editando}
          onClose={() => { setShowForm(false); setEditando(null) }}
          onSuccess={() => { setShowForm(false); setEditando(null); window.location.reload() }}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Clientes</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Gestiona tus clientes y conoce mejor tu negocio</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20 whitespace-nowrap">
          + Nuevo cliente
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Clientes totales", val: String(clientesData.length), sub: `${metricas.frecuentes} frecuentes`, icon: "👥", color: "text-sky-400" },
          { label: "Ventas este mes", val: formatCLP(metricas.totalVentasMes), sub: "A clientes registrados", icon: "💰", color: "text-emerald-400" },
          { label: "Con deuda", val: String(metricas.conDeuda), sub: "Clientes con saldo pendiente", icon: "⚠️", color: "text-red-400" },
          { label: "Ticket promedio", val: formatCLP(Math.round(metricas.ticketProm)), sub: "Por compra", icon: "🎫", color: "text-violet-400" },
          { label: "Frecuentes", val: String(metricas.frecuentes), sub: "Clientes recurrentes", icon: "⭐", color: "text-[var(--c-warning)]" },
          { label: "Inactivos", val: String(metricas.inactivos), sub: "Sin compras +30 días", icon: "💤", color: "text-[var(--c-text3)]" },
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

      {/* Clientes más valiosos — histórico total, no solo este mes */}
      {clientesMasValiosos.length > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[var(--c-text)] mb-1">⭐ Clientes más valiosos</p>
          <p className="text-[11px] text-[var(--c-text4)] mb-4">Por total comprado histórico</p>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {clientesMasValiosos.map((c, i) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] hover:border-sky-500/30 transition-all text-left">
                <span className="text-xs font-bold text-[var(--c-text4)] w-4 flex-shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--c-text)] truncate">{c.nombre} {c.apellido ?? ""}</p>
                  <p className="text-[11px] font-bold text-emerald-400">{formatCLP(c.totalComprado)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Layout: Lista + Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Lista de clientes */}
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--c-border)]">
            <p className="text-sm font-semibold text-[var(--c-text)] mb-3">Lista de clientes</p>
            {/* Tabs filtro */}
            <div className="flex gap-1 flex-wrap mb-3">
              {TABS_FILTRO.map(t => (
                <button key={t.key} onClick={() => setFiltro(t.key)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold border transition-all outline-none focus:outline-none ${filtro === t.key ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "border-transparent text-[var(--c-text3)] hover:text-[var(--c-text)]"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {/* Búsqueda */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..."
                className="w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl pl-8 pr-3 text-xs text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors" />
            </div>
          </div>

          {/* Lista */}
          <div className="divide-y divide-[var(--c-border2)] overflow-y-auto flex-1 max-h-[500px]">
            {filtrados.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-3xl mb-2">👥</p>
                <p className="text-sm font-semibold text-[var(--c-text)]">{search ? "Sin resultados" : "Aún no tienes clientes"}</p>
                <p className="text-xs text-[var(--c-text3)] mt-1">{search ? "Intenta con otro término de búsqueda" : "Agrega tus clientes para llevar un mejor control de tus ventas"}</p>
                {!search && <button onClick={() => setShowForm(true)} className="mt-3 text-xs px-4 py-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl hover:bg-sky-500/20 transition-all">+ Agregar primer cliente</button>}
              </div>
            ) : filtrados.map(c => (
              <div key={c.id} onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-all ${selectedId === c.id ? "bg-sky-500/5 border-l-2 border-sky-500" : "hover:bg-[var(--c-hover)]"} ${!c.activo ? "opacity-60" : ""}`}>
                <Avatar nombre={c.nombre} apellido={c.apellido} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--c-text)] truncate">{c.nombre} {c.apellido ?? ""}</p>
                  <p className="text-[10px] text-[var(--c-text3)] truncate">{c.telefono ?? c.empresa ?? c.email ?? "Sin contacto"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-[var(--c-text3)]">{formatRelative(c.ultimaActividad)}</p>
                  {c.deudaPendiente > 0
                    ? <p className="text-xs font-bold text-red-400">{formatCLP(c.deudaPendiente)}</p>
                    : <p className="text-xs text-[var(--c-text4)]">$0</p>
                  }
                </div>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.deudaPendiente > 0 ? "bg-red-400" : c.inactivo ? "bg-amber-400" : "bg-emerald-400"}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Panel perfil */}
        <div className="lg:col-span-2">
          {selected ? (
            <ClientePanel
              cliente={selected}
              onClose={() => setSelectedId(null)}
              onEdit={() => { setEditando(selected); setSelectedId(null) }}
              nombreNegocio={nombreNegocio} usuarioEnvia={usuarioEnvia} plantillas={plantillas}
            />
          ) : (
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl h-full flex items-center justify-center p-10 text-center">
              <div>
                <p className="text-4xl mb-3">👈</p>
                <p className="text-sm font-semibold text-[var(--c-text)]">Selecciona un cliente</p>
                <p className="text-xs text-[var(--c-text3)] mt-1">Haz clic en cualquier cliente de la lista para ver su perfil completo</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
