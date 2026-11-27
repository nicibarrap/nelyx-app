# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nelyx is a Spanish-language, multi-tenant SaaS for small-business finance and operations in Chile (sales/POS, stock, debts, receivables, fixed costs, cash-register closing, reports, support chat, Nelyx's own subscriptions). Stack: Next.js 15 (App Router, Turbopack in dev), React 18, NextAuth v5 (beta, credentials), Prisma 5 on PostgreSQL (Supabase in production), Tailwind, Sentry, Vercel (Blob, cron). Code, comments, identifiers and UI copy are in Spanish — match that.

## Commands

```bash
npm run dev                 # next dev --turbopack
npm run build               # prisma generate && next build
npx tsc --noEmit -p .       # type check (CI runs this; tsconfig has strict: false)
npm test                    # vitest run (needs local Postgres, see below)
npx vitest run tests/unit/permisos-logica.test.ts   # single test file
npx vitest run -t "nombre del test"                 # single test by name
npm run test:watch
npm run db:push | db:migrate | db:seed              # Prisma
npm run test:db:setup       # apply Prisma schema to the test DB
npm run test:e2e:seed && npm run test:e2e           # Playwright (starts next dev on :3109)
npm run audit:prod          # npm audit --omit=dev
```

Tests hit a **real local Postgres**, never Supabase/production. `npm test` hard-codes `DATABASE_URL=postgresql://nelyx_test:nelyx_test@localhost:5432/nelyx_test`. First-time setup (role `nelyx_test`, DB `nelyx_test`, `sudo service postgresql start`) is in `tests/README.md`. Vitest runs with `fileParallelism: false` because integration tests share the DB; `tests/setup.ts` truncates a fixed table list before each test — **add new tables with no cascade from `User` to `TABLAS_A_LIMPIAR` there**. E2E uses `/opt/pw-browsers/chromium` and one retry for a known dropdown race (`tests/e2e/README.md`).

CI (`.github/workflows/tests.yml`) runs: `tsc --noEmit`, `npm audit --omit=dev --audit-level=critical`, Semgrep (ERROR severity only, over `app lib components middleware.ts`), `prisma db push`, `vitest run`.

Synthetic-data scripts (`npm run datos-sinteticos:generar|limpiar`) refuse non-localhost DBs without `-- --si-produccion` (`scripts/README.md`).

## Architecture

**Tenancy and roles.** A `User` with `cuentaPrincipalId = null` is an account owner (`rol` USER, or ADMIN for Nelyx staff). A `User` with `cuentaPrincipalId != null` is an *empleado* (PIN login) who sees the owner's data restricted by `modulosPermitidos`. Almost every data model hangs off the owner's `userId`; server code must resolve the owning account id for employees rather than using the session user id directly.

**Permissions (`lib/permisos.ts`)** is the single source of truth for modules (`MODULOS_NELYX`). `modulosPermitidos: null` = full access; otherwise keys, with suffixes `:ro` (read-only) and `:eliminar` (may delete) encoded in the same array to avoid migrations. Enforcement is layered:
- `middleware.ts` (Node runtime) re-reads `activo`/`modulosPermitidos` from the DB on every `/dashboard` and `/admin` navigation (deliberately uncached so suspensions apply immediately), redirects to `/auth/forzar-salida` or `/dashboard/sin-permiso`, and gates `/admin` to non-employee ADMINs.
- **Server Actions bypass the middleware** (it skips requests with the `next-action` header), so every mutating action must re-check permissions itself. In `app/actions/acciones.ts` use `getSessionEscritura(moduloKey)` for anything that creates/edits/deletes, `getSession()` only for reads; other action files follow the same pattern. `verificarCuentaActivaOExpulsar` (`lib/sesion-activa.ts`) rejects deactivated accounts.
- The floating "soporte" chat widget is a pseudo-module with no route, gated in `app/dashboard/layout.tsx`.

**Business logic placement.** `app/actions/*-acciones.ts` are `"use server"` files (grouped by domain: caja, pagos, cobranza, suscripciones, soporte, etc.). Pure, DB-free logic lives in `lib/*.ts` (`*-logica` naming for the tested ones) and is unit-tested in `tests/unit/`; DB-backed behaviour is tested in `tests/integration/`. All financial math (CPP cost, margin, profit) must go through `lib/financial-engine.ts` — never recompute it in components or actions. Stock changes go through `lib/stock.ts` (`registrarMovimientoStock`) and FIFO lots through `lib/lotes.ts`; dates use Chile timezone helpers in `lib/timezone.ts`. Caja closing (`lib/caja.ts`) only counts movements whose `metodoPago` is exactly `"Efectivo"`, so any code creating a `Movimiento` must set `metodoPago`.

**Payments (`lib/pagos/`)**: provider adapters for Mercado Pago, SumUp, BCI Pagos, TUU and Transbank; per-business credentials are stored encrypted (`lib/crypto-pagos.ts`, needs `PAGOS_ENCRYPTION_KEY`). SumUp webhook at `app/api/webhooks/sumup/route.ts`. Nelyx's own customer subscriptions/plans (`SuscripcionNelyx`, `PlanNelyx`, `PagoNelyx`) are separate from the owners' point-of-sale payments.

**Background/AI/notifications.** `app/api/cron/notificaciones/route.ts` is protected by `CRON_SECRET` (stock alerts, collection/calendar/birthday reminders, attachment cleanup). Web push via `lib/push.ts` (VAPID), email via Resend (`lib/email.ts`), file uploads to Vercel Blob. Anthropic-backed features (`lib/soporte-ia.ts`, `lib/emoji-ia.ts`, `lib/comprobante-ia.ts`) are optional and must degrade silently when `ANTHROPIC_API_KEY` is unset. See `.env.example` for every env var and what breaks without it.

**Database.** Source of truth is `prisma/schema.prisma`. The root `SUPABASE_SQL_*.sql` files are hand-run migration scripts for the production Supabase project (applied via its SQL Editor), not part of an automated pipeline — a schema change typically needs both a Prisma model change and a matching SQL file. `SUPABASE_SQL_RLS.sql` enables RLS on all tables (Prisma connects with a role not subject to RLS), so new tables need it too.

**Observability.** Sentry via `instrumentation.ts` / `sentry.server.config.ts` / `instrumentation-client.ts`; deliberately not enabled on the edge runtime. See `SENTRY_SETUP.md`.

## Conventions worth knowing

- `docs/AUDITORIA_CHECKLIST.md` lists bug classes that have each occurred before (permission gaps on Server Actions, missing `metodoPago`, cross-module assumptions, IDOR). Consult it when adding or auditing a module.
- `next.config.js` sets security headers but intentionally has **no CSP** (it would break the barcode camera scanner, service worker and Sentry without browser testing); camera is allowed via `Permissions-Policy`.
- `NEXT_PUBLIC_BUILD_ID` (from `VERCEL_GIT_COMMIT_SHA`) lets the client detect a newer deploy.

## Cómo trabajar en Nelyx (reglas del dueño)

Esta sección complementa el resto de este archivo y `docs/AUDITORIA_CHECKLIST.md`
— no los reemplaza. Ante un conflicto, gana lo más específico: un bug ya
documentado en el checklist, o una convención ya establecida en el resto de
este archivo, pesa más que una regla general de acá.

### Antes de implementar

- **Entender antes de tocar código.** Leer el módulo y los archivos
  relacionados, y buscar si ya existe un patrón equivalente (un modal
  parecido, un flujo de pago parecido, una fórmula en
  `lib/financial-engine.ts` o `lib/utils.ts`) antes de escribir algo nuevo
  — ver checklist §4. Ninguna abstracción nueva si ya hay una.
- **Ante un cambio ambiguo o grande** (toca el modelo de datos, cambia un
  flujo de negocio, afecta a más de un módulo, o hay más de una forma
  razonable de resolverlo): parar y preguntar antes de construir, con una
  recomendación concreta y el principal trade-off — no una lista abierta de
  opciones. Un bug claro y acotado, o un pedido explícito y puntual, se
  hace derecho, sin preguntar de más.
- **Planificar el alcance en voz alta** cuando el pedido se presta a
  interpretaciones de tamaño muy distinto ("mejora X"): proponer fases (ej.
  "fase 1: arreglo seguro ahora; fase 2: una decisión de fondo entre A y
  B") en vez de adivinar cuánto construir.

### Definición de terminado

**Antes de pushear:**
- [ ] `npx tsc --noEmit -p .` limpio.
- [ ] `npm run build` limpio (CI no lo corre — es una verificación extra,
      no asumir que "CI en verde" ya lo cubrió).
- [ ] `npx vitest run` completo en verde — no alcanza con el archivo nuevo;
      algo que parece aislado puede compartir una tabla, una notificación o
      un helper con otro módulo (checklist §4 y §5).
- [ ] Si se tocó una pantalla o componente visual: revisado en **celular
      (~390px), tablet (~820px) y escritorio (~1440px)**, con el servidor
      real en el navegador — el código "se ve razonable" no alcanza. Si el
      cambio toca un modal, bottom-sheet o cualquier overlay `fixed`,
      probarlo con el contenido real más largo que pueda tener (ej. un
      comprobante en revisión + motivo de rechazo), no solo el caso vacío.
- [ ] Estados de carga, vacío y error cubiertos explícitamente — este
      proyecto no tiene un componente compartido de "vacío" ni de
      "cargando": cada pantalla lo resuelve inline (`useTransition` + un
      `pending` que deshabilita el botón y cambia su texto es el patrón ya
      establecido para acciones; para "sin datos todavía", seguir el tono
      del resto de esa misma pantalla).
- [ ] Permisos y aislamiento de datos: si el cambio agrega o toca una
      Server Action, repasar checklist §1 (¿usa `getSessionEscritura` si
      escribe?) y §2 (¿el `userId` sale de la sesión, nunca de un
      parámetro?) línea por línea, no por asunción.
- [ ] Si el cambio modifica `prisma/schema.prisma`: va acompañado de un
      `SUPABASE_SQL_<NOMBRE>.sql` nuevo en la raíz con el SQL exacto
      aplicado — convención ya establecida en este proyecto, no una idea
      nueva. Si la tabla es nueva, incluye
      `ALTER TABLE "..." ENABLE ROW LEVEL SECURITY;` (sin políticas, mismo
      patrón que `SUPABASE_SQL_RLS.sql`) — sin esa línea la tabla queda
      expuesta por la API pública de Supabase aunque la app nunca la use.
      **La migración se aplica en producción ANTES de fusionar el código
      que la usa.** Cualquier SQL que borre o modifique datos existentes
      (`DROP`, `DELETE`, `UPDATE` masivo) requiere el ok explícito del
      dueño antes de correrlo — nunca se asume. Aviso en el chat
      exactamente qué se aplicó a producción y cuándo, antes de dar el
      cambio por terminado.
- [ ] Conexión con el resto de la app: ¿algo que ya mostraba este dato (un
      contador, una métrica, una notificación) necesita enterarse del
      cambio? (checklist §5). ¿Corresponde sumar o actualizar un spec en
      `tests/e2e/` (`smoke-modulos.spec.ts` u otro) para la pantalla nueva
      o tocada?
- [ ] Sin errores ni warnings nuevos en la consola del navegador en el
      flujo que se tocó.

**Antes de avisar que está listo para fusionar:**
- [ ] PR abierta, CI real en verde (tsc, `npm audit`, Semgrep, tests —
      no solo mis verificaciones locales) y sin conflictos.

### Cómo te reporto al terminar

1. **Qué cambió** — 2 a 4 líneas, sin jerga: qué problema resolvía y qué
   hace ahora.
2. **Cómo probarlo, paso a paso** — separando "como cliente" vs "como
   admin" y "en celular" vs "en PC" cuando corresponda, con la navegación
   completa (menú → pantalla → sección), nunca "anda a Configuración" a
   secas.
3. **Riesgos o cosas que no pude verificar de verdad** — ej. "no probé
   esto con un comprobante real de un banco chileno, solo con una imagen
   cualquiera" o "esto corre en producción recién la próxima vez que [tal
   cron/página] se ejecute, no al instante". Nunca reporto algo como
   probado si solo lo revisé leyendo el código.
4. **Recomendaciones** — de organización, flujo, diseño, seguridad o
   datos, cuando el pedido las amerite — separadas con claridad de lo que
   ya se hizo, para que quede claro qué es el cambio y qué es una
   sugerencia a futuro.

### Aprendizajes

Cada vez que reportes un fallo que debería haberse evitado, se agrega acá
una regla concreta y corta — con fecha — para no repetirlo. No es una
lista de buenas intenciones: solo entran cosas que de verdad pasaron.

- **2026-11-26** — El cobro de cada ciclo se generaba recién el día exacto
  del vencimiento, así que una cuenta en "Próximo a vencer" no tenía nada
  que pagar todavía. Regla: cualquier objeto "pendiente" sobre el que el
  usuario deba poder actuar tiene que existir desde que se le muestra el
  aviso, no después.
