import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { VentaClient } from "@/components/ventas/venta-client"

export const metadata: Metadata = { title: "Venta" }
export const dynamic = "force-dynamic"

export default async function VentaPage() {
  const session = await auth()

  const [productosRaw, clientes, conexionPago] = await Promise.all([
    db.producto.findMany({
      where: { userId: session!.user.id, activo: true },
      select: { id: true, nombre: true, sku: true, codigoBarras: true, categoria: true, precio: true, costo: true, stock: true, formaVenta: true, unidadMedida: true, unidadPersonalizada: true, unidadVentaCantidad: true, unidadVentaTipo: true, ventaMinima: true },
      orderBy: { nombre: "asc" },
    }),
    db.cliente.findMany({ where: { userId: session!.user.id, activo: true }, select: { id: true, nombre: true, apellido: true, telefono: true, empresa: true, esVip: true, permiteCredito: true }, orderBy: { nombre: "asc" } }),
    // Si el local tuviera dos máquinas conectadas a la vez (no debería
    // pasar, pero nada en el modelo lo impide), se prioriza Mercado Pago
    // por ser la integración más probada — mismo criterio que en
    // iniciarCobroMaquina/consultarCobroMaquina (app/actions/pagos-acciones.ts).
    // "transbank" también se incluye acá para que la UI de Venta sepa que
    // hay una máquina conectada, aunque a diferencia de los otros tres no
    // se cobra a través de una acción del servidor (ver
    // handleCobrarConMaquinaTransbank en venta-client.tsx) — por eso no
    // está en PROVEEDORES_MAQUINA (app/actions/pagos-acciones.ts), que es
    // solo para los proveedores que sí se cobran desde el servidor.
    db.conexionPago.findFirst({ where: { userId: session!.user.id, proveedor: { in: ["mercadopago", "sumup", "tuu", "transbank"] }, activo: true }, orderBy: { proveedor: "asc" } }),
  ])

  // precio/costo son Decimal de Prisma (instancias de clase, no objetos
  // planos) — React no permite pasarlas de un Server Component a un
  // Client Component (VentaClient es "use client"), mismo motivo por el
  // que /dashboard/deudas ya hace esta misma conversión.
  const productos = productosRaw.map(p => ({ ...p, precio: p.precio ? Number(p.precio) : null, costo: p.costo ? Number(p.costo) : null }))

  return <VentaClient productos={productos} clientes={clientes} proveedorPagoActivo={conexionPago?.proveedor ?? null} terminalIdActivo={conexionPago?.terminalId ?? null} />
}
