import * as Sentry from "@sentry/nextjs"

// Errores del navegador (componentes React, JS del cliente). La clave
// pública SIEMPRE va con NEXT_PUBLIC_ — Sentry está diseñado para que
// este valor sea visible en el navegador, no es un secreto.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
})

// Requerido por el SDK para registrar los cambios de página del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
