import * as Sentry from "@sentry/nextjs"

// Sin SENTRY_DSN configurado (todavía no existe la cuenta de Sentry), el
// SDK simplemente no envía nada — no hay ningún cambio de comportamiento
// para la app mientras tanto. Ver SENTRY_SETUP.md para activar esto.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  // No queremos que Sentry mismo genere ruido en los logs si no hay DSN.
  enabled: !!process.env.SENTRY_DSN,
})
