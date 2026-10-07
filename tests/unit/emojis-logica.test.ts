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
