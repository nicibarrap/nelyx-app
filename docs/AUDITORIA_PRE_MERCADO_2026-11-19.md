# Auditoría final pre-mercado (2026-11-19)

Auditoría completa de la plataforma antes de ofrecerla a negocios reales,
pedida explícitamente como "la última auditoría antes de ofrecerla al
mercado". Cubre lo que `AUDITORIA_CHECKLIST.md` no cubre por diseño
(intención de negocio, legal, rendimiento a escala) más una pasada
transversal de seguridad e integraciones — no repite la auditoría módulo
por módulo ya documentada ahí.

**Veredicto: lista para salir al mercado.** Sin hallazgos críticos en
seguridad, pagos, permisos, rendimiento ni integraciones. Los hallazgos de
abajo son ajustes concretos, ninguno bloqueante.

## Fase 1 — Seguridad y pagos

**Credenciales de pago: bien implementado.**
- Cifrado en reposo correcto (`lib/crypto-pagos.ts`: AES-256-GCM, IV
  aleatorio, `authTagLength` explícito, clave de 32 bytes desde
  `PAGOS_ENCRYPTION_KEY`, sin fallback a texto plano).
- `obtenerConexionesPago()` (`pagos-acciones.ts:42-48`) nunca envía el
  token completo al cliente.
- Todo lookup de `ConexionPago`/`CobroSumup` filtra por `userId` de la
  sesión — sin IDOR.
- Sin fugas de credenciales en logs (`console.*`/Sentry).

**Hallazgos:**
- **[Medio] Sin rate-limit en conexión de pagos.** `probarConexionTuu`,
  `listarTerminalesParaConectar`, `listarLectoresParaConectarSumup` no
  tienen límite de intentos (a diferencia del login). Requiere sesión
  Nelyx válida, pero permite usar una cuenta real como proxy para probar
  credenciales de pago robadas contra Mercado Pago/SumUp/TUU.
- **[Medio] `BLOB_READ_WRITE_TOKEN` mal clasificada en Vercel.** Marcada
  "Encrypted" en vez de "Sensitive" — Vercel la señala con
  `securityIssues: ["readable-secret"]`. Única variable del proyecto con
  ese problema. Fix de 1 minuto en el dashboard de Vercel.
- **[Bajo, falso positivo confirmado] Semgrep:** nuevo hallazgo
  `js-open-redirect-from-function` en `navegacion-provider.tsx:44`
  (introducido por la navegación dura del PR #174/#176) — verificado que
  el único origen del `href` es la lista fija `MODULOS_NELYX`, nunca input
  de usuario.
- **[Bajo] npm audit:** 2 entradas nuevas (`fast-uri`, `glob`), ambas
  solo vía `@sentry/webpack-plugin` en build time, nunca en runtime con
  tráfico real. Mismo criterio ya aceptado para otras dependencias de build.

**Sin hallazgos:** SQL crudo (cero `$queryRawUnsafe`/`$executeRawUnsafe`
con datos de usuario), webhook de SumUp (sin firma, pero bien mitigado con
token de un solo uso + validación cruzada + respuesta sin fuga de info).

## Fase 2 — Módulos sin auditar (`productos`, `aprende`)

**`productos`:**
- **[Medio] IDOR en `proveedorId`.** `registrarMovimientoStock`
  (`lib/stock.ts:179`) guarda `proveedorId` sin validar que pertenezca al
  `userId` de la sesión, a diferencia del resto del código. Sin fuga real
  hoy (nadie lee esa relación de vuelta), pero inconsistente.
- **[Bajo] Función de valor de inventario sin usar.**
  `calcularValorInventario` (`lib/financial-engine.ts:58`), declarada como
  "fuente oficial", no tiene ningún caller en el repo — el cálculo real
  está duplicado a mano en `productos-client.tsx:930-934` con lógica de
  conversión de unidades distinta. Riesgo: una corrección futura a la
  función oficial nunca llegaría a la pantalla real.
- **[Bajo] Dos Server Actions de solo lectura sin chequeo de módulo**
  (`buscarProductoPorCodigoBarras`, `obtenerEmojiSugeridoIA`) — no exponen
  datos del negocio, solo utilidades cosmética/autocompletado.
- **[Bajo] `ProductoWizard` sin `createPortal`** — no reproduce el bug
  visual conocido hoy (su árbol de montaje no tiene el disparador), pero
  es el único modal del proyecto sin el patrón defensivo ya adoptado.
- **[Bajo] Cobertura E2E débil** — solo un smoke genérico, sin flujo
  dorado real (crear producto → ajustar stock → vender).

**`aprende`:** contenido estático de solo lectura, sin datos de usuario
que proteger. Gateo de módulo correcto (`MODULOS_NELYX`, middleware). Único
gap: ni siquiera tiene el smoke test genérico en `tests/e2e/`.

## Fase 3 — Integraciones de terceros

- **[Medio-alto] Import masivo de productos sin `maxDuration`.**
  `app/dashboard/productos/importar/page.tsx` no tiene override de
  duración (a diferencia de `venta/page.tsx`, que sí lo tiene en 100s), y
  `importarProductosMasivo` (`acciones.ts:1069-1100`) procesa filas en un
  `for` secuencial sin batch. Con un archivo grande (cerca de 2000 filas)
  es candidato real a cortarse por timeout.
- **[Medio] Invitación de empleado no avisa si el email falla.**
  `enviarEmail` devuelve `{ ok: true }` aunque Resend falle; en
  recuperación de contraseña es intencional (no revela si la cuenta
  existe), pero en invitación de empleado el dueño no tiene ninguna señal
  en la UI de que el correo nunca llegó.
- **[Medio] `CRON_SECRET` sin documentar, sin señal si falta.** Si no está
  seteada, `autorizado()` en `app/api/cron/notificaciones/route.ts:14`
  devuelve `false` silenciosamente — alertas de stock, recordatorios de
  cobranza, etc. dejarían de salir sin que nadie lo note.
- **[Sin confirmar] Pooling de Postgres.** `DATABASE_URL` es tipo
  "Sensitive" en Vercel (de solo-escritura, irrecuperable incluso con
  autorización) — no se pudo confirmar si usa el connection pooler
  (puerto 6543/`pgbouncer=true`) o la conexión directa (5432). Recomendado:
  volver a copiar la URL del "Transaction pooler" desde Supabase → Settings
  → Database y reemplazarla en Vercel, sin costo aunque ya estuviera bien.
- **[Bajo] `.env.example` incompleto** — faltan `CRON_SECRET`,
  `VAPID_*`, `BCIPAGOS_API_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.

**Sin hallazgos:** Sentry (DSN en env vars, bien instrumentado, catches no
silenciosos), push notifications (limpia suscripciones inválidas), código
huérfano en `app/api/`.

## Fase 4 — Rendimiento a escala real + UX/legal

**Rendimiento:** medido con datos sintéticos reales (4.000 movimientos, 60
productos, 120 clientes, 14 meses de historia) contra un build de
producción local. Todas las pantallas (resumen, reportes, alertas, caja,
productos, movimientos, cuentas por cobrar, deudas, clientes, calendario)
cargaron entre 27ms y 142ms — muy por debajo de cualquier umbral de
preocupación. Nota: este volumen es razonable para un negocio chico-mediano
activo; si el negocio crece mucho más, vale la pena repetir la medición.

**UX:** sin hallazgos reales en las 4 pantallas revisadas — los "errores
de consola" iniciales resultaron ser bloqueos del sandbox de auditoría a
un CDN de emojis, no bugs de la app (el componente ya tiene fallback y
circuit-breaker correctos).

**Legal — dos hallazgos reales:**
- **[Medio] Política de Privacidad incompleta.** Solo menciona
  Transbank/Mercado Pago como proveedores de pago; TUU, SumUp y BCI Pagos
  (activos en el código desde antes de la última actualización de la
  política) no aparecen mencionados.
- **[Medio] Sin Términos y Condiciones** en ningún lado del repo —
  esperable para un SaaS que procesa pagos de terceros.

## Resumen de acción

| # | Hallazgo | Severidad | Tipo | Estado |
|---|---|---|---|---|
| 1 | Import masivo sin `maxDuration` | Medio-alto | Código | ✅ Resuelto |
| 2 | Política de Privacidad incompleta (faltan 3 de 5 proveedores) | Medio | Legal | ✅ Resuelto |
| 3 | Sin Términos y Condiciones | Medio | Legal | ✅ Resuelto (`/legal/terminos`) |
| 4 | Sin rate-limit en conexión de pagos | Medio | Código | ✅ Resuelto (en memoria, por usuario) |
| 5 | `BLOB_READ_WRITE_TOKEN` mal clasificada en Vercel | Medio | Config | ✅ Resuelto |
| 6 | IDOR en `proveedorId` de movimientos de stock | Medio | Código | ✅ Resuelto |
| 7 | Invitación de cliente nuevo sin aviso de fallo de email (`enviarInvitacionCliente`, panel admin) | Medio | Código | ✅ Resuelto |
| 8 | `CRON_SECRET` sin documentar/sin señal si falta | Medio | Código/Docs | ✅ Resuelto |
| 9 | Confirmar pooler de Postgres en `DATABASE_URL` | Sin confirmar | Config | ✅ Resuelto (reemplazada por la URL del Transaction pooler, verificado sin errores en producción) |
| 10 | Función `calcularValorInventario` sin usar (código muerto) | Bajo | Código | ✅ Resuelto (eliminada — nunca se usó, y no era intercambiable con el cálculo real de `productos-client.tsx`, que sí maneja conversión de unidades) |
| 11 | `ProductoWizard` sin `createPortal` | Bajo | Código | ✅ Resuelto |
| 12 | Cobertura E2E débil en `productos`/`aprende` | Bajo | Tests | ✅ Resuelto (`aprende` en el smoke test; flujo completo de crear producto + ajustar stock en `tests/e2e/productos.spec.ts` — "vender" ya estaba cubierto por `venta.spec.ts`) |
| 13 | `.env.example` incompleto | Bajo | Docs | ✅ Resuelto |

Nota sobre el punto 9: `DATABASE_URL` era tipo "Sensitive" en Vercel —
irrecuperable incluso con autorización explícita, ni por la API ni desde el
dashboard — así que no se pudo confirmar cuál estaba configurada antes del
cambio. El dueño reemplazó el valor directo por la URL del "Transaction
pooler" de Supabase (puerto 6543, `?pgbouncer=true`) y se confirmó, tras
redeploy, que la app sigue funcionando sin errores de runtime.
