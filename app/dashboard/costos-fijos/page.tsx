import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generarCostosDelMes } from "@/app/actions/acciones"
import { CostosFijosClient } from "@/components/costos-fijos/costos-fijos-client"

export const metadata: Metadata = { title: "Costos Fijos" }

export default async function CostosFijosPage() {
  const session = await auth()
  const userId = session!.user.id
  const hoy = new Date()
  const mes = hoy.getMonth() + 1
  const anio = hoy.getFullYear()
  const diaActual = hoy.getDate()
  const diasDelMes = new Date(anio, mes, 0).getDate()

  // Asegura que los costos cuyo día ya llegó queden en estado "Generado"
  await generarCostosDelMes(userId, mes, anio)

  const inicioMes = new Date(anio, mes - 1, 1)
  const finMes = new Date(anio, mes, 1)

  const [costos, movsMes, gastosVariablesMes, movimientosCostoFijo, categoriasDB] = await Promise.all([
    db.costoFijoRecurrente.findMany({
      where: { userId },
      include: { generaciones: { where: { mes, anio } } },
      orderBy: [{ estado: "asc" }, { fechaInicio: "asc" }]
    }),
    db.movimiento.aggregate({
      where: { userId, tipo: { in: ["VENTA", "INGRESO_EXTRA"] }, fecha: { gte: inicioMes, lt: finMes } },
      _sum: { monto: true }
    }),
    db.movimiento.aggregate({
      where: { userId, tipo: "GASTO", fecha: { gte: inicioMes, lt: finMes } },
      _sum: { monto: true }
    }),
    db.movimiento.findMany({
      where: { userId, tipo: "COSTO_FIJO", fecha: { gte: inicioMes, lt: finMes } },
      select: { id: true, descripcion: true, monto: true, fecha: true, categoria: true },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }]
    }),
    db.categoriaPersonalizada.findMany({ where: { userId, tipo: "COSTO_FIJO" }, orderBy: { nombre: "asc" } }),
  ])

  // ¿El costo está dentro de su rango de vigencia este mes? (entre fechaInicio y fechaTermino, si tiene)
  function esAplicableEsteMes(fechaInicio: Date, fechaTermino: Date | null): boolean {
    const iMes = fechaInicio.getMonth() + 1, iAnio = fechaInicio.getFullYear()
    if (anio < iAnio || (anio === iAnio && mes < iMes)) return false
    if (fechaTermino) {
      const tMes = fechaTermino.getMonth() + 1, tAnio = fechaTermino.getFullYear()
      if (anio > tAnio || (anio === tAnio && mes > tMes)) return false
    }
    return true
  }

  function calcularEstado(c: typeof costos[number]): "programado" | "pendiente" | "generado" | "pagado" | "pausado" | "finalizado" {
    if (c.estado === "pausado") return "pausado"
    if (c.estado === "finalizado") return "finalizado"
    if (!esAplicableEsteMes(c.fechaInicio, c.fechaTermino)) return "programado"
    const gen = c.generaciones[0]
    if (!gen) {
      const diaDelMes = Math.min(c.fechaInicio.getDate(), diasDelMes)
      return diaDelMes <= diaActual ? "pendiente" : "programado"
    }
    return gen.pagado ? "pagado" : "generado"
  }

  const costosData = costos.map(c => {
    const estadoDerivado = calcularEstado(c)
    const gen = c.generaciones[0]
    return {
      id: c.id,
      nombre: c.nombre,
      monto: Number(c.monto),
      categoria: c.categoria,
      descripcion: c.descripcion,
      fechaInicio: c.fechaInicio.toISOString(),
      fechaTermino: c.fechaTermino?.toISOString() ?? null,
      estado: c.estado,
      estadoDerivado,
      generacionId: gen?.id ?? null,
      createdAt: c.createdAt.toISOString(),
    }
  })

  // Total mensual: solo costos activos Y aplicables este mes (corrige el bug
  // donde un costo programado para el futuro inflaba el total inmediatamente)
  const activosAplicables = costosData.filter(c => c.estado === "activo" && c.estadoDerivado !== "programado")
  const totalMes = activosAplicables.reduce((a, c) => a + c.monto, 0)
  const ingresosActuales = Number(movsMes._sum.monto ?? 0)
  const gastosVariables = Number(gastosVariablesMes._sum.monto ?? 0)
  // Cobertura financiera real: lo que queda de los ingresos después de pagar
  // gastos variables, comparado con lo que se necesita para costos fijos.
  // Ventas altas con gastos variables más altos pueden seguir dejando un déficit.
  const excedenteOperativo = ingresosActuales - gastosVariables
  const resultadoCobertura = excedenteOperativo - totalMes

  // Panel de estados
  const conteoEstados = {
    programado: costosData.filter(c => c.estado === "activo" && c.estadoDerivado === "programado").length,
    pendiente: costosData.filter(c => c.estado === "activo" && c.estadoDerivado === "pendiente").length,
    generado: costosData.filter(c => c.estado === "activo" && c.estadoDerivado === "generado").length,
    pagado: costosData.filter(c => c.estado === "activo" && c.estadoDerivado === "pagado").length,
  }

  // Próximos costos: aún no pagados este mes, ordenados por fecha relevante
  const proximosCostos = costosData
    .filter(c => c.estado === "activo" && (c.estadoDerivado === "programado" || c.estadoDerivado === "pendiente" || c.estadoDerivado === "generado"))
    .map(c => {
      let fecha: Date
      if (c.estadoDerivado === "programado") {
        fecha = new Date(c.fechaInicio)
      } else {
        fecha = new Date(anio, mes - 1, Math.min(new Date(c.fechaInicio).getDate(), diasDelMes))
      }
      return { ...c, fechaRelevante: fecha.toISOString() }
    })
    .sort((a, b) => new Date(a.fechaRelevante).getTime() - new Date(b.fechaRelevante).getTime())
    .slice(0, 8)

  // Costos únicos registrados este mes (movimientos COSTO_FIJO sin generación asociada)
  const movimientoIdsConGeneracion = new Set(
    costos.flatMap(c => c.generaciones).map(g => g.movimientoId).filter(Boolean)
  )
  const costosUnicosEsteMes = movimientosCostoFijo
    .filter(m => !movimientoIdsConGeneracion.has(m.id))
    .map(m => ({ id: m.id, nombre: m.descripcion ?? "Costo único", monto: Number(m.monto), fecha: m.fecha.toISOString(), categoria: m.categoria }))

  return (
    <CostosFijosClient
      costosData={costosData}
      totalMes={totalMes}
      ingresosActuales={ingresosActuales}
      gastosVariables={gastosVariables}
      excedenteOperativo={excedenteOperativo}
      resultadoCobertura={resultadoCobertura}
      mes={mes}
      anio={anio}
      conteoEstados={conteoEstados}
      proximosCostos={proximosCostos}
      costosUnicosEsteMes={costosUnicosEsteMes}
      dbCategorias={categoriasDB.map(c => c.nombre)}
    />
  )
}
