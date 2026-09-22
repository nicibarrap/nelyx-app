"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"
import NextError from "next/error"

// Red de seguridad final: si un error de React logra escapar hasta acá
// (ni siquiera el layout raíz pudo renderizar), se reporta a Sentry antes
// de mostrar la página de error genérica de Next. Sin DSN configurado,
// Sentry simplemente no envía nada — no cambia lo que ve el usuario.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
