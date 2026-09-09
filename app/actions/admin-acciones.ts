"use server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { PLANES, PlanKey, esPlanValido, precioDePlan, sumarMeses, DIAS_PRUEBA_GRATUITA, DIAS_GRACIA_PAGO } from "@/lib/suscripciones"
import { cancelarNotificacionesPorPrefijo } from "@/lib/notificaciones"

async function getAdminSession() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") throw new Error("No autorizado")
  return session
}

// ── Crear cliente ──────────────────────────────────────────────────────
export async function crearClienteNelyx(formData: FormData) {
  await getAdminSession()
  const nombre = formData.get("nombre") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const negocio = formData.get("negocio") as string | null
  const planSeleccionado = (formData.get("plan") as string) || "prueba_gratuita"

  const hashed = await bcrypt.hash(password || "nelyx2024", 10)
  const fechaInicio = new Date()

  const user = await db.user.create({
    data: {
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      negocio: negocio?.trim() || null,
      activo: true,
      rol: "USER",
    },
  })

  if (planSeleccionado === "prueba_gratuita") {
    const fechaFinPrueba = new Date(fechaInicio)
    fechaFinPrueba.setDate(fechaFinPrueba.getDate() + DIAS_PRUEBA_GRATUITA)
    await db.suscripcionNelyx.create({
      data: {
        userId: user.id,
        plan: "mensual", // plan al que convertirá cuando termine la prueba
        estado: "prueba_gratuita",
        fechaInicio,
        fechaFinPrueba,
        precioPlan: 0,
      },
    })
  } else {
    const plan: PlanKey = esPlanValido(planSeleccionado) ? planSeleccionado : "mensual"
    const monto = precioDePlan(plan)
    const fechaProximoCobro = sumarMeses(fechaInicio, PLANES[plan].meses)
    await db.$transaction([
      db.suscripcionNelyx.create({
        data: {
          userId: user.id,
          plan,
          estado: "pendiente", // el primer cobro queda pendiente desde ya
          fechaInicio,
          fechaProximoCobro,
          precioPlan: monto,
        },
      }),
    ])
    const nuevaSus = await db.suscripcionNelyx.findUnique({ where: { userId: user.id } })
    if (nuevaSus) {
      const fechaVencimiento = new Date()
      fechaVencimiento.setDate(fechaVencimiento.getDate() + DIAS_GRACIA_PAGO)
      await db.cobroNelyx.create({
        data: {
          suscripcionId: nuevaSus.id,
          plan,
          monto,
          fechaEmision: fechaInicio,
          fechaVencimiento,
          estado: "pendiente",
        },
      })
    }
  }

  revalidatePath("/admin/clientes")
}

// ── Registrar pago de un cobro pendiente ───────────────────────────────
export async function registrarPagoCobro(formData: FormData) {
  await getAdminSession()
  const cobroId = formData.get("cobroId") as string
  const metodoPago = (formData.get("metodoPago") as string) || "transferencia"
  const observacion = (formData.get("observacion") as string | null) || null

  const cobro = await db.cobroNelyx.findUnique({ where: { id: cobroId }, include: { suscripcion: true } })
  if (!cobro || cobro.estado === "pagado") return

  const pago = await db.pagoNelyx.create({
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

  await db.$transaction([
    db.cobroNelyx.update({ where: { id: cobroId }, data: { estado: "pagado", pagoId: pago.id } }),
    db.suscripcionNelyx.update({
      where: { id: cobro.suscripcionId },
      data: { estado: "al_dia", fechaProximoCobro },
    }),
    db.user.update({ where: { id: cobro.suscripcion.userId }, data: { activo: true } }),
  ])
  await cancelarNotificacionesPorPrefijo(`nelyx:${cobro.suscripcionId}:pagopendiente`)

  revalidatePath("/admin/clientes")
}

// ── Editar suscripción (plan, fechas, precio, estado, renovación) ─────
export async function actualizarSuscripcion(formData: FormData) {
  await getAdminSession()
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

  await db.suscripcionNelyx.update({
    where: { id: suscripcionId },
    data: { plan: planFinal, precioPlan: nuevoPrecio, fechaProximoCobro, renovacionAutomatica },
  })

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
    ])
  }

  revalidatePath("/admin/clientes")
}

// ── Suspender / reactivar / cancelar ───────────────────────────────────
export async function cambiarEstadoCliente(suscripcionId: string, estado: "suspendido" | "al_dia" | "cancelado") {
  await getAdminSession()
  const sus = await db.suscripcionNelyx.findUnique({ where: { id: suscripcionId } })
  if (!sus) return
  await db.suscripcionNelyx.update({ where: { id: suscripcionId }, data: { estado } })
  await db.user.update({ where: { id: sus.userId }, data: { activo: estado === "al_dia" } })
  revalidatePath("/admin/clientes")
}

export async function actualizarNotaCliente(suscripcionId: string, nota: string) {
  await getAdminSession()
  await db.suscripcionNelyx.update({ where: { id: suscripcionId }, data: { notas: nota } })
  revalidatePath("/admin/clientes")
}

export async function crearSuscripcionParaUsuario(userId: string) {
  await getAdminSession()
  const existe = await db.suscripcionNelyx.findUnique({ where: { userId } })
  if (existe) return
  const fechaInicio = new Date()
  const fechaFinPrueba = new Date(fechaInicio)
  fechaFinPrueba.setDate(fechaFinPrueba.getDate() + DIAS_PRUEBA_GRATUITA)
  await db.suscripcionNelyx.create({
    data: { userId, plan: "mensual", estado: "prueba_gratuita", fechaInicio, fechaFinPrueba, precioPlan: 0 },
  })
  revalidatePath("/admin/clientes")
}
