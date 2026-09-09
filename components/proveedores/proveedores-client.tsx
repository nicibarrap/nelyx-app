"use client"
import { useState, useTransition, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { crearProveedor, actualizarProveedor, eliminarProveedor, toggleActivoProveedor, toggleFavoritoProveedor, crearNotaProveedor, eliminarNotaProveedor } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"

const CATEGORIAS = ["Mercadería","Carnes","Frutas y verduras","Abarrotes","Bebidas","Lácteos","Insumos","Packaging","Servicios","Tecnología","Transporte","Otros"]
const AVATAR_COLORS = ["bg-sky-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-red-500","bg-orange-500","bg-teal-500","bg-pink-500"]

type Proveedor = {
  id: string; nombre: string; empresa: string | null; rut: string | null
  telefono: string | null; email: string | null; direccion: string | null; ciudad: string | null
  categoria: string | null; esFavorito: boolean; activo: boolean; observaciones: string | null
  createdAt: string; totalComprado: number; compras: number; promedioCompra: number
  diasSinCompra: number | null; ultimaCompra: string | null; sinActividad: boolean
  movimientos: { id: string; monto: number; fecha: string; descripcion: string | null }[]
  notas: { id: string; texto: string; createdAt: string }[]
}

function getAvatarColor(name: string) { return AVATAR_COLORS[(name.charCodeAt(0) + (name.charCodeAt(1)||0)) % AVATAR_COLORS.length] }
function getInitials(n: string) { const w = n.trim().split(" "); return (w[0][0] + (w[1]?.[0] ?? "")).toUpperCase() }
function formatRel(iso: string | null): string {
  if (!iso) return "Sin compras"
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return "Hoy"; if (d === 1) return "Hace 1 día"; if (d < 30) return `Hace ${d} días`
  return `Hace ${Math.floor(d/30)} mes${Math.floor(d/30)>1?"es":""}`
}

const inp = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"
const sel = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

function Avatar({ nombre, size = "md" }: { nombre: string; size?: "sm"|"md"|"lg" }) {
  const s = { sm: "w-9 h-9 text-xs", md: "w-11 h-11 text-sm", lg: "w-14 h-14 text-xl" }[size]
  return <div className={`${s} ${getAvatarColor(nombre)} rounded-2xl flex items-center justify-center font-bold text-[var(--c-text)] flex-shrink-0`}>{getInitials(nombre)}</div>
}

function FormProveedor({ proveedor, onClose, onSuccess }: { proveedor?: Proveedor | null; onClose: () => void; onSuccess: () => void }) {
  const [isPending, start] = useTransition()
  const isEdit = !!proveedor

  // Portal directo a document.body — el contenedor de la página tiene una
  // animación de entrada (animate-fade-up) que deja un transform permanente,
  // y eso rompe el cálculo del desenfoque de fondo si el modal queda anidado
  // adentro. Mismo fix que ya usamos para el escáner de código de barras.
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    start(async () => {
      try {
        if (isEdit) { await actualizarProveedor(proveedor!.id, fd); toast.success("Proveedor actualizado") }
        else { await crearProveedor(fd); toast.success("Proveedor creado ✅") }
        onSuccess()
      } catch (err: any) { toast.error(err?.message ?? "Error") }
    })
  }

  if (!montado) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[var(--c-card)] border border-[var(--c-border)] rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-in">
        <div className="px-6 pt-5 pb-4 border-b border-[var(--c-border)] flex items-center justify-between flex-shrink-0">
          <h2 className="text-sm font-bold text-[var(--c-text)]">{isEdit ? "Editar proveedor" : "Nuevo proveedor"}</h2>
          <button onClick={onClose} className="text-[var(--c-text3)] w-8 h-8 rounded-xl hover:bg-[var(--c-hover)] flex items-center justify-center text-lg transition-all">×</button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Nombre *</label><input name="nombre" required defaultValue={proveedor?.nombre} placeholder="Lo Valledor" className={inp} /></div>
            <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Empresa</label><input name="empresa" defaultValue={proveedor?.empresa ?? ""} placeholder="Distribuidora..." className={inp} /></div>
            <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Categoría</label><select name="categoria" defaultValue={proveedor?.categoria ?? "Otros"} className={sel}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
            <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">RUT</label><input name="rut" defaultValue={proveedor?.rut ?? ""} placeholder="76.123.456-7" className={inp} /></div>
            <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Teléfono</label><input name="telefono" defaultValue={proveedor?.telefono ?? ""} placeholder="+56 9 1234 5678" className={inp} /></div>
            <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Email</label><input name="email" type="email" defaultValue={proveedor?.email ?? ""} placeholder="contacto@proveedor.cl" className={inp} /></div>
            <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Ciudad</label><input name="ciudad" defaultValue={proveedor?.ciudad ?? ""} placeholder="Santiago" className={inp} /></div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="esFavorito" defaultChecked={proveedor?.esFavorito} className="accent-amber-500" />
              <span className="text-sm text-[var(--c-text2)]">⭐ Marcar como favorito</span>
            </label>
          </div>
          <div><label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Observaciones</label><textarea name="observaciones" defaultValue={proveedor?.observaciones ?? ""} rows={2} placeholder="Entrega los martes..." className={`${inp} h-auto py-2.5 resize-none`} /></div>
        </form>
        <div className="px-6 py-4 border-t border-[var(--c-border)] flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="flex-1 h-11 border border-[var(--c-border)] text-[var(--c-text3)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all">Cancelar</button>
          <button type="button" disabled={isPending} onClick={(e) => { (e.currentTarget.closest('.fixed')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }}
            className="flex-1 h-11 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20">
            {isPending ? "Guardando..." : (isEdit ? "Actualizar" : "Crear proveedor")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function ProveedorPanel({ prov, onClose, onEdit }: { prov: Proveedor; onClose: () => void; onEdit: () => void }) {
  const [tab, setTab] = useState<"resumen"|"compras"|"notas">("resumen")
  const [nota, setNota] = useState("")
  const [isPending, start] = useTransition()

  function handleNota() {
    if (!nota.trim()) return
    start(async () => {
      try { await crearNotaProveedor(prov.id, nota); setNota(""); toast.success("Nota agregada") }
      catch { toast.error("Error") }
    })
  }

  function handleToggleActivo() {
    start(async () => {
      try { await toggleActivoProveedor(prov.id, !prov.activo); toast.success(prov.activo ? "Proveedor desactivado" : "Proveedor reactivado"); onClose() }
      catch { toast.error("Error") }
    })
  }

  function handleToggleFav() {
    start(async () => {
      try { await toggleFavoritoProveedor(prov.id, !prov.esFavorito); toast.success(prov.esFavorito ? "Removido de favoritos" : "Marcado como favorito") }
      catch { toast.error("Error") }
    })
  }

  const TABS = [{ key: "resumen", label: "Resumen" }, { key: "compras", label: `Compras (${prov.compras})` }, { key: "notas", label: `Notas (${prov.notas.length})` }] as const

  return (
    <div className="flex flex-col h-full bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--c-border)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar nombre={prov.nombre} size="lg" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[var(--c-text)]">{prov.nombre}</h2>
                {prov.esFavorito && <span className="text-[var(--c-warning)] text-sm">⭐</span>}
                {prov.activo ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">Activo</span>
                  : <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-500/10 text-[var(--c-text4)] border border-[var(--c-border)] font-semibold">Inactivo</span>}
              </div>
              {prov.categoria && <p className="text-xs text-[var(--c-text3)] mt-0.5">📦 {prov.categoria}</p>}
              {prov.telefono && <p className="text-xs text-[var(--c-text3)]">📱 {prov.telefono}</p>}
              {prov.email && <p className="text-xs text-[var(--c-text3)]">✉️ {prov.email}</p>}
            </div>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={handleToggleFav} className="text-xs px-2 py-1.5 rounded-lg border border-[var(--c-border)] text-[var(--c-text3)] hover:text-[var(--c-warning)] transition-all">{prov.esFavorito ? "★" : "☆"}</button>
            <button onClick={handleToggleActivo} className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${prov.activo ? "border-[var(--c-border)] text-[var(--c-text3)] hover:text-[var(--c-warning)]" : "border-emerald-500/20 text-emerald-400"}`}>{prov.activo ? "Desactivar" : "Activar"}</button>
            <button onClick={onEdit} className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--c-border)] text-[var(--c-text2)] hover:text-sky-400 transition-all">✏️</button>
            <button onClick={onClose} className="text-[var(--c-text3)] w-7 h-7 rounded-lg hover:bg-[var(--c-hover)] flex items-center justify-center text-lg">×</button>
          </div>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[
            { label: "Total comprado", val: formatCLP(prov.totalComprado), color: "text-red-400" },
            { label: "Nº compras", val: String(prov.compras), color: "text-sky-400" },
            { label: "Promedio compra", val: formatCLP(Math.round(prov.promedioCompra)), color: "text-violet-400" },
            { label: "Última compra", val: formatRel(prov.ultimaCompra), color: "text-[var(--c-text2)]" },
          ].map(s => (
            <div key={s.label} className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-2.5 text-center">
              <p className={`text-sm font-bold ${s.color}`}>{s.val}</p>
              <p className="text-[10px] text-[var(--c-text3)] mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
        {/* Tabs */}
        <div className="flex gap-0 mt-4 border-b border-[var(--c-border)]">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`text-xs px-4 py-2 font-semibold transition-all border-b-2 -mb-[1px] whitespace-nowrap outline-none focus:outline-none ${tab === t.key ? "text-sky-400 border-sky-400 bg-sky-500/5" : "text-[var(--c-text3)] border-transparent hover:text-[var(--c-text2)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "resumen" && (
          <div className="space-y-4">
            <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-semibold text-[var(--c-text3)] uppercase tracking-wider mb-2">Información</p>
              {[
                { label: "Categoría", val: prov.categoria ?? "—" },
                { label: "RUT", val: prov.rut ?? "—" },
                { label: "Ciudad", val: prov.ciudad ?? "—" },
                { label: "Proveedor desde", val: new Date(prov.createdAt).toLocaleDateString("es-CL") },
                { label: "Días sin compra", val: prov.diasSinCompra === null ? "Sin compras registradas" : `${prov.diasSinCompra} días`, color: prov.diasSinCompra !== null && prov.diasSinCompra > 90 ? "text-[var(--c-warning)]" : "text-[var(--c-text)]" },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-1 border-b border-[var(--c-border2)] last:border-0">
                  <span className="text-xs text-[var(--c-text3)]">{r.label}</span>
                  <span className={`text-xs font-semibold ${(r as any).color ?? "text-[var(--c-text)]"}`}>{r.val}</span>
                </div>
              ))}
            </div>
            {prov.observaciones && (
              <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-4">
                <p className="text-[10px] font-semibold text-[var(--c-text3)] uppercase mb-1">Observaciones</p>
                <p className="text-sm text-[var(--c-text2)]">{prov.observaciones}</p>
              </div>
            )}
          </div>
        )}
        {tab === "compras" && (
          <div className="space-y-2">
            {prov.compras > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-center">
                  <p className="text-base font-bold text-red-400">{formatCLP(prov.totalComprado)}</p>
                  <p className="text-[10px] text-[var(--c-text3)]">Total comprado</p>
                </div>
                <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 text-center">
                  <p className="text-base font-bold text-sky-400">{formatCLP(Math.round(prov.promedioCompra))}</p>
                  <p className="text-[10px] text-[var(--c-text3)]">Promedio compra</p>
                </div>
              </div>
            )}
            {prov.movimientos.length === 0 ? (
              <div className="text-center py-10"><p className="text-3xl mb-2">🛒</p><p className="text-sm text-[var(--c-text3)]">Sin compras registradas</p><p className="text-xs text-[var(--c-text4)] mt-1">Registra gastos asociados a este proveedor</p></div>
            ) : (
              prov.movimientos.map((m, i) => (
                <div key={i} className="flex items-center justify-between bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-sm flex-shrink-0">🛒</div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--c-text)]">{m.descripcion ?? "Compra"}</p>
                      <p className="text-xs text-[var(--c-text3)]">{new Date(m.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-red-400 flex-shrink-0">−{formatCLP(m.monto)}</span>
                </div>
              ))
            )}
          </div>
        )}
        {tab === "notas" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={nota} onChange={e => setNota(e.target.value)} onKeyDown={e => e.key === "Enter" && handleNota()} placeholder="Agregar nota..." className={`${inp} flex-1`} />
              <button onClick={handleNota} disabled={!nota.trim() || isPending} className="h-10 px-4 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl">+</button>
            </div>
            {prov.notas.length === 0 ? (
              <div className="text-center py-8"><p className="text-2xl mb-2">📝</p><p className="text-sm text-[var(--c-text3)]">Sin notas</p></div>
            ) : prov.notas.map(n => (
              <div key={n.id} className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3">
                <p className="text-sm text-[var(--c-text2)]">{n.texto}</p>
                <p className="text-[10px] text-[var(--c-text4)] mt-1">{new Date(n.createdAt).toLocaleDateString("es-CL")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  proveedoresData: Proveedor[]
  metricas: { totalComprasMes: number; conDeuda: number; provPrincipal: string | null; inactivos: number }
}

export function ProveedoresClient({ proveedoresData, metricas }: Props) {
  const [search, setSearch] = useState("")
  const [filtro, setFiltro] = useState<"todos"|"activos"|"inactivos"|"favoritos">("todos")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Proveedor | null>(null)

  const selected = useMemo(() => proveedoresData.find(p => p.id === selectedId) ?? null, [proveedoresData, selectedId])

  const filtrados = useMemo(() => {
    let list = proveedoresData
    if (search) { const q = search.toLowerCase(); list = list.filter(p => `${p.nombre} ${p.empresa ?? ""} ${p.telefono ?? ""} ${p.categoria ?? ""}`.toLowerCase().includes(q)) }
    switch (filtro) {
      case "activos":    return list.filter(p => p.activo)
      case "inactivos":  return list.filter(p => !p.activo)
      case "favoritos":  return list.filter(p => p.esFavorito)
    }
    return list
  }, [proveedoresData, search, filtro])

  const rankingCompras = [...proveedoresData].filter(p => p.totalComprado > 0).sort((a, b) => b.totalComprado - a.totalComprado).slice(0, 5)

  const TABS_FILTRO = [
    { key: "todos" as const, label: `Todos (${proveedoresData.length})` },
    { key: "activos" as const, label: `Activos (${proveedoresData.filter(p=>p.activo).length})` },
    { key: "inactivos" as const, label: `Inactivos (${metricas.inactivos})` },
    { key: "favoritos" as const, label: `⭐ Favoritos (${proveedoresData.filter(p=>p.esFavorito).length})` },
  ]

  return (
    <div className="space-y-5 animate-fade-up">
      {(showForm || editando) && (
        <FormProveedor proveedor={editando} onClose={() => { setShowForm(false); setEditando(null) }}
          onSuccess={() => { setShowForm(false); setEditando(null); window.location.reload() }} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Proveedores</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Gestiona tus proveedores y controla tus compras</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20 whitespace-nowrap">
          + Nuevo proveedor
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Proveedores totales", val: String(proveedoresData.length), sub: `${proveedoresData.filter(p=>p.activo).length} activos`, icon: "🏪", color: "text-sky-400" },
          { label: "Compras este mes", val: formatCLP(metricas.totalComprasMes), sub: "Con proveedor asignado", icon: "🛒", color: "text-red-400" },
          { label: "Proveedor principal", val: metricas.provPrincipal ?? "—", sub: "Mayor volumen", icon: "⭐", color: "text-[var(--c-warning)]" },
          { label: "Inactivos", val: String(metricas.inactivos), sub: "Sin actividad +90 días", icon: "💤", color: "text-[var(--c-text3)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider leading-tight">{c.label}</p>
              <span className="text-base">{c.icon}</span>
            </div>
            <p className={`text-xl font-black ${c.color} truncate`}>{c.val}</p>
            <p className="text-[10px] text-[var(--c-text3)] mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Lista */}
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--c-border)]">
            <p className="text-sm font-semibold text-[var(--c-text)] mb-3">Lista de proveedores</p>
            <div className="flex gap-1 flex-wrap mb-3">
              {TABS_FILTRO.map(t => (
                <button key={t.key} onClick={() => setFiltro(t.key)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold border transition-all outline-none focus:outline-none ${filtro === t.key ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "border-transparent text-[var(--c-text3)] hover:text-[var(--c-text)]"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor..."
                className="w-full h-9 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl pl-8 pr-3 text-xs text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors" />
            </div>
          </div>
          <div className="divide-y divide-[var(--c-border2)] overflow-y-auto flex-1 max-h-[500px]">
            {filtrados.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-3xl mb-2">🏪</p>
                <p className="text-sm text-[var(--c-text3)]">{search ? "Sin resultados" : "Sin proveedores aún"}</p>
                {!search && <button onClick={() => setShowForm(true)} className="mt-2 text-xs text-sky-400">+ Agregar primer proveedor</button>}
              </div>
            ) : filtrados.map(p => (
              <div key={p.id} onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-all ${selectedId === p.id ? "bg-sky-500/5 border-l-2 border-sky-500" : "hover:bg-[var(--c-hover)]"} ${!p.activo ? "opacity-60" : ""}`}>
                <Avatar nombre={p.nombre} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{p.nombre}</p>
                    {p.esFavorito && <span className="text-[var(--c-warning)] text-xs">⭐</span>}
                  </div>
                  <p className="text-[10px] text-[var(--c-text3)] truncate">{p.categoria ?? p.telefono ?? "Sin datos"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-[var(--c-text3)]">{formatRel(p.ultimaCompra)}</p>
                  {p.totalComprado > 0 && <p className="text-xs font-bold text-red-400">{formatCLP(p.totalComprado)}</p>}
                </div>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${!p.activo ? "bg-zinc-500" : p.sinActividad ? "bg-amber-400" : "bg-emerald-400"}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Panel perfil */}
        <div className="lg:col-span-2">
          {selected ? (
            <ProveedorPanel prov={selected} onClose={() => setSelectedId(null)} onEdit={() => { setEditando(selected); setSelectedId(null) }} />
          ) : (
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl h-full flex items-center justify-center p-10 text-center min-h-[300px]">
              <div>
                <p className="text-4xl mb-3">👈</p>
                <p className="text-sm font-semibold text-[var(--c-text)]">Selecciona un proveedor</p>
                <p className="text-xs text-[var(--c-text3)] mt-1">Haz clic para ver el perfil completo</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ranking */}
      {rankingCompras.length > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--c-border)]">
            <h3 className="text-sm font-semibold text-[var(--c-text)]">Ranking de proveedores — Mayor volumen de compras</h3>
          </div>
          <div className="divide-y divide-[var(--c-border2)]">
            {rankingCompras.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--c-hover)] transition-all cursor-pointer" onClick={() => setSelectedId(p.id)}>
                <span className={`text-sm font-black w-6 text-center ${i === 0 ? "text-[var(--c-warning)]" : i === 1 ? "text-[var(--c-text3)]" : "text-[var(--c-text4)]"}`}>#{i+1}</span>
                <Avatar nombre={p.nombre} size="sm" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--c-text)]">{p.nombre}</p>
                  <p className="text-xs text-[var(--c-text3)]">{p.compras} compras · {p.categoria ?? "Sin categoría"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-400">{formatCLP(p.totalComprado)}</p>
                  <p className="text-[10px] text-[var(--c-text3)]">{formatRel(p.ultimaCompra)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
