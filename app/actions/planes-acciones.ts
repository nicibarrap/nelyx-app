"use server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"

async function getAdminSession() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN" || session.user.esEmpleado) throw new Error("No autorizado")
  await verificarCuentaActivaOExpulsar(session)
  return session
}

function serializePlan(p: { id: string; nombre: string; precio: Prisma.Decimal; meses: number; descripcion: string | null; activo: boolean }) {
  return { id: p.id, nombre: p.nombre, precio: Number(p.precio), meses: p.meses, descripcion: p.descripcion, activo: p.activo }
}

export type PlanDTO = ReturnType<typeof serializePlan>

function leerDatosPlan(formData: FormData) {
  const nombre = (formData.get("nombre") as string)?.trim()
  const precio = Number(formData.get("precio"))
  const meses = Number(formData.get("meses"))
  const descripcion = (formData.get("descripcion") as string)?.trim() || null
  if (!nombre) throw new Error("El nombre es obligatorio")
  if (!Number.isFinite(precio) || precio < 0) throw new Error("Precio inválido")
  if (!Number.isInteger(meses) || meses < 1) throw new Error("La recurrencia debe ser un número de meses de 1 o más")
  return { nombre, precio, meses, descripcion }
}

export async function obtenerPlanes(): Promise<PlanDTO[]> {
  await getAdminSession()
  const planes = await db.planNelyx.findMany({ orderBy: [{ activo: "desc" }, { precio: "asc" }] })
  return planes.map(serializePlan)
}

// ── Crear un plan nuevo ─────────────────────────────────────────────────
export async function crearPlan(formData: FormData): Promise<{ error: string } | undefined> {
 try {
  await getAdminSession()
  const datos = leerDatosPlan(formData)
  await db.planNelyx.create({ data: datos })
  revalidatePath("/admin/clientes")
 } catch (err) {
  return { error: err instanceof Error ? err.message : "No se pudo crear el plan." }
 }
}

// ── Editar nombre/precio/recurrencia/descripción de un plan existente ───
// El precio nuevo solo afecta los próximos cobros que se generen — nunca
// cambia cobros ya emitidos ni el precio que ya tiene fijado cada cliente
// hasta su próximo ciclo (ver comentario de precioPlan en schema.prisma).
export async function actualizarPlan(formData: FormData): Promise<{ error: string } | undefined> {
 try {
  await getAdminSession()
  const planId = formData.get("planId") as string
  const datos = leerDatosPlan(formData)
  await db.planNelyx.update({ where: { id: planId }, data: datos })
  revalidatePath("/admin/clientes")
 } catch (err) {
  return { error: err instanceof Error ? err.message : "No se pudo actualizar el plan." }
 }
}

// ── Activar / desactivar ─────────────────────────────────────────────────
// Nunca se borra un plan: desactivarlo solo lo saca de las opciones para
// una suscripción nueva o un cambio de plan — los clientes que ya lo tienen
// asignado lo siguen usando con normalidad.
export async function cambiarActivoPlan(planId: string, activo: boolean): Promise<{ error: string } | undefined> {
 try {
  await getAdminSession()
  await db.planNelyx.update({ where: { id: planId }, data: { activo } })
  revalidatePath("/admin/clientes")
 } catch (err) {
  return { error: err instanceof Error ? err.message : "No se pudo actualizar el plan." }
 }
}
