import { PrismaClient } from "@prisma/client"

/** Borra por completo la cuenta sintética y todo lo que cuelga de ella
 * (onDelete: Cascade se encarga de productos, movimientos, clientes,
 * deudas, cuentas por cobrar, costos fijos, etc. — una sola fila borrada). */
const SYNTH_EMAIL = "datos-sinteticos@nelyx.internal"

async function main() {
  const db = new PrismaClient()
  try {
    const user = await db.user.findUnique({ where: { email: SYNTH_EMAIL } })
    if (!user) {
      console.log("No hay datos sintéticos que borrar (la cuenta no existe).")
      return
    }
    await db.user.delete({ where: { id: user.id } })
    console.log(`✅ Cuenta sintética ${SYNTH_EMAIL} y todos sus datos fueron borrados.`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
