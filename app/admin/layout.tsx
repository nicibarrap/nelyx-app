import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { NavegacionProvider } from "@/components/dashboard/navegacion-provider"
import { OverlayCargaModulo } from "@/components/dashboard/overlay-carga-modulo"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN" || session.user.esEmpleado) redirect("/dashboard/resumen")
  return (
    <NavegacionProvider>
      {children}
      <OverlayCargaModulo />
    </NavegacionProvider>
  )
}
