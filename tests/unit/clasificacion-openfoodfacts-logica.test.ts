import { describe, it, expect } from "vitest"
import { clasificarDesdeTags } from "@/lib/clasificacion-openfoodfacts"

describe("clasificarDesdeTags", () => {
  it("sin etiquetas, no sugiere nada", () => {
    expect(clasificarDesdeTags(undefined)).toEqual({ categoria: null, emoji: null })
    expect(clasificarDesdeTags([])).toEqual({ categoria: null, emoji: null })
  })

  it("reconoce una galleta por su etiqueta aunque el nombre no lo diga", () => {
    expect(clasificarDesdeTags(["en:snacks", "en:biscuits-and-cakes", "en:biscuits"]))
      .toEqual({ categoria: "Abarrotes", emoji: "🍪" })
  })

  it("distingue yogurt de queso aunque ambos sean 'Lácteos' para nosotros", () => {
    expect(clasificarDesdeTags(["en:dairies", "en:fermented-foods", "en:fermented-milk-products", "en:yogurts"]))
      .toEqual({ categoria: "Lácteos", emoji: "🥛" })
    expect(clasificarDesdeTags(["en:dairies", "en:cheeses"]))
      .toEqual({ categoria: "Lácteos", emoji: "🧀" })
  })

  it("reconoce una jalea/mermelada con su propio emoji", () => {
    expect(clasificarDesdeTags(["en:spreads", "en:sweet-spreads", "en:jams"]))
      .toEqual({ categoria: "Abarrotes", emoji: "🫙" })
  })

  it("una etiqueta no mapeada no rompe nada, solo no sugiere", () => {
    expect(clasificarDesdeTags(["en:some-unmapped-tag"])).toEqual({ categoria: null, emoji: null })
  })

  it("el prefijo de idioma de la etiqueta no importa (es: o en:, da igual)", () => {
    expect(clasificarDesdeTags(["es:galletas", "en:cookies"])).toEqual({ categoria: "Abarrotes", emoji: "🍪" })
  })
})
