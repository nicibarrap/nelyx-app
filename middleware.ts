import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

// Cuánto tiempo se confía en el último resultado de /api/check-session antes
// de volver a consultarlo. Antes se consultaba la DB en CADA request al
// dashboard/admin (cada clic = 1 invocación extra + 1 query solo para esto,
// sobre todas las páginas de la plataforma). Con esta ventana, un usuario
// navegando activamente genera una fracción de esas consultas en vez de una
// por clic — a cambio, desactivar a un empleado o cambiarle los módulos
// permitidos tarda hasta este margen en notarse (antes era instantáneo).
const FRESCURA_SEGUNDOS = 20
const COOKIE_CHECK = "nlx_sc"

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

  // Verify user is still active in DB — y de paso, trae los módulos
  // permitidos FRESCOS (no los del JWT, que solo se recalculan al iniciar
  // sesión). El resultado se cachea en una cookie propia por
  // FRESCURA_SEGUNDOS para no pagar la consulta en cada clic.
  let modulosFrescos: string[] | null | undefined = undefined
  let huboConsultaFresca = false
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    let cache: { activo: boolean; modulosPermitidos: string[] | null } | null = null
    const cacheRaw = req.cookies.get(COOKIE_CHECK)?.value
    if (cacheRaw) {
      try { cache = JSON.parse(cacheRaw) } catch { cache = null }
    }

    if (cache) {
      if (!cache.activo) return NextResponse.redirect(new URL("/auth/forzar-salida", req.url))
      modulosFrescos = cache.modulosPermitidos
    } else {
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
        huboConsultaFresca = true
      } catch {
        // Si falla la consulta, se usa lo que venga en la sesión (JWT) como
        // respaldo, en vez de bloquear todo por un error de red pasajero.
        // No se cachea este resultado — no vino de una consulta real a la DB.
        modulosFrescos = (session.user as any)?.modulosPermitidos
      }
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

  if (huboConsultaFresca) {
    respuesta.cookies.set(COOKIE_CHECK, JSON.stringify({ activo: true, modulosPermitidos: modulosFrescos ?? null }), {
      maxAge: FRESCURA_SEGUNDOS,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    })
  }

  return respuesta
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.webp|icon.webp).*)"]
}
