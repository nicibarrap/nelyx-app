const { withSentryConfig } = require("@sentry/nextjs/config")

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Encabezados de seguridad del navegador — protecciones de bajo riesgo
  // que Next.js no activa solo. No incluye Content-Security-Policy: una
  // CSP mal armada rompería silenciosamente cosas reales de la app (el
  // service worker, el scanner de código de barras por cámara, Sentry) y
  // merece su propia revisión con pruebas en el navegador, no meterla acá
  // sin poder probarla visualmente.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nadie puede meter la app dentro de un <iframe> de otro sitio
          // (protege contra clickjacking — clics disfrazados sobre botones reales).
          { key: "X-Frame-Options", value: "DENY" },
          // El navegador no debe "adivinar" el tipo de un archivo servido
          // distinto al que la app declaró.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No filtra la URL completa (con ids, tokens en query, etc.) al
          // salir a un sitio externo — solo el origen.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Fuerza HTTPS en visitas futuras durante 2 años, incluidos
          // subdominios — Vercel ya sirve todo por HTTPS, esto solo evita
          // que un navegador intente por HTTP alguna vez.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Cámara: se necesita (self) para el escáner de código de
          // barras — el resto de permisos del navegador que la app no usa
          // quedan desactivados por defecto.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), usb=()" },
        ],
      },
    ]
  },
}

// Sin SENTRY_AUTH_TOKEN (necesita una cuenta de Sentry creada), esto no
// sube source maps ni cambia nada del build — sigue siendo un build
// normal de Next.js. Ver SENTRY_SETUP.md.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
})
