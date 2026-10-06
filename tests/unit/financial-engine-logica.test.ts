import { describe, it, expect } from "vitest"
import {
  costoPromedioPonderado, calcularUtilidadVenta, calcularMargenPorcentual,
  calcularValorInventario, clasificarMargenVenta, MARGEN_BAJO_UMBRAL,
} from "@/lib/financial-engine"

// "Única fuente oficial de cálculos financieros de NELYX" (comentario del
// propio archivo) — ningún otro lugar debería recalcular margen/utilidad
// por su cuenta. El caso de calcularUtilidadVenta con pérdida está acá
// porque fue justo el tipo de número que, en Reportes, se mostraba
// enmascarado con Math.abs() como si fuera una utilidad positiva (PR #80).

describe("costoPromedioPonderado", () => {
  it("pondera el costo nuevo contra el stock que ya había (ejemplo del propio archivo)", () => {
    const resultado = costoPromedioPonderado(30, 166.67, 30, 190)
    expect(resultado).toBeCloseTo(178.33, 1)
  })

  it("sin stock previo, el costo pasa a ser directamente el nuevo", () => {
    expect(costoPromedioPonderado(0, 0, 10, 500)).toBe(500)
  })

  it("si el stock total queda en 0 o negativo, devuelve el costo nuevo (evita dividir por 0)", () => {
    expect(costoPromedioPonderado(-5, 100, 5, 200)).toBe(200)
  })
})

describe("calcularUtilidadVenta", () => {
  it("calcula costo, utilidad y margen de una venta normal", () => {
    const r = calcularUtilidadVenta(1000, 600, 1)
    expect(r.costo).toBe(600)
    expect(r.utilidad).toBe(400)
    expect(r.margen).toBe(40)
  })

  it("multiplica el costo unitario por la cantidad", () => {
    const r = calcularUtilidadVenta(3000, 600, 3)
    expect(r.costo).toBe(1800)
    expect(r.utilidad).toBe(1200)
  })

  it("una venta con pérdida da utilidad y margen NEGATIVOS, sin enmascarar el signo", () => {
    const r = calcularUtilidadVenta(100, 150, 1)
    expect(r.costo).toBe(150)
    expect(r.utilidad).toBe(-50)
    expect(r.margen).toBe(-50)
  })

  it("ingreso 0 no divide por cero — el margen queda null", () => {
    const r = calcularUtilidadVenta(0, 100, 1)
    expect(r.margen).toBeNull()
  })
})

describe("calcularMargenPorcentual", () => {
  it("sin precio o sin costo, no hay margen calculable (null)", () => {
    expect(calcularMargenPorcentual(null, 100)).toBeNull()
    expect(calcularMargenPorcentual(0, 100)).toBeNull()
    expect(calcularMargenPorcentual(100, null)).toBeNull()
    expect(calcularMargenPorcentual(100, undefined)).toBeNull()
  })

  it("calcula ganancia y margen normalmente", () => {
    const r = calcularMargenPorcentual(1000, 700)
    expect(r?.ganancia).toBe(300)
    expect(r?.margen).toBe(30)
  })

  it("costo 0 es válido (100% de margen), a diferencia de costo null", () => {
    const r = calcularMargenPorcentual(500, 0)
    expect(r?.ganancia).toBe(500)
    expect(r?.margen).toBe(100)
  })
})

describe("calcularValorInventario", () => {
  it("suma costo y venta potencial de todos los items", () => {
    const r = calcularValorInventario([
      { stock: 10, costo: 100, precio: 150 },
      { stock: 5, costo: 200, precio: 300 },
    ])
    expect(r.valorCosto).toBe(10 * 100 + 5 * 200)
    expect(r.valorVentaPotencial).toBe(10 * 150 + 5 * 300)
    expect(r.utilidadPotencial).toBe(r.valorVentaPotencial - r.valorCosto)
  })

  it("items sin costo/precio cargado cuentan como 0, no rompen el cálculo", () => {
    const r = calcularValorInventario([{ stock: 10, costo: null, precio: null }])
    expect(r.valorCosto).toBe(0)
    expect(r.valorVentaPotencial).toBe(0)
    expect(r.margenPotencial).toBeNull()
  })

  it("inventario vacío no divide por cero", () => {
    const r = calcularValorInventario([])
    expect(r.margenPotencial).toBeNull()
  })
})

describe("clasificarMargenVenta", () => {
  it("sin margen calculable, no hay clasificación", () => {
    expect(clasificarMargenVenta(null)).toBeNull()
  })

  it("margen negativo se clasifica como 'negativo'", () => {
    expect(clasificarMargenVenta(-0.01)).toBe("negativo")
    expect(clasificarMargenVenta(-50)).toBe("negativo")
  })

  it(`margen positivo pero bajo el umbral (${MARGEN_BAJO_UMBRAL}%) se clasifica como 'bajo'`, () => {
    expect(clasificarMargenVenta(0)).toBe("bajo")
    expect(clasificarMargenVenta(MARGEN_BAJO_UMBRAL - 0.01)).toBe("bajo")
  })

  it("margen igual o sobre el umbral es 'normal'", () => {
    expect(clasificarMargenVenta(MARGEN_BAJO_UMBRAL)).toBe("normal")
    expect(clasificarMargenVenta(50)).toBe("normal")
  })
})
