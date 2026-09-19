-- ============================================================
-- NELYX — Migración: Proyectos/Categorías de Tareas (Calendario)
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS "ProyectoTarea" (
  "id"          TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "nombre"      TEXT      NOT NULL,
  "descripcion" TEXT,
  "color"       TEXT      NOT NULL DEFAULT 'azul',
  "userId"      TEXT      NOT NULL,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "ProyectoTarea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProyectoTarea_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoTarea_nombre_userId_key"
  ON "ProyectoTarea"("nombre", "userId");

CREATE INDEX IF NOT EXISTS "ProyectoTarea_userId_idx"
  ON "ProyectoTarea"("userId");

ALTER TABLE "EventoCalendario" ADD COLUMN IF NOT EXISTS "proyectoId" TEXT;

ALTER TABLE "EventoCalendario"
  ADD CONSTRAINT "EventoCalendario_proyectoId_fkey"
  FOREIGN KEY ("proyectoId") REFERENCES "ProyectoTarea"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "EventoCalendario_proyectoId_idx"
  ON "EventoCalendario"("proyectoId");

-- Verificar
-- SELECT * FROM "ProyectoTarea" LIMIT 5;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'EventoCalendario';
