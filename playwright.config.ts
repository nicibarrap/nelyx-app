import { defineConfig, devices } from "@playwright/test"

// E2E corre contra el servidor de desarrollo de Next, apuntando a la misma
// Postgres de pruebas que usan los tests de Vitest (nunca Supabase/producción
// — ver tests/README.md). El puerto 3109 coincide con NEXTAUTH_URL en
// .env.local de este entorno.
const PUERTO = 3109
const BASE_URL = `http://localhost:${PUERTO}`

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // comparten la misma cuenta sembrada — evita carreras entre tests
  retries: 1, // la UI real (dropdowns que se abren/filtran en vivo) puede tener una carrera ocasional — ver tests/e2e/README.md
  workers: 1,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Este entorno trae Chromium preinstalado en una revisión que no
        // siempre coincide con la que esta versión de @playwright/test
        // intentaría descargar (bloqueado — PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).
        // Se usa el binario ya presente en vez de intentar bajar uno nuevo.
        launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
      },
    },
  ],
  webServer: {
    command: `npx next dev --turbopack -p ${PUERTO}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
})
