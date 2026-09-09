import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ClientesClient } from "@/components/clientes/clientes-client"
import { obtenerPlantillasCobranza } from "@/app/actions/cobranza-acciones"

export const metadata: Metadata = { title: "Clientes" }

export default async function ClientesPage() {
  const session = await auth()
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const hace30 = new Date(hoy.getTime() - 30 * 86400000)

  const [clientes, movsMes, deudas, cuentasCobrar, usuario, plantillas] = await Promise.all([
    db.cliente.findMany({
      where: { userId: session!.user.id },
      include: {
        movimientos: { orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], take: 100, select: { monto: true, fecha: true, tipo: true, descripcion: true } },
        notas: { orderBy: { createdAt: "desc" } },
        cuentasPorCobrar: {
          orderBy: { fechaVenta: "desc" },
          select: { id: true, numero: true, montoOriginal: true, saldoPendiente: true, estado: true, fechaVenta: true, fechaVence: true, observaciones: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    db.movimiento.findMany({
      where: { userId: session!.user.id, tipo: "VENTA", fecha: { gte: inicioMes }, clienteId: { not: null } },
      select: { monto: true, clienteId: true }
    }),
    db.deuda.findMany({
      where: { userId: session!.user.id, pagada: false },
      select: { acreedor: true, monto: true, montoPagado: true }
    }),
    db.cuentaPorCobrar.findMany({
      where: { userId: session!.user.id, estado: { in: ["pendiente","parcial","vencida"] } },
      select: { clienteId: true, saldoPendiente: true }
    }),
    db.user.findUnique({ where: { id: session!.user.id }, select: { nombre: true, negocio: true } }),
    obtenerPlantillasCobranza(),
  ])

  // Calcular métricas por cliente
  const clientesData = clientes.map(c => {
    const movs = c.movimientos
    const ventasContado = movs.filter(m => m.tipo === "VENTA")
    const ventasCredito = c.cuentasPorCobrar ?? []
    const totalContado = ventasContado.reduce((a, m) => a + Number(m.monto), 0)
    const totalCredito = ventasCredito.reduce((a, cc) => a + Number(cc.montoOriginal), 0)
    const totalComprado = totalContado + totalCredito
    const ultimaVentaContado = ventasContado[0]?.fecha ?? null
    const ultimaVentaCredito = ventasCredito[0]?.fechaVenta ?? null
    const ultimaActividad = ultimaVentaContado && ultimaVentaCredito
      ? (new Date(ultimaVentaContado) > new Date(ultimaVentaCredito) ? new Date(ultimaVentaContado) : new Date(ultimaVentaCredito))
      : ultimaVentaContado ? new Date(ultimaVentaContado)
      : ultimaVentaCredito ? new Date(ultimaVentaCredito)
      : c.createdAt
    const diasSinCompra = Math.floor((hoy.getTime() - ultimaActividad.getTime()) / 86400000)
    const deudaPendiente = cuentasCobrar.filter(cc => cc.clienteId === c.id).reduce((a, cc) => a + Number(cc.saldoPendiente), 0)
    const compras = ventasContado.length + ventasCredito.length
    const ticketPromedio = compras > 0 ? totalComprado / compras : 0

    return {
      id: c.id,
      nombre: c.nombre,
      apellido: c.apellido,
      empresa: c.empresa,
      telefono: c.telefono,
      email: c.email,
      direccion: c.direccion,
      ciudad: c.ciudad,
      tipoCliente: c.tipoCliente,
      frecuenciaCompra: c.frecuenciaCompra,
      metodoPago: c.metodoPago,
      diasPago: c.diasPago,
      esFrecuente: c.esFrecuente,
      esVip: c.esVip,
      permiteCredito: c.permiteCredito,
      activo: c.activo,
      observaciones: c.observaciones,
      createdAt: c.createdAt.toISOString(),
      totalComprado,
      ultimaActividad: ultimaActividad.toISOString(),
      diasSinCompra,
      deudaPendiente,
      compras,
      ticketPromedio,
      inactivo: diasSinCompra > 30,
      movimientos: movs.map(m => ({ monto: Number(m.monto), fecha: m.fecha.toISOString(), tipo: m.tipo, descripcion: m.descripcion })),
      cuentasPorCobrar: ventasCredito.map(cc => ({
        id: cc.id, numero: cc.numero, monto: Number(cc.montoOriginal),
        saldoPendiente: Number(cc.saldoPendiente), estado: cc.estado,
        fecha: cc.fechaVenta.toISOString(), fechaVence: cc.fechaVence ? cc.fechaVence.toISOString() : null,
        diasAtraso: cc.fechaVence ? Math.floor((hoy.getTime() - cc.fechaVence.getTime()) / 86400000) : 0,
        descripcion: cc.observaciones
      })),
      notas: c.notas.map(n => ({ id: n.id, texto: n.texto, createdAt: n.createdAt.toISOString() })),
    }
  })

  // Métricas globales
  const totalVentasMes = movsMes.reduce((a, m) => a + Number(m.monto), 0)
  const conDeuda = clientesData.filter(c => c.deudaPendiente > 0).length // Now uses real CuentaPorCobrar data
  const frecuentes = clientesData.filter(c => c.esFrecuente).length
  const inactivos = clientesData.filter(c => c.inactivo || !c.activo).length
  const ticketProm = clientesData.filter(c => c.compras > 0).reduce((a, c, _, arr) => a + c.ticketPromedio / arr.length, 0)

  return (
    <ClientesClient
      clientesData={clientesData}
      metricas={{ totalVentasMes, conDeuda, frecuentes, inactivos, ticketProm }}
      nombreNegocio={usuario?.negocio || usuario?.nombre || "Nuestro negocio"}
      usuarioEnvia={usuario?.nombre || ""}
      plantillas={plantillas}
    />
  )
}
