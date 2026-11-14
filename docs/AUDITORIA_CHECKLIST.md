# Checklist de auditoría por módulo

Lista de verificación acumulada a partir de las auditorías ya hechas en este
proyecto (Deudas, Cuentas por Cobrar, Venta, Movimientos, Costos Fijos,
Clientes, Proveedores, Alertas, Reportes, Resumen, Caja, Usuarios,
Calendario, Configuración). Cada punto existe porque ya causó al menos un
bug real — no es una lista teórica. Úsala como punto de partida al auditar
un módulo nuevo (Aprende) o al revisar cualquier módulo ya auditado después
de un cambio grande.

Caja (2026-11-13) encontró uno: `crearCostoUnico` y `marcarCostoPagado`
(los dos únicos caminos que crean un Movimiento tipo COSTO_FIJO) nunca
guardaban `metodoPago` — el campo quedaba `null`, así que un costo fijo
pagado en efectivo nunca se restaba del cierre de caja (`lib/caja.ts` solo
cuenta movimientos con `metodoPago === "Efectivo"` exactamente). Es el
mismo patrón de la categoría §4 de abajo: un módulo nuevo (Caja) depende de
una señal que un módulo más viejo (Costos Fijos) nunca llenó. Usuarios se
revisó a fondo y ya estaba bien defendido (IDOR, rate-limit en PIN,
atribución por nombre) — sin hallazgos nuevos.

Calendario/Configuración (2026-11-14) encontró otro del mismo patrón que
Caja/Costos Fijos, pero en permisos (§1): `crearProyectoTarea`,
`editarProyectoTarea` y `eliminarProyectoTarea` (las categorías de tareas
del Calendario) solo se administran desde Configuración → Categorías —
Calendario únicamente deja asignar un proyecto ya existente a una tarea,
nunca crear/editar/eliminarlos — pero las tres acciones exigían el módulo
"calendario" en vez de "configuracion" (arrastre de cuando esa pantalla
vivía dentro de Calendario, antes del PR #154 que la movió a
Configuración). Un empleado con Configuración pero sin Calendario veía los
botones en pantalla y cualquier click fallaba con "No tienes acceso a este
módulo". Lección: cuando una pantalla se muda de módulo, sus Server
Actions hay que revisarlas una por una — no basta con mover el componente.
El resto de Configuración (Notificaciones, Cobranza, Pagos,
Automatizaciones, Categorías de Productos/Gastos/Costos Fijos, Privacidad)
ya gatea correctamente, en algunos casos a propósito con el módulo "dueño"
de la herramienta en vez de "configuracion" (ver el comentario de
`cobranza-acciones.ts`). El resto de Calendario (recurrencia de tareas,
zona horaria, IDOR) ya estaba bien cubierto por tests existentes — sin
otros hallazgos.

**Usuarios/sesión (2026-11-14) — el más grave encontrado hasta ahora,
reportado por el propio dueño probando en producción.** Dar (o quitar) un
módulo a un empleado YA logueado no tenía ningún efecto hasta que volvía a
iniciar sesión: el ícono del módulo nuevo aparecía en el menú (el layout
del dashboard sí consulta la DB fresca para armarlo), pero entrar, o
cualquier Server Action de esa pantalla, seguía rechazando con "No tienes
acceso a este módulo" — porque `session.user.modulosPermitidos` viene del
JWT, y el callback `jwt()` de `lib/auth.ts` solo lo recalcula al iniciar
sesión. El middleware YA resolvía esto para la navegación (consulta
`/api/check-session` fresco en cada request a `/dashboard`), pero a ese
`fetch()` le faltaba `cache: "no-store"` — Next.js cachea `fetch()` por
defecto, así que el propio mecanismo pensado para evitar la caché podía
terminar sirviendo una respuesta vieja igual. Y aunque la navegación
funcionara, **ninguna Server Action se beneficiaba de ese fix** — cada
`getSessionEscritura(moduloKey)` de toda la plataforma sigue leyendo
`session.user.modulosPermitidos` directo, nunca la DB. El arreglo real fue
en `verificarCuentaActivaOExpulsar` (`lib/sesion-activa.ts`), que YA
corre al principio de todo `getSession()`/`getSessionEscritura()` de cada
módulo: ahora también relee `modulosPermitidos` fresco de la DB y
reemplaza el valor del JWT en la sesión en memoria, antes de que cualquier
chequeo de permisos lo use — un solo cambio que corrige el problema para
todos los módulos a la vez, sin tocar cada `getSessionEscritura` uno por
uno. Efecto colateral que también se arregló solo: un empleado al que se
le daba acceso a Calendario no veía las tareas de un proyecto hasta
volver a entrar (`obtenerProyectosTarea` usa el mismo chequeo).
Lección para toda auditoría futura de permisos: no alcanza con probar
"¿el chequeo de módulo existe y usa la clave correcta?" (eso ya lo cubre
este checklist) — también hay que probar "¿un cambio de permiso a mitad
de sesión se nota de inmediato, en cada capa (ruta, página, Server
Action), o solo en algunas?". Los tests de permisos de empleados en
`tests/integration/` usaban un mock de sesión sin `empleadoId` — sin
consecuencia mientras nada lo necesitaba, pero quedó expuesto apenas este
fix empezó a depender de él; se corrigió para crear una fila real de
empleado en la DB, igual que un login real por PIN, en vez de solo
simular el objeto de sesión a mano.

**Caja (2026-11-14) — un segundo hallazgo sobre el fix anterior.** El
cuadre ya restaba un costo fijo pagado en efectivo (PR #168), pero no
había ninguna forma de VERLO al cerrar la caja — "Ventas de este turno"
solo mostraba ingresos, nunca egresos. Se agregó "Gastos de este turno"
(gastos/costos fijos/retiros por método, igual patrón que ventas) tanto en
la vista de la caja abierta como en el historial de cierres
(`CierreCaja.gastosPorMetodoResumen`, misma idea que
`ventasPorMetodoResumen`).

**Modal "Nuevo proyecto" con fondo blanco a un lado (2026-11-14).**
Cualquier overlay `fixed inset-0` anidado dentro de un ancestro con
`animate-fade-up` (su animación termina en `transform: translateY(0)`,
que sigue siendo un `transform` distinto de `none`) queda posicionado
relativo a ESE ancestro, no al viewport — el fondo oscuro no cubre toda
la pantalla. El resto de los modales centrados del proyecto ya evita esto
con `createPortal` a `document.body` (ver `ConfirmarEliminarModal` en
costos-fijos-client.tsx); a `ModalProyecto` (proyectos-tarea-client.tsx)
se le había quedado afuera de ese patrón. Hay otros modales en el proyecto
que tampoco usan `createPortal` todavía (productos/escanear-nuevos-client,
productos/producto-wizard, deudas/formulario-deuda, deudas/lista-deudas,
notificaciones/permiso-modal, soporte/chat-widget, y uno de los dos en
ventas/venta-client) — no se tocaron en esta pasada porque no fueron
reportados, pero valdría la pena una pasada dedicada si vuelve a aparecer
el mismo síntoma en otra pantalla.

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
- [ ] Si un módulo suma `monto` de movimientos para calcular Utilidad/gasto
      "real" del negocio (no Disponible/caja), restar `montoNoOperativo` —
      es la parte de ese gasto que es plata real que salió de la caja pero
      no es un costo del negocio (capital de un pago de deuda, un Retiro
      completo). Disponible/caja SÍ debe seguir sumando el monto completo,
      sin restarlo — ahí el objetivo es la plata real que se movió, no la
      rentabilidad. Confundir los dos es la misma clase de bug que el ítem
      anterior (Utilidad y Disponible desalineados) — ver `calcularMetricas`,
      `prepararGrafico`/`prepararGraficoAnual` y `registrarPago`/
      `ingresarMovimiento` en `app/actions/acciones.ts` para el patrón.
- [ ] Si un mismo total "del mes en curso" se muestra en más de una
      pantalla (ej. "Costos Fijos"), confirmar que todas usan el mismo
      criterio para decidir qué cuenta — no solo la misma fórmula de suma,
      sino el mismo filtro. Un filtro adicional agregado en un solo lugar
      (ej. "solo cuento lo que ya venció este mes") puede sonar como una
      mejora ahí, pero si otra pantalla sigue sumando "todo lo que aplica
      este mes" sin esa restricción, el mismo número queda distinto en cada
      pantalla sin que el código tenga ningún bug de fórmula — bug real en
      Costos Fijos: `/dashboard/costos-fijos` excluía del "Total mensual"
      cualquier costo cuyo día todavía no hubiera llegado ese mes, mientras
      que `/dashboard/resumen` sumaba todos los costos aplicables al mes sin
      esa exclusión — mismo mes, mismo dato, dos números distintos.

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
- [ ] `npm run audit:prod` sin hallazgos `critical` nuevos (ver
      `docs/NPM_AUDIT_*.md` para el estado aceptado de los que ya quedan
      documentados) — CI ya lo corre en cada PR.

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
- **Vulnerabilidades de día cero** en dependencias de terceros — ya cubierto
  por `npm run audit:prod` (ver `docs/NPM_AUDIT_*.md`), pero solo detecta lo
  que ya está reportado públicamente, no fallas sin descubrir aún.
