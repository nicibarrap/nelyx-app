import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { enviarPushAUsuario } from "@/lib/push"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const subs = await db.pushSubscription.count({ where: { userId: session.user.id } })
  if (subs === 0) {
    return NextResponse.json({ ok: false, error: "No hay ninguna suscripción push guardada para tu cuenta." }, { status: 400 })
  }

  await enviarPushAUsuario(session.user.id, {
    titulo: "🔔 Nelyx",
    mensaje: "Esta es una notificación de prueba. ¡Todo está funcionando!",
    url: "/dashboard/configuracion",
  })

  return NextResponse.json({ ok: true, dispositivos: subs })
}
