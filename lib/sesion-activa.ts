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
    select: { activo: true, modulosPermitidos: true, cuentaPrincipal: { select: { activo: true } } },
  })
  const activo = !!registro && registro.activo && (registro.cuentaPrincipal?.activo ?? true)
  if (!activo) redirect("/auth/forzar-salida")

  // Bug real reportado por un dueño probando en producción: le daba acceso
  // a un módulo nuevo a un empleado YA logueado y la navegación lo dejaba
  // entrar (el middleware ya consulta esto fresco — ver middleware.ts),
  // pero cualquier Server Action de esa pantalla seguía rechazándolo con
  // "No tienes acceso a este módulo". Causa: session.user.modulosPermitidos
  // viene del JWT, y el callback jwt() de lib/auth.ts solo lo recalcula al
  // iniciar sesión — se queda "congelado" con los permisos de cuando el
  // empleado entró, sin importar cuántos cambios le haga el dueño después,
  // hasta que vuelva a loguearse. getSession()/getSessionEscritura() de
  // TODA la plataforma llaman a esta función antes que nada, así que
  // refrescar acá (reemplazando el valor del JWT por el de la DB, recién
  // leído arriba) corrige el problema una sola vez para todos los módulos,
  // sin tener que tocar cada getSessionEscritura(moduloKey) por separado.
  session.user.modulosPermitidos = session.user.empleadoId ? (registro?.modulosPermitidos ?? null) : null
}
