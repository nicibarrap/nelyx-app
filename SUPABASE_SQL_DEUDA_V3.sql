-- ============================================================
-- NELYX — Migración: Cuota Manual y Tipo Tasa en Deudas
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE "Deuda"
  ADD COLUMN IF NOT EXISTS "cuotaManual"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "tipoTasa"     TEXT DEFAULT 'mensual';

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Deuda'
  AND column_name IN ('cuotaManual','tipoTasa');
