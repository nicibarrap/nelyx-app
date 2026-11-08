"use server"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notificar } from "@/lib/notificaciones"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"
import { tieneAcceso } from "@/lib/permisos"
import { ESTADOS_SUGERENCIA, type EstadoSugerencia } from "@/lib/sugerencias"

// Mismo patrón que soporte-acciones.ts — el tablero de Sugerencias vive
// dentro del mismo widget de chat, así que comparte su gateo de permisos
// ("soporte"): si un empleado puede usar el chat de Soporte, también puede
// dejar sugerencias de producto.

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  await verificarCuentaActivaOExpulsar(session)
  return session
}

async function getSessionAdmin() {
  const session = await getSession()
  if (session.user.role !== "ADMIN" || session.user.esEmpleado) throw new Error("No autorizado")
  return session
}

function nombreAutor(session: Awaited<ReturnType<typeof getSession>>) {
  return session.user.name || (session.user.esEmpleado ? "Empleado" : "Dueño de cuenta")
}

function tieneAccesoCliente(session: Awaited<ReturnType<typeof getSession>>) {
  if (session.user.role === "ADMIN" && !session.user.esEmpleado) return false
  return tieneAcceso(session.user.modulosPermitidos, "soporte")
}

function serializeSugerencia(s: {
  id: string; titulo: string; descripcion: string; estado: string; notaAdmin: string | null
  autorNombre: string | null; createdAt: Date; updatedAt: Date
}) {
  return {
    id: s.id, titulo: s.titulo, descripcion: s.descripcion, estado: s.estado, notaAdmin: s.notaAdmin,
    autorNombre: s.autorNombre, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  }
}

/** Devuelve { error } en vez de lanzar para las validaciones esperadas —
 * mismo motivo que el resto de las Server Actions del proyecto (un throw
 * pierde su mensaje real en producción). */
export async function crearSugerencia(titulo: string, descripcion: string): Promise<{ error: string } | undefined> {
  const session = await getSession()
  if (!tieneAccesoCliente(session)) return { error: "No tienes acceso a este módulo" }

  const tituloLimpio = titulo.trim()
  const descripcionLimpia = descripcion.trim()
  if (!tituloLimpio) return { error: "Escribe un título breve para tu idea" }
  if (tituloLimpio.length > 120) return { error: "El título es demasiado largo (máximo 120 caracteres)" }
  if (!descripcionLimpia) return { error: "Cuéntanos un poco más en la descripción" }
  if (descripcionLimpia.length > 2000) return { error: "La descripción es demasiado larga (máximo 2000 caracteres)" }

  await db.sugerencia.create({
    data: { userId: session.user.id, titulo: tituloLimpio, descripcion: descripcionLimpia, autorNombre: nombreAutor(session) },
  })
  revalidatePath("/admin/sugerencias")
}

export async function obtenerMisSugerencias() {
  const session = await getSession()
  if (!tieneAccesoCliente(session)) return []
  const sugerencias = await db.sugerencia.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: "desc" }, take: 50 })
  return sugerencias.map(serializeSugerencia)
}

// ── Panel admin ──────────────────────────────────────────────────────────

/** Cuántas sugerencias siguen sin revisar ("nueva") — para el número junto
 * a "Sugerencias" en el menú lateral, mismo patrón que contarNoLeidosAdmin
 * en soporte-acciones.ts. */
export async function contarNuevasSugerenciasAdmin() {
  const session = await getSession()
  if (session.user.role !== "ADMIN" || session.user.esEmpleado) return 0
  return db.sugerencia.count({ where: { estado: "nueva" } })
}

export async function obtenerSugerenciasAdmin(estado?: string) {
  await getSessionAdmin()
  const sugerencias = await db.sugerencia.findMany({
    where: estado ? { estado } : undefined,
    orderBy: { updatedAt: "desc" },
    include: { user: { select: { negocio: true, nombre: true } } },
    take: 300,
  })
  return sugerencias.map(s => ({ ...serializeSugerencia(s), negocio: s.user.negocio || s.user.nombre }))
}

export async function actualizarEstadoSugerencia(id: string, estado: EstadoSugerencia, notaAdmin?: string): Promise<{ error: string } | undefined> {
  await getSessionAdmin()
  if (!ESTADOS_SUGERENCIA.includes(estado)) return { error: "Estado inválido" }

  const sugerencia = await db.sugerencia.update({
    where: { id },
    data: { estado, notaAdmin: notaAdmin?.trim() || null },
  })

  const ETIQUETAS: Record<EstadoSugerencia, string> = {
    nueva: "Nueva", en_analisis: "En análisis", planificado: "Planificado",
    en_desarrollo: "En desarrollo", implementado: "Implementado", no_por_ahora: "No por ahora",
  }
  await notificar({
    userId: sugerencia.userId,
    categoria: "soporte",
    prioridad: estado === "implementado" ? "alta" : "media",
    titulo: `Tu sugerencia "${sugerencia.titulo}" ahora está: ${ETIQUETAS[estado]}`,
    mensaje: notaAdmin?.trim() || "Revisa el detalle en el chat de Soporte.",
    accionUrl: "/dashboard/resumen",
    claveUnica: `sugerencia-${id}-${estado}-${Date.now()}`,
  }).catch(() => {}) // el cambio de estado ya quedó guardado — la notificación es un plus, no debe hacer fallar la acción

  revalidatePath("/admin/sugerencias")
}
