-- ============================================================================
-- MIGRACIÓN: Comprobante de pago del cliente + datos bancarios de Nelyx
-- Ejecutar COMPLETO en el SQL Editor de Supabase ANTES de desplegar el código
-- (PR #188: comprobante de pago + revisión del admin; PR #190: ayuda con IA
-- al revisar un comprobante).
--
-- Nota: esta migración ya se aplicó a producción directo (sin este archivo)
-- al construir esas PRs. Este archivo se agrega después, reconstruido desde
-- el estado real de la base, para dejar un registro — ver CLAUDE.md, sección
-- "Cómo trabajar en Nelyx (reglas del dueño)".
-- ============================================================================

-- 1) Nuevas columnas en PagoNelyx — comprobante que el cliente adjunta al
--    reportar un pago, y su revisión por el admin.
ALTER TABLE "PagoNelyx" ADD COLUMN IF NOT EXISTS "estado" TEXT NOT NULL DEFAULT 'pagado';
ALTER TABLE "PagoNelyx" ADD COLUMN IF NOT EXISTS "comprobanteUrl" TEXT;
ALTER TABLE "PagoNelyx" ADD COLUMN IF NOT EXISTS "comprobanteExpiraEn" TIMESTAMP(3);
ALTER TABLE "PagoNelyx" ADD COLUMN IF NOT EXISTS "motivoRechazo" TEXT;

-- 2) Monto que la IA detectó leyendo el comprobante (lib/comprobante-ia.ts)
--    — solo una ayuda visual para el admin al revisar, nunca aprueba el pago.
ALTER TABLE "PagoNelyx" ADD COLUMN IF NOT EXISTS "montoDetectadoIA" DECIMAL(12,2);

-- 3) Nueva tabla: datos bancarios de Nelyx (el proveedor, no de cada negocio
--    cliente) — una sola fila, editable solo por el admin desde
--    /admin/clientes, que se le muestra a todos los clientes en
--    "Mi suscripción" para que transfieran el pago mensual.
CREATE TABLE IF NOT EXISTS "DatosBancariosNelyx" (
    "id"            TEXT NOT NULL,
    "banco"         TEXT NOT NULL DEFAULT '',
    "tipoCuenta"    TEXT NOT NULL DEFAULT '',
    "numeroCuenta"  TEXT NOT NULL DEFAULT '',
    "rutTitular"    TEXT NOT NULL DEFAULT '',
    "nombreTitular" TEXT NOT NULL DEFAULT '',
    "email"         TEXT NOT NULL DEFAULT '',
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatosBancariosNelyx_pkey" PRIMARY KEY ("id")
);

-- 4) RLS — ver SUPABASE_SQL_RLS.sql. DatosBancariosNelyx quedó afuera de ese
--    archivo cuando se creó esta tabla; se agregó ahí (no acá) el 2026-11-27
--    al encontrarse el hueco, junto con PlanNelyx (que tampoco la tenía y es
--    anterior a esta migración).
