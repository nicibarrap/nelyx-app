-- ============================================================
-- NELYX — Migración: Chat de soporte en vivo
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

ALTER TABLE "NotificacionConfig" ADD COLUMN IF NOT EXISTS "soporte" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "ConversacionSoporte" (
  "id"                  TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"              TEXT      NOT NULL,
  "estado"              TEXT      NOT NULL DEFAULT 'abierta',
  "ultimoMensajeDe"     TEXT      NOT NULL DEFAULT 'cliente',
  "ultimoMensajeAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "recordatorioEnviado" BOOLEAN   NOT NULL DEFAULT false,
  "createdAt"           TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "ConversacionSoporte_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversacionSoporte_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ConversacionSoporte_estado_ultimoMensajeAt_idx"
  ON "ConversacionSoporte"("estado", "ultimoMensajeAt");

CREATE TABLE IF NOT EXISTS "MensajeSoporte" (
  "id"             TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "conversacionId" TEXT      NOT NULL,
  "de"             TEXT      NOT NULL,
  "autorNombre"    TEXT,
  "contenido"      TEXT      NOT NULL,
  "paginaOrigen"   TEXT,
  "urgente"        BOOLEAN   NOT NULL DEFAULT false,
  "leidoCliente"   BOOLEAN   NOT NULL DEFAULT false,
  "leidoSoporte"   BOOLEAN   NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "MensajeSoporte_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MensajeSoporte_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "ConversacionSoporte"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "MensajeSoporte_conversacionId_createdAt_idx"
  ON "MensajeSoporte"("conversacionId", "createdAt");

-- Verificar
-- SELECT * FROM "ConversacionSoporte" ORDER BY "ultimoMensajeAt" DESC LIMIT 5;
-- SELECT * FROM "MensajeSoporte" ORDER BY "createdAt" DESC LIMIT 5;
