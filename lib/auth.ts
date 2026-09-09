import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { db } from "./db"

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await db.user.findUnique({ where: { email: credentials.email as string } })
        if (!user || !user.activo) return null
        const valida = await bcrypt.compare(credentials.password as string, user.password)
        if (!valida) return null
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
      async authorize(credentials) {
        const cuentaId = credentials?.cuentaId as string | undefined
        const empleadoId = credentials?.empleadoId as string | undefined
        const pin = credentials?.pin as string | undefined
        if (!cuentaId || !empleadoId || !pin) return null

        const empleado = await db.user.findFirst({ where: { id: empleadoId, cuentaPrincipalId: cuentaId, activo: true } })
        if (!empleado || !empleado.pin) return null
        const pinValido = await bcrypt.compare(pin, empleado.pin)
        if (!pinValido) return null

        const cuenta = await db.user.findUnique({ where: { id: cuentaId } })
        if (!cuenta || !cuenta.activo) return null

        // id = la CUENTA (dueño), nunca el id propio del empleado — así
        // todas las consultas existentes (where: { userId: session.user.id })
        // siguen viendo los datos del negocio correcto, sin cambiar nada.
        return {
          id: cuenta.id, email: cuenta.email, name: empleado.nombre,
          role: cuenta.rol, negocio: cuenta.negocio,
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
