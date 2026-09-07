"use client"
import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { registrarVenta } from "@/app/actions/acciones"
import { iniciarCobroMaquina, consultarCobroMaquina } from "@/app/actions/pagos-acciones"
import { VentaRapidaClient } from "@/components/ventas/venta-rapida-client"
import { formatCLP } from "@/lib/utils"
import { unidadesEntradaVenta, convertirValor, formatearStock, labelUnidad } from "@/lib/unidades"
import { EscanerCodigoBarras } from "@/components/shared/escaner-codigo-barras"

const inp = "w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-4 h-11 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"

type ItemVenta = {
  _key: string
  productoId: string | null
  nombre: string
  sku: string | null
  precio: number
  cantidad: number
  costo: number | null
  stockDisponible: number | null
  formaVenta: string
  unidadMedida: string
  unidadPersonalizada: string | null
  unidadInput: string
  cantidadInterna: number | null
  unidadVentaCantidad: number | null
  unidadVentaTipo: string | null
  precioBase: number
  ventaPorPesoRapida?: boolean // viene del panel de gramos+precio — precio ya es el total, no editable como cantidad×precio-unitario
}

interface ClienteOption { id: string; nombre: string; apellido: string | null; telefono: string | null; empresa: string | null; esVip: boolean }

const METODOS_PAGO = [
  { value: "efectivo",     label: "Efectivo",     icon: "💵" },
  { value: "debito",       label: "Débito",       icon: "💳" },
  { value: "credito",      label: "Crédito",      icon: "🏦" },
  { value: "transferencia",label: "Transferencia",icon: "🏛️" },
  { value: "pendiente",    label: "Pendiente",    icon: "📄" },
]

export function VentaClient({ productos, clientes, conexionPagoActiva }: { productos: any[]; clientes: ClienteOption[]; conexionPagoActiva: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [ahora, setAhora] = useState<Date | null>(null)
  useEffect(() => { setAhora(new Date()) }, [])
  const [modoRapido, setModoRapido] = useState(false)

  // Cliente
  const [clienteId, setClienteId] = useState("")
  const [clienteSearch, setClienteSearch] = useState("")
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const clientesFiltrados = clientes.filter(c =>
    clienteSearch.length === 0 || `${c.nombre} ${c.apellido ?? ""} ${c.telefono ?? ""} ${c.empresa ?? ""}`.toLowerCase().includes(clienteSearch.toLowerCase())
  )
  const clienteSeleccionado = clientes.find(c => c.id === clienteId) ?? null

  // Productos (carrito)
  const [items, setItems] = useState<ItemVenta[]>([])
  const [productoSearch, setProductoSearch] = useState("")
  const [showProductoDropdown, setShowProductoDropdown] = useState(false)
  const productosFiltrados = productos.filter((p: any) =>
    productoSearch.length === 0 || `${p.nombre} ${p.sku ?? ""} ${p.categoria ?? ""}`.toLowerCase().includes(productoSearch.toLowerCase())
  )
  const productoSearchRef = useRef<HTMLInputElement>(null)

  // Venta rápida por peso — al elegir un producto "por peso" (pan, queso,
  // jamón, etc.) se abre este panel en vez de agregarlo directo con cantidad
  // por defecto: gramos/Kg → precio (auto-calculado, editable para calzar
  // con lo que marque la pesa digital) → se agrega al carrito. Todo con
  // Enter, sin tocar el mouse.
  const [productoPesoActivo, setProductoPesoActivo] = useState<any | null>(null)
  const [pesoCantidadStr, setPesoCantidadStr] = useState("")
  const [pesoPrecioStr, setPesoPrecioStr] = useState("")
  const [pesoPrecioEditadoManual, setPesoPrecioEditadoManual] = useState(false)
  const pesoCantidadRef = useRef<HTMLInputElement>(null)
  const pesoPrecioRef = useRef<HTMLInputElement>(null)

  // Modo monto libre (cuando no hay productos agregados al carrito)
  const [montoLibre, setMontoLibre] = useState("")

  // Método de pago + fecha
  const [metodo, setMetodo] = useState("efectivo")
  const [fechaVenta, setFechaVenta] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` })
  const [fechaVence, setFechaVence] = useState("")
  const [notas, setNotas] = useState("")

  const subtotal = items.reduce((a, i) => a + i.precio * i.cantidad, 0)
  const total = items.length > 0 ? subtotal : (parseFloat(montoLibre) || 0)
  const utilidadEstimada = items.reduce((a, i) => i.costo != null ? a + (i.precio - i.costo) * i.cantidad : a, 0)
  const hayUtilidadEstimable = items.some(i => i.costo != null)

  function agregarProducto(productoId: string): boolean {
    const prod = productos.find((p: any) => p.id === productoId)
    if (!prod) return false
    const formaVenta = prod.formaVenta ?? "unidad"

    // Los productos "por peso" no se agregan directo — se pesan en el
    // momento (pan, queso, jamón), así que primero se abre el panel rápido
    // de gramos/Kg + precio, en vez de meterlos al carrito con cantidad 1.
    if (formaVenta === "peso") {
      abrirVentaPorPeso(prod)
      return false
    }

    const unidadMedida = prod.unidadMedida ?? "unidad"
    const unidadVentaCantidad = prod.unidadVentaCantidad ?? null
    const precioBase = prod.precio ? Number(prod.precio) : 0
    const nuevo: ItemVenta = {
      _key: Math.random().toString(36).slice(2),
      productoId: prod.id, nombre: prod.nombre, sku: prod.sku ?? null,
      precio: precioBase, precioBase,
      costo: prod.costo ? Number(prod.costo) : null,
      stockDisponible: prod.stock ?? null,
      formaVenta, unidadMedida, unidadPersonalizada: prod.unidadPersonalizada ?? null,
      unidadVentaCantidad, unidadVentaTipo: prod.unidadVentaTipo ?? null,
      unidadInput: formaVenta === "unidad" ? "unidad" : unidadesEntradaVenta(formaVenta)[0].value,
      cantidad: 1, cantidadInterna: unidadVentaCantidad ? unidadVentaCantidad : formaVenta === "unidad" ? null : 0,
    }
    setItems(prev => [...prev, nuevo])
    setProductoSearch("")
    setShowProductoDropdown(false)
    return true
  }

  function abrirVentaPorPeso(prod: any) {
    setProductoPesoActivo(prod)
    setPesoCantidadStr("")
    setPesoPrecioStr("")
    setPesoPrecioEditadoManual(false)
    setProductoSearch("")
    setShowProductoDropdown(false)
    setTimeout(() => pesoCantidadRef.current?.focus(), 50)
  }

  function cancelarVentaPorPeso() {
    setProductoPesoActivo(null)
    setPesoCantidadStr("")
    setPesoPrecioStr("")
  }

  // Al escribir la cantidad, se autocalcula el precio (cantidad en la unidad
  // del producto × precio del producto) — pero solo mientras el dueño no
  // haya tocado el precio a mano, para no pisarle un ajuste que hizo para
  // que calzara con el monto exacto de la pesa digital.
  function handlePesoCantidadChange(valor: string) {
    setPesoCantidadStr(valor)
    if (pesoPrecioEditadoManual || !productoPesoActivo) return
    const gramos = parseFloat(valor) || 0
    const cantidadEnUnidadProducto = convertirValor(gramos, "g", productoPesoActivo.unidadMedida)
    const precioCalculado = Math.round(cantidadEnUnidadProducto * Number(productoPesoActivo.precio ?? 0))
    setPesoPrecioStr(precioCalculado > 0 ? String(precioCalculado) : "")
  }

  function confirmarVentaPorPeso() {
    if (!productoPesoActivo) return
    const gramos = parseFloat(pesoCantidadStr) || 0
    const precioFinal = parseFloat(pesoPrecioStr) || 0
    if (gramos <= 0) { toast.error("Ingresa el peso vendido"); pesoCantidadRef.current?.focus(); return }
    if (precioFinal <= 0) { toast.error("Ingresa el precio a cobrar"); pesoPrecioRef.current?.focus(); return }

    const prod = productoPesoActivo
    const unidadMedida = prod.unidadMedida ?? "kg"
    const nuevo: ItemVenta = {
      _key: Math.random().toString(36).slice(2),
      productoId: prod.id, nombre: prod.nombre, sku: prod.sku ?? null,
      precio: precioFinal, precioBase: precioFinal,
      costo: prod.costo ? Number(prod.costo) : null,
      stockDisponible: prod.stock ?? null,
      formaVenta: "peso", unidadMedida, unidadPersonalizada: prod.unidadPersonalizada ?? null,
      unidadVentaCantidad: null, unidadVentaTipo: null,
      unidadInput: "g",
      cantidad: 1, // el precio ya es el total a cobrar por esta venta puntual, no "precio por gramo × 1"
      cantidadInterna: gramos,
      ventaPorPesoRapida: true,
    }
    setItems(prev => [...prev, nuevo])
    toast.success(`${prod.nombre} agregado — ${gramos}g por ${formatCLP(precioFinal)}`)
    cancelarVentaPorPeso()
  }

  // Escaneo por cámara — busca el código en el catálogo ya cargado (sin
  // consulta nueva al servidor) y agrega el producto exactamente igual que
  // si se hubiera elegido a mano de la lista.
  const [mostrarEscaner, setMostrarEscaner] = useState(false)

  function handleCodigoDetectado(codigo: string) {
    setMostrarEscaner(false)
    const prod = productos.find((p: any) => p.codigoBarras === codigo || p.sku === codigo)
    setProductoSearch("")
    if (!prod) {
      toast.error(`Ningún producto tiene el código ${codigo}`, {
        description: "Puedes crearlo desde Productos y asociarle este código.",
      })
      return
    }
    const agregadoDirecto = agregarProducto(prod.id)
    if (agregadoDirecto) toast.success(`${prod.nombre} agregado`)
  }

  function quitarItem(key: string) {
    setItems(prev => prev.filter(it => it._key !== key))
  }

  function setCantidadConUnidad(key: string, valorIngresado: number, unidadInput?: string) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const unidad = unidadInput ?? it.unidadInput
      if (it.formaVenta === "unidad") return { ...it, cantidad: valorIngresado, unidadInput: unidad }
      const cantidadEnUnidadProducto = convertirValor(valorIngresado, unidad, it.unidadMedida)
      const cantidadInterna = it.formaVenta === "peso" ? convertirValor(valorIngresado, unidad, "g") : convertirValor(valorIngresado, unidad, "ml")
      return { ...it, unidadInput: unidad, cantidad: cantidadEnUnidadProducto, cantidadInterna }
    }))
  }

  function ajustarCantidadEntera(key: string, delta: number) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const nuevaCantidad = Math.max(1, it.cantidad + delta)
      return { ...it, cantidad: nuevaCantidad, cantidadInterna: it.unidadVentaCantidad ? nuevaCantidad * it.unidadVentaCantidad : it.cantidadInterna }
    }))
  }

  function resetFormulario() {
    setItems([])
    setClienteId("")
    setClienteSearch("")
    setMontoLibre("")
    setMetodo("efectivo")
    setFechaVence("")
    setNotas("")
  }

  // Cobro con máquina conectada — crea la orden, y consulta el resultado
  // cada 2 segundos hasta que deje de estar pendiente (o pasen 90s).
  const [cobroMaquina, setCobroMaquina] = useState<{ estado: "esperando" | "aprobado" | "rechazado" | "error"; mensaje?: string } | null>(null)

  function handleCobrarConMaquina(tipo: "debito" | "credito") {
    if (total <= 0) { toast.error("Ingresa un monto o agrega al menos un producto"); return }
    const stockInsuf = items.find(i => i.stockDisponible !== null && (i.cantidadInterna ?? i.cantidad) > i.stockDisponible)
    if (stockInsuf) { toast.error(`Stock insuficiente para "${stockInsuf.nombre}"`); return }

    const etiqueta = tipo === "debito" ? "Débito (Mercado Pago)" : "Crédito (Mercado Pago)"
    setCobroMaquina({ estado: "esperando" })
    startTransition(async () => {
      try {
        const referencia = `nelyx-${Date.now()}`
        const { orderId } = await iniciarCobroMaquina(total, referencia)

        let intentos = 0
        const maxIntentos = 45 // ~90 segundos, consultando cada 2s
        const intervalo = setInterval(async () => {
          intentos++
          try {
            const { estado } = await consultarCobroMaquina(orderId)
            if (estado === "aprobado") {
              clearInterval(intervalo)
              setCobroMaquina({ estado: "aprobado" })
              await confirmarVentaTrasPago(etiqueta)
            } else if (estado === "rechazado") {
              clearInterval(intervalo)
              setCobroMaquina({ estado: "rechazado", mensaje: "El pago fue rechazado en la máquina." })
            } else if (intentos >= maxIntentos) {
              clearInterval(intervalo)
              setCobroMaquina({ estado: "error", mensaje: "Se acabó el tiempo de espera — si el cliente sí pagó, verifica en tu app de Mercado Pago antes de reintentar." })
            }
          } catch {
            clearInterval(intervalo)
            setCobroMaquina({ estado: "error", mensaje: "No se pudo consultar el estado del pago." })
          }
        }, 2000)
      } catch (err: any) {
        setCobroMaquina({ estado: "error", mensaje: err?.message ?? "No se pudo iniciar el cobro" })
      }
    })
  }

  async function confirmarVentaTrasPago(metodoPagoLabel: string) {
    const itemsParaEnviar = items.length > 0
      ? items.map(i => ({ productoId: i.productoId, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad, cantidadInterna: i.cantidadInterna }))
      : [{ productoId: null, nombre: notas || "Venta", precio: total, cantidad: 1 }]
    try {
      await registrarVenta(itemsParaEnviar, fechaVenta, notas || undefined, clienteId || null, undefined, "contado", undefined, metodoPagoLabel)
      toast.success("✅ Pago aprobado — venta registrada")
      resetFormulario()
      setCobroMaquina(null)
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? "El pago se aprobó, pero hubo un error al registrar la venta — anótala a mano")
    }
  }

  function handleRegistrar() {
    if (total <= 0) { toast.error("Ingresa un monto o agrega al menos un producto"); return }
    if (metodo === "pendiente" && !clienteId) { toast.error("Selecciona un cliente para una venta pendiente"); return }

    const stockInsuf = items.find(i => i.stockDisponible !== null && (i.cantidadInterna ?? i.cantidad) > i.stockDisponible)
    if (stockInsuf) { toast.error(`Stock insuficiente para "${stockInsuf.nombre}"`); return }

    // Si no hay productos en el carrito, se registra como un único ítem libre —
    // misma función de servidor (registrarVenta), sin lógica paralela.
    const itemsParaEnviar = items.length > 0
      ? items.map(i => ({ productoId: i.productoId, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad, cantidadInterna: i.cantidadInterna }))
      : [{ productoId: null, nombre: notas || "Venta", precio: total, cantidad: 1 }]

    const tipoPago = metodo === "pendiente" ? "credito" : "contado"
    const metodoPago = metodo === "pendiente" ? undefined : METODOS_PAGO.find(m => m.value === metodo)?.label

    startTransition(async () => {
      try {
        await registrarVenta(itemsParaEnviar, fechaVenta, notas || undefined, clienteId || null, undefined, tipoPago, fechaVence || undefined, metodoPago)
        toast.success("✅ Venta registrada — listo para la siguiente")
        // Se mantiene en Venta (no navega a Movimientos) para poder cargar
        // otra venta de inmediato. router.refresh() trae el stock actualizado
        // de los productos sin perder el formulario ya limpio.
        resetFormulario()
        router.refresh()
      } catch (err: any) {
        toast.error(err?.message ?? "Error al registrar la venta")
      }
    })
  }

  const horaLabel = ahora ? ahora.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : ""

  // Venta Rápida — solo celular, pantalla mínima sin producto/cliente/pago,
  // pensada para feriantes. En PC/tablet nunca se activa (el botón que la
  // enciende está oculto ahí, así que este estado nunca se dispara).
  if (modoRapido) {
    return (
      <div className="max-w-lg mx-auto">
        <VentaRapidaClient onVolver={() => setModoRapido(false)} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-up pb-10">
      {/* Encabezado — a lo ancho completo, arriba de las 2 columnas */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-xl flex-shrink-0">🛒</div>
          <div>
            <h1 className="text-xl font-bold text-[var(--c-text)] tracking-tight">Venta</h1>
            <p className="text-xs text-[var(--c-text3)]">Registra tus ventas de forma rápida y simple</p>
          </div>
        </div>
        {/* Solo celular — en PC/tablet no tiene sentido, ya que el layout
            de 2 columnas ya deja todo a la vista sin scroll. */}
        <button onClick={() => setModoRapido(true)}
          className="lg:hidden flex-shrink-0 h-9 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
          ⚡ Venta rápida
        </button>
      </div>

      {/* En celular queda todo en una sola columna, igual que siempre.
          Desde pantallas grandes (lg), se divide en 2: lo que se arma a la
          izquierda (más ancho), y el resumen fijo a la derecha — así el
          total, el pago y el botón de registrar nunca se pierden de vista,
          sin importar cuántos productos tenga el carrito. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">

      {/* Fecha / Hora */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-4 py-2.5">
          <label className="text-[10px] text-[var(--c-text4)] flex items-center gap-1">📅 Fecha</label>
          <input type="date" value={fechaVenta} onChange={e => setFechaVenta(e.target.value)}
            className="w-full bg-transparent text-sm text-[var(--c-text)] outline-none mt-0.5 capitalize" />
        </div>
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl px-4 py-2.5">
          <p className="text-[10px] text-[var(--c-text4)] flex items-center gap-1">🕐 Hora</p>
          <p className="text-sm text-[var(--c-text)] mt-0.5">{horaLabel || "—"}</p>
        </div>
      </div>



      {/* Productos */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-1.5">🛍️ Productos</p>
        </div>
        {productos.length === 0 ? (
          <div className="bg-[var(--c-card2)] border border-dashed border-[var(--c-border)] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--c-text3)]">Aún no tienes productos registrados.</p>
            <Link href="/dashboard/productos" className="text-xs text-sky-400 hover:text-sky-300 font-semibold whitespace-nowrap">Crear producto →</Link>
          </div>
        ) : (
          <div className="relative mb-3">
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text4)] text-sm">🔍</span>
                <input ref={productoSearchRef} value={productoSearch} onChange={e => { setProductoSearch(e.target.value); setShowProductoDropdown(true) }} onFocus={() => setShowProductoDropdown(true)}
                  onKeyDown={e => {
                    // Un lector USB/Bluetooth escribe el código y manda Enter
                    // solo, sin que nadie toque el teclado — al detectarlo,
                    // se agrega el producto de inmediato, sin clic extra.
                    if (e.key === "Enter" && productoSearch.trim()) {
                      e.preventDefault()
                      handleCodigoDetectado(productoSearch.trim())
                    }
                  }}
                  placeholder="Buscar producto por nombre, SKU o código..." className={`${inp} pl-9`} />
              </div>
              <button type="button" onClick={() => setMostrarEscaner(true)}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/25 text-sky-400 flex items-center justify-center text-lg hover:bg-sky-500/20 transition-all"
                title="Escanear código de barras">
                📷
              </button>
            </div>
            {productoPesoActivo && (
              <div className="absolute z-20 mt-1.5 w-full bg-[var(--c-card2)] border border-sky-500/30 rounded-xl shadow-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-1.5">⚖️ {productoPesoActivo.nombre}</p>
                  <button onClick={cancelarVentaPorPeso} className="text-[var(--c-text4)] hover:text-[var(--c-text)] text-xs">✕ Cancelar</button>
                </div>
                <div>
                  <label className="text-[11px] text-[var(--c-text3)] mb-1 block">¿Cuántos gramos se vendieron? *</label>
                  <div className="relative">
                    <input ref={pesoCantidadRef} type="number" min="0" step="any" inputMode="decimal" value={pesoCantidadStr}
                      onChange={e => handlePesoCantidadChange(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); pesoPrecioRef.current?.focus(); pesoPrecioRef.current?.select() } }}
                      placeholder="Ej: 300" className={`${inp} pr-10`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-xs">g</span>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-[var(--c-text3)] mb-1 block">Precio a cobrar * <span className="text-[var(--c-text4)]">(el que marca la pesa)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-sm">$</span>
                    <input ref={pesoPrecioRef} type="number" min="0" step="1" inputMode="numeric" value={pesoPrecioStr}
                      onChange={e => { setPesoPrecioStr(e.target.value); setPesoPrecioEditadoManual(true) }}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmarVentaPorPeso() } }}
                      placeholder="0" className={`${inp} pl-6`} />
                  </div>
                  <p className="text-[10px] text-[var(--c-text4)] mt-1">Se calcula solo a partir de los gramos, pero puedes ajustarlo para que calce exacto con lo que muestra la pesa.</p>
                </div>
                <button onClick={confirmarVentaPorPeso}
                  className="w-full h-10 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all">
                  Agregar a la venta
                </button>
              </div>
            )}
            {!productoPesoActivo && showProductoDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProductoDropdown(false)} />
                <div className="absolute z-20 mt-1.5 w-full bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                  {productosFiltrados.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-[var(--c-text4)]">Sin resultados</p>
                  ) : productosFiltrados.slice(0, 10).map((p: any) => (
                    <button key={p.id} onClick={() => agregarProducto(p.id)}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--c-hover)] transition-colors flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--c-text)] truncate">{p.nombre}</p>
                        <p className="text-[10px] text-[var(--c-text4)] truncate">{p.sku ? `${p.sku} · ` : ""}{p.stock !== null ? `Stock: ${formatearStock(p.stock, p.formaVenta, p.unidadMedida, p.unidadPersonalizada)}` : "Sin control de stock"}</p>
                      </div>
                      <span className="text-xs font-semibold text-[var(--c-text)] flex-shrink-0">{formatCLP(Number(p.precio ?? 0))}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div>
            <label className="text-[11px] text-[var(--c-text3)] mb-1 block">Monto de la venta (sin productos asociados)</label>
            {/* Display — funciona igual que antes: se puede tipear directo (útil en PC) */}
            <div className="relative mb-3">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--c-text3)] text-xl font-bold">$</span>
              <input type="text" inputMode="numeric" placeholder="0" value={montoLibre ? Number(montoLibre).toLocaleString("es-CL") : ""}
                onChange={e => setMontoLibre(e.target.value.replace(/[^0-9]/g, ""))}
                className={`${inp} pl-8 h-16 text-3xl font-bold text-right`} />
            </div>
            {/* Calculadora — pensada para feriantes y mostradores: ingresar el monto
                a puro toque, sin necesidad de abrir el teclado del celular. */}
            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3"].map(d => (
                <button key={d} type="button" onClick={() => setMontoLibre(prev => (prev === "0" ? "" : prev) + d)}
                  className="h-14 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text)] text-xl font-bold hover:border-sky-500/40 active:scale-95 transition-all">
                  {d}
                </button>
              ))}
              <button type="button" onClick={() => setMontoLibre("")}
                className="h-14 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/20 active:scale-95 transition-all">
                C
              </button>
              <button type="button" onClick={() => setMontoLibre(prev => (prev === "0" ? "" : prev) + "0")}
                className="h-14 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text)] text-xl font-bold hover:border-sky-500/40 active:scale-95 transition-all">
                0
              </button>
              <button type="button" onClick={() => setMontoLibre(prev => prev.slice(0, -1))}
                className="h-14 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text)] text-lg font-bold hover:border-sky-500/40 active:scale-95 transition-all">
                ⌫
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {items.map(it => {
              const stockExcedido = it.stockDisponible !== null && (it.cantidadInterna ?? it.cantidad) > it.stockDisponible
              return (
                <div key={it._key} className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--c-text)] font-medium truncate">{it.nombre}</p>
                      <p className="text-[10px] text-[var(--c-text4)] truncate">{it.sku ? `${it.sku} · ` : ""}{labelUnidad(it.unidadMedida, it.unidadPersonalizada)}{it.stockDisponible !== null && ` · Stock: ${formatearStock(it.stockDisponible, it.formaVenta, it.unidadMedida, it.unidadPersonalizada)}`}</p>
                    </div>
                    <button onClick={() => quitarItem(it._key)} className="text-red-400/70 hover:text-red-400 flex-shrink-0 text-sm">🗑</button>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--c-text4)]">{it.ventaPorPesoRapida ? "Precio" : "Precio unit."}</span>
                      <span className="text-xs font-semibold text-[var(--c-text)]">{formatCLP(it.precio)}</span>
                    </div>

                    {it.ventaPorPesoRapida ? (
                      <span className="text-xs font-semibold text-[var(--c-text2)] bg-[var(--c-card)] border border-[var(--c-border)] rounded-lg px-2.5 py-1.5">⚖️ {it.cantidadInterna}g</span>
                    ) : (it.formaVenta === "unidad" || it.unidadVentaCantidad) ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => ajustarCantidadEntera(it._key, -1)} className="w-8 h-8 rounded-lg bg-[var(--c-card)] border border-[var(--c-border)] text-[var(--c-text)] flex items-center justify-center hover:border-sky-500/40">−</button>
                        <span className={`min-w-[1.75rem] text-center text-sm font-bold ${stockExcedido ? "text-red-400" : "text-[var(--c-text)]"}`}>{it.cantidad}</span>
                        <button onClick={() => ajustarCantidadEntera(it._key, 1)} className="w-8 h-8 rounded-lg bg-[var(--c-card)] border border-[var(--c-border)] text-[var(--c-text)] flex items-center justify-center hover:border-sky-500/40">+</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" step="any" value={it.cantidadInterna !== null ? convertirValor(it.cantidadInterna, it.formaVenta === "peso" ? "g" : "ml", it.unidadInput) || "" : ""}
                          onChange={e => setCantidadConUnidad(it._key, parseFloat(e.target.value) || 0)}
                          className="w-16 h-8 bg-[var(--c-card)] border border-[var(--c-border)] rounded-lg px-2 text-xs text-[var(--c-text)] text-center outline-none focus:border-sky-500" />
                        <select value={it.unidadInput} onChange={e => setCantidadConUnidad(it._key, it.cantidadInterna !== null ? convertirValor(it.cantidadInterna, it.formaVenta === "peso" ? "g" : "ml", it.unidadInput) : 0, e.target.value)}
                          className="h-8 bg-[var(--c-card)] border border-[var(--c-border)] rounded-lg px-1.5 text-[11px] text-[var(--c-text)] outline-none focus:border-sky-500">
                          {unidadesEntradaVenta(it.formaVenta).map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </div>
                    )}

                    <span className="text-sm font-bold text-sky-400">{formatCLP(it.precio * it.cantidad)}</span>
                  </div>
                  {stockExcedido && <p className="text-[10px] text-red-400 mt-1.5">⚠ Supera el stock disponible</p>}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--c-border2)]">
          <div>
            <p className="text-xs text-[var(--c-text3)]">Total{items.length > 0 ? ` de productos (${items.length})` : ""}</p>
            {hayUtilidadEstimable && <p className="text-[10px] text-emerald-400/80">Utilidad estimada: {formatCLP(utilidadEstimada)}</p>}
          </div>
          <span className="text-2xl font-black text-sky-400">{formatCLP(total)}</span>
        </div>
      </div>

        </div>
        {/* ══════════════════════════════════════════
            Columna derecha — "Resumen de la venta". Queda fija (sticky)
            mientras la izquierda scrollea, así cliente/pago/total/botón
            de registrar siempre están a la vista, sin importar cuántos
            productos tenga el carrito.
        ══════════════════════════════════════════ */}
        <div className="space-y-5 lg:sticky lg:top-4">

      {/* Cliente */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-1.5">👤 Cliente <span className="text-[var(--c-text4)] font-normal text-xs">(opcional)</span></p>
          <Link href="/dashboard/clientes" className="text-xs text-sky-400 hover:text-sky-300 font-medium">+ Nuevo</Link>
        </div>
        {clientes.length === 0 ? (
          <div className="bg-[var(--c-card2)] border border-dashed border-[var(--c-border)] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--c-text3)]">Aún no tienes clientes registrados.</p>
            <Link href="/dashboard/clientes" className="text-xs text-sky-400 hover:text-sky-300 font-semibold whitespace-nowrap">Crear cliente →</Link>
          </div>
        ) : clienteSeleccionado ? (
          <div className="flex items-center justify-between bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-sky-500/15 flex items-center justify-center text-sm flex-shrink-0">👤</div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--c-text)] font-medium truncate">{clienteSeleccionado.nombre} {clienteSeleccionado.apellido ?? ""}</p>
                {clienteSeleccionado.telefono && <p className="text-[11px] text-[var(--c-text4)]">{clienteSeleccionado.telefono}</p>}
              </div>
            </div>
            <button onClick={() => setClienteId("")} className="text-[var(--c-text4)] hover:text-red-400 text-sm px-2 flex-shrink-0">✕</button>
          </div>
        ) : (
          <div className="relative">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text4)] text-sm">🔍</span>
              <input value={clienteSearch} onChange={e => { setClienteSearch(e.target.value); setShowClienteDropdown(true) }} onFocus={() => setShowClienteDropdown(true)}
                placeholder="Buscar cliente por nombre, teléfono o empresa..." className={`${inp} pl-9`} />
            </div>
            {showClienteDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowClienteDropdown(false)} />
                <div className="absolute z-20 mt-1.5 w-full bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                  {clientesFiltrados.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-[var(--c-text4)]">Sin resultados</p>
                  ) : clientesFiltrados.slice(0, 8).map(c => (
                    <button key={c.id} onClick={() => { setClienteId(c.id); setShowClienteDropdown(false); setClienteSearch("") }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--c-hover)] transition-colors flex items-center gap-2">
                      <span className="text-sm">👤</span>
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--c-text)] truncate">{c.nombre} {c.apellido ?? ""} {c.esVip && "⭐"}</p>
                        <p className="text-[10px] text-[var(--c-text4)] truncate">{c.telefono ?? c.empresa ?? ""}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Método de pago */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-4">
        <p className="text-sm font-semibold text-[var(--c-text)] mb-3 flex items-center gap-1.5">💳 Método de pago</p>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {METODOS_PAGO.map(m => {
            // Cuando hay una máquina conectada, Débito y Crédito cobran de
            // verdad ahí en vez de solo marcar el método a mano — mismo
            // botón de siempre, solo que ahora "sabe" que hay una máquina.
            const esCobrable = conexionPagoActiva && (m.value === "debito" || m.value === "credito")
            return (
              <button key={m.value}
                onClick={() => esCobrable ? handleCobrarConMaquina(m.value as "debito" | "credito") : setMetodo(m.value)}
                disabled={esCobrable && (isPending || cobroMaquina?.estado === "esperando")}
                className={`relative flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all disabled:opacity-60 ${metodo === m.value && !esCobrable ? "border-sky-500 bg-sky-500/10 text-sky-400" : "border-[var(--c-border)] text-[var(--c-text3)] hover:border-sky-500/30"}`}>
                <span className="text-lg">{m.icon}</span>
                <span className="text-[11px] font-semibold">{m.label}</span>
                {esCobrable && <span className="absolute -top-1.5 -right-1.5 text-xs">🟡</span>}
              </button>
            )
          })}
        </div>
        {conexionPagoActiva && (
          <p className="text-[10px] text-[var(--c-text4)] mt-2 flex items-center gap-1">🟡 Débito y Crédito cobran directo con tu máquina conectada.</p>
        )}
        {metodo === "pendiente" && (
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5">
              <span className="text-[var(--c-warning)] text-xs flex-shrink-0">ⓘ</span>
              <p className="text-[11px] text-amber-300">Se generará una cuenta por cobrar para el cliente seleccionado.</p>
            </div>
            <div>
              <label className="text-[11px] text-[var(--c-text3)] mb-1 block">Fecha de vencimiento (opcional)</label>
              <input type="date" value={fechaVence} onChange={e => setFechaVence(e.target.value)} className={inp} />
            </div>
          </div>
        )}
      </div>

      {/* Notas */}
      <div>
        <label className="text-xs text-[var(--c-text3)] mb-1.5 flex items-center gap-1.5">✎ Notas <span className="text-[var(--c-text4)]">(opcional)</span></label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Ej: Venta por teléfono, entrega a domicilio, etc."
          className="w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 resize-none" />
      </div>

      {/* Acciones */}
      <div className="flex gap-3">
        <button onClick={() => router.push("/dashboard/movimientos")} className="flex-1 h-12 border border-[var(--c-border)] text-[var(--c-text2)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all">
          Cancelar
        </button>
        <button onClick={handleRegistrar} disabled={isPending}
          className="flex-[2] h-12 bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-400 hover:to-blue-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 flex flex-col items-center justify-center leading-tight">
          <span>{isPending ? "Registrando..." : "Registrar venta"}</span>
          <span className="text-[10px] font-normal opacity-80">Se registrará la venta y el movimiento</span>
        </button>
      </div>

      {/* Conexiones — una sola fila compacta, sin ocupar tanta altura */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-3">
        <p className="text-[10px] text-[var(--c-text4)] mb-2">Esta venta se conecta sola con:</p>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            ["📦", "Inventario"],
            ["⇄", "Movimientos"],
            ["👤", "Clientes"],
            ["📊", "Reportes"],
            ["📋", "Por cobrar"],
          ].map(([icon, label]) => (
            <div key={label} className="flex items-center gap-1 bg-[var(--c-card2)] rounded-lg px-2 py-1.5 flex-shrink-0">
              <span className="text-xs">{icon}</span>
              <span className="text-[9px] text-[var(--c-text3)] font-medium whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
      </div>

        </div>
      </div>

      {mostrarEscaner && (
        <EscanerCodigoBarras
          titulo="Escanear producto"
          onDetectado={handleCodigoDetectado}
          onCerrar={() => setMostrarEscaner(false)}
        />
      )}

      {cobroMaquina && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-6 max-w-xs w-full text-center">
            {cobroMaquina.estado === "esperando" && (
              <>
                <div className="text-4xl mb-3 animate-pulse">💳</div>
                <p className="text-sm font-semibold text-[var(--c-text)]">Esperando pago en la máquina...</p>
                <p className="text-xs text-[var(--c-text3)] mt-1">Pídele al cliente que ponga la tarjeta y su clave.</p>
              </>
            )}
            {cobroMaquina.estado === "aprobado" && (
              <>
                <div className="text-4xl mb-3">✅</div>
                <p className="text-sm font-semibold text-emerald-400">Pago aprobado</p>
              </>
            )}
            {(cobroMaquina.estado === "rechazado" || cobroMaquina.estado === "error") && (
              <>
                <div className="text-4xl mb-3">❌</div>
                <p className="text-sm font-semibold text-red-400">{cobroMaquina.estado === "rechazado" ? "Pago rechazado" : "Algo falló"}</p>
                <p className="text-xs text-[var(--c-text3)] mt-1">{cobroMaquina.mensaje}</p>
                <button onClick={() => setCobroMaquina(null)} className="mt-4 h-9 px-4 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] text-xs font-semibold rounded-lg w-full">
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
