import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

const COOKIE_DISPOSITIVO = "nelyx_dispositivo_cuenta"

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  if (pathname === "/auth/login" || pathname === "/auth/forzar-salida") {
    if (session && pathname === "/auth/login") return NextResponse.redirect(new URL("/dashboard/resumen", req.url))
    return NextResponse.next()
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(session ? "/dashboard/resumen" : "/auth/login", req.url))
  }

  if (!session) {
    return NextResponse.redirect(new URL("/auth/login", req.url))
  }

  // Verify user is still active in DB on every dashboard request — y de
  // paso, trae los módulos permitidos FRESCOS (no los del JWT, que solo
  // se recalculan al iniciar sesión y quedarían obsoletos si el dueño
  // cambia los permisos de un empleado mientras sigue conectado).
  let modulosFrescos: string[] | null | undefined = undefined
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    try {
      const checkUrl = new URL("/api/check-session", req.url)
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

  if (pathname.startsWith("/admin") && session.user?.role !== "ADMIN") {
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
      if (modulo && modulo !== "sin-permiso" && !modulosFrescos.includes(modulo)) {
        respuesta = NextResponse.redirect(new URL(`/dashboard/sin-permiso?modulo=${modulo}`, req.url))
      }
    }
  }

  // Emparejar este dispositivo con la cuenta — se hace acá, del lado del
  // servidor con la sesión ya resuelta y garantizada fresca, en vez de
  // depender de una llamada desde el cliente justo después del login
  // (que puede fallar por timing/caché). Así, cualquier visita al
  // dashboard con sesión válida deja el aparato "recordado" para la
  // próxima vez — sea el dueño o un empleado quien entró.
  if (pathname.startsWith("/dashboard") && session.user?.id) {
    const cookieActual = req.cookies.get(COOKIE_DISPOSITIVO)?.value
    if (cookieActual !== session.user.id) {
      respuesta.cookies.set(COOKIE_DISPOSITIVO, session.user.id, {
        maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax", secure: true,
      })
    }
  }

  return respuesta
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.webp|icon.webp).*)"]
}
