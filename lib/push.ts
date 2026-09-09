import webpush from "web-push"
import { db } from "@/lib/db"

let configured = false
function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys no configuradas — push deshabilitado")
    return
  }
  webpush.setVapidDetails("mailto:admin@nelyx.cl", publicKey, privateKey)
  configured = true
}

/** Envía una notificación push a todos los dispositivos registrados de un usuario. */
export async function enviarPushAUsuario(userId: string, payload: { titulo: string; mensaje: string; url?: string }) {
  ensureConfigured()
  if (!configured) return

  const subs = await db.pushSubscription.findMany({ where: { userId } })
  if (subs.length === 0) return

  const body = JSON.stringify({
    title: payload.titulo,
    body: payload.mensaje,
    url: payload.url ?? "/dashboard/resumen",
  })

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body
      )
    } catch (err: any) {
      // 404/410 = la suscripción ya no existe en el navegador del usuario → limpiar
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      }
    }
  }))
}
