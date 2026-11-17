import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { tieneAcceso, rutaDeInicio } from "@/lib/permisos"

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

  // /legal/* (política de privacidad, términos) tiene que ser legible sin
  // sesión — la leen tanto quienes todavía no tienen cuenta como los
  // clientes finales de un negocio que usa Nelyx, que nunca inician sesión
  // acá pero sí son titulares de datos que un dueño carga sobre ellos.
  if (pathname === "/auth/login" || pathname === "/auth/forzar-salida" || pathname === "/auth/recuperar" || pathname === "/auth/restablecer" || pathname.startsWith("/legal/")) {
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
      // NEXT_PUBLIC_APP_URL (el dominio propio, app.nelyx.cl — mismo que
      // usa el resto de la plataforma para links de correo, ver lib/email.ts)
      // en vez de VERCEL_URL. Se probó VERCEL_URL primero pensando que era
      // más seguro que req.url (ver historial), pero resultó ser la causa
      // real de esta ronda completa de bugs de permisos: este proyecto
      // tiene "Vercel Authentication" (SSO Protection) activado para TODAS
      // las URLs del despliegue EXCEPTO el dominio propio — la URL que da
      // VERCEL_URL (nelyx-xxxxx-....vercel.app) es justo una de las
      // protegidas. El fetch interno del middleware (que no lleva ninguna
      // cookie/token de bypass de Vercel, solo la cookie de sesión de la
      // app) chocaba contra esa muralla y recibía de vuelta el HTML del
      // challenge de Vercel en vez del JSON esperado — reventando en
      // res.json() y cayendo al catch de abajo, que usa como respaldo los
      // módulos del JWT (viejos). Confirmado con los logs de Vercel:
      // "[middleware] fetch a /api/check-session falló" con
      // "SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid
      // JSON", 91 veces en 24h contra 6 usuarios distintos — exactamente el
      // bug que un dueño reportó cuatro veces seguidas (otorgar un módulo
      // nuevo a un empleado conectado y que siga viendo "no tienes
      // acceso"), y que ninguna prueba local con Playwright podía
      // reproducir porque la protección SSO es una regla de la plataforma
      // de Vercel, inexistente en localhost. app.nelyx.cl queda afuera de
      // esa protección por diseño (así los dueños pueden entrar sin pasar
      // por el login de Vercel), así que este fetch nunca choca con ella —
      // y, al ser siempre el mismo dominio final (no uno viejo con un
      // redirect por delante), tampoco reaparece el problema original que
      // hizo descartar req.url.
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : req.url)
      const checkUrl = new URL("/api/check-session", baseUrl)
      const res = await fetch(checkUrl.toString(), {
        headers: { cookie: req.headers.get("cookie") ?? "" },
        // Next.js cachea fetch() por defecto (su propio Data Cache, aparte
        // de cualquier caché que uno arme a mano) — sin esto, todo el
        // comentario de arriba ("sin caché, se consulta en cada request")
        // queda en la intención: en producción, esta llamada podía servir
        // una respuesta vieja cacheada, y un cambio de módulo o la
        // suspensión de una cuenta no se reflejaba hasta que esa caché
        // expirara sola, por request. Bug real: a un empleado se le daba
        // acceso a un módulo nuevo, el ícono aparecía en el menú (otra
        // consulta, sin este problema) pero entrar seguía mandando a
        // "sin-permiso" porque esta llamada seguía devolviendo los
        // módulos de antes.
        cache: "no-store",
      })
      const data = await res.json()
      if (!data.activo) {
        // Redirect to clean logout page — signs out properly without cookie errors
        return NextResponse.redirect(new URL("/auth/forzar-salida", req.url))
      }
      modulosFrescos = data.modulosPermitidos
    } catch (e) {
      // Si falla la consulta, se usa lo que venga en la sesión (JWT) como
      // respaldo, en vez de bloquear todo por un error de red pasajero —
      // pero ese respaldo es exactamente el valor potencialmente
      // desactualizado que todo este mecanismo existe para evitar, así
      // que silenciarlo del todo (como estaba antes) deja a cualquier
      // degradación real sin forma de notarse. console.error (no
      // Sentry.captureException: este middleware corre en el edge runtime,
      // que este proyecto deliberadamente no instrumenta con Sentry por
      // tamaño de bundle — ver instrumentation.ts — así que esa llamada
      // nunca mandaba nada) — Vercel sí captura console.error de cualquier
      // runtime en sus logs de función, sin necesidad de Sentry.
      console.error("[middleware] fetch a /api/check-session falló", { pathname, error: e })
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
        // "/dashboard/resumen" es el destino fijo al que toda la app manda
        // tras iniciar sesión (login-form.tsx) o al tocar "Volver al
        // inicio" desde esta misma pantalla de sin-permiso — nunca algo
        // que el empleado eligió visitar. Un empleado sin ese módulo (el
        // dueño no le da acceso a la utilidad del negocio) no debería ver
        // "no tienes acceso" como primera pantalla si en realidad sí tiene
        // otros módulos usables: se le manda directo al primero que sí
        // tenga. Si de verdad trató de entrar a otro módulo puntual sin
        // permiso (un link viejo, una pestaña con un módulo recién
        // revocado), eso sigue yendo a sin-permiso como siempre.
        respuesta = modulo === "resumen"
          ? NextResponse.redirect(new URL(rutaDeInicio(modulosFrescos), req.url))
          : NextResponse.redirect(new URL(`/dashboard/sin-permiso?modulo=${modulo}`, req.url))
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
