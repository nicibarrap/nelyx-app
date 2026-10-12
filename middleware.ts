import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { tieneAcceso } from "@/lib/permisos"

// Antes esto se cacheaba por unos segundos en una cookie (nlx_sc) para no
// pagar una consulta a la DB en cada clic — primero 20s, después bajado a
// 5s. Pero una suspensión o desactivación es justo el tipo de cambio que
// NO puede tener ningún margen: mientras dura la ventana de caché, la
// cuenta suspendida sigue registrando ventas y moviendo stock con
// normalidad. Se saca la caché por completo — cada request a /dashboard o
// /admin consulta /api/check-session fresco. Es una sola fila por id
// (barata, indexada por primary key); el costo real de "una consulta más
// por navegación" es insignificante comparado con el de dejar una cuenta
// desactivada seguir operando.
export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  if (pathname === "/auth/login" || pathname === "/auth/forzar-salida" || pathname === "/auth/recuperar" || pathname === "/auth/restablecer") {
    // Una Server Action invocada DESDE /auth/login (p. ej. obtenerEmpleadosDeMiCuenta,
    // que se llama justo después de iniciar sesión, antes de salir de esta pantalla)
    // también le llega al middleware como POST a esta misma ruta. Si se redirige
    // igual que ante una visita real a la página, ese fetch termina aterrizando en
    // /dashboard/resumen y el cliente recibe de vuelta el árbol RENDERIZADO de esa
    // página en lugar del resultado esperado — el contenido del dashboard se pinta
    // encima del login sin que la URL cambie nunca (el usuario queda visualmente
    // "atascado" en /auth/login pese a que ya inició sesión, hasta que refresca).
    // Las Server Actions se identifican por el header "next-action" — nunca deben
    // quedar sujetas a esta redirección.
    const esServerAction = req.headers.get("next-action") !== null
    if (session && pathname === "/auth/login" && !esServerAction) return NextResponse.redirect(new URL("/dashboard/resumen", req.url))
    return NextResponse.next()
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(session ? "/dashboard/resumen" : "/auth/login", req.url))
  }

  if (!session) {
    return NextResponse.redirect(new URL("/auth/login", req.url))
  }

  // Una Server Action (identificada por el header "next-action", mismo
  // criterio que ya se usa arriba para /auth/login) también le llega al
  // middleware como POST a la URL de la página donde se disparó. Si la
  // cuenta está inactiva y se la redirige acá con un 307 crudo, ese fetch
  // interno de Next.js (el que ejecuta la Server Action) sigue la
  // redirección, aterriza en el HTML de /auth/forzar-salida, y como esa
  // respuesta no tiene el formato que Next.js espera de una Server Action
  // revienta en el cliente con "An unexpected response was received from
  // the server" — la persona queda pegada en la misma pantalla, sin la X
  // de Nelyx y sin cerrar sesión, aunque la acción en sí nunca llegue a
  // ejecutarse (ver verificarCuentaActivaOExpulsar en lib/sesion-activa.ts,
  // que ya corre al inicio de cada Server Action). Por eso una Server
  // Action nunca se redirige desde acá: se deja pasar, y es la propia
  // acción la que expulsa con redirect() — la única forma que Next.js sí
  // sabe traducir en una navegación real cuando el resultado viene de una
  // Server Action.
  const esServerAction = req.headers.get("next-action") !== null

  // Verify user is still active in DB — y de paso, trae los módulos
  // permitidos FRESCOS (no los del JWT, que solo se recalculan al iniciar
  // sesión). Sin caché: se consulta en cada request a /dashboard o /admin.
  let modulosFrescos: string[] | null | undefined = undefined
  if (!esServerAction && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"))) {
    try {
      // Se arma con VERCEL_URL (la URL fija de este despliegue, provista
      // por la plataforma) en vez de con req.url — si se arma con el
      // dominio que el usuario usó para entrar, y ese dominio tiene un
      // redirect a otro (ej. el dominio viejo redirigiendo al nuevo tras
      // conectar un dominio propio), este fetch interno cae en ese
      // redirect entre dominios, pierde la cookie de sesión en el camino,
      // y esta ruta responde "no hay sesión" — lo que fuerza un cierre de
      // sesión real para cuentas que sí están activas. VERCEL_URL nunca
      // pasa por reglas de redirect de dominio custom.
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.url
      const checkUrl = new URL("/api/check-session", baseUrl)
      const res = await fetch(checkUrl.toString(), {
        headers: { cookie: req.headers.get("cookie") ?? "" },
      })
      const data = await res.json()
      if (!data.activo) {
        // Redirect to clean logout page — signs out properly without cookie errors
        return NextResponse.redirect(new URL("/auth/forzar-salida", req.url))
      }
      modulosFrescos = data.modulosPermitidos
    } catch {
      // Si falla la consulta, se usa lo que venga en la sesión (JWT) como
      // respaldo, en vez de bloquear todo por un error de red pasajero.
      modulosFrescos = (session.user as any)?.modulosPermitidos
    }
  }

  // El rol ADMIN nunca debería viajar en una sesión de empleado (ver
  // lib/auth.ts), pero se revalida acá también como segunda barrera —
  // mismo patrón de defensa en profundidad que el resto de la app.
  if (pathname.startsWith("/admin") && (session.user?.role !== "ADMIN" || session.user?.esEmpleado)) {
    return NextResponse.redirect(new URL("/dashboard/resumen", req.url))
  }

  // Multi-usuario: si es un empleado con módulos restringidos (no el
  // dueño, que siempre tiene modulosPermitidos = null), bloquea el acceso
  // real a rutas fuera de lo permitido — no solo ocultarlas en el menú.
  let respuesta = NextResponse.next()
  if (pathname.startsWith("/dashboard")) {
    if (modulosFrescos != null) {
      const match = pathname.match(/^\/dashboard\/([^\/]+)/)
      const modulo = match?.[1]
      if (modulo && modulo !== "sin-permiso" && !tieneAcceso(modulosFrescos, modulo)) {
        respuesta = NextResponse.redirect(new URL(`/dashboard/sin-permiso?modulo=${modulo}`, req.url))
      }
    }
  }

  return respuesta
})

// La lista anterior excluía archivos públicos uno por uno (favicon.ico,
// logo.webp, icon.webp) — cualquier archivo público nuevo (manifest.json,
// sw.js, los íconos de /icons, el logo usado en los correos) quedaba
// desprotegido del olvido: sin sesión, el middleware lo redirigía a
// /auth/login, y quien lo pedía (el navegador armando el manifest del PWA,
// Gmail cargando el logo del correo) recibía HTML en vez del archivo real.
// Ahora se excluye cualquier ruta cuyo último segmento tenga extensión
// (un archivo real de /public) en vez de mantener una lista a mano.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.[\\w]+$).*)"]
}
