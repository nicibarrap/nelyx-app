// ══════════════════════════════════════════════════════════════════════
// Adaptador de Transbank POS Integrado — a diferencia de Mercado Pago, TUU
// y SumUp, esto NO es una API en la nube: es un cable (USB o serial RS232)
// conectado al mismo computador donde corre el navegador. Por eso este
// módulo, a diferencia de lib/pagos/mercadopago.ts y tuu.ts, no corre en el
// servidor — corre en el navegador y le habla directo al "Agente Web" de
// Transbank instalado en ese computador (servidor local Socket.IO en
// https://localhost:8090, puerto fijo — no se puede cambiar).
//
// Confirmado el 24-oct-2026 contra la documentación oficial
// (TransbankDevelopers/transbank-developers-docs, documentacion/posintegrado)
// y el código fuente publicado del paquete npm transbank-pos-sdk-web@5.1.0
// (TransbankDevelopers/transbank-pos-sdk-web-js), incluyendo su archivo de
// tipos (dist/pos.d.ts) y el bundle compilado:
// - connect() apunta por defecto a "https://localhost:8090" — confirmado
//   en el código compilado, no solo en la documentación.
// - getPorts() envía "listPorts" al agente — la forma exacta de cada
//   puerto no está documentada (el tipo es object[] genérico), por eso
//   etiquetarPuerto() más abajo prueba varios nombres de campo conocidos
//   de librerías de puertos seriales antes de caer a JSON.stringify.
// - openPort(puerto) y doSale(monto, ticket) — firmas confirmadas contra
//   dist/pos.d.ts. doSale() devuelve un SaleResponse con responseCode
//   (0 = aprobado, confirmado contra el ejemplo oficial de la
//   documentación: "if (saleResponse.responseCode===0) alert('aprobada')").
//
// Sin probar todavía contra un Agente ni un POS físico real — falta
// confirmar en terreno cuánto tarda en fallar connect() cuando no hay
// ningún Agente corriendo (la clase del SDK trae un timeout interno de
// 120 segundos, así que un error claro puede tardar en aparecer).
// ══════════════════════════════════════════════════════════════════════

type PuertoTransbank = { valor: string; etiqueta: string }

// El SDK depende de socket.io-client y solo tiene sentido en el navegador
// (le habla a localhost). Import dinámico para que este módulo se pueda
// importar sin problema desde código que a veces corre en el servidor
// (como venta-client.tsx, que Next.js evalúa una vez en el servidor para
// el primer render).
async function cargarSDK() {
  const mod = await import("transbank-pos-sdk-web")
  return mod.default
}

export function etiquetarPuerto(puerto: any): string {
  return puerto?.path ?? puerto?.comName ?? puerto?.port ?? puerto?.name ?? JSON.stringify(puerto)
}

export async function conectarAgenteTransbank(): Promise<void> {
  const POS = await cargarSDK()
  try {
    const ok = await POS.connect()
    if (!ok) throw new Error()
  } catch {
    throw new Error("No se encontró el Agente Transbank corriendo en este computador. Instálalo y ábrelo antes de cobrar (ver Configuración → Transbank).")
  }
}

export async function listarPuertosTransbank(): Promise<PuertoTransbank[]> {
  const POS = await cargarSDK()
  const puertos = await POS.getPorts()
  return (puertos ?? []).map((p: any) => ({ valor: etiquetarPuerto(p), etiqueta: etiquetarPuerto(p) }))
}

async function abrirPuertoTransbank(puerto: string): Promise<void> {
  const POS = await cargarSDK()
  const ok = await POS.openPort(puerto)
  if (!ok) throw new Error(`No se pudo conectar con el POS en el puerto ${puerto}. Revisa el cable y que el equipo esté en "modo POS integrado".`)
}

/** Botón "Probar conexión" en Configuración — abre el puerto y hace un
 * poll (no cobra nada) para confirmar que el POS responde de verdad. */
export async function probarPuertoTransbank(puerto: string): Promise<void> {
  const POS = await cargarSDK()
  await conectarAgenteTransbank()
  await abrirPuertoTransbank(puerto)
  const conectado = await POS.poll()
  if (!conectado) throw new Error(`El POS no respondió en el puerto ${puerto}. Revisa el cable y que el equipo esté en "modo POS integrado".`)
}

export type ResultadoCobroTransbank = { aprobado: boolean; mensaje: string | null; crudo: any }

/** Se llama desde Venta al cobrar — a diferencia de Mercado Pago/TUU no
 * hay que crear una orden y después consultarla: doSale() solo responde
 * una vez que el cliente ya puso (o no) la tarjeta en el POS. */
export async function cobrarTransbank(puerto: string, montoCLP: number, ticket: string): Promise<ResultadoCobroTransbank> {
  await conectarAgenteTransbank()
  await abrirPuertoTransbank(puerto)
  const POS = await cargarSDK()
  const respuesta = await POS.doSale(Math.round(montoCLP), ticket)
  return { aprobado: respuesta?.responseCode === 0, mensaje: respuesta?.responseMessage ?? null, crudo: respuesta }
}
