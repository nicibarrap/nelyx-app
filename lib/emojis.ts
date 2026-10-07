// ══════════════════════════════════════════════════════════════════════
// Emoji automático por producto — en vez de subir una foto (más pesado,
// más lento, y ya vimos que ni se llegaba a mostrar en ningún lado), se
// identifica un emoji representativo a partir de palabras clave del
// nombre. Cubre los rubros típicos de almacén, carnicería, panadería,
// botillería y ferretería — con un ícono genérico de respaldo si no
// coincide nada.
// ══════════════════════════════════════════════════════════════════════

const REGLAS_EMOJI: [string[], string][] = [
  [["leche", "yogurt", "yoghurt", "mantequilla", "margarina", "crema", "manjar", "manjarblanco"], "🥛"],
  [["queso"], "🧀"],
  [["huevo"], "🥚"],
  [["pan ", "pan,", "hallulla", "marraqueta", "baguette", "pan integral", "pan molde", "pan de molde", "amasado", "coliza"], "🍞"],
  [["torta", "queque", "kuchen", "pastel", "bizcocho", "tarta"], "🍰"],
  [["bebida", "cola", "fanta", "sprite", "gaseosa", "kem piña", "kem"], "🥤"],
  [["jugo", "nectar", "néctar"], "🧃"],
  [["agua mineral", "agua "], "💧"],
  [["cerveza"], "🍺"],
  [["vino"], "🍷"],
  [["pisco", "whisky", "whiskey", "ron ", "vodka", "licor"], "🥃"],
  [["cafe", "café", "nescafe", "nescafé"], "☕"],
  [["te ", "té ", "mate", "yerba"], "🍵"],
  [["vacuno", "carne", "posta", "asado", "filete", "lomo", "bistec", "molida"], "🥩"],
  [["pollo", "ave "], "🍗"],
  [["cerdo", "chancho", "chuleta"], "🥓"],
  [["pescado", "salmon", "salmón", "atun", "atún", "merluza", "jurel", "reineta"], "🐟"],
  [["mariscos", "camaron", "camarón", "choritos", "machas", "jaiba"], "🦐"],
  [["jamon", "jamón", "chorizo", "longaniza", "vienesa", "salchicha", "mortadela", "pate", "paté"], "🌭"],
  [["manzana"], "🍎"],
  [["platano", "plátano", "banana"], "🍌"],
  [["naranja", "mandarina"], "🍊"],
  [["limon", "limón"], "🍋"],
  [["uva"], "🍇"],
  [["pera"], "🍐"],
  [["sandia", "sandía"], "🍉"],
  [["melon", "melón"], "🍈"],
  [["frutilla", "fresa"], "🍓"],
  [["durazno", "damasco"], "🍑"],
  [["pina", "piña", "ananas"], "🍍"],
  [["palta", "aguacate"], "🥑"],
  [["tomate"], "🍅"],
  [["papa ", "papas", "patata"], "🥔"],
  [["cebolla"], "🧅"],
  [["ajo"], "🧄"],
  [["zanahoria"], "🥕"],
  [["lechuga", "ensalada", "espinaca", "acelga"], "🥬"],
  [["pepino"], "🥒"],
  [["choclo", "maiz", "maíz"], "🌽"],
  [["pimenton", "pimentón", "aji", "ají"], "🌶️"],
  [["zapallo", "calabaza"], "🎃"],
  [["arroz"], "🍚"],
  [["fideo", "tallarin", "tallarín", "pasta", "spaghetti", "espagueti"], "🍝"],
  [["porotos", "poroto", "lenteja", "garbanzo", "legumbre"], "🫘"],
  [["mani", "maní", "cacahuate", "cacahuete", "nuez", "nueces", "almendra", "avellana", "castaña", "pistacho", "maravilla", "pipas", "semillas"], "🥜"],
  [["harina"], "🌾"],
  [["azucar", "azúcar"], "🧂"],
  [["sal "], "🧂"],
  [["aceite"], "🫒"],
  [["chocolate"], "🍫"],
  [["galleta"], "🍪"],
  [["dulce", "caramelo", "confite", "bombon", "bombón"], "🍬"],
  [["chicle"], "🍬"],
  [["helado"], "🍦"],
  [["papas fritas", "snack", "chizitos", "doritos"], "🍟"],
  [["cigarro", "tabaco", "pucho"], "🚬"],
  [["detergente", "lavaloza", "cloro", "desinfectante", "limpiador", "quitamanchas"], "🧴"],
  [["jabon", "jabón", "shampoo", "champú", "acondicionador"], "🧼"],
  [["desodorante", "perfume", "colonia", "locion", "loción"], "🧴"],
  [["papel higienico", "papel higiénico", "confort", "toalla nova", "servilleta"], "🧻"],
  [["escoba", "trapero", "esponja"], "🧹"],
  [["pila", "bateria", "batería", "cargador"], "🔋"],
  [["tornillo", "clavo", "perno", "tuerca"], "🔩"],
  [["martillo", "destornillador", "llave inglesa", "alicate"], "🔨"],
  [["pintura", "esmalte"], "🎨"],
  [["cable", "alambre"], "🔌"],
  [["cinta adhesiva", "scotch", "cinta aislante"], "📏"],
  [["foco", "ampolleta", "lampara", "lámpara"], "💡"],
  [["perro"], "🐕"],
  [["gato"], "🐈"],
  [["zapato", "zapatilla", "sandalia", "bototo"], "👟"],
  [["camisa", "polera", "chaleco", "chaqueta"], "👕"],
  [["pantalon", "pantalón", "short", "jeans"], "👖"],
  [["remedio", "medicamento", "pastilla", "analgesico", "analgésico"], "💊"],
]

/** Identifica un emoji representativo a partir del nombre de un producto,
 * buscando coincidencias de palabras clave. Es intencionalmente barato
 * (sin red, sin IA) — corre en el navegador o en el servidor sin costo. */
// Cuando ninguna palabra del nombre coincide (ej. "Gold Lúcuma y Nueces" no
// dice "yogurt" en ningún lado, aunque lo sea), se usa la categoría del
// producto como segundo intento — mejor un emoji genérico pero correcto
// del rubro, que la caja 📦 por defecto.
const EMOJI_POR_CATEGORIA: Record<string, string> = {
  "Lácteos": "🥛", "Carnes": "🥩", "Verduras": "🥦", "Frutas": "🍎",
  "Panadería": "🍞", "Bebidas": "🥤", "Abarrotes": "🛒", "Limpieza": "🧴",
  "Accesorios": "🧰", "Otros": "📦",
}

// Exige que la palabra clave empiece en un borde de palabra (justo después
// de un espacio) — un simple "texto.includes(clave)" hacía calzar "te "
// dentro de "desodora[te ]" (emoji de té para un desodorante) o "sal "
// dentro de "univer[sal ]" (emoji de sal para cualquier cosa "universal").
// El lado derecho de la clave queda sin exigir borde a propósito: varias
// (ej. "queso", "manzana") dependen de calzar también como prefijo de su
// plural ("quesos", "manzanas").
function contieneComoPalabra(texto: string, clave: string): boolean {
  let desde = 0
  while (true) {
    const i = texto.indexOf(clave, desde)
    if (i === -1) return false
    if (/\s/.test(texto[i - 1] ?? "")) return true
    desde = i + 1
  }
}

export function getEmojiProducto(nombre: string, categoriaFallback?: string | null): string {
  const texto = ` ${nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")} `
  for (const [palabras, emoji] of REGLAS_EMOJI) {
    if (palabras.some(p => contieneComoPalabra(texto, p.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return emoji
  }
  if (categoriaFallback && EMOJI_POR_CATEGORIA[categoriaFallback]) return EMOJI_POR_CATEGORIA[categoriaFallback]
  return "📦"
}
