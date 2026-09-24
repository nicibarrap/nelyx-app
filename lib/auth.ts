import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { db } from "./db"
import { estaBloqueado, calcularNuevoEstadoTrasFallo, ESTADO_LIMPIO, necesitaLimpiarEstado, ipDeRequest } from "./auth-logica"

const VENTANA_IP_MINUTOS = 15
// A través de cualquier cantidad de emails distintos desde esa IP. Más
// bajo que esto arriesga bloquear IPs compartidas legítimas (una tienda
// con varios empleados en el mismo wifi, o varios clientes detrás de la
// misma IP de un carrier móvil) por errores reales de contraseña, no un
// ataque. El bloqueo por cuenta (5 intentos, más abajo) sigue siendo la
// primera línea de defensa para una cuenta puntual.
const MAX_INTENTOS_POR_IP = 10

/**
 * Frena un ataque de credential stuffing / spray: alguien probando muchos
 * emails distintos desde la misma IP nunca dispararía el bloqueo por
 * cuenta (User.bloqueadoHastaPin, que es por email). Complementario, no
 * un reemplazo de ese bloqueo.
 */
async function demasiadosIntentosDesdeIp(ip: string): Promise<boolean> {
  if (ip === "desconocida") return false // sin IP no hay contra qué contar — no bloquear a ciegas
  const desde = new Date(Date.now() - VENTANA_IP_MINUTOS * 60 * 1000)
  const intentos = await db.intentoLoginFallido.count({ where: { ip, createdAt: { gte: desde } } }).catch(() => 0)
  return intentos >= MAX_INTENTOS_POR_IP
}

async function registrarIntentoFallido(ip: string) {
  if (ip === "desconocida") return
  await db.intentoLoginFallido.create({ data: { ip } }).catch(() => {})
  // Limpieza oportunista y barata (no en cada intento) para que la tabla
  // no crezca indefinidamente — no hace falta un cron aparte para esto.
  if (Math.random() < 0.02) {
    const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await db.intentoLoginFallido.deleteMany({ where: { createdAt: { lt: haceUnDia } } }).catch(() => {})
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null
        const ip = ipDeRequest(request)

        // Frena un ataque que prueba muchos emails distintos desde la
        // misma IP, antes de gastar ni una consulta o un bcrypt.compare —
        // el bloqueo por cuenta (más abajo) no alcanza a cubrir este caso.
        if (await demasiadosIntentosDesdeIp(ip)) return null

        // Comparación sin distinguir mayúsculas/minúsculas: no todas las
        // cuentas quedaron guardadas con el mismo criterio de mayúsculas,
        // así que forzar el valor escrito a minúsculas (como se hacía
        // antes) podía dejar de encontrar una cuenta real. Con
        // mode:"insensitive" da igual cómo haya quedado guardado el email
        // o cómo lo escriba la persona — encuentra la cuenta igual.
        const emailEscrito = (credentials.email as string).trim()
        const user = await db.user.findFirst({ where: { email: { equals: emailEscrito, mode: "insensitive" } } })
        if (!user || !user.activo) {
          await registrarIntentoFallido(ip)
          return null
        }

        // Mismo bloqueo temporal que ya existía para el PIN de empleados,
        // reutilizando los mismos campos (nunca se usan para el dueño, que
        // no tiene PIN) — sin esto, el login principal por contraseña no
        // tenía ningún freno ante fuerza bruta / credential stuffing, y
        // cada intento ya cuesta CPU real por el bcrypt.compare.
        if (estaBloqueado(user)) {
          return null
        }

        const valida = await bcrypt.compare(credentials.password as string, user.password)
        if (!valida) {
          await db.user.update({
            where: { id: user.id },
            data: calcularNuevoEstadoTrasFallo(user.intentosFallidosPin),
          }).catch(() => {})
          await registrarIntentoFallido(ip)
          return null
        }
        if (necesitaLimpiarEstado(user)) {
          await db.user.update({ where: { id: user.id }, data: ESTADO_LIMPIO }).catch(() => {})
        }

        return { id: user.id, email: user.email, name: user.nombre, role: user.rol, negocio: user.negocio }
      },
    }),
    // Login de empleados — el dueño ya inició sesión una vez en este
    // dispositivo (eso lo "empareja" con su cuenta); desde ahí, cualquier
    // empleado activo de esa misma cuenta entra solo con su nombre + PIN.
    Credentials({
      id: "empleado-pin",
      credentials: {
        cuentaId: { label: "Cuenta", type: "text" },
        empleadoId: { label: "Empleado", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials, request) {
        const cuentaId = credentials?.cuentaId as string | undefined
        const empleadoId = credentials?.empleadoId as string | undefined
        const pin = credentials?.pin as string | undefined
        if (!cuentaId || !empleadoId || !pin) return null

        // Este endpoint (/api/auth/callback/empleado-pin) es público — no
        // requiere sesión previa, igual que el login del dueño — así que
        // le aplica la misma barrera contra fuerza bruta / spray por IP,
        // probando distintos pares cuentaId+empleadoId desde el mismo
        // origen. El bloqueo por cuenta (más abajo) protege UN empleado
        // puntual; este protege contra probar muchos a la vez.
        const ip = ipDeRequest(request)
        if (await demasiadosIntentosDesdeIp(ip)) return null

        const empleado = await db.user.findFirst({ where: { id: empleadoId, cuentaPrincipalId: cuentaId, activo: true } })
        if (!empleado || !empleado.pin) {
          await registrarIntentoFallido(ip)
          return null
        }

        // Bloqueo temporal tras varios PIN incorrectos seguidos — sin
        // esto, alguien podría probar las 10.000 combinaciones posibles
        // de un PIN de 4 dígitos sin que nada lo frene. Se devuelve null
        // (no se lanza un error con el mensaje) porque NextAuth nunca
        // propaga el texto exacto de una excepción al cliente, por
        // seguridad — el frontend distingue este caso de otra forma.
        if (estaBloqueado(empleado)) {
          return null
        }

        const pinValido = await bcrypt.compare(pin, empleado.pin)
        if (!pinValido) {
          await db.user.update({
            where: { id: empleado.id },
            data: calcularNuevoEstadoTrasFallo(empleado.intentosFallidosPin),
          })
          await registrarIntentoFallido(ip)
          return null
        }
        // PIN correcto — se limpia cualquier intento fallido anterior.
        if (necesitaLimpiarEstado(empleado)) {
          await db.user.update({ where: { id: empleado.id }, data: ESTADO_LIMPIO })
        }

        const cuenta = await db.user.findUnique({ where: { id: cuentaId } })
        if (!cuenta || !cuenta.activo) return null

        // id = la CUENTA (dueño), nunca el id propio del empleado — así
        // todas las consultas existentes (where: { userId: session.user.id })
        // siguen viendo los datos del negocio correcto, sin cambiar nada.
        //
        // role: NUNCA se propaga "ADMIN" a una sesión de empleado, aunque la
        // cuenta dueña sea una cuenta ADMIN de Nelyx — ese rol solo existe
        // para el panel interno /admin (staff de Nelyx), y un empleado con
        // PIN jamás debe poder entrar ahí. Sin este límite, cualquier
        // empleado de una cuenta ADMIN heredaba acceso completo al panel
        // administrativo de la plataforma.
        return {
          id: cuenta.id, email: cuenta.email, name: empleado.nombre,
          role: cuenta.rol === "ADMIN" ? "USER" : cuenta.rol, negocio: cuenta.negocio,
          esEmpleado: true, empleadoId: empleado.id, modulosPermitidos: empleado.modulosPermitidos,
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id; token.role = (user as any).role; token.negocio = (user as any).negocio
        token.esEmpleado = (user as any).esEmpleado ?? false
        token.empleadoId = (user as any).empleadoId ?? null
        token.modulosPermitidos = (user as any).modulosPermitidos ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        ;(session.user as any).negocio = token.negocio ?? null
        session.user.esEmpleado = (token.esEmpleado as boolean) ?? false
        session.user.empleadoId = (token.empleadoId as string) ?? null
        session.user.modulosPermitidos = (token.modulosPermitidos as string[]) ?? null
      }
      return session
    },
  },
  pages: { signIn: "/login" },
  events: {
    async signIn({ user }) {
      if (user?.id) {
        await db.suscripcionNelyx.updateMany({
          where: { userId: user.id },
          data: { ultimoAcceso: new Date() },
        }).catch(() => {}) // silently fail if no subscription exists
      }
    },
  },
})
