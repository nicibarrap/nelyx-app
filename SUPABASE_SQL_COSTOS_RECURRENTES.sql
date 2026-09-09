-- ============================================================
-- NELYX — Migración: Costos Fijos Recurrentes
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS "CostoFijoRecurrente" (
  "id"               TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "nombre"           TEXT         NOT NULL,
  "monto"            DECIMAL(12,2) NOT NULL,
  "categoria"        TEXT,
  "descripcion"      TEXT,
  "diaCobro"         INTEGER      NOT NULL DEFAULT 1,
  "fechaPrimerCobro" TIMESTAMP,
  "estado"           TEXT         NOT NULL DEFAULT 'activo',
  "userId"           TEXT         NOT NULL,
  "createdAt"        TIMESTAMP    NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT "CostoFijoRecurrente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CostoFijoRecurrente_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "GeneracionCosto" (
  "id"           TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "costoFijoId"  TEXT      NOT NULL,
  "mes"          INTEGER   NOT NULL,
  "anio"         INTEGER   NOT NULL,
  "movimientoId" TEXT,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "GeneracionCosto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GeneracionCosto_costoFijoId_mes_anio_key"
    UNIQUE ("costoFijoId", "mes", "anio"),
  CONSTRAINT "GeneracionCosto_costoFijoId_fkey"
    FOREIGN KEY ("costoFijoId") REFERENCES "CostoFijoRecurrente"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CostoFijoRecurrente_userId_idx"
  ON "CostoFijoRecurrente"("userId");

-- Verificar
SELECT 'CostoFijoRecurrente creada' as resultado
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'CostoFijoRecurrente'
);
