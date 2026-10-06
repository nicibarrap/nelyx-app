# Escaneo de seguridad estático — 2026-10-06

Herramienta: [Semgrep](https://semgrep.dev) CLI 1.179.0 (gratis, reglas community),
corrido localmente con los rulesets `javascript`, `typescript` y `generic/secrets`
del repo público [`semgrep/semgrep-rules`](https://github.com/semgrep/semgrep-rules)
(no se usó `semgrep.dev/c/auto` porque este entorno no tiene salida a ese dominio —
las reglas se clonaron directo desde GitHub, mismo contenido, $0 de costo).

Alcance: `app/`, `lib/`, `components/`, `middleware.ts` (136 archivos). Se excluyó
`node_modules`, `.next` y archivos de test.

## Resultado

426 reglas corridas, 687 coincidencias totales — pero **640 de esas 687** son un
solo hallazgo repetido sin relevancia para este proyecto: `jsx-not-internationalized`
(sugiere usar `i18next` en vez de strings literales en JSX). Nelyx es una app en
español para Chile, sin plan de internacionalización, así que se descarta como ruido
en su totalidad.

De las ~47 coincidencias restantes, ninguna fue una vulnerabilidad real. El detalle:

| Regla | Dónde | Severidad Semgrep | Veredicto |
|---|---|---|---|
| `express.security.audit.unknown-value-in-redirect` | `middleware.ts:36` | WARNING | **Falso positivo.** El destino del redirect es un literal fijo (`"/dashboard/resumen"` o `"/auth/login"`), nunca un valor que llegue desde el usuario — no hay open redirect. |
| `lang.security.html-in-template-string` | `lib/email.ts:78-82` | WARNING | **Impacto bajo, no una vulnerabilidad explotable.** `botonCorreo()` interpola `url`/`texto` sin escapar en el HTML del correo. Se verificó cada punto donde se llama (`correoInvitacion`, `correoRecuperarPassword` en `app/actions/password-reset-acciones.ts`): el campo que se interpola es `user.nombre`, y el correo siempre se envía al mismo usuario dueño de ese nombre — en el peor caso alguien inyecta HTML en su propio correo de invitación/recuperación, no en el de otra persona. Igual, es un fix de una línea (ver recomendación abajo). |
| `javascript-confirm`, `no-replaceall`, `missing-template-string-indicator`, `react-props-spreading`, `useless-ternary`, etc. | varios | INFO | Estilo/correctness, no seguridad. Revisados por muestreo, sin hallazgos de impacto. |

## Verificación manual complementaria (fuera del alcance de las reglas genéricas)

- **Inyección SQL**: único uso de `$queryRaw` crudo en código de producción es
  `lib/stock.ts:57-58` — usa el *tagged template* de Prisma (`tx.$queryRaw\`...${var}...\``),
  que parametriza automáticamente. No es concatenación de strings → no es inyectable.
  El único `$executeRawUnsafe` del repo está en `tests/setup.ts` (limpieza de tablas
  fijas entre tests, nunca alcanzable desde la app). Sin hallazgos.
- **XSS vía `dangerouslySetInnerHTML`**: 3 usos, todos en `app/layout.tsx`, los tres
  con contenido 100% estático (scripts de migración de tema, auto-reload tras deploy,
  registro del service worker) — ningún dato de usuario se interpola ahí. Sin hallazgos.
- **Secretos hardcodeados**: 0 coincidencias con el ruleset `generic/secrets`. `.env`
  y `.env*.local` están en `.gitignore` y no están trackeados por git.
- **Encabezados de seguridad del navegador** (`next.config.js`): ya configurados
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`. Falta
  `Content-Security-Policy`, pero está dejado fuera deliberadamente (comentario en el
  propio archivo) porque una CSP mal armada rompería el service worker, el scanner de
  código de barras y Sentry sin aviso — correcto postergarla hasta poder probarla
  visualmente en el navegador, no es un hallazgo de este escaneo.
- **Subida/lectura de archivos**: no hay escritura a disco desde input de usuario
  (`lib/importacion-productos.ts` solo parsea en memoria). Sin hallazgos de path
  traversal.

## Recomendación (opcional, no bloqueante)

Escapar `nombre` y `texto` antes de interpolarlos en `lib/email.ts` (`botonCorreo`,
`plantillaCorreo`), por ejemplo con una función mínima que reemplace `<`, `>`, `&`.
Costo: ~5 líneas, cero riesgo de romper nada. No es urgente — el impacto real es
autodirigido — pero es una buena práctica de defensa en profundidad.

## Qué NO cubre este escaneo

Semgrep (y cualquier analizador estático) encuentra **patrones de código conocidos
como peligrosos** (inyección, XSS, secretos, etc.) — no encuentra bugs de lógica de
negocio como los que han aparecido en las auditorías manuales de este proyecto
(permisos faltantes, fechas mal comparadas, cálculos duplicados que se desincronizan).
Esos siguen requiriendo la auditoría módulo por módulo descrita en
`docs/AUDITORIA_CHECKLIST.md`.
