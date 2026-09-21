import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 })
  }
  const { endpoint, keys } = body?.subscription ?? body ?? {}
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 })
  }

  try {
    await db.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.headers.get("user-agent") ?? undefined },
      create: { userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.headers.get("user-agent") ?? undefined },
    })

    await db.notificacionConfig.upsert({
      where: { userId: session.user.id },
      update: { permisoPedido: true },
      create: { userId: session.user.id, permisoPedido: true },
    })
  } catch (err) {
    console.error("Error al guardar suscripción push:", err)
    return NextResponse.json({ error: "No se pudo guardar la suscripción" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let endpoint: string | undefined
  try {
    ;({ endpoint } = await req.json())
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 })
  }

  try {
    if (endpoint) await db.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } })
  } catch (err) {
    console.error("Error al eliminar suscripción push:", err)
    return NextResponse.json({ error: "No se pudo eliminar la suscripción" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
