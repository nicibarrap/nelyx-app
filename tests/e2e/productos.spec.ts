import { test, expect } from "@playwright/test"
import { login } from "./helpers"
import { E2E_PRODUCTO_NOMBRE } from "./fixtures"

// Flujo dorado #3: crear un producto nuevo (el wizard completo) y, por
// separado, ajustar el stock de un producto ya existente. Dos tests
// independientes en vez de uno encadenado — así un fallo en "crear" no deja
// sin ninguna señal al test de "ajustar stock" (ver README: preferir datos
// sembrados en seed.ts sobre crearlos desde la UI dentro de un test; acá la
// creación SÍ se prueba a propósito porque es justo el flujo que se quiere
// cubrir, no un dato de soporte para otro test).

test("crear un producto nuevo con el wizard completo", async ({ page }) => {
  await login(page)
  await page.goto("/dashboard/productos")

  await page.getByRole("button", { name: "+ Agregar producto" }).click()

  // Paso 0 — Intro
  await page.getByRole("button", { name: "Comenzar" }).click()

  // Paso 1 — Controla inventario: sí
  await page.getByText("Controlar inventario", { exact: true }).click()
  await page.getByRole("button", { name: "Siguiente" }).click()

  // Paso 2 — Tipo: por unidad (la rama más simple del wizard)
  await page.getByText("Se vende por unidad", { exact: true }).click()
  await page.getByRole("button", { name: "Siguiente" }).click()

  // Paso 3 — Información básica
  const nombre = `Producto E2E Wizard ${Date.now()}`
  await page.getByPlaceholder("Ej: Maní Premium").fill(nombre)
  await page.getByRole("button", { name: "Siguiente" }).click()

  // Paso 4 — Compra. Los inputs no tienen label asociado por htmlFor/id, así
  // que se toman por orden — en esta rama (por unidad) son exactamente dos:
  // cantidad comprada y costo unitario.
  const inputsCompra = page.locator('input[type="number"]')
  await inputsCompra.nth(0).fill("20")
  await inputsCompra.nth(1).fill("500")
  await page.getByRole("button", { name: "Siguiente" }).click()

  // Paso 5 — Venta: precio (único input numérico en esta rama, sin presentación)
  await page.locator('input[type="number"]').first().fill("1000")
  await page.getByRole("button", { name: "Siguiente" }).click()

  // Paso 6 — Stock mínimo
  await page.getByPlaceholder("5").fill("3")
  await page.getByRole("button", { name: "Siguiente" }).click()

  // Paso 7 — Resumen → Guardar
  await page.getByRole("button", { name: "Guardar producto" }).click()

  await expect(page.getByText("Producto creado con éxito", { exact: false })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(nombre).first()).toBeVisible()
})

test("ajustar el stock de un producto existente", async ({ page }) => {
  await login(page)
  await page.goto("/dashboard/productos")

  // Abre el detalle del producto sembrado por seed.ts (stock inicial: 100) —
  // la fila completa es clickeable (onClick en el <tr>, sin rol de botón),
  // así que se hace click directo sobre el texto del nombre.
  await page.getByText(E2E_PRODUCTO_NOMBRE, { exact: false }).first().click()

  await page.getByRole("button", { name: "Ajustar stock", exact: true }).click()

  // Cantidad: primer input numérico del panel de ajuste (el segundo, si
  // aparece, es el costo unitario opcional — no se toca). Motivo queda en su
  // valor por defecto ("Compra" / reposición), que sí admite agregar stock.
  await page.locator('input[type="number"]').first().fill("15")
  await page.getByRole("button", { name: "+ Agregar", exact: true }).click()

  await expect(page.getByText(/agregado/i)).toBeVisible({ timeout: 10_000 })
})
