import { test, expect } from "@playwright/test"
import { login } from "./helpers"
import { E2E_PRODUCTO_NOMBRE } from "./fixtures"

// Flujo dorado #2: registrar una venta. Es la acción central del negocio —
// de aquí salen movimientos, stock, y todo lo que después agregan
// Resumen/Reportes/Alertas. Si esto se rompe, se rompe todo lo demás con él.

test("registrar una venta con un producto del catálogo", async ({ page }) => {
  await login(page)
  await page.goto("/dashboard/venta")

  await page.getByPlaceholder("Buscar producto por nombre, SKU o código...").fill(E2E_PRODUCTO_NOMBRE)

  // El resultado del dropdown es un <button> — se espera explícitamente a
  // que esté visible antes de hacer clic (el dropdown se abre/filtra en
  // cada tecleo, y un click inmediato puede caer justo mientras se re-renderiza).
  const opcionProducto = page.getByRole("button").filter({ hasText: E2E_PRODUCTO_NOMBRE }).first()
  await expect(opcionProducto).toBeVisible()
  await opcionProducto.click()

  await expect(page.getByText(E2E_PRODUCTO_NOMBRE, { exact: false }).first()).toBeVisible()

  await page.getByRole("button", { name: "Registrar venta" }).click()

  await expect(page.getByText("Venta registrada")).toBeVisible({ timeout: 10_000 })
})
