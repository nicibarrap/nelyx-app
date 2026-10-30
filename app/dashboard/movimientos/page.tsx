import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { TablaMovimientos } from "@/components/movimientos/tabla-movimientos"
import { FiltroPeriodo } from "@/components/shared/filtro-periodo"
import { FiltroMovimientos } from "@/components/movimientos/filtro-movimientos"
import { PaginacionMovimientos } from "@/components/movimientos/paginacion-movimientos"
import { ExportarMovimientosBoton } from "@/components/movimientos/exportar-movimientos-boton"
import { construirWhereMovimientos } from "@/lib/movimientos-filtro"
import Link from "next/link"

export const metadata: Metadata = { title: "Historial — Movimientos" }

const POR_PAGINA = 25

export default async function MovimientosPage(props: { searchParams: Promise<{ mes?: string; anio?: string; q?: string; tipo?: string; metodoPago?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await auth()
  const hoy = new Date()
  const mes = parseInt(searchParams.mes ?? String(hoy.getMonth() + 1))
  const anio = parseInt(searchParams.anio ?? String(hoy.getFullYear()))
  const pagina = Math.max(1, parseInt(searchParams.page ?? "1") || 1)

  const where = construirWhereMovimientos({
    userId: session!.user.id, mes, anio,
    q: searchParams.q, tipo: searchParams.tipo, metodoPago: searchParams.metodoPago,
  })

  const [movimientosDb, totalRegistros] = await Promise.all([
    db.movimiento.findMany({
      where,
      include: {
        producto: { select: { nombre: true } }, cliente: { select: { nombre: true, apellido: true } },
        // Para mostrar la devolución y la venta nueva de un cambio de
        // producto como un par visualmente enlazado (ver registrarCambioProducto)
        // — cada fila puede apuntar a la otra, o ser apuntada por la otra.
        movimientoVinculado: { select: { id: true, descripcion: true } },
        movimientoVinculadoDe: { select: { id: true, descripcion: true } },
      },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    db.movimiento.count({ where }),
  ])
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / POR_PAGINA))
  // Decimal de Prisma no es un objeto plano — pasarlo directo a un Client
  // Component (TablaMovimientos) rompe la regla de serialización de RSC.
  const movimientos = movimientosDb.map(m => ({
    ...m, monto: Number(m.monto), costoUnitario: m.costoUnitario != null ? Number(m.costoUnitario) : null,
    utilidad: m.utilidad != null ? Number(m.utilidad) : null,
  }))

  return (
    // max-w-[1480px]: en monitores anchos, la tabla ya no se estira hasta el
    // borde — eso dejaba la columna Detalle (la única elástica) con un hueco
    // enorme sin contenido entre el producto y Medio de pago. En pantallas
    // normales (laptop, 1080p) este tope nunca se activa, no cambia nada.
    <div className="space-y-5 max-w-[1480px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-text)]">Historial de movimientos</h1>
          <p className="text-xs text-[var(--c-text3)] mt-0.5">{totalRegistros} registros en el período</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FiltroPeriodo />
          <Link href="/dashboard/venta"
            className="flex items-center gap-2 h-9 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-500/20 transition-all">
            🛒 Venta
          </Link>
          <Link href="/dashboard/movimientos/nuevo"
            className="flex items-center gap-2 h-9 px-4 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold rounded-xl transition-all">
            + Nuevo
          </Link>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <FiltroMovimientos />
        </div>
        <ExportarMovimientosBoton mes={mes} anio={anio} q={searchParams.q} tipo={searchParams.tipo} metodoPago={searchParams.metodoPago} />
      </div>
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
        <TablaMovimientos movimientos={movimientos} />
        <PaginacionMovimientos paginaActual={pagina} totalPaginas={totalPaginas} />
      </div>
    </div>
  )
}
