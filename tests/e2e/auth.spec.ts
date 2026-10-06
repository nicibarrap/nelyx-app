import { test, expect } from "@playwright/test"
import { E2E_EMAIL } from "./fixtures"
import { login } from "./helpers"

// Flujo dorado #1: entrar a la plataforma. Si esto se rompe, nada más
// importa — es la puerta de entrada a todos los demás módulos.

test("login con credenciales correctas lleva al dashboard", async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL(/\/dashboard\/resumen/)
})

test("login con contraseña incorrecta muestra el error y no entra", async ({ page }) => {
  await page.goto("/auth/login")
  await page.getByPlaceholder("tu@correo.com").fill(E2E_EMAIL)
  await page.getByPlaceholder("••••••••").fill("contraseña-equivocada")
  await page.getByRole("button", { name: "Ingresar a mi cuenta" }).click()
  await expect(page.getByText("Contraseña incorrecta")).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login/)
})

test("login con correo que no existe muestra el error correcto (no 'contraseña incorrecta')", async ({ page }) => {
  await page.goto("/auth/login")
  await page.getByPlaceholder("tu@correo.com").fill("no-existe-nadie-aqui@nelyx.test")
  await page.getByPlaceholder("••••••••").fill("lo que sea")
  await page.getByRole("button", { name: "Ingresar a mi cuenta" }).click()
  await expect(page.getByText("No existe ninguna cuenta con ese correo")).toBeVisible()
})
