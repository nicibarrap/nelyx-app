# Escaneo de seguridad estático — 2026-11-13

Re-corrida de `docs/SECURITY_SCAN_2026-10-06.md`, mismo método: Semgrep CLI
(instalado vía pip en este entorno), mismos rulesets `javascript`,
`typescript` y `generic/secrets` clonados directo de
[`semgrep/semgrep-rules`](https://github.com/semgrep/semgrep-rules), mismo
alcance (`app/`, `lib/`, `components/`, `middleware.ts`, sin tests).

## Resultado

784 coincidencias (antes 687) — el crecimiento es solo volumen de código
nuevo desde octubre (Caja, Usuarios, Costos Fijos). De esas, 740 son el
mismo ruido de siempre (`jsx-not-internationalized`, i18n — Nelyx no lo
necesita).

Los dos hallazgos de seguridad reales de octubre siguen ahí, sin cambios
en su veredicto, solo movidos de línea por el código agregado desde
entonces:

| Regla | Dónde (antes → ahora) | Veredicto |
|---|---|---|
| `express.security.audit.unknown-value-in-redirect` | `middleware.ts:36` → `:40` | Sigue siendo falso positivo — destino fijo, nunca viene del usuario (ver octubre). |
| `lang.security.html-in-template-string` | `lib/email.ts:78` → `:92` | Sigue siendo el mismo impacto bajo y autodirigido (ver octubre); el fix de una línea sugerido en octubre sigue sin aplicarse, sigue sin ser urgente. |

**Ningún hallazgo de seguridad nuevo** en el código agregado desde
octubre (Caja, bitácora de Usuarios, rediseño de Costos Fijos). No se
repitió la verificación manual complementaria de octubre (SQL
raw/XSS/secretos/headers) porque no cambió nada en esas áreas desde
entonces — sigue vigente tal cual.

## Qué NO cubre este escaneo

Mismo que octubre: Semgrep no encuentra bugs de lógica de negocio. Esos
siguen viviendo en la auditoría módulo por módulo de
`docs/AUDITORIA_CHECKLIST.md` — la de esta fecha encontró y corrigió uno
real en Costos Fijos/Caja (`metodoPago` nunca se guardaba en los
movimientos de costo fijo, así que un costo fijo pagado en efectivo nunca
se restaba del cierre de caja).
