import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ClientesAdminClient } from "@/components/admin/clientes-admin-client"
import { sincronizarSuscripciones } from "@/lib/suscripciones"
import { obtenerPlanes } from "@/app/actions/planes-acciones"
import { calcularMetricasClientes } from "@/lib/metricas-clientes"
import { obtenerDatosBancarios } from "@/app/actions/datos-bancarios-acciones"

export const metadata: Metadata = { title: "Clientes NELYX" }
export const dynamic = "force-dynamic"

export default async function ClientesAdminPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN" || session.user.esEmpleado) redirect("/dashboard/resumen")

  // Aplica automáticamente: fin de prueba → cobro, cobros vencidos, próximos a vencer, etc.
  await sincronizarSuscripciones()

  const hoy = new Date()
  const [planes, datosBancarios] = await Promise.all([obtenerPlanes(), obtenerDatosBancarios()])

  const usuarios = await db.user.findMany({
    // cuentaPrincipalId: null excluye a los empleados — son sub-cuentas de
    // una cuenta dueña, no clientes propios, y no deben aparecer como fila
    // aparte en este panel (se cuentan como "Equipo" de su cuenta dueña).
    where: { rol: "USER", cuentaPrincipalId: null },
    orderBy: { createdAt: "desc" },
    include: {
      suscripcionNelyx: {
        include: {
          plan: true,
          pagos: { orderBy: { createdAt: "desc" }, take: 15 },
          cobros: { orderBy: { createdAt: "desc" }, take: 15, include: { pago: true } },
          eventos: { orderBy: { createdAt: "desc" }, take: 30 },
        },
      },
      _count: { select: { movimientos: true, productos: true, clientes: true, empleados: true } },
    },
    // Tope defensivo: a medida que crezca la base de negocios suscritos a
    // Nelyx, esto evita que este panel se vuelva lento o pesadísimo — se
    // queda con los más recientes, que son los que más se revisan acá.
    take: 2000,
  })

  const ventasCounts = await db.movimiento.groupBy({
    by: ["userId"],
    where: { tipo: "VENTA" },
    _count: { id: true },
  })
  const ventasMap = new Map(ventasCounts.map(v => [v.userId, v._count.id]))

  // Estado de acceso: no hace falta una columna nueva — se deriva de si
  // hay algún PasswordResetToken para la cuenta (se le mandó invitación o
  // pidió recuperar su clave) y si alguno ya se usó (ya definió su propia
  // contraseña, sea por invitación o por "olvidé mi contraseña").
  const tokens = await db.passwordResetToken.findMany({
    where: { userId: { in: usuarios.map(u => u.id) } },
    select: { userId: true, usedAt: true },
  })
  const accesoPorUsuario = new Map<string, { invitado: boolean; activada: boolean }>()
  for (const t of tokens) {
    const actual = accesoPorUsuario.get(t.userId) ?? { invitado: false, activada: false }
    actual.invitado = true
    if (t.usedAt) actual.activada = true
    accesoPorUsuario.set(t.userId, actual)
  }

  function calcularSalud(ultimoAcceso: Date | null | undefined, movimientos: number, fechaInicio: Date): number {
    let score = 100
    if (!ultimoAcceso) { score -= 40 }
    else {
      const days = (hoy.getTime() - ultimoAcceso.getTime()) / 86400000
      if (days > 30) score -= 40
      else if (days > 14) score -= 25
      else if (days > 7) score -= 15
      else if (days > 3) score -= 5
    }
    // Una cuenta recién creada (primera semana) con 0 movimientos es lo
    // esperable, no una señal de alerta — todavía no tuvo tiempo real de
    // usar la plataforma. Penalizarla acá solo genera una salud "baja"
    // falsa en cuentas nuevas que ni siquiera han empezado a operar.
    const diasDesdeInicio = (hoy.getTime() - fechaInicio.getTime()) / 86400000
    if (diasDesdeInicio > 7) {
      if (movimientos === 0) score -= 30
      else if (movimientos < 5) score -= 15
      else if (movimientos < 20) score -= 5
    }
    return Math.max(0, Math.min(100, score))
  }

  const clientes = usuarios.map(u => {
    const sus = u.suscripcionNelyx
    const estado = sus?.estado ?? "prueba_gratuita"
    const diasSinAcceso = sus?.ultimoAcceso
      ? Math.round((hoy.getTime() - sus.ultimoAcceso.getTime()) / 86400000)
      : null
    const ventas = ventasMap.get(u.id) ?? 0
    const salud = calcularSalud(sus?.ultimoAcceso, u._count.movimientos, sus?.fechaInicio ?? u.createdAt)
    const cobroPendiente = sus?.cobros.find(c => c.estado === "pendiente" || c.estado === "vencido") ?? null

    const planLabel = sus?.plan?.nombre ?? "Sin plan"
    const acceso = accesoPorUsuario.get(u.id)
    const cuentaAcceso: "activa" | "pendiente" | "sin_invitar" = acceso?.activada ? "activa" : acceso?.invitado ? "pendiente" : "sin_invitar"

    return {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      negocio: u.negocio,
      telefono: u.telefono,
      activo: u.activo,
      createdAt: u.createdAt.toISOString(),
      estado,
      suscripcionId: sus?.id ?? null,
      plan: sus?.planId ?? "",
      planMeses: sus?.plan?.meses ?? 1,
      planLabel,
      fechaInicio: sus?.fechaInicio?.toISOString() ?? u.createdAt.toISOString(),
      fechaFinPrueba: sus?.fechaFinPrueba?.toISOString() ?? null,
      fechaProximoCobro: sus?.fechaProximoCobro?.toISOString() ?? null,
      precioPlan: Number(sus?.precioPlan ?? 0),
      renovacionAutomatica: sus?.renovacionAutomatica ?? true,
      esPrueba: sus?.esPrueba ?? false,
      ultimoAcceso: sus?.ultimoAcceso?.toISOString() ?? null,
      diasSinAcceso,
      notas: sus?.notas ?? null,
      salud,
      movimientos: u._count.movimientos,
      productos: u._count.productos,
      clientesCount: u._count.clientes,
      equipo: u._count.empleados,
      cuentaAcceso,
      ventas,
      cobroPendiente: cobroPendiente ? {
        id: cobroPendiente.id,
        plan: cobroPendiente.plan,
        monto: Number(cobroPendiente.monto),
        fechaEmision: cobroPendiente.fechaEmision.toISOString(),
        fechaVencimiento: cobroPendiente.fechaVencimiento.toISOString(),
        estado: cobroPendiente.estado,
        // Comprobante que el cliente subió desde "Mi suscripción" para
        // este cobro, si hay uno pendiente de revisión — ver
        // confirmarPagoCliente/rechazarPagoCliente en admin-acciones.ts.
        pagoPendienteRevision: cobroPendiente.pago && cobroPendiente.pago.estado === "pendiente_confirmacion" ? {
          id: cobroPendiente.pago.id,
          comprobanteUrl: cobroPendiente.pago.comprobanteUrl,
          fecha: cobroPendiente.pago.fecha.toISOString(),
        } : null,
      } : null,
      historialCobros: (sus?.cobros ?? []).map(c => ({
        id: c.id, plan: c.plan, monto: Number(c.monto),
        fechaEmision: c.fechaEmision.toISOString(), fechaVencimiento: c.fechaVencimiento.toISOString(),
        estado: c.estado,
      })),
      pagos: (sus?.pagos ?? []).map(p => ({
        id: p.id, fecha: p.fecha.toISOString(), monto: Number(p.monto),
        metodoPago: p.metodoPago, observacion: p.observacion, estado: p.estado,
        comprobanteUrl: p.comprobanteUrl, motivoRechazo: p.motivoRechazo,
      })),
      eventos: (sus?.eventos ?? []).map(e => ({
        id: e.id, tipo: e.tipo, detalle: e.detalle, adminNombre: e.adminNombre, createdAt: e.createdAt.toISOString(),
      })),
    }
  })

  // ── Métricas ──────────────────────────────────────────────────────
  const metricas = calcularMetricasClientes(clientes)

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

  return <ClientesAdminClient clientes={clientes} metricas={metricas} alertas={alertas} planes={planes} datosBancarios={datosBancarios} />
}
