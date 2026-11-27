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
