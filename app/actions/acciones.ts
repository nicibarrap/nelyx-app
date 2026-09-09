"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { notificar, cancelarNotificacionesPorPrefijo } from "@/lib/notificaciones"
import { aInterno, formatearStock, deInterno, type FormaVenta } from "@/lib/unidades"
import { registrarMovimientoStock, type TipoMovimientoStock } from "@/lib/stock"
import { obtenerLoteFIFO } from "@/lib/lotes"
import { calcularUtilidadVenta } from "@/lib/financial-engine"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

/** Validaciones de integridad para los campos numéricos de un producto.
 *  Es una red de seguridad en el servidor: el formulario y el wizard ya
 *  impiden estos valores desde la interfaz, esto solo evita que datos
 *  corruptos o manipulados lleguen a la base de datos. */
function validarNumerosProducto(campos: { precio: number | null; costo: number | null; stock: number | null; stockMinimo: number | null; unidadVentaCantidad?: number | null; ventaMinima?: number | null }) {
  const { precio, costo, stock, stockMinimo, unidadVentaCantidad, ventaMinima } = campos
  if (precio !== null && (!Number.isFinite(precio) || precio < 0)) throw new Error("El precio no puede ser negativo")
  if (costo !== null && (!Number.isFinite(costo) || costo < 0)) throw new Error("El costo no puede ser negativo")
  if (stock !== null && (!Number.isFinite(stock) || stock < 0)) throw new Error("El stock no puede ser negativo")
  if (stockMinimo !== null && (!Number.isFinite(stockMinimo) || stockMinimo < 0)) throw new Error("El stock mínimo no puede ser negativo")
  if (unidadVentaCantidad != null && (!Number.isFinite(unidadVentaCantidad) || unidadVentaCantidad <= 0)) throw new Error("La cantidad por presentación debe ser mayor a 0")
  if (ventaMinima != null && (!Number.isFinite(ventaMinima) || ventaMinima <= 0)) throw new Error("La venta mínima debe ser mayor a 0")
}

// ── MOVIMIENTOS ──────────────────────────────────────────────
export async function ingresarMovimiento(formData: FormData) {
  const session = await getSession()
  const tipo = formData.get("tipo") as string
  const monto = parseFloat(formData.get("monto") as string)
  const fecha = new Date(formData.get("fecha") as string)
  const descripcion = (formData.get("descripcion") as string)?.trim() || null
  const productoId = (formData.get("productoId") as string) || null
  const categoria = (formData.get("categoria") as string)?.trim() || null
  const cantidad = parseInt(formData.get("cantidad") as string) || 1

  if (!tipo || isNaN(monto) || monto <= 0) throw new Error("Datos inválidos")

  // Snapshot financiero: el costo del producto AL MOMENTO de la venta, para
  // que el historial no cambie si el costo promedio del producto cambia después.
  let costoUnitarioSnap: number | null = null
  let utilidadSnap: number | null = null
  let margenSnap: number | null = null
  let nombreProductoVenta: string | null = null
  if (productoId && tipo === "VENTA") {
    const prodParaCosto = await db.producto.findFirst({ where: { id: productoId, userId: session.user.id }, select: { costo: true, nombre: true } })
    nombreProductoVenta = prodParaCosto?.nombre ?? null
    if (prodParaCosto?.costo != null) {
      costoUnitarioSnap = Number(prodParaCosto.costo)
      const { utilidad, margen } = calcularUtilidadVenta(monto, costoUnitarioSnap, cantidad)
      utilidadSnap = utilidad
      margenSnap = margen
    }
  }

  const tipoPagoCheck = formData.get("tipoPago") as string
  // Only create movimiento for cash sales - credit sales register income when payment is received
  let movimientoCreado: { id: string } | null = null
  if (tipo !== "VENTA" || tipoPagoCheck !== "credito") {
    movimientoCreado = await db.movimiento.create({
      data: {
        tipo: tipo as any,
        monto,
        fecha,
        descripcion,
        categoria,
        productoId: productoId || null,
        clienteId: (formData.get("clienteId") as string) || null,
        proveedorId: (formData.get("proveedorId") as string) || null,
        costoUnitario: costoUnitarioSnap,
        utilidad: utilidadSnap,
        margen: margenSnap,
        userId: session.user.id,
      }
    })
  }

  // Auto-descontar stock si es VENTA con producto que tiene inventario
  if (productoId && tipo === "VENTA") {
    await registrarMovimientoStock({
      productoId, userId: session.user.id, tipo: "venta",
      cantidad: -cantidad, movimientoId: movimientoCreado?.id ?? null,
    })
  }

  // Alerta inmediata si la venta se hizo con margen negativo
  if (margenSnap !== null && margenSnap < 0) {
    await notificar({
      userId: session.user.id, categoria: "alertasGenerales", prioridad: "alta",
      titulo: `Venta con margen negativo: ${nombreProductoVenta ?? "un producto"}`,
      mensaje: `Se vendió bajo costo — utilidad: ${Math.round(utilidadSnap ?? 0).toLocaleString("es-CL")}`,
      accionUrl: "/dashboard/movimientos",
      claveUnica: `margen-neg:${movimientoCreado?.id ?? productoId}:${Date.now()}`,
    })
  }

  // Auto-create CuentaPorCobrar si venta a crédito con cliente
  const tipoPagoIngr = formData.get("tipoPago") as string
  const clienteIdIngr = formData.get("clienteId") as string
  if (tipo === "VENTA" && tipoPagoIngr === "credito" && clienteIdIngr) {
    const fechaVenceIngr = formData.get("fechaVence") as string
    const maxNumCta = await db.cuentaPorCobrar.aggregate({ where: { userId: session.user.id }, _max: { numero: true } })
    await db.cuentaPorCobrar.create({
      data: {
        numero: (maxNumCta._max.numero ?? 0) + 1,
        clienteId: clienteIdIngr,
        montoOriginal: monto,
        saldoPendiente: monto,
        fechaVenta: new Date(fecha),
        fechaVence: fechaVenceIngr ? new Date(fechaVenceIngr) : null,
        estado: "pendiente",
        costoAsociado: costoUnitarioSnap != null ? costoUnitarioSnap * cantidad : null,
        userId: session.user.id,
      }
    })
    revalidatePath("/dashboard/cuentas-cobrar")
  }

  revalidatePath("/dashboard/movimientos")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/alertas")
  revalidatePath("/dashboard/reportes")
}

export async function eliminarMovimiento(id: string) {
  const session = await getSession()
  const mov = await db.movimiento.findFirst({ where: { id, userId: session.user.id } })
  if (!mov) throw new Error("No encontrado")

  // Revertir el stock si este movimiento tenía un descuento de inventario asociado
  const movsStock = await db.movimientoStock.findMany({ where: { movimientoId: id, userId: session.user.id } })
  for (const ms of movsStock) {
    await registrarMovimientoStock({
      productoId: ms.productoId, userId: session.user.id, tipo: "devolucion",
      cantidad: -ms.cantidad, // revierte exactamente el delta original
      observacion: "Reversión automática por eliminación del movimiento",
    })
  }

  await db.movimiento.delete({ where: { id } })
  revalidatePath("/dashboard/movimientos")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/alertas")
  revalidatePath("/dashboard/reportes")
}

export async function registrarVenta(items: Array<{
  productoId?: string | null
  nombre: string
  precio: number
  cantidad: number
  cantidadInterna?: number | null
}>, fecha: string, descripcion?: string, clienteId?: string | null, descuento?: number, tipoPago?: string, fechaVence?: string, metodoPago?: string) {
  const session = await getSession()
  if (!items || items.length === 0) throw new Error("Agrega al menos un producto")

  // Validar stock y venta mínima (usa la cantidad interna en gramos/ml cuando el producto es por peso/volumen)
  for (const item of items) {
    if (item.productoId) {
      const prod = await db.producto.findFirst({ where: { id: item.productoId, userId: session.user.id } })
      const cantidadDescuento = item.cantidadInterna ?? item.cantidad
      if (prod && prod.stock !== null && prod.stock < cantidadDescuento) {
        throw new Error(`Stock insuficiente para "${prod.nombre}". Disponible: ${formatearStock(prod.stock, prod.formaVenta, prod.unidadMedida, prod.unidadPersonalizada)}`)
      }
      if (prod && prod.ventaMinima != null && cantidadDescuento < prod.ventaMinima) {
        throw new Error(`La venta mínima de "${prod.nombre}" es ${formatearStock(prod.ventaMinima, prod.formaVenta, prod.unidadMedida, prod.unidadPersonalizada)}`)
      }
    }
  }

  // Calcular subtotal y aplicar descuento proporcionalmente
  const subtotal = items.reduce((a, i) => a + i.precio * i.cantidad, 0)
  const descuentoTotal = Math.min(descuento ?? 0, subtotal)
  const factorDescuento = subtotal > 0 ? (subtotal - descuentoTotal) / subtotal : 1
  const descuentoSuffix = descuentoTotal > 0 ? ` [Desc: $${Math.round(descuentoTotal).toLocaleString("es-CL")} de $${Math.round(subtotal).toLocaleString("es-CL")}]` : ""

  let costoTotalCarrito = 0

  // Crear un movimiento por cada producto y descontar stock
  for (const item of items) {
    const montoItem = Math.round(item.precio * item.cantidad * factorDescuento)

    // Snapshot financiero: costo del producto AL MOMENTO de la venta.
    // Se convierte la cantidad interna (siempre en gramos/ml/conteo) de
    // vuelta a la unidad en que está denominado producto.costo, para que
    // el cálculo sea correcto tanto en venta directa como por presentación.
    let costoUnitarioSnap: number | null = null
    let utilidadSnap: number | null = null
    let margenSnap: number | null = null
    if (item.productoId) {
      const prodCosto = await db.producto.findFirst({ where: { id: item.productoId, userId: session.user.id }, select: { costo: true, unidadMedida: true, nombre: true } })
      if (prodCosto?.costo != null) {
        costoUnitarioSnap = Number(prodCosto.costo)
        const cantidadDescuento = item.cantidadInterna ?? item.cantidad
        const cantidadEnUnidadCosto = deInterno(cantidadDescuento, prodCosto.unidadMedida)
        const { utilidad, margen } = calcularUtilidadVenta(montoItem, costoUnitarioSnap, cantidadEnUnidadCosto)
        utilidadSnap = utilidad
        margenSnap = margen
        costoTotalCarrito += costoUnitarioSnap * cantidadEnUnidadCosto
        if (margen !== null && margen < 0) {
          await notificar({
            userId: session.user.id, categoria: "alertasGenerales", prioridad: "alta",
            titulo: `Venta con margen negativo: ${prodCosto.nombre}`,
            mensaje: `Se vendió bajo costo — utilidad: ${Math.round(utilidad).toLocaleString("es-CL")}`,
            accionUrl: "/dashboard/movimientos",
            claveUnica: `margen-neg:${item.productoId}:${Date.now()}`,
          })
        }
      }
    }

    // Only create movimiento for cash sales - credit sales only create CuentaPorCobrar
    let movItem: { id: string } | null = null
    if (tipoPago !== "credito") {
      movItem = await db.movimiento.create({
        data: {
          tipo: "VENTA",
          monto: montoItem,
          fecha: new Date(fecha),
          descripcion: descripcion || item.nombre,
          productoId: item.productoId || null,
          clienteId: clienteId || null,
          costoUnitario: costoUnitarioSnap,
          utilidad: utilidadSnap,
          margen: margenSnap,
          metodoPago: metodoPago || null,
          userId: session.user.id,
        }
      })
    }
    if (item.productoId) {
      const cantidadDescuento = item.cantidadInterna ?? item.cantidad
      // FIFO automático: si el producto tiene lotes con vencimiento, la
      // salida se amarra sola al que vence primero — nadie elige nada en
      // Venta. Si no tiene ningún lote, sigue funcionando igual que siempre.
      const fechaLoteFIFO = await obtenerLoteFIFO(item.productoId, session.user.id)
      await registrarMovimientoStock({
        productoId: item.productoId, userId: session.user.id, tipo: "venta",
        cantidad: -cantidadDescuento, movimientoId: movItem?.id ?? null,
        fechaVencimiento: fechaLoteFIFO,
      })
    }
  }

  // Auto-create CuentaPorCobrar if venta a crédito con cliente
  if (tipoPago === "credito" && clienteId) {
    const totalBruto = items.reduce((a, i) => a + i.precio * i.cantidad, 0)
    const descuentoVal = Math.min(descuento ?? 0, totalBruto)
    const totalNeto = totalBruto - descuentoVal
    const maxNAgg = await db.cuentaPorCobrar.aggregate({ where: { userId: session.user.id }, _max: { numero: true } })
    await db.cuentaPorCobrar.create({
      data: {
        numero: (maxNAgg._max.numero ?? 0) + 1,
        clienteId,
        montoOriginal: totalNeto,
        saldoPendiente: totalNeto,
        fechaVenta: new Date(fecha),
        fechaVence: fechaVence ? new Date(fechaVence) : null,
        estado: "pendiente",
        costoAsociado: costoTotalCarrito > 0 ? costoTotalCarrito : null,
        userId: session.user.id,
      }
    })
    revalidatePath("/dashboard/cuentas-cobrar")
  }

  revalidatePath("/dashboard/movimientos")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/alertas")
  revalidatePath("/dashboard/reportes")
}

// ── CATEGORÍAS PERSONALIZADAS ──────────────────────────────
export async function crearCategoriaPersonalizada(tipo: string, nombre: string) {
  const session = await getSession()
  const nombreLimpio = nombre.trim()
  if (!nombreLimpio) throw new Error("Nombre requerido")
  try {
    await db.categoriaPersonalizada.create({
      data: { nombre: nombreLimpio, tipo, userId: session.user.id }
    })
  } catch {
    // Ignorar si ya existe
  }
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/movimientos")
  revalidatePath("/dashboard/movimientos/nuevo")
  revalidatePath("/dashboard/costos-fijos")
  return nombreLimpio
}

export async function obtenerCategorias(tipo: string) {
  const session = await getSession()
  const cats = await db.categoriaPersonalizada.findMany({
    where: { userId: session.user.id, tipo },
    orderBy: { nombre: "asc" },
  })
  return cats.map(c => c.nombre)
}

/** Todas las categorías personalizadas del usuario, agrupadas por tipo —
 * para mostrarlas juntas en Configuración con opción de eliminar. */
export async function obtenerTodasCategoriasPersonalizadas() {
  const session = await getSession()
  const cats = await db.categoriaPersonalizada.findMany({
    where: { userId: session.user.id },
    orderBy: { nombre: "asc" },
  })
  return cats.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }))
}

/** Elimina una categoría de la lista de sugerencias — no afecta a ningún
 * producto/movimiento que ya la tenga asignada (el campo es texto libre,
 * así que sigue mostrándose igual ahí), solo deja de aparecer como opción
 * rápida al crear algo nuevo. */
export async function eliminarCategoriaPersonalizada(id: string) {
  const session = await getSession()
  const cat = await db.categoriaPersonalizada.findFirst({ where: { id, userId: session.user.id } })
  if (!cat) throw new Error("Categoría no encontrada")
  await db.categoriaPersonalizada.delete({ where: { id } })
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/movimientos")
  revalidatePath("/dashboard/movimientos/nuevo")
  revalidatePath("/dashboard/costos-fijos")
  revalidatePath("/dashboard/configuracion")
}

// ── PRODUCTOS ──────────────────────────────────────────────
export async function crearProducto(formData: FormData) {
  const session = await getSession()
  const nombre = (formData.get("nombre") as string)?.trim()
  if (!nombre) throw new Error("Nombre requerido")

  const precio = formData.get("precio") ? parseFloat(formData.get("precio") as string) : null
  const costo = formData.get("costo") ? parseFloat(formData.get("costo") as string) : null

  const controlaInventarioVal = formData.get("controlaInventario")
  const controlaInventario = controlaInventarioVal === null ? true : controlaInventarioVal === "on" || controlaInventarioVal === "true"

  const formaVenta = ((formData.get("formaVenta") as string) || "unidad") as FormaVenta
  const unidadMedida = (formData.get("unidadMedida") as string) || "unidad"
  const unidadPersonalizada = unidadMedida === "personalizada" ? ((formData.get("unidadPersonalizada") as string)?.trim() || null) : null

  const unidadVentaCantidadVal = formData.get("unidadVentaCantidad")
  const unidadVentaCantidad = unidadVentaCantidadVal && unidadVentaCantidadVal !== "" ? parseFloat(unidadVentaCantidadVal as string) : null
  const unidadVentaTipo = (formData.get("unidadVentaTipo") as string)?.trim() || null

  const imagenBase64 = (formData.get("imagenBase64") as string) || null

  let stock: number | null = null
  let stockMinimo: number | null = null
  if (controlaInventario) {
    const stockVal = formData.get("stock")
    stock = stockVal !== null && stockVal !== "" ? aInterno(parseFloat(stockVal as string), unidadMedida) : null
    const stockMinimoVal = formData.get("stockMinimo")
    stockMinimo = stockMinimoVal !== null && stockMinimoVal !== "" ? aInterno(parseFloat(stockMinimoVal as string), unidadMedida) : null
  }

  if (unidadMedida === "personalizada" && unidadPersonalizada) {
    await db.categoriaPersonalizada.create({
      data: { nombre: unidadPersonalizada, tipo: "UNIDAD_MEDIDA", userId: session.user.id },
    }).catch(() => {})
  }

  validarNumerosProducto({ precio, costo, stock, stockMinimo, unidadVentaCantidad })

  let producto
  try {
    producto = await db.producto.create({
      data: {
        nombre,
        precio,
        costo,
        descripcion: (formData.get("descripcion") as string)?.trim() || null,
        categoria: (formData.get("categoria") as string)?.trim() || null,
        sku: (formData.get("sku") as string)?.trim() || null,
        codigoBarras: (formData.get("codigoBarras") as string)?.trim() || null,
        // El stock real se establece después, vía Kardex (tipo "inventario_inicial"),
        // para que quede trazado como un lote propio — con su fecha de
        // vencimiento si se informó — en vez de aparecer "de la nada".
        stock: controlaInventario && stock !== null ? 0 : stock,
        stockMinimo,
        unidadMedida,
        unidadPersonalizada,
        formaVenta,
        controlaInventario,
        imagenBase64,
        unidadVentaCantidad,
        unidadVentaTipo,
        userId: session.user.id,
      },
    })
  } catch (err: any) {
    if (err?.code === "P2002") {
      const campo = (err?.meta?.target as string[] | undefined)?.includes("codigoBarras") ? "código de barras" : "SKU"
      throw new Error(`Ya tienes otro producto con ese mismo ${campo}`)
    }
    throw err
  }

  if (controlaInventario && stock !== null && stock > 0) {
    const fechaVencVal = formData.get("fechaVencimiento") as string | null
    try {
      await registrarMovimientoStock({
        productoId: producto.id, userId: session.user.id, tipo: "inventario_inicial",
        cantidad: stock,
        costoUnitario: costo ?? null,
        fechaVencimiento: fechaVencVal ? new Date(fechaVencVal) : null,
      })
    } catch {
      // El producto ya se creó bien — si el registro de Kardex del stock
      // inicial falla por cualquier motivo, no hacemos que toda la
      // creación parezca fallida. Se corrige después con "Ajustar stock".
      await db.producto.update({ where: { id: producto.id }, data: { stock } }).catch(() => {})
    }
  }

  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/resumen")
}

/**
 * Crea varios productos de una sola vez desde una importación de Excel —
 * reutiliza exactamente la misma conversión de stock (aInterno) que usa el
 * wizard normal, así que el resultado es idéntico a haberlos creado uno por
 * uno a mano. Si una fila falla, se sigue con el resto y se informa cuál
 * falló y por qué, en vez de perder toda la importación.
 */
export async function importarProductosMasivo(productos: {
  nombre: string
  categoria: string | null
  sku: string | null
  codigoBarras: string | null
  precio: number | null
  costo: number | null
  formaVenta: "unidad" | "peso"
  stock: number
  stockMinimo: number
  descripcion: string | null
  fechaVencimiento?: string | null
}[]) {
  const session = await getSession()
  if (!productos || productos.length === 0) throw new Error("No hay productos para importar")

  const errores: string[] = []
  let exitosos = 0

  for (const p of productos) {
    try {
      const unidadMedida = p.formaVenta === "peso" ? "kg" : "unidad"
      const stockInterno = aInterno(p.stock, unidadMedida)
      const producto = await db.producto.create({
        data: {
          nombre: p.nombre,
          precio: p.precio,
          costo: p.costo,
          descripcion: p.descripcion,
          categoria: p.categoria,
          sku: p.sku,
          codigoBarras: p.codigoBarras,
          stock: 0, // se establece después vía Kardex, igual que en la creación manual
          stockMinimo: aInterno(p.stockMinimo, unidadMedida),
          unidadMedida,
          formaVenta: p.formaVenta,
          controlaInventario: true,
          userId: session.user.id,
        },
      })
      if (stockInterno > 0) {
        await registrarMovimientoStock({
          productoId: producto.id, userId: session.user.id, tipo: "inventario_inicial",
          cantidad: stockInterno,
          costoUnitario: p.costo ?? null,
          fechaVencimiento: p.fechaVencimiento ? new Date(p.fechaVencimiento) : null,
        })
      }
      exitosos++
    } catch (err: any) {
      const motivo = err?.code === "P2002" ? "SKU o código de barras duplicado" : (err?.message ?? "error desconocido")
      errores.push(`Fila "${p.nombre}": ${motivo}`)
    }
  }

  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/resumen")
  return { exitosos, total: productos.length, errores }
}

export async function actualizarProducto(id: string, formData: FormData) {
  const session = await getSession()
  const prod = await db.producto.findFirst({ where: { id, userId: session.user.id } })
  if (!prod) throw new Error("Producto no encontrado")

  const nombre = (formData.get("nombre") as string)?.trim()
  if (!nombre) throw new Error("Nombre requerido")

  const precio = formData.get("precio") ? parseFloat(formData.get("precio") as string) : null
  const costo = formData.get("costo") ? parseFloat(formData.get("costo") as string) : null

  const formaVenta = ((formData.get("formaVenta") as string) || "unidad") as FormaVenta
  const unidadMedida = (formData.get("unidadMedida") as string) || "unidad"
  const unidadPersonalizada = unidadMedida === "personalizada" ? ((formData.get("unidadPersonalizada") as string)?.trim() || null) : null

  const stockVal = formData.get("stock")
  const stock = stockVal !== null && stockVal !== "" ? aInterno(parseFloat(stockVal as string), unidadMedida) : null
  const stockMinimoVal = formData.get("stockMinimo")
  const stockMinimo = stockMinimoVal !== null && stockMinimoVal !== "" ? aInterno(parseFloat(stockMinimoVal as string), unidadMedida) : null

  const ventaMinimaVal = formData.get("ventaMinima")
  const ventaMinima = ventaMinimaVal !== null && ventaMinimaVal !== "" ? aInterno(parseFloat(ventaMinimaVal as string), unidadMedida) : null

  if (unidadMedida === "personalizada" && unidadPersonalizada) {
    await db.categoriaPersonalizada.create({
      data: { nombre: unidadPersonalizada, tipo: "UNIDAD_MEDIDA", userId: session.user.id },
    }).catch(() => {})
  }

  validarNumerosProducto({ precio, costo, stock, stockMinimo, ventaMinima })

  try {
    await db.producto.update({
      where: { id },
      data: {
        nombre,
        precio,
        costo,
        descripcion: (formData.get("descripcion") as string)?.trim() || null,
        categoria: (formData.get("categoria") as string)?.trim() || null,
        sku: (formData.get("sku") as string)?.trim() || null,
        codigoBarras: (formData.get("codigoBarras") as string)?.trim() || null,
        stock,
        stockMinimo,
        ventaMinima,
        unidadMedida,
        unidadPersonalizada,
        formaVenta,
      },
    })
  } catch (err: any) {
    if (err?.code === "P2002") {
      const campo = (err?.meta?.target as string[] | undefined)?.includes("codigoBarras") ? "código de barras" : "SKU"
      throw new Error(`Ya tienes otro producto con ese mismo ${campo}`)
    }
    throw err
  }
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/resumen")
}

export async function ajustarStock(
  id: string,
  cantidadUnidadDisplay: number,
  tipo: "agregar" | "reducir",
  motivo: TipoMovimientoStock = "ajuste_manual",
  opciones?: { observacion?: string; costoUnitario?: number; proveedorId?: string; fechaVencimiento?: string }
) {
  const session = await getSession()
  const prod = await db.producto.findFirst({ where: { id, userId: session.user.id } })
  if (!prod) throw new Error("Producto no encontrado")
  if (!cantidadUnidadDisplay || cantidadUnidadDisplay <= 0) throw new Error("La cantidad debe ser mayor a 0")

  const cantidad = aInterno(cantidadUnidadDisplay, prod.unidadMedida)
  const resultado = await registrarMovimientoStock({
    productoId: id, userId: session.user.id, tipo: motivo,
    cantidad: tipo === "agregar" ? cantidad : -cantidad,
    observacion: opciones?.observacion?.trim() || null,
    proveedorId: opciones?.proveedorId || null,
    costoUnitario: opciones?.costoUnitario ?? null,
    fechaVencimiento: opciones?.fechaVencimiento ? new Date(opciones.fechaVencimiento) : null,
  })
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/movimientos")
  revalidatePath("/dashboard/alertas")
  revalidatePath("/dashboard/reportes")

  if (resultado?.cambioCosto) {
    const { costoAnterior, costoNuevo, precioActual } = resultado.cambioCosto
    // Precio sugerido: el que mantiene el MISMO margen % que ya tenías,
    // aplicado al nuevo costo — no un número inventado.
    if (precioActual != null && precioActual > 0 && costoAnterior > 0) {
      const margenActual = (precioActual - costoAnterior) / precioActual
      if (margenActual < 1) {
        const precioSugerido = Math.round(costoNuevo / (1 - margenActual))
        if (precioSugerido !== precioActual) {
          return {
            avisoCosto: {
              productoId: id, productoNombre: prod.nombre,
              costoAnterior: Math.round(costoAnterior), costoNuevo: Math.round(costoNuevo),
              precioActual, precioSugerido, margenActual: Math.round(margenActual * 100),
            },
          }
        }
      }
    }
    // No hay precio de referencia (o el margen no da para calcular) — igual
    // dejamos un aviso simple, sin precio sugerido, para que el dueño lo note.
    return { avisoCosto: { productoId: id, productoNombre: prod.nombre, costoAnterior: Math.round(costoAnterior), costoNuevo: Math.round(costoNuevo), precioActual: null, precioSugerido: null, margenActual: null } }
  }
  return { avisoCosto: null }
}

export async function toggleProducto(id: string, activo: boolean) {
  const session = await getSession()
  await db.producto.updateMany({ where: { id, userId: session.user.id }, data: { activo } })
  revalidatePath("/dashboard/productos")
}

export async function eliminarProducto(id: string) {
  const session = await getSession()
  const prod = await db.producto.findFirst({ where: { id, userId: session.user.id } })
  if (!prod) throw new Error("No encontrado")
  // Desvincular movimientos
  await db.movimiento.updateMany({ where: { productoId: id, userId: session.user.id }, data: { productoId: null } })
  await db.producto.delete({ where: { id } })
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/movimientos")
  revalidatePath("/dashboard/venta")
}

// ── DEUDAS ─────────────────────────────────────────────────
export async function crearDeuda(formData: FormData) {
  const session = await getSession()
  const tipo = (formData.get("tipo") as string) || "Otros"
  const monto = parseFloat(formData.get("monto") as string)
  const interes = formData.get("interes") ? parseFloat(formData.get("interes") as string) : null
  const cuotas = formData.get("cuotas") ? parseInt(formData.get("cuotas") as string) : null
  const valorCuota = cuotas && interes ? calcularValorCuota(monto, interes, cuotas) : null

  const fechaPrimerPagoStr = formData.get("fechaPrimerPago") as string
  const fechaPrimerPago = fechaPrimerPagoStr ? new Date(fechaPrimerPagoStr) : null

  const cuotaManualStr = formData.get("cuotaManual") as string
  const cuotaManual = cuotaManualStr ? parseFloat(cuotaManualStr) : null
  const tipoTasa = (formData.get("tipoTasa") as string) || "mensual"

  await db.deuda.create({
    data: {
      acreedor: formData.get("acreedor") as string,
      tipo,
      entidad: (formData.get("entidad") as string) || null,
      monto,
      descripcion: (formData.get("descripcion") as string) || null,
      fechaDeuda: new Date(formData.get("fechaDeuda") as string),
      fechaVence: formData.get("fechaVence") ? new Date(formData.get("fechaVence") as string) : null,
      fechaPrimerPago,
      interes,
      cuotas,
      valorCuota: cuotaManual ?? valorCuota,
      cuotaManual,
      tipoTasa,
      userId: session.user.id,
    },
  })
  revalidatePath("/dashboard/deudas")
  revalidatePath("/dashboard/resumen")
}

function calcularValorCuota(monto: number, interesMensual: number, cuotas: number): number {
  const r = interesMensual / 100
  if (r === 0) return monto / cuotas
  return (monto * r * Math.pow(1 + r, cuotas)) / (Math.pow(1 + r, cuotas) - 1)
}

export async function registrarPago(deudaId: string, formData: FormData) {
  const session = await getSession()
  const deuda = await db.deuda.findFirst({ where: { id: deudaId, userId: session.user.id } })
  if (!deuda) throw new Error("Deuda no encontrada")
  const montoPago = parseFloat(formData.get("monto") as string)
  const fecha = new Date(formData.get("fecha") as string)
  const descripcion = (formData.get("descripcion") as string) || null
  if (isNaN(montoPago) || montoPago <= 0) throw new Error("Monto inválido")
  const nuevoMontoPagado = Number(deuda.montoPagado) + montoPago
  const pagadaCompleta = Number(deuda.monto) - nuevoMontoPagado <= 0
  await db.pagoDeuda.create({ data: { deudaId, monto: montoPago, fecha, descripcion } })
  await db.deuda.update({ where: { id: deudaId }, data: { montoPagado: nuevoMontoPagado, pagada: pagadaCompleta, cuotasPagadas: { increment: 1 } } })
  await db.movimiento.create({
    data: {
      tipo: "GASTO",
      monto: montoPago,
      fecha,
      descripcion: `Pago deuda: ${deuda.acreedor}${descripcion ? ` - ${descripcion}` : ""}`,
      categoria: "Otros",
      userId: session.user.id,
    }
  })
  revalidatePath("/dashboard/deudas")
  revalidatePath("/dashboard/resumen")
  if (pagadaCompleta) await cancelarNotificacionesPorPrefijo(`deuda:${deudaId}:`)
}

export async function editarDeuda(id: string, formData: FormData) {
  const session = await getSession()
  const deuda = await db.deuda.findFirst({ where: { id, userId: session.user.id } })
  if (!deuda) throw new Error("Deuda no encontrada")

  const monto = parseFloat(formData.get("monto") as string)
  const interesStr = (formData.get("interes") as string)?.replace(",", ".")
  const interes = interesStr ? parseFloat(interesStr) : null
  const cuotas = formData.get("cuotas") ? parseInt(formData.get("cuotas") as string) : null
  const valorCuota = cuotas && interes ? calcularValorCuota(monto, interes, cuotas) : null
  const fechaPrimerPagoStr = formData.get("fechaPrimerPago") as string

  await db.deuda.update({
    where: { id },
    data: {
      acreedor: formData.get("acreedor") as string,
      tipo: (formData.get("tipo") as string) || "Otros",
      entidad: (formData.get("entidad") as string) || null,
      monto,
      descripcion: (formData.get("descripcion") as string) || null,
      fechaDeuda: new Date(formData.get("fechaDeuda") as string),
      fechaVence: formData.get("fechaVence") ? new Date(formData.get("fechaVence") as string) : null,
      fechaPrimerPago: fechaPrimerPagoStr ? new Date(fechaPrimerPagoStr) : null,
      interes,
      cuotas,
      valorCuota,
    }
  })
  revalidatePath("/dashboard/deudas")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/alertas")
}

export async function eliminarDeuda(id: string) {
  const session = await getSession()
  await db.deuda.deleteMany({ where: { id, userId: session.user.id } })
  await cancelarNotificacionesPorPrefijo(`deuda:${id}:`)
  revalidatePath("/dashboard/deudas")
  revalidatePath("/dashboard/resumen")
}


// ── COSTOS FIJOS RECURRENTES ───────────────────────────────
export async function crearCostoUnico(formData: FormData) {
  const session = await getSession()
  const nombre = (formData.get("nombre") as string)?.trim()
  if (!nombre) throw new Error("Nombre requerido")
  const monto = parseFloat(formData.get("monto") as string)
  if (!monto || monto <= 0) throw new Error("Monto inválido")
  const fecha = new Date(formData.get("fecha") as string)
  const categoria = (formData.get("categoria") as string)?.trim() || "Costos fijos"

  await db.movimiento.create({
    data: {
      tipo: "COSTO_FIJO",
      monto,
      fecha,
      descripcion: nombre,
      categoria,
      userId: session.user.id,
    }
  })
  revalidatePath("/dashboard/costos-fijos")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/movimientos")
}

export async function crearCostoRecurrente(formData: FormData) {
  const session = await getSession()
  const nombre = (formData.get("nombre") as string)?.trim()
  if (!nombre) throw new Error("Nombre requerido")
  const monto = parseFloat(formData.get("monto") as string)
  if (!monto || monto <= 0) throw new Error("Monto inválido")
  const fechaInicioStr = formData.get("fechaInicio") as string
  if (!fechaInicioStr) throw new Error("La fecha de inicio es obligatoria")
  const fechaTerminoStr = formData.get("fechaTermino") as string
  const fechaInicio = new Date(fechaInicioStr)
  const fechaTermino = fechaTerminoStr ? new Date(fechaTerminoStr) : null
  if (fechaTermino && fechaTermino < fechaInicio) throw new Error("La fecha de término no puede ser antes de la fecha de inicio")

  await db.costoFijoRecurrente.create({
    data: {
      nombre,
      monto,
      categoria: (formData.get("categoria") as string)?.trim() || null,
      descripcion: (formData.get("descripcion") as string)?.trim() || null,
      fechaInicio,
      fechaTermino,
      estado: "activo",
      userId: session.user.id,
    }
  })
  revalidatePath("/dashboard/costos-fijos")
  revalidatePath("/dashboard/resumen")
}

export async function actualizarEstadoCosto(id: string, estado: "activo" | "pausado" | "finalizado") {
  const session = await getSession()
  await db.costoFijoRecurrente.updateMany({
    where: { id, userId: session.user.id },
    data: { estado }
  })
  revalidatePath("/dashboard/costos-fijos")
  revalidatePath("/dashboard/resumen")
}

export async function eliminarCostoRecurrente(id: string) {
  const session = await getSession()
  await db.costoFijoRecurrente.deleteMany({ where: { id, userId: session.user.id } })
  revalidatePath("/dashboard/costos-fijos")
  revalidatePath("/dashboard/resumen")
}

export async function generarCostosDelMes(userId: string, mes: number, anio: number): Promise<number> {
  const hoy = new Date()
  const diaActual = hoy.getDate()
  const diasDelMes = new Date(anio, mes, 0).getDate()

  const costosActivos = await db.costoFijoRecurrente.findMany({
    where: { userId, estado: "activo" },
    include: { generaciones: { where: { mes, anio } } }
  })

  let generados = 0
  for (const costo of costosActivos) {
    // Si ya fue generado este mes, saltar
    if (costo.generaciones.length > 0) continue

    // El día del mes en que se repite es siempre el mismo que fechaInicio —
    // ajustado si el mes es más corto (ej. inicio el 31, en febrero cae el 28).
    const diaDelMes = Math.min(costo.fechaInicio.getDate(), diasDelMes)
    const fechaEsteMes = new Date(anio, mes - 1, diaDelMes)

    // Antes de la fecha de inicio real: todavía no corresponde generarlo.
    if (fechaEsteMes < new Date(costo.fechaInicio.getFullYear(), costo.fechaInicio.getMonth(), costo.fechaInicio.getDate())) continue
    // Después de la fecha de término (si tiene una): ya no se repite.
    if (costo.fechaTermino && fechaEsteMes > costo.fechaTermino) continue
    // Si es el mes actual, solo generar cuando el día ya llegó (no antes).
    if (mes === hoy.getMonth() + 1 && anio === hoy.getFullYear() && diaDelMes > diaActual) continue

    try {
      // Solo se crea el registro de "Generado". El Movimiento real
      // (impacto financiero definitivo) se crea al marcar como Pagado.
      await db.generacionCosto.create({
        data: { costoFijoId: costo.id, mes, anio, pagado: false }
      })
      generados++
    } catch {
      // Skip if already generated (unique constraint violation) - idempotent
    }
  }

  if (generados > 0) {
    revalidatePath("/dashboard/costos-fijos")
    revalidatePath("/dashboard/alertas")
  }
  return generados
}

export async function marcarCostoPagado(generacionId: string, formData: FormData) {
  const session = await getSession()
  const generacion = await db.generacionCosto.findUnique({
    where: { id: generacionId },
    include: { costoFijo: true }
  })
  if (!generacion || generacion.costoFijo.userId !== session.user.id) throw new Error("No autorizado")
  if (generacion.pagado) throw new Error("Este costo ya fue marcado como pagado")

  const montoStr = formData.get("monto") as string
  const monto = montoStr ? parseFloat(montoStr) : Number(generacion.costoFijo.monto)
  if (!monto || monto <= 0) throw new Error("Monto inválido")
  const fechaStr = formData.get("fecha") as string
  const fecha = fechaStr ? new Date(fechaStr) : new Date()

  const movimiento = await db.movimiento.create({
    data: {
      tipo: "COSTO_FIJO",
      monto,
      fecha,
      descripcion: generacion.costoFijo.nombre,
      categoria: generacion.costoFijo.categoria || "Costos fijos",
      userId: session.user.id,
    }
  })
  await db.generacionCosto.update({
    where: { id: generacionId },
    data: { pagado: true, fechaPagado: new Date(), movimientoId: movimiento.id }
  })

  revalidatePath("/dashboard/costos-fijos")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/movimientos")
  revalidatePath("/dashboard/alertas")
}


// ── CLIENTES ──────────────────────────────────────────────
export async function crearCliente(formData: FormData) {
  const session = await getSession()
  const nombre = (formData.get("nombre") as string)?.trim()
  if (!nombre) throw new Error("El nombre es requerido")

  await db.cliente.create({
    data: {
      nombre,
      apellido:         (formData.get("apellido") as string)?.trim() || null,
      empresa:          (formData.get("empresa") as string)?.trim() || null,
      telefono:         (formData.get("telefono") as string)?.trim() || null,
      email:            (formData.get("email") as string)?.trim() || null,
      direccion:        (formData.get("direccion") as string)?.trim() || null,
      ciudad:           (formData.get("ciudad") as string)?.trim() || null,
      tipoCliente:      (formData.get("tipoCliente") as string) || "Minorista",
      frecuenciaCompra: (formData.get("frecuenciaCompra") as string) || null,
      metodoPago:       (formData.get("metodoPago") as string) || "Efectivo",
      diasPago:         parseInt(formData.get("diasPago") as string) || 0,
      esFrecuente:      formData.get("esFrecuente") === "on",
      esVip:            formData.get("esVip") === "on",
      permiteCredito:   formData.get("permiteCredito") === "on",
      observaciones:    (formData.get("observaciones") as string)?.trim() || null,
      userId:           session.user.id,
    }
  })
  revalidatePath("/dashboard/clientes")
}

export async function actualizarCliente(id: string, formData: FormData) {
  const session = await getSession()
  const cl = await db.cliente.findFirst({ where: { id, userId: session.user.id } })
  if (!cl) throw new Error("Cliente no encontrado")

  await db.cliente.update({
    where: { id },
    data: {
      nombre:           (formData.get("nombre") as string)?.trim() || cl.nombre,
      apellido:         (formData.get("apellido") as string)?.trim() || null,
      empresa:          (formData.get("empresa") as string)?.trim() || null,
      telefono:         (formData.get("telefono") as string)?.trim() || null,
      email:            (formData.get("email") as string)?.trim() || null,
      direccion:        (formData.get("direccion") as string)?.trim() || null,
      ciudad:           (formData.get("ciudad") as string)?.trim() || null,
      tipoCliente:      (formData.get("tipoCliente") as string) || "Minorista",
      frecuenciaCompra: (formData.get("frecuenciaCompra") as string) || null,
      metodoPago:       (formData.get("metodoPago") as string) || "Efectivo",
      diasPago:         parseInt(formData.get("diasPago") as string) || 0,
      esFrecuente:      formData.get("esFrecuente") === "on",
      esVip:            formData.get("esVip") === "on",
      permiteCredito:   formData.get("permiteCredito") === "on",
      activo:           formData.get("activo") !== "off",
      observaciones:    (formData.get("observaciones") as string)?.trim() || null,
    }
  })
  revalidatePath("/dashboard/clientes")
}

export async function eliminarCliente(id: string) {
  const session = await getSession()
  await db.cliente.deleteMany({ where: { id, userId: session.user.id } })
  revalidatePath("/dashboard/clientes")
}

export async function toggleActivoCliente(id: string, activo: boolean) {
  const session = await getSession()
  await db.cliente.updateMany({ where: { id, userId: session.user.id }, data: { activo } })
  revalidatePath("/dashboard/clientes")
}

export async function crearNotaCliente(clienteId: string, texto: string) {
  const session = await getSession()
  const cl = await db.cliente.findFirst({ where: { id: clienteId, userId: session.user.id } })
  if (!cl) throw new Error("Cliente no encontrado")
  await db.notaCliente.create({ data: { clienteId, texto: texto.trim() } })
  revalidatePath("/dashboard/clientes")
}

export async function eliminarNotaCliente(id: string) {
  const session = await getSession()
  const nota = await db.notaCliente.findFirst({ where: { id }, include: { cliente: { select: { userId: true } } } })
  if (!nota || nota.cliente.userId !== session.user.id) throw new Error("Sin acceso")
  await db.notaCliente.delete({ where: { id } })
  revalidatePath("/dashboard/clientes")
}


// ── PROVEEDORES ──────────────────────────────────────────────
export async function crearProveedor(formData: FormData) {
  const session = await getSession()
  const nombre = (formData.get("nombre") as string)?.trim()
  if (!nombre) throw new Error("El nombre es requerido")
  await db.proveedor.create({
    data: {
      nombre,
      empresa:      (formData.get("empresa") as string)?.trim() || null,
      rut:          (formData.get("rut") as string)?.trim() || null,
      telefono:     (formData.get("telefono") as string)?.trim() || null,
      email:        (formData.get("email") as string)?.trim() || null,
      direccion:    (formData.get("direccion") as string)?.trim() || null,
      ciudad:       (formData.get("ciudad") as string)?.trim() || null,
      categoria:    (formData.get("categoria") as string) || "Otros",
      esFavorito:   formData.get("esFavorito") === "on",
      observaciones:(formData.get("observaciones") as string)?.trim() || null,
      userId:       session.user.id,
    }
  })
  revalidatePath("/dashboard/proveedores")
}

export async function actualizarProveedor(id: string, formData: FormData) {
  const session = await getSession()
  const prov = await db.proveedor.findFirst({ where: { id, userId: session.user.id } })
  if (!prov) throw new Error("Proveedor no encontrado")
  await db.proveedor.update({
    where: { id },
    data: {
      nombre:       (formData.get("nombre") as string)?.trim() || prov.nombre,
      empresa:      (formData.get("empresa") as string)?.trim() || null,
      rut:          (formData.get("rut") as string)?.trim() || null,
      telefono:     (formData.get("telefono") as string)?.trim() || null,
      email:        (formData.get("email") as string)?.trim() || null,
      direccion:    (formData.get("direccion") as string)?.trim() || null,
      ciudad:       (formData.get("ciudad") as string)?.trim() || null,
      categoria:    (formData.get("categoria") as string) || "Otros",
      esFavorito:   formData.get("esFavorito") === "on",
      activo:       formData.get("activo") !== "off",
      observaciones:(formData.get("observaciones") as string)?.trim() || null,
    }
  })
  revalidatePath("/dashboard/proveedores")
}

export async function toggleActivoProveedor(id: string, activo: boolean) {
  const session = await getSession()
  await db.proveedor.updateMany({ where: { id, userId: session.user.id }, data: { activo } })
  revalidatePath("/dashboard/proveedores")
}

export async function toggleFavoritoProveedor(id: string, esFavorito: boolean) {
  const session = await getSession()
  await db.proveedor.updateMany({ where: { id, userId: session.user.id }, data: { esFavorito } })
  revalidatePath("/dashboard/proveedores")
}

export async function eliminarProveedor(id: string) {
  const session = await getSession()
  await db.proveedor.deleteMany({ where: { id, userId: session.user.id } })
  revalidatePath("/dashboard/proveedores")
}

export async function crearNotaProveedor(proveedorId: string, texto: string) {
  const session = await getSession()
  const prov = await db.proveedor.findFirst({ where: { id: proveedorId, userId: session.user.id } })
  if (!prov) throw new Error("Proveedor no encontrado")
  await db.notaProveedor.create({ data: { proveedorId, texto: texto.trim() } })
  revalidatePath("/dashboard/proveedores")
}

export async function eliminarNotaProveedor(id: string) {
  const session = await getSession()
  const nota = await db.notaProveedor.findFirst({ where: { id }, include: { proveedor: { select: { userId: true } } } })
  if (!nota || nota.proveedor.userId !== session.user.id) throw new Error("Sin acceso")
  await db.notaProveedor.delete({ where: { id } })
  revalidatePath("/dashboard/proveedores")
}


// ── CUENTAS POR COBRAR ──────────────────────────────────────
export async function crearCuentaPorCobrar(formData: FormData) {
  const session = await getSession()
  const clienteId = formData.get("clienteId") as string
  if (!clienteId) throw new Error("Cliente requerido")
  const monto = parseFloat(formData.get("monto") as string)
  if (!monto || monto <= 0) throw new Error("Monto inválido")

  // Check límite de crédito
  const cliente = await db.cliente.findFirst({ where: { id: clienteId, userId: session.user.id }, select: { limiteCredito: true, nombre: true } })
  if (cliente?.limiteCredito) {
    const deudaActual = await db.cuentaPorCobrar.aggregate({
      where: { clienteId, estado: { in: ["pendiente","parcial","vencida"] } },
      _sum: { saldoPendiente: true }
    })
    const totalDeuda = Number(deudaActual._sum.saldoPendiente ?? 0)
    if (totalDeuda + monto > Number(cliente.limiteCredito)) {
      throw new Error(`Límite de crédito excedido para ${cliente.nombre}. Disponible: $${Math.max(0, Number(cliente.limiteCredito) - totalDeuda).toLocaleString("es-CL")}`)
    }
  }

  // Use max(numero) + 1 for concurrency safety
  const maxNumero = await db.cuentaPorCobrar.aggregate({
    where: { userId: session.user.id },
    _max: { numero: true }
  })
  const siguienteNumero = (maxNumero._max.numero ?? 0) + 1

  const nuevaCuenta = await db.cuentaPorCobrar.create({
    data: {
      numero: siguienteNumero,
      clienteId,
      movimientoId: (formData.get("movimientoId") as string) || null,
      montoOriginal: monto,
      saldoPendiente: monto,
      fechaVenta: new Date(formData.get("fechaVenta") as string),
      fechaVence: formData.get("fechaVence") ? new Date(formData.get("fechaVence") as string) : null,
      estado: "pendiente",
      observaciones: (formData.get("observaciones") as string)?.trim() || null,
      userId: session.user.id,
    }
  })
  await notificar({
    userId: session.user.id, categoria: "cuentasCobrar", prioridad: "baja",
    titulo: `Nueva cuenta por cobrar: ${cliente?.nombre ?? "Cliente"}`,
    mensaje: `Monto: $${monto.toLocaleString("es-CL")}`,
    accionUrl: "/dashboard/cuentas-cobrar",
    claveUnica: `cxc:${nuevaCuenta.id}:creada`,
  })
  revalidatePath("/dashboard/cuentas-cobrar")
  revalidatePath("/dashboard/clientes")
}

export async function registrarPagoCuenta(cuentaId: string, formData: FormData) {
  const session = await getSession()
  const cuenta = await db.cuentaPorCobrar.findFirst({ where: { id: cuentaId, userId: session.user.id } })
  if (!cuenta) throw new Error("Cuenta no encontrada")

  const monto = parseFloat(formData.get("monto") as string)
  if (!monto || monto <= 0) throw new Error("Monto inválido")
  if (monto > Number(cuenta.saldoPendiente)) throw new Error("Monto mayor al saldo pendiente")

  const fecha = new Date(formData.get("fecha") as string)
  const nuevoSaldo = Math.max(0, Number(cuenta.saldoPendiente) - monto)
  const nuevoEstado = nuevoSaldo === 0 ? "pagada" : "parcial"

  await db.pagoCuenta.create({
    data: {
      cuentaId,
      monto,
      fecha,
      descripcion: (formData.get("descripcion") as string)?.trim() || null,
      metodoPago: (formData.get("metodoPago") as string) || "Efectivo",
    }
  })

  await db.cuentaPorCobrar.update({
    where: { id: cuentaId },
    data: { saldoPendiente: nuevoSaldo, estado: nuevoEstado }
  })

  // Register as INGRESO_EXTRA movement
  await db.movimiento.create({
    data: {
      tipo: "INGRESO_EXTRA",
      monto,
      fecha,
      descripcion: `Cobro Venta #${cuenta.numero} - ${(formData.get("descripcion") as string)?.trim() || "Cobro recibido"}`,
      categoria: "Cobros",
      clienteId: cuenta.clienteId,
      userId: session.user.id,
    }
  })

  revalidatePath("/dashboard/cuentas-cobrar")
  revalidatePath("/dashboard/resumen")
  revalidatePath("/dashboard/clientes")

  await cancelarNotificacionesPorPrefijo(`cxc:${cuentaId}:`)
  const clienteDatos = await db.cliente.findUnique({ where: { id: cuenta.clienteId }, select: { nombre: true } })
  await notificar({
    userId: session.user.id, categoria: "cuentasCobrar", prioridad: "baja",
    titulo: `Pago recibido de ${clienteDatos?.nombre ?? "cliente"}`,
    mensaje: `$${monto.toLocaleString("es-CL")} · ${nuevoEstado === "pagada" ? "Cuenta saldada" : "Pago parcial"}`,
    accionUrl: "/dashboard/cuentas-cobrar",
    claveUnica: `cxc:${cuentaId}:pago:${Date.now()}`,
  })
}

export async function actualizarEstadoCuenta(id: string) {
  const session = await getSession()
  const cuenta = await db.cuentaPorCobrar.findFirst({ where: { id, userId: session.user.id } })
  if (!cuenta) return
  const hoy = new Date()
  let estado = cuenta.estado
  if (Number(cuenta.saldoPendiente) === 0) estado = "pagada"
  else if (cuenta.fechaVence && cuenta.fechaVence < hoy) estado = "vencida"
  await db.cuentaPorCobrar.update({ where: { id }, data: { estado } })
  revalidatePath("/dashboard/cuentas-cobrar")
}

export async function eliminarCuentaPorCobrar(id: string) {
  const session = await getSession()
  await db.cuentaPorCobrar.deleteMany({ where: { id, userId: session.user.id } })
  await cancelarNotificacionesPorPrefijo(`cxc:${id}:`)
  revalidatePath("/dashboard/cuentas-cobrar")
}



// ─── CALENDARIO ──────────────────────────────────────────────────────────────

export async function crearEventoCalendario(formData: FormData) {
  const session = await getSession()
  const titulo = (formData.get("titulo") as string)?.trim()
  const descripcion = (formData.get("descripcion") as string | null)?.trim() || null
  const fecha = formData.get("fecha") as string
  const tipo = (formData.get("tipo") as string) || "evento"
  const prioridad = (formData.get("prioridad") as string) || "media"
  const estado = (formData.get("estado") as string) || "pendiente"
  const horaLimite = (formData.get("horaLimite") as string | null) || null

  if (!titulo || !fecha) throw new Error("Título y fecha son requeridos")

  await db.eventoCalendario.create({
    data: { titulo, descripcion, fecha: new Date(fecha), tipo, prioridad, estado, horaLimite, color: "azul", userId: session.user.id }
  })
  revalidatePath("/dashboard/calendario")
  revalidatePath("/dashboard/alertas")
}

export async function actualizarEventoCalendario(id: string, formData: FormData) {
  const session = await getSession()
  const titulo = (formData.get("titulo") as string)?.trim()
  const descripcion = (formData.get("descripcion") as string | null)?.trim() || null
  const fecha = formData.get("fecha") as string
  const tipo = (formData.get("tipo") as string) || "evento"
  const prioridad = (formData.get("prioridad") as string) || "media"
  const estado = (formData.get("estado") as string) || "pendiente"
  const horaLimite = (formData.get("horaLimite") as string | null) || null

  if (!titulo || !fecha) throw new Error("Título y fecha son requeridos")
  await db.eventoCalendario.updateMany({
    where: { id, userId: session.user.id },
    data: { titulo, descripcion, fecha: new Date(fecha), tipo, prioridad, estado, horaLimite }
  })
  // La fecha/hora cambió: se cancelan los recordatorios ya generados, el cron los reprograma con la nueva fecha
  await cancelarNotificacionesPorPrefijo(`evt:${id}:`)
  await cancelarNotificacionesPorPrefijo(`tarea:${id}:`)
  revalidatePath("/dashboard/calendario")
}

export async function eliminarEventoCalendario(id: string) {
  const session = await getSession()
  await db.eventoCalendario.deleteMany({ where: { id, userId: session.user.id } })
  await cancelarNotificacionesPorPrefijo(`evt:${id}:`)
  await cancelarNotificacionesPorPrefijo(`tarea:${id}:`)
  revalidatePath("/dashboard/calendario")
}

export async function actualizarEstadoEventoCalendario(id: string, estado: string) {
  const session = await getSession()
  await db.eventoCalendario.updateMany({ where: { id, userId: session.user.id }, data: { estado } })
  if (estado === "completada" || estado === "cancelada") {
    await cancelarNotificacionesPorPrefijo(`evt:${id}:`)
    await cancelarNotificacionesPorPrefijo(`tarea:${id}:`)
  }
  revalidatePath("/dashboard/calendario")
}

/**
 * Acepta la sugerencia de precio tras un cambio de costo — el dueño la
 * confirmó explícitamente, así que se actualiza el precio de venta.
 */
export async function actualizarPrecioProducto(productoId: string, nuevoPrecio: number) {
  const session = await getSession()
  const prod = await db.producto.findFirst({ where: { id: productoId, userId: session.user.id } })
  if (!prod) throw new Error("Producto no encontrado")
  await db.producto.update({ where: { id: productoId }, data: { precio: nuevoPrecio } })
  revalidatePath("/dashboard/productos")
  revalidatePath("/dashboard/venta")
}

/**
 * El dueño vio el aviso de cambio de costo y decidió "ahora no" — en vez de
 * perder el aviso, queda una notificación persistente en la campanita para
 * que no se le pase revisarlo más tarde.
 */
export async function posponerAvisoCosto(productoNombre: string, costoAnterior: number, costoNuevo: number) {
  const session = await getSession()
  await notificar({
    userId: session.user.id, categoria: "inventario", prioridad: "media",
    titulo: `Costo actualizado: ${productoNombre}`,
    mensaje: `Su costo cambió de $${costoAnterior.toLocaleString("es-CL")} a $${costoNuevo.toLocaleString("es-CL")}. Revisa si tu precio de venta sigue siendo el correcto.`,
    accionUrl: "/dashboard/productos",
    claveUnica: `costo-cambio:${productoNombre}:${Date.now()}`,
  })
}
