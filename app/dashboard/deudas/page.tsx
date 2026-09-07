import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { formatCLP, formatFechaCorta, calcularEstadoDeuda, ESTADO_CONFIG, TIPOS_DEUDA, EstadoDeuda } from "@/lib/utils"
import { FormularioDeuda } from "@/components/deudas/formulario-deuda"
import { ListaDeudas } from "@/components/deudas/lista-deudas"
import { GraficoDeudas } from "@/components/deudas/grafico-deudas"

export const metadata: Metadata = { title: "Deudas" }

export default async function DeudasPage({ searchParams }: { searchParams: { filtro?: string } }) {
  const session = await auth()
  const filtro = searchParams.filtro ?? "todas"

  const deudas = await db.deuda.findMany({
    where: { userId: session!.user.id },
    include: { pagos: { orderBy: [{ fecha: "desc" }, { createdAt: "desc" }] } },
    orderBy: [{ pagada: "asc" }, { fechaVence: "asc" }, { createdAt: "desc" }],
  })

  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

  // Calcular estado de cada deuda
  const deudasConEstado = deudas.map(d => ({
    ...d,
    estado: calcularEstadoDeuda(d) as EstadoDeuda,
  }))

  // Métricas
  const pendientes = deudasConEstado.filter(d => !d.pagada)
  const deudaTotal = pendientes.reduce((a, d) => a + Number(d.monto) - Number(d.montoPagado), 0)
  const proximasVencer = pendientes.filter(d => d.estado === "Próxima a vencer")
  const montoProximas = proximasVencer.reduce((a, d) => a + Number(d.monto) - Number(d.montoPagado), 0)
  const vencidas = pendientes.filter(d => d.estado === "Vencida")
  const montoVencidas = vencidas.reduce((a, d) => a + Number(d.monto) - Number(d.montoPagado), 0)
  const pagadoEsteMes = deudas
    .flatMap(d => d.pagos)
    .filter(p => new Date(p.fecha) >= inicioMes)
    .reduce((a, p) => a + Number(p.monto), 0)
  const interesesAcumulados = pendientes.reduce((a, d) => {
    if (!d.interes || !d.cuotas || !d.valorCuota) return a
    const totalAPagar = Number(d.valorCuota) * d.cuotas
    return a + (totalAPagar - Number(d.monto))
  }, 0)

  // Filtrar deudas según tab
  const deudasFiltradas = filtro === "todas" ? deudasConEstado :
    filtro === "al-dia" ? deudasConEstado.filter(d => d.estado === "Al día" || d.estado === "Parcialmente pagada") :
    filtro === "proximas" ? deudasConEstado.filter(d => d.estado === "Próxima a vencer") :
    filtro === "vencidas" ? deudasConEstado.filter(d => d.estado === "Vencida") :
    filtro === "pagadas" ? deudasConEstado.filter(d => d.estado === "Pagada") :
    deudasConEstado

  // Datos para gráfico
  const datosPorTipo = TIPOS_DEUDA.map(tipo => {
    const deudasTipo = pendientes.filter(d => d.tipo === tipo)
    const monto = deudasTipo.reduce((a, d) => a + Number(d.monto) - Number(d.montoPagado), 0)
    return { tipo, monto, cantidad: deudasTipo.length }
  }).filter(d => d.monto > 0)

  // Próximos pagos (deudas con cuotas o vencimiento próximo)
  const proximosPagos = pendientes
    .filter(d => d.fechaVence || d.valorCuota)
    .sort((a, b) => {
      const fa = a.fechaVence ? new Date(a.fechaVence).getTime() : Infinity
      const fb = b.fechaVence ? new Date(b.fechaVence).getTime() : Infinity
      return fa - fb
    })
    .slice(0, 5)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--c-text)]">Deudas</h1>
          <p className="text-xs text-[var(--c-text3)] mt-0.5">Administra todas las deudas de tu negocio</p>
        </div>
        <FormularioDeuda />
      </div>

      {/* Cards métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            label: "Deuda total",
            valor: formatCLP(deudaTotal),
            sub: `${pendientes.length} deuda${pendientes.length !== 1 ? "s" : ""} activa${pendientes.length !== 1 ? "s" : ""}`,
            icon: "💳",
            color: "text-sky-400",
            bg: "bg-sky-500/5",
            border: "border-sky-500/15",
          },
          {
            label: "Próximos 7 días",
            valor: formatCLP(montoProximas),
            sub: `${proximasVencer.length} vence${proximasVencer.length !== 1 ? "n" : ""} pronto`,
            icon: "⏰",
            color: "text-orange-400",
            bg: "bg-orange-500/5",
            border: "border-orange-500/15",
          },
          {
            label: "Deudas vencidas",
            valor: formatCLP(montoVencidas),
            sub: `${vencidas.length} vencida${vencidas.length !== 1 ? "s" : ""}`,
            icon: "⚠️",
            color: "text-red-400",
            bg: "bg-red-500/5",
            border: "border-red-500/15",
          },
          {
            label: "Pagado este mes",
            valor: formatCLP(pagadoEsteMes),
            sub: "Abonos realizados",
            icon: "✅",
            color: "text-green-400",
            bg: "bg-green-500/5",
            border: "border-green-500/15",
          },
          {
            label: "Intereses acum.",
            valor: formatCLP(interesesAcumulados),
            sub: "Total acumulado",
            icon: "%",
            color: "text-violet-400",
            bg: "bg-violet-500/5",
            border: "border-violet-500/15",
            iconStyle: "text-sm font-bold",
          },
        ].map((c) => (
          <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl p-4`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium leading-tight">{c.label}</p>
              <div className={`w-7 h-7 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center text-sm`}>
                {c.icon}
              </div>
            </div>
            <p className={`text-lg font-bold ${c.color} leading-none`}>{c.valor}</p>
            <p className="text-[10px] text-[var(--c-text3)] mt-1.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Lista + Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Lista de deudas */}
        <div className="xl:col-span-2">
          <ListaDeudas
            deudas={deudasFiltradas}
            filtroActual={filtro}
            conteos={{
              todas: deudasConEstado.length,
              alDia: deudasConEstado.filter(d => d.estado === "Al día" || d.estado === "Parcialmente pagada").length,
              proximas: proximasVencer.length,
              vencidas: vencidas.length,
              pagadas: deudasConEstado.filter(d => d.estado === "Pagada").length,
            }}
          />
        </div>

        {/* Panel derecho */}
        <div className="space-y-4">
          {/* Próximos pagos */}
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-[var(--c-text)] mb-4">Próximos pagos</h3>
            {proximosPagos.length > 0 ? (
              <div className="space-y-3">
                {proximosPagos.map(d => {
                  const cfg = ESTADO_CONFIG[d.estado]
                  const monto = d.valorCuota ? Number(d.valorCuota) : Number(d.monto) - Number(d.montoPagado)
                  return (
                    <div key={d.id} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center text-xs font-bold ${cfg.color} flex-shrink-0`}>
                        {d.acreedor[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--c-text)] truncate">{d.acreedor}</p>
                        <p className="text-[10px] text-[var(--c-text3)]">
                          {d.fechaVence ? formatFechaCorta(d.fechaVence) : "Sin fecha"}
                          {d.cuotas ? ` · Cuota ${d.cuotasPagadas + 1}/${d.cuotas}` : ""}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-orange-400 flex-shrink-0">{formatCLP(monto)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[10px] text-[var(--c-text4)] text-center py-4">Sin pagos próximos</p>
            )}
          </div>

          {/* Gráfico por tipo */}
          {datosPorTipo.length > 0 && (
            <GraficoDeudas datos={datosPorTipo} total={deudaTotal} />
          )}
        </div>
      </div>
    </div>
  )
}
