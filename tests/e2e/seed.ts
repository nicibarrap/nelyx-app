import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { E2E_EMAIL, E2E_PASSWORD, E2E_PRODUCTO_NOMBRE } from "./fixtures"

// Siembra mínima para que los smoke tests de Playwright tengan algo real con
// qué trabajar (un dueño con un producto), separado del seed de desarrollo
// (prisma/seed.ts) para no depender de que alguien no lo cambie por otro
// motivo. Corre contra la misma Postgres de pruebas que vitest — nunca
// contra Supabase/producción. Se ejecuta aparte (npm run test:e2e:seed),
// nunca como efecto secundario de importar este archivo.
async function main() {
  const db = new PrismaClient()
  try {
    const hash = await bcrypt.hash(E2E_PASSWORD, 12)
    const user = await db.user.upsert({
      where: { email: E2E_EMAIL },
      update: {},
      create: { nombre: "Cuenta E2E", email: E2E_EMAIL, password: hash, rol: "ADMIN", negocio: "Negocio E2E" },
    })

    await db.producto.upsert({
      where: { userId_sku: { userId: user.id, sku: "E2E-001" } },
      update: { activo: true, stock: 100, precio: 1000, costo: 500 },
      create: {
        userId: user.id, nombre: E2E_PRODUCTO_NOMBRE, sku: "E2E-001",
        precio: 1000, costo: 500, stock: 100, controlaInventario: true,
        formaVenta: "unidad", activo: true,
      },
    })

    console.log(`✅ Seed E2E listo: ${E2E_EMAIL} / ${E2E_PASSWORD}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
