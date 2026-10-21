// ══════════════════════════════════════════════════════════════════════
// Adaptador de SumUp — Cloud API: el lector (Solo) queda emparejado a una
// cuenta y un backend externo le manda la solicitud de cobro por HTTP, sin
// cable ni red local. Probado en vivo el 20-oct-2026 contra una cuenta
// sandbox real (Test Account) + un lector Virtual Solo emparejado — no es
// solo lectura de documentación.
//
// CONFIRMADO con pruebas reales (no solo documentación):
// - Listar lectores (GET /v0.1/merchants/{merchantCode}/readers): funciona,
//   devuelve el/los lectores emparejados con su id real — ojo, ese "id"
//   (formato "rdr_...") NO es el mismo que el "identifier" del dispositivo
//   que se ve en el dashboard (ese es otro campo, "device.identifier").
// - El merchantCode se usa tal cual aparece en el dashboard de SumUp
//   (ej. "MB436VFT"), no hay que transformarlo.
// - La cuenta de prueba solo acepta CLP — confirmado con el error real
//   "this merchant can only accept 'CLP'" al intentar con EUR.
// - Crear el cobro (POST .../checkout) funciona y devuelve
//   {"data":{"checkout_id","client_transaction_id"}} — confirmado con una
//   respuesta real exitosa. El "Invalid affiliate key" que bloqueó esto
//   mucho tiempo NUNCA fue un tema de activación de cuenta ni de formato
//   del Application ID: era un typo de transcripción en la Affiliate Key
//   usada en las pruebas (una "O" mayúscula en vez de un cero "0" en un
//   tramo del string) — la clave real, copiada tal cual del dashboard
//   (Ajustes → Para desarrolladores → Claves de Afiliado), funcionó a la
//   primera. Moraleja ya aplicada acá: nunca se hardcodea la Affiliate Key
//   a mano en este archivo, se exige por variable de entorno (ver abajo).
// - SumUp NO tiene un endpoint para consultar el estado de un cobro ya
//   creado — GET /v0.1/checkouts/{id} es un recurso DISTINTO (de la API de
//   Checkout Online normal), confirmado en vivo: da 404 para un
//   checkout_id devuelto por un cobro de lector. El resultado real llega
//   únicamente por webhook a `return_url` (confirmado contra el OpenAPI
//   spec oficial de SumUp: schema `ReaderCheckoutStatusChange`, con
//   `payload.status` en {"successful","failed"} y `payload.client_
//   transaction_id` como correlación). Por eso `crearCobroSumup` acá abajo
//   NO devuelve un estado — la consulta posterior se hace contra nuestra
//   propia base de datos (tabla CobroSumup), que el webhook en
//   app/api/webhooks/sumup/route.ts va actualizando. Ver ese archivo y
//   iniciarCobroMaquina/consultarCobroMaquina en app/actions/pagos-acciones.ts
//   para el resto del flujo.
//
// FLUJO COMPLETO CONFIRMADO EN PRODUCCIÓN (21-oct-2026): venta real por
// $2.000 CLP, cobrada con el lector Virtual Solo, webhook recibido y venta
// registrada con el monto correcto. Un detalle que generó dudas en esa
// prueba y vale la pena dejar escrito: la pantalla de
// https://virtual-solo.sumup.com/ mostró "CL$200000" para ese cobro de
// $2.000 (100x de más) — es un bug de visualización DEL SIMULADOR, no del
// monto real cobrado. Se confirmó contra el registro de la transacción en
// el dashboard de SumUp (Ventas), que mostró $2.000 correctos, igual que
// lo que quedó registrado en Nelyx. O sea: `total_amount.value` con
// `minor_unit: 0` en pesos CLP enteros (sin multiplicar por 100) es
// correcto — no "arreglar" esto si se vuelve a ver un monto raro ahí.
//
// AFFILIATE KEY — es un secreto A NIVEL DE APP, no por usuario/local:
// identifica a la integración de Nelyx ante SumUp (Application identifier
// + Affiliate Key, generados una sola vez desde Ajustes → Para
// desarrolladores → Claves de Afiliado de la cuenta que registra la app),
// a diferencia de apiKey/merchantCode/readerId que sí son de cada local y
// viven cifrados en ConexionPago. Por eso va en variables de entorno
// (SUMUP_AFFILIATE_APP_ID / SUMUP_AFFILIATE_KEY), nunca en la base de
// datos ni hardcodeada acá.
// ══════════════════════════════════════════════════════════════════════

const BASE = "https://api.sumup.com"

type ErrorSumup = { errors?: { detail?: string; [campo: string]: unknown } }

async function leerError(res: Response, mensajePorDefecto: string): Promise<string> {
  const cuerpo: ErrorSumup | null = await res.json().catch(() => null)
  if (cuerpo?.errors?.detail) return cuerpo.errors.detail
  const primerCampo = cuerpo?.errors ? Object.values(cuerpo.errors)[0] : null
  if (Array.isArray(primerCampo) && typeof primerCampo[0] === "string") return primerCampo[0]
  return mensajePorDefecto
}

export type LectorSumup = { id: string; nombre: string; estado: string }

/** Trae los lectores (terminales Solo) emparejados a la cuenta — se usa al
 * conectar, para que el dueño elija de una lista en vez de escribir el ID
 * de memoria. También sirve para validar que la API Key y el código de
 * comercio son correctos, sin cobrar nada. */
export async function listarLectoresSumup(apiKey: string, merchantCode: string): Promise<LectorSumup[]> {
  const res = await fetch(`${BASE}/v0.1/merchants/${merchantCode}/readers`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  })
  if (res.status === 401) throw new Error("La API Key no es válida — revísala en tu cuenta de SumUp")
  if (res.status === 404) throw new Error("No se encontró ese código de comercio — revísalo en tu cuenta de SumUp")
  if (!res.ok) throw new Error(await leerError(res, `SumUp respondió con error (${res.status})`))
  const data = await res.json()
  const items = data?.items ?? []
  return items.map((it: any) => ({ id: it.id, nombre: it.name, estado: it.status }))
}

/** Le pide al lector que cobre un monto. A diferencia de crearSolicitudPagoTuu
 * o crearOrdenMercadoPago, esto NO devuelve un estado consultable — devuelve
 * el client_transaction_id que SumUp usará para correlacionar el webhook
 * cuando el cobro termine (ver cabecera del archivo). Quien llama a esto
 * (iniciarCobroMaquina) es responsable de guardar ese id en CobroSumup
 * ANTES de que pueda llegar el webhook — por eso esta función no toca la
 * base de datos, solo habla con SumUp. */
export async function crearCobroSumup(apiKey: string, merchantCode: string, readerId: string, montoCLP: number, returnUrl: string, foreignTransactionId: string): Promise<{ checkoutId: string | null; clientTransactionId: string }> {
  const appId = process.env.SUMUP_AFFILIATE_APP_ID
  const affiliateKey = process.env.SUMUP_AFFILIATE_KEY
  if (!appId || !affiliateKey) throw new Error("Falta configurar SUMUP_AFFILIATE_APP_ID / SUMUP_AFFILIATE_KEY — sin esto SumUp siempre responde \"Invalid affiliate key\"")

  const res = await fetch(`${BASE}/v0.1/merchants/${merchantCode}/readers/${readerId}/checkout`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      total_amount: { currency: "CLP", minor_unit: 0, value: Math.round(montoCLP) },
      affiliate: { app_id: appId, key: affiliateKey, foreign_transaction_id: foreignTransactionId },
      return_url: returnUrl,
    }),
  })
  if (res.status === 401) throw new Error("La API Key no es válida — revísala en tu cuenta de SumUp")
  if (!res.ok) throw new Error(await leerError(res, `No se pudo iniciar el cobro en el lector (${res.status})`))
  const data = await res.json()
  const clientTransactionId = data?.data?.client_transaction_id
  if (!clientTransactionId) throw new Error("SumUp no devolvió un client_transaction_id — no hay forma de rastrear este cobro")
  return { checkoutId: data?.data?.checkout_id ?? null, clientTransactionId }
}
