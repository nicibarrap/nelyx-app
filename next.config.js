const { withSentryConfig } = require("@sentry/nextjs/config")

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true }
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
