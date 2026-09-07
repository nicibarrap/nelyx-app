"use client"
import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { crearProducto, actualizarProducto, crearCategoriaPersonalizada, toggleProducto, ajustarStock, eliminarProducto } from "@/app/actions/acciones"
import { AvisoCambioCostoModal, type AvisoCosto } from "@/components/productos/aviso-cambio-costo-modal"
import { formatCLP } from "@/lib/utils"
import { unidadesParaForma, formatearStock, deInterno, labelUnidad, type FormaVenta } from "@/lib/unidades"
import { getColorCategoria } from "@/lib/categorias"
import { getEmojiProducto } from "@/lib/emojis"
import { ProductoWizard } from "@/components/productos/producto-wizard"
import { type TipoMovimientoStock } from "@/lib/stock"
import { obtenerHistorialProducto, descartarAvisoVencimiento } from "@/app/actions/kardex-acciones"
import { LotesProducto } from "@/components/productos/lotes-producto"
import { EscanerCodigoBarras } from "@/components/shared/escaner-codigo-barras"

const MOTIVOS_AJUSTE: { value: TipoMovimientoStock; label: string }[] = [
  { value: "reposicion", label: "Compra" },
  { value: "correccion", label: "Corrección de inventario" },
  { value: "producto_danado", label: "Producto dañado" },
  { value: "merma", label: "Merma" },
  { value: "consumo_interno", label: "Consumo interno" },
  { value: "regalo", label: "Regalo" },
  { value: "devolucion", label: "Devolución" },
  { value: "otro", label: "Otro" },
]

const CATEGORIAS_DEFAULT = ["Bebidas","Carnes","Verduras","Abarrotes","Limpieza","Accesorios","Panadería","Frutas","Lácteos","Otros"]

type Producto = {
  id: string; nombre: string; precio: number | null; costo: number | null
  descripcion: string | null; categoria: string | null; sku: string | null
  codigoBarras: string | null
  stock: number | null; stockMinimo: number | null; activo: boolean
  unidadMedida: string; unidadPersonalizada: string | null; formaVenta: string
  controlaInventario: boolean; imagenBase64: string | null
  unidadVentaCantidad: number | null; unidadVentaTipo: string | null
  ventaMinima: number | null
  createdAt: Date; ventasCount: number; ingresosTotal: number
  proximoVencimiento: { fechaVencimiento: string; diasRestantes: number } | null
}

function getStockStatus(stock: number | null, stockMinimo: number | null) {
  if (stock === null) return null
  if (stock === 0) return "agotado"
  if (stockMinimo && stock <= stockMinimo) return "bajo"
  return "ok"
}

function StockBadge({ stock, stockMinimo, formaVenta, unidadMedida, unidadPersonalizada }: { stock: number | null; stockMinimo: number | null; formaVenta: string; unidadMedida: string; unidadPersonalizada?: string | null }) {
  const status = getStockStatus(stock, stockMinimo)
  if (stock === null) return <span className="text-xs text-[var(--c-text4)]">—</span>
  const cfg = {
    ok:      { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Stock OK" },
    bajo:    { cls: "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20",       label: "Bajo" },
    agotado: { cls: "bg-red-500/10 text-red-400 border-red-500/20",             label: "Sin stock" },
  }[status!] ?? { cls: "", label: "" }
  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className={`text-xs font-bold text-right inline-block w-16 flex-shrink-0 ${status==="ok"?"text-emerald-400":status==="bajo"?"text-[var(--c-warning)]":"text-red-400"}`}>{formatearStock(stock, formaVenta, unidadMedida, unidadPersonalizada)}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${cfg.cls}`}>{cfg.label}</span>
    </div>
  )
}

type ProximoVencimiento = { fechaVencimiento: string; diasRestantes: number } | null

function VencimientoBadge({ proximoVencimiento }: { proximoVencimiento: ProximoVencimiento }) {
  if (!proximoVencimiento) return <span className="text-xs text-[var(--c-text4)]">—</span>
  const { diasRestantes, fechaVencimiento } = proximoVencimiento
  const cfg = diasRestantes < 0
    ? { cls: "bg-red-500/10 text-red-400 border-red-500/20", label: "Venció" }
    : diasRestantes <= 3
    ? { cls: "bg-red-500/10 text-red-400 border-red-500/20", label: diasRestantes === 0 ? "Hoy" : `${diasRestantes}d` }
    : diasRestantes <= 7
    ? { cls: "bg-amber-500/10 text-[var(--c-warning)] border-amber-500/20", label: `${diasRestantes}d` }
    : { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: `${diasRestantes}d` }
  return (
    <span title={`Vence ${new Date(fechaVencimiento).toLocaleDateString("es-CL", { day: "2-digit", month: "short", timeZone: "UTC" })}`}
      className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold whitespace-nowrap ${cfg.cls}`}>
      🗓️ {cfg.label}
    </span>
  )
}

function CategoriaBadge({ categoria }: { categoria: string | null }) {
  if (!categoria) return <span className="text-xs text-[var(--c-text4)]">—</span>
  const color = getColorCategoria(categoria)
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
      style={{ backgroundColor: `${color}1A`, color, borderColor: `${color}40` }}>
      {categoria}
    </span>
  )
}

import { calcularMargenPorcentual } from "@/lib/financial-engine"

function getMargen(precio: number | null, costo: number | null) {
  if (!precio || !costo || costo === 0) return null
  return calcularMargenPorcentual(precio, costo)
}

const inp = "w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"
const sel = "w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

interface FormProductoProps {
  inventarioActivo: boolean
  producto?: Producto | null
  onClose: () => void
  onSuccess: () => void
}

function FormProducto({ inventarioActivo, producto, dbCategorias = [], dbUnidades = [], onClose, onSuccess }: FormProductoProps & { dbCategorias?: string[]; dbUnidades?: string[] }) {
  const [isPending, start] = useTransition()
  const [customCatInput, setCustomCatInput] = useState("")
  const [customCats, setCustomCats] = useState<string[]>([])
  const allCats = [...CATEGORIAS_DEFAULT, ...dbCategorias, ...customCats]
  const todasCategorias = allCats.filter((c, i) => allCats.findIndex(x => x.toLowerCase() === c.toLowerCase()) === i).sort((a,b) => CATEGORIAS_DEFAULT.includes(a) ? -1 : CATEGORIAS_DEFAULT.includes(b) ? 1 : a.localeCompare(b))
  const [margenPreview, setMargenPreview] = useState({ precio: producto?.precio ?? 0, costo: producto?.costo ?? 0 })
  const margen = getMargen(margenPreview.precio, margenPreview.costo)

  const [formaVenta, setFormaVenta] = useState<FormaVenta>((producto?.formaVenta as FormaVenta) ?? "unidad")
  const [codigoBarras, setCodigoBarras] = useState(producto?.codigoBarras ?? "")
  const [mostrarEscanerEdicion, setMostrarEscanerEdicion] = useState(false)
  const [unidadMedida, setUnidadMedida] = useState(producto?.unidadMedida ?? "unidad")
  const [unidadPersInput, setUnidadPersInput] = useState(producto?.unidadPersonalizada ?? "")
  const opcionesUnidad = unidadesParaForma(formaVenta)

  function cambiarFormaVenta(f: FormaVenta) {
    setFormaVenta(f)
    // Al cambiar la forma de venta, seleccionar la primera unidad compatible
    setUnidadMedida(unidadesParaForma(f)[0].value)
  }

  const stockDisplayDefault = producto?.stock != null ? deInterno(producto.stock, producto.unidadMedida) : ""
  const stockMinDisplayDefault = producto?.stockMinimo != null ? deInterno(producto.stockMinimo, producto.unidadMedida) : ""
  const ventaMinimaDisplayDefault = producto?.ventaMinima != null ? deInterno(producto.ventaMinima, producto.unidadMedida) : ""
  const labelActual = labelUnidad(unidadMedida, unidadPersInput)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const form = e.currentTarget
    start(async () => {
      try {
        if (producto) {
          await actualizarProducto(producto.id, fd)
          toast.success("Producto actualizado")
        } else {
          await crearProducto(fd)
          toast.success("Producto agregado")
          form.reset()
        }
        onSuccess()
        if (producto) onClose()
      } catch (err: any) { toast.error(err?.message ?? "Error al guardar") }
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 animate-fade-up">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-[var(--c-text)]">{producto ? "Editar producto" : "Agregar producto"}</h2>
          {inventarioActivo && <p className="text-[11px] text-[var(--c-text3)] mt-0.5">Modo inventario activado — completa costos y stock</p>}
        </div>
        <button onClick={onClose} className="text-[var(--c-text3)] hover:text-[var(--c-text)] w-7 h-7 rounded-lg hover:bg-[var(--c-card2)] flex items-center justify-center text-lg">×</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Nombre *</label>
            <input name="nombre" required placeholder="Ej: Manzana, Coca Cola..." defaultValue={producto?.nombre} className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Categoría</label>
            <select name="categoria" defaultValue={producto?.categoria ?? ""} className={sel}>
              <option value="">Sin categoría</option>
              {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2 mt-2">
              <input value={customCatInput} onChange={e => setCustomCatInput(e.target.value)}
                placeholder="Nueva categoría..." className={`${inp} h-8 text-xs flex-1`}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const cat = customCatInput.trim(); if (cat && !todasCategorias.map(c=>c.toLowerCase()).includes(cat.toLowerCase())) { setCustomCats(prev => [...prev, cat]); setCustomCatInput(""); crearCategoriaPersonalizada("PRODUCTO", cat).catch(()=>{}) } } }} />
              <button type="button"
                onClick={() => { const cat = customCatInput.trim(); if (cat && !todasCategorias.map(c=>c.toLowerCase()).includes(cat.toLowerCase())) { setCustomCats(prev => [...prev, cat]); setCustomCatInput(""); crearCategoriaPersonalizada("PRODUCTO", cat).catch(()=>{}) } }}
                className="h-8 px-3 bg-sky-500/10 text-sky-400 text-xs font-semibold rounded-lg border border-sky-500/20 hover:bg-sky-500/20 transition-all whitespace-nowrap">+ Agregar</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Precio de venta</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
              <input name="precio" type="number" min="0" step="1" placeholder="0" defaultValue={producto?.precio ?? ""}
                onChange={e => setMargenPreview(p => ({ ...p, precio: parseFloat(e.target.value) || 0 }))}
                className={inp + " pl-6"} />
            </div>
          </div>
          {inventarioActivo && (
            <div>
              <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Costo del producto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
                <input name="costo" type="number" min="0" step="1" placeholder="0" defaultValue={producto?.costo ?? ""}
                  onChange={e => setMargenPreview(p => ({ ...p, costo: parseFloat(e.target.value) || 0 }))}
                  className={inp + " pl-6"} />
              </div>
            </div>
          )}
        </div>

        {inventarioActivo && margen !== null && (
          <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-[var(--c-text2)]">Margen estimado</span>
            <div className="text-right">
              <span className={`text-sm font-bold ${margen.margen > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {margen.margen.toFixed(1)}%
              </span>
              <span className="text-xs text-[var(--c-text3)] ml-2">({formatCLP(margen.ganancia)} por unidad)</span>
            </div>
          </div>
        )}

        {inventarioActivo && (
          <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-card2)] p-3.5">
            <p className="text-[11px] font-bold text-[var(--c-text2)] mb-2.5">📏 Unidad de medida</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Forma de venta</label>
                <select name="formaVenta" value={formaVenta} onChange={e => cambiarFormaVenta(e.target.value as FormaVenta)} className={sel}>
                  <option value="unidad">Se vende por unidad</option>
                  <option value="peso">Se vende por peso</option>
                  <option value="volumen">Se vende por volumen</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Unidad de medida</label>
                <select name="unidadMedida" value={unidadMedida} onChange={e => setUnidadMedida(e.target.value)} className={sel}>
                  {opcionesUnidad.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>
            {unidadMedida === "personalizada" && (
              <div className="mt-2.5">
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Nombre de la unidad</label>
                <input name="unidadPersonalizada" value={unidadPersInput} onChange={e => setUnidadPersInput(e.target.value)}
                  placeholder="Ej: saco, pallet, bidón, rollo..." list="unidades-guardadas" className={inp} />
                <datalist id="unidades-guardadas">
                  {dbUnidades.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
            )}
          </div>
        )}

        {inventarioActivo && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Stock actual ({labelActual})</label>
              <input name="stock" type="number" min="0" step="any" placeholder={`0 ${labelActual}`} defaultValue={stockDisplayDefault} className={inp} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Stock mínimo ({labelActual})</label>
              <input name="stockMinimo" type="number" min="0" step="any" placeholder={`5 ${labelActual}`} defaultValue={stockMinDisplayDefault} className={inp} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">SKU / Código</label>
              <input name="sku" placeholder="Opcional" defaultValue={producto?.sku ?? ""} className={inp} />
            </div>
            <div>
              <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Venta mínima ({labelActual}) — opcional</label>
              <input name="ventaMinima" type="number" min="0" step="any" placeholder="Sin mínimo" defaultValue={ventaMinimaDisplayDefault} className={inp} />
            </div>
          </div>
        )}

        {inventarioActivo && (
          <div>
            <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Código de barras (opcional)</label>
            <div className="flex gap-2">
              <input name="codigoBarras" value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} placeholder="Escanea o escribe el código..." className={`${inp} flex-1`} />
              <button type="button" onClick={() => setMostrarEscanerEdicion(true)}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-400 flex items-center justify-center text-lg hover:bg-sky-500/20 transition-all"
                title="Escanear código de barras">
                📷
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Descripción</label>
          <input name="descripcion" placeholder="Descripción opcional..." defaultValue={producto?.descripcion ?? ""} className={inp} />
        </div>

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={isPending}
            className="flex-1 h-10 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-sky-500/20">
            {isPending ? "Guardando..." : producto ? "Actualizar" : "+ Agregar producto"}
          </button>
          <button type="button" onClick={onClose} className="px-4 h-10 border border-[var(--c-border)] text-[var(--c-text2)] text-sm rounded-xl hover:bg-[var(--c-card2)] transition-all">
            Cancelar
          </button>
        </div>
      </form>

      {mostrarEscanerEdicion && (
        <EscanerCodigoBarras
          titulo="Escanear código de barras"
          onDetectado={codigo => { setCodigoBarras(codigo); setMostrarEscanerEdicion(false); toast.success("Código capturado") }}
          onCerrar={() => setMostrarEscanerEdicion(false)}
        />
      )}
    </div>
  )
}

const TIPO_ICONO: Record<string, string> = {
  venta: "🛒", reposicion: "📦", ajuste_manual: "✏️", correccion: "🔧",
  producto_danado: "💔", merma: "📉", consumo_interno: "🍽️", regalo: "🎁",
  devolucion: "↩️", inventario_inicial: "🏁", otro: "•",
}

function HistorialStock({ productoId }: { productoId: string }) {
  const [items, setItems] = useState<any[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [cargadoInicial, setCargadoInicial] = useState(false)

  async function cargar(reset = false) {
    setCargando(true)
    try {
      const res = await obtenerHistorialProducto(productoId, reset ? undefined : cursor ?? undefined)
      setItems(prev => reset ? res.items : [...prev, ...res.items])
      setCursor(res.siguienteCursor)
    } catch {
      toast.error("No se pudo cargar el historial")
    } finally {
      setCargando(false)
      setCargadoInicial(true)
    }
  }

  function toggle() {
    const nuevo = !abierto
    setAbierto(nuevo)
    if (nuevo && !cargadoInicial) cargar(true)
  }

  function descartarVencimiento(movimientoStockId: string) {
    setItems(prev => prev.map(m => m.id === movimientoStockId ? { ...m, avisoVencimientoDescartado: true } : m))
    descartarAvisoVencimiento(movimientoStockId).catch(() => toast.error("No se pudo marcar como resuelto"))
  }

  return (
    <div className="px-5 pb-5 border-t border-[var(--c-border)] pt-4">
      <button onClick={toggle} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1.5 font-semibold">
        🧾 Historial del producto {abierto ? "▲" : "▼"}
      </button>
      {abierto && (
        <div className="mt-3">
          {cargando && items.length === 0 ? (
            <p className="text-xs text-[var(--c-text4)]">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-[var(--c-text4)]">Sin movimientos de inventario registrados todavía.</p>
          ) : (
            <div className="space-y-0 relative">
              {items.map((m, i) => (
                <div key={m.id} className="flex gap-3 relative pb-4 last:pb-0">
                  {i < items.length - 1 && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-[var(--c-border2)]" />}
                  <div className="w-8 h-8 rounded-full bg-[var(--c-card2)] border border-[var(--c-border)] flex items-center justify-center text-xs flex-shrink-0 z-10">
                    {TIPO_ICONO[m.tipo] ?? "•"}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-[var(--c-text)]">
                        <span className={m.cantidad >= 0 ? "text-emerald-400" : "text-red-400"}>{m.cantidad >= 0 ? "+" : ""}{m.cantidad}</span> · {m.tipoLabel}
                      </p>
                      <p className="text-[10px] text-[var(--c-text4)]">{new Date(m.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</p>
                    </div>
                    <p className="text-[10px] text-[var(--c-text4)] mt-0.5">
                      Stock: {m.stockAnterior} → {m.stockPosterior}
                      {m.proveedorNombre && ` · ${m.proveedorNombre}`}
                      {m.costoUnitario != null && ` · ${formatCLP(m.costoUnitario)} c/u`}
                      {m.costoTotal != null && ` (${formatCLP(m.costoTotal)} total)`}
                    </p>
                    {m.observacion && <p className="text-[10px] text-[var(--c-text3)] mt-0.5 italic">"{m.observacion}"</p>}
                    {m.fechaVencimiento && !m.avisoVencimientoDescartado && (m.tipo === "reposicion" || m.tipo === "inventario_inicial") && (
                      <div className="flex items-center gap-2 mt-1.5 bg-amber-500/5 border border-amber-500/15 rounded-lg px-2.5 py-1.5">
                        <span className="text-[10px] text-amber-400 flex-1">🗓️ Vence {new Date(m.fechaVencimiento).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</span>
                        <button onClick={() => descartarVencimiento(m.id)} className="text-[10px] text-[var(--c-text4)] hover:text-emerald-400 font-semibold flex-shrink-0">✓ Resuelto</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {cursor && (
            <button onClick={() => cargar(false)} disabled={cargando} className="text-[11px] text-sky-400 hover:text-sky-300 mt-2 disabled:opacity-50">
              {cargando ? "Cargando..." : "Cargar más"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ProductoDetalle({ producto, inventarioActivo, onEdit, onClose, onDeleted }: {
  producto: Producto; inventarioActivo: boolean; onEdit: () => void; onClose: () => void; onDeleted: () => void
}) {
  const [ajustando, setAjustando] = useState(false)
  const [cantidadAjuste, setCantidadAjuste] = useState("1")
  const [motivoAjuste, setMotivoAjuste] = useState<TipoMovimientoStock>("reposicion")
  const [observacionAjuste, setObservacionAjuste] = useState("")
  const [costoAjuste, setCostoAjuste] = useState<number | "">("")
  const [fechaVencimientoAjuste, setFechaVencimientoAjuste] = useState("")
  const [avisoCosto, setAvisoCosto] = useState<AvisoCosto | null>(null)
  const [isPending, start] = useTransition()
  const margen = getMargen(producto.precio, producto.costo)

  function handleAjuste(tipo: "agregar" | "reducir") {
    const cantidadNum = parseFloat(cantidadAjuste) || 0
    if (cantidadNum <= 0) { toast.error("Ingresa una cantidad mayor a 0"); return }
    if (motivoAjuste === "otro" && !observacionAjuste.trim()) { toast.error("Describe el motivo en observación"); return }
    const unidadLabel = labelUnidad(producto.unidadMedida, producto.unidadPersonalizada)
    start(async () => {
      try {
        const resultado = await ajustarStock(producto.id, cantidadNum, tipo, motivoAjuste, {
          observacion: observacionAjuste || undefined,
          costoUnitario: typeof costoAjuste === "number" ? costoAjuste : undefined,
          fechaVencimiento: fechaVencimientoAjuste || undefined,
        })
        toast.success(tipo === "agregar" ? `+${cantidadNum} ${unidadLabel} agregado(s)` : `-${cantidadNum} ${unidadLabel} reducido(s)`)
        setAjustando(false)
        setObservacionAjuste("")
        setCostoAjuste("")
        setFechaVencimientoAjuste("")
        setCantidadAjuste("1")
        if (resultado?.avisoCosto) setAvisoCosto(resultado.avisoCosto)
      } catch { toast.error("Error al ajustar stock") }
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-sky-500/20 rounded-2xl overflow-hidden animate-fade-up">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-[var(--c-text)] flex items-center gap-1.5">{getEmojiProducto(producto.nombre, producto.categoria)} {producto.nombre}</h3>
            <CategoriaBadge categoria={producto.categoria} />
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${producto.activo ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-800/50 text-zinc-600 border-zinc-700"}`}>
              {producto.activo ? "Activo" : "Inactivo"}
            </span>
          </div>
          {producto.descripcion && <p className="text-xs text-[var(--c-text3)] mt-0.5">{producto.descripcion}</p>}
          {producto.sku && <p className="text-[10px] text-[var(--c-text4)] mt-0.5">SKU: {producto.sku}</p>}
          {producto.codigoBarras && <p className="text-[10px] text-[var(--c-text4)] mt-0.5">📷 Código: {producto.codigoBarras}</p>}
        </div>
        <button onClick={onClose} className="text-[var(--c-text3)] hover:text-[var(--c-text)] w-7 h-7 rounded-lg hover:bg-[var(--c-card2)] flex items-center justify-center text-lg">×</button>
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Info general */}
        <div>
          <h4 className="text-[10px] font-semibold text-[var(--c-text3)] uppercase tracking-wider mb-3">Información</h4>
          <div className="space-y-2.5">
            <div className="flex justify-between">
              <span className="text-xs text-[var(--c-text2)]">Precio venta</span>
              <span className="text-xs font-bold text-[var(--c-text)]">{producto.precio ? formatCLP(producto.precio) : "—"}</span>
            </div>
            {inventarioActivo && (
              <>
                <div className="flex justify-between">
                  <span className="text-xs text-[var(--c-text2)]">Costo</span>
                  <span className="text-xs font-bold text-[var(--c-text)]">{producto.costo ? formatCLP(producto.costo) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-[var(--c-text2)]">Margen</span>
                  <span className={`text-xs font-bold ${margen && margen.margen > 0 ? "text-emerald-400" : "text-[var(--c-text3)]"}`}>
                    {margen ? `${margen.margen.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Inventario */}
        {inventarioActivo && (
          <div>
            <h4 className="text-[10px] font-semibold text-[var(--c-text3)] uppercase tracking-wider mb-3">Inventario</h4>
            <div className="space-y-2.5">
              <div className="flex justify-between">
                <span className="text-xs text-[var(--c-text2)]">Unidad de medida</span>
                <span className="text-xs font-bold text-[var(--c-text)]">{labelUnidad(producto.unidadMedida, producto.unidadPersonalizada)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-[var(--c-text2)]">Forma de venta</span>
                <span className="text-xs font-bold text-[var(--c-text)] capitalize">{producto.formaVenta === "unidad" ? "Por unidad" : producto.formaVenta === "peso" ? "Por peso" : "Por volumen"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[var(--c-text2)]">Stock actual</span>
                <StockBadge stock={producto.stock} stockMinimo={producto.stockMinimo} formaVenta={producto.formaVenta} unidadMedida={producto.unidadMedida} unidadPersonalizada={producto.unidadPersonalizada} />
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-[var(--c-text2)]">Stock mínimo</span>
                <span className="text-xs font-bold text-[var(--c-text)]">{producto.stockMinimo !== null ? formatearStock(producto.stockMinimo, producto.formaVenta, producto.unidadMedida, producto.unidadPersonalizada) : "—"}</span>
              </div>
              {producto.stock !== null && (
                <div className="pt-1">
                  <div className="h-1.5 bg-[var(--c-card2)] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      getStockStatus(producto.stock, producto.stockMinimo) === "ok" ? "bg-emerald-500" :
                      getStockStatus(producto.stock, producto.stockMinimo) === "bajo" ? "bg-amber-500" : "bg-red-500"
                    }`} style={{ width: `${Math.min(100, producto.stockMinimo ? (producto.stock / (producto.stockMinimo * 3)) * 100 : 50)}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rendimiento */}
        <div>
          <h4 className="text-[10px] font-semibold text-[var(--c-text3)] uppercase tracking-wider mb-3">Rendimiento</h4>
          <div className="space-y-2.5">
            <div className="flex justify-between">
              <span className="text-xs text-[var(--c-text2)]">Vendidos (total)</span>
              <span className="text-xs font-bold text-[var(--c-text)]">{producto.ventasCount} unidades</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-[var(--c-text2)]">Ingresos generados</span>
              <span className="text-xs font-bold text-emerald-400">{formatCLP(producto.ingresosTotal)}</span>
            </div>
            {inventarioActivo && margen && (
              <div className="flex justify-between">
                <span className="text-xs text-[var(--c-text2)]">Utilidad generada</span>
                <span className="text-xs font-bold text-sky-400">{formatCLP(margen.ganancia * producto.ventasCount)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ajuste de stock */}
      {inventarioActivo && producto.stock !== null && (
        <div className="px-5 pb-4">
          {!ajustando ? (
            <button onClick={() => setAjustando(true)} className="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/20 hover:border-sky-500/40 px-3 py-1.5 rounded-lg transition-all">
              Ajustar stock
            </button>
          ) : (
            <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3 space-y-2.5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-[var(--c-text2)]">Cantidad ({labelUnidad(producto.unidadMedida, producto.unidadPersonalizada)}):</span>
                <input type="number" min="0" step={producto.formaVenta === "unidad" ? "1" : "any"} value={cantidadAjuste} onChange={e => setCantidadAjuste(e.target.value)}
                  className="w-24 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-2 h-7 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[var(--c-text2)]">Motivo:</span>
                <select value={motivoAjuste} onChange={e => setMotivoAjuste(e.target.value as TipoMovimientoStock)}
                  className="bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-2 h-7 text-xs text-[var(--c-text)] outline-none focus:border-sky-500">
                  {MOTIVOS_AJUSTE.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {motivoAjuste === "reposicion" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--c-text2)]">Costo unitario (opcional):</span>
                  <input type="number" min="0" value={costoAjuste} onChange={e => setCostoAjuste(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    className="w-24 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-2 h-7 text-xs text-[var(--c-text)] outline-none focus:border-sky-500" />
                  <span className="text-xs text-[var(--c-text2)]">🗓️ Vence (opcional):</span>
                  <input type="date" value={fechaVencimientoAjuste} onChange={e => setFechaVencimientoAjuste(e.target.value)}
                    className="bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-2 h-7 text-xs text-[var(--c-text)] outline-none focus:border-sky-500" />
                </div>
              )}
              {motivoAjuste === "otro" && (
                <input value={observacionAjuste} onChange={e => setObservacionAjuste(e.target.value)} placeholder="Describe el motivo..."
                  className="w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-2 h-7 text-xs text-[var(--c-text)] outline-none focus:border-sky-500 placeholder:text-[var(--c-text4)]" />
              )}
              <div className="flex items-center gap-2">
                <button disabled={isPending} onClick={() => handleAjuste("agregar")} className="text-xs px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all">+ Agregar</button>
                <button disabled={isPending} onClick={() => handleAjuste("reducir")} className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all">− Reducir</button>
                <button onClick={() => setAjustando(false)} className="text-xs text-[var(--c-text3)] hover:text-[var(--c-text)] ml-auto">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lotes con vencimiento — solo se muestra si el producto tiene alguno */}
      {inventarioActivo && producto.stock !== null && (
        <LotesProducto productoId={producto.id} labelUnidad={labelUnidad(producto.unidadMedida, producto.unidadPersonalizada)} />
      )}

      {/* Historial de movimientos de stock */}
      {inventarioActivo && producto.stock !== null && (
        <HistorialStock productoId={producto.id} />
      )}

      {/* Acciones */}
      <div className="px-5 pb-5 flex gap-2 flex-wrap border-t border-[var(--c-border)] pt-4">
        <button onClick={onEdit} className="text-xs px-3 py-2 bg-[var(--c-card2)] hover:bg-sky-500/10 text-[var(--c-text2)] hover:text-sky-400 border border-[var(--c-border)] hover:border-sky-500/20 rounded-xl transition-all">✏️ Editar</button>
        <ToggleActivoBtn producto={producto} />
        <EliminarProductoBtn producto={producto} onDeleted={onDeleted} />
      </div>

      {avisoCosto && (
        <AvisoCambioCostoModal aviso={avisoCosto} onCerrar={() => setAvisoCosto(null)} />
      )}
    </div>
  )
}

function ToggleActivoBtn({ producto }: { producto: Producto }) {
  const [isPending, start] = useTransition()
  function handle() {
    start(async () => {
      try {
        await toggleProducto(producto.id, !producto.activo)
        toast.success(producto.activo ? "Producto desactivado" : "Producto activado")
      } catch { toast.error("Error") }
    })
  }
  return (
    <button onClick={handle} disabled={isPending}
      className={`text-xs px-3 py-2 border rounded-xl transition-all disabled:opacity-60 ${
        producto.activo ? "bg-red-500/5 hover:bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      }`}>
      {producto.activo ? "⏸ Desactivar" : "▶ Activar"}
    </button>
  )
}

function EliminarProductoBtn({ producto, onDeleted }: { producto: Producto; onDeleted: () => void }) {
  const [isPending, start] = useTransition()
  const [confirmando, setConfirmando] = useState(false)

  function handleEliminar() {
    start(async () => {
      try {
        await eliminarProducto(producto.id)
        toast.success("Producto eliminado permanentemente")
        onDeleted()
      } catch (err: any) { toast.error(err?.message ?? "No se pudo eliminar") }
    })
  }

  return (
    <>
      <button onClick={() => setConfirmando(true)}
        className="text-xs px-3 py-2 bg-[var(--c-card2)] hover:bg-red-500/10 text-[var(--c-text3)] hover:text-red-400 border border-[var(--c-border)] hover:border-red-500/20 rounded-xl transition-all">
        🗑️ Eliminar
      </button>

      {confirmando && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={() => !isPending && setConfirmando(false)}>
          <div className="bg-[var(--c-card)] border border-red-500/20 rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-bold text-[var(--c-text)]">Eliminar "{producto.nombre}"</p>
            </div>
            <p className="text-xs text-[var(--c-text2)] mb-2">
              Esto elimina el producto de forma <strong className="text-red-400">permanente</strong> — no se puede deshacer. No va a quedar ningún dato guardado de su ficha (nombre, código, stock, historial de inventario).
            </p>
            <p className="text-xs text-[var(--c-text2)] mb-4">
              Las ventas y movimientos que ya registraste con este producto <strong className="text-emerald-400">no se borran</strong> — siguen apareciendo en Movimientos y Reportes, solo que sin el vínculo directo al producto.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmando(false)} disabled={isPending}
                className="flex-1 h-10 border border-[var(--c-border)] text-[var(--c-text2)] text-sm rounded-xl hover:bg-[var(--c-card2)] transition-all disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleEliminar} disabled={isPending}
                className="flex-1 h-10 bg-red-500 hover:bg-red-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
                {isPending ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ProductosClient({ productosData, customCategorias = [], customUnidades = [] }: { productosData: Producto[]; customCategorias?: string[]; customUnidades?: string[] }) {
  const [inventarioActivo, setInventarioActivo] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("nelyx_inventario") === "1"
    return false
  })
  const [productos, setProductos] = useState(productosData)
  const [searchQuery, setSearchQuery] = useState("")
  const [filtro, setFiltro] = useState("todos")
  const [categoriaFiltro, setCategoriaFiltro] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null)

  const selectedProducto = useMemo(() => productos.find(p => p.id === selectedId) ?? null, [productos, selectedId])

  function toggleInventario() {
    const nuevo = !inventarioActivo
    setInventarioActivo(nuevo)
    if (typeof window !== "undefined") localStorage.setItem("nelyx_inventario", nuevo ? "1" : "0")
  }

  const productosFiltrados = useMemo(() => {
    let list = [...productos]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(p => p.nombre.toLowerCase().includes(q) || p.categoria?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
    }
    if (categoriaFiltro) list = list.filter(p => p.categoria === categoriaFiltro)
    switch (filtro) {
      case "activos":    list = list.filter(p => p.activo); break
      case "inactivos":  list = list.filter(p => !p.activo); break
      case "agotados":   list = list.filter(p => p.stock === 0); break
      case "stock_bajo": list = list.filter(p => p.stock !== null && p.stock > 0 && p.stockMinimo !== null && p.stock <= p.stockMinimo); break
      case "por_vencer": list = list.filter(p => p.proximoVencimiento !== null).sort((a,b) => a.proximoVencimiento!.diasRestantes - b.proximoVencimiento!.diasRestantes); break
      case "mas_vendidos": list = list.filter(p => p.ventasCount > 0).sort((a,b) => b.ventasCount - a.ventasCount); break
    }
    return list
  }, [productos, searchQuery, filtro, categoriaFiltro])

  // Stats
  const stats = useMemo(() => {
    const activos = productos.filter(p => p.activo)
    const conInventario = activos.filter(p => p.stock !== null)
    const valorInventario = conInventario.reduce((a, p) => a + deInterno(p.stock ?? 0, p.unidadMedida) * (p.costo ?? p.precio ?? 0), 0)
    const stockBajo = conInventario.filter(p => p.stockMinimo && p.stock! <= p.stockMinimo).length
    const agotados = conInventario.filter(p => p.stock === 0).length
    const masVendido = [...productos].filter(p => p.ventasCount > 0).sort((a,b) => b.ventasCount - a.ventasCount)[0] ?? null
    return { total: activos.length, valorInventario, stockBajo, agotados, masVendido }
  }, [productos])

  function handleFormSuccess() {
    // Reload data by refreshing - Next.js will revalidate
    window.location.reload()
  }

  const FILTROS = [
    { key: "todos", label: "Todos" },
    { key: "activos", label: "Activos" },
    { key: "inactivos", label: "Inactivos" },
    ...(inventarioActivo ? [
      { key: "agotados", label: "Agotados" },
      { key: "stock_bajo", label: "Stock bajo" },
      { key: "por_vencer", label: "Por vencer" },
    ] : []),
    { key: "mas_vendidos", label: "Más vendidos" },
  ]

  const categorias = useMemo(() => {
    const cats = new Set<string>()
    productos.forEach(p => { if (p.categoria) cats.add(p.categoria) })
    return Array.from(cats).sort()
  }, [productos])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Productos</h1>
          <p className="text-sm text-[var(--c-text3)] mt-0.5">Gestiona tu catálogo y controla tu inventario</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/dashboard/productos/escanear-nuevos"
            className="flex items-center gap-2 h-10 px-4 border border-[var(--c-border)] text-[var(--c-text2)] hover:bg-[var(--c-card2)] text-sm font-semibold rounded-xl transition-all whitespace-nowrap">
            📷 Escanear productos nuevos
          </Link>
          <Link href="/dashboard/productos/importar"
            className="flex items-center gap-2 h-10 px-4 border border-[var(--c-border)] text-[var(--c-text2)] hover:bg-[var(--c-card2)] text-sm font-semibold rounded-xl transition-all whitespace-nowrap">
            📥 Importación masiva
          </Link>
          <Link href="/dashboard/productos/reponer"
            className="flex items-center gap-2 h-10 px-4 border border-[var(--c-border)] text-[var(--c-text2)] hover:bg-[var(--c-card2)] text-sm font-semibold rounded-xl transition-all whitespace-nowrap">
            📦 Actualizar inventario
          </Link>
          <button onClick={() => { setShowForm(true); setEditingProducto(null) }}
            className="flex items-center gap-2 h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20 whitespace-nowrap">
            + Agregar producto
          </button>
        </div>
      </div>

      {/* Inventario toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`w-2 h-2 rounded-full ${inventarioActivo ? "bg-emerald-400" : "bg-[#2D3F55]"}`} />
              <p className="text-sm font-semibold text-[var(--c-text)]">Control de inventario</p>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${inventarioActivo ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-[var(--c-card2)] text-[var(--c-text3)] border-[var(--c-border)]"}`}>
                {inventarioActivo ? "Activado" : "Desactivado"}
              </span>
            </div>
            <p className="text-xs text-[var(--c-text3)]">
              {inventarioActivo ? "Llevas control de stock, costos y utilidades." : "Modo simple activado — solo nombre, precio y ventas."}
            </p>
          </div>
          <button onClick={toggleInventario}
            className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${inventarioActivo ? "bg-sky-500" : "bg-[#1E2D45]"}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${inventarioActivo ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
          </button>
        </div>

        {!inventarioActivo && (
          <div className="sm:w-64 bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl px-5 py-4">
            <p className="text-xs font-semibold text-[var(--c-text)] mb-1">¿No necesitas inventario?</p>
            <p className="text-[11px] text-[var(--c-text3)]">El modo simple registra ventas por producto sin controlar stock ni costos. Ideal para feriantes y ventas rápidas.</p>
          </div>
        )}
      </div>

      {/* Stats cards */}
      <div className={`grid gap-3 ${inventarioActivo ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-3"}`}>
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
          <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2">Total productos</p>
          <p className="text-2xl font-bold text-[var(--c-text)]">{stats.total}</p>
          <p className="text-[11px] text-[var(--c-text3)] mt-1">Activos en catálogo</p>
        </div>
        {inventarioActivo && (
          <>
            <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4 card-hover">
              <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2">Valor inventario</p>
              <p className="text-xl font-bold text-emerald-400">{formatCLP(stats.valorInventario)}</p>
              <p className="text-[11px] text-[var(--c-text3)] mt-1">Costo total de stock</p>
            </div>
            <div className="bg-[var(--c-card)] border border-amber-500/15 rounded-2xl p-4 card-hover">
              <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2">Bajos en stock</p>
              <p className="text-2xl font-bold text-[var(--c-warning)]">{stats.stockBajo}</p>
              <p className="text-[11px] text-[var(--c-text3)] mt-1">Con stock bajo</p>
            </div>
            <div className="bg-[var(--c-card)] border border-red-500/15 rounded-2xl p-4 card-hover">
              <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2">Sin stock</p>
              <p className="text-2xl font-bold text-red-400">{stats.agotados}</p>
              <p className="text-[11px] text-[var(--c-text3)] mt-1">Agotados</p>
            </div>
          </>
        )}
        <div className="bg-[var(--c-card)] border border-violet-500/15 rounded-2xl p-4 card-hover">
          <p className="text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider mb-2">Más vendido</p>
          <p className="text-sm font-bold text-violet-400 truncate">{stats.masVendido?.nombre ?? "—"}</p>
          <p className="text-[11px] text-[var(--c-text3)] mt-1">{stats.masVendido ? `${stats.masVendido.ventasCount} ventas` : "Sin ventas"}</p>
        </div>
      </div>

      {/* Form */}
      {showForm && !editingProducto && (
        <ProductoWizard
          dbCategorias={customCategorias}
          onClose={() => setShowForm(false)}
          onSuccess={handleFormSuccess}
        />
      )}
      {editingProducto && (
        <FormProducto
          inventarioActivo={inventarioActivo}
          producto={editingProducto}
          dbCategorias={customCategorias}
          dbUnidades={customUnidades}
          onClose={() => { setShowForm(false); setEditingProducto(null) }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">🔍</span>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar producto, categoría, SKU..."
            className="w-full bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl pl-9 pr-4 h-10 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors" />
        </div>
        {categorias.length > 0 && (
          <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}
            className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text2)] outline-none focus:border-sky-500 transition-colors">
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={`text-xs px-3 py-2 rounded-xl border font-medium transition-all ${filtro === f.key ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-[var(--c-card)] text-[var(--c-text2)] border-[var(--c-border)] hover:border-sky-500/20 hover:text-[var(--c-text)]"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product detail */}
      {selectedProducto && !editingProducto && (
        <ProductoDetalle
          producto={selectedProducto}
          inventarioActivo={inventarioActivo}
          onEdit={() => { setEditingProducto(selectedProducto); setShowForm(false) }}
          onClose={() => setSelectedId(null)}
          onDeleted={() => setSelectedId(null)}
        />
      )}

      {/* Tabla de productos */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
        {productosFiltrados.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm text-[var(--c-text3)] font-medium">
              {searchQuery || filtro !== "todos" ? "No hay productos con ese filtro" : "Sin productos aún"}
            </p>
            {!searchQuery && filtro === "todos" && (
              <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-sky-400 hover:text-sky-300">
                + Agrega tu primer producto
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--c-border)]">
                  <th className="text-left text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-5 py-3">Producto</th>
                  <th className="text-left text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Categoría</th>
                  {inventarioActivo && (
                    <th className="text-center text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-3 py-3 hidden md:table-cell">Vencimiento</th>
                  )}
                  <th className="text-right text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-3 py-3">Precio venta</th>
                  {inventarioActivo && <>
                    <th className="text-right text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-3 py-3 hidden md:table-cell">Costo</th>
                    <th className="text-center text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-3 py-3 hidden lg:table-cell">Stock</th>
                  </>}
                  <th className="text-right text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-3 py-3 hidden sm:table-cell">Vendidos</th>
                  {inventarioActivo && (
                    <th className="text-right text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-3 py-3 hidden lg:table-cell">Utilidad</th>
                  )}
                  <th className="text-center text-[10px] text-[var(--c-text3)] font-semibold uppercase tracking-wider px-3 py-3">Estado</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--c-border2)]">
                {productosFiltrados.map(p => {
                  const margen = getMargen(p.precio, p.costo)
                  const isSelected = selectedId === p.id
                  return (
                    <tr key={p.id}
                      onClick={() => setSelectedId(isSelected ? null : p.id)}
                      className={`cursor-pointer transition-all ${isSelected ? "bg-sky-500/5" : "hover:bg-[var(--c-card2)]"}`}>
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-1.5">{getEmojiProducto(p.nombre, p.categoria)} {p.nombre}</p>
                          {p.descripcion && <p className="text-[11px] text-[var(--c-text3)] truncate max-w-[160px]">{p.descripcion}</p>}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 hidden sm:table-cell">
                        <CategoriaBadge categoria={p.categoria} />
                      </td>
                      {inventarioActivo && (
                        <td className="px-3 py-3.5 text-center hidden md:table-cell">
                          <VencimientoBadge proximoVencimiento={p.proximoVencimiento} />
                        </td>
                      )}
                      <td className="px-3 py-3.5 text-right">
                        <span className="text-sm font-semibold text-[var(--c-text)]">{p.precio ? formatCLP(p.precio) : "—"}</span>
                      </td>
                      {inventarioActivo && <>
                        <td className="px-3 py-3.5 text-right hidden md:table-cell">
                          <span className="text-sm text-[var(--c-text2)]">{p.costo ? formatCLP(p.costo) : "—"}</span>
                        </td>
                        <td className="px-3 py-3.5 text-center hidden lg:table-cell">
                          <StockBadge stock={p.stock} stockMinimo={p.stockMinimo} formaVenta={p.formaVenta} unidadMedida={p.unidadMedida} unidadPersonalizada={p.unidadPersonalizada} />
                        </td>
                      </>}
                      <td className="px-3 py-3.5 text-right hidden sm:table-cell">
                        <span className="text-sm text-[var(--c-text2)]">{p.ventasCount}</span>
                      </td>
                      {inventarioActivo && (
                        <td className="px-3 py-3.5 text-right hidden lg:table-cell">
                          {margen ? (
                            <div>
                              <p className="text-sm font-semibold text-emerald-400">{formatCLP(margen.ganancia)}</p>
                              <p className="text-[10px] text-[var(--c-text3)]">{margen.margen.toFixed(1)}%</p>
                            </div>
                          ) : <span className="text-[var(--c-text4)]">—</span>}
                        </td>
                      )}
                      <td className="px-3 py-3.5 text-center">
                        <span className={`text-[10px] px-2 py-1 rounded-full border font-medium ${p.activo ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-[var(--c-card2)] text-[var(--c-text3)] border-[var(--c-border)]"}`}>
                          {p.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <button onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : p.id) }}
                          className="text-[var(--c-text3)] hover:text-sky-400 transition-colors text-sm">
                          {isSelected ? "▲" : "▼"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info modo inventario */}
      {inventarioActivo && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-[var(--c-text)] mb-4">Funcionalidades del modo inventario</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: "📦", titulo: "Control de stock", desc: "Monitorea tu inventario en tiempo real" },
              { icon: "💰", titulo: "Costos y utilidad", desc: "Calcula ganancias automáticamente" },
              { icon: "🔔", titulo: "Alertas inteligentes", desc: "Recibe alertas de stock bajo o agotado" },
              { icon: "📊", titulo: "Historial detallado", desc: "Revisa el rendimiento de cada producto" },
            ].map(f => (
              <div key={f.titulo} className="text-center p-3 bg-[var(--c-card2)] rounded-xl border border-[var(--c-border)]">
                <span className="text-2xl block mb-2">{f.icon}</span>
                <p className="text-xs font-semibold text-[var(--c-text)] mb-1">{f.titulo}</p>
                <p className="text-[10px] text-[var(--c-text3)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
