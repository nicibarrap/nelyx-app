# Checklist de auditoría por módulo

Lista de verificación acumulada a partir de las auditorías ya hechas en este
proyecto (Deudas, Cuentas por Cobrar, Venta, Movimientos, Costos Fijos,
Clientes, Proveedores, Alertas, Reportes, Resumen). Cada punto existe porque
ya causó al menos un bug real — no es una lista teórica. Úsala como punto de
partida al auditar un módulo nuevo (Calendario, Aprende, Configuración,
Usuarios) o al revisar cualquier módulo ya auditado después de un cambio
grande.

No reemplaza el pensar — es una lista de "no te olvides de mirar esto",
no una que garantice que el módulo queda perfecto. Ver la sección final
("Qué esta lista NO cubre").

---

## 1. Permisos y control de acceso

- [ ] Toda Server Action que **escribe** (`create`/`update`/`delete`) llama a
      `getSessionEscritura(moduloKey)` (o equivalente que chequee
      `esSoloLectura`), no solo `getSession()`. Un empleado en modo
      solo-lectura no debe poder mutar nada por esta ruta aunque la UI no le
      muestre el botón — el chequeo real vive en el servidor, no en que el
      botón esté oculto.
- [ ] Toda Server Action que **lee** datos de un usuario llama a
      `tieneAcceso(modulosPermitidos, moduloKey)` antes de consultar, si el
      módulo es de los restringibles (`MODULOS_NELYX`).
- [ ] La ruta del módulo está cubierta por `moduloDeRuta` + el middleware, no
      solo protegida "a mano" en la página.

## 2. IDOR — ¿de dónde sale el `userId`?

- [ ] Ninguna Server Action acepta `userId` como parámetro del cliente para
      decidir de quién son los datos. El `userId` real sale de
      `auth()`/`getSession()` en el servidor, nunca de un argumento que el
      cliente podría manipular.
- [ ] Toda query a la base de datos que filtra "los datos de este negocio"
      incluye `userId` (o `cuentaPrincipalId` para empleados) en el `WHERE` —
      no basta con filtrar por `id` del registro, porque dos negocios pueden
      tener ids correlativos adivinables.

## 3. Fechas y zona horaria

- [ ] Ninguna comparación de fechas usa `new Date()` crudo contra fechas
      guardadas si se está decidiendo algo sensible al día calendario en
      Chile (vencido/no vencido, generado/no generado este mes). Usa
      `hoyEnChile()` y `diasEntreChile(a, b)` de `lib/timezone.ts`.
- [ ] Si el módulo filtra o agrupa por mes/año (cualquier cosa con un
      selector tipo `FiltroPeriodo`), el cálculo distingue explícitamente
      "estoy viendo el mes actual" (`esMesActual`) de "estoy viendo un mes
      pasado o futuro". Un cálculo que asume "hoy" sin esa guarda se rompe en
      cuanto el usuario navega el selector a otro mes — esto ya pasó en
      Resumen (costo fijo "próximo" calculado en meses pasados) y en
      `generarCostosDelMes` (generaba costos de días futuros de un mes
      futuro).
- [ ] Si hay un costo/evento recurrente con día de cobro + fecha de término,
      se usa `esAplicableEnMes`/`diaOcurrenciaEnMes` de `lib/costos-fijos.ts`
      — nunca una comparación de solo mes/año que ignore si el día de cobro
      ya pasó la fecha de término dentro del mismo mes (bug original del
      PR #77).

## 4. Lógica de negocio duplicada / desincronizada

- [ ] Antes de escribir una fórmula nueva, buscar si ya existe en
      `lib/financial-engine.ts` (margen, utilidad, costo promedio ponderado,
      valor de inventario) o `lib/utils.ts` (`calcularMetricas`,
      `calcularEstadoDeuda`, variación %, preparación de gráficos). Si el
      módulo recalcula algo "a mano" que ya existe en esos archivos, es una
      fuente de desincronización silenciosa — en algún momento alguien
      corrige el original y el módulo que lo copió queda con la versión
      vieja sin que nadie lo note.
- [ ] Si el módulo clasifica una deuda/venta (vencida, próxima a vencer,
      margen bajo, etc.), compara el criterio exacto contra el de
      `calcularEstadoDeuda`/`clasificarMargenVenta`. Un "vence hoy" que en un
      lugar es "Próxima a vencer" y en otro es "Vencida" es un bug de
      consistencia, no solo de gusto.
- [ ] `calcularMetricas`: confirmar que "gasto" para efectos de utilidad
      incluye `GASTO` + `COSTO_FIJO` + `RETIRO` en todos los lugares que
      agregan movimientos — no solo `GASTO`/`COSTO_FIJO` (bug real en
      Reportes, PR #80).

## 5. Caché / datos derivados que pueden quedar obsoletos

- [ ] Si un campo es un valor derivado y cacheado (ej. `estado` de
      `CuentaPorCobrar`, recalculado con un `updateMany` de efecto lateral al
      visitar una página puntual), cualquier OTRA página que lea ese campo
      directamente puede estar mostrando un valor viejo. Para cualquier
      decisión que importe (contar vencidas, alertar, bloquear), recalcular
      en vivo (como se hizo en Resumen: `fechaVence < hoy && saldoPendiente >
      0`) en vez de confiar en el campo cacheado.
- [ ] Ubicar TODOS los lugares que leen ese campo derivado, no solo el que se
      está tocando — un fix en un solo lugar deja la inconsistencia en los
      demás.

## 6. Estado del lado del cliente

- [ ] Ningún componente cliente guarda datos de un usuario/sesión en estado
      que podría sobrevivir un cambio de sesión (ej. "Cambiar de usuario"
      entre dueño y empleado) sin invalidarse. Si hay un caché en
      cookie/localStorage, confirmar que está atado al id de quien está
      actuando, no solo a que exista una sesión.
- [ ] Componentes con `vista`/datos cacheados en `useState` (ej.
      `grafico-mensual.tsx`) no filtran datos de un usuario a otro ni quedan
      con datos stale al cambiar de período sin refetch.

## 7. Calidad del dato en el cálculo

- [ ] División por cero cubierta (variación %, margen, promedio) — debe
      devolver `null`/`0` con una regla explícita, no `NaN`/`Infinity`
      silencioso.
- [ ] Valores nulos/opcionales (`costo`, `precio`, `fechaVence`) tratados
      explícitamente, no asumidos siempre presentes.

## 8. Seguridad genérica (complementa, no reemplaza, el análisis de negocio)

- [ ] Corrido el escaneo estático (`docs/SECURITY_SCAN_*.md` — Semgrep,
      reglas community js/ts/secrets) después de cambios grandes en
      autenticación, manejo de archivos, o cualquier `$queryRaw`/
      `$executeRaw` nuevo.
- [ ] Cualquier SQL crudo nuevo usa el *tagged template* de Prisma
      (`db.$queryRaw\`...${valor}...\``), nunca concatenación de strings ni
      `$queryRawUnsafe`/`$executeRawUnsafe` con datos de usuario.
- [ ] Cualquier HTML generado con datos de usuario (correos, exportaciones)
      escapa ese dato, aunque el destinatario parezca ser siempre la misma
      persona que lo escribió.

## 9. Automatización disponible (correr, no solo leer)

- [ ] `npm test` (unitarios, `lib/`) en verde.
- [ ] Smoke test E2E del módulo en `tests/e2e/` (Playwright) pasa contra el
      flujo dorado real del módulo, no solo contra mocks.
- [ ] Si el módulo es sensible a volumen (listados, reportes, dashboards con
      agregaciones), probado contra datos sintéticos de volumen real (ver
      `scripts/generar-datos-sinteticos.ts`) — un bug de performance o un
      `LIMIT` faltante no aparece con 5 filas de prueba.

---

## Qué esta lista NO cubre

(Respuesta honesta a "¿implementar esto deja el módulo 100% correcto?": no.)

- **Intención de negocio real del usuario**: la lista detecta inconsistencias
  y patrones de bug conocidos, no si la regla de negocio en sí es la correcta
  para Nelyx (ej. si "concentración top 3 clientes" debería o no incluir
  ventas a crédito — eso se decide con el usuario, no con una checklist).
- **Carga/concurrencia real de producción**: los datos sintéticos ayudan con
  volumen, pero no replican tráfico concurrente real de múltiples negocios al
  mismo tiempo.
- **Todo bug de UI/UX** que no sea un error de cálculo o de permisos (layout
  roto en un dispositivo específico, flujo confuso pero funcionalmente
  correcto).
- **Vulnerabilidades de día cero** en dependencias de terceros — Semgrep
  escanea el código propio, no corre un SCA (`npm audit`/Dependabot) de las
  librerías.
