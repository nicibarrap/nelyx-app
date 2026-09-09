import * as XLSX from "xlsx"

// Plantilla simplificada (10 columnas) — Peso siempre en Kg, Volumen no se
// ofrece (igual que el wizard de creación normal, para que ambos caminos
// terminen en el mismo resultado).
export const COLUMNAS_PLANTILLA = [
  "Nombre", "Categoría", "SKU", "Código de barras", "Precio", "Costo",
  "Forma de venta (Unidad o Peso)", "Stock inicial", "Stock mínimo", "Descripción", "Fecha de vencimiento",
] as const

const FILAS_EJEMPLO = [
  { "Nombre": "EJEMPLO — bórrame antes de subir tu archivo", "Categoría": "Abarrotes", "SKU": "", "Código de barras": "", "Precio": 1500, "Costo": 1000, "Forma de venta (Unidad o Peso)": "Unidad", "Stock inicial": 20, "Stock mínimo": 5, "Descripción": "", "Fecha de vencimiento": "" },
  { "Nombre": "EJEMPLO — Vacuno", "Categoría": "Carnes", "SKU": "", "Código de barras": "", "Precio": 8000, "Costo": 6000, "Forma de venta (Unidad o Peso)": "Peso", "Stock inicial": 10, "Stock mínimo": 2, "Descripción": "Se vende por Kg", "Fecha de vencimiento": "31-12-2026" },
]

/** Arma el libro Excel completo (hoja de productos con formato + hoja de
 * instrucciones) a partir de las filas que sea — reutilizado tanto por la
 * plantilla en blanco como por la generada desde un escaneo. */
function construirLibroExcel(filas: Record<string, any>[]) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(filas, { header: [...COLUMNAS_PLANTILLA] })

  ws["!cols"] = [
    { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 10 },
    { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 18 },
  ]

  const filaInicio = 2
  for (let i = 0; i < filas.length; i++) {
    const fila = filaInicio + i
    const celdaPrecio = ws[`E${fila}`]
    const celdaCosto = ws[`F${fila}`]
    if (celdaPrecio && typeof celdaPrecio.v === "number") celdaPrecio.z = '"$"#,##0'
    if (celdaCosto && typeof celdaCosto.v === "number") celdaCosto.z = '"$"#,##0'
  }

  const ultimaFila = filaInicio + Math.max(filas.length, 1) - 1
  ws["!autofilter"] = { ref: `A1:K${ultimaFila}` }
  XLSX.utils.book_append_sheet(wb, ws, "Productos")

  const instrucciones = [
    { "Columna": "Nombre", "Obligatorio": "Sí", "Qué poner": "El nombre del producto tal como quieres que aparezca en NELYX." },
    { "Columna": "Categoría", "Obligatorio": "No", "Qué poner": "Ej: Abarrotes, Carnes, Lácteos. Si no existe, se crea sola." },
    { "Columna": "SKU", "Obligatorio": "No", "Qué poner": "Tu código interno, si usas uno. Debe ser único." },
    { "Columna": "Código de barras", "Obligatorio": "No", "Qué poner": "El código del producto (el que trae de fábrica). Debe ser único." },
    { "Columna": "Precio", "Obligatorio": "No (recomendado)", "Qué poner": "Precio de venta, solo el número (ej: 1500)." },
    { "Columna": "Costo", "Obligatorio": "No", "Qué poner": "Lo que te cuesta a ti, solo el número." },
    { "Columna": "Forma de venta (Unidad o Peso)", "Obligatorio": "No", "Qué poner": "Escribe \"Unidad\" o \"Peso\". Si lo dejas vacío, se asume \"Unidad\". Los productos por \"Peso\" se guardan en Kg." },
    { "Columna": "Stock inicial", "Obligatorio": "No", "Qué poner": "Cuánto tienes hoy. Si lo dejas vacío, se guarda en 0." },
    { "Columna": "Stock mínimo", "Obligatorio": "No", "Qué poner": "Desde cuánto quieres que te avise \"stock bajo\". Si lo dejas vacío, se usa 5." },
    { "Columna": "Descripción", "Obligatorio": "No", "Qué poner": "Cualquier detalle adicional, opcional." },
    { "Columna": "Fecha de vencimiento", "Obligatorio": "No", "Qué poner": "Solo si el producto vence — formato DD-MM-AAAA (ej: 31-12-2026). Se guarda como el primer lote de este producto, y aparecerá en Alertas cuando esté por vencer." },
  ]
  const wsInstrucciones = XLSX.utils.json_to_sheet(instrucciones)
  wsInstrucciones["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 60 }]
  wsInstrucciones["!autofilter"] = { ref: `A1:C${instrucciones.length + 1}` }
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, "Instrucciones")

  return wb
}

export function generarPlantillaExcel(): void {
  const wb = construirLibroExcel(FILAS_EJEMPLO)
  XLSX.writeFile(wb, "plantilla-productos-nelyx.xlsx")
}

export type ItemEscaneado = {
  codigoBarras: string
  nombre: string
  categoria: string | null
  precio?: number | null
  costo?: number | null
}

/** Genera la plantilla ya con el código de barras (y nombre/categoría, si
 * se detectaron) puestos en el mismo orden en que se escanearon — así no
 * hace falta "hacer calzar" nada a mano, cada fila ya trae su propio dato
 * real en vez de un número de referencia inventado. */
export function generarPlantillaDesdeEscaneo(items: ItemEscaneado[]): void {
  const filas = items.map(it => ({
    "Nombre": it.nombre,
    "Categoría": it.categoria ?? "",
    "SKU": "",
    "Código de barras": it.codigoBarras,
    "Precio": it.precio ?? "",
    "Costo": it.costo ?? "",
    "Forma de venta (Unidad o Peso)": "Unidad",
    "Stock inicial": "",
    "Stock mínimo": "",
    "Descripción": "",
    "Fecha de vencimiento": "",
  }))
  const wb = construirLibroExcel(filas)
  XLSX.writeFile(wb, `productos-escaneados-nelyx-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export type FilaRaw = Record<string, any>

export async function parseArchivoExcel(file: File): Promise<FilaRaw[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: "array", cellDates: true })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<FilaRaw>(hoja, { defval: "" })
}

export type ProductoValidado = {
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
  fechaVencimiento: string | null
}

export type FilaValidada = {
  fila: number
  estado: "ok" | "advertencia" | "error"
  mensajes: string[]
  datos: ProductoValidado | null
}

function normalizarFormaVenta(texto: string): { valor: "unidad" | "peso"; reconocido: boolean } {
  const t = texto.trim().toLowerCase()
  if (!t || t === "unidad" || t === "unidades") return { valor: "unidad", reconocido: true }
  if (t === "peso" || t === "kg" || t === "kilo" || t === "kilos" || t === "kilogramo" || t === "kilogramos") return { valor: "peso", reconocido: true }
  return { valor: "unidad", reconocido: false }
}

function num(valor: any): number | null {
  if (valor === "" || valor === null || valor === undefined) return null
  const n = typeof valor === "number" ? valor : parseFloat(String(valor).replace(/[^0-9.,-]/g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Acepta tanto una fecha nativa de Excel (llega como objeto Date gracias a
 * cellDates) como texto escrito a mano en formato DD-MM-AAAA o DD/MM/AAAA.
 * Devuelve un string ISO (AAAA-MM-DD) o null si está vacío / no se pudo leer. */
function parsearFechaVencimiento(valor: any): { fecha: string | null; invalida: boolean } {
  if (valor === "" || valor === null || valor === undefined) return { fecha: null, invalida: false }
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return { fecha: valor.toISOString().slice(0, 10), invalida: false }
  }
  const texto = String(valor).trim()
  const match = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (match) {
    const [, dia, mes, anio] = match
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia))
    if (!isNaN(fecha.getTime()) && fecha.getDate() === Number(dia)) {
      return { fecha: fecha.toISOString().slice(0, 10), invalida: false }
    }
  }
  return { fecha: null, invalida: true }
}

/**
 * Valida cada fila del Excel contra el catálogo ya existente (para detectar
 * duplicados de SKU/código dentro del propio archivo y contra lo que ya
 * tiene el usuario) — nunca se sube nada a la base de datos acá, solo se
 * arma el diagnóstico fila por fila para la vista previa.
 */
export function validarFilas(filas: FilaRaw[], productosExistentes: { sku: string | null; codigoBarras: string | null }[]): FilaValidada[] {
  const skusExistentes = new Set(productosExistentes.map(p => p.sku?.toLowerCase()).filter(Boolean))
  const codigosExistentes = new Set(productosExistentes.map(p => p.codigoBarras?.toLowerCase()).filter(Boolean))
  const skusVistos = new Set<string>()
  const codigosVistos = new Set<string>()

  return filas.map((fila, i): FilaValidada => {
    const mensajes: string[] = []
    let estado: "ok" | "advertencia" | "error" = "ok"

    const nombre = String(fila["Nombre"] ?? "").trim()
    if (!nombre) {
      return { fila: i + 2, estado: "error", mensajes: ["Falta el nombre — es obligatorio"], datos: null }
    }

    const sku = String(fila["SKU"] ?? "").trim() || null
    const codigoBarras = String(fila["Código de barras"] ?? "").trim() || null

    if (sku) {
      const skuLower = sku.toLowerCase()
      if (skusExistentes.has(skuLower)) { estado = "error"; mensajes.push(`Ya tienes otro producto con el SKU "${sku}"`) }
      else if (skusVistos.has(skuLower)) { estado = "error"; mensajes.push(`El SKU "${sku}" está repetido en otra fila de este mismo archivo`) }
      skusVistos.add(skuLower)
    }
    if (codigoBarras) {
      const codLower = codigoBarras.toLowerCase()
      if (codigosExistentes.has(codLower)) { estado = "error"; mensajes.push(`Ya tienes otro producto con el código "${codigoBarras}"`) }
      else if (codigosVistos.has(codLower)) { estado = "error"; mensajes.push(`El código "${codigoBarras}" está repetido en otra fila de este mismo archivo`) }
      codigosVistos.add(codLower)
    }

    const precio = num(fila["Precio"])
    if (precio === null) { if (estado === "ok") estado = "advertencia"; mensajes.push("Sin precio — podrás ponerlo después, pero no se podrá vender hasta entonces") }
    if (precio !== null && precio < 0) { estado = "error"; mensajes.push("El precio no puede ser negativo") }

    const costo = num(fila["Costo"])
    if (costo !== null && costo < 0) { estado = "error"; mensajes.push("El costo no puede ser negativo") }

    const { valor: formaVenta, reconocido } = normalizarFormaVenta(String(fila["Forma de venta (Unidad o Peso)"] ?? ""))
    if (!reconocido) { if (estado === "ok") estado = "advertencia"; mensajes.push(`No reconocí "${fila["Forma de venta (Unidad o Peso)"]}" como forma de venta — se va a guardar como "Unidad"`) }

    const stock = num(fila["Stock inicial"]) ?? 0
    if (stock < 0) { estado = "error"; mensajes.push("El stock inicial no puede ser negativo") }
    const stockMinimo = num(fila["Stock mínimo"]) ?? 5
    if (stockMinimo < 0) { estado = "error"; mensajes.push("El stock mínimo no puede ser negativo") }

    const { fecha: fechaVencimiento, invalida: fechaInvalida } = parsearFechaVencimiento(fila["Fecha de vencimiento"])
    if (fechaInvalida) { if (estado === "ok") estado = "advertencia"; mensajes.push(`No pude leer la fecha de vencimiento "${fila["Fecha de vencimiento"]}" — usa el formato DD-MM-AAAA. Se guardará sin fecha.`) }

    if (estado === "error") return { fila: i + 2, estado, mensajes, datos: null }

    return {
      fila: i + 2,
      estado,
      mensajes,
      datos: {
        nombre,
        categoria: String(fila["Categoría"] ?? "").trim() || null,
        sku, codigoBarras,
        precio, costo,
        formaVenta,
        stock, stockMinimo,
        descripcion: String(fila["Descripción"] ?? "").trim() || null,
        fechaVencimiento,
      },
    }
  })
}
