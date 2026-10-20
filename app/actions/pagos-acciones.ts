"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { listarTerminalesMercadoPago, crearOrdenMercadoPago, consultarOrdenMercadoPago, type TerminalMP } from "@/lib/pagos/mercadopago"
import { validarApiKeyTuu, crearSolicitudPagoTuu, consultarSolicitudPagoTuu } from "@/lib/pagos/tuu"
import { listarLectoresSumup, type LectorSumup } from "@/lib/pagos/sumup"
import { esSoloLectura, type ModuloKey } from "@/lib/permisos"
import { cifrarToken, descifrarToken } from "@/lib/crypto-pagos"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"
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
  await verificarCuentaActivaOExpulsar(session)
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

/** Paso 1 al conectar TUU: no hay forma de listar terminales como en
 * Mercado Pago, así que solo se valida que la API Key sea correcta — el
 * número de serie del terminal lo escribe el dueño a mano (viene impreso
 * atrás de la máquina). */
export async function probarConexionTuu(apiKey: string) {
  await getSession()
  return validarApiKeyTuu(apiKey)
}

/** Paso 2: guarda la conexión con el terminal que el dueño escribió. La
 * API Key se cifra igual que el Access Token de Mercado Pago. */
export async function conectarTuu(apiKey: string, device: string) {
  const session = await getSessionEscritura("configuracion")
  const apiKeyCifrada = cifrarToken(apiKey)
  await db.conexionPago.upsert({
    where: { userId_proveedor: { userId: session.user.id, proveedor: "tuu" } },
    create: { userId: session.user.id, proveedor: "tuu", accessToken: apiKeyCifrada, terminalId: device, activo: true, ultimaConexionOk: new Date() },
    update: { accessToken: apiKeyCifrada, terminalId: device, activo: true, ultimaConexionOk: new Date() },
  })
  revalidatePath("/dashboard/configuracion")
  revalidatePath("/dashboard/venta")
}

/** Paso 1 al conectar SumUp: con la API Key y el código de comercio, trae
 * los lectores emparejados a la cuenta para que el dueño elija — sin
 * guardar nada todavía. */
export async function listarLectoresParaConectarSumup(apiKey: string, merchantCode: string): Promise<LectorSumup[]> {
  await getSession()
  return listarLectoresSumup(apiKey, merchantCode)
}

/** Paso 2: guarda la conexión con el lector elegido. SumUp necesita tanto
 * la API Key como el código de comercio en cada llamada (a diferencia de
 * Mercado Pago/TUU, que solo necesitan un token) — van juntos, cifrados,
 * dentro de accessToken; terminalId guarda el id del lector.
 *
 * NOTA: esta conexión queda guardada y validada, pero todavía no está
 * enchufada al cobro desde Venta (ver lib/pagos/sumup.ts) — SumUp confirma
 * el resultado de un cobro por webhook, no por consulta directa como los
 * otros proveedores, y esa pieza falta construir. Por eso "sumup" no está
 * en PROVEEDORES_MAQUINA más abajo. */
export async function conectarSumup(apiKey: string, merchantCode: string, readerId: string) {
  const session = await getSessionEscritura("configuracion")
  const credencialesCifradas = cifrarToken(JSON.stringify({ apiKey, merchantCode }))
  await db.conexionPago.upsert({
    where: { userId_proveedor: { userId: session.user.id, proveedor: "sumup" } },
    create: { userId: session.user.id, proveedor: "sumup", accessToken: credencialesCifradas, terminalId: readerId, activo: true, ultimaConexionOk: new Date() },
    update: { accessToken: credencialesCifradas, terminalId: readerId, activo: true, ultimaConexionOk: new Date() },
  })
  revalidatePath("/dashboard/configuracion")
  revalidatePath("/dashboard/venta")
}

// Un local solo debería tener una máquina conectada a la vez, pero como
// cada proveedor se guarda en su propia fila, nada impide tener dos
// activas al mismo tiempo. Si eso pasa, se prioriza Mercado Pago por ser
// la integración más probada ("mercadopago" < "tuu" alfabéticamente).
const PROVEEDORES_MAQUINA = ["mercadopago", "tuu"] as const

/** Se llama desde Venta al elegir "Cobrar con máquina conectada" — le pide
 * a la terminal que cobre el monto exacto, sea cual sea el proveedor que
 * el local tenga conectado. */
export async function iniciarCobroMaquina(monto: number, referenciaVenta: string) {
  const session = await getSessionEscritura("venta")
  const conexion = await db.conexionPago.findFirst({
    where: { userId: session.user.id, proveedor: { in: [...PROVEEDORES_MAQUINA] }, activo: true },
    orderBy: { proveedor: "asc" },
  })
  if (!conexion || !conexion.terminalId) throw new Error("No tienes ninguna máquina de pago conectada. Ve a Configuración para conectarla.")

  if (conexion.proveedor === "tuu") {
    const { paymentRequestId } = await crearSolicitudPagoTuu(descifrarToken(conexion.accessToken), conexion.terminalId, monto, referenciaVenta)
    return { orderId: String(paymentRequestId) }
  }
  const { orderId } = await crearOrdenMercadoPago(descifrarToken(conexion.accessToken), conexion.terminalId, monto, referenciaVenta)
  return { orderId }
}

/** Se consulta repetido cada 2-3 segundos desde el frontend mientras se
 * espera que el cliente ponga la tarjeta en la máquina. */
export async function consultarCobroMaquina(orderId: string) {
  const session = await getSession()
  const conexion = await db.conexionPago.findFirst({
    where: { userId: session.user.id, proveedor: { in: [...PROVEEDORES_MAQUINA] }, activo: true },
    orderBy: { proveedor: "asc" },
  })
  if (!conexion) throw new Error("No hay ninguna máquina conectada")

  if (conexion.proveedor === "tuu") return consultarSolicitudPagoTuu(descifrarToken(conexion.accessToken), orderId)
  return consultarOrdenMercadoPago(descifrarToken(conexion.accessToken), orderId)
}
