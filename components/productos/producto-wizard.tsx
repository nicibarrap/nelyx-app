"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { crearProducto, crearCategoriaPersonalizada } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"
import { aInterno, type FormaVenta } from "@/lib/unidades"
import { calcularMargenPorcentual } from "@/lib/financial-engine"
import { EscanerCodigoBarras } from "@/components/shared/escaner-codigo-barras"
import { getColorCategoria } from "@/lib/categorias"
import { sugerirCategoria } from "@/lib/sugerencias-producto"

const CATEGORIAS_DEFAULT = ["Bebidas","Carnes","Verduras","Abarrotes","Limpieza","Accesorios","Panadería","Frutas","Lácteos","Otros"]

const PASOS = ["Inicio", "Tipo", "Información", "Compra", "Venta", "Mínimo", "Resumen"]

type TipoProducto = "unidad" | "peso"

const TIPO_CFG: Record<TipoProducto, { label: string; icon: string; ejemplos: string; formaVenta: FormaVenta; unidadDefault: string }> = {
  unidad:    { label: "Se vende por unidad",  icon: "📦", ejemplos: "Zapatos, botellas, cajas, packs, televisores, sillas.", formaVenta: "unidad", unidadDefault: "unidad" },
  peso:      { label: "Se vende por peso",    icon: "⚖️", ejemplos: "Frutas, verduras, carnes, quesos, maní, arroz.",       formaVenta: "peso",   unidadDefault: "kg" },
}

const inp = "w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 h-11 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"
const sel = inp

function Progreso({ paso }: { paso: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
      {PASOS.map((label, i) => {
        const n = i + 1
        const activo = n === paso
        const hecho = n < paso
        return (
          <div key={label} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all
                ${hecho ? "bg-emerald-500 text-white" : activo ? "bg-sky-500 text-white" : "bg-[var(--c-hover)] text-[var(--c-text3)] border border-[var(--c-border)]"}`}>
                {hecho ? "✓" : n}
              </div>
              <span className={`text-[9px] whitespace-nowrap ${activo ? "text-sky-400 font-semibold" : hecho ? "text-emerald-400" : "text-[var(--c-text4)]"}`}>{label}</span>
            </div>
            {i < PASOS.length - 1 && <div className={`w-4 sm:w-8 h-px mx-1 mb-4 ${hecho ? "bg-emerald-500" : "bg-[var(--c-border)]"}`} />}
          </div>
        )
      })}
    </div>
  )
}

function AyudaBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-sky-500/5 border border-sky-500/15 rounded-xl px-3.5 py-2.5">
      <span className="text-sm flex-shrink-0">💡</span>
      <p className="text-[11px] text-[var(--c-text2)] leading-relaxed">{children}</p>
    </div>
  )
}

export function ProductoWizard({ dbCategorias = [], onClose, onSuccess }: { dbCategorias?: string[]; onClose: () => void; onSuccess: () => void }) {
  const [paso, setPaso] = useState(0) // 0 = intro
  const [isPending, start] = useTransition()

  // Paso 1
  const [controlaInventario, setControlaInventario] = useState<boolean | null>(null)
  // Paso 2
  const [nombre, setNombre] = useState("")
  const [categoria, setCategoria] = useState("")
  const [categoriaFueSugerida, setCategoriaFueSugerida] = useState(false)
  const [formaVentaSugerida, setFormaVentaSugerida] = useState<TipoProducto | null>(null)
  const [customCatInput, setCustomCatInput] = useState("")
  const [customCats, setCustomCats] = useState<string[]>([])
  const [descripcion, setDescripcion] = useState("")
  const [sku, setSku] = useState("")
  const [codigoBarras, setCodigoBarras] = useState("")
  const [mostrarEscaner, setMostrarEscaner] = useState(false)
  // Paso 3
  const [tipoProducto, setTipoProducto] = useState<TipoProducto | null>(null)
  // Paso 4 — Compra
  const [subUnidadCompra, setSubUnidadCompra] = useState("") // kg/g, L/ml, o la unidadMedida elegida directamente
  const [cantidadComprada, setCantidadComprada] = useState<number | "">("")
  const [costoUnitarioCompra, setCostoUnitarioCompra] = useState<number | "">("")
  const [fechaVencimiento, setFechaVencimiento] = useState("")
  // Paso 5 — Venta
  const [usaPresentacion, setUsaPresentacion] = useState(true) // solo aplica si tipoProducto es peso/volumen
  const [unidadVentaTipo, setUnidadVentaTipo] = useState("bolsa")
  const [pesoPorPresentacion, setPesoPorPresentacion] = useState<number | "">("")
  const [precioVenta, setPrecioVenta] = useState<number | "">("")
  // Paso 6
  const [stockMinimo, setStockMinimo] = useState<number | "">("")

  const todasCategorias = [...CATEGORIAS_DEFAULT, ...dbCategorias, ...customCats].filter((c, i, arr) => arr.findIndex(x => x.toLowerCase() === c.toLowerCase()) === i)

  const cfg = tipoProducto ? TIPO_CFG[tipoProducto] : null
  // Nota: el nombre quedó de cuando existía también "volumen" como opción —
  // se sacó del Paso 2 (sin uso real para el negocio), así que hoy esto es
  // equivalente a "es peso", pero no se renombró en cada uso para minimizar
  // el riesgo de tocar líneas que ya funcionan bien.
  const esPesoOVolumen = tipoProducto === "peso"
  const unidadBase = tipoProducto === "peso" ? "g" : null
  const unidadGrande = tipoProducto === "peso" ? "Kg" : null

  // ── Cálculos derivados ──
  const unidadMedidaFinal = esPesoOVolumen ? subUnidadCompra : cfg?.unidadDefault ?? "unidad"
  const cantidadCompradaNum = typeof cantidadComprada === "number" ? cantidadComprada : 0
  const costoUnitarioNum = typeof costoUnitarioCompra === "number" ? costoUnitarioCompra : 0
  const valorInventario = cantidadCompradaNum * costoUnitarioNum
  const stockInternoTotal = controlaInventario && unidadMedidaFinal ? aInterno(cantidadCompradaNum, unidadMedidaFinal) : 0

  // Costo por unidad base (g o ml) para poder calcular el costo de la presentación
  const costoUnitarioEnUnidadCompraBase = unidadMedidaFinal === "kg" || unidadMedidaFinal === "L" ? costoUnitarioNum / 1000 : costoUnitarioNum
  const pesoPresNum = typeof pesoPorPresentacion === "number" ? pesoPorPresentacion : 0
  const precioVentaNum = typeof precioVenta === "number" ? precioVenta : 0
  const costoPresentacion = pesoPresNum * costoUnitarioEnUnidadCompraBase
  const gananciaPresentacion = precioVentaNum - costoPresentacion
  const margenPresentacion = precioVentaNum > 0 ? (gananciaPresentacion / precioVentaNum) * 100 : 0
  const unidadesPorKgOL = pesoPresNum > 0 ? 1000 / pesoPresNum : 0
  const cantidadMaximaPresentaciones = pesoPresNum > 0 ? Math.floor(stockInternoTotal / pesoPresNum) : 0

  // Costo/precio FINAL a guardar (según si hay presentación fija o no)
  const usaPresentacionFinal = esPesoOVolumen && usaPresentacion
  const costoFinal = usaPresentacionFinal ? costoPresentacion : costoUnitarioNum
  const precioFinal = usaPresentacionFinal ? precioVentaNum : precioVentaNum
  const margenFinal = usaPresentacionFinal ? margenPresentacion : (calcularMargenPorcentual(precioVentaNum, costoUnitarioNum)?.margen ?? 0)

  function handleNombreChange(valor: string) {
    setNombre(valor)
    // Solo sugiere si la categoría está vacía o si la actual también vino
    // de una sugerencia previa — nunca pisa una elección manual del usuario.
    if (categoria !== "" && !categoriaFueSugerida) return
    const sugerencia = sugerirCategoria(valor)
    if (sugerencia.categoria) {
      // Si la categoría sugerida todavía no existe en la grilla (ej. el
      // usuario nunca ha usado "Ferretería"), se agrega localmente para que
      // aparezca como botón visible y seleccionado — si no, quedaba elegida
      // "por dentro" pero sin ningún botón resaltado, dando la sensación de
      // que la sugerencia no hizo nada.
      if (!todasCategorias.some(c => c.toLowerCase() === sugerencia.categoria!.toLowerCase())) {
        setCustomCats(prev => [...prev, sugerencia.categoria!])
      }
      setCategoria(sugerencia.categoria)
      setCategoriaFueSugerida(true)
    } else if (categoriaFueSugerida) {
      setCategoria("")
      setCategoriaFueSugerida(false)
    }
    setFormaVentaSugerida(sugerencia.formaVenta)
  }

  function agregarCategoria() {
    const cat = customCatInput.trim()
    if (!cat) return
    setCategoriaFueSugerida(false)
    if (todasCategorias.some(c => c.toLowerCase() === cat.toLowerCase())) {
      setCategoria(todasCategorias.find(c => c.toLowerCase() === cat.toLowerCase()) ?? cat)
      setCustomCatInput("")
      return
    }
    setCustomCats(prev => [...prev, cat])
    setCategoria(cat)
    setCustomCatInput("")
    crearCategoriaPersonalizada("PRODUCTO", cat)
      .then(() => toast.success(`Categoría "${cat}" creada`))
      .catch(() => toast.error("No se pudo guardar la categoría en el servidor, pero quedó seleccionada para este producto"))
  }

  function puedeAvanzar(): boolean {
    if (paso === 1) return controlaInventario !== null
    if (paso === 2) return tipoProducto !== null && (!esPesoOVolumen || subUnidadCompra !== "")
    if (paso === 3) return nombre.trim().length > 0
    if (paso === 4) {
      if (!controlaInventario) return true
      return cantidadComprada !== "" && cantidadCompradaNum > 0 && costoUnitarioCompra !== "" && costoUnitarioNum > 0
    }
    if (paso === 5) {
      if (precioVenta === "" || precioVentaNum <= 0) return false
      if (usaPresentacionFinal && (pesoPorPresentacion === "" || pesoPresNum <= 0)) return false
      return true
    }
    if (paso === 6) return !controlaInventario || (stockMinimo !== "" && Number(stockMinimo) >= 0)
    return true
  }

  function siguiente() {
    if (!puedeAvanzar()) { toast.error("Completa los datos antes de continuar"); return }
    if (!controlaInventario) {
      if (paso === 1) { setPaso(3); return }   // salta Tipo
      if (paso === 3) { setPaso(5); return }   // salta Compra
      if (paso === 5) { setPaso(7); return }   // salta Mínimo
    }
    setPaso(p => Math.min(7, p + 1))
  }
  function volver() {
    if (!controlaInventario) {
      if (paso === 3) { setPaso(1); return }
      if (paso === 5) { setPaso(3); return }
      if (paso === 7) { setPaso(5); return }
    }
    setPaso(p => Math.max(0, p - 1))
  }

  function guardar() {
    start(async () => {
      try {
        const fd = new FormData()
        fd.set("nombre", nombre.trim())
        if (categoria) fd.set("categoria", categoria)
        if (descripcion) fd.set("descripcion", descripcion)
        if (sku) fd.set("sku", sku)
        if (codigoBarras) fd.set("codigoBarras", codigoBarras)
        if (fechaVencimiento) fd.set("fechaVencimiento", fechaVencimiento)
        fd.set("controlaInventario", controlaInventario ? "on" : "off")
        fd.set("formaVenta", cfg?.formaVenta ?? "unidad")
        fd.set("unidadMedida", unidadMedidaFinal)
        fd.set("precio", String(precioFinal))
        if (controlaInventario) fd.set("costo", String(costoFinal))
        if (controlaInventario) {
          fd.set("stock", String(cantidadCompradaNum))
          fd.set("stockMinimo", String(stockMinimo || 0))
        }
        if (usaPresentacionFinal) {
          fd.set("unidadVentaCantidad", String(pesoPresNum))
          fd.set("unidadVentaTipo", unidadVentaTipo)
        }
        await crearProducto(fd)
        toast.success("✅ Producto creado con éxito")
        onSuccess()
      } catch (err: any) {
        toast.error(err?.message ?? "Error al guardar el producto")
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)] flex-shrink-0">
          <h2 className="text-sm font-bold text-[var(--c-text)]">Nuevo producto</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--c-card2)] text-[var(--c-text3)] hover:text-[var(--c-text)] flex items-center justify-center text-lg">×</button>
        </div>

        {paso > 0 && (
          <div className="px-5 pt-4 flex-shrink-0">
            <Progreso paso={paso} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-5">

          {/* Paso 0 — Intro */}
          {paso === 0 && (
            <div className="flex flex-col items-center text-center py-10">
              <div className="text-4xl mb-4">✨</div>
              <h3 className="text-lg font-bold text-[var(--c-text)] mb-2">¡Vamos a crear tu producto!</h3>
              <p className="text-sm text-[var(--c-text3)] max-w-xs">Te guiaremos paso a paso para que sea muy fácil y rápido.</p>
              <button onClick={() => setPaso(1)} className="mt-6 h-11 px-8 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all">Comenzar</button>
            </div>
          )}

          {/* Paso 1 — Controlar inventario */}
          {paso === 1 && (
            <div>
              <h3 className="text-base font-bold text-[var(--c-text)] text-center mb-1">¿Cómo deseas administrar este producto?</h3>
              <p className="text-xs text-[var(--c-text3)] text-center mb-5">Esto definirá cómo NELYX lo gestionará.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <button onClick={() => setControlaInventario(true)}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${controlaInventario === true ? "border-sky-500 bg-sky-500/5" : "border-[var(--c-border)] hover:border-sky-500/30"}`}>
                  <div className="w-11 h-11 rounded-xl bg-orange-500/10 flex items-center justify-center text-xl mb-3">📦</div>
                  <p className="text-sm font-bold text-[var(--c-text)] mb-1">Controlar inventario</p>
                  <p className="text-[11px] text-[var(--c-text3)] mb-2">Para productos físicos donde necesitas llevar control de stock.</p>
                  <p className="text-[10px] text-[var(--c-text4)]">Ej: Frutas, carnes, ropa, bebidas, electrónica.</p>
                </button>
                <button onClick={() => setControlaInventario(false)}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${controlaInventario === false ? "border-sky-500 bg-sky-500/5" : "border-[var(--c-border)] hover:border-sky-500/30"}`}>
                  <div className="w-11 h-11 rounded-xl bg-sky-500/10 flex items-center justify-center text-xl mb-3">🤝</div>
                  <p className="text-sm font-bold text-[var(--c-text)] mb-1">No controlar inventario</p>
                  <p className="text-[11px] text-[var(--c-text3)] mb-2">Para servicios, asesorías o productos sin stock.</p>
                  <p className="text-[10px] text-[var(--c-text4)]">Ej: Servicios, mano de obra, consultorías, clases.</p>
                </button>
              </div>
              <div className="mt-4"><AyudaBox>Podrás cambiar esto más adelante desde la configuración del producto.</AyudaBox></div>
            </div>
          )}

          {/* Paso 2 — Tipo (solo si controla inventario) */}
          {paso === 2 && (
            <div>
              <h3 className="text-base font-bold text-[var(--c-text)] text-center mb-1">¿Qué tipo de producto es?</h3>
              <p className="text-xs text-[var(--c-text3)] text-center mb-5">Selecciona la opción que mejor describa cómo vendes este producto.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {(Object.keys(TIPO_CFG) as TipoProducto[]).map(t => (
                  <button key={t} onClick={() => { setTipoProducto(t); setSubUnidadCompra(TIPO_CFG[t].unidadDefault === "kg" ? "kg" : TIPO_CFG[t].unidadDefault === "L" ? "L" : "") }}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${tipoProducto === t ? "border-sky-500 bg-sky-500/5" : "border-[var(--c-border)] hover:border-sky-500/30"}`}>
                    <div className="text-xl mb-2">{TIPO_CFG[t].icon}</div>
                    <p className="text-sm font-bold text-[var(--c-text)] mb-1">{TIPO_CFG[t].label}</p>
                    <p className="text-[10px] text-[var(--c-text4)]">Ej: {TIPO_CFG[t].ejemplos}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Paso 3 — Información básica */}
          {paso === 3 && (
            <div className="space-y-3.5">
              <h3 className="text-base font-bold text-[var(--c-text)] mb-1">Información básica</h3>
              <p className="text-xs text-[var(--c-text3)] mb-3">Completa los datos principales de tu producto.</p>

              <div>
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Nombre del producto *</label>
                <input value={nombre} onChange={e => handleNombreChange(e.target.value)} placeholder="Ej: Maní Premium" className={inp} />
                {controlaInventario && tipoProducto === "unidad" && formaVentaSugerida === "peso" && (
                  <div className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2 mt-2">
                    <span className="text-sm flex-shrink-0">⚖️</span>
                    <p className="text-[11px] text-[var(--c-text2)] flex-1">
                      Este producto parece venderse por peso — elegiste "Unidad" en el paso anterior.
                      <button type="button" onClick={() => setPaso(2)} className="text-sky-400 hover:text-sky-300 font-semibold ml-1">Volver y cambiarlo</button>
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 flex items-center gap-1.5">
                  Categoría
                  {categoriaFueSugerida && <span className="text-sky-400 font-normal">✨ Sugerida — puedes cambiarla</span>}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {todasCategorias.map(c => {
                    const color = getColorCategoria(c)
                    const activa = categoria === c
                    return (
                      <button key={c} type="button" onClick={() => { setCategoria(activa ? "" : c); setCategoriaFueSugerida(false) }}
                        className="px-2.5 py-2 rounded-xl text-xs font-medium text-left transition-all border truncate"
                        style={activa ? { backgroundColor: `${color}1A`, color, borderColor: `${color}40` } : { borderColor: "var(--c-border)", color: "var(--c-text2)" }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={customCatInput} onChange={e => setCustomCatInput(e.target.value)} placeholder="Nueva categoría..."
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); agregarCategoria() } }}
                    className={`${inp} h-8 text-xs flex-1`} />
                  <button type="button" onClick={agregarCategoria} className="h-8 px-3 bg-sky-500/10 text-sky-400 text-xs font-semibold rounded-lg border border-sky-500/20 hover:bg-sky-500/20 whitespace-nowrap">+ Agregar</button>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Descripción (opcional)</label>
                <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Maní seleccionado, ideal para snack..." className={inp} />
              </div>

              <div>
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">SKU / Código interno (opcional)</label>
                <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Opcional" className={inp} />
              </div>

              <div>
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Código de barras (opcional)</label>
                <div className="flex gap-2">
                  <input value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} placeholder="Escanea o escribe el código..." className={`${inp} flex-1`} />
                  <button type="button" onClick={() => setMostrarEscaner(true)}
                    className="flex-shrink-0 w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-400 flex items-center justify-center text-lg hover:bg-sky-500/20 transition-all"
                    title="Escanear código de barras">
                    📷
                  </button>
                </div>
                <p className="text-[10px] text-[var(--c-text4)] mt-1">Después, al vender, escaneas este mismo código y NELYX reconoce el producto solo.</p>
              </div>
            </div>
          )}

          {/* Paso 4 — Compra */}
          {paso === 4 && (
            <div className="space-y-3.5">
              <h3 className="text-base font-bold text-[var(--c-text)] mb-1">¿Cómo compras este producto?</h3>
              <p className="text-xs text-[var(--c-text3)] mb-3">Ingresa la cantidad y el costo de compra.</p>

              {!controlaInventario ? (
                <AyudaBox>Como no vas a controlar inventario para este producto, no necesitamos esta información — solo el precio de venta en el siguiente paso.</AyudaBox>
              ) : (
                <>
                  {esPesoOVolumen && (
                    <div className="flex gap-2">
                      {["kg", "g"].map(u => (
                        <button key={u} type="button" onClick={() => setSubUnidadCompra(u)}
                          className={`flex-1 h-11 rounded-xl border text-sm font-semibold transition-all ${subUnidadCompra === u ? "bg-sky-500/10 border-sky-500 text-sky-400" : "border-[var(--c-border)] text-[var(--c-text2)]"}`}>
                          {u === "kg" ? "Kilogramos (Kg)" : "Gramos (g)"}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">¿Cuánto compraste? *</label>
                      <input type="number" min="0" step="any" value={cantidadComprada} onChange={e => setCantidadComprada(e.target.value === "" ? "" : parseFloat(e.target.value))}
                        placeholder="0" className={inp} />
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">¿Cuánto pagas por {esPesoOVolumen ? `cada ${subUnidadCompra || unidadGrande}` : "cada uno"}? *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
                        <input type="number" min="0" step="1" value={costoUnitarioCompra} onChange={e => setCostoUnitarioCompra(e.target.value === "" ? "" : parseFloat(e.target.value))}
                          placeholder="0" className={inp + " pl-6"} />
                      </div>
                    </div>
                  </div>
                  {valorInventario > 0 && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                      <p className="text-[11px] text-[var(--c-text3)] flex items-center gap-1.5">🛒 Valor actual del inventario</p>
                      <p className="text-xl font-black text-emerald-400 mt-0.5">{formatCLP(valorInventario)}</p>
                      <p className="text-[10px] text-[var(--c-text4)] mt-1">{cantidadCompradaNum} {esPesoOVolumen ? subUnidadCompra : unidadMedidaFinal} × {formatCLP(costoUnitarioNum)}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">¿Este producto vence? (opcional)</label>
                    <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} className={inp} />
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">Si lo dejas vacío, no te avisaremos de vencimiento para este lote. Podrás agregarlo después, cada vez que repongas stock.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Paso 5 — Venta */}
          {paso === 5 && (
            <div className="space-y-3.5">
              <h3 className="text-base font-bold text-[var(--c-text)] mb-1">¿Cómo venderás este producto?</h3>
              <p className="text-xs text-[var(--c-text3)] mb-3">Define la presentación y el precio de venta.</p>

              {esPesoOVolumen && controlaInventario && (
                <div>
                  <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Forma de venta</label>
                  <select value={usaPresentacion ? "presentacion" : "directo"} onChange={e => setUsaPresentacion(e.target.value === "presentacion")} className={sel}>
                    <option value="presentacion">En paquetes (bolsas, botellas, etc.)</option>
                    <option value="directo">Directo por {unidadGrande}/{unidadBase} (el cliente elige la cantidad)</option>
                  </select>
                </div>
              )}

              {usaPresentacionFinal ? (
                <>
                  <div>
                    <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">¿En qué vendes las presentaciones?</label>
                    <select value={unidadVentaTipo} onChange={e => setUnidadVentaTipo(e.target.value)} className={sel}>
                      {["bolsa","paquete","botella","caja","frasco"].map(u => <option key={u} value={u}>En {u}s</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">¿Cuánto pesa cada {unidadVentaTipo}?</label>
                      <div className="relative">
                        <input type="number" min="0" step="any" value={pesoPorPresentacion} onChange={e => setPesoPorPresentacion(e.target.value === "" ? "" : parseFloat(e.target.value))}
                          placeholder="0" className={inp + " pr-14"} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-xs">{unidadBase}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Precio de venta por {unidadVentaTipo}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
                        <input type="number" min="0" step="1" value={precioVenta} onChange={e => setPrecioVenta(e.target.value === "" ? "" : parseFloat(e.target.value))}
                          placeholder="0" className={inp + " pl-6"} />
                      </div>
                    </div>
                  </div>
                  {pesoPresNum > 0 && precioVentaNum > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-[var(--c-card2)] rounded-xl p-3 text-center border border-[var(--c-border)]">
                        <p className="text-sm font-black text-[var(--c-text)]">1 {unidadGrande} = {unidadesPorKgOL.toFixed(1)}</p>
                        <p className="text-[9px] text-[var(--c-text4)]">{unidadVentaTipo}s · equivalencia</p>
                      </div>
                      <div className="bg-[var(--c-card2)] rounded-xl p-3 text-center border border-[var(--c-border)]">
                        <p className="text-sm font-black text-orange-400">{formatCLP(costoPresentacion)}</p>
                        <p className="text-[9px] text-[var(--c-text4)]">costo por {unidadVentaTipo}</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center border ${gananciaPresentacion >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                        <p className={`text-sm font-black ${gananciaPresentacion >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCLP(gananciaPresentacion)}</p>
                        <p className="text-[9px] text-[var(--c-text4)]">ganancia</p>
                      </div>
                      <div className={`rounded-xl p-3 text-center border ${margenPresentacion >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                        <p className={`text-sm font-black ${margenPresentacion >= 0 ? "text-emerald-400" : "text-red-400"}`}>{margenPresentacion.toFixed(0)}%</p>
                        <p className="text-[9px] text-[var(--c-text4)]">margen</p>
                      </div>
                    </div>
                  )}
                  {controlaInventario && pesoPresNum > 0 && (
                    <p className="text-[11px] text-[var(--c-text4)]">📦 Cantidad máxima disponible: <strong className="text-[var(--c-text2)]">{cantidadMaximaPresentaciones} {unidadVentaTipo}s</strong></p>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Precio de venta {esPesoOVolumen ? `(por ${unidadMedidaFinal})` : ""} *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
                      <input type="number" min="0" step="1" value={precioVenta} onChange={e => setPrecioVenta(e.target.value === "" ? "" : parseFloat(e.target.value))}
                        placeholder="0" className={inp + " pl-6"} />
                    </div>
                  </div>
                  {controlaInventario && precioVentaNum > 0 && costoUnitarioNum > 0 && (
                    <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="text-xs text-[var(--c-text2)]">Margen estimado</span>
                      <span className={`text-sm font-bold ${margenFinal >= 0 ? "text-emerald-400" : "text-red-400"}`}>{margenFinal.toFixed(1)}%</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Paso 6 — Stock mínimo */}
          {paso === 6 && (
            <div className="space-y-3.5">
              <h3 className="text-base font-bold text-[var(--c-text)] mb-1">Stock mínimo</h3>
              <p className="text-xs text-[var(--c-text3)] mb-3">¿Cuál es la cantidad mínima antes de recibir una alerta?</p>
              <div>
                <label className="text-[11px] text-[var(--c-text2)] font-medium mb-1 block">Stock mínimo *</label>
                <div className="relative">
                  <input type="number" min="0" step="any" value={stockMinimo} onChange={e => setStockMinimo(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    placeholder="5" className={inp + " pr-16"} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-xs">{esPesoOVolumen ? subUnidadCompra : unidadMedidaFinal}</span>
                </div>
              </div>
              <AyudaBox>Te avisaremos cuando el stock esté bajo, para que puedas reponer a tiempo y nunca te quedes sin vender.</AyudaBox>
            </div>
          )}

          {/* Paso 7 — Resumen */}
          {paso === 7 && (
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[var(--c-text)] mb-1">Resumen del producto</h3>
              <p className="text-xs text-[var(--c-text3)] mb-3">Revisa la información antes de guardar.</p>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-[var(--c-card2)] rounded-xl p-3.5 border border-[var(--c-border)]">
                  <p className="text-[10px] font-bold text-[var(--c-text3)] uppercase mb-2">Información general</p>
                  {[["Producto", nombre], ["Categoría", categoria || "—"], ["SKU", sku || "—"], ["Controla inventario", controlaInventario ? "Sí" : "No"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs py-0.5"><span className="text-[var(--c-text3)]">{k}</span><span className="text-[var(--c-text)] font-medium">{v}</span></div>
                  ))}
                </div>

                {controlaInventario && (
                  <div className="bg-[var(--c-card2)] rounded-xl p-3.5 border border-[var(--c-border)]">
                    <p className="text-[10px] font-bold text-[var(--c-text3)] uppercase mb-2">Compra e inventario</p>
                    {[
                      ["Tipo", cfg?.label ?? "—"],
                      ["Cantidad comprada", `${cantidadCompradaNum} ${esPesoOVolumen ? subUnidadCompra : unidadMedidaFinal}`],
                      ["Valor inventario", formatCLP(valorInventario)],
                      ["Stock mínimo", `${stockMinimo || 0} ${esPesoOVolumen ? subUnidadCompra : unidadMedidaFinal}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs py-0.5"><span className="text-[var(--c-text3)]">{k}</span><span className="text-[var(--c-text)] font-medium">{v}</span></div>
                    ))}
                  </div>
                )}

                <div className="bg-[var(--c-card2)] rounded-xl p-3.5 border border-[var(--c-border)] sm:col-span-2">
                  <p className="text-[10px] font-bold text-[var(--c-text3)] uppercase mb-2">Venta</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(controlaInventario ? [
                      ["Precio", formatCLP(precioFinal)],
                      ["Costo", formatCLP(costoFinal)],
                      ["Margen", `${margenFinal.toFixed(0)}%`],
                      usaPresentacionFinal ? ["Disponibles", `${cantidadMaximaPresentaciones} ${unidadVentaTipo}s`] : ["Forma de venta", cfg?.label ?? "—"],
                    ] : [
                      ["Precio", formatCLP(precioFinal)],
                      ["Tipo", "Sin inventario"],
                    ]).map(([k, v]) => (
                      <div key={k} className="text-center">
                        <p className="text-sm font-black text-[var(--c-text)]">{v}</p>
                        <p className="text-[9px] text-[var(--c-text4)]">{k}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
                <span className="text-base">🌱</span>
                <p className="text-xs text-emerald-400 font-semibold">¡Todo se ve bien! Puedes guardar tu producto.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {paso > 0 && (
          <div className="flex gap-3 px-5 py-4 border-t border-[var(--c-border)] flex-shrink-0">
            <button onClick={volver} className="px-4 h-10 border border-[var(--c-border)] text-[var(--c-text2)] text-sm rounded-xl hover:bg-[var(--c-card2)] transition-all">Volver</button>
            {paso < 7 ? (
              <button onClick={siguiente} className="flex-1 h-10 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl transition-all">Siguiente</button>
            ) : (
              <button onClick={guardar} disabled={isPending} className="flex-1 h-10 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all">
                {isPending ? "Guardando..." : "Guardar producto"}
              </button>
            )}
          </div>
        )}
      </div>

      {mostrarEscaner && (
        <EscanerCodigoBarras
          titulo="Escanear código de barras"
          onDetectado={codigo => { setCodigoBarras(codigo); setMostrarEscaner(false); toast.success("Código capturado") }}
          onCerrar={() => setMostrarEscaner(false)}
        />
      )}
    </div>
  )
}
