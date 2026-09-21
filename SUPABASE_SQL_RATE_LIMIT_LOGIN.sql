-- ============================================================
-- NELYX — Migración: Rate limiting de login por IP
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS "IntentoLoginFallido" (
  "id"        TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "ip"        TEXT      NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "IntentoLoginFallido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntentoLoginFallido_ip_createdAt_idx"
  ON "IntentoLoginFallido"("ip", "createdAt");

CREATE INDEX IF NOT EXISTS "IntentoLoginFallido_createdAt_idx"
  ON "IntentoLoginFallido"("createdAt");

-- Verificar
-- SELECT * FROM "IntentoLoginFallido" ORDER BY "createdAt" DESC LIMIT 5;
