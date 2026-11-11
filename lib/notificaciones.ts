import { db } from "@/lib/db"
import { enviarPushAUsuario } from "@/lib/push"

export type CategoriaNotif =
  | "calendario" | "tareas" | "deudas" | "costosFijos" | "cuentasCobrar"
  | "clientes" | "inventario" | "reportes" | "renovaciones" | "alertasGenerales" | "soporte"

export const PRIORIDAD_CFG: Record<string, { label: string; color: string; icono: string }> = {
  alta:  { label: "Alta",  color: "red",    icono: "🔴" },
  media: { label: "Media", color: "amber",  icono: "🟠" },
  baja:  { label: "Baja",  color: "slate",  icono: "⚪" },
}

async function configDe(userId: string) {
  // upsert, no findUnique+create: el cron procesa lotes de notificaciones en
  // paralelo (procesarEnLotes) y dos ítems del mismo usuario en el mismo lote
  // podían pasar el findUnique (sin config todavía) antes de que el primer
  // create confirmara, y el segundo create rompía el @unique de userId
  // (JAVASCRIPT-NEXTJS-G en Sentry).
  return db.notificacionConfig.upsert({ where: { userId }, create: { userId }, update: {} })
}

/**
 * Crea una notificación (si no existe ya una con la misma claveUnica) y dispara el push.
 * Devuelve true si se creó y envió, false si fue omitida (deshabilitada o duplicada).
 */
export async function notificar(params: {
  userId: string
  categoria: CategoriaNotif
  prioridad: "alta" | "media" | "baja"
  titulo: string
  mensaje: string
  accionUrl?: string
  claveUnica: string
}) {
  const cfg = await configDe(params.userId)
  if (!cfg[params.categoria]) return false

  try {
    await db.notificacion.create({
      data: {
        userId: params.userId,
        categoria: params.categoria,
        prioridad: params.prioridad,
        titulo: params.titulo,
        mensaje: params.mensaje,
        accionUrl: params.accionUrl,
        claveUnica: params.claveUnica,
      },
    })
  } catch (err: any) {
    if (err?.code === "P2002") return false // ya existía (duplicado) — no reenviar
    throw err
  }

  await enviarPushAUsuario(params.userId, { titulo: params.titulo, mensaje: params.mensaje, url: params.accionUrl })
  return true
}

/** Elimina notificaciones pendientes relacionadas a una entidad (ej. al pagar una deuda). */
export async function cancelarNotificacionesPorPrefijo(prefix: string) {
  await db.notificacion.deleteMany({ where: { claveUnica: { startsWith: prefix } } })
}
