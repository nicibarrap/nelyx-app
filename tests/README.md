# Tests

`tests/unit/` — funciones puras, sin base de datos. Rápidos, corren siempre.

`tests/integration/` — pegan a una Postgres real (no a la de producción). Verifican
específicamente los bugs que ya pasaron una vez: el login que no reconocía un email
guardado con mayúsculas, y las condiciones de carrera en pagos concurrentes.

## Correr los tests localmente

Necesitas una Postgres local corriendo (no la de Supabase/producción — nunca se
usa esa acá). En este entorno ya viene instalada:

```bash
sudo service postgresql start
sudo -u postgres psql -c "CREATE ROLE nelyx_test WITH LOGIN PASSWORD 'nelyx_test' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE nelyx_test OWNER nelyx_test;"
npm run test:db:setup   # aplica el schema de Prisma a esa base
npm test                # corre toda la suite una vez
npm run test:watch      # modo watch
```

Si `nelyx_test` ya existe (segunda vez que se corre en este entorno), basta con
`npm test` directamente.

## En GitHub Actions

`.github/workflows/tests.yml` corre automáticamente en cada push: levanta su propia
Postgres de servicio, aplica el schema, y corre toda la suite. No requiere ningún
setup en el repo de Supabase — es una base de datos nueva y vacía cada vez.
