"use server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { registrarEventoSuscripcion } from "@/lib/suscripciones"

// Igual que "Mi suscripción" conceptualmente: solo el dueño de la cuenta
// ve y reporta pagos de SU PROPIA suscripción con Nelyx — un empleado no
// tiene por qué ver cuánto paga su jefe por la plataforma.
async function getClienteSession() {
  const session = await auth()
  if (!session || session.user.esEmpleado) throw new Error("No autorizado")
  return session
}

export type CobroPendienteDTO = {
  id: string
  monto: number
  fechaVencimiento: string
  // Si ya hay un comprobante subido para este cobro y en qué estado está.
  pagoEnRevision: { id: string; comprobanteUrl: string | null; fecha: string } | null
  pagoRechazado: { motivoRechazo: string | null } | null
}

export type PagoHistorialDTO = {
  id: string; fecha: string; monto: number; estado: string; comprobanteUrl: string | null; motivoRechazo: string | null
}

export type MiSuscripcionDTO = {
  tieneSuscripcion: boolean
  estado: string
  planLabel: string
  planMeses: number
  precioPlan: number
  fechaFinPrueba: string | null
  fechaProximoCobro: string | null
  cobroPendiente: CobroPendienteDTO | null
  historialPagos: PagoHistorialDTO[]
}

export async function obtenerMiSuscripcion(): Promise<MiSuscripcionDTO> {
  const session = await getClienteSession()

  const sus = await db.suscripcionNelyx.findUnique({
    where: { userId: session.user.id },
    include: {
      plan: true,
      cobros: {
        where: { estado: { in: ["pendiente", "vencido"] } },
        orderBy: { fechaVencimiento: "asc" },
        take: 1,
        include: { pago: true },
      },
      pagos: { orderBy: { createdAt: "desc" }, take: 15 },
    },
  })

  if (!sus) {
    return { tieneSuscripcion: false, estado: "prueba_gratuita", planLabel: "Sin plan", planMeses: 1, precioPlan: 0, fechaFinPrueba: null, fechaProximoCobro: null, cobroPendiente: null, historialPagos: [] }
  }

  const cobro = sus.cobros[0] ?? null
  const cobroPendiente: CobroPendienteDTO | null = cobro ? {
    id: cobro.id,
    monto: Number(cobro.monto),
    fechaVencimiento: cobro.fechaVencimiento.toISOString(),
    pagoEnRevision: cobro.pago && cobro.pago.estado === "pendiente_confirmacion"
      ? { id: cobro.pago.id, comprobanteUrl: cobro.pago.comprobanteUrl, fecha: cobro.pago.fecha.toISOString() }
      : null,
    // El pago rechazado ya se desvincula del cobro (ver rechazarPagoCliente)
    // así que acá nunca llega vía cobro.pago — se busca aparte en el
    // historial, el más reciente rechazado sin reemplazo.
    pagoRechazado: null,
  } : null

  if (cobroPendiente && !cobroPendiente.pagoEnRevision) {
    const ultimoRechazado = sus.pagos.find(p => p.estado === "rechazado")
    if (ultimoRechazado) cobroPendiente.pagoRechazado = { motivoRechazo: ultimoRechazado.motivoRechazo }
  }

  return {
    tieneSuscripcion: true,
    estado: sus.estado,
    planLabel: sus.plan?.nombre ?? "Sin plan",
    planMeses: sus.plan?.meses ?? 1,
    precioPlan: Number(sus.precioPlan),
    fechaFinPrueba: sus.fechaFinPrueba?.toISOString() ?? null,
    fechaProximoCobro: sus.fechaProximoCobro?.toISOString() ?? null,
    cobroPendiente,
    historialPagos: sus.pagos.map(p => ({
      id: p.id, fecha: p.fecha.toISOString(), monto: Number(p.monto), estado: p.estado,
      comprobanteUrl: p.comprobanteUrl, motivoRechazo: p.motivoRechazo,
    })),
  }
}

const DIAS_VIGENCIA_COMPROBANTE = 5

// ── El cliente reporta un pago, adjuntando el comprobante ya subido ───
// Nunca marca el cobro como pagado por sí solo — queda "pendiente_confirmacion"
// hasta que el admin lo revise y confirme (o lo rechace) desde
// /admin/clientes. El monto y la fecha del cobro se toman del cobro mismo,
// nunca de lo que mande el formulario, para que no se puedan falsear.
export async function reportarPagoCliente(formData: FormData): Promise<{ error: string } | undefined> {
  const session = await getClienteSession()
  const cobroId = formData.get("cobroId") as string
  const comprobanteUrl = formData.get("comprobanteUrl") as string
  if (!comprobanteUrl) return { error: "Falta adjuntar el comprobante" }

  const cobro = await db.cobroNelyx.findUnique({ where: { id: cobroId }, include: { suscripcion: true, pago: true } })
  if (!cobro || cobro.suscripcion.userId !== session.user.id) return { error: "Cobro no encontrado" }
  if (cobro.estado !== "pendiente" && cobro.estado !== "vencido") return { error: "Este cobro ya no está pendiente" }
  if (cobro.pago && cobro.pago.estado === "pendiente_confirmacion") return { error: "Ya hay un comprobante en revisión para este cobro" }

  const comprobanteExpiraEn = new Date()
  comprobanteExpiraEn.setDate(comprobanteExpiraEn.getDate() + DIAS_VIGENCIA_COMPROBANTE)

  const pago = await db.pagoNelyx.create({
    data: {
      suscripcionId: cobro.suscripcionId,
      monto: cobro.monto,
      metodoPago: "transferencia",
      estado: "pendiente_confirmacion",
      comprobanteUrl,
      comprobanteExpiraEn,
    },
  })
  await db.cobroNelyx.update({ where: { id: cobro.id }, data: { pagoId: pago.id } })
  await registrarEventoSuscripcion(cobro.suscripcionId, "comprobante_subido", "El cliente adjuntó un comprobante — pendiente de revisión")

  revalidatePath("/dashboard/configuracion")
  revalidatePath("/admin/clientes")
}
