// Lógica de suscripción push, compartida por el modal de permiso, el
// auto-reparador en segundo plano y el botón de diagnóstico en Configuración.

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export type ResultadoPush =
  | { ok: true }
  | { ok: false; motivo: "sin_soporte" | "sin_permiso" | "sin_vapid_key" | "sw_no_listo" | "error_suscripcion" | "error_guardado"; detalle?: string }

/**
 * Se asegura de que exista una suscripción push válida y guardada en el
 * servidor. A diferencia de la versión anterior, NUNCA falla en silencio:
 * siempre devuelve un resultado explícito que se puede mostrar al usuario.
 */
export async function asegurarSuscripcionPush(): Promise<ResultadoPush> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, motivo: "sin_soporte" }
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return { ok: false, motivo: "sin_permiso" }
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) {
    return { ok: false, motivo: "sin_vapid_key" }
  }

  let reg: ServiceWorkerRegistration
  try {
    reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ])
  } catch {
    return { ok: false, motivo: "sw_no_listo" }
  }

  let sub: PushSubscription | null
  try {
    sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }
  } catch (err: any) {
    return { ok: false, motivo: "error_suscripcion", detalle: err?.message }
  }

  try {
    const res = await fetch("/api/notificaciones/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
    if (!res.ok) return { ok: false, motivo: "error_guardado", detalle: `HTTP ${res.status}` }
  } catch (err: any) {
    return { ok: false, motivo: "error_guardado", detalle: err?.message }
  }

  return { ok: true }
}

export async function estadoActualPush(): Promise<{ permiso: string; suscrito: boolean; swActivo: boolean }> {
  const permiso = typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  let suscrito = false
  let swActivo = false
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      swActivo = !!reg?.active
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        suscrito = !!sub
      }
    }
  } catch {}
  return { permiso, suscrito, swActivo }
}
