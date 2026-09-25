"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

export async function obtenerAutomatizacionesCliente() {
  const session = await getSession()
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { recordatoriosCobranzaAutoActivo: true, recordatoriosCumpleanosAutoActivo: true, recordatoriosCobranzaDiasAntes: true },
  })
  return {
    cobranza: user?.recordatoriosCobranzaAutoActivo ?? false,
    cumpleanos: user?.recordatoriosCumpleanosAutoActivo ?? false,
    diasAntes: user?.recordatoriosCobranzaDiasAntes ?? 2,
  }
}

export async function actualizarAutomatizacionesCliente(campo: "cobranza" | "cumpleanos", activo: boolean) {
  const session = await getSession()
  await db.user.update({
    where: { id: session.user.id },
    data: campo === "cobranza"
      ? { recordatoriosCobranzaAutoActivo: activo }
      : { recordatoriosCumpleanosAutoActivo: activo },
  })
  revalidatePath("/dashboard/configuracion")
}

export async function actualizarDiasAntesCobranza(dias: number) {
  const session = await getSession()
  const diasValido = Math.min(30, Math.max(0, Math.round(dias) || 0))
  await db.user.update({
    where: { id: session.user.id },
    data: { recordatoriosCobranzaDiasAntes: diasValido },
  })
  revalidatePath("/dashboard/configuracion")
  return diasValido
}
