# Activar Sentry (monitoreo de errores)

El código ya está listo — mientras no completes esto, la plataforma sigue funcionando
exactamente igual que ahora, solo sin avisos automáticos de errores. Nada se rompe si
no lo haces hoy.

## Qué es

Cuando algo falla en el servidor (una venta que no se pudo registrar por un error
inesperado, una consulta que falló, etc.), hoy ese error queda solo en los logs de
Vercel — nadie se entera a menos que un usuario se queje. Con Sentry, te llega un
aviso apenas pasa, con el detalle exacto de qué fue y dónde.

## Paso a paso

1. Ve a [sentry.io](https://sentry.io) y crea una cuenta gratis (el plan gratuito
   alcanza de sobra para este tamaño de plataforma).
2. Al crear el proyecto, elige **Next.js** como plataforma.
3. Sentry te va a mostrar un DSN (una URL larga que empieza con `https://...@...
   ingest.sentry.io/...`). Cópiala.
4. En Vercel, ve a tu proyecto → **Settings → Environment Variables** y agrega:
   - `SENTRY_DSN` → pega el DSN que copiaste
   - `NEXT_PUBLIC_SENTRY_DSN` → el mismo DSN, pegado de nuevo
5. Guarda y vuelve a desplegar (Vercel lo hace solo si tienes auto-deploy activado,
   o puedes forzarlo desde la pestaña Deployments → los tres puntos → Redeploy).

Con esos dos pasos ya está funcionando — vas a empezar a recibir errores en el
dashboard de Sentry apenas ocurra alguno.

## Opcional: nombres de archivo legibles en los errores

Sin este paso, Sentry igual te avisa de los errores, pero el detalle técnico
("stack trace") viene con el código ya comprimido, más difícil de leer. Si quieres
que aparezca legible:

1. En Sentry, ve a **Settings → Auth Tokens** y crea uno nuevo.
2. En Vercel, agrega estas tres variables:
   - `SENTRY_AUTH_TOKEN` → el token que creaste
   - `SENTRY_ORG` → el nombre de tu organización en Sentry (aparece en la URL)
   - `SENTRY_PROJECT` → el nombre del proyecto que creaste (ej. `nelyx-app`)
