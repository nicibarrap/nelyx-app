"use server"
import { auth } from "@/lib/auth"
import { sugerirEmojiIA } from "@/lib/emoji-ia"

// Mismo motivo que buscarProductoPorCodigoBarras en openfoodfacts-acciones.ts:
// sin el gate de sesión, esta Server Action queda como un proxy abierto que
// cualquiera en internet podría llamar para gastar la cuota de la API de
// Anthropic configurada en Vercel, sin relación con el uso real de la app.
export async function obtenerEmojiSugeridoIA(nombre: string): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  const texto = nombre.trim()
  if (!texto) return null
  return sugerirEmojiIA(texto)
}
