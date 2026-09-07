import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { PermisoNotificacionesModal } from "@/components/notificaciones/permiso-modal"
import { AutoReparadorPush } from "@/components/notificaciones/auto-reparador-push"
import { db } from "@/lib/db"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/auth/login")
  const notifCfg = await db.notificacionConfig.findUnique({ where: { userId: session.user.id }, select: { permisoPedido: true } })

  // Módulos permitidos frescos — nunca los del JWT (que solo se calculan
  // al iniciar sesión y quedarían viejos si el dueño cambia los permisos
  // de un empleado mientras ese empleado sigue conectado).
  let modulosPermitidos: string[] | null = null
  if (session.user.empleadoId) {
    const empleado = await db.user.findUnique({ where: { id: session.user.empleadoId }, select: { modulosPermitidos: true } })
    modulosPermitidos = empleado?.modulosPermitidos ?? []
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--c-bg)" }}>
      <Sidebar userRole={session.user.role} modulosPermitidos={modulosPermitidos} esEmpleado={session.user.esEmpleado} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header session={session} />
        <main className="flex-1 p-4 lg:p-5 overflow-y-auto overflow-x-hidden pt-16 lg:pt-4">
          {children}
        </main>
      </div>
      <PermisoNotificacionesModal yaPedido={notifCfg?.permisoPedido ?? false} />
      <AutoReparadorPush />
    </div>
  )
}
