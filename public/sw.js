const SHELL_CACHE = 'nelyx-shell-v2'
const ASSET_CACHE = 'nelyx-assets-v2'
const OFFLINE_URL = '/dashboard/resumen'

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      cache.addAll(['/', '/dashboard/resumen'])
    ).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== ASSET_CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Los archivos de build de Next (/_next/static/...) tienen el hash del
// contenido en el nombre — el mismo path SIEMPRE es el mismo contenido,
// nunca cambia. Por eso cache-first es seguro acá (no hay riesgo de
// mostrar una versión vieja) y es lo que hace que una pantalla ya
// visitada una vez cargue al instante después, sin esperar a la red —
// que es justo lo que falla con internet lento: el módulo (chunk .js) de
// una ruta que no se había visitado todavía no llega a tiempo.
function esAssetEstatico(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json'
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)

  if (esAssetEstatico(url)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached
        return fetch(e.request).then(res => {
          // clone() tiene que llamarse acá, sincrónico, apenas llega la
          // respuesta — si se llama dentro de un .then() posterior (ej.
          // después de caches.open()), el body de "res" ya puede estar
          // en uso entregándose a la página y clone() tira "Response body
          // is already used", así que nunca se guardaba nada en el caché.
          if (res.ok) {
            const resClone = res.clone()
            e.waitUntil(caches.open(ASSET_CACHE).then(c => c.put(e.request, resClone)))
          }
          return res
        }).catch(() => cached)
      })
    )
    return
  }

  // El reemplazo por OFFLINE_URL solo tiene sentido para una navegación de
  // página — aplicado a CUALQUIER GET (como antes), un chunk .js/.css que
  // falla sin conexión terminaba sirviendo el HTML de Resumen en su lugar,
  // lo que el navegador no puede ejecutar como script y producía el mismo
  // error ("Cannot read properties of undefined") que el recargador
  // automático de app/layout.tsx existe para arreglar. Ahora un asset no
  // navegacional simplemente falla (comportamiento normal sin red) en vez
  // de responder con contenido del tipo equivocado.
  if (e.request.mode !== 'navigate') return
  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then(r => r || caches.match(OFFLINE_URL))
    )
  )
})

// ── Push notifications ──────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Nelyx', body: 'Tienes una notificación nueva.', url: '/dashboard/resumen' }
  try { data = { ...data, ...e.data.json() } } catch (err) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
      tag: data.url,
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/dashboard/resumen'
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clientsArr => {
      const existing = clientsArr.find(c => c.url.includes(url))
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    })
  )
})
