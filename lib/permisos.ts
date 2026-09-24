// ══════════════════════════════════════════════════════════════════════
// Multi-usuario — lista central de módulos y verificación de permisos.
// Un solo lugar de referencia para el sidebar, el guardia de rutas, y la
// pantalla de administración de empleados — así nunca quedan desincronizados.
// ══════════════════════════════════════════════════════════════════════

export const MODULOS_NELYX = [
  { key: "resumen", label: "Resumen", ruta: "/dashboard/resumen" },
  { key: "venta", label: "Venta", ruta: "/dashboard/venta" },
  { key: "movimientos", label: "Movimientos", ruta: "/dashboard/movimientos" },
  { key: "productos", label: "Productos", ruta: "/dashboard/productos" },
  { key: "deudas", label: "Deudas", ruta: "/dashboard/deudas" },
  { key: "alertas", label: "Alertas", ruta: "/dashboard/alertas" },
  { key: "costos-fijos", label: "Costos fijos", ruta: "/dashboard/costos-fijos" },
  { key: "clientes", label: "Clientes", ruta: "/dashboard/clientes" },
  { key: "proveedores", label: "Proveedores", ruta: "/dashboard/proveedores" },
  { key: "cuentas-cobrar", label: "Cuentas por cobrar", ruta: "/dashboard/cuentas-cobrar" },
  { key: "reportes", label: "Reportes", ruta: "/dashboard/reportes" },
  { key: "calendario", label: "Calendario", ruta: "/dashboard/calendario" },
  { key: "aprende", label: "Aprende", ruta: "/dashboard/aprende" },
  { key: "configuracion", label: "Configuración", ruta: "/dashboard/configuracion" },
] as const

export type ModuloKey = typeof MODULOS_NELYX[number]["key"]

// Un módulo "solo lectura" se guarda en el mismo array modulosPermitidos,
// con este sufijo en vez de agregar una columna nueva a la tabla — evita
// una migración de base de datos para algo que es, en el fondo, una
// variante del mismo permiso ("puede ver este módulo", con o sin poder
// modificar nada en él).
const SUFIJO_SOLO_LECTURA = ":ro"

/** null/undefined = acceso total (dueño, o un empleado al que se le
 * habilitó todo). Si es un array, solo esas claves están permitidas —
 * incluso si viene vacío, un empleado sin nada marcado no ve nada. Una
 * clave "modulo:ro" (solo lectura) también cuenta como acceso al módulo. */
export function tieneAcceso(modulosPermitidos: string[] | null | undefined, moduloKey: string): boolean {
  if (modulosPermitidos == null) return true
  return modulosPermitidos.includes(moduloKey) || modulosPermitidos.includes(moduloKey + SUFIJO_SOLO_LECTURA)
}

/** ¿Puede VER pero no crear/editar/eliminar nada en este módulo? Solo
 * aplica a un empleado con ese módulo marcado "modulo:ro" — el dueño
 * (modulosPermitidos null) nunca es de solo lectura. */
export function esSoloLectura(modulosPermitidos: string[] | null | undefined, moduloKey: string): boolean {
  if (modulosPermitidos == null) return false
  return modulosPermitidos.includes(moduloKey + SUFIJO_SOLO_LECTURA)
}

export function claveSoloLectura(moduloKey: string): string {
  return moduloKey + SUFIJO_SOLO_LECTURA
}

/** Dado un pathname como "/dashboard/productos/reponer", determina a qué
 * módulo pertenece (el primer segmento después de /dashboard/). Rutas
 * fuera de la lista de módulos conocidos (o la raíz /dashboard) siempre
 * se consideran permitidas — nunca bloqueamos algo que no reconocemos. */
export function moduloDeRuta(pathname: string): ModuloKey | null {
  const match = pathname.match(/^\/dashboard\/([^\/]+)/)
  const seg = match?.[1]
  if (!seg) return null
  return (MODULOS_NELYX.some(m => m.key === seg) ? seg : null) as ModuloKey | null
}
