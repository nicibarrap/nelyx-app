"use server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notificar } from "@/lib/notificaciones"
import { enviarEmail } from "@/lib/email"
import { detectarUrgencia, MENSAJE_AUTO_RESPUESTA } from "@/lib/soporte-logica"
import { generarRespuestaIA } from "@/lib/soporte-ia"

async function getSession() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
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

/** Crea un hilo de conversación nuevo, aparte de cualquier otro que ya
 * exista (abierto o resuelto) — "Enviános un mensaje" en Inicio siempre
 * arranca una conversación aparte; para seguir una ya existente, el
 * cliente la abre desde la pestaña Mensajes. Dueño y empleados de una
 * misma cuenta comparten los mismos hilos con Soporte Nelyx. */
export async function crearNuevaConversacion() {
  const session = await getSession()
  if (session.user.role === "ADMIN" && !session.user.esEmpleado) throw new Error("No disponible para cuentas de soporte")
  const conv = await db.conversacionSoporte.create({ data: { userId: session.user.id } })
  return { id: conv.id }
}

/** Solo cuenta, sin marcar como leído — para el badge del botón flotante
 * mientras el panel del chat sigue cerrado. Suma no leídos de TODAS las
 * conversaciones de la cuenta, no solo la abierta — una respuesta tardía
 * en un hilo ya resuelto también debe notificarse. */
export async function contarNoLeidosCliente() {
  const session = await getSession()
  if (session.user.role === "ADMIN" && !session.user.esEmpleado) return 0
  return db.mensajeSoporte.count({
    where: { de: { in: ["soporte", "sistema"] }, leidoCliente: false, conversacion: { userId: session.user.id } },
  })
}

/** Solo cuenta, sin marcar como leído — para el número en el ítem "Soporte
 * NELYX" del menú lateral del panel admin, mientras esa sección sigue
 * cerrada. Cuenta mensajes de clientes sin leer de TODAS las
 * conversaciones, no solo la que esté abierta en ese momento. */
export async function contarNoLeidosAdmin() {
  const session = await getSession()
  if (session.user.role !== "ADMIN" || session.user.esEmpleado) return 0
  return db.mensajeSoporte.count({ where: { de: "cliente", leidoSoporte: false } })
}

/** Lista de conversaciones de la cuenta (abiertas y resueltas), más
 * reciente primero — para la pestaña "Mensajes" del widget de soporte,
 * al estilo de un listado de hilos con título + fecha. */
export async function obtenerConversacionesCliente() {
  const session = await getSession()
  if (session.user.role === "ADMIN" && !session.user.esEmpleado) return []

  const convs = await db.conversacionSoporte.findMany({
    where: { userId: session.user.id },
    orderBy: { ultimoMensajeAt: "desc" },
    take: 50,
  })
  if (convs.length === 0) return []
  const ids = convs.map(c => c.id)

  // Tres consultas agregadas (no una por conversación): el primer mensaje
  // del cliente da el "título" del hilo, el último mensaje (de quien sea)
  // da la vista previa, y el conteo agrupado da los no leídos por hilo.
  const [primeros, ultimos, noLeidosPorConv] = await Promise.all([
    db.mensajeSoporte.findMany({ where: { conversacionId: { in: ids }, de: "cliente" }, orderBy: { createdAt: "asc" }, distinct: ["conversacionId"] }),
    db.mensajeSoporte.findMany({ where: { conversacionId: { in: ids } }, orderBy: { createdAt: "desc" }, distinct: ["conversacionId"] }),
    db.mensajeSoporte.groupBy({ by: ["conversacionId"], where: { conversacionId: { in: ids }, de: { in: ["soporte", "sistema"] }, leidoCliente: false }, _count: { id: true } }),
  ])
  const tituloPorConv = new Map(primeros.map(m => [m.conversacionId, m.contenido]))
  const ultimoPorConv = new Map(ultimos.map(m => [m.conversacionId, m]))
  const noLeidosMap = new Map(noLeidosPorConv.map(g => [g.conversacionId, g._count.id]))

  return convs.map(c => {
    const titulo = tituloPorConv.get(c.id) ?? "Nueva conversación"
    const ultimo = ultimoPorConv.get(c.id)
    return {
      id: c.id,
      estado: c.estado,
      titulo: titulo.length > 48 ? titulo.slice(0, 48) + "…" : titulo,
      ultimoMensaje: ultimo?.contenido ?? "",
      ultimoMensajeAt: c.ultimoMensajeAt.toISOString(),
      noLeidos: noLeidosMap.get(c.id) ?? 0,
    }
  })
}

export async function obtenerMensajesCliente(conversacionId: string) {
  const session = await getSession()
  const conv = await db.conversacionSoporte.findUnique({ where: { id: conversacionId } })
  if (!conv || conv.userId !== session.user.id) throw new Error("No autorizado")

  await db.mensajeSoporte.updateMany({
    where: { conversacionId, de: { in: ["soporte", "sistema"] }, leidoCliente: false },
    data: { leidoCliente: true },
  })

  // Últimos 300 en vez de la conversación completa: un hilo muy largo no
  // debe poder inflar esta consulta sin límite cada vez que se abre.
  const mensajes = await db.mensajeSoporte.findMany({ where: { conversacionId }, orderBy: { createdAt: "desc" }, take: 300 })
  return mensajes.reverse().map(m => ({ ...m, createdAt: m.createdAt.toISOString() }))
}

export async function enviarMensajeCliente(conversacionId: string, contenido: string, paginaOrigen?: string) {
  const session = await getSession()
  const texto = contenido.trim()
  if (!texto) return
  if (texto.length > 2000) throw new Error("El mensaje es demasiado largo (máximo 2000 caracteres).")

  // Las tres consultas son independientes entre sí (ninguna necesita el
  // resultado de otra, solo conversacionId) — antes iban en dos viajes
  // seguidos a la base de datos (el conv primero, los conteos después);
  // ahora es uno solo. La validación de dueño del hilo sigue pasando antes
  // de usar cualquiera de los resultados.
  const desde = new Date(Date.now() - 5 * 60 * 1000)
  const [conv, recientes, totalMensajes] = await Promise.all([
    db.conversacionSoporte.findUnique({ where: { id: conversacionId } }),
    db.mensajeSoporte.count({ where: { conversacionId, de: "cliente", createdAt: { gte: desde } } }),
    db.mensajeSoporte.count({ where: { conversacionId } }),
  ])
  if (!conv || conv.userId !== session.user.id) throw new Error("No autorizado")
  if (recientes >= 20) throw new Error("Estás escribiendo muy rápido — espera un momento antes de enviar otro mensaje.")

  const esPrimerMensaje = totalMensajes === 0
  const urgente = detectarUrgencia(texto)

  // La auto-respuesta del primer mensaje se genera en after() (ver abajo) —
  // así le da tiempo a la IA a responder algo real en vez del texto fijo de
  // siempre, sin bloquear el envío del mensaje del cliente. El widget del
  // chat ya refresca solo cada 4s mientras el hilo está abierto, así que
  // aparece igual de rápido para quien está esperando.
  // Crear el mensaje y actualizar la conversación tampoco dependen entre
  // sí — otro viaje menos a la base de datos antes de responder.
  const [mensaje] = await Promise.all([
    db.mensajeSoporte.create({
      data: { conversacionId, de: "cliente", autorNombre: nombreAutor(session), contenido: texto, paginaOrigen, urgente },
    }),
    db.conversacionSoporte.update({
      where: { id: conversacionId },
      data: { estado: "abierta", ultimoMensajeDe: "cliente", ultimoMensajeAt: new Date(), recordatorioEnviado: false },
    }),
  ])

  revalidatePath("/admin/soporte")

  // Avisa a soporte (staff ADMIN) — in-app + push + correo. Corre con
  // after(), DESPUÉS de responderle al cliente: antes el envío del mensaje
  // se sentía lento (varios segundos) porque la UI esperaba a que
  // terminaran el push y el correo, que son llamadas HTTP externas y no
  // tienen por qué bloquear la respuesta.
  const negocio = session.user.negocio || "Un negocio en Nelyx"
  const previa = texto.length > 140 ? texto.slice(0, 140) + "…" : texto
  const nombre = nombreAutor(session)
  after(async () => {
    if (esPrimerMensaje) {
      try {
        const respuestaIA = await generarRespuestaIA(texto)
        await db.mensajeSoporte.create({
          data: { conversacionId, de: "sistema", contenido: respuestaIA ?? MENSAJE_AUTO_RESPUESTA },
        })
        revalidatePath("/admin/soporte")
      } catch (err) {
        // Si hasta el fallback falla (ej. la DB), que quede visible — pero
        // no debe impedir que igual se intente notificar a los admins abajo.
        Sentry.captureException(err, { extra: { conversacionId, etapa: "auto-respuesta" } })
      }
    }
    try {
      const admins = await db.user.findMany({ where: { rol: "ADMIN", cuentaPrincipalId: null }, select: { id: true, email: true } })
      await Promise.all(admins.map(async (admin) => {
        // Separados: si notificar() (in-app + push) falla para un admin, no
        // debe impedir que igual le llegue el correo — antes un error acá
        // cortaba la cadena antes de intentar el envío de email.
        await notificar({
          userId: admin.id,
          categoria: "soporte",
          prioridad: urgente ? "alta" : "media",
          titulo: `${urgente ? "🔴 " : ""}Nuevo mensaje de ${negocio}`,
          mensaje: previa,
          accionUrl: `/admin/soporte?c=${conversacionId}`,
          claveUnica: `soporte-${conversacionId}-${Date.now()}`,
        }).catch((err) => Sentry.captureException(err, { extra: { conversacionId, adminId: admin.id, etapa: "notificar" } }))

        if (admin.email) {
          await enviarEmail({
            to: admin.email,
            subject: `${urgente ? "[URGENTE] " : ""}Nuevo mensaje de soporte — ${negocio}`,
            text: `${nombre} (${negocio}) escribió:\n\n"${texto}"\n\nResponder: ${process.env.NEXT_PUBLIC_APP_URL || ""}/admin/soporte?c=${conversacionId}`,
          })
        }
      }))
    } catch (err) {
      // Red de seguridad: un after() que lanza una excepción no capturada
      // puede no quedar registrado en ningún lado — con esto, sí.
      console.error("Error notificando mensaje de soporte a admins:", err)
      Sentry.captureException(err, { extra: { conversacionId } })
    }
  })

  // Devuelve el mensaje recién creado — el widget lo usa para reemplazar
  // su burbuja optimista en vez de pedir la conversación completa de
  // nuevo, que era un segundo viaje redondo al servidor completo (con sus
  // propias consultas a la base de datos) solo para traer lo mismo que ya
  // tiene en pantalla más este único mensaje nuevo.
  return { id: mensaje.id, de: mensaje.de, autorNombre: mensaje.autorNombre, contenido: mensaje.contenido, createdAt: mensaje.createdAt.toISOString() }
}

// ── Panel de soporte (staff ADMIN) ──────────────────────────────────────

export async function obtenerConversacionesAdmin() {
  await getSessionAdmin()
  const convs = await db.conversacionSoporte.findMany({
    orderBy: { ultimoMensajeAt: "desc" },
    include: {
      user: { select: { negocio: true, nombre: true } },
      // Excluye los mensajes "sistema" (auto-respuesta / recordatorio) de
      // la vista previa — si no, tapan el mensaje real del cliente apenas
      // se dispara la auto-respuesta, y con eso también se pierde el flag
      // de urgencia (los mensajes de sistema nunca son urgentes).
      mensajes: { where: { de: { not: "sistema" } }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { mensajes: { where: { de: "cliente", leidoSoporte: false } } } },
    },
    take: 200,
  })
  return convs.map(c => ({
    id: c.id,
    estado: c.estado,
    negocio: c.user.negocio || c.user.nombre,
    ultimoMensajeDe: c.ultimoMensajeDe,
    ultimoMensajeAt: c.ultimoMensajeAt.toISOString(),
    ultimoMensaje: c.mensajes[0]?.contenido ?? "",
    urgente: c.mensajes[0]?.urgente ?? false,
    noLeidos: c._count.mensajes,
  }))
}

export async function obtenerMensajesAdmin(conversacionId: string) {
  await getSessionAdmin()
  await db.mensajeSoporte.updateMany({
    where: { conversacionId, de: "cliente", leidoSoporte: false },
    data: { leidoSoporte: true },
  })
  const mensajes = await db.mensajeSoporte.findMany({ where: { conversacionId }, orderBy: { createdAt: "desc" }, take: 300 })
  return mensajes.reverse().map(m => ({ ...m, createdAt: m.createdAt.toISOString() }))
}

export async function enviarMensajeSoporte(conversacionId: string, contenido: string) {
  await getSessionAdmin()
  const texto = contenido.trim()
  if (!texto) return
  if (texto.length > 2000) throw new Error("El mensaje es demasiado largo (máximo 2000 caracteres).")

  const conv = await db.conversacionSoporte.findUnique({ where: { id: conversacionId } })
  if (!conv) throw new Error("Conversación no encontrada")

  await db.mensajeSoporte.create({
    data: { conversacionId, de: "soporte", autorNombre: "Soporte Nelyx", contenido: texto },
  })
  await db.conversacionSoporte.update({
    where: { id: conversacionId },
    data: { ultimoMensajeDe: "soporte", ultimoMensajeAt: new Date(), recordatorioEnviado: false },
  })
  revalidatePath("/admin/soporte")
}

export async function marcarConversacionResuelta(conversacionId: string, resuelta: boolean) {
  await getSessionAdmin()
  await db.conversacionSoporte.update({ where: { id: conversacionId }, data: { estado: resuelta ? "resuelta" : "abierta" } })
  revalidatePath("/admin/soporte")
}
