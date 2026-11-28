import { test, expect } from "@playwright/test"
import { login } from "./helpers"
import { MODULOS } from "./modulos"

// Smoke test barato y de bajo mantenimiento: entra a cada módulo ya
// auditado y confirma que la página responde 200 y renderiza su título real
// — sin profundizar en interacciones. Esto solo no prueba que la lógica de
// negocio esté bien (para eso están los tests unitarios + las auditorías
// manuales), pero sí detecta gratis el tipo de error que rompe TODA la
// página: una Server Action que lanza, un import roto, una query que falla.

test.beforeEach(async ({ page }) => {
  await login(page)
})

for (const { ruta, tituloEsperado } of MODULOS) {
  test(`${ruta} carga sin romperse`, async ({ page }) => {
    const respuesta = await page.goto(ruta)
    expect(respuesta?.ok(), `${ruta} debería responder 200`).toBeTruthy()
    await expect(page).toHaveTitle(new RegExp(tituloEsperado))
    // Next.js renderiza su pantalla de error genérica dentro del propio
    // documento (no cambia el status HTTP ni el <title>) — se descarta
    // buscando el texto que esa pantalla siempre muestra.
    await expect(page.getByText("Application error")).not.toBeVisible()
  })
}
