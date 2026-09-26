-- ============================================================
-- NELYX — Migración: Recuperación de contraseña ("¿Olvidaste tu contraseña?")
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id"        TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"    TEXT      NOT NULL,
  "tokenHash" TEXT      NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "usedAt"    TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_createdAt_idx"
  ON "PasswordResetToken"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "IntentoResetPassword" (
  "id"        TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "ip"        TEXT      NOT NULL,
  "email"     TEXT      NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "IntentoResetPassword_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IntentoResetPassword_ip_createdAt_idx"
  ON "IntentoResetPassword"("ip", "createdAt");

CREATE INDEX IF NOT EXISTS "IntentoResetPassword_email_createdAt_idx"
  ON "IntentoResetPassword"("email", "createdAt");

-- Verificar
-- SELECT * FROM "PasswordResetToken" ORDER BY "createdAt" DESC LIMIT 5;
-- SELECT * FROM "IntentoResetPassword" ORDER BY "createdAt" DESC LIMIT 5;
