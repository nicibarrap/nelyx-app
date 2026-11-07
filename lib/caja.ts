// Arqueo de caja — lógica pura (sin DB) para poder testearla sin levantar
// Postgres. caja-acciones.ts hace las consultas y le pasa acá solo lo que
// necesita calcular.

// Mismo valor que usan los selectores de método de pago ya existentes
// (ventas, cuentas por cobrar) — "la plata está físicamente en la caja".
// Cualquier otro método (Tarjeta, Transferencia, Débito, Crédito, Cheque,
// Pendiente/crédito, etc.) no pasa por la caja física y no participa de
// este cálculo.
export const METODO_PAGO_EFECTIVO = "Efectivo"

// Mismos grupos que ya usa lib/utils.ts (calcularMetricas) para
// Ingresos/Disponible — DEVOLUCION ya viene con monto negativo (ver
// comentario en acciones.ts → registrarCambioProducto), así que sumar sus
// montos sin más resta exactamente lo que la venta original había sumado.
const TIPOS_INGRESO_CAJA = ["VENTA", "INGRESO_EXTRA", "DEVOLUCION"]
const TIPOS_EGRESO_CAJA = ["GASTO", "COSTO_FIJO", "RETIRO"]

export interface MovimientoParaCaja { tipo: string; monto: number }

/** Cuánto efectivo debería haber en la caja ahora: lo que había al abrirla,
 * más lo que entró y salió en efectivo desde entonces. Los movimientos que
 * se pasan ya deben venir filtrados por metodoPago === "Efectivo" y por el
 * rango de tiempo del turno (eso lo hace caja-acciones.ts, no esta
 * función) — no se filtra nada acá adentro. */
export function calcularMontoEsperado(montoApertura: number, movimientosEfectivo: MovimientoParaCaja[]): number {
  let neto = 0
  for (const m of movimientosEfectivo) {
    if (TIPOS_INGRESO_CAJA.includes(m.tipo)) neto += m.monto
    else if (TIPOS_EGRESO_CAJA.includes(m.tipo)) neto -= m.monto
  }
  return montoApertura + neto
}

/** contado - esperado: positivo = sobró plata, negativo = faltó. */
export function calcularDiferencia(montoContado: number, montoEsperado: number): number {
  return montoContado - montoEsperado
}
