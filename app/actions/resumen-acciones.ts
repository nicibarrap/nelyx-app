"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { prepararGraficoAnual } from "@/lib/utils"

/**
 * Trae los movimientos de TODO el año en una sola consulta y los agrega en
 * memoria por mes — se llama únicamente cuando el usuario elige la vista
 * "Anual" del gráfico (no en cada carga de Resumen), y solo una vez por año
 * visitado gracias al cacheo en el cliente.
 */
export async function obtenerDatosGraficoAnual(anio: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")

  const movimientos = await db.movimiento.findMany({
    where: { userId: session.user.id, fecha: { gte: new Date(anio, 0, 1), lt: new Date(anio + 1, 0, 1) } },
    select: { tipo: true, monto: true, fecha: true },
  })

  return prepararGraficoAnual(movimientos, anio)
}
