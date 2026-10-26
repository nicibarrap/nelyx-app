// ══════════════════════════════════════════════════════════════════════
// Adaptador de BCI Pagos — Cloud-to-Cloud: a diferencia de Getnet (donde
// nunca se consiguió documentación completa) y de Transbank/SumUp (cable o
// agente local), BCI Pagos sí publica documentación oficial completa y
// pública para su integración 100% en la nube (sin cable, sin agente local)
// en developers.pagofacil.cl — confirmado el 25-oct-2026.
//
// Arquitectura confirmada contra la documentación oficial:
// - El terminal (PAX A920 Pro con la app "cl.bci.bcipagos.dev") se vincula
//   una sola vez con nuestro sistema vía POST /nebula-acs/api/v1/pos-binding
//   (con un código de 5 dígitos que se genera en el propio terminal).
// - Para cobrar, se piden credenciales MQTT de un solo uso (duran un par de
//   horas) vía POST /nebula-acs/api/v1/mqtt-access-applying, y se publica el
//   mensaje de venta en el tópico /ecr-req/{appId}/{clientId}, esperando la
//   respuesta en /ecr-res/{appId}/{clientId} — confirmado con los ejemplos
//   oficiales de la transacción "Sale".
// - El payload va anidado en 3 capas (transferencia → control → parámetros),
//   cada una serializada como JSON dentro de un string — confirmado contra
//   los ejemplos oficiales, campo por campo.
//
// Lo que NO está en la documentación pública (no se adivinó, queda como
// configuración pendiente de confirmar con credenciales reales):
// - El host base de la API REST (solo se documenta la ruta relativa
//   /nebula-acs/api/v1/..., nunca el dominio) — por eso BCIPAGOS_API_URL es
//   una variable de entorno obligatoria, no un valor fijo en este archivo.
// - El esquema exacto de "autenticación básica" (la doc solo dice "Basic
//   {Authinfo}" y remite a una sección "Autenticación básica" que no existe
//   en ninguna página pública encontrada) — se implementa como HTTP Basic
//   Auth estándar (base64 de appId:appSecret), que es la lectura más
//   razonable de "mecanismo de autenticación básica de HTTPS", pero falta
//   confirmar contra una cuenta real.
// - El puerto/esquema de conexión MQTT (la doc solo dice que "host" es una
//   IP) — se usa mqtts:// (TLS, puerto 8883 por defecto), el estándar del
//   protocolo, pendiente de confirmar.
// - El valor de "eid" (identificador del EPOS) — la doc no dice si lo
//   asigna BCI o lo elige el integrador; se usa un valor fijo ("NELYX").
//
// Nunca se ha probado contra un terminal BCI Pagos real — para eso hace
// falta un comercio con el equipo contratado y vinculado vía MAXSTORE (el
// sistema de aprovisionamiento interno de BCI), algo que ninguna cuenta de
// desarrollador por sí sola puede desbloquear.
// ══════════════════════════════════════════════════════════════════════

const PACKAGE_NAME = "cl.bci.bcipagos.dev"
const EID = "NELYX"
const SDK_VERSION = 4

function obtenerBaseUrl(): string {
  const base = process.env.BCIPAGOS_API_URL
  if (!base) throw new Error("Falta configurar BCIPAGOS_API_URL — no está documentado públicamente, hay que pedírselo a BCI Pagos junto con las credenciales del comercio")
  return base.replace(/\/$/, "")
}

function encabezadoBasicAuth(appId: string, appSecret: string): string {
  return `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`
}

/** Paso 1 de la vinculación: el código de 5 dígitos lo genera el propio
 * terminal (pantalla "Bind New EPOS") — acá solo se confirma contra la
 * nube y se obtiene el número de serie del terminal vinculado. */
export async function vincularTerminalBciPagos(appId: string, appSecret: string, codigo: string): Promise<{ serialNumber: string }> {
  const res = await fetch(`${obtenerBaseUrl()}/nebula-acs/api/v1/pos-binding`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": encabezadoBasicAuth(appId, appSecret) },
    body: JSON.stringify({ code: codigo }),
  })
  if (!res.ok) throw new Error(`No se pudo vincular el terminal (${res.status}) — revisa que el código no haya expirado (dura ~5 minutos) y vuelve a generarlo en el terminal`)
  const data = await res.json()
  if (!data?.sn) throw new Error("BCI Pagos no devolvió el número de serie del terminal")
  return { serialNumber: String(data.sn) }
}

async function obtenerCredencialesMqtt(appId: string, appSecret: string, serialNumber: string): Promise<{ host: string; clientId: string; username: string; password: string }> {
  const res = await fetch(`${obtenerBaseUrl()}/nebula-acs/api/v1/mqtt-access-applying`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": encabezadoBasicAuth(appId, appSecret) },
    body: JSON.stringify({ eid: EID, sn: [serialNumber], isWebsocket: false }),
  })
  if (!res.ok) throw new Error(`No se pudieron obtener las credenciales de conexión (${res.status})`)
  const data = await res.json()
  if (!data?.host || !data?.clientId) throw new Error("BCI Pagos no devolvió credenciales de conexión válidas")
  return data
}

/** Arma el mensaje de 3 capas (transferencia → control → parámetros) que
 * exige el protocolo — confirmado contra el ejemplo oficial de la
 * transacción Sale. */
export function armarMensajeVenta(appId: string, serialNumber: string, idTransaccion: string, montoCLP: number, ticket: string) {
  const capaParametros = { saleAmount: Math.round(montoCLP), ticket, print: false, saleType: 0, tipAmount: 0, installmentsNumber: 0, metadata: "" }
  const capaControl = { packageName: PACKAGE_NAME, category: "cl.transformapp.payment.sale", jsonData: JSON.stringify(capaParametros) }
  return {
    sdkVersion: SDK_VERSION,
    appId,
    id: idTransaccion,
    eid: EID,
    sn: serialNumber,
    time: Date.now(),
    type: "com.pax.nebula.message.Payment",
    jsonData: JSON.stringify(capaControl),
  }
}

/** Intenta parsear la capa de parámetros de la respuesta. El ejemplo
 * oficial de la respuesta trae un ":" sobrante antes de la llave de
 * apertura del jsonData interno (parece un error de tipeo en la propia
 * documentación) — se saca ese ":" si aparece, para no fallar por un typo
 * ajeno a nuestro código. */
export function parsearCapaAnidada(json: string): any {
  try {
    return JSON.parse(json)
  } catch {
    return JSON.parse(json.replace(/^:/, ""))
  }
}

export type ResultadoCobroBciPagos = { aprobado: boolean; mensaje: string | null; crudo: any }

/** Vincula, obtiene credenciales MQTT, publica la venta y espera la
 * respuesta en el tópico de la transacción — todo en una sola llamada
 * bloqueante, porque el protocolo no tiene ningún endpoint REST para
 * consultar el resultado después: la única forma de saber qué pasó es
 * quedarse escuchando el tópico MQTT de respuesta. */
export async function cobrarBciPagos(appId: string, appSecret: string, serialNumber: string, montoCLP: number, ticket: string): Promise<ResultadoCobroBciPagos> {
  const { host, clientId, username, password } = await obtenerCredencialesMqtt(appId, appSecret, serialNumber)
  const mqtt = await import("mqtt")
  const idTransaccion = crypto.randomUUID()
  const topicoPublicar = `/ecr-req/${appId}/${clientId}`
  const topicoSuscribir = `/ecr-res/${appId}/${clientId}`

  const client = await mqtt.default.connectAsync(`mqtts://${host}`, { clientId, username, password, connectTimeout: 15000 })
  try {
    const resultado = await new Promise<ResultadoCobroBciPagos>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.removeListener("message", onMessage)
        reject(new Error("Se acabó el tiempo de espera — si el cliente sí pagó, verifica en tu cuenta de BCI Pagos antes de reintentar."))
      }, 90_000)

      function onMessage(topic: string, payload: Buffer) {
        if (topic !== topicoSuscribir) return
        try {
          const respuesta = JSON.parse(payload.toString("utf8"))
          if (respuesta?.id !== idTransaccion) return // respuesta de otra transacción en el mismo tópico
          clearTimeout(timeout)
          client.removeListener("message", onMessage)
          if (respuesta.retCode !== 0) {
            resolve({ aprobado: false, mensaje: respuesta.errMsg || "El terminal rechazó la operación", crudo: respuesta })
            return
          }
          const capaControl = parsearCapaAnidada(respuesta.jsonData)
          const parametros = parsearCapaAnidada(capaControl.jsonData)
          resolve({ aprobado: parametros.responseCode === 0, mensaje: parametros.responseMessage ?? null, crudo: respuesta })
        } catch (err) {
          clearTimeout(timeout)
          client.removeListener("message", onMessage)
          reject(new Error("No se pudo interpretar la respuesta de BCI Pagos"))
        }
      }

      client.on("message", onMessage)
      client.subscribe(topicoSuscribir, { qos: 1 }, (err) => {
        if (err) { clearTimeout(timeout); reject(new Error("No se pudo suscribir al tópico de respuesta")); return }
        const mensaje = armarMensajeVenta(appId, serialNumber, idTransaccion, montoCLP, ticket)
        client.publish(topicoPublicar, JSON.stringify(mensaje), { qos: 1 }, (err) => {
          if (err) { clearTimeout(timeout); reject(new Error("No se pudo enviar el cobro al terminal")) }
        })
      })
    })
    return resultado
  } finally {
    await client.endAsync().catch(() => {})
  }
}
