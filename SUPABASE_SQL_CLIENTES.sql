-- ============================================================
-- NELYX — Migración: Módulo Clientes
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- Tabla clientes
CREATE TABLE IF NOT EXISTS "Cliente" (
  "id"               TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "nombre"           TEXT         NOT NULL,
  "apellido"         TEXT,
  "empresa"          TEXT,
  "telefono"         TEXT,
  "email"            TEXT,
  "direccion"        TEXT,
  "ciudad"           TEXT,
  "tipoCliente"      TEXT         DEFAULT 'Minorista',
  "frecuenciaCompra" TEXT,
  "metodoPago"       TEXT         DEFAULT 'Efectivo',
  "limiteCredito"    DECIMAL(12,2),
  "diasPago"         INTEGER      DEFAULT 0,
  "esFrecuente"      BOOLEAN      NOT NULL DEFAULT false,
  "esVip"            BOOLEAN      NOT NULL DEFAULT false,
  "permiteCredito"   BOOLEAN      NOT NULL DEFAULT false,
  "activo"           BOOLEAN      NOT NULL DEFAULT true,
  "observaciones"    TEXT,
  "userId"           TEXT         NOT NULL,
  "createdAt"        TIMESTAMP    NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Cliente_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Tabla notas de clientes
CREATE TABLE IF NOT EXISTS "NotaCliente" (
  "id"        TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "texto"     TEXT      NOT NULL,
  "clienteId" TEXT      NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotaCliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotaCliente_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE
);

-- Agregar clienteId a Movimiento
ALTER TABLE "Movimiento"
  ADD COLUMN IF NOT EXISTS "clienteId" TEXT;

-- Índices
CREATE INDEX IF NOT EXISTS "Cliente_userId_idx" ON "Cliente"("userId");

-- Verificar
SELECT 'Clientes OK' as resultado
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Cliente');
