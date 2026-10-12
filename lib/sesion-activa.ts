import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import type { Session } from "next-auth"

// El middleware (ver middleware.ts) ya hace esta misma verificación fresca
// en cada visita a /dashboard o /admin — pero solo alcanza a protegerlo
// cuando hay una navegación real de por medio. Si la cuenta se desactiva
// mientras la persona está PARADA en una pantalla (sin recargar) y desde
// ahí dispara una Server Action, el POST también pasa por el middleware,
// que responde con un redirect HTTP crudo — pero ese formato no es el que
// Next.js espera como respuesta de una Server Action, así que el cliente
// solo ve "An unexpected response was received from the server" y se
// queda pegado en la misma pantalla, sin aviso y sin que la X de Nelyx
// llegue a mostrarse. La acción en sí no llega a ejecutarse (el mismo
// middleware la corta antes), pero la persona no se entera.
//
// Por eso cada getSession()/getAdminSession()/getSessionDueno() de este
// proyecto llama a esto antes de hacer cualquier otra cosa: la propia
// Server Action es quien decide expulsar, usando redirect() de
// next/navigation — la única forma que Next.js sí sabe traducir
// correctamente en una navegación real del lado del cliente cuando el
// resultado viene de una Server Action.
export async function verificarCuentaActivaOExpulsar(session: Session) {
  const idAVerificar = session.user.empleadoId || session.user.id
  const registro = await db.user.findUnique({
    where: { id: idAVerificar },
    select: { activo: true, cuentaPrincipal: { select: { activo: true } } },
  })
  const activo = !!registro && registro.activo && (registro.cuentaPrincipal?.activo ?? true)
  if (!activo) redirect("/auth/forzar-salida")
}
