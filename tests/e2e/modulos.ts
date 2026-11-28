// Lista de pantallas ya auditadas, compartida por smoke-modulos.spec.ts y
// responsive.spec.ts — en su propio archivo (sin test(), sin lógica) para
// que ninguno de los dos termine importando al otro: Playwright ejecuta
// cualquier test() de un archivo apenas se importa (es código de nivel de
// módulo, no algo que dispare el test runner) — importar un .spec.ts
// desde otro duplicaría sus tests.
export const MODULOS: { ruta: string; tituloEsperado: string }[] = [
  { ruta: "/dashboard/resumen", tituloEsperado: "Resumen" },
  { ruta: "/dashboard/reportes", tituloEsperado: "Reportes" },
  { ruta: "/dashboard/alertas", tituloEsperado: "Alertas" },
  { ruta: "/dashboard/deudas", tituloEsperado: "Deudas" },
  { ruta: "/dashboard/cuentas-cobrar", tituloEsperado: "Cuentas por Cobrar" },
  { ruta: "/dashboard/venta", tituloEsperado: "Venta" },
  { ruta: "/dashboard/movimientos", tituloEsperado: "Movimientos" },
  { ruta: "/dashboard/costos-fijos", tituloEsperado: "Costos Fijos" },
  { ruta: "/dashboard/productos", tituloEsperado: "Productos" },
  { ruta: "/dashboard/clientes", tituloEsperado: "Clientes" },
  { ruta: "/dashboard/proveedores", tituloEsperado: "Proveedores" },
  { ruta: "/dashboard/aprende", tituloEsperado: "Centro de Aprendizaje" },
]
