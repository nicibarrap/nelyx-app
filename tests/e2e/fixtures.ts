// Datos de la cuenta/producto sembrados por seed.ts — en su propio archivo
// (sin lógica, sin PrismaClient) para que los specs puedan importarlos sin
// disparar el seeding como efecto secundario del import.
export const E2E_EMAIL = "e2e@nelyx.test"
export const E2E_PASSWORD = "e2e-test-password"
export const E2E_PRODUCTO_NOMBRE = "Producto E2E"
