-- ================================================
-- NELYX - SQL Categorías Personalizadas
-- Ejecuta esto en el Editor SQL de Supabase
-- ================================================

-- Agregar columna categoría a movimientos
ALTER TABLE "Movimiento" ADD COLUMN IF NOT EXISTS "categoria" TEXT;

-- Crear tabla de categorías personalizadas por usuario
CREATE TABLE IF NOT EXISTS "CategoriaPersonalizada" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategoriaPersonalizada_pkey" PRIMARY KEY ("id")
);

-- Relación con User
ALTER TABLE "CategoriaPersonalizada" ADD CONSTRAINT "CategoriaPersonalizada_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índices para búsqueda rápida
CREATE UNIQUE INDEX IF NOT EXISTS "CategoriaPersonalizada_nombre_tipo_userId_key"
  ON "CategoriaPersonalizada"("nombre", "tipo", "userId");

CREATE INDEX IF NOT EXISTS "CategoriaPersonalizada_userId_tipo_idx"
  ON "CategoriaPersonalizada"("userId", "tipo");

CREATE INDEX IF NOT EXISTS "Movimiento_userId_tipo_categoria_idx"
  ON "Movimiento"("userId", "tipo", "categoria");

-- ================================================
-- ¡Listo! La app funcionará con categorías
-- ================================================
