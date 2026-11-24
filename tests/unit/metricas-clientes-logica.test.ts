import { describe, it, expect } from "vitest"
import { calcularMetricasClientes } from "@/lib/metricas-clientes"

function cliente(overrides: Partial<Parameters<typeof calcularMetricasClientes>[0][number]> = {}) {
  return {
    estado: "al_dia",
    esPrueba: false,
    precioPlan: 20000,
    planMeses: 1,
    cobroPendiente: null,
    ...overrides,
  }
}

describe("calcularMetricasClientes — cuentas de prueba no tergiversan el dinero", () => {
  it("el MRR suma solo clientes reales, no cuentas de prueba", () => {
    const m = calcularMetricasClientes([
      cliente({ precioPlan: 20000 }),
      cliente({ precioPlan: 10000, esPrueba: true }),
    ])
    expect(m.mrr).toBe(20000)
  })

  it("el monto pendiente excluye cobros pendientes/vencidos de cuentas de prueba", () => {
    const m = calcularMetricasClientes([
      cliente({ estado: "pendiente", cobroPendiente: { monto: 20000 } }),
      cliente({ estado: "vencido", cobroPendiente: { monto: 15000 }, esPrueba: true }),
    ])
    expect(m.montoPendiente).toBe(20000)
  })

  it("una cuenta de prueba sigue contando en los totales/counts por estado (sigue visible en el panel)", () => {
    const m = calcularMetricasClientes([
      cliente({ estado: "al_dia", esPrueba: true }),
      cliente({ estado: "al_dia" }),
    ])
    expect(m.activos).toBe(2)
    expect(m.total).toBe(2)
  })

  it("el MRR normaliza por la recurrencia del plan (ej. trimestral / 3)", () => {
    const m = calcularMetricasClientes([
      cliente({ precioPlan: 60000, planMeses: 3 }),
    ])
    expect(m.mrr).toBe(20000)
  })

  it("sin ninguna cuenta de prueba, el comportamiento es el mismo que antes", () => {
    const m = calcularMetricasClientes([
      cliente({ estado: "al_dia", precioPlan: 20000 }),
      cliente({ estado: "pendiente", precioPlan: 10000, cobroPendiente: { monto: 10000 } }),
      cliente({ estado: "vencido", precioPlan: 10000, cobroPendiente: { monto: 10000 } }),
    ])
    expect(m.mrr).toBe(40000)
    expect(m.montoPendiente).toBe(20000)
    expect(m.pagosPendientes).toBe(2)
  })
})
