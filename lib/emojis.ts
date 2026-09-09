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

export function getEmojiProducto(nombre: string, categoriaFallback?: string | null): string {
  const texto = ` ${nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")} `
  for (const [palabras, emoji] of REGLAS_EMOJI) {
    if (palabras.some(p => texto.includes(p.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return emoji
  }
  if (categoriaFallback && EMOJI_POR_CATEGORIA[categoriaFallback]) return EMOJI_POR_CATEGORIA[categoriaFallback]
  return "📦"
}
