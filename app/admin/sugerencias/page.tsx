import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { SugerenciasAdminClient } from "@/components/admin/sugerencias-admin-client"

export const metadata: Metadata = { title: "Sugerencias" }
export const dynamic = "force-dynamic"

export default async function SugerenciasPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN" || session.user.esEmpleado) redirect("/dashboard/resumen")

  return <SugerenciasAdminClient />
}
