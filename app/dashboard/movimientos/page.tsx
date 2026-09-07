import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { TablaMovimientos } from "@/components/movimientos/tabla-movimientos"
import { FiltroPeriodo } from "@/components/shared/filtro-periodo"
import Link from "next/link"

export const metadata: Metadata = { title: "Movimientos" }

export default async function MovimientosPage({ searchParams }: { searchParams: { mes?: string; anio?: string } }) {
  const session = await auth()
  const hoy = new Date()
  const mes = parseInt(searchParams.mes ?? String(hoy.getMonth() + 1))
  const anio = parseInt(searchParams.anio ?? String(hoy.getFullYear()))

  const movimientos = await db.movimiento.findMany({
    where: { userId: session!.user.id, fecha: { gte: new Date(anio, mes - 1, 1), lt: new Date(anio, mes, 1) } },
    include: { producto: { select: { nombre: true } }, cliente: { select: { nombre: true, apellido: true } } },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-text)]">Movimientos</h1>
          <p className="text-xs text-[var(--c-text3)] mt-0.5">{movimientos.length} registros en el período</p>
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
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
        <TablaMovimientos movimientos={movimientos} />
      </div>
    </div>
  )
}
