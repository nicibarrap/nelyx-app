-- ================================================
-- NELYX - SQL para ejecutar en Supabase
-- Ejecuta esto en el Editor SQL de Supabase
-- ================================================

-- Agregar nuevos campos a la tabla Deuda (los existentes se mantienen)
ALTER TABLE "Deuda" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'Otros';
ALTER TABLE "Deuda" ADD COLUMN IF NOT EXISTS "entidad" TEXT;
ALTER TABLE "Deuda" ADD COLUMN IF NOT EXISTS "interes" DECIMAL(5,2);
ALTER TABLE "Deuda" ADD COLUMN IF NOT EXISTS "cuotas" INTEGER;
ALTER TABLE "Deuda" ADD COLUMN IF NOT EXISTS "cuotasPagadas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Deuda" ADD COLUMN IF NOT EXISTS "valorCuota" DECIMAL(12,2);

-- Crear tabla de historial de pagos
CREATE TABLE IF NOT EXISTS "PagoDeuda" (
  "id" TEXT NOT NULL,
  "deudaId" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL,
  "descripcion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagoDeuda_pkey" PRIMARY KEY ("id")
);

-- Relación PagoDeuda -> Deuda
ALTER TABLE "PagoDeuda" ADD CONSTRAINT "PagoDeuda_deudaId_fkey"
  FOREIGN KEY ("deudaId") REFERENCES "Deuda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Índice para búsqueda rápida
CREATE INDEX IF NOT EXISTS "PagoDeuda_deudaId_idx" ON "PagoDeuda"("deudaId");
CREATE INDEX IF NOT EXISTS "Deuda_userId_pagada_idx" ON "Deuda"("userId", "pagada");

-- ================================================
-- ¡Listo! Ejecuta esto y la app funcionará completo
-- ================================================
