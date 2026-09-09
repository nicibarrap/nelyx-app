-- ============================================================
-- NELYX — Migración: Fecha Primer Pago en Deudas
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE "Deuda"
  ADD COLUMN IF NOT EXISTS "fechaPrimerPago" TIMESTAMP;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Deuda'
  AND column_name = 'fechaPrimerPago';
