import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { SoporteAdminClient } from "@/components/admin/soporte-admin-client"

export const metadata: Metadata = { title: "Soporte NELYX" }
export const dynamic = "force-dynamic"

export default async function SoportePage(props: { searchParams: Promise<{ c?: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN" || session.user.esEmpleado) redirect("/dashboard/resumen")
  const searchParams = await props.searchParams

  return <SoporteAdminClient conversacionInicialId={searchParams.c ?? null} />
}
