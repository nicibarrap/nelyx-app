import { describe, it, expect, vi, afterEach } from "vitest"
import { hoyEnChile, diasEntreChile } from "@/lib/timezone"

// hoyEnChile()/diasEntreChile() existen para evitar una clase de bug que
// apareció repetidas veces en las auditorías (Deudas, Alertas, Resumen,
// Reportes): comparar fechas usando el reloj UTC crudo del servidor marca
// cosas como "vencidas" o "generadas" antes de tiempo durante la noche en
// Chile. Estas pruebas no asumen a mano el offset de Chile (puede cambiar
// por horario de verano) — recalculan el valor esperado con la misma API
// de Intl que usa la función, así quedan correctas sin importar la regla
// vigente.

function partesChile(fechaUTC: Date) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(fechaUTC)
  const get = (t: string) => Number(partes.find(p => p.type === t)?.value ?? "0")
  return { anio: get("year"), mes: get("month") - 1, dia: get("day"), hora: get("hour") % 24, minuto: get("minute") }
}

describe("hoyEnChile", () => {
  afterEach(() => vi.useRealTimers())

  it("sus getters locales reflejan el año/mes/día/hora de Chile para el instante real, no el UTC del servidor", () => {
    // 15 de enero 2026, 02:00 UTC — de madrugada en UTC, pero probablemente
    // todavía "el día anterior" en Chile (UTC-3/UTC-4). No se asume el
    // offset exacto: se compara contra el mismo cálculo hecho con Intl.
    const instanteReal = new Date("2026-01-15T02:00:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(instanteReal)

    const resultado = hoyEnChile()
    const esperado = partesChile(instanteReal)

    expect(resultado.getFullYear()).toBe(esperado.anio)
    expect(resultado.getMonth()).toBe(esperado.mes)
    expect(resultado.getDate()).toBe(esperado.dia)
    expect(resultado.getHours()).toBe(esperado.hora)
    expect(resultado.getMinutes()).toBe(esperado.minuto)
  })

  it("funciona igual cruzando un límite de mes/año (31 dic → 1 ene)", () => {
    const instanteReal = new Date("2026-01-01T01:30:00.000Z")
    vi.useFakeTimers()
    vi.setSystemTime(instanteReal)

    const resultado = hoyEnChile()
    const esperado = partesChile(instanteReal)

    expect(resultado.getFullYear()).toBe(esperado.anio)
    expect(resultado.getMonth()).toBe(esperado.mes)
    expect(resultado.getDate()).toBe(esperado.dia)
  })
})

describe("diasEntreChile", () => {
  it("el mismo día de calendario da 0, sin importar la hora de cada una", () => {
    const a = new Date(2026, 5, 10, 23, 0)
    const b = new Date(2026, 5, 10, 1, 0)
    expect(diasEntreChile(a, b)).toBe(0)
  })

  it("un día después da 1; un día antes da -1", () => {
    const hoy = new Date(2026, 5, 10)
    expect(diasEntreChile(hoy, new Date(2026, 5, 11))).toBe(1)
    expect(diasEntreChile(hoy, new Date(2026, 5, 9))).toBe(-1)
  })

  it("cruza correctamente un límite de mes más corto (28/29 feb)", () => {
    const finFeb = new Date(2026, 1, 28) // 2026 no es bisiesto
    expect(diasEntreChile(finFeb, new Date(2026, 2, 1))).toBe(1)
  })

  it("cruza correctamente un límite de año", () => {
    const finAnio = new Date(2025, 11, 31)
    expect(diasEntreChile(finAnio, new Date(2026, 0, 1))).toBe(1)
  })

  it("funciona para diferencias grandes (no solo +-1 día)", () => {
    expect(diasEntreChile(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(364)
  })
})
