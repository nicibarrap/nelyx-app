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
import { OverlayCargaModulo } from "@/components/dashboard/overlay-carga-modulo"
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
          {/* pt-16 hasta md: espacio para el ☰ fijo del sidebar, que a partir
              de md ya no existe (sidebar siempre visible) — mismo breakpoint
              que el sidebar y el saludo del header. relative: ancla el
              overlay de carga (logo parpadeando) a esta área, sin taparla
              por completo. */}
          <main className="relative flex-1 p-4 lg:p-5 overflow-y-auto overflow-x-hidden pt-16 md:pt-4">
            {children}
            <OverlayCargaModulo />
          </main>
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
