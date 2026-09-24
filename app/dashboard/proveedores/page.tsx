import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ProveedoresClient } from "@/components/proveedores/proveedores-client"
import { hoyEnChile } from "@/lib/timezone"

export const metadata: Metadata = { title: "Proveedores" }

export default async function ProveedoresPage() {
  const session = await auth()
  // Vercel corre en UTC, no en la hora de Chile — con new Date() crudo,
  // "compras de este mes" podía perder o mover al mes siguiente las compras
  // del último día, durante la noche chilena. Mismo fix ya aplicado en
  // Clientes y Costos Fijos.
  const hoy = hoyEnChile()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

  const [proveedores, movsMes, reposicionesMes] = await Promise.all([
    db.proveedor.findMany({
      where: { userId: session!.user.id },
      include: {
        movimientos: {
          where: { tipo: "GASTO" },
          orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
          take: 100,
          select: { id: true, monto: true, fecha: true, descripcion: true }
        },
        // Reponer stock con un proveedor asignado es una compra real —
        // antes solo se contaban los gastos registrados a mano desde
        // Movimientos, y una reposición de inventario (con su costo y
        // proveedor) no aparecía nunca en las estadísticas del proveedor.
        movimientosStock: {
          where: { tipo: "reposicion", costoTotal: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { id: true, costoTotal: true, createdAt: true, observacion: true }
        },
        notas: { orderBy: { createdAt: "desc" } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    db.movimiento.aggregate({
      where: { userId: session!.user.id, tipo: "GASTO", fecha: { gte: inicioMes }, proveedorId: { not: null } },
      _sum: { monto: true }
    }),
    db.movimientoStock.aggregate({
      where: { userId: session!.user.id, tipo: "reposicion", proveedorId: { not: null }, costoTotal: { not: null }, createdAt: { gte: inicioMes } },
      _sum: { costoTotal: true }
    }),
  ])

  const provData = proveedores.map(p => {
    // Se fusionan gastos registrados a mano y reposiciones de stock en una
    // sola lista cronológica — mismo patrón que Clientes fusiona ventas al
    // contado y a crédito, para que "Compras" muestre el historial real
    // completo, sin importar por qué módulo se haya registrado la compra.
    const comprasFusionadas = [
      ...p.movimientos.map(m => ({ id: m.id, monto: Number(m.monto), fecha: m.fecha, descripcion: m.descripcion })),
      ...p.movimientosStock.map(ms => ({ id: ms.id, monto: Number(ms.costoTotal), fecha: ms.createdAt, descripcion: ms.observacion ?? "Reposición de stock" })),
    ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

    const totalComprado = comprasFusionadas.reduce((a, m) => a + m.monto, 0)
    const compras = comprasFusionadas.length
    const ultimaCompra = comprasFusionadas[0]?.fecha ?? null
    const diasSinCompra = ultimaCompra ? Math.floor((hoy.getTime() - ultimaCompra.getTime()) / 86400000) : null
    const promedioCompra = compras > 0 ? totalComprado / compras : 0
    return {
      id: p.id, nombre: p.nombre, empresa: p.empresa, rut: p.rut,
      telefono: p.telefono, email: p.email, direccion: p.direccion, ciudad: p.ciudad,
      categoria: p.categoria, esFavorito: p.esFavorito, activo: p.activo,
      observaciones: p.observaciones, createdAt: p.createdAt.toISOString(),
      totalComprado, compras, promedioCompra, diasSinCompra,
      ultimaCompra: ultimaCompra?.toISOString() ?? null,
      sinActividad: diasSinCompra !== null && diasSinCompra > 90,
      movimientos: comprasFusionadas.map(m => ({ id: m.id, monto: m.monto, fecha: m.fecha.toISOString(), descripcion: m.descripcion })),
      notas: p.notas.map(n => ({ id: n.id, texto: n.texto, createdAt: n.createdAt.toISOString() })),
    }
  })

  const totalComprasMes = Number(movsMes._sum.monto ?? 0) + Number(reposicionesMes._sum.costoTotal ?? 0)
  const provPrincipal = [...provData].sort((a, b) => b.totalComprado - a.totalComprado)[0] ?? null
  const inactivos = provData.filter(p => !p.activo).length

  return (
    <ProveedoresClient
      proveedoresData={provData}
      metricas={{ totalComprasMes, provPrincipal: provPrincipal?.nombre ?? null, inactivos }}
    />
  )
}
