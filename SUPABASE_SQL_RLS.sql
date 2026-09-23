-- ============================================================
-- NELYX — Activa Row Level Security (RLS) en todas las tablas
-- Ejecutar en Supabase → SQL Editor
--
-- Por qué: Supabase expone automáticamente una API pública (PostgREST)
-- para cada tabla del schema "public" — independiente de esta app, que
-- nunca la usa (se conecta directo con Prisma vía DATABASE_URL). Sin RLS
-- activado, esa API queda abierta con la llave pública (anon key) del
-- proyecto. Nunca se usó/expuso esa llave en este código, pero activar
-- RLS cierra esa puerta por completo de todas formas — es gratis y no
-- afecta en nada a la app: la conexión de Prisma usa el rol de base de
-- datos, que no está sujeto a RLS (solo lo están los roles "anon" y
-- "authenticated" que usa esa API pública).
--
-- No se agrega ninguna política (policy) a propósito: con RLS activado
-- y CERO políticas, el acceso vía esa API pública queda totalmente
-- denegado para cualquiera — que es exactamente lo que se busca, ya que
-- esta app no depende de esa API en absoluto.
-- ============================================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Movimiento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Producto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Deuda" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PagoDeuda" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CategoriaPersonalizada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostoFijoRecurrente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GeneracionCosto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotaCliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Proveedor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotaProveedor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CuentaPorCobrar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PagoCuenta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventoCalendario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoTarea" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SerieRecurrente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SuscripcionNelyx" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PagoNelyx" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CobroNelyx" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntentoLoginFallido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificacionConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notificacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MovimientoStock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactoCobranza" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlantillaCobranza" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConexionPago" ENABLE ROW LEVEL SECURITY;

-- Verificar — todas deberían mostrar rowsecurity = true
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
