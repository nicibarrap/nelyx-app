import { test, expect } from "@playwright/test"
import { login } from "./helpers"
import {
  E2E_CLIENTE_EMAIL, E2E_CLIENTE_PASSWORD, E2E_PLAN_NOMBRE, E2E_COBRO_MONTO,
  E2E_BANCO_NOMBRE, E2E_BANCO_RUT,
} from "./fixtures"

// "Mi suscripción" (Configuración → Mi suscripción): lo que un cliente de
// Nelyx ve sobre SU PROPIA suscripción con la plataforma — cobro pendiente,
// datos bancarios para transferir, y el estado de un comprobante ya
// subido. La carga real del archivo va a Vercel Blob y no se puede probar
// en CI sin un token real (ver tests/README.md) — el comprobante "en
// revisión" se siembra directo en la base (seed.ts), como si el cliente ya
// lo hubiera subido desde este mismo formulario. Esta cuenta nunca se
// muta desde este spec — ver fixtures.ts sobre por qué hay una cuenta
// separada para el flujo de rechazo del admin.

const montoFormateado = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(E2E_COBRO_MONTO)

test("Mi suscripción muestra el cobro pendiente, los datos para transferir y el comprobante en revisión", async ({ page }) => {
  await login(page, E2E_CLIENTE_EMAIL, E2E_CLIENTE_PASSWORD)
  await page.goto("/dashboard/configuracion")

  // Escritorio (viewport por defecto de los tests): "Mi suscripción" es un
  // botón del menú lateral, no un acordeón — ver
  // components/configuracion/configuracion-layout.tsx.
  const botonSeccion = page.getByRole("button", { name: "Mi suscripción" })
  await expect(botonSeccion).toBeVisible()
  await botonSeccion.click()

  await expect(page.getByText(E2E_PLAN_NOMBRE)).toBeVisible()
  await expect(page.getByText(`Pago pendiente — ${montoFormateado}`)).toBeVisible()
  // Sin el emoji en el texto buscado: EmojiConsistente (components/shared/
  // emoji-consistente.tsx) reemplaza todo emoji renderizado por un <img>
  // (Twemoji) en cuanto se pinta — getByText mira el texto del nodo, que
  // ya no incluye el carácter una vez reemplazado, así que buscarlo con el
  // emoji adelante nunca matchea.
  await expect(page.getByText("Tu comprobante está en revisión")).toBeVisible()

  // Código de referencia (NLX-XXXXXX) que el cliente debe indicar en la
  // transferencia — se calcula a partir del id del cobro (no es un valor
  // fijo que se pueda sembrar), así que se verifica el formato, no un
  // valor exacto. Ver referenciaCobro() en lib/suscripciones.ts. Aparece
  // dos veces a propósito (en el texto de instrucciones y en el campo
  // copiable de abajo) — alcanza con confirmar que se ve al menos una vez.
  await expect(page.getByText(/^NLX-[0-9A-Z]{6}$/).first()).toBeVisible()

  // Datos bancarios sembrados (ver seed.ts) — confirma que de verdad
  // llegan a pantalla, no solo que la sección existe.
  await expect(page.getByText(E2E_BANCO_NOMBRE)).toBeVisible()
  await expect(page.getByText(E2E_BANCO_RUT)).toBeVisible()

  // Con un comprobante ya en revisión no debería ofrecerse subir uno
  // nuevo — el formulario de carga queda oculto hasta que el admin lo
  // rechace (ver mi-suscripcion-client.tsx).
  await expect(page.getByRole("button", { name: "Enviar comprobante" })).not.toBeVisible()
})
