import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { obtenerEmpleados } from "@/app/actions/empleados-acciones"
import { UsuariosClient } from "@/components/usuarios/usuarios-client"

export const metadata: Metadata = { title: "Usuarios" }
export const dynamic = "force-dynamic"

export default async function UsuariosPage() {
  const session = await auth()
  // Defensa extra, además del middleware — solo el dueño administra usuarios.
  if (session?.user?.esEmpleado) redirect("/dashboard/resumen")

  const empleados = await obtenerEmpleados()

  return (
    <div className="space-y-5 animate-fade-up max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">👥 Usuarios</h1>
        <p className="text-sm text-[var(--c-text3)] mt-0.5">Crea accesos para las personas que trabajan contigo, y elige qué puede ver cada una.</p>
      </div>
      <UsuariosClient empleadosIniciales={empleados.map(e => ({ ...e, createdAt: e.createdAt.toISOString() }))} />
    </div>
  )
}
