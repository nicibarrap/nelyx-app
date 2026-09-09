"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { calcularLotesProducto } from "@/lib/lotes"
import { deInterno } from "@/lib/unidades"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  return session
}

export async function obtenerLotesProductoAccion(productoId: string) {
  const session = await getSession()
  const prod = await db.producto.findFirst({ where: { id: productoId, userId: session.user.id }, select: { unidadMedida: true } })
  if (!prod) throw new Error("Producto no encontrado")

  const lotes = await calcularLotesProducto(productoId, session.user.id)
  return lotes.map(l => ({
    numero: l.numero,
    fechaVencimiento: l.fechaVencimiento,
    cantidadRestante: deInterno(l.cantidadRestante, prod.unidadMedida),
  }))
}
