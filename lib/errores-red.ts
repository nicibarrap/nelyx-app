// Ayuda para los flujos de escritura de más riesgo (venta, pagos): sin
// esto, una conexión que se corta a mitad de camino dejaba al usuario sin
// saber si su venta/pago realmente se guardó, viendo el mismo error
// genérico de siempre — lo que invita a reintentar y terminar con un
// registro duplicado (venta o pago contado dos veces).

/** Tiempo máximo de espera de una Server Action desde el cliente. El
 * servidor puede seguir procesando la solicitud original igual, pero el
 * usuario ya no debe quedar mirando un botón congelado indefinidamente. */
export async function conTimeout<T>(promesa: Promise<T>, ms = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("Tiempo de espera agotado")
      err.name = "AbortError"
      reject(err)
    }, ms)
  })
  try {
    return await Promise.race([promesa, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

/**
 * Traduce un error de una Server Action a un mensaje para el usuario,
 * distinguiendo dos casos muy distintos:
 * - Un error de negocio real, lanzado a propósito por la acción (ej.
 *   "Stock insuficiente") — su mensaje ya es correcto y específico.
 * - Un timeout (conTimeout de arriba) o un fallo de red/fetch (conexión
 *   cortada a mitad de camino) — en este caso NO SABEMOS si el servidor
 *   alcanzó a guardar el cambio antes de perder la respuesta, así que
 *   mostrar el error tal cual sería engañoso ("no se guardó" cuando en
 *   realidad sí pudo haberse guardado). Se avisa explícitamente de la
 *   duda en vez de invitar a reintentar a ciegas.
 */
export function mensajeErrorAccion(err: unknown, queSeHizo: string): string {
  const esAmbiguo =
    (err instanceof Error && err.name === "AbortError") ||
    err instanceof TypeError // fetch a nivel de red (no un throw de negocio del server action)

  if (esAmbiguo) {
    return `No se pudo confirmar si ${queSeHizo} — revisa antes de intentar de nuevo, puede que ya se haya guardado.`
  }
  return err instanceof Error ? err.message : `No se pudo completar: ${queSeHizo}.`
}
