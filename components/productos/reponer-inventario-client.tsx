"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { confirmarReposicionMasiva } from "@/app/actions/reposicion-acciones"
import { AvisoCambioCostoModal, type AvisoCosto } from "@/components/productos/aviso-cambio-costo-modal"
import { formatCLP } from "@/lib/utils"
import { labelUnidad, formatearStock } from "@/lib/unidades"
import { EscanerCodigoBarras } from "@/components/shared/escaner-codigo-barras"

interface ProductoOpt {
  id: string; nombre: string; sku: string | null; codigoBarras: string | null
  stock: number | null; costo: any; formaVenta: string; unidadMedida: string; unidadPersonalizada: string | null
}
interface ProveedorOpt { id: string; nombre: string }

type ItemReposicion = {
  productoId: string
  nombre: string
  cantidad: number // en la unidad de display del producto (ej: kg, unidades)
  stockActual: number | null // interno, para mostrar "antes → después"
  formaVenta: string
  unidadMedida: string
  unidadPersonalizada: string | null
  costoUnitario: string // string para el input, se parsea al confirmar
  fechaVencimiento: string // opcional — este lote específico de reposición
}

const inp = "w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"

export function ReponerInventarioClient({ productos, proveedores }: { productos: ProductoOpt[]; proveedores: ProveedorOpt[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mostrarEscaner, setMostrarEscaner] = useState(false)
  const [items, setItems] = useState<ItemReposicion[]>([])
  const [colaAvisosCosto, setColaAvisosCosto] = useState<AvisoCosto[]>([])
  const [proveedorId, setProveedorId] = useState("")
  const [buscarManual, setBuscarManual] = useState("")

  function agregarOIncrementar(codigo: string) {
    const prod = productos.find(p => p.codigoBarras === codigo || p.sku === codigo)
    if (!prod) {
      toast.error(`Ningún producto tiene el código ${codigo}`, { description: "Puedes crearlo desde Productos y asociarle este código." })
      return
    }
    setItems(prev => {
      const existente = prev.find(it => it.productoId === prod.id)
      if (existente) {
        return prev.map(it => it.productoId === prod.id ? { ...it, cantidad: it.cantidad + 1 } : it)
      }
      return [...prev, {
        productoId: prod.id, nombre: prod.nombre, cantidad: 1, stockActual: prod.stock,
        formaVenta: prod.formaVenta, unidadMedida: prod.unidadMedida, unidadPersonalizada: prod.unidadPersonalizada,
        costoUnitario: prod.costo ? String(prod.costo) : "",
        fechaVencimiento: "",
      }]
    })
    toast.success(`${prod.nombre} — cantidad sumada`)
  }

  function handleCodigoDetectado(codigo: string) {
    setMostrarEscaner(false)
    agregarOIncrementar(codigo)
  }

  function handleBusquedaManual(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && buscarManual.trim()) {
      e.preventDefault()
      agregarOIncrementar(buscarManual.trim())
      setBuscarManual("")
    }
  }

  function setCantidad(productoId: string, cantidad: number) {
    setItems(prev => prev.map(it => it.productoId === productoId ? { ...it, cantidad: Math.max(0, cantidad) } : it))
  }
  function setCosto(productoId: string, costoUnitario: string) {
    setItems(prev => prev.map(it => it.productoId === productoId ? { ...it, costoUnitario } : it))
  }
  function setFechaVencimiento(productoId: string, fechaVencimiento: string) {
    setItems(prev => prev.map(it => it.productoId === productoId ? { ...it, fechaVencimiento } : it))
  }
  function quitarItem(productoId: string) {
    setItems(prev => prev.filter(it => it.productoId !== productoId))
  }

  function handleConfirmar() {
    const validos = items.filter(it => it.cantidad > 0)
    if (validos.length === 0) { toast.error("Agrega al menos un producto con cantidad mayor a 0"); return }

    startTransition(async () => {
      try {
        const resultado = await confirmarReposicionMasiva(
          validos.map(it => ({
            productoId: it.productoId, nombre: it.nombre, cantidad: it.cantidad,
            costoUnitario: it.costoUnitario ? parseFloat(it.costoUnitario) : undefined,
            fechaVencimiento: it.fechaVencimiento || undefined,
          })),
          proveedorId || undefined
        )
        if (resultado.errores.length > 0) {
          toast.error(`${resultado.exitosos} de ${resultado.total} productos actualizados`, {
            description: resultado.errores.join(" · "),
          })
        } else {
          toast.success(`✅ Reposición registrada — ${resultado.exitosos} producto${resultado.exitosos === 1 ? "" : "s"} actualizado${resultado.exitosos === 1 ? "" : "s"}`)
        }
        if (resultado.avisosCosto?.length > 0) setColaAvisosCosto(resultado.avisosCosto as AvisoCosto[])
        setItems([])
        setProveedorId("")
        router.refresh() // trae el stock actualizado para la próxima reposición
      } catch (err: any) {
        toast.error(err?.message ?? "Error al confirmar la reposición")
      }
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">

      {/* Escanear / buscar */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
        <p className="text-sm font-semibold text-[var(--c-text)] mb-3">Escanea cada producto de la compra</p>
        <div className="flex gap-2">
          <input value={buscarManual} onChange={e => setBuscarManual(e.target.value)} onKeyDown={handleBusquedaManual}
            placeholder="O escribe / pega el código y presiona Enter..." className={`${inp} flex-1`} />
          <button type="button" onClick={() => setMostrarEscaner(true)}
            className="flex-shrink-0 h-10 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold flex items-center gap-2 transition-all">
            📷 Escanear
          </button>
        </div>
        <p className="text-[11px] text-[var(--c-text4)] mt-2">Si escaneas el mismo producto varias veces, la cantidad se va sumando sola.</p>
      </div>

      {/* Lista de productos escaneados */}
      {items.length > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--c-border)]">
            <p className="text-sm font-semibold text-[var(--c-text)]">{items.length} producto{items.length === 1 ? "" : "s"} en esta reposición</p>
          </div>
          <div className="divide-y divide-[var(--c-border2)]">
            {items.map(it => {
              const label = labelUnidad(it.unidadMedida, it.unidadPersonalizada)
              return (
                <div key={it.productoId} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--c-text)] truncate">{it.nombre}</p>
                      <p className="text-[11px] text-[var(--c-text4)]">Stock actual: {formatearStock(it.stockActual, it.formaVenta, it.unidadMedida, it.unidadPersonalizada)}</p>
                    </div>
                    <button onClick={() => quitarItem(it.productoId)} className="flex-shrink-0 text-[var(--c-text4)] hover:text-red-400 text-sm px-1">✕</button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setCantidad(it.productoId, it.cantidad - 1)}
                        className="w-8 h-8 rounded-lg bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text)] flex items-center justify-center hover:border-sky-500/40 transition-all">−</button>
                      <input type="number" min="0" step="any" value={it.cantidad}
                        onChange={e => setCantidad(it.productoId, parseFloat(e.target.value) || 0)}
                        className="w-16 h-8 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg text-center text-sm font-bold text-[var(--c-text)] outline-none focus:border-sky-500" />
                      <button type="button" onClick={() => setCantidad(it.productoId, it.cantidad + 1)}
                        className="w-8 h-8 rounded-lg bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text)] flex items-center justify-center hover:border-sky-500/40 transition-all">+</button>
                      <span className="text-xs text-[var(--c-text3)]">{label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-xs text-[var(--c-text4)]">Costo/{label}:</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--c-text4)] text-xs">$</span>
                        <input type="number" min="0" placeholder="opcional" value={it.costoUnitario}
                          onChange={e => setCosto(it.productoId, e.target.value)}
                          className="w-24 h-8 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg pl-5 pr-2 text-xs text-[var(--c-text)] outline-none focus:border-sky-500" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-xs text-[var(--c-text4)]">🗓️ Vence (opcional):</span>
                    <input type="date" value={it.fechaVencimiento}
                      onChange={e => setFechaVencimiento(it.productoId, e.target.value)}
                      className="h-8 bg-[var(--c-input)] border border-[var(--c-border)] rounded-lg px-2 text-xs text-[var(--c-text)] outline-none focus:border-sky-500" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Proveedor + confirmar */}
      {items.length > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 space-y-4">
          {proveedores.length > 0 && (
            <div>
              <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Proveedor de esta compra (opcional)</label>
              <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} className={inp}>
                <option value="">Sin proveedor asociado</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          )}
          <button onClick={handleConfirmar} disabled={isPending}
            className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
            {isPending ? "Registrando..." : `✅ Confirmar reposición (${items.length} producto${items.length === 1 ? "" : "s"})`}
          </button>
          <p className="text-[11px] text-[var(--c-text4)] text-center">Cada producto queda registrado en su historial (Kardex), con costo promedio si lo informaste.</p>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-10 text-[var(--c-text4)]">
          <span className="text-3xl block mb-2">📦</span>
          <p className="text-sm">Escanea el primer producto de la compra para empezar.</p>
        </div>
      )}

      {mostrarEscaner && (
        <EscanerCodigoBarras
          titulo="Escanear producto"
          onDetectado={handleCodigoDetectado}
          onCerrar={() => setMostrarEscaner(false)}
        />
      )}

      {/* Avisos de cambio de costo, uno a la vez si hubo varios productos
          con costo distinto en esta misma reposición */}
      {colaAvisosCosto.length > 0 && (
        <AvisoCambioCostoModal
          aviso={colaAvisosCosto[0]}
          onCerrar={() => setColaAvisosCosto(prev => prev.slice(1))}
        />
      )}
    </div>
  )
}
