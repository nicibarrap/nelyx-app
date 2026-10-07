import crypto from "crypto"

// Cifrado en reposo del access token de las conexiones de pago (Mercado
// Pago Point, por ahora) — antes se guardaba en texto plano en
// ConexionPago.accessToken: un credential de pago en vivo, legible por
// cualquiera con acceso a un volcado de la base de datos. AES-256-GCM con
// una clave fuera de la base de datos (variable de entorno) hace que ese
// volcado, solo, ya no alcance para usar el token.
//
// PAGOS_ENCRYPTION_KEY: 32 bytes en base64 (generar con
// `openssl rand -base64 32`). Sin esta variable configurada, conectar una
// máquina de pago falla con un error claro en vez de guardar el token sin
// cifrar — nunca hay un modo "de respaldo" en texto plano.

const ALGORITMO = "aes-256-gcm"
// GCM usa un authTag de 16 bytes por defecto en Node, pero hay que
// pedirlo explícito (en cifrado Y descifrado) — sin esto, un
// authTagLength más corto podría llegar a aceptarse, lo que facilita
// forjar textos cifrados (hallazgo de Semgrep: node-crypto.security.gcm-no-tag-length).
const LARGO_AUTH_TAG = 16

function obtenerClave(): Buffer {
  const claveBase64 = process.env.PAGOS_ENCRYPTION_KEY
  if (!claveBase64) throw new Error("Falta configurar PAGOS_ENCRYPTION_KEY — no se puede guardar ni leer un token de pago sin ella")
  const clave = Buffer.from(claveBase64, "base64")
  if (clave.length !== 32) throw new Error("PAGOS_ENCRYPTION_KEY debe decodificar a exactamente 32 bytes (generar con: openssl rand -base64 32)")
  return clave
}

/** Devuelve "iv:authTag:cifrado", todo en base64, separado por ":". */
export function cifrarToken(textoPlano: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITMO, obtenerClave(), iv, { authTagLength: LARGO_AUTH_TAG })
  const cifrado = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${cifrado.toString("base64")}`
}

export function descifrarToken(valorCifrado: string): string {
  const partes = valorCifrado.split(":")
  if (partes.length !== 3) throw new Error("Token de pago con formato inválido — ¿se guardó antes de activar el cifrado?")
  const [ivB64, authTagB64, cifradoB64] = partes
  const decipher = crypto.createDecipheriv(ALGORITMO, obtenerClave(), Buffer.from(ivB64, "base64"), { authTagLength: LARGO_AUTH_TAG })
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"))
  const textoPlano = Buffer.concat([decipher.update(Buffer.from(cifradoB64, "base64")), decipher.final()])
  return textoPlano.toString("utf8")
}
