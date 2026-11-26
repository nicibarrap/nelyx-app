import { beforeEach } from "vitest"
import { db } from "@/lib/db"

// Limpia las tablas que tocan los tests de integración antes de cada
// test — así ninguno depende de datos dejados por el anterior, y se
// puede correr la suite completa repetidas veces sin ir acumulando basura
// en la base de datos de pruebas.
const TABLAS_A_LIMPIAR = [
  "IntentoLoginFallido",
  "PagoCuenta",
  "CuentaPorCobrar",
  "PagoDeuda",
  "Deuda",
  "GeneracionCosto",
  "CostoFijoRecurrente",
  "Movimiento",
  "Cliente",
  "Producto",
  "User",
  // No cuelga de User (no tiene userId) — deleting User no la limpia en
  // cascada como al resto, así que queda pegada entre tests si no se borra
  // aparte. SuscripcionNelyx.planId es onDelete: SetNull, así que borrar
  // acá no choca con suscripciones que la hayan estado usando.
  "PlanNelyx",
  // Fila única (sin userId tampoco) — sin limpiarla, el primer test que la
  // cree con obtenerDatosBancarios()/actualizarDatosBancarios() deja esa
  // misma fila para todos los tests siguientes, que entonces no arrancan
  // desde los valores por defecto ("").
  "DatosBancariosNelyx",
]

beforeEach(async () => {
  for (const tabla of TABLAS_A_LIMPIAR) {
    await db.$executeRawUnsafe(`DELETE FROM "${tabla}"`)
  }
})
