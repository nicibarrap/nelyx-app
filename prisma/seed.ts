import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
const db = new PrismaClient()
async function main() {
  const hash = await bcrypt.hash("nelyx2025", 12)
  await db.user.upsert({
    where: { email: "admin@nelyx.cl" },
    update: {},
    create: { nombre: "Administrador", email: "admin@nelyx.cl", password: hash, rol: "ADMIN", negocio: "Nelyx" },
  })
  console.log("✅ Admin: admin@nelyx.cl / nelyx2025")
}
main().catch(console.error).finally(() => db.$disconnect())
