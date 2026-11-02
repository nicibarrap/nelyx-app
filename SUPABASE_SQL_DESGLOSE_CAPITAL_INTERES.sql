-- ============================================================
-- NELYX — Migración: desglose capital/interés en pagos de deuda
-- y marca de movimientos no-operativos (retiro, capital de deuda)
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE "PagoDeuda"
  ADD COLUMN IF NOT EXISTS "montoCapital" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "montoInteres" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Movimiento"
  ADD COLUMN IF NOT EXISTS "montoNoOperativo" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Verificar
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE (table_name = 'PagoDeuda' AND column_name IN ('montoCapital','montoInteres'))
   OR (table_name = 'Movimiento' AND column_name = 'montoNoOperativo');
