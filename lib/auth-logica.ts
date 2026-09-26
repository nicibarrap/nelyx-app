// Piezas puras (sin tocar la DB) de la lógica de bloqueo por intentos
// fallidos — separadas de lib/auth.ts para poder probarlas con tests
// rápidos y sin depender de Postgres ni de NextAuth. Usada tanto por el
// login principal (dueño, por contraseña) como por el login de empleados
// (por PIN), que comparten exactamente la misma regla: 5 intentos
// fallidos seguidos bloquean la cuenta 15 minutos.

const MAX_INTENTOS = 5
const MINUTOS_BLOQUEO = 15

export type EstadoBloqueo = { intentosFallidosPin: number; bloqueadoHastaPin: Date | null }

/** ¿Sigue bloqueada esta cuenta en este momento? */
export function estaBloqueado(estado: Pick<EstadoBloqueo, "bloqueadoHastaPin">, ahora: Date = new Date()): boolean {
  return !!estado.bloqueadoHastaPin && estado.bloqueadoHastaPin > ahora
}

/**
 * Dado el número de intentos fallidos ya acumulados, calcula el nuevo
 * estado tras UNO más. Al llegar a MAX_INTENTOS, bloquea y reinicia el
 * contador (para que, pasados los 15 minutos, la cuenta empiece de cero
 * en vez de quedar a un solo intento de bloquearse de nuevo).
 */
export function calcularNuevoEstadoTrasFallo(intentosFallidosActuales: number, ahora: Date = new Date()): EstadoBloqueo {
  const intentos = intentosFallidosActuales + 1
  const seBloquea = intentos >= MAX_INTENTOS
  return {
    intentosFallidosPin: seBloquea ? 0 : intentos,
    bloqueadoHastaPin: seBloquea ? new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60 * 1000) : null,
  }
}

/** Estado limpio tras un login correcto — sin intentos ni bloqueo pendiente. */
export const ESTADO_LIMPIO: EstadoBloqueo = { intentosFallidosPin: 0, bloqueadoHastaPin: null }

/** ¿Hace falta limpiar el estado en la DB, o ya estaba limpio? Evita un UPDATE innecesario en el camino feliz (login correcto de alguien que nunca falló). */
export function necesitaLimpiarEstado(estado: EstadoBloqueo): boolean {
  return estado.intentosFallidosPin > 0 || estado.bloqueadoHastaPin !== null
}

export function ipDeRequest(request: Request | undefined): string {
  const xff = request?.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return request?.headers.get("x-real-ip")?.trim() || "desconocida"
}

/** ¿Sigue siendo válido este token de "olvidé mi contraseña"? Un solo
 * uso (usedAt) y con expiración — misma idea que estaBloqueado, separada
 * para poder probarla sin tocar la DB. */
export function tokenResetValido(token: { expiresAt: Date; usedAt: Date | null }, ahora: Date = new Date()): boolean {
  return token.usedAt === null && token.expiresAt > ahora
}
