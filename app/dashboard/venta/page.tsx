import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { VentaClient } from "@/components/ventas/venta-client"
import { obtenerMovimientoParaCambio } from "@/app/actions/acciones"

export const metadata: Metadata = { title: "Venta" }
export const dynamic = "force-dynamic"
// BCI Pagos no tiene forma de "crear y consultar después" — iniciarCobroBciPagos
// se queda escuchando MQTT hasta que el terminal responde (hasta 90s, ver
// lib/pagos/bcipagos.ts), más que el límite por defecto de una función serverless.
export const maxDuration = 100

export default async function VentaPage(props: { searchParams: Promise<{ cambioDeId?: string }> }) {
  const searchParams = await props.searchParams
  const session = await auth()

  // "Modo cambio" (ver registrarCambioProducto): se llega acá desde el botón
  // ↩️ Cambiar de Historial de movimientos, con el id de la venta que se
  // está devolviendo. Si ya no se puede cambiar (venta ajena, sin producto,
  // ya cambiada antes), se cae de vuelta a Venta normal — VentaClient
  // muestra cambioError como toast apenas monta, en vez de romper la
  // pantalla con el error genérico de Next.js.
  let cambioOrigen: Awaited<ReturnType<typeof obtenerMovimientoParaCambio>> | null = null
  let cambioError: string | null = null
  if (searchParams.cambioDeId) {
    try {
      cambioOrigen = await obtenerMovimientoParaCambio(searchParams.cambioDeId)
    } catch (err: any) {
      cambioError = err instanceof Error ? err.message : "No se pudo cargar la venta a cambiar."
    }
  }

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
    db.conexionPago.findFirst({ where: { userId: session!.user.id, proveedor: { in: ["mercadopago", "sumup", "tuu", "transbank", "bcipagos"] }, activo: true }, orderBy: { proveedor: "asc" } }),
  ])

  // precio/costo son Decimal de Prisma (instancias de clase, no objetos
  // planos) — React no permite pasarlas de un Server Component a un
  // Client Component (VentaClient es "use client"), mismo motivo por el
  // que /dashboard/deudas ya hace esta misma conversión.
  const productos = productosRaw.map(p => ({ ...p, precio: p.precio ? Number(p.precio) : null, costo: p.costo ? Number(p.costo) : null }))

  return <VentaClient productos={productos} clientes={clientes} proveedorPagoActivo={conexionPago?.proveedor ?? null} terminalIdActivo={conexionPago?.terminalId ?? null} cambioOrigen={cambioOrigen} cambioError={cambioError} />
}
