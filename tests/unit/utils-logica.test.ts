import { describe, it, expect, vi, afterEach } from "vitest"
import {
  calcularEstadoDeuda, calcularMetricas, calcularVariacionPct,
  prepararGrafico, prepararGraficoAnual, calcularFlujoAcumulado,
} from "@/lib/utils"

// calcularEstadoDeuda usa hoyEnChile() internamente — se fija la hora del
// sistema para que "hoy" sea determinístico en cada prueba.
function conHoy(fecha: string, fn: () => void) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(fecha))
  try { fn() } finally { vi.useRealTimers() }
}

describe("calcularEstadoDeuda", () => {
  afterEach(() => vi.useRealTimers())

  it("pagada:true manda sobre cualquier otro campo", () => {
    conHoy("2026-06-15T12:00:00Z", () => {
      expect(calcularEstadoDeuda({ pagada: true, monto: 1000, montoPagado: 0, fechaVence: new Date(2020, 0, 1) })).toBe("Pagada")
    })
  })

  it("sin fecha de vencimiento y sin pago, está 'Al día'", () => {
    conHoy("2026-06-15T12:00:00Z", () => {
      expect(calcularEstadoDeuda({ pagada: false, monto: 1000, montoPagado: 0, fechaVence: null })).toBe("Al día")
    })
  })

  it("con pago parcial y sin fecha de vencimiento, 'Parcialmente pagada'", () => {
    conHoy("2026-06-15T12:00:00Z", () => {
      expect(calcularEstadoDeuda({ pagada: false, monto: 1000, montoPagado: 400, fechaVence: null })).toBe("Parcialmente pagada")
    })
  })

  it("una fecha de vencimiento ya pasada es 'Vencida'", () => {
    conHoy("2026-06-15T12:00:00Z", () => {
      expect(calcularEstadoDeuda({ pagada: false, monto: 1000, montoPagado: 0, fechaVence: new Date(2026, 5, 10) })).toBe("Vencida")
    })
  })

  it("vence HOY cuenta como 'Próxima a vencer' (no 'Vencida', no ignorada)", () => {
    conHoy("2026-06-15T12:00:00Z", () => {
      expect(calcularEstadoDeuda({ pagada: false, monto: 1000, montoPagado: 0, fechaVence: new Date(2026, 5, 15) })).toBe("Próxima a vencer")
    })
  })

  it("vence dentro de 7 días es 'Próxima a vencer'; en 8 días ya no", () => {
    conHoy("2026-06-15T12:00:00Z", () => {
      expect(calcularEstadoDeuda({ pagada: false, monto: 1000, montoPagado: 0, fechaVence: new Date(2026, 5, 22) })).toBe("Próxima a vencer")
      expect(calcularEstadoDeuda({ pagada: false, monto: 1000, montoPagado: 0, fechaVence: new Date(2026, 5, 23) })).toBe("Al día")
    })
  })

  it("usa montoTotal (si existe) en vez de monto para decidir 'Parcialmente pagada'", () => {
    conHoy("2026-06-15T12:00:00Z", () => {
      // montoPagado (900) cubre el capital (monto=1000)... pero no el total real con intereses (1200).
      expect(calcularEstadoDeuda({ pagada: false, monto: 1000, montoTotal: 1200, montoPagado: 900, fechaVence: null })).toBe("Parcialmente pagada")
    })
  })
})

describe("calcularMetricas", () => {
  const movimientos = [
    { tipo: "VENTA", monto: 1000 },
    { tipo: "VENTA", monto: 500 },
    { tipo: "INGRESO_EXTRA", monto: 200 },
    { tipo: "GASTO", monto: 300 },
    { tipo: "COSTO_FIJO", monto: 150 },
    { tipo: "RETIRO", monto: 100 },
  ]

  it("totalVentas solo cuenta VENTA (no INGRESO_EXTRA)", () => {
    expect(calcularMetricas(movimientos, 0).totalVentas).toBe(1500)
  })

  it("totalIngresos suma VENTA + INGRESO_EXTRA", () => {
    expect(calcularMetricas(movimientos, 0).totalIngresos).toBe(1700)
  })

  it("totalGastos incluye RETIRO (no solo GASTO/COSTO_FIJO) — mismo criterio en toda la plataforma", () => {
    expect(calcularMetricas(movimientos, 0).totalGastos).toBe(300 + 150 + 100)
  })

  it("utilidadNeta = totalIngresos - totalGastos", () => {
    const m = calcularMetricas(movimientos, 0)
    expect(m.utilidadNeta).toBe(m.totalIngresos - m.totalGastos)
  })

  it("cantidadVentas cuenta transacciones, no unidades ni monto", () => {
    expect(calcularMetricas(movimientos, 0).cantidadVentas).toBe(2)
  })

  it("pasa deudasPendientes tal cual, sin recalcularlo", () => {
    expect(calcularMetricas(movimientos, 12345).deudasPendientes).toBe(12345)
  })
})

describe("calcularVariacionPct", () => {
  it("anterior 0 y actual positivo da 100% (no división por cero)", () => {
    expect(calcularVariacionPct(500, 0)).toBe(100)
  })

  it("anterior 0 y actual 0 da 0%", () => {
    expect(calcularVariacionPct(0, 0)).toBe(0)
  })

  it("crecimiento normal", () => {
    expect(calcularVariacionPct(150, 100)).toBe(50)
  })

  it("caída normal", () => {
    expect(calcularVariacionPct(50, 100)).toBe(-50)
  })

  it("usa el valor absoluto del anterior como base, incluso si es negativo", () => {
    // de -100 a -50: mejoró, debería ser positivo, no negativo
    expect(calcularVariacionPct(-50, -100)).toBe(50)
  })
})

describe("prepararGrafico", () => {
  it("genera una entrada por cada día del mes, incluso sin movimientos", () => {
    const resultado = prepararGrafico([], 2026, 2) // febrero 2026, 28 días
    expect(resultado).toHaveLength(28)
    expect(resultado[0].ventas).toBe(0)
  })

  it("agrupa cada movimiento en el día correcto y cuenta RETIRO como gasto", () => {
    const movimientos = [
      { tipo: "VENTA", monto: 1000, fecha: new Date(2026, 5, 10) },
      { tipo: "RETIRO", monto: 200, fecha: new Date(2026, 5, 10) },
      { tipo: "VENTA", monto: 300, fecha: new Date(2026, 5, 11) },
    ]
    const resultado = prepararGrafico(movimientos, 2026, 6)
    const dia10 = resultado.find(d => d.dia === "10")!
    const dia11 = resultado.find(d => d.dia === "11")!
    expect(dia10.ventas).toBe(1000)
    expect(dia10.gastos).toBe(200)
    expect(dia10.neto).toBe(800)
    expect(dia11.ventas).toBe(300)
  })
})

describe("prepararGraficoAnual", () => {
  it("siempre devuelve los 12 meses, aunque estén en $0", () => {
    expect(prepararGraficoAnual([], 2026)).toHaveLength(12)
  })

  it("agrupa cada movimiento en su mes correspondiente", () => {
    const movimientos = [
      { tipo: "VENTA", monto: 1000, fecha: new Date(2026, 0, 5) },
      { tipo: "GASTO", monto: 400, fecha: new Date(2026, 0, 20) },
      { tipo: "VENTA", monto: 2000, fecha: new Date(2026, 5, 1) },
    ]
    const resultado = prepararGraficoAnual(movimientos, 2026)
    expect(resultado[0].ventas).toBe(1000) // enero
    expect(resultado[0].gastos).toBe(400)
    expect(resultado[5].ventas).toBe(2000) // junio
    expect(resultado[0].mesCompleto).toBe("Enero")
  })
})

describe("calcularFlujoAcumulado", () => {
  it("acumula ingresos, gastos y el neto día a día", () => {
    const datos = [
      { dia: "01", ventas: 1000, gastos: 200 },
      { dia: "02", ventas: 500, gastos: 100 },
      { dia: "03", ventas: 0, gastos: 300 },
    ]
    const resultado = calcularFlujoAcumulado(datos)
    expect(resultado[0].acumulado).toBe(800)
    expect(resultado[1].acumulado).toBe(1200) // 800 + (500-100)
    expect(resultado[2].acumulado).toBe(900) // 1200 + (0-300)
    expect(resultado[2].ingresosAcum).toBe(1500)
    expect(resultado[2].gastosAcum).toBe(600)
  })

  it("la variación de cada día es el cambio respecto al acumulado anterior", () => {
    const datos = [{ dia: "01", ventas: 100, gastos: 0 }, { dia: "02", ventas: 0, gastos: 50 }]
    const resultado = calcularFlujoAcumulado(datos)
    expect(resultado[0].variacion).toBe(100)
    expect(resultado[1].variacion).toBe(-50)
  })
})
