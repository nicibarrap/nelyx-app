import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

// Imagen o PDF del comprobante bancario — nada de ejecutables ni otros
// documentos. 8MB alcanza de sobra para una foto o un PDF descargado del
// banco.
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "application/pdf"]
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
        // Solo el dueño de la cuenta reporta pagos de SU suscripción —
        // un empleado no tiene por qué ver ni tocar la facturación del
        // negocio con Nelyx.
        if (session.user.esEmpleado) throw new Error("No tienes acceso a esta sección")

        return {
          allowedContentTypes: TIPOS_PERMITIDOS,
          maximumSizeInBytes: TAMANO_MAXIMO_BYTES,
          addRandomSuffix: true,
        }
      },
      // Sin lado "onUploadCompleted" a propósito, igual que
      // /api/soporte/subir-adjunto: el registro del pago (con la URL del
      // comprobante) lo crea el cliente después, llamando a
      // reportarPagoCliente — no este callback, que además no es
      // confiable en desarrollo local sin un túnel público.
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir el archivo" }, { status: 400 })
  }
}
