import { db } from "@/lib/db"
import { del } from "@vercel/blob"
import * as Sentry from "@sentry/nextjs"

/** Borra los ARCHIVOS adjuntos (no el mensaje ni su texto) de conversaciones
 * de Soporte que llevan 7+ días marcadas "resuelta" — gateado a un solo día
 * de la semana (lunes) para que sea de verdad "semanal" sin importar cada
 * cuánto se invoque el cron que la llama desde afuera (no hay forma de saber
 * esa frecuencia desde acá). Idempotente de por sí: una vez que
 * adjuntoEliminadoAuto queda en true, la consulta deja de encontrar ese
 * mensaje, así que correr esto más de una vez el mismo lunes no reintenta
 * nada. Devuelve cuántos adjuntos se limpiaron. */
export async function limpiarAdjuntosSoporte(ahora: Date): Promise<number> {
  if (ahora.getDay() !== 1) return 0

  const haceUnaSemana = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000)
  const mensajes = await db.mensajeSoporte.findMany({
    where: {
      adjuntoUrl: { not: null },
      adjuntoEliminadoAuto: false,
      conversacion: { estado: "resuelta", fechaResuelta: { lte: haceUnaSemana } },
    },
    select: { id: true, adjuntoUrl: true },
    take: 200,
  })

  let limpiados = 0
  for (const m of mensajes) {
    try {
      if (m.adjuntoUrl) await del(m.adjuntoUrl)
      await db.mensajeSoporte.update({ where: { id: m.id }, data: { adjuntoUrl: null, adjuntoEliminadoAuto: true } })
      limpiados++
    } catch (err) {
      // Un archivo que falla al borrarse no debe trabar los demás — queda
      // con adjuntoEliminadoAuto todavía en false, así que se reintenta
      // solo el próximo lunes.
      console.error("Error limpiando adjunto de soporte:", m.id, err)
      Sentry.captureException(err, { extra: { mensajeId: m.id, etapa: "limpieza-adjuntos-soporte" } })
    }
  }
  return limpiados
}
