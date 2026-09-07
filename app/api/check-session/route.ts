import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ activo: false, modulosPermitidos: null })

  // Clave del fix: si es un empleado, hay que revisar SU PROPIO registro
  // (session.user.id siempre es la cuenta del dueño, por diseño, para que
  // el resto de la plataforma funcione sin cambios) — no el del dueño.
  // Así, desactivar a un empleado lo expulsa de verdad, y un cambio de
  // permisos se refleja sin que tenga que volver a iniciar sesión.
  const idAVerificar = session.user.empleadoId || session.user.id
  const registro = await db.user.findUnique({
    where: { id: idAVerificar },
    select: { activo: true, modulosPermitidos: true },
  })

  if (!registro) return NextResponse.json({ activo: false, modulosPermitidos: null })

  return NextResponse.json({
    activo: registro.activo,
    // El dueño nunca tiene módulos restringidos (null = acceso total).
    // Solo un empleado tiene una lista real.
    modulosPermitidos: session.user.empleadoId ? registro.modulosPermitidos : null,
  })
}
