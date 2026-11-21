import { describe, it, expect } from "vitest"
import { getEmojiProducto } from "@/lib/emojis"

// Regresión del hallazgo reportado por el usuario: escaneó un desodorante y
// la app le asignó el emoji de té (🍵). Causa: contieneComoPalabra antes
// era un simple texto.includes(clave), así que la clave "te " (de té)
// calzaba dentro de "desodora[te ]" — un substring, no una palabra.
describe("getEmojiProducto no confunde una palabra clave con un substring de otra palabra", () => {
  it("un desodorante no recibe el emoji de té (antes calzaba 'te ' dentro de 'desodorante')", () => {
    expect(getEmojiProducto("Desodorante Rexona")).not.toBe("🍵")
    expect(getEmojiProducto("Desodorante Rexona")).toBe("🧴")
  })

  it("un producto 'Universal' no recibe el emoji de sal (antes calzaba 'sal ' dentro de 'universal')", () => {
    expect(getEmojiProducto("Universal Studios Taza")).not.toBe("🧂")
  })

  it("un té real sigue recibiendo el emoji de té", () => {
    expect(getEmojiProducto("Té Verde")).toBe("🍵")
  })

  it("una sal real sigue recibiendo el emoji de sal", () => {
    expect(getEmojiProducto("Sal de mesa")).toBe("🧂")
  })

  it("los plurales siguen calzando como prefijo (comportamiento intencional)", () => {
    expect(getEmojiProducto("Manzanas Royal Gala")).toBe("🍎")
    expect(getEmojiProducto("Quesos laminados")).toBe("🧀")
  })

  it("'pan ' sigue sin calzar dentro de 'pantalón' (ya funcionaba, no debe regresionar)", () => {
    expect(getEmojiProducto("Pantalón jeans")).toBe("👖")
  })
})

// Regresión del hallazgo reportado por el usuario al escanear productos:
// "Soprole Gold Lúcuma y Nueces" (un yogurt) recibía el emoji de frutos
// secos (🥜) porque "nueces" calzaba antes de llegar a mirar la categoría.
describe("getEmojiProducto no deja que un sabor/ingrediente secundario le gane a la categoría", () => {
  it("un yogurt con nueces como sabor recibe el emoji de lácteo, no el de frutos secos", () => {
    expect(getEmojiProducto("Soprole Gold Lúcuma y Nueces", "Lácteos")).toBe("🥛")
  })

  it("sin categoría conocida, 'nueces' sigue sirviendo de última pista (producto real a base de frutos secos)", () => {
    expect(getEmojiProducto("Nueces confitadas", null)).toBe("🥜")
  })

  it("una marca láctea chilena sin la palabra 'leche'/'yogurt' en el nombre igual recibe el emoji correcto", () => {
    expect(getEmojiProducto("Soprole Gold Lúcuma y Nueces")).toBe("🥛")
    expect(getEmojiProducto("Colun Leche Entera Natural Caja")).toBe("🥛")
  })

  it("una marca de galletas chilena sin la palabra 'galleta' en el nombre igual recibe el emoji correcto", () => {
    expect(getEmojiProducto("Marco Polo Carioca")).toBe("🍪")
  })

  it("una jalea o mermelada recibe su propio emoji en vez del genérico", () => {
    expect(getEmojiProducto("Colun Jalea Frambuesa Postre")).toBe("🫙")
    expect(getEmojiProducto("Mermelada de Damasco")).toBe("🫙")
  })
})
