import { db } from "@/lib/db"
import { del } from "@vercel/blob"
import * as Sentry from "@sentry/nextjs"

/** Borra los ARCHIVOS de comprobantes de pago (no el registro del pago en
 * sí — monto, fecha y estado quedan para siempre en el historial) que ya
 * pasaron su fecha de vigencia de 5 días, sin importar si el pago terminó
 * confirmado, rechazado o nunca se revisó. A diferencia de
 * limpiarAdjuntosSoporte, no se gatea a un día de la semana: la vigencia es
 * por fecha exacta, no "semanal", así que corre cada vez que se invoca.
 * Idempotente: una vez que comprobanteUrl queda en null, la consulta deja
 * de encontrar ese pago. Devuelve cuántos comprobantes se limpiaron. */
export async function limpiarComprobantesPago(ahora: Date): Promise<number> {
  const pagos = await db.pagoNelyx.findMany({
    where: { comprobanteUrl: { not: null }, comprobanteExpiraEn: { lte: ahora } },
    select: { id: true, comprobanteUrl: true },
    take: 200,
  })

  let limpiados = 0
  for (const p of pagos) {
    try {
      if (p.comprobanteUrl) await del(p.comprobanteUrl)
      await db.pagoNelyx.update({ where: { id: p.id }, data: { comprobanteUrl: null } })
      limpiados++
    } catch (err) {
      // Un archivo que falla al borrarse no debe trabar los demás — queda
      // con comprobanteUrl todavía seteada, así que se reintenta la
      // próxima vez que corra el cron.
      console.error("Error limpiando comprobante de pago:", p.id, err)
      Sentry.captureException(err, { extra: { pagoId: p.id, etapa: "limpieza-comprobantes-pago" } })
    }
  }
  return limpiados
}
