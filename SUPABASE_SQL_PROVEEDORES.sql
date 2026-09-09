-- ============================================================
-- NELYX — Migración: Módulo Proveedores
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS "Proveedor" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "nombre"       TEXT         NOT NULL,
  "empresa"      TEXT,
  "rut"          TEXT,
  "telefono"     TEXT,
  "email"        TEXT,
  "direccion"    TEXT,
  "ciudad"       TEXT,
  "categoria"    TEXT         DEFAULT 'Otros',
  "esFavorito"   BOOLEAN      NOT NULL DEFAULT false,
  "activo"       BOOLEAN      NOT NULL DEFAULT true,
  "observaciones" TEXT,
  "userId"       TEXT         NOT NULL,
  "createdAt"    TIMESTAMP    NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Proveedor_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "NotaProveedor" (
  "id"          TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "texto"       TEXT      NOT NULL,
  "proveedorId" TEXT      NOT NULL,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "NotaProveedor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotaProveedor_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE
);

ALTER TABLE "Movimiento"
  ADD COLUMN IF NOT EXISTS "proveedorId" TEXT;

CREATE INDEX IF NOT EXISTS "Proveedor_userId_idx" ON "Proveedor"("userId");

SELECT 'Proveedores OK' as resultado
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Proveedor');
