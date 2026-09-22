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
]

beforeEach(async () => {
  for (const tabla of TABLAS_A_LIMPIAR) {
    await db.$executeRawUnsafe(`DELETE FROM "${tabla}"`)
  }
})
