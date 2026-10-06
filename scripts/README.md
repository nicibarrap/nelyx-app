# Scripts de datos sintéticos

Generan volumen real (miles de filas) bajo UNA cuenta dedicada
(`datos-sinteticos@nelyx.internal`), para probar que listados, reportes y
dashboards aguantan datos de verdad — no solo los 5-10 registros con los que
normalmente se desarrolla. Nunca tocan ni mezclan datos de una cuenta real
existente.

## Uso

```bash
# Contra la Postgres local de pruebas (seguro, $0, recomendado para probar primero)
DATABASE_URL="postgresql://nelyx_test:nelyx_test@localhost:5432/nelyx_test" npm run datos-sinteticos:generar

# Limpiar (borra la cuenta sintética completa y todo lo que cuelga de ella)
DATABASE_URL="postgresql://nelyx_test:nelyx_test@localhost:5432/nelyx_test" npm run datos-sinteticos:limpiar
```

Para correrlo contra el proyecto real de Supabase (y así probar con el motor
y la latencia reales, no la Postgres local), hay que pasar la `DATABASE_URL`
de ese proyecto y agregar `-- --si-produccion` — el script se niega a
escribir en cualquier host que no sea `localhost` sin esa bandera explícita,
precisamente para que un `DATABASE_URL` mal copiado no termine escribiendo
miles de filas donde no correspondía:

```bash
DATABASE_URL="<la url de Supabase>" npm run datos-sinteticos:generar -- --si-produccion
```

Qué genera (una sola cuenta, todo relacionado entre sí):
- 60 productos, 120 clientes, 12 proveedores
- 4.000 movimientos repartidos en los últimos 14 meses (ventas, gastos,
  costos fijos, ingresos extra, retiros)
- 25 deudas con pagos parciales
- 8 costos fijos recurrentes con su historial completo de generaciones
- 150 cuentas por cobrar (pendientes, pagadas, vencidas, parciales) con pagos

Correr `datos-sinteticos:generar` de nuevo borra la generación anterior antes
de crear una nueva (no acumula duplicados).
