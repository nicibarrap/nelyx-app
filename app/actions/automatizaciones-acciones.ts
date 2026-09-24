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
    select: { recordatoriosCobranzaAutoActivo: true, recordatoriosCumpleanosAutoActivo: true },
  })
  return {
    cobranza: user?.recordatoriosCobranzaAutoActivo ?? false,
    cumpleanos: user?.recordatoriosCumpleanosAutoActivo ?? false,
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
