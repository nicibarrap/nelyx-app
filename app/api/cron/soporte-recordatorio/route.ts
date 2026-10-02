import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { necesitaRecordatorio, MENSAJE_RECORDATORIO } from "@/lib/soporte-logica"
import * as Sentry from "@sentry/nextjs"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Mismo mecanismo de autorización que /api/cron/notificaciones — pensado
// para que lo dispare un cron externo (ej. cron-job.org) cada 5 minutos,
// independiente de la frecuencia del cron principal de notificaciones.
function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get("authorization")
  if (header === `Bearer ${secret}`) return true
  const url = new URL(req.url)
  return url.searchParams.get("secret") === secret
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    return await ejecutarCron()
  } catch (err) {
    console.error("Error en cron de recordatorio de soporte:", err)
    Sentry.captureException(err)
    return NextResponse.json({ ok: false, error: "Error interno al procesar recordatorios" }, { status: 500 })
  }
}

async function ejecutarCron() {
  // Solo hace falta mirar conversaciones abiertas donde el cliente escribió
  // último y todavía no se mandó el recordatorio para esa espera — el resto
  // (conversaciones ya respondidas o ya recordadas) ni se traen de la DB.
  const candidatas = await db.conversacionSoporte.findMany({
    where: { estado: "abierta", ultimoMensajeDe: "cliente", recordatorioEnviado: false },
    select: { id: true, ultimoMensajeAt: true, ultimoMensajeDe: true, recordatorioEnviado: true },
  })

  const ahora = new Date()
  const aRecordar = candidatas.filter(c => necesitaRecordatorio(c, ahora))

  // En tandas de 10 (mismo motivo que el cron principal de notificaciones):
  // si muchos negocios tienen un hilo abierto sin responder al mismo tiempo,
  // esto evita un estallido de escrituras concurrentes sin límite, y aísla
  // el fallo de una conversación del resto en vez de que un error sin
  // capturar corte toda la corrida a mitad de camino.
  let enviados = 0
  const TAMANO_LOTE = 10
  for (let i = 0; i < aRecordar.length; i += TAMANO_LOTE) {
    const lote = aRecordar.slice(i, i + TAMANO_LOTE)
    const resultados = await Promise.allSettled(lote.map(async (c) => {
      await db.mensajeSoporte.create({ data: { conversacionId: c.id, de: "sistema", contenido: MENSAJE_RECORDATORIO } })
      await db.conversacionSoporte.update({ where: { id: c.id }, data: { recordatorioEnviado: true } })
    }))
    for (const r of resultados) {
      if (r.status === "fulfilled") enviados++
      else { console.error("Error en recordatorio de soporte:", r.reason); Sentry.captureException(r.reason) }
    }
  }

  return NextResponse.json({ ok: true, recordatorios: enviados })
}
