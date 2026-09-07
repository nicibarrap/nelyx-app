import { obtenerPlantillasCobranza } from "@/app/actions/cobranza-acciones"
import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { CuentasCobrarClient } from "@/components/cuentas-cobrar/cuentas-cobrar-client"

export const metadata: Metadata = { title: "Cuentas por Cobrar" }

export default async function CuentasCobrarPage() {
  const session = await auth()
  const hoy = new Date()
  const en7Dias = new Date(hoy.getTime() + 7 * 86400000)
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

  // Auto-update expired accounts
  await db.cuentaPorCobrar.updateMany({
    where: {
      userId: session!.user.id,
      estado: { in: ["pendiente", "parcial"] },
      fechaVence: { lt: hoy },
      saldoPendiente: { gt: 0 }
    },
    data: { estado: "vencida" }
  })

  const [cuentas, clientes, cobradoMes, productos, usuario, plantillas] = await Promise.all([
    db.cuentaPorCobrar.findMany({
      where: { userId: session!.user.id },
      include: {
        cliente: { select: { id: true, nombre: true, apellido: true, empresa: true, telefono: true, email: true } },
        pagos: { orderBy: [{ fecha: "desc" }, { createdAt: "desc" }] }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.cliente.findMany({
      where: { userId: session!.user.id, activo: true },
      select: { id: true, nombre: true, apellido: true, empresa: true, telefono: true },
      orderBy: { nombre: "asc" }
    }),
    db.pagoCuenta.findMany({
      where: {
        cuenta: { userId: session!.user.id },
        fecha: { gte: inicioMes }
      },
      select: { monto: true }
    }),
    db.producto.findMany({
      where: { userId: session!.user.id, activo: true },
      select: { id: true, nombre: true, precio: true, stock: true, stockMinimo: true },
      orderBy: { nombre: "asc" }
    }),
    db.user.findUnique({ where: { id: session!.user.id }, select: { nombre: true, negocio: true } }),
    obtenerPlantillasCobranza(),
  ])

  const cobradoEsteMes = cobradoMes.reduce((a, p) => a + Number(p.monto), 0)

  const cuentasData = cuentas.map(c => {
    const totalPagado = c.pagos.reduce((a, p) => a + Number(p.monto), 0)
    const diasAtraso = c.fechaVence ? Math.max(0, Math.ceil((hoy.getTime() - c.fechaVence.getTime()) / 86400000)) : 0
    const diasHastaVence = c.fechaVence ? Math.ceil((c.fechaVence.getTime() - hoy.getTime()) / 86400000) : null

    // Utilidad (Financial Engine, Sprint 4): usa el costoAsociado guardado al
    // momento de la venta a crédito. Se prorratea según cuánto se ha cobrado.
    const montoOriginalNum = Number(c.montoOriginal)
    let utilidadEsperada: number | null = null
    let utilidadRecibida: number | null = null
    let utilidadPendiente: number | null = null
    if (c.costoAsociado != null && montoOriginalNum > 0) {
      utilidadEsperada = montoOriginalNum - Number(c.costoAsociado)
      const proporcionCobrada = totalPagado / montoOriginalNum
      utilidadRecibida = utilidadEsperada * proporcionCobrada
      utilidadPendiente = utilidadEsperada - utilidadRecibida
    }

    return {
      id: c.id, numero: c.numero,
      cliente: { id: c.cliente.id, nombre: c.cliente.nombre, apellido: c.cliente.apellido, empresa: c.cliente.empresa, telefono: c.cliente.telefono, email: c.cliente.email },
      movimientoId: c.movimientoId,
      montoOriginal: Number(c.montoOriginal),
      saldoPendiente: Number(c.saldoPendiente),
      totalPagado,
      fechaVenta: c.fechaVenta.toISOString(),
      fechaVence: c.fechaVence?.toISOString() ?? null,
      estado: c.estado,
      observaciones: c.observaciones,
      diasAtraso, diasHastaVence,
      createdAt: c.createdAt.toISOString(),
      utilidadEsperada, utilidadRecibida, utilidadPendiente,
      pagos: c.pagos.map(p => ({ id: p.id, monto: Number(p.monto), fecha: p.fecha.toISOString(), descripcion: p.descripcion, metodoPago: p.metodoPago }))
    }
  })

  // Métricas
  const pendientes = cuentasData.filter(c => c.estado !== "pagada")
  const vencidas = cuentasData.filter(c => c.estado === "vencida")
  const porVencer = cuentasData.filter(c => c.estado !== "pagada" && c.fechaVence && new Date(c.fechaVence) <= en7Dias && new Date(c.fechaVence) >= hoy)
  const totalPorCobrar = pendientes.reduce((a, c) => a + c.saldoPendiente, 0)
  const totalVencido = vencidas.reduce((a, c) => a + c.saldoPendiente, 0)
  const totalPorVencer = porVencer.reduce((a, c) => a + c.saldoPendiente, 0)
  const totalEmitido = cuentasData.reduce((a, c) => a + c.montoOriginal, 0)
  const totalCobrado = cuentasData.reduce((a, c) => a + c.totalPagado, 0)
  const tasaCobranza = totalEmitido > 0 ? Math.round((totalCobrado / totalEmitido) * 100) : 0
  const diasPromedioMora = vencidas.length > 0 ? Math.round(vencidas.reduce((a, c) => a + c.diasAtraso, 0) / vencidas.length) : 0

  // Score por cliente
  const scoreClientes = clientes.map(cl => {
    const cuentasCl = cuentasData.filter(c => c.cliente.id === cl.id)
    const vencidasCl = cuentasCl.filter(c => c.estado === "vencida").length
    const atrasosCl = cuentasCl.filter(c => c.diasAtraso > 0).length
    let score: "excelente"|"bueno"|"irregular"|"riesgo" = "excelente"
    if (vencidasCl > 0 || atrasosCl > 2) score = "riesgo"
    else if (atrasosCl > 1) score = "irregular"
    else if (atrasosCl === 1) score = "bueno"
    return { id: cl.id, score }
  })

  return (
    <CuentasCobrarClient
      cuentasData={cuentasData}
      clientes={clientes}
      productos={productos}
      scoreClientes={scoreClientes}
      metricas={{ totalPorCobrar, totalVencido, totalPorVencer, cobradoEsteMes, tasaCobranza, diasPromedioMora, countPendientes: pendientes.length, countVencidas: vencidas.length, countPorVencer: porVencer.length }}
      nombreNegocio={usuario?.negocio || usuario?.nombre || "Nuestro negocio"}
      usuarioEnvia={usuario?.nombre || ""}
      plantillas={plantillas}
    />
  )
}
