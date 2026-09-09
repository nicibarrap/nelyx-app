import type { DefaultSession } from "next-auth"
declare module "next-auth" {
  interface Session {
    user: {
      id: string; role: string; negocio?: string | null
      // Multi-usuario — id siempre es la cuenta (dueño), nunca cambia de
      // significado para no romper ninguna consulta existente. Estos son
      // los campos nuevos, solo para saber quién es realmente y qué puede ver.
      esEmpleado?: boolean
      empleadoId?: string | null
      modulosPermitidos?: string[] | null // null = acceso total (dueño, o empleado con todo habilitado)
    } & DefaultSession["user"]
  }
}
