import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ClientesAdminClient } from "@/components/admin/clientes-admin-client"
import { sincronizarSuscripciones, PLANES, esPlanValido } from "@/lib/suscripciones"

export const metadata: Metadata = { title: "Clientes NELYX" }
export const dynamic = "force-dynamic"

export default async function ClientesAdminPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard/resumen")

  // Aplica automáticamente: fin de prueba → cobro, cobros vencidos, próximos a vencer, etc.
  await sincronizarSuscripciones()

  const hoy = new Date()

  const usuarios = await db.user.findMany({
    where: { rol: "USER" },
    orderBy: { createdAt: "desc" },
    include: {
      suscripcionNelyx: {
        include: {
          pagos: { orderBy: { createdAt: "desc" }, take: 15 },
          cobros: { orderBy: { createdAt: "desc" }, take: 15 },
        },
      },
      _count: { select: { movimientos: true, productos: true, clientes: true } },
    },
  })

  const ventasCounts = await db.movimiento.groupBy({
    by: ["userId"],
    where: { tipo: "VENTA" },
    _count: { id: true },
  })
  const ventasMap = new Map(ventasCounts.map(v => [v.userId, v._count.id]))

  function calcularSalud(ultimoAcceso: Date | null | undefined, movimientos: number): number {
    let score = 100
    if (!ultimoAcceso) { score -= 40 }
    else {
      const days = (hoy.getTime() - ultimoAcceso.getTime()) / 86400000
      if (days > 30) score -= 40
      else if (days > 14) score -= 25
      else if (days > 7) score -= 15
      else if (days > 3) score -= 5
    }
    if (movimientos === 0) score -= 30
    else if (movimientos < 5) score -= 15
    else if (movimientos < 20) score -= 5
    return Math.max(0, Math.min(100, score))
  }

  const clientes = usuarios.map(u => {
    const sus = u.suscripcionNelyx
    const estado = sus?.estado ?? "prueba_gratuita"
    const diasSinAcceso = sus?.ultimoAcceso
      ? Math.round((hoy.getTime() - sus.ultimoAcceso.getTime()) / 86400000)
      : null
    const ventas = ventasMap.get(u.id) ?? 0
    const salud = calcularSalud(sus?.ultimoAcceso, u._count.movimientos)
    const cobroPendiente = sus?.cobros.find(c => c.estado === "pendiente" || c.estado === "vencido") ?? null

    const planLabel = sus && esPlanValido(sus.plan) ? PLANES[sus.plan].label : "Mensual"

    return {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      negocio: u.negocio,
      activo: u.activo,
      createdAt: u.createdAt.toISOString(),
      estado,
      suscripcionId: sus?.id ?? null,
      plan: sus?.plan ?? "mensual",
      planLabel,
      fechaInicio: sus?.fechaInicio?.toISOString() ?? u.createdAt.toISOString(),
      fechaFinPrueba: sus?.fechaFinPrueba?.toISOString() ?? null,
      fechaProximoCobro: sus?.fechaProximoCobro?.toISOString() ?? null,
      precioPlan: Number(sus?.precioPlan ?? 0),
      renovacionAutomatica: sus?.renovacionAutomatica ?? true,
      ultimoAcceso: sus?.ultimoAcceso?.toISOString() ?? null,
      diasSinAcceso,
      notas: sus?.notas ?? null,
      salud,
      movimientos: u._count.movimientos,
      productos: u._count.productos,
      clientesCount: u._count.clientes,
      ventas,
      cobroPendiente: cobroPendiente ? {
        id: cobroPendiente.id,
        plan: cobroPendiente.plan,
        monto: Number(cobroPendiente.monto),
        fechaEmision: cobroPendiente.fechaEmision.toISOString(),
        fechaVencimiento: cobroPendiente.fechaVencimiento.toISOString(),
        estado: cobroPendiente.estado,
      } : null,
      historialCobros: (sus?.cobros ?? []).map(c => ({
        id: c.id, plan: c.plan, monto: Number(c.monto),
        fechaEmision: c.fechaEmision.toISOString(), fechaVencimiento: c.fechaVencimiento.toISOString(),
        estado: c.estado,
      })),
      pagos: (sus?.pagos ?? []).map(p => ({
        id: p.id, fecha: p.fecha.toISOString(), monto: Number(p.monto),
        metodoPago: p.metodoPago, observacion: p.observacion, estado: p.estado,
      })),
    }
  })

  // ── Métricas ──────────────────────────────────────────────────────
  const activos = clientes.filter(c => c.estado === "al_dia").length
  const enPrueba = clientes.filter(c => c.estado === "prueba_gratuita").length
  const proximosVencer = clientes.filter(c => c.estado === "proximo_vencer").length
  const pendientes = clientes.filter(c => c.estado === "pendiente")
  const vencidos = clientes.filter(c => c.estado === "vencido")
  const suspendidos = clientes.filter(c => c.estado === "suspendido").length
  const cancelados = clientes.filter(c => c.estado === "cancelado").length

  // MRR normalizado a valor mensual según duración del plan
  const mrr = clientes
    .filter(c => ["al_dia", "proximo_vencer", "pendiente", "vencido"].includes(c.estado))
    .reduce((acc, c) => {
      const meses = esPlanValido(c.plan) ? PLANES[c.plan].meses : 1
      return acc + c.precioPlan / meses
    }, 0)

  const pagosPendientes = [...pendientes, ...vencidos]
  const montoPendiente = pagosPendientes.reduce((a, c) => a + (c.cobroPendiente?.monto ?? 0), 0)

  const baseRenovacion = activos + proximosVencer + vencidos.length
  const tasaRenovacion = baseRenovacion > 0 ? Math.round(((activos + proximosVencer) / baseRenovacion) * 100) : 100

  const metricas = {
    activos, enPrueba, proximosVencer, pendientes: pendientes.length, vencidos: vencidos.length,
    suspendidos, cancelados, mrr, pagosPendientes: pagosPendientes.length, montoPendiente, tasaRenovacion,
    total: clientes.length,
  }

  // ── Alertas (solo dentro de este panel admin) ──────────────────────
  const alertas = clientes.flatMap(c => {
    const items: { tipo: string; mensaje: string; clienteId: string; color: string }[] = []
    const nombreCliente = c.negocio ?? c.nombre
    if (c.estado === "prueba_gratuita" && c.fechaFinPrueba) {
      const dias = Math.ceil((new Date(c.fechaFinPrueba).getTime() - hoy.getTime()) / 86400000)
      if (dias >= 0 && dias <= 5) items.push({ tipo: "prueba", mensaje: `${nombreCliente}: la prueba gratuita termina en ${dias}d`, clienteId: c.id, color: "blue" })
    }
    if (c.estado === "proximo_vencer") items.push({ tipo: "proximo", mensaje: `${nombreCliente}: próximo cobro se acerca`, clienteId: c.id, color: "amber" })
    if (c.estado === "vencido") items.push({ tipo: "vencido", mensaje: `${nombreCliente}: suscripción vencida`, clienteId: c.id, color: "red" })
    if (c.estado === "pendiente") items.push({ tipo: "pendiente", mensaje: `${nombreCliente}: pago pendiente`, clienteId: c.id, color: "amber" })
    if (c.estado === "suspendido") items.push({ tipo: "suspendido", mensaje: `${nombreCliente}: cuenta suspendida`, clienteId: c.id, color: "slate" })
    return items
  })

  return <ClientesAdminClient clientes={clientes} metricas={metricas} alertas={alertas} />
}
