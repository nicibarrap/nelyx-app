"use server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { notificar } from "@/lib/notificaciones"
import { enviarEmail } from "@/lib/email"
import { detectarUrgencia, MENSAJE_AUTO_RESPUESTA, MENSAJE_RECORDATORIO } from "@/lib/soporte-logica"
import { generarRespuestaIA } from "@/lib/soporte-ia"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"
import { tieneAcceso, esSoloLectura } from "@/lib/permisos"

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

/** Lo que llega del lado del cliente después de subir el archivo a Vercel
 * Blob (ver app/api/soporte/subir-adjunto/route.ts) — esta acción no sube
 * nada, solo guarda la referencia junto con el mensaje. El tipo y el
 * tamaño ya quedaron validados server-side al generar el token de subida;
 * acá se vuelve a chequear por las dudas (defensa en profundidad, nunca
 * confiar ciegamente en un dato que viene del cliente). */
interface AdjuntoInput { url: string; nombre: string; tipo: string; tamano: number }
const TIPOS_ADJUNTO_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const TAMANO_ADJUNTO_MAXIMO = 8 * 1024 * 1024

function adjuntoValido(adjunto: AdjuntoInput | undefined | null): string | null {
  if (!adjunto) return null
  if (!TIPOS_ADJUNTO_PERMITIDOS.includes(adjunto.tipo)) return "Solo se pueden adjuntar imágenes (PNG, JPG, WEBP o GIF)."
  if (adjunto.tamano > TAMANO_ADJUNTO_MAXIMO) return "La imagen es demasiado grande (máximo 8MB)."
  return null
}

// Cuenta de Nelyx Soporte usándose a sí misma (no un dueño/empleado real) —
// nunca debe poder abrir el widget de cliente.
function esCuentaDeSoporte(session: Awaited<ReturnType<typeof getSession>>) {
  return session.user.role === "ADMIN" && !session.user.esEmpleado
}

/** ¿Puede este usuario siquiera VER el chat de Soporte? El dueño siempre
 * (modulosPermitidos null) — un empleado solo si se le habilitó el módulo
 * "soporte" explícitamente. Antes no había ningún chequeo acá: cualquier
 * empleado, sin importar sus demás permisos, podía leer TODO el historial
 * de conversaciones de la cuenta con Soporte Nelyx. */
function tieneAccesoSoporteCliente(session: Awaited<ReturnType<typeof getSession>>) {
  if (esCuentaDeSoporte(session)) return false
  return tieneAcceso(session.user.modulosPermitidos, "soporte")
}

/** Solo cuenta, sin marcar como leído — para el badge del botón flotante
 * mientras el panel del chat sigue cerrado. Suma no leídos de TODAS las
 * conversaciones de la cuenta, no solo la abierta — una respuesta tardía
 * en un hilo ya resuelto también debe notificarse. */
export async function contarNoLeidosCliente() {
  const session = await getSession()
  if (!tieneAccesoSoporteCliente(session)) return 0
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
  if (!tieneAccesoSoporteCliente(session)) return []

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
  if (!tieneAccesoSoporteCliente(session)) throw new Error("No tienes acceso a este módulo")
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

// Devuelve { error } en vez de lanzar para los casos esperados (igual que
// el resto de las Server Actions del proyecto — ver comentario de
// crearEmpleado en empleados-acciones.ts): un throw desde una Server
// Action pierde su mensaje real en producción (Next.js lo reemplaza por uno
// genérico al cruzar al cliente), así que un dato de retorno normal es la
// única forma confiable de que el mensaje real llegue a la pantalla.
export async function enviarMensajeCliente(conversacionId: string | null, contenido: string, paginaOrigen?: string, adjunto?: AdjuntoInput): Promise<
  | { error: string }
  | { id: string; conversacionId: string; de: string; autorNombre: string | null; contenido: string; createdAt: string; adjuntoUrl: string | null; adjuntoNombre: string | null; adjuntoTipo: string | null }
  | undefined
> {
  const session = await getSession()
  if (!tieneAccesoSoporteCliente(session)) return { error: "No tienes acceso a este módulo" }
  if (esSoloLectura(session.user.modulosPermitidos, "soporte")) return { error: "Tu acceso a Soporte es solo de lectura" }
  const texto = contenido.trim()
  if (!texto && !adjunto) return
  if (texto.length > 2000) return { error: "El mensaje es demasiado largo (máximo 2000 caracteres)." }
  const errorAdjunto = adjuntoValido(adjunto)
  if (errorAdjunto) return { error: errorAdjunto }

  // Sin hilo todavía (primer mensaje de "Envíanos un mensaje" en Inicio):
  // se crea recién acá, en el mismo envío — antes crearNuevaConversacion()
  // era una acción aparte que el widget llamaba primero, lo que dejaba una
  // ventana donde un hilo vacío (sin ningún mensaje) podía quedar creado en
  // la base de datos sin que el cliente nunca llegara a escribirle nada
  // (por ejemplo, si cierra el panel antes de escribir, o si algo llama a
  // esa acción directamente sin pasar por la UI) — esos hilos fantasma
  // nunca se podían limpiar y quedaban ensuciando tanto la pestaña
  // Mensajes del cliente como el inbox de Soporte para siempre.
  let conv: { id: string; userId: string }
  let totalMensajes: number
  if (conversacionId) {
    // Las tres consultas son independientes entre sí (ninguna necesita el
    // resultado de otra, solo conversacionId) — antes iban en dos viajes
    // seguidos a la base de datos (el conv primero, los conteos después);
    // ahora es uno solo. La validación de dueño del hilo sigue pasando antes
    // de usar cualquiera de los resultados.
    const desde = new Date(Date.now() - 5 * 60 * 1000)
    const [convExistente, recientes, total] = await Promise.all([
      db.conversacionSoporte.findUnique({ where: { id: conversacionId } }),
      db.mensajeSoporte.count({ where: { conversacionId, de: "cliente", createdAt: { gte: desde } } }),
      db.mensajeSoporte.count({ where: { conversacionId } }),
    ])
    if (!convExistente || convExistente.userId !== session.user.id) throw new Error("No autorizado")
    if (recientes >= 20) return { error: "Estás escribiendo muy rápido — espera un momento antes de enviar otro mensaje." }
    conv = convExistente
    totalMensajes = total
  } else {
    conv = await db.conversacionSoporte.create({ data: { userId: session.user.id } })
    totalMensajes = 0
  }
  conversacionId = conv.id

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
      data: {
        conversacionId, de: "cliente", autorNombre: nombreAutor(session), contenido: texto, paginaOrigen, urgente,
        adjuntoUrl: adjunto?.url, adjuntoNombre: adjunto?.nombre, adjuntoTipo: adjunto?.tipo, adjuntoTamano: adjunto?.tamano,
      },
    }),
    db.conversacionSoporte.update({
      where: { id: conversacionId },
      data: { estado: "abierta", fechaResuelta: null, ultimoMensajeDe: "cliente", ultimoMensajeAt: new Date(), recordatorioEnviado: false },
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
    // Solo avisa (push + correo) por el primer mensaje de la conversación,
    // o por cualquier mensaje posterior que se detecte urgente — un hilo con
    // varios mensajes normales seguidos ya no manda un correo por cada uno.
    // El mensaje de todas formas queda guardado y visible en el panel de
    // Soporte apenas se abra esa conversación, aunque no haya notificación.
    if (esPrimerMensaje || urgente) {
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
    }
  })

  // Devuelve el mensaje recién creado — el widget lo usa para reemplazar
  // su burbuja optimista en vez de pedir la conversación completa de
  // nuevo, que era un segundo viaje redondo al servidor completo (con sus
  // propias consultas a la base de datos) solo para traer lo mismo que ya
  // tiene en pantalla más este único mensaje nuevo. conversacionId va
  // incluido para el caso de un hilo recién creado en este mismo envío —
  // el widget no tenía forma de saber su id hasta ahora.
  return {
    id: mensaje.id, conversacionId, de: mensaje.de, autorNombre: mensaje.autorNombre, contenido: mensaje.contenido, createdAt: mensaje.createdAt.toISOString(),
    adjuntoUrl: mensaje.adjuntoUrl, adjuntoNombre: mensaje.adjuntoNombre, adjuntoTipo: mensaje.adjuntoTipo,
  }
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

export async function enviarMensajeSoporte(conversacionId: string, contenido: string, adjunto?: AdjuntoInput) {
  await getSessionAdmin()
  const texto = contenido.trim()
  if (!texto && !adjunto) return
  if (texto.length > 2000) throw new Error("El mensaje es demasiado largo (máximo 2000 caracteres).")
  const errorAdjunto = adjuntoValido(adjunto)
  if (errorAdjunto) throw new Error(errorAdjunto)

  const conv = await db.conversacionSoporte.findUnique({ where: { id: conversacionId } })
  if (!conv) throw new Error("Conversación no encontrada")

  await db.mensajeSoporte.create({
    data: {
      conversacionId, de: "soporte", autorNombre: "Soporte Nelyx", contenido: texto,
      adjuntoUrl: adjunto?.url, adjuntoNombre: adjunto?.nombre, adjuntoTipo: adjunto?.tipo, adjuntoTamano: adjunto?.tamano,
    },
  })
  await db.conversacionSoporte.update({
    where: { id: conversacionId },
    data: { ultimoMensajeDe: "soporte", ultimoMensajeAt: new Date(), recordatorioEnviado: false },
  })
  revalidatePath("/admin/soporte")
}

export async function marcarConversacionResuelta(conversacionId: string, resuelta: boolean) {
  await getSessionAdmin()
  // fechaResuelta es el ancla que usa la limpieza semanal de adjuntos (ver
  // cron/notificaciones) — se limpia al reabrir para que un hilo reabierto
  // no arrastre una fecha vieja que lo haga candidato a limpieza de nuevo
  // sin haber pasado otra semana resuelto de verdad.
  await db.conversacionSoporte.update({
    where: { id: conversacionId },
    data: { estado: resuelta ? "resuelta" : "abierta", fechaResuelta: resuelta ? new Date() : null },
  })

  // Al marcar resuelta (no al reabrir) se avisa al cliente — mismo mensaje
  // de cierre que ya existía para el recordatorio automático por inactividad,
  // ahora también se manda al toque cuando soporte resuelve el hilo a mano.
  if (resuelta) {
    await db.mensajeSoporte.create({
      data: { conversacionId, de: "sistema", contenido: MENSAJE_RECORDATORIO },
    })
    await db.conversacionSoporte.update({
      where: { id: conversacionId },
      data: { ultimoMensajeDe: "sistema", ultimoMensajeAt: new Date() },
    })
  }

  revalidatePath("/admin/soporte")
}
