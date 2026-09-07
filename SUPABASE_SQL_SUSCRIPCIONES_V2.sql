-- ============================================================================
-- MIGRACIÓN: Sistema de suscripciones/planes + Cuenta por Cobrar interna Nelyx
-- Ejecutar COMPLETO en el SQL Editor de Supabase ANTES de desplegar el código.
-- ============================================================================

-- 1) Nuevas columnas en SuscripcionNelyx
ALTER TABLE "SuscripcionNelyx" ADD COLUMN IF NOT EXISTS "fechaFinPrueba" TIMESTAMP(3);
ALTER TABLE "SuscripcionNelyx" ADD COLUMN IF NOT EXISTS "fechaProximoCobro" TIMESTAMP(3);
ALTER TABLE "SuscripcionNelyx" ADD COLUMN IF NOT EXISTS "renovacionAutomatica" BOOLEAN NOT NULL DEFAULT true;

-- 2) Migrar datos existentes antes de borrar columnas viejas
--    - "fechaVencimiento" -> fechaFinPrueba (si estaba en prueba) o fechaProximoCobro (si no)
UPDATE "SuscripcionNelyx" SET "fechaFinPrueba" = "fechaVencimiento" WHERE "estado" = 'prueba';
UPDATE "SuscripcionNelyx" SET "fechaProximoCobro" = "fechaVencimiento" WHERE "estado" != 'prueba';

--    - Normalizar "plan" viejo (Pro/Básico) al nuevo esquema (mensual por defecto)
UPDATE "SuscripcionNelyx" SET "plan" = 'mensual' WHERE "plan" NOT IN ('mensual','trimestral','semestral','anual');
UPDATE "SuscripcionNelyx" SET "precioPlan" = 20000 WHERE "plan" = 'mensual';

--    - Normalizar "estado" viejo al nuevo esquema
UPDATE "SuscripcionNelyx" SET "estado" = 'prueba_gratuita' WHERE "estado" = 'prueba';
UPDATE "SuscripcionNelyx" SET "estado" = 'al_dia'          WHERE "estado" = 'activo';
-- 'suspendido' y 'vencido' ya coinciden con los nuevos nombres de estado.

-- 3) Quitar columnas obsoletas
ALTER TABLE "SuscripcionNelyx" DROP COLUMN IF EXISTS "mesesGratis";
ALTER TABLE "SuscripcionNelyx" DROP COLUMN IF EXISTS "fechaVencimiento";

-- 4) Ajustar defaults de columnas existentes
ALTER TABLE "SuscripcionNelyx" ALTER COLUMN "plan" SET DEFAULT 'mensual';
ALTER TABLE "SuscripcionNelyx" ALTER COLUMN "estado" SET DEFAULT 'prueba_gratuita';
ALTER TABLE "SuscripcionNelyx" ALTER COLUMN "precioPlan" SET DEFAULT 0;

-- 5) Nueva tabla: CobroNelyx (cuenta por cobrar interna de Nelyx)
CREATE TABLE IF NOT EXISTS "CobroNelyx" (
    "id"               TEXT NOT NULL,
    "suscripcionId"    TEXT NOT NULL,
    "plan"             TEXT NOT NULL,
    "monto"            DECIMAL(12,2) NOT NULL,
    "fechaEmision"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "estado"           TEXT NOT NULL DEFAULT 'pendiente',
    "pagoId"           TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CobroNelyx_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CobroNelyx_pagoId_key" ON "CobroNelyx"("pagoId");
CREATE INDEX IF NOT EXISTS "CobroNelyx_suscripcionId_idx" ON "CobroNelyx"("suscripcionId");
CREATE INDEX IF NOT EXISTS "CobroNelyx_estado_idx" ON "CobroNelyx"("estado");

ALTER TABLE "CobroNelyx"
  ADD CONSTRAINT "CobroNelyx_suscripcionId_fkey"
  FOREIGN KEY ("suscripcionId") REFERENCES "SuscripcionNelyx"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CobroNelyx"
  ADD CONSTRAINT "CobroNelyx_pagoId_fkey"
  FOREIGN KEY ("pagoId") REFERENCES "PagoNelyx"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Notas:
-- • Todos los clientes existentes con plan "Pro"/"Básico" quedan en "mensual"
--   a $20.000. Si algún cliente debía tener otro plan, ajústalo manualmente
--   desde "Editar suscripción" en /admin/clientes después del deploy.
-- • No se generan cobros retroactivos automáticamente en esta migración; el
--   primer ciclo de sincronización (al cargar /admin/clientes) los creará
--   si corresponde según las fechas migradas.
-- ============================================================================
