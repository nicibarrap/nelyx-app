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
//
// BLOQUEADO — por eso NO se implementó el cobro (crearCobro) todavía:
// - Cada intento de POST .../checkout (con Amount en CLP, minor_unit 0,
//   más el objeto "affiliate": { app_id, key, foreign_transaction_id })
//   devolvió siempre {"errors":{"detail":"Invalid affiliate key.",
//   "type":"INVALID_AFFILIATE_KEY"}}, incluso recreando la Affiliate Key y
//   probando distintos Application ID — API Key, merchantCode y readerId
//   confirmados correctos (el listado de lectores funciona con las mismas
//   credenciales). Parece requerir alguna activación manual de SumUp;
//   se les escribió a soporte. Como nunca se obtuvo una respuesta exitosa
//   real de creación de cobro, no hay forma honesta de confirmar la forma
//   exacta de esa respuesta sin adivinarla.
// - Además, a diferencia de Mercado Pago y TUU, SumUp no documenta un
//   endpoint para consultar el estado de un cobro ya creado — el
//   mecanismo oficial es un webhook (`return_url`) que SumUp llama cuando
//   la transacción termina. Conectar esto a Venta requeriría un endpoint
//   público nuevo (ej. app/api/webhooks/sumup) que lo correlacione con la
//   venta — es una pieza de arquitectura aparte, no incluida acá.
//
// Por ambos motivos, este archivo solo cubre la conexión/validación de
// credenciales (lo que sí se probó y funciona) — el cobro en sí queda
// pendiente hasta resolver lo de la Affiliate Key con soporte de SumUp.
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
