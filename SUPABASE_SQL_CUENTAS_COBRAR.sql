-- ============================================================
-- NELYX — Migración: Cuentas por Cobrar
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS "CuentaPorCobrar" (
  "id"             TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "numero"         INTEGER       NOT NULL,
  "clienteId"      TEXT          NOT NULL,
  "movimientoId"   TEXT,
  "montoOriginal"  DECIMAL(12,2) NOT NULL,
  "saldoPendiente" DECIMAL(12,2) NOT NULL,
  "fechaVenta"     TIMESTAMP     NOT NULL,
  "fechaVence"     TIMESTAMP,
  "estado"         TEXT          NOT NULL DEFAULT 'pendiente',
  "observaciones"  TEXT,
  "userId"         TEXT          NOT NULL,
  "createdAt"      TIMESTAMP     NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP     NOT NULL DEFAULT NOW(),
  CONSTRAINT "CuentaPorCobrar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CuentaPorCobrar_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id"),
  CONSTRAINT "CuentaPorCobrar_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "PagoCuenta" (
  "id"          TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "cuentaId"    TEXT          NOT NULL,
  "monto"       DECIMAL(12,2) NOT NULL,
  "fecha"       TIMESTAMP     NOT NULL,
  "descripcion" TEXT,
  "metodoPago"  TEXT          DEFAULT 'Efectivo',
  "createdAt"   TIMESTAMP     NOT NULL DEFAULT NOW(),
  CONSTRAINT "PagoCuenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PagoCuenta_cuentaId_fkey"
    FOREIGN KEY ("cuentaId") REFERENCES "CuentaPorCobrar"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CuentaPorCobrar_userId_idx" ON "CuentaPorCobrar"("userId");
CREATE INDEX IF NOT EXISTS "CuentaPorCobrar_clienteId_idx" ON "CuentaPorCobrar"("clienteId");

SELECT 'CuentasPorCobrar OK' as resultado;
