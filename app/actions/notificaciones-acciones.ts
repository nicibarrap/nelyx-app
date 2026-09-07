"use server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

export async function obtenerNotificaciones(filtro: "todas" | "no_leidas" | "leidas" = "todas") {
  const session = await getSession()
  const where: any = { userId: session.user.id }
  if (filtro === "no_leidas") where.leida = false
  if (filtro === "leidas") where.leida = true
  const items = await db.notificacion.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 })
  return items.map(n => ({ ...n, createdAt: n.createdAt.toISOString() }))
}

export async function contarNoLeidas() {
  const session = await getSession()
  return db.notificacion.count({ where: { userId: session.user.id, leida: false } })
}

export async function marcarLeida(id: string) {
  const session = await getSession()
  await db.notificacion.updateMany({ where: { id, userId: session.user.id }, data: { leida: true } })
  revalidatePath("/dashboard")
}

export async function marcarTodasLeidas() {
  const session = await getSession()
  await db.notificacion.updateMany({ where: { userId: session.user.id, leida: false }, data: { leida: true } })
  revalidatePath("/dashboard")
}

export async function marcarPermisoDecidido() {
  const session = await getSession()
  await db.notificacionConfig.upsert({
    where: { userId: session.user.id },
    update: { permisoPedido: true },
    create: { userId: session.user.id, permisoPedido: true },
  })
}

export async function obtenerConfigNotificaciones() {
  const session = await getSession()
  let cfg = await db.notificacionConfig.findUnique({ where: { userId: session.user.id } })
  if (!cfg) cfg = await db.notificacionConfig.create({ data: { userId: session.user.id } })
  return cfg
}

export async function actualizarConfigNotificaciones(formData: FormData) {
  const session = await getSession()
  const campos = ["calendario","tareas","deudas","costosFijos","cuentasCobrar","clientes","inventario","reportes","renovaciones","alertasGenerales"] as const
  const data: Record<string, boolean> = {}
  for (const c of campos) data[c] = formData.get(c) === "on"
  await db.notificacionConfig.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  })
  revalidatePath("/dashboard/configuracion")
}
