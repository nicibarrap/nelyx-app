import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { tieneAcceso, esSoloLectura } from "@/lib/permisos"

// Solo imágenes (capturas de pantalla o fotos ya descargadas) — nada de
// documentos ni archivos ejecutables, ni para mantener el chat simple ni
// para ampliar la superficie de qué puede subirse al chat. 8MB alcanza de
// sobra para una captura de celular en alta resolución.
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await auth()
        if (!session?.user?.id) throw new Error("No autorizado")

        // Staff de Soporte (cuenta ADMIN, no empleado) siempre puede adjuntar
        // al responder. Para el lado del cliente, mismo gateo que el resto
        // del chat de Soporte: necesita el módulo "soporte" y no estar en
        // solo lectura.
        const esCuentaDeSoporte = session.user.role === "ADMIN" && !session.user.esEmpleado
        if (!esCuentaDeSoporte) {
          if (!tieneAcceso(session.user.modulosPermitidos, "soporte")) throw new Error("No tienes acceso a este módulo")
          if (esSoloLectura(session.user.modulosPermitidos, "soporte")) throw new Error("Tu acceso a Soporte es solo de lectura")
        }

        return {
          allowedContentTypes: TIPOS_PERMITIDOS,
          maximumSizeInBytes: TAMANO_MAXIMO_BYTES,
          addRandomSuffix: true,
        }
      },
      // Sin lado "onUploadCompleted" a propósito — el mensaje en sí (con la
      // URL del adjunto) lo crea el cliente después, llamando a
      // enviarMensajeCliente/enviarMensajeSoporte, no este callback (que
      // además no es confiable en desarrollo local sin un túnel público).
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir el archivo" }, { status: 400 })
  }
}
