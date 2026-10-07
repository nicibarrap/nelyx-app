"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { esSoloLectura } from "@/lib/permisos"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

/** Igual que getSession(), pero rechaza a un empleado al que "configuracion"
 * se le dejó en "solo lectura" — mismo patrón que getSessionEscritura en
 * app/actions/acciones.ts. */
async function getSessionEscritura() {
  const session = await getSession()
  if (esSoloLectura(session.user.modulosPermitidos, "configuracion")) {
    throw new Error("Tu acceso a este módulo es solo de lectura")
  }
  return session
}

// El recordatorio automático de cobranza por correo se retiró por completo
// (decisión explícita: Nelyx no le escribe a los clientes del dueño en su
// nombre sin que él lo sepa) — ver app/api/cron/notificaciones/route.ts.
// Solo queda el aviso de cumpleaños, que ahora notifica adentro de la app
// en vez de enviar un correo al cliente.
export async function obtenerAutomatizacionesCliente() {
  const session = await getSession()
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { recordatoriosCumpleanosAutoActivo: true },
  })
  return { cumpleanos: user?.recordatoriosCumpleanosAutoActivo ?? false }
}

export async function actualizarAutomatizacionCumpleanos(activo: boolean) {
  const session = await getSessionEscritura()
  await db.user.update({
    where: { id: session.user.id },
    data: { recordatoriosCumpleanosAutoActivo: activo },
  })
  revalidatePath("/dashboard/configuracion")
}
