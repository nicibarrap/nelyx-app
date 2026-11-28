import { test, expect } from "@playwright/test"
import { login } from "./helpers"
import { MODULOS } from "./modulos"

// Verificación visual automática en los 3 anchos clave que pidió el dueño:
// celular (390px), tablet (820px) y escritorio (1440px). Dos cosas, las
// dos pensadas para NO ser frágiles entre entornos (nunca comparación de
// píxeles — eso depende de fuentes/GPU y rompe sin que nada esté roto de
// verdad):
//
// 1. Scroll horizontal: se revisa el <main> de ContenidoDashboard, no
//    document.documentElement. El layout del dashboard es
//    "overflow-hidden" de punta a punta a propósito (ver
//    app/dashboard/layout.tsx) y <main> tiene "overflow-x-hidden" — un
//    desborde ahí nunca mueve el scroll del documento, solo recorta el
//    contenido en silencio. scrollWidth del propio <main> sigue
//    reflejando el ancho real del contenido aunque esté recortado, así
//    que es el lugar correcto para mirar.
// 2. Una captura de cada pantalla en cada ancho, subida como artifact de
//    CI (ver tests.yml) para revisión humana — detecta cosas que un
//    número no puede, como un texto que se ve pero quedó mal alineado.
//    No bloquea nada por sí sola.
//
// Reusa la misma lista de pantallas que smoke-modulos.spec.ts en vez de
// mantener dos listas — son las mismas pantallas ya auditadas.

const VIEWPORTS = [
  { nombre: "celular", width: 390, height: 844 },
  { nombre: "tablet", width: 820, height: 1180 },
  { nombre: "escritorio", width: 1440, height: 900 },
]

test.beforeEach(async ({ page }) => {
  await login(page)
})

for (const viewport of VIEWPORTS) {
  test.describe(`en ${viewport.nombre} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    for (const { ruta } of MODULOS) {
      test(`${ruta} no desborda horizontalmente`, async ({ page }) => {
        await page.goto(ruta)
        const main = page.locator("main").first()
        await expect(main).toBeVisible()

        const { scrollWidth, clientWidth } = await main.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
        expect(scrollWidth, `${ruta} en ${viewport.width}px: el contenido es más ancho que la pantalla`).toBeLessThanOrEqual(clientWidth)

        const archivo = ruta.replace(/^\//, "").replace(/\//g, "-")
        await page.screenshot({ path: `capturas-responsive/${viewport.nombre}-${archivo}.png` })
      })
    }
  })
}
