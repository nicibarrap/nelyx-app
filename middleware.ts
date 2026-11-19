import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { tieneAcceso, rutaDeInicio } from "@/lib/permisos"
import { db } from "@/lib/db"

// Antes esto se cacheaba por unos segundos en una cookie (nlx_sc) para no
// pagar una consulta a la DB en cada clic — primero 20s, después bajado a
// 5s. Pero una suspensión o desactivación es justo el tipo de cambio que
// NO puede tener ningún margen: mientras dura la ventana de caché, la
// cuenta suspendida sigue registrando ventas y moviendo stock con
// normalidad. Se saca la caché por completo — cada request a /dashboard o
// /admin consulta la DB fresca (ver más abajo). Es una sola fila por id
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
  //
  // Consulta directa a la base de datos (mismo cliente Prisma de @/lib/db
  // que ya usa el resto de la app, incluido este mismo archivo a través del
  // adapter de NextAuth en @/lib/auth) — antes esto era un fetch() interno
  // a /api/check-session, una vuelta completa por otra función serverless
  // solo para repetir la misma consulta que esa ruta hacía. Ese diseño
  // sobrevivió cinco rondas de bugs de permisos (caché de fetch(), Router
  // Cache del cliente, prefetch obsoleto, navegación dura, protección SSO
  // de Vercel bloqueando la URL del fetch) porque siempre había una causa
  // más urgente que arreglar primero — pero el salto en sí nunca fue
  // necesario: no hay ninguna razón por la que el middleware no pueda
  // consultar la DB directo, con la misma frescura y la misma lógica,
  // sin la ida y vuelta de red extra (ni su propio riesgo de fallar, que
  // es justo lo que pasó con la protección SSO). Ver export const config
  // más abajo: runtime "nodejs" explícito, para que esto no dependa de
  // qué runtime use Next.js por defecto.
  let modulosFrescos: string[] | null | undefined = undefined
  if (!esServerAction && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"))) {
    try {
      // Mismo criterio que /api/check-session (que sigue existiendo — lo
      // usa AutoRevalidarPermisos desde el navegador, un caso distinto):
      // session.user.id siempre es la cuenta del dueño, por diseño: hay
      // que revisar el registro del EMPLEADO si es uno.
      const idAVerificar = session.user.empleadoId || session.user.id
      const registro = await db.user.findUnique({
        where: { id: idAVerificar },
        select: {
          activo: true,
          modulosPermitidos: true,
          // Un empleado necesita AMBAS cosas activas: su propio registro y
          // la cuenta dueña de la que depende — si Nelyx suspende la
          // cuenta del negocio, sus empleados ya conectados no deberían
          // seguir operando con ella.
          cuentaPrincipal: { select: { activo: true } },
        },
      })
      const activo = !!registro && registro.activo && (registro.cuentaPrincipal?.activo ?? true)
      if (!activo) {
        // Redirect to clean logout page — signs out properly without cookie errors
        return NextResponse.redirect(new URL("/auth/forzar-salida", req.url))
      }
      // El dueño nunca tiene módulos restringidos (null = acceso total).
      modulosFrescos = session.user.empleadoId ? (registro?.modulosPermitidos ?? null) : null
    } catch (e) {
      // Si falla la consulta, se usa lo que venga en la sesión (JWT) como
      // respaldo, en vez de bloquear todo por un error pasajero de la DB —
      // pero ese respaldo es exactamente el valor potencialmente
      // desactualizado que todo este mecanismo existe para evitar, así
      // que silenciarlo del todo deja a cualquier degradación real sin
      // forma de notarse. console.error (no Sentry.captureException: este
      // middleware corre en el edge runtime salvo que se fuerce nodejs —
      // ver runtime más abajo —, y este proyecto deliberadamente no
      // instrumenta el edge runtime con Sentry por tamaño de bundle, ver
      // instrumentation.ts) — Vercel sí captura console.error de cualquier
      // runtime en sus logs de función, sin necesidad de Sentry.
      console.error("[middleware] consulta de permisos frescos falló", { pathname, error: e })
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
//
// runtime: "nodejs" explícito — este archivo ya consulta Prisma directo
// (ver más arriba) a través del mismo cliente de @/lib/db que usa el resto
// de la app. Se declara sin ambigüedad en vez de confiar en el runtime por
// defecto de esta versión de Next.js/Vercel, que puede cambiar entre
// versiones — con esto, el comportamiento queda fijo pase lo que pase.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.[\\w]+$).*)"],
  runtime: "nodejs",
}
