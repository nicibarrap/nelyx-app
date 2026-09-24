import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ClientesClient } from "@/components/clientes/clientes-client"
import { obtenerPlantillasCobranza } from "@/app/actions/cobranza-acciones"
import { hoyEnChile } from "@/lib/timezone"
import { calcularIntervaloPromedioDias, calcularDebioVolver, calcularSegmento, calcularUmbralValioso } from "@/lib/cliente-insights"

export const metadata: Metadata = { title: "Clientes" }

export default async function ClientesPage() {
  const session = await auth()
  // Vercel corre en UTC, no en la hora de Chile — con new Date() crudo,
  // "ventas de este mes" podía perder o mover al mes siguiente las ventas
  // del último día, durante la noche chilena.
  const hoy = hoyEnChile()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

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
      orderBy: { updatedAt: "desc" },
      // Tope defensivo: sin esto, un negocio con una cartera muy grande de
      // clientes (cada uno con hasta 100 movimientos + notas + cuentas por
      // cobrar embebidas) podría generar una consulta lenta y una página
      // pesadísima. Al ordenar por actividad más reciente, en la práctica
      // nunca se nota — solo protege el caso extremo.
      take: 3000,
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
    const intervaloPromedioDias = calcularIntervaloPromedioDias([
      ...ventasContado.map(m => new Date(m.fecha)),
      ...ventasCredito.map(cc => new Date(cc.fechaVenta)),
    ])

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
      limiteCredito: c.limiteCredito ? Number(c.limiteCredito) : null,
      cumpleanos: c.cumpleanos ? c.cumpleanos.toISOString() : null,
      activo: c.activo,
      observaciones: c.observaciones,
      createdAt: c.createdAt.toISOString(),
      totalComprado,
      ultimaActividad: ultimaActividad.toISOString(),
      diasSinCompra,
      deudaPendiente,
      compras,
      ticketPromedio,
      intervaloPromedioDias,
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

  // Segmento automático — necesita el umbral de "valioso" calculado sobre
  // TODA la cartera, así que va en una segunda pasada después de tener
  // totalComprado de cada cliente.
  const umbralValioso = calcularUmbralValioso(
    clientesData.filter(c => c.compras >= 2).map(c => c.totalComprado)
  )
  const clientesConSegmento = clientesData.map(c => {
    const debioVolver = calcularDebioVolver(c)
    const segmento = calcularSegmento({ ...c, esValiosoPorMonto: c.totalComprado >= umbralValioso })
    return { ...c, debioVolver, segmento }
  })

  // Métricas globales
  const totalVentasMes = movsMes.reduce((a, m) => a + Number(m.monto), 0)
  const conDeuda = clientesConSegmento.filter(c => c.deudaPendiente > 0).length // Now uses real CuentaPorCobrar data
  const frecuentes = clientesConSegmento.filter(c => c.esFrecuente).length
  const inactivos = clientesConSegmento.filter(c => c.inactivo || !c.activo).length
  const ticketProm = clientesConSegmento.filter(c => c.compras > 0).reduce((a, c, _, arr) => a + c.ticketPromedio / arr.length, 0)
  const debieronVolver = clientesConSegmento.filter(c => c.debioVolver).length

  return (
    <ClientesClient
      clientesData={clientesConSegmento}
      metricas={{ totalVentasMes, conDeuda, frecuentes, inactivos, ticketProm, debieronVolver }}
      nombreNegocio={usuario?.negocio || usuario?.nombre || "Nuestro negocio"}
      usuarioEnvia={usuario?.nombre || ""}
      plantillas={plantillas}
    />
  )
}
