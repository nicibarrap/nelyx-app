// Métricas agregadas del panel admin de Clientes NELYX — separado de
// app/admin/clientes/page.tsx para poder probarlo sin levantar el server
// component completo.
type ClienteParaMetricas = {
  estado: string
  esPrueba: boolean
  precioPlan: number
  planMeses: number
  cobroPendiente: { monto: number } | null
}

export function calcularMetricasClientes(clientes: ClienteParaMetricas[]) {
  const activos = clientes.filter(c => c.estado === "al_dia").length
  const enPrueba = clientes.filter(c => c.estado === "prueba_gratuita").length
  const proximosVencer = clientes.filter(c => c.estado === "proximo_vencer").length
  const pendientes = clientes.filter(c => c.estado === "pendiente")
  const vencidos = clientes.filter(c => c.estado === "vencido")
  const suspendidos = clientes.filter(c => c.estado === "suspendido").length
  const cancelados = clientes.filter(c => c.estado === "cancelado").length

  // MRR normalizado a valor mensual según duración del plan — excluye
  // cuentas de prueba para no tergiversar el dinero real que se visualiza.
  const mrr = clientes
    .filter(c => !c.esPrueba && ["al_dia", "proximo_vencer", "pendiente", "vencido"].includes(c.estado))
    .reduce((acc, c) => acc + c.precioPlan / c.planMeses, 0)

  const pagosPendientes = [...pendientes, ...vencidos]
  const montoPendiente = pagosPendientes
    .filter(c => !c.esPrueba)
    .reduce((a, c) => a + (c.cobroPendiente?.monto ?? 0), 0)

  const baseRenovacion = activos + proximosVencer + vencidos.length
  const tasaRenovacion = baseRenovacion > 0 ? Math.round(((activos + proximosVencer) / baseRenovacion) * 100) : 100

  return {
    activos, enPrueba, proximosVencer, pendientes: pendientes.length, vencidos: vencidos.length,
    suspendidos, cancelados, mrr, pagosPendientes: pagosPendientes.length, montoPendiente, tasaRenovacion,
    total: clientes.length,
  }
}
