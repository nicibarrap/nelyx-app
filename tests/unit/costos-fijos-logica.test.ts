import { describe, it, expect } from "vitest"
import { diaOcurrenciaEnMes, fechaOcurrenciaEnMes, esAplicableEnMes } from "@/lib/costos-fijos"

// Única fuente de verdad para "¿corresponde este costo fijo este mes, y en
// qué día?" — compartida por /dashboard/costos-fijos, /dashboard/resumen,
// /dashboard/alertas y el cron de notificaciones. El bug original que
// motivó este archivo (PR #77): un costo que termina el 5 de septiembre
// con día de cobro el 20 seguía contando como vigente todo septiembre,
// porque el chequeo solo miraba mes/año, no el día exacto.

describe("diaOcurrenciaEnMes", () => {
  it("un día de cobro normal cae igual en cualquier mes", () => {
    const inicio = new Date(2026, 0, 15) // 15 de enero
    expect(diaOcurrenciaEnMes(inicio, 3, 2026)).toBe(15) // marzo también tiene día 15
  })

  it("un día de cobro 31 se ajusta al último día de un mes más corto", () => {
    const inicio = new Date(2026, 0, 31) // 31 de enero
    expect(diaOcurrenciaEnMes(inicio, 2, 2026)).toBe(28) // febrero 2026 (no bisiesto) tiene 28
    expect(diaOcurrenciaEnMes(inicio, 4, 2026)).toBe(30) // abril tiene 30
  })

  it("en el propio mes de inicio, el día es el mismo que fechaInicio", () => {
    const inicio = new Date(2026, 5, 20)
    expect(diaOcurrenciaEnMes(inicio, 6, 2026)).toBe(20)
  })
})

describe("fechaOcurrenciaEnMes", () => {
  it("devuelve la fecha exacta, ajustada si el mes es más corto", () => {
    const inicio = new Date(2026, 0, 31)
    const resultado = fechaOcurrenciaEnMes(inicio, 2, 2026)
    expect(resultado.getFullYear()).toBe(2026)
    expect(resultado.getMonth()).toBe(1) // febrero
    expect(resultado.getDate()).toBe(28)
  })
})

describe("esAplicableEnMes", () => {
  it("no aplica antes de haber empezado", () => {
    const inicio = new Date(2026, 5, 15) // empieza en junio
    expect(esAplicableEnMes(inicio, null, 5, 2026)).toBe(false) // mayo, antes
    expect(esAplicableEnMes(inicio, null, 6, 2026)).toBe(true) // junio, su propio mes
  })

  it("sin fecha de término, sigue aplicando indefinidamente hacia adelante", () => {
    const inicio = new Date(2025, 0, 1)
    expect(esAplicableEnMes(inicio, null, 12, 2030)).toBe(true)
  })

  it("el caso que motivó el fix: termina el día 5 de septiembre con día de cobro 20 — ya no aplica en septiembre", () => {
    const inicio = new Date(2025, 0, 20) // día de cobro: 20
    const termino = new Date(2026, 8, 5) // termina el 5 de septiembre 2026
    // La ocurrencia de septiembre cae el día 20, DESPUÉS del término (día 5) → ya no aplica.
    expect(esAplicableEnMes(inicio, termino, 9, 2026)).toBe(false)
    // Agosto: la ocurrencia (día 20) es anterior al término → sigue aplicando.
    expect(esAplicableEnMes(inicio, termino, 8, 2026)).toBe(true)
  })

  it("el mes exacto en que termina (mismo día) todavía aplica", () => {
    const inicio = new Date(2025, 0, 10)
    const termino = new Date(2026, 5, 10) // termina justo el día de cobro
    expect(esAplicableEnMes(inicio, termino, 6, 2026)).toBe(true)
  })

  it("el mes siguiente al término ya no aplica", () => {
    const inicio = new Date(2025, 0, 10)
    const termino = new Date(2026, 5, 10)
    expect(esAplicableEnMes(inicio, termino, 7, 2026)).toBe(false)
  })
})
