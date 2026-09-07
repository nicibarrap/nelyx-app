// Vercel ejecuta las funciones serverless en UTC, no en la hora de Chile.
// Cualquier `new Date()` usado en un Server Component para saber "qué día es
// hoy" (para el usuario, no para timestamps absolutos) queda desalineado
// durante la noche en Chile, mostrando el día/mes siguiente antes de tiempo.
//
// hoyEnChile() devuelve un Date cuyos getters LOCALES (getFullYear, getMonth,
// getDate, getDay, getHours...) devuelven los valores correctos de Chile,
// sin necesidad de pasar `timeZone` en cada .toLocaleDateString() posterior.
// No usar el valor devuelto para guardar en base de datos como timestamp
// absoluto — es un "reloj disfrazado", solo sirve para lectura de
// año/mes/día/hora locales de Chile.

export const TZ_CHILE = "America/Santiago"

export function hoyEnChile(): Date {
  const ahora = new Date()
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_CHILE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(ahora)
  const get = (t: string) => partes.find(p => p.type === t)?.value ?? "0"
  return new Date(
    Number(get("year")), Number(get("month")) - 1, Number(get("day")),
    Number(get("hour")) % 24, Number(get("minute")), Number(get("second"))
  )
}

/** Diferencia en días de calendario (Chile) entre dos fechas, ignorando la hora. */
export function diasEntreChile(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const db_ = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((db_ - da) / 86400000)
}
