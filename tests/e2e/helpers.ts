import { Page } from "@playwright/test"
import { E2E_EMAIL, E2E_PASSWORD } from "./fixtures"

/** Inicia sesión con la cuenta sembrada por seed.ts y espera a llegar al dashboard. */
export async function login(page: Page) {
  await page.goto("/auth/login")
  await page.getByPlaceholder("tu@correo.com").fill(E2E_EMAIL)
  await page.getByPlaceholder("••••••••").fill(E2E_PASSWORD)
  await page.getByRole("button", { name: "Ingresar a mi cuenta" }).click()
  // Turbopack compila /dashboard/resumen la primera vez que algo lo visita
  // en todo el proceso de test — ese primer login puede tardar bastante más
  // que el resto. 25s da margen sin hacer que un timeout real tarde una
  // eternidad en reportarse.
  await page.waitForURL("**/dashboard/resumen", { timeout: 25_000 })
}
