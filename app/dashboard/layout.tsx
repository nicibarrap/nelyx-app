import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { PermisoNotificacionesModal } from "@/components/notificaciones/permiso-modal"
import { AutoReparadorPush } from "@/components/notificaciones/auto-reparador-push"
import { AutoLogoutEmpleado } from "@/components/dashboard/auto-logout-empleado"
import { AutoRevalidarReconexion } from "@/components/dashboard/auto-revalidar-reconexion"
import { ChatSoporteWidget } from "@/components/soporte/chat-widget"
import { NavegacionProvider } from "@/components/dashboard/navegacion-provider"
import { ContenidoDashboard } from "@/components/dashboard/contenido-dashboard"
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
    <NavegacionProvider>
      <div className="flex min-h-screen" style={{ backgroundColor: "var(--c-bg)" }}>
        <Sidebar userRole={session.user.role} modulosPermitidos={modulosPermitidos} esEmpleado={session.user.esEmpleado} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header session={session} />
          <ContenidoDashboard>{children}</ContenidoDashboard>
        </div>
        <PermisoNotificacionesModal yaPedido={notifCfg?.permisoPedido ?? false} />
        <AutoReparadorPush />
        <AutoLogoutEmpleado esEmpleado={session.user.esEmpleado} />
        <AutoRevalidarReconexion />
        {session.user.role !== "ADMIN" && <ChatSoporteWidget />}
      </div>
    </NavegacionProvider>
  )
}
