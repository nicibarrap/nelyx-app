"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { listarTerminalesMercadoPago, crearOrdenMercadoPago, consultarOrdenMercadoPago, type TerminalMP } from "@/lib/pagos/mercadopago"
import { esSoloLectura, type ModuloKey } from "@/lib/permisos"
import { cifrarToken, descifrarToken } from "@/lib/crypto-pagos"
// El tipo NO se re-exporta desde acá a propósito — un archivo "use server"
// solo debe exportar funciones async. Bajo Turbopack (Next 15), mezclar un
// "export type" en un archivo de Server Actions rompe el bundle cliente
// generado para CUALQUIERA que importe algo de este archivo (hasta
// componentes que nunca usan ese tipo, como venta-client.tsx, quedaban con
// un "ReferenceError: TerminalMP is not defined" en runtime). Quien
// necesite el tipo lo importa directo desde lib/pagos/mercadopago.

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

/** Igual que getSession(), pero rechaza a un empleado al que ese módulo se
 * le dejó en "solo lectura" — mismo patrón que getSessionEscritura en
 * app/actions/acciones.ts. */
async function getSessionEscritura(moduloKey: ModuloKey) {
  const session = await getSession()
  if (esSoloLectura(session.user.modulosPermitidos, moduloKey)) {
    throw new Error("Tu acceso a este módulo es solo de lectura")
  }
  return session
}

export async function obtenerConexionesPago() {
  const session = await getSession()
  const conexiones = await db.conexionPago.findMany({ where: { userId: session.user.id } })
  // accessToken nunca sale de acá — ni cifrado ni descifrado. La UI solo
  // necesita saber que la conexión existe y con qué terminal, nunca el token.
  return conexiones.map(c => ({ id: c.id, proveedor: c.proveedor, terminalId: c.terminalId, activo: c.activo, ultimaConexionOk: c.ultimaConexionOk?.toISOString() ?? null }))
}

/** Paso 1 al conectar Mercado Pago: solo con el Access Token, trae las
 * terminales de la cuenta para que el dueño elija — sin guardar nada
 * todavía, así puede confirmar antes de comprometerse. */
export async function listarTerminalesParaConectar(accessToken: string): Promise<TerminalMP[]> {
  await getSession()
  return listarTerminalesMercadoPago(accessToken)
}

/** Paso 2: guarda la conexión ya con la terminal elegida. El access token se
 * cifra antes de guardarlo (ver lib/crypto-pagos.ts) — nunca se guarda en
 * texto plano, ni aquí ni en ningún otro punto de entrada. */
export async function conectarMercadoPago(accessToken: string, terminalId: string) {
  const session = await getSessionEscritura("configuracion")
  const accessTokenCifrado = cifrarToken(accessToken)
  await db.conexionPago.upsert({
    where: { userId_proveedor: { userId: session.user.id, proveedor: "mercadopago" } },
    create: { userId: session.user.id, proveedor: "mercadopago", accessToken: accessTokenCifrado, terminalId, activo: true, ultimaConexionOk: new Date() },
    update: { accessToken: accessTokenCifrado, terminalId, activo: true, ultimaConexionOk: new Date() },
  })
  revalidatePath("/dashboard/configuracion")
  revalidatePath("/dashboard/venta")
}

export async function desconectarPago(proveedor: string) {
  const session = await getSessionEscritura("configuracion")
  await db.conexionPago.deleteMany({ where: { userId: session.user.id, proveedor } })
  revalidatePath("/dashboard/configuracion")
  revalidatePath("/dashboard/venta")
}

/** Se llama desde Venta al elegir "Cobrar con máquina conectada" — le pide
 * a la terminal que cobre el monto exacto. */
export async function iniciarCobroMaquina(monto: number, referenciaVenta: string) {
  const session = await getSessionEscritura("venta")
  const conexion = await db.conexionPago.findFirst({ where: { userId: session.user.id, proveedor: "mercadopago", activo: true } })
  if (!conexion || !conexion.terminalId) throw new Error("No tienes ninguna máquina de pago conectada. Ve a Configuración para conectarla.")

  const { orderId } = await crearOrdenMercadoPago(descifrarToken(conexion.accessToken), conexion.terminalId, monto, referenciaVenta)
  return { orderId }
}

/** Se consulta repetido cada 2-3 segundos desde el frontend mientras se
 * espera que el cliente ponga la tarjeta en la máquina. */
export async function consultarCobroMaquina(orderId: string) {
  const session = await getSession()
  const conexion = await db.conexionPago.findFirst({ where: { userId: session.user.id, proveedor: "mercadopago", activo: true } })
  if (!conexion) throw new Error("No hay ninguna máquina conectada")
  return consultarOrdenMercadoPago(descifrarToken(conexion.accessToken), orderId)
}
