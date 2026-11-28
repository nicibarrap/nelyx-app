// Datos de la cuenta/producto sembrados por seed.ts — en su propio archivo
// (sin lógica, sin PrismaClient) para que los specs puedan importarlos sin
// disparar el seeding como efecto secundario del import.
export const E2E_EMAIL = "e2e@nelyx.test"
export const E2E_PASSWORD = "e2e-test-password"
export const E2E_PRODUCTO_NOMBRE = "Producto E2E"

// ── Mi suscripción / Revisar comprobante ───────────────────────────────
// Dos cuentas "cliente" (rol USER, nunca ADMIN/empleado) separadas a
// propósito: cada una tiene su propio cobro pendiente con un comprobante
// ya "subido" (sembrado directo en la base — la carga real va a Vercel
// Blob y no se puede probar en CI sin un token real, ver tests/README.md).
// mi-suscripcion.spec.ts solo LEE la suya; revisar-comprobante.spec.ts
// rechaza la suya desde el panel admin — si compartieran cuenta, el orden
// en que corran los specs podría romper al otro.
export const E2E_CLIENTE_EMAIL = "cliente-e2e@nelyx.test"
export const E2E_CLIENTE_PASSWORD = "e2e-test-password"
export const E2E_CLIENTE_NEGOCIO = "Negocio Cliente E2E"
export const E2E_CLIENTE_REVISION_EMAIL = "cliente-revision-e2e@nelyx.test"
export const E2E_CLIENTE_REVISION_NEGOCIO = "Negocio Revisión E2E"

export const E2E_PLAN_NOMBRE = "Plan E2E"
export const E2E_COBRO_MONTO = 9990

export const E2E_BANCO_NOMBRE = "Banco E2E"
export const E2E_BANCO_RUT = "11.111.111-1"
