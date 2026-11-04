// ══════════════════════════════════════════════════════════════════════
// Lógica pura (sin acceso a base de datos) para saber cuándo corresponde
// un costo fijo recurrente en un mes dado — un único lugar de referencia
// usado por el cálculo de estado en pantalla, la generación automática
// mensual y el cron de notificaciones, para que las tres nunca puedan
// desincronizarse entre sí.
// ══════════════════════════════════════════════════════════════════════

/** Frecuencias soportadas hoy — todas caben en el modelo actual de
 * GeneracionCosto (a lo más una ocurrencia por mes). Semanal/Quincenal
 * necesitarían varias ocurrencias dentro de un mismo mes, lo que rompe
 * `@@unique([costoFijoId, mes, anio])` y afecta a Resumen/Alertas/Reportes
 * a la vez — queda deliberadamente fuera hasta un cambio aparte. */
export type FrecuenciaCosto = "mensual" | "trimestral" | "anual"

/** El día del mes en que cae la ocurrencia de este costo, ajustado si el
 * mes es más corto que el día de inicio (ej. inicio el 31, en febrero cae
 * el 28 o 29). Independiente de la frecuencia: cuando el costo sí aplica
 * ese mes (ver esAplicableEnMes), cae siempre en este día. */
export function diaOcurrenciaEnMes(fechaInicio: Date, mes: number, anio: number): number {
  const diasDelMes = new Date(anio, mes, 0).getDate()
  return Math.min(fechaInicio.getDate(), diasDelMes)
}

/** La fecha exacta (a nivel de día, sin hora) en que ocurre este costo
 * dentro del mes/año dados. */
export function fechaOcurrenciaEnMes(fechaInicio: Date, mes: number, anio: number): Date {
  return new Date(anio, mes - 1, diaOcurrenciaEnMes(fechaInicio, mes, anio))
}

/** Cuántos meses de diferencia hay entre el mes de inicio y el mes
 * consultado (puede dar negativo si el mes consultado es anterior). */
function mesesDesdeInicio(fechaInicio: Date, mes: number, anio: number): number {
  return (anio - fechaInicio.getFullYear()) * 12 + (mes - 1 - fechaInicio.getMonth())
}

/** ¿Le toca ciclo a esta frecuencia en este mes? Resuelve solo el patrón
 * de recurrencia (cada cuántos meses) — esAplicableEnMes es quien además
 * aplica los bordes de fechaInicio/fechaTermino a nivel de día. */
function aplicaCicloFrecuencia(fechaInicio: Date, frecuencia: FrecuenciaCosto, mes: number, anio: number): boolean {
  const offset = mesesDesdeInicio(fechaInicio, mes, anio)
  if (offset < 0) return false
  if (frecuencia === "trimestral") return offset % 3 === 0
  if (frecuencia === "anual") return offset % 12 === 0
  return true // mensual
}

/**
 * ¿Corresponde este costo recurrente en el mes/año dados? A nivel de DÍA,
 * no solo de mes/año — un costo que termina el 5 de septiembre, con día de
 * cobro el 20, ya no aplica en septiembre aunque el inicio, el término y
 * "hoy" caigan todos en el mismo mes. Antes, un chequeo que solo miraba
 * mes/año lo seguía contando como "pendiente" (y sumándolo al total del
 * mes) semanas después de que en realidad hubiera terminado.
 *
 * `frecuencia` es opcional (default "mensual") para no romper los
 * llamadores existentes — pero cualquier costo trimestral/anual real
 * necesita pasarla explícitamente o este chequeo lo trata como mensual.
 */
export function esAplicableEnMes(fechaInicio: Date, fechaTermino: Date | null, mes: number, anio: number, frecuencia: FrecuenciaCosto = "mensual"): boolean {
  if (!aplicaCicloFrecuencia(fechaInicio, frecuencia, mes, anio)) return false
  const fechaEsteMes = fechaOcurrenciaEnMes(fechaInicio, mes, anio)
  const fechaInicioNormalizada = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), fechaInicio.getDate())
  if (fechaEsteMes < fechaInicioNormalizada) return false
  if (fechaTermino && fechaEsteMes > fechaTermino) return false
  return true
}
