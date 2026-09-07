import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { ProveedoresClient } from "@/components/proveedores/proveedores-client"

export const metadata: Metadata = { title: "Proveedores" }

export default async function ProveedoresPage() {
  const session = await auth()
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const hace90 = new Date(hoy.getTime() - 90 * 86400000)

  const [proveedores, movsMes] = await Promise.all([
    db.proveedor.findMany({
      where: { userId: session!.user.id },
      include: {
        movimientos: {
          where: { tipo: "GASTO" },
          orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
          take: 100,
          select: { id: true, monto: true, fecha: true, descripcion: true }
        },
        notas: { orderBy: { createdAt: "desc" } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    db.movimiento.aggregate({
      where: { userId: session!.user.id, tipo: "GASTO", fecha: { gte: inicioMes }, proveedorId: { not: null } },
      _sum: { monto: true }
    })
  ])

  const provData = proveedores.map(p => {
    const movs = p.movimientos
    const totalComprado = movs.reduce((a, m) => a + Number(m.monto), 0)
    const compras = movs.length
    const ultimaCompra = movs[0]?.fecha ?? null
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
      movimientos: movs.map(m => ({ id: m.id, monto: Number(m.monto), fecha: m.fecha.toISOString(), descripcion: m.descripcion })),
      notas: p.notas.map(n => ({ id: n.id, texto: n.texto, createdAt: n.createdAt.toISOString() })),
    }
  })

  const totalComprasMes = Number(movsMes._sum.monto ?? 0)
  const conDeuda = 0 // Future: link to deudas module
  const provPrincipal = [...provData].sort((a, b) => b.totalComprado - a.totalComprado)[0] ?? null
  const inactivos = provData.filter(p => !p.activo).length

  return (
    <ProveedoresClient
      proveedoresData={provData}
      metricas={{ totalComprasMes, conDeuda, provPrincipal: provPrincipal?.nombre ?? null, inactivos }}
    />
  )
}
