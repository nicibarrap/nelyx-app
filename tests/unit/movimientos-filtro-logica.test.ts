import { describe, it, expect } from "vitest"
import { construirWhereMovimientos } from "@/lib/movimientos-filtro"
import { FILTRO_DUENO } from "@/lib/movimientos-filtro-sentinel"

const base = { userId: "u1", mes: 11, anio: 2026 }

describe("construirWhereMovimientos — filtro realizadoPor", () => {
  it("sin realizadoPor no toca realizadoPorNombre", () => {
    const where = construirWhereMovimientos(base)
    expect(where.realizadoPorNombre).toBeUndefined()
  })

  it("realizadoPor con un nombre real filtra por ese nombre exacto", () => {
    const where = construirWhereMovimientos({ ...base, realizadoPor: "Danilo" })
    expect(where.realizadoPorNombre).toBe("Danilo")
  })

  it(`realizadoPor=${FILTRO_DUENO} (centinela) filtra por null — lo registró el dueño`, () => {
    const where = construirWhereMovimientos({ ...base, realizadoPor: FILTRO_DUENO })
    expect(where.realizadoPorNombre).toBeNull()
  })

  it("se combina sin pisar los demás filtros (tipo, metodoPago, búsqueda)", () => {
    const where = construirWhereMovimientos({ ...base, realizadoPor: "Danilo", tipo: "VENTA", metodoPago: "Efectivo", q: "pan" })
    expect(where.realizadoPorNombre).toBe("Danilo")
    expect(where.tipo).toBe("VENTA")
    expect(where.metodoPago).toBe("Efectivo")
    expect(where.OR).toBeDefined()
  })
})
