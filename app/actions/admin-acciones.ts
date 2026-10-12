"use server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { Prisma } from "@prisma/client"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { PLANES, PlanKey, esPlanValido, precioDePlan, sumarMeses, DIAS_PRUEBA_GRATUITA, DIAS_GRACIA_PAGO, determinarEstadoAlReactivar, registrarEventoSuscripcion } from "@/lib/suscripciones"
import { cancelarNotificacionesPorPrefijo } from "@/lib/notificaciones"
import { formatCLP } from "@/lib/utils"

async function getAdminSession() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN" || session.user.esEmpleado) throw new Error("No autorizado")
  return session
}

/** 12 caracteres al azar — suficiente para una clave temporal de un solo uso. */
function generarPasswordAleatoria(): string {
  return randomBytes(9).toString("base64url").slice(0, 12)
}

// ── Crear cliente ──────────────────────────────────────────────────────
// Todo cliente nuevo arranca con el primer mes gratis, sea cual sea el
// plan elegido — el plan real recién se cobra cuando termina la prueba
// (ver aplicarTransicion en lib/suscripciones.ts). El dueño de la cuenta
// nunca ve ni define una contraseña acá: la define él mismo desde el link
// de invitación (ver enviarInvitacionCliente en password-reset-acciones.ts).
export async function crearClienteNelyx(formData: FormData) {
  const session = await getAdminSession()
  const nombre = formData.get("nombre") as string
  const email = formData.get("email") as string
  const negocio = formData.get("negocio") as string | null
  const telefono = formData.get("telefono") as string | null
  const planSeleccionado = (formData.get("plan") as string) || "mensual"
  const fechaInicioInput = formData.get("fechaInicio") as string | null

  const plan: PlanKey = esPlanValido(planSeleccionado) ? planSeleccionado : "mensual"
  const fechaInicio = fechaInicioInput ? new Date(fechaInicioInput) : new Date()

  // Contraseña al azar que nadie conoce — solo para llenar la columna NOT
  // NULL hasta que el cliente cree la suya propia vía invitación.
  const hashed = await bcrypt.hash(generarPasswordAleatoria(), 10)

  let user
  try {
    user = await db.user.create({
      data: {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        password: hashed,
        negocio: negocio?.trim() || null,
        telefono: telefono?.trim() || null,
        activo: true,
        rol: "USER",
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("Ya existe una cuenta con ese email.")
    }
    throw err
  }

  const fechaFinPrueba = new Date(fechaInicio)
  fechaFinPrueba.setDate(fechaFinPrueba.getDate() + DIAS_PRUEBA_GRATUITA)
  const sus = await db.suscripcionNelyx.create({
    data: {
      userId: user.id,
      plan,
      estado: "prueba_gratuita",
      fechaInicio,
      fechaFinPrueba,
      precioPlan: 0,
    },
  })
  await registrarEventoSuscripcion(sus.id, "creada", `Cliente creado con plan ${PLANES[plan].label}`, session.user.name)

  revalidatePath("/admin/clientes")
  return { id: user.id }
}

// ── Editar datos del cliente (nombre, negocio, email, teléfono) ───────
export async function actualizarDatosCliente(userId: string, datos: { nombre: string; negocio: string; email: string; telefono: string }) {
  await getAdminSession()
  const nombre = datos.nombre.trim()
  const email = datos.email.trim().toLowerCase()
  if (!nombre || !email) throw new Error("Nombre y email son obligatorios")

  try {
    await db.user.update({
      where: { id: userId },
      data: { nombre, email, negocio: datos.negocio.trim() || null, telefono: datos.telefono.trim() || null },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("Ya existe otra cuenta con ese email.")
    }
    throw err
  }
  revalidatePath("/admin/clientes")
}

/**
 * Reintenta ante conflicto de concurrencia (P2034) en una transacción
 * Serializable — mismo patrón que `conTransaccionSerializable` en
 * acciones.ts, duplicado acá porque es un helper interno de implementación,
 * no algo que valga la pena acoplar entre módulos.
 */
async function conTransaccionSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const INTENTOS_MAX = 5
  for (let intento = 1; intento <= INTENTOS_MAX; intento++) {
    try {
      return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (err: any) {
      const esConflictoConcurrencia = err?.code === "P2034"
      if (!esConflictoConcurrencia || intento === INTENTOS_MAX) throw err
      await new Promise(r => setTimeout(r, 30 + Math.random() * 70))
    }
  }
  throw new Error("No se pudo completar la operación por alta concurrencia, intenta de nuevo")
}

// ── Registrar pago de un cobro pendiente ───────────────────────────────
export async function registrarPagoCobro(formData: FormData) {
  const session = await getAdminSession()
  const cobroId = formData.get("cobroId") as string
  const metodoPago = (formData.get("metodoPago") as string) || "transferencia"
  const observacion = (formData.get("observacion") as string | null) || null

  const cobroBase = await db.cobroNelyx.findUnique({ where: { id: cobroId }, include: { suscripcion: true } })
  if (!cobroBase) return

  const resultado = await conTransaccionSerializable(async (tx) => {
    // Se relee "estado" DENTRO de la transacción: dos clics casi
    // simultáneos en "Registrar pago" no deben poder crear dos PagoNelyx
    // para el mismo cobro.
    const cobro = await tx.cobroNelyx.findUnique({ where: { id: cobroId } })
    if (!cobro || cobro.estado === "pagado") return null

    const pago = await tx.pagoNelyx.create({
      data: {
        suscripcionId: cobro.suscripcionId,
        monto: cobro.monto,
        metodoPago,
        observacion,
        estado: "pagado",
      },
    })

    const plan: PlanKey = esPlanValido(cobro.plan) ? cobro.plan : "mensual"
    const fechaProximoCobro = sumarMeses(new Date(), PLANES[plan].meses)

    await tx.cobroNelyx.update({ where: { id: cobroId }, data: { estado: "pagado", pagoId: pago.id } })
    await tx.suscripcionNelyx.update({
      where: { id: cobro.suscripcionId },
      data: { estado: "al_dia", fechaProximoCobro },
    })
    await tx.user.update({ where: { id: cobroBase.suscripcion.userId }, data: { activo: true } })
    await tx.suscripcionNelyxEvento.create({
      data: { suscripcionId: cobro.suscripcionId, tipo: "pago_registrado", detalle: `${formatCLP(Number(cobro.monto))} vía ${metodoPago}`, adminNombre: session.user.name },
    })
    return cobro.suscripcionId
  })

  if (!resultado) return
  await cancelarNotificacionesPorPrefijo(`nelyx:${resultado}:pagopendiente`)

  revalidatePath("/admin/clientes")
}

// ── Editar suscripción (plan, fechas, precio, estado, renovación) ─────
export async function actualizarSuscripcion(formData: FormData) {
  const session = await getAdminSession()
  const suscripcionId = formData.get("suscripcionId") as string
  const plan = formData.get("plan") as string
  const fechaProximoCobroRaw = formData.get("fechaProximoCobro") as string | null
  const renovacionAutomatica = formData.get("renovacionAutomatica") === "on"
  const generarCobroAhora = formData.get("generarCobroAhora") === "on"

  const sus = await db.suscripcionNelyx.findUnique({ where: { id: suscripcionId } })
  if (!sus) return

  const planFinal: PlanKey = esPlanValido(plan) ? plan : "mensual"
  const nuevoPrecio = precioDePlan(planFinal)
  const fechaProximoCobro = fechaProximoCobroRaw ? new Date(fechaProximoCobroRaw) : sus.fechaProximoCobro
  const cambioDePlan = esPlanValido(sus.plan) && sus.plan !== planFinal

  await db.suscripcionNelyx.update({
    where: { id: suscripcionId },
    data: { plan: planFinal, precioPlan: nuevoPrecio, fechaProximoCobro, renovacionAutomatica },
  })
  if (cambioDePlan) {
    const planAnterior = esPlanValido(sus.plan) ? PLANES[sus.plan].label : sus.plan
    await registrarEventoSuscripcion(suscripcionId, "cambio_plan", `${planAnterior} → ${PLANES[planFinal].label}`, session.user.name)
  }

  // Si cambió de plan y se pide generar el cobro del nuevo monto de inmediato
  if (generarCobroAhora) {
    const fechaVencimiento = new Date()
    fechaVencimiento.setDate(fechaVencimiento.getDate() + DIAS_GRACIA_PAGO)
    await db.$transaction([
      db.cobroNelyx.create({
        data: {
          suscripcionId,
          plan: planFinal,
          monto: nuevoPrecio,
          fechaEmision: new Date(),
          fechaVencimiento,
          estado: "pendiente",
        },
      }),
      db.suscripcionNelyx.update({ where: { id: suscripcionId }, data: { estado: "pendiente" } }),
      db.suscripcionNelyxEvento.create({
        data: { suscripcionId, tipo: "cobro_generado", detalle: `Cobro manual por ${formatCLP(nuevoPrecio)}`, adminNombre: session.user.name },
      }),
    ])
  }

  revalidatePath("/admin/clientes")
}

// ── Suspender / reactivar / cancelar ───────────────────────────────────
export async function cambiarEstadoCliente(suscripcionId: string, estado: "suspendido" | "al_dia" | "cancelado") {
  const session = await getAdminSession()
  const sus = await db.suscripcionNelyx.findUnique({ where: { id: suscripcionId } })
  if (!sus) return

  // "al_dia" acá siempre significa "reactivar" (el botón "Reactivar" lo usa
  // tanto para una cuenta suspendida como una cancelada) — no se puede
  // asumir que reactivar deja a la cuenta al día: si tenía un cobro vencido
  // sin pagar antes de suspenderla, reactivar no debe borrar esa deuda.
  // El estado real se recalcula aparte; lo único que "al_dia" garantiza
  // acá es que la persona recupera el acceso (activo: true).
  const reactivando = estado === "al_dia"
  const estadoFinal = reactivando ? await determinarEstadoAlReactivar(suscripcionId) : estado

  await db.suscripcionNelyx.update({ where: { id: suscripcionId }, data: { estado: estadoFinal } })
  await db.user.update({ where: { id: sus.userId }, data: { activo: reactivando } })

  const tipoEvento = reactivando ? "reactivada" : estado === "suspendido" ? "suspendida" : "cancelada"
  const detalle = reactivando && estadoFinal !== "al_dia" ? `Quedó en "${estadoFinal}" — seguía con un cobro sin pagar` : null
  await registrarEventoSuscripcion(suscripcionId, tipoEvento, detalle, session.user.name)

  revalidatePath("/admin/clientes")
}

export async function actualizarNotaCliente(suscripcionId: string, nota: string) {
  await getAdminSession()
  await db.suscripcionNelyx.update({ where: { id: suscripcionId }, data: { notas: nota } })
  revalidatePath("/admin/clientes")
}

export async function crearSuscripcionParaUsuario(userId: string) {
  const session = await getAdminSession()
  const existe = await db.suscripcionNelyx.findUnique({ where: { userId } })
  if (existe) return
  const fechaInicio = new Date()
  const fechaFinPrueba = new Date(fechaInicio)
  fechaFinPrueba.setDate(fechaFinPrueba.getDate() + DIAS_PRUEBA_GRATUITA)
  const sus = await db.suscripcionNelyx.create({
    data: { userId, plan: "mensual", estado: "prueba_gratuita", fechaInicio, fechaFinPrueba, precioPlan: 0 },
  })
  await registrarEventoSuscripcion(sus.id, "creada", null, session.user.name)
  revalidatePath("/admin/clientes")
}
