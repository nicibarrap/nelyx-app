import { describe, it, expect } from "vitest"
import { calcularMontoEsperado, calcularDiferencia, agruparVentasPorMetodo, formatearVentasPorMetodo } from "@/lib/caja"

describe("calcularMontoEsperado", () => {
  it("sin movimientos, el esperado es exactamente el monto de apertura", () => {
    expect(calcularMontoEsperado(10000, [])).toBe(10000)
  })

  it("suma ventas e ingresos extra, resta gastos/costos fijos/retiros", () => {
    const monto = calcularMontoEsperado(10000, [
      { tipo: "VENTA", monto: 5000 },
      { tipo: "INGRESO_EXTRA", monto: 2000 },
      { tipo: "GASTO", monto: 3000 },
      { tipo: "COSTO_FIJO", monto: 1000 },
      { tipo: "RETIRO", monto: 4000 },
    ])
    expect(monto).toBe(10000 + 5000 + 2000 - 3000 - 1000 - 4000)
  })

  it("una DEVOLUCION (monto ya negativo en el Movimiento real) se suma tal cual, restando lo que la venta original había sumado", () => {
    const monto = calcularMontoEsperado(0, [
      { tipo: "VENTA", monto: 8000 },
      { tipo: "DEVOLUCION", monto: -8000 },
    ])
    expect(monto).toBe(0)
  })

  it("ignora tipos que no son de caja (si llegaran a filtrarse mal aguas arriba, no rompe el cálculo)", () => {
    const monto = calcularMontoEsperado(1000, [{ tipo: "ALGO_DESCONOCIDO", monto: 99999 }])
    expect(monto).toBe(1000)
  })
})

describe("calcularDiferencia", () => {
  it("contado igual a esperado — cuadra exacto", () => {
    expect(calcularDiferencia(5000, 5000)).toBe(0)
  })

  it("contado mayor a esperado — positivo, sobró plata", () => {
    expect(calcularDiferencia(5500, 5000)).toBe(500)
  })

  it("contado menor a esperado — negativo, faltó plata", () => {
    expect(calcularDiferencia(4500, 5000)).toBe(-500)
  })
})

describe("agruparVentasPorMetodo", () => {
  it("suma ventas e ingresos agrupando por método, ordenado de mayor a menor", () => {
    const grupos = agruparVentasPorMetodo([
      { tipo: "VENTA", monto: 5000, metodoPago: "Efectivo" },
      { tipo: "VENTA", monto: 12000, metodoPago: "Débito" },
      { tipo: "VENTA", monto: 3000, metodoPago: "Efectivo" },
      { tipo: "INGRESO_EXTRA", monto: 2000, metodoPago: "Transferencia" },
    ])
    expect(grupos).toEqual([
      { metodo: "Débito", monto: 12000 },
      { metodo: "Efectivo", monto: 8000 },
      { metodo: "Transferencia", monto: 2000 },
    ])
  })

  it("ignora egresos (GASTO/COSTO_FIJO/RETIRO) — esto es solo lo vendido, no el neto de caja", () => {
    const grupos = agruparVentasPorMetodo([
      { tipo: "VENTA", monto: 5000, metodoPago: "Efectivo" },
      { tipo: "GASTO", monto: 1000, metodoPago: "Efectivo" },
    ])
    expect(grupos).toEqual([{ metodo: "Efectivo", monto: 5000 }])
  })

  it("agrupa movimientos sin método (legado) bajo \"Sin especificar\"", () => {
    const grupos = agruparVentasPorMetodo([{ tipo: "VENTA", monto: 1000, metodoPago: null }])
    expect(grupos).toEqual([{ metodo: "Sin especificar", monto: 1000 }])
  })

  it("sin movimientos, devuelve lista vacía", () => {
    expect(agruparVentasPorMetodo([])).toEqual([])
  })
})

describe("formatearVentasPorMetodo", () => {
  const formatearMonto = (n: number) => `$${n}`

  it("sin ventas, devuelve string vacío", () => {
    expect(formatearVentasPorMetodo([], formatearMonto)).toBe("")
  })

  it("une cada método con su monto formateado, separados por ·", () => {
    const texto = formatearVentasPorMetodo(
      [{ metodo: "Efectivo", monto: 5000 }, { metodo: "Débito", monto: 12000 }],
      formatearMonto
    )
    expect(texto).toBe("Efectivo $5000 · Débito $12000")
  })
})
