"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { listarTerminalesMercadoPago, crearOrdenMercadoPago, consultarOrdenMercadoPago, type TerminalMP } from "@/lib/pagos/mercadopago"
export type { TerminalMP }

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

export async function obtenerConexionesPago() {
  const session = await getSession()
  const conexiones = await db.conexionPago.findMany({ where: { userId: session.user.id } })
  return conexiones.map(c => ({ id: c.id, proveedor: c.proveedor, terminalId: c.terminalId, activo: c.activo, ultimaConexionOk: c.ultimaConexionOk?.toISOString() ?? null }))
}

/** Paso 1 al conectar Mercado Pago: solo con el Access Token, trae las
 * terminales de la cuenta para que el dueño elija — sin guardar nada
 * todavía, así puede confirmar antes de comprometerse. */
export async function listarTerminalesParaConectar(accessToken: string): Promise<TerminalMP[]> {
  await getSession()
  return listarTerminalesMercadoPago(accessToken)
}

/** Paso 2: guarda la conexión ya con la terminal elegida. */
export async function conectarMercadoPago(accessToken: string, terminalId: string) {
  const session = await getSession()
  await db.conexionPago.upsert({
    where: { userId_proveedor: { userId: session.user.id, proveedor: "mercadopago" } },
    create: { userId: session.user.id, proveedor: "mercadopago", accessToken, terminalId, activo: true, ultimaConexionOk: new Date() },
    update: { accessToken, terminalId, activo: true, ultimaConexionOk: new Date() },
  })
  revalidatePath("/dashboard/configuracion")
  revalidatePath("/dashboard/venta")
}

export async function desconectarPago(proveedor: string) {
  const session = await getSession()
  await db.conexionPago.deleteMany({ where: { userId: session.user.id, proveedor } })
  revalidatePath("/dashboard/configuracion")
  revalidatePath("/dashboard/venta")
}

/** Se llama desde Venta al elegir "Cobrar con máquina conectada" — le pide
 * a la terminal que cobre el monto exacto. */
export async function iniciarCobroMaquina(monto: number, referenciaVenta: string) {
  const session = await getSession()
  const conexion = await db.conexionPago.findFirst({ where: { userId: session.user.id, proveedor: "mercadopago", activo: true } })
  if (!conexion || !conexion.terminalId) throw new Error("No tienes ninguna máquina de pago conectada. Ve a Configuración para conectarla.")

  const { orderId } = await crearOrdenMercadoPago(conexion.accessToken, conexion.terminalId, monto, referenciaVenta)
  return { orderId }
}

/** Se consulta repetido cada 2-3 segundos desde el frontend mientras se
 * espera que el cliente ponga la tarjeta en la máquina. */
export async function consultarCobroMaquina(orderId: string) {
  const session = await getSession()
  const conexion = await db.conexionPago.findFirst({ where: { userId: session.user.id, proveedor: "mercadopago", activo: true } })
  if (!conexion) throw new Error("No hay ninguna máquina conectada")
  return consultarOrdenMercadoPago(conexion.accessToken, orderId)
}
