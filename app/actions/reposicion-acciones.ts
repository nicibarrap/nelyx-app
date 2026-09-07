"use server"
import { auth } from "@/lib/auth"
import { ajustarStock } from "@/app/actions/acciones"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
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
export async function confirmarReposicionMasiva(
  items: { productoId: string; nombre: string; cantidad: number; costoUnitario?: number; fechaVencimiento?: string }[],
  proveedorId?: string
) {
  await getSession() // valida sesión antes de procesar cualquier ítem
  if (!items || items.length === 0) throw new Error("No hay productos para reponer")

  const errores: string[] = []
  const avisosCosto: NonNullable<Awaited<ReturnType<typeof ajustarStock>>>["avisoCosto"][] = []
  let exitosos = 0

  for (const item of items) {
    try {
      const resultado = await ajustarStock(item.productoId, item.cantidad, "agregar", "reposicion", {
        proveedorId: proveedorId || undefined,
        costoUnitario: item.costoUnitario,
        fechaVencimiento: item.fechaVencimiento,
      })
      if (resultado?.avisoCosto) avisosCosto.push(resultado.avisoCosto)
      exitosos++
    } catch (err: any) {
      errores.push(`${item.nombre}: ${err?.message ?? "error desconocido"}`)
    }
  }

  return { exitosos, total: items.length, errores, avisosCosto: avisosCosto.filter(Boolean) }
}
