// ══════════════════════════════════════════════════════════════════════
// Sugerencia automática de categoría (y forma de venta) por palabras clave
// del nombre del producto — mismo patrón que el emoji automático
// (lib/emojis.ts), reglas simples y gratis, sin depender de ningún
// servicio externo.
// ══════════════════════════════════════════════════════════════════════

export type FormaVentaSugerida = "unidad" | "peso" | null

const REGLAS_CATEGORIA: [string[], string, FormaVentaSugerida][] = [
  [["leche", "yogurt", "yoghurt", "mantequilla", "margarina", "crema", "manjar", "queso"], "Lácteos", null],
  [["pan ", "pan,", "hallulla", "marraqueta", "baguette", "amasado", "coliza", "torta", "queque", "kuchen", "pastel"], "Panadería", null],
  [["bebida", "cola", "fanta", "sprite", "gaseosa", "jugo", "nectar", "néctar", "cerveza", "vino", "pisco", "whisky", "vodka", "licor"], "Bebidas", null],
  [["vacuno", "carne", "posta", "asado", "filete", "lomo", "bistec", "molida", "pollo", "cerdo", "chancho", "chuleta", "pescado", "salmon", "salmón", "atun", "atún", "merluza", "jamon", "jamón", "chorizo", "longaniza", "vienesa", "salchicha"], "Carnes", "peso"],
  [["manzana", "platano", "plátano", "naranja", "mandarina", "limon", "limón", "uva", "pera", "sandia", "sandía", "melon", "melón", "frutilla", "durazno", "pina", "piña", "palta"], "Frutas", "peso"],
  [["tomate", "papa ", "papas", "cebolla", "ajo", "zanahoria", "lechuga", "pepino", "choclo", "pimenton", "pimentón", "zapallo", "verdura", "espinaca", "acelga"], "Verduras", "peso"],
  [["arroz", "fideo", "tallarin", "tallarín", "pasta", "porotos", "poroto", "lenteja", "garbanzo", "harina", "azucar", "azúcar", "aceite", "sal ", "cafe", "café", "te ", "té ", "chocolate", "galleta", "dulce", "confite", "conserva", "atun lata", "mermelada"], "Abarrotes", null],
  [["detergente", "lavaloza", "cloro", "desinfectante", "limpiador", "jabon", "jabón", "shampoo", "champú", "papel higienico", "papel higiénico", "confort", "servilleta", "escoba", "trapero", "esponja"], "Limpieza", null],
  [["tornillo", "clavo", "perno", "tuerca", "martillo", "destornillador", "pintura", "cable", "alambre", "cinta aislante", "foco", "ampolleta"], "Ferretería", null],
  [["zapato", "zapatilla", "sandalia", "camisa", "polera", "pantalon", "pantalón"], "Accesorios", null],
]

/** Sugiere una categoría (y a veces también la forma de venta) a partir del
 * nombre del producto. Nunca se aplica sola sin que el usuario confirme —
 * queda pre-seleccionada, pero se puede cambiar con un toque. */
export function sugerirCategoria(nombre: string): { categoria: string | null; formaVenta: FormaVentaSugerida } {
  const texto = ` ${nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")} `
  for (const [palabras, categoria, formaVenta] of REGLAS_CATEGORIA) {
    if (palabras.some(p => texto.includes(p.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
      return { categoria, formaVenta }
    }
  }
  return { categoria: null, formaVenta: null }
}
