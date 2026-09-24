// ══════════════════════════════════════════════════════════════════════
// Lógica pura (sin acceso a base de datos) para saber cuándo corresponde
// un costo fijo recurrente en un mes dado — un único lugar de referencia
// usado por el cálculo de estado en pantalla, la generación automática
// mensual y el cron de notificaciones, para que las tres nunca puedan
// desincronizarse entre sí.
// ══════════════════════════════════════════════════════════════════════

/** El día del mes en que cae la ocurrencia de este costo, ajustado si el
 * mes es más corto que el día de inicio (ej. inicio el 31, en febrero cae
 * el 28 o 29). */
export function diaOcurrenciaEnMes(fechaInicio: Date, mes: number, anio: number): number {
  const diasDelMes = new Date(anio, mes, 0).getDate()
  return Math.min(fechaInicio.getDate(), diasDelMes)
}

/** La fecha exacta (a nivel de día, sin hora) en que ocurre este costo
 * dentro del mes/año dados. */
export function fechaOcurrenciaEnMes(fechaInicio: Date, mes: number, anio: number): Date {
  return new Date(anio, mes - 1, diaOcurrenciaEnMes(fechaInicio, mes, anio))
}

/**
 * ¿Corresponde este costo recurrente en el mes/año dados? A nivel de DÍA,
 * no solo de mes/año — un costo que termina el 5 de septiembre, con día de
 * cobro el 20, ya no aplica en septiembre aunque el inicio, el término y
 * "hoy" caigan todos en el mismo mes. Antes, un chequeo que solo miraba
 * mes/año lo seguía contando como "pendiente" (y sumándolo al total del
 * mes) semanas después de que en realidad hubiera terminado.
 */
export function esAplicableEnMes(fechaInicio: Date, fechaTermino: Date | null, mes: number, anio: number): boolean {
  const fechaEsteMes = fechaOcurrenciaEnMes(fechaInicio, mes, anio)
  const fechaInicioNormalizada = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), fechaInicio.getDate())
  if (fechaEsteMes < fechaInicioNormalizada) return false
  if (fechaTermino && fechaEsteMes > fechaTermino) return false
  return true
}
