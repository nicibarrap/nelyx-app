import { describe, it, expect } from "vitest"
import {
  calcularIntervaloPromedioDias, calcularDebioVolver, calcularSegmento,
  calcularUmbralValioso, sugerirLimiteCredito,
} from "@/lib/cliente-insights"

describe("calcularIntervaloPromedioDias", () => {
  it("sin datos suficientes (0 o 1 compra) no hay patrón", () => {
    expect(calcularIntervaloPromedioDias([])).toBeNull()
    expect(calcularIntervaloPromedioDias([new Date("2026-01-01")])).toBeNull()
  })

  it("promedia el intervalo entre compras consecutivas, sin importar el orden de entrada", () => {
    const fechas = [new Date("2026-01-21"), new Date("2026-01-01"), new Date("2026-01-11")]
    expect(calcularIntervaloPromedioDias(fechas)).toBe(10)
  })
})

describe("calcularDebioVolver", () => {
  it("un cliente inactivo nunca debería marcarse (ya está desactivado por otra razón)", () => {
    expect(calcularDebioVolver({ activo: false, compras: 5, intervaloPromedioDias: 10, diasSinCompra: 100 })).toBe(false)
  })

  it("con menos de 2 compras no hay patrón confiable", () => {
    expect(calcularDebioVolver({ activo: true, compras: 1, intervaloPromedioDias: null, diasSinCompra: 50 })).toBe(false)
  })

  it("compras muy seguidas (intervalo < 3 días) se ignoran para evitar falsos positivos", () => {
    expect(calcularDebioVolver({ activo: true, compras: 3, intervaloPromedioDias: 1, diasSinCompra: 10 })).toBe(false)
  })

  it("marca cuando ya pasó 1.5x su intervalo habitual sin comprar", () => {
    expect(calcularDebioVolver({ activo: true, compras: 4, intervaloPromedioDias: 10, diasSinCompra: 16 })).toBe(true)
    expect(calcularDebioVolver({ activo: true, compras: 4, intervaloPromedioDias: 10, diasSinCompra: 14 })).toBe(false)
  })
})

describe("calcularSegmento", () => {
  it("inactivo manda sobre cualquier otra señal", () => {
    expect(calcularSegmento({ activo: false, compras: 10, diasSinCompra: 5, intervaloPromedioDias: 5, esValiosoPorMonto: true })).toBe("inactivo")
  })

  it("0 o 1 compra es 'nuevo'", () => {
    expect(calcularSegmento({ activo: true, compras: 1, diasSinCompra: 2, intervaloPromedioDias: null, esValiosoPorMonto: false })).toBe("nuevo")
  })

  it("en riesgo tiene prioridad sobre 'valioso' — es lo más accionable", () => {
    expect(calcularSegmento({ activo: true, compras: 5, diasSinCompra: 30, intervaloPromedioDias: 10, esValiosoPorMonto: true })).toBe("en_riesgo")
  })

  it("compra dentro de su patrón habitual y con buen monto → valioso", () => {
    expect(calcularSegmento({ activo: true, compras: 5, diasSinCompra: 5, intervaloPromedioDias: 10, esValiosoPorMonto: true })).toBe("vip")
  })

  it("compra puntualmente según su patrón, sin ser de los más valiosos → frecuente", () => {
    expect(calcularSegmento({ activo: true, compras: 5, diasSinCompra: 5, intervaloPromedioDias: 10, esValiosoPorMonto: false })).toBe("frecuente")
  })
})

describe("calcularUmbralValioso", () => {
  it("sin clientes con historial, ningún monto alcanza el umbral", () => {
    expect(calcularUmbralValioso([])).toBe(Infinity)
  })

  it("toma el top 15% de la cartera (mínimo 1 cliente)", () => {
    const montos = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000) // 1000..20000
    // top 15% de 20 = 3 clientes → el umbral es el 3er más alto (18000)
    expect(calcularUmbralValioso(montos)).toBe(18000)
  })
})

describe("sugerirLimiteCredito", () => {
  it("sin historial suficiente no sugiere nada", () => {
    expect(sugerirLimiteCredito(50000, 1)).toBeNull()
    expect(sugerirLimiteCredito(0, 5)).toBeNull()
  })

  it("sugiere 3x el ticket promedio, redondeado a un número fácil de leer", () => {
    expect(sugerirLimiteCredito(32000, 4)).toBe(100000) // 96000 -> redondeado a 100000
  })

  it("nunca sugiere menos de $10.000", () => {
    expect(sugerirLimiteCredito(1000, 2)).toBe(10000)
  })
})
