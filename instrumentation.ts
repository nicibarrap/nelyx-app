// Next.js llama a este archivo automáticamente al arrancar. Acá se
// engancha Sentry para que capture errores no atrapados del servidor
// (Server Actions, rutas de API, render de páginas), no solo los que ya
// tienen try/catch explícito.
//
// Deliberadamente NO se instrumenta el runtime "edge" (donde corre
// middleware.ts) — el SDK de Sentry le agrega ~60kB al bundle de
// middleware, que se ejecuta en TODA request a la plataforma. El
// middleware acá es simple y ya tiene su propio manejo de errores
// (fallback a la sesión JWT si falla la consulta fresca), así que no vale
// la pena ese costo en el camino más caliente de toda la app.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
}
