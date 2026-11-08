"use client"
// Código que corre en el navegador, compartido entre el widget de chat del
// cliente y el panel de admin de Soporte — ambos lados pueden adjuntar una
// imagen al responder. Mismos límites que el servidor (ver la validación
// real, que es la que de verdad manda, en app/api/soporte/subir-adjunto y
// adjuntoValido en soporte-acciones.ts); esto es solo para avisar rápido en
// vez de esperar el viaje al servidor para enterarse de que el archivo no
// sirve.
import { upload } from "@vercel/blob/client"

const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024

export function validarArchivoAdjunto(file: File): string | null {
  if (!TIPOS_PERMITIDOS.includes(file.type)) return "Solo se pueden adjuntar imágenes (PNG, JPG, WEBP o GIF)."
  if (file.size > TAMANO_MAXIMO_BYTES) return "La imagen es demasiado grande (máximo 8MB)."
  return null
}

export interface AdjuntoSubido { url: string; nombre: string; tipo: string; tamano: number }

/** Sube el archivo a Vercel Blob (vía /api/soporte/subir-adjunto, que
 * autoriza y genera el token de subida) y devuelve la referencia lista
 * para mandarle a enviarMensajeCliente/enviarMensajeSoporte. */
export async function subirAdjuntoSoporte(file: File): Promise<AdjuntoSubido> {
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/soporte/subir-adjunto",
  })
  return { url: blob.url, nombre: file.name, tipo: file.type, tamano: file.size }
}

/** Extrae la primera imagen de un evento de pegado (Ctrl+V de una captura
 * copiada al portapapeles) — null si lo pegado no es una imagen. */
export function imagenDePortapapeles(e: React.ClipboardEvent): File | null {
  for (const item of Array.from(e.clipboardData.items)) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
