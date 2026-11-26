"use client"
// Código de navegador para que el cliente suba su comprobante de pago desde
// "Mi suscripción" — mismo patrón que lib/soporte-adjuntos-cliente.ts
// (subida directa a Vercel Blob vía un endpoint que autoriza y genera el
// token). A diferencia de soporte, acá también se admite PDF: un comprobante
// bancario suele descargarse como PDF, no solo como captura de pantalla.
import { upload } from "@vercel/blob/client"

const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "application/pdf"]
const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024

export function validarComprobantePago(file: File): string | null {
  if (!TIPOS_PERMITIDOS.includes(file.type)) return "Solo se aceptan imágenes (PNG, JPG, WEBP) o PDF."
  if (file.size > TAMANO_MAXIMO_BYTES) return "El archivo es demasiado grande (máximo 8MB)."
  return null
}

/** Sube el comprobante a Vercel Blob (vía /api/suscripcion/subir-comprobante,
 * que autoriza y genera el token de subida) y devuelve la URL lista para
 * mandarle a reportarPagoCliente. */
export async function subirComprobantePago(file: File): Promise<string> {
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/suscripcion/subir-comprobante",
  })
  return blob.url
}
