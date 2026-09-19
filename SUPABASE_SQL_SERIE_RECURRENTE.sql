-- ============================================================
-- NELYX — Migración: Repetición de tareas (Calendario, Fase 2)
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS "SerieRecurrente" (
  "id"         TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "frecuencia" TEXT      NOT NULL,
  "diasSemana" INTEGER[] NOT NULL DEFAULT '{}',
  "fechaFin"   TIMESTAMP,
  "userId"     TEXT      NOT NULL,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "SerieRecurrente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SerieRecurrente_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SerieRecurrente_userId_idx"
  ON "SerieRecurrente"("userId");

ALTER TABLE "EventoCalendario" ADD COLUMN IF NOT EXISTS "serieId" TEXT;

ALTER TABLE "EventoCalendario"
  ADD CONSTRAINT "EventoCalendario_serieId_fkey"
  FOREIGN KEY ("serieId") REFERENCES "SerieRecurrente"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "EventoCalendario_serieId_idx"
  ON "EventoCalendario"("serieId");

-- Verificar
-- SELECT * FROM "SerieRecurrente" LIMIT 5;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'EventoCalendario';
