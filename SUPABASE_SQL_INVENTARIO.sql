-- ============================================================
-- NELYX — Migración: Módulo Inventario en Productos
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE "Producto"
  ADD COLUMN IF NOT EXISTS "costo"       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "categoria"   TEXT,
  ADD COLUMN IF NOT EXISTS "sku"         TEXT,
  ADD COLUMN IF NOT EXISTS "stock"       INTEGER,
  ADD COLUMN IF NOT EXISTS "stockMinimo" INTEGER DEFAULT 5;

-- Verificar que los campos fueron creados
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Producto'
  AND column_name IN ('costo','categoria','sku','stock','stockMinimo');
