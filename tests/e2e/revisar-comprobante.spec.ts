import { test, expect } from "@playwright/test"
import { login } from "./helpers"
import { E2E_EMAIL, E2E_PASSWORD, E2E_CLIENTE_REVISION_NEGOCIO, E2E_COBRO_MONTO } from "./fixtures"

// "Revisar comprobante" (/admin/clientes): el flujo del admin de Nelyx al
// revisar un comprobante que un cliente subió desde "Mi suscripción".
// Ejercita el camino de rechazo (confirmarPagoCliente también marca la
// suscripción "al día" y avanza la fecha de cobro — un cambio más grande
// que no hace falta para probar que la revisión funciona; rechazar deja
// el cobro tal cual estaba, listo para que el cliente reintente, que es
// más simple de verificar). Usa su propia cuenta cliente sembrada (ver
// fixtures.ts) para no interferir con mi-suscripcion.spec.ts.

const montoFormateado = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(E2E_COBRO_MONTO)

test("el admin puede revisar y rechazar un comprobante subido por un cliente", async ({ page }) => {
  await login(page, E2E_EMAIL, E2E_PASSWORD)
  await page.goto("/admin/clientes")

  await page.getByPlaceholder("Buscar cliente...").fill(E2E_CLIENTE_REVISION_NEGOCIO)

  // El mismo nombre de negocio también aparece en el banner de alertas
  // ("...: pago pendiente") y en la vista de tarjetas de celular (oculta
  // pero presente en el DOM) — se busca específicamente la fila de la
  // tabla de escritorio para no ambigüar el locator.
  const filaCliente = page.getByRole("table").getByText(E2E_CLIENTE_REVISION_NEGOCIO, { exact: true })
  await expect(filaCliente).toBeVisible()
  await filaCliente.click()

  // El panel de detalle del cliente se monta DOS veces a la vez (una para
  // escritorio, oculta en celular; otra como bottom-sheet de celular,
  // oculta en escritorio — ver ClientesAdminClient) — ambas con el mismo
  // contenido, así que cada texto/botón de acá adentro aparece dos veces
  // en el DOM. La versión de escritorio es la primera en el documento
  // (viewport de los tests ya es "Desktop Chrome"), de ahí el .first() en
  // cada locator que sigue.
  await expect(page.getByText("📎 El cliente subió un comprobante — pendiente de revisar").first()).toBeVisible()

  await page.getByRole("button", { name: "Revisar comprobante" }).first().click()

  await expect(page.getByText(`📎 Comprobante recibido — ${montoFormateado}`).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Ver comprobante" }).first()).toBeVisible()

  await page.getByRole("button", { name: "Rechazar", exact: true }).first().click()
  await page.getByPlaceholder("Motivo del rechazo (se le muestra al cliente)").first().fill("Comprobante de prueba E2E — monto no coincide")
  await page.getByRole("button", { name: "Rechazar", exact: true }).first().click()

  await expect(page.getByText("Comprobante rechazado")).toBeVisible()

  // El cobro vuelve a quedar pendiente SIN comprobante en revisión — el
  // panel debería ofrecer "Registrar pago" (no "Revisar comprobante") de
  // nuevo, confirmando que el estado se actualizó de verdad, no solo que
  // apareció el toast.
  await expect(page.getByText("📎 El cliente subió un comprobante — pendiente de revisar")).not.toBeVisible()
  await expect(page.getByRole("button", { name: "Registrar pago" }).first()).toBeVisible()
})
