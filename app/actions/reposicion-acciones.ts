"use server"
import { auth } from "@/lib/auth"
import { ajustarStock } from "@/app/actions/acciones"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  await verificarCuentaActivaOExpulsar(session)
  return session
}

/**
 * Confirma de una sola vez todos los productos escaneados en "Actualizar
 * inventario". NO tiene lógica de stock propia — por cada producto llama
 * a la misma `ajustarStock` que ya usa el ajuste manual desde la ficha del
 * producto, con motivo "reposicion" (mismo Kardex, mismo costo promedio
 * ponderado si se informa costo). Si un ítem falla, se sigue con el resto y
 * se informan los que sí y los que no, en vez de perder toda la reposición.
 */
// Devuelve {ok,error} en vez de lanzar en los chequeos de arriba (sesión,
// lista vacía) — mismo motivo que crearEventoCalendario en acciones.ts: un
// throw crudo fuera de una Server Action se enmascara en producción.
export async function confirmarReposicionMasiva(
  items: { productoId: string; nombre: string; cantidad: number; costoUnitario?: number; fechaVencimiento?: string; observacion?: string }[],
  proveedorId?: string
): Promise<{ ok: boolean; error?: string; exitosos: number; total: number; errores: string[]; avisosCosto: NonNullable<Awaited<ReturnType<typeof ajustarStock>>["avisoCosto"]>[] }> {
 try {
  await getSession() // valida sesión antes de procesar cualquier ítem
  if (!items || items.length === 0) throw new Error("No hay productos para reponer")

  const errores: string[] = []
  const avisosCosto: NonNullable<Awaited<ReturnType<typeof ajustarStock>>["avisoCosto"]>[] = []
  let exitosos = 0

  for (const item of items) {
    const resultado = await ajustarStock(item.productoId, item.cantidad, "agregar", "reposicion", {
      proveedorId: proveedorId || undefined,
      costoUnitario: item.costoUnitario,
      fechaVencimiento: item.fechaVencimiento,
      observacion: item.observacion,
    })
    if (!resultado.ok) {
      errores.push(`${item.nombre}: ${resultado.error ?? "error desconocido"}`)
      continue
    }
    if (resultado.avisoCosto) avisosCosto.push(resultado.avisoCosto)
    exitosos++
  }

  return { ok: true, exitosos, total: items.length, errores, avisosCosto }
 } catch (err) {
  return { ok: false, error: err instanceof Error ? err.message : "No se pudo confirmar la reposición.", exitosos: 0, total: items?.length ?? 0, errores: [], avisosCosto: [] }
 }
}
