# Tests E2E (Playwright)

Smoke tests de navegador real sobre los flujos dorados: login, y que cada
módulo ya auditado cargue sin romperse, más un flujo profundo (registrar una
venta). No reemplazan los tests unitarios de `tests/unit/` (que cubren la
lógica fina) ni las auditorías manuales — cubren la capa que esos dos no
pueden: "¿esto realmente carga en un navegador de verdad, con sesión real?".

Corren contra el servidor de desarrollo de Next apuntando a la misma
Postgres de pruebas que usa Vitest (nunca Supabase/producción — ver
`tests/README.md`).

## Correr localmente

```bash
npm run test:db:setup     # una sola vez (o si cambió el schema)
npm run test:e2e:seed     # crea la cuenta e2e@nelyx.test + 1 producto de prueba
npm run test:e2e          # levanta next dev en :3109 y corre todos los specs
```

Playwright reutiliza un servidor que ya esté corriendo en `:3109` en local
(`reuseExistingServer`); en CI siempre levanta uno nuevo.

Para ver un test específico con el navegador visible:
```bash
npx playwright test tests/e2e/venta.spec.ts --headed
```

## Estructura

- `fixtures.ts` — constantes de la cuenta/producto sembrados (sin lógica).
- `seed.ts` — siembra esa cuenta en la Postgres de pruebas. Se ejecuta aparte
  (`npm run test:e2e:seed`), nunca como efecto secundario de importarlo.
- `helpers.ts` — `login(page)`, reusado por todos los specs.
- `auth.spec.ts` — login correcto, contraseña incorrecta, correo inexistente.
- `smoke-modulos.spec.ts` — cada módulo ya auditado responde 200 y renderiza
  su título real, sin pantalla de error.
- `venta.spec.ts` — flujo profundo: buscar un producto, agregarlo, registrar
  la venta, confirmar el toast de éxito.

## Nota sobre flakiness

`venta.spec.ts` interactúa con un dropdown que se abre y filtra en cada
tecleo — ocasionalmente (~1 de cada 3-4 corridas en este entorno) llega a
fallar por una carrera real entre el renderizado de React y el click, no por
un bug de la app. Por eso `playwright.config.ts` tiene `retries: 1`. Si
vuelve a fallar dos veces seguidas, revisa el trace
(`npx playwright show-trace test-results/.../trace.zip`) antes de asumir que
es "solo flakiness" — podría ser real.

## Agregar un test para un módulo nuevo

1. Si el flujo necesita datos propios (ej. un cliente, una deuda), agrégalos
   a `seed.ts` — no los crees desde la UI dentro del test; hace el test
   lento y frágil.
2. Para un smoke test simple, solo agrega una entrada a la lista `MODULOS`
   en `smoke-modulos.spec.ts`.
3. Para un flujo con interacción real, sigue el patrón de `venta.spec.ts`:
   preferir `getByRole`/`getByPlaceholder`/`getByText` por sobre selectores
   CSS — son más resistentes a cambios de estilo que no cambian el flujo.
