import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { necesitaRecordatorio, MENSAJE_RECORDATORIO } from "@/lib/soporte-logica"

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

  // Solo hace falta mirar conversaciones abiertas donde el cliente escribió
  // último y todavía no se mandó el recordatorio para esa espera — el resto
  // (conversaciones ya respondidas o ya recordadas) ni se traen de la DB.
  const candidatas = await db.conversacionSoporte.findMany({
    where: { estado: "abierta", ultimoMensajeDe: "cliente", recordatorioEnviado: false },
    select: { id: true, ultimoMensajeAt: true, ultimoMensajeDe: true, recordatorioEnviado: true },
  })

  const ahora = new Date()
  const aRecordar = candidatas.filter(c => necesitaRecordatorio(c, ahora))

  await Promise.all(aRecordar.map(async (c) => {
    await db.mensajeSoporte.create({ data: { conversacionId: c.id, de: "sistema", contenido: MENSAJE_RECORDATORIO } })
    await db.conversacionSoporte.update({ where: { id: c.id }, data: { recordatorioEnviado: true } })
  }))

  return NextResponse.json({ ok: true, recordatorios: aRecordar.length })
}
