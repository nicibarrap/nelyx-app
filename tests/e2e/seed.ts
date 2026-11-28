import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import {
  E2E_EMAIL, E2E_PASSWORD, E2E_PRODUCTO_NOMBRE,
  E2E_CLIENTE_EMAIL, E2E_CLIENTE_PASSWORD, E2E_CLIENTE_NEGOCIO,
  E2E_CLIENTE_REVISION_EMAIL, E2E_CLIENTE_REVISION_NEGOCIO,
  E2E_PLAN_NOMBRE, E2E_COBRO_MONTO, E2E_BANCO_NOMBRE, E2E_BANCO_RUT,
} from "./fixtures"

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

    // Fila única de datos bancarios que "Mi suscripción" le muestra al
    // cliente para transferir — se resetea a estos valores de prueba en
    // cada corrida del seed (nunca datos reales; esta base nunca es
    // Supabase/producción, ver tests/README.md).
    const datosBancariosData = {
      banco: E2E_BANCO_NOMBRE, tipoCuenta: "Cuenta Vista", numeroCuenta: "000111222",
      rutTitular: E2E_BANCO_RUT, nombreTitular: "Nelyx SpA (E2E)", email: "pagos-e2e@nelyx.test",
    }
    const datosBancariosExistentes = await db.datosBancariosNelyx.findFirst()
    if (datosBancariosExistentes) await db.datosBancariosNelyx.update({ where: { id: datosBancariosExistentes.id }, data: datosBancariosData })
    else await db.datosBancariosNelyx.create({ data: datosBancariosData })

    // Plan de prueba compartido por las dos cuentas cliente de abajo — sin
    // id fijo (PlanNelyx no tiene un campo único salvo el id), así que se
    // busca por nombre antes de crear uno nuevo.
    const plan = await db.planNelyx.findFirst({ where: { nombre: E2E_PLAN_NOMBRE } })
      ?? await db.planNelyx.create({ data: { nombre: E2E_PLAN_NOMBRE, precio: E2E_COBRO_MONTO, meses: 1, activo: true } })

    const hashCliente = await bcrypt.hash(E2E_CLIENTE_PASSWORD, 12)
    await seedClienteConComprobantePendiente(db, hashCliente, E2E_CLIENTE_EMAIL, E2E_CLIENTE_NEGOCIO, plan.id)
    await seedClienteConComprobantePendiente(db, hashCliente, E2E_CLIENTE_REVISION_EMAIL, E2E_CLIENTE_REVISION_NEGOCIO, plan.id)

    console.log(`✅ Seed E2E listo: ${E2E_EMAIL} / ${E2E_PASSWORD}`)
  } finally {
    await db.$disconnect()
  }
}

/**
 * Deja a esta cuenta cliente con: una suscripción con el plan de prueba,
 * un cobro pendiente, y un comprobante recién "subido" para ese cobro
 * (estado "pendiente_confirmacion") — como si el cliente ya hubiera usado
 * el formulario de "Mi suscripción". Se reconstruye desde cero en cada
 * corrida del seed (se borra cualquier cobro/pago previo de esta
 * suscripción), sin importar en qué estado haya quedado tras un test
 * anterior (confirmado/rechazado) — así el escenario sembrado es siempre
 * el mismo.
 */
async function seedClienteConComprobantePendiente(
  db: PrismaClient, passwordHash: string, email: string, negocio: string, planId: string,
) {
  const user = await db.user.upsert({
    where: { email },
    update: { activo: true },
    create: { nombre: negocio, email, password: passwordHash, rol: "USER", negocio },
  })

  const fechaProximoCobro = new Date()
  fechaProximoCobro.setMonth(fechaProximoCobro.getMonth() + 1)
  const suscripcion = await db.suscripcionNelyx.upsert({
    where: { userId: user.id },
    update: { planId, estado: "pendiente", precioPlan: E2E_COBRO_MONTO },
    create: { userId: user.id, planId, estado: "pendiente", precioPlan: E2E_COBRO_MONTO, fechaProximoCobro },
  })

  await db.cobroNelyx.deleteMany({ where: { suscripcionId: suscripcion.id } })
  await db.pagoNelyx.deleteMany({ where: { suscripcionId: suscripcion.id } })

  const comprobanteExpiraEn = new Date()
  comprobanteExpiraEn.setDate(comprobanteExpiraEn.getDate() + 5)
  const pago = await db.pagoNelyx.create({
    data: {
      suscripcionId: suscripcion.id, monto: E2E_COBRO_MONTO, metodoPago: "transferencia",
      estado: "pendiente_confirmacion",
      comprobanteUrl: "https://example.com/comprobante-e2e.png",
      comprobanteExpiraEn,
    },
  })

  // Vencimiento a futuro a propósito: sincronizarSuscripciones() corre
  // automáticamente al cargar /admin/clientes y pasaría este cobro a
  // "vencido" si la fecha ya hubiera pasado, rompiendo el escenario sembrado.
  const fechaVencimiento = new Date()
  fechaVencimiento.setDate(fechaVencimiento.getDate() + 7)
  await db.cobroNelyx.create({
    data: {
      suscripcionId: suscripcion.id, plan: E2E_PLAN_NOMBRE, monto: E2E_COBRO_MONTO,
      fechaVencimiento, estado: "pendiente", pagoId: pago.id,
    },
  })
}

main().catch((err) => { console.error(err); process.exit(1) })
