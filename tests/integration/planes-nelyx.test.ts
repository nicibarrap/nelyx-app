import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { crearPlan, actualizarPlan, cambiarActivoPlan, obtenerPlanes } from "@/app/actions/planes-acciones"
import { registrarPagoCobro } from "@/app/actions/admin-acciones"
import { sincronizarSuscripciones, referenciaCobro, DIAS_ALERTA_PROXIMO } from "@/lib/suscripciones"

let sesionActual: any = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

async function crearAdmin() {
  const admin = await db.user.create({
    data: { nombre: "Admin Nelyx", email: `admin-${Math.random()}@nelyx.cl`, password: "x", rol: "ADMIN" },
  })
  sesionActual = { user: { id: admin.id, name: admin.nombre, role: "ADMIN", esEmpleado: false } }
  return admin
}

function comoClienteCualquiera() {
  sesionActual = { user: { id: "otro", name: "Cliente", role: "USER", esEmpleado: false } }
}

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

describe("crearPlan / actualizarPlan — validaciones", () => {
  it("crea un plan con nombre, precio, recurrencia y descripción", async () => {
    await crearAdmin()
    const resultado = await crearPlan(formData({ nombre: "Feria", precio: "10000", meses: "1", descripcion: "Para puestos de feria" }))
    expect(resultado).toBeUndefined()

    const planes = await obtenerPlanes()
    expect(planes).toHaveLength(1)
    expect(planes[0]).toMatchObject({ nombre: "Feria", precio: 10000, meses: 1, descripcion: "Para puestos de feria", activo: true })
  })

  it("rechaza crear un plan sin nombre", async () => {
    await crearAdmin()
    const resultado = await crearPlan(formData({ nombre: "", precio: "10000", meses: "1" }))
    expect(resultado?.error).toMatch(/nombre/i)
  })

  it("rechaza un precio inválido (negativo o no numérico)", async () => {
    await crearAdmin()
    expect((await crearPlan(formData({ nombre: "X", precio: "-100", meses: "1" })))?.error).toMatch(/precio/i)
    expect((await crearPlan(formData({ nombre: "X", precio: "abc", meses: "1" })))?.error).toMatch(/precio/i)
  })

  it("rechaza una recurrencia inválida (0, negativa o no entera)", async () => {
    await crearAdmin()
    expect((await crearPlan(formData({ nombre: "X", precio: "1000", meses: "0" })))?.error).toMatch(/recurrencia/i)
    expect((await crearPlan(formData({ nombre: "X", precio: "1000", meses: "1.5" })))?.error).toMatch(/recurrencia/i)
  })

  it("un cliente (no admin) no puede crear ni listar planes", async () => {
    comoClienteCualquiera()
    await expect(obtenerPlanes()).rejects.toThrow(/no autorizado/i)
    const resultado = await crearPlan(formData({ nombre: "X", precio: "1000", meses: "1" }))
    expect(resultado?.error).toMatch(/no autorizado/i)
  })

  it("actualizarPlan edita nombre/precio/recurrencia/descripción de un plan existente", async () => {
    await crearAdmin()
    await crearPlan(formData({ nombre: "Mensual", precio: "20000", meses: "1" }))
    const [plan] = await obtenerPlanes()

    await actualizarPlan(formData({ planId: plan.id, nombre: "Mensual Pro", precio: "25000", meses: "1", descripcion: "Nuevo precio" }))

    const [actualizado] = await obtenerPlanes()
    expect(actualizado).toMatchObject({ nombre: "Mensual Pro", precio: 25000, descripcion: "Nuevo precio" })
  })

  it("cambiarActivoPlan desactiva y reactiva sin borrar el plan", async () => {
    await crearAdmin()
    await crearPlan(formData({ nombre: "Promo", precio: "5000", meses: "1" }))
    const [plan] = await obtenerPlanes()

    await cambiarActivoPlan(plan.id, false)
    expect((await obtenerPlanes())[0].activo).toBe(false)

    await cambiarActivoPlan(plan.id, true)
    expect((await obtenerPlanes())[0].activo).toBe(true)
  })
})

describe("sincronizarSuscripciones — usa el precio VIGENTE del plan, no uno fijo", () => {
  it("al terminar la prueba gratuita, genera el cobro por el precio actual del plan asignado", async () => {
    await crearAdmin()
    const plan = await db.planNelyx.create({ data: { nombre: "Feria", precio: 10000, meses: 1 } })
    const cliente = await db.user.create({ data: { nombre: "Feriante", email: `f-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const sus = await db.suscripcionNelyx.create({
      data: { userId: cliente.id, planId: plan.id, estado: "prueba_gratuita", fechaFinPrueba: new Date(Date.now() - 86400000), precioPlan: 0 },
    })

    await sincronizarSuscripciones()

    const cobros = await db.cobroNelyx.findMany({ where: { suscripcionId: sus.id } })
    expect(cobros).toHaveLength(1)
    expect(Number(cobros[0].monto)).toBe(10000)
    expect(cobros[0].plan).toBe("Feria")
    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(Number(susFinal.precioPlan)).toBe(10000)
    expect(susFinal.estado).toBe("pendiente")
  })

  it("dos clientes en planes distintos (ej. feria $10.000 vs almacén $20.000) se cobran cada uno con su propio precio", async () => {
    await crearAdmin()
    const planFeria = await db.planNelyx.create({ data: { nombre: "Feria", precio: 10000, meses: 1 } })
    const planAlmacen = await db.planNelyx.create({ data: { nombre: "Almacén", precio: 20000, meses: 1 } })

    const feriante = await db.user.create({ data: { nombre: "Feriante", email: `fa-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const susFeriante = await db.suscripcionNelyx.create({
      data: { userId: feriante.id, planId: planFeria.id, estado: "prueba_gratuita", fechaFinPrueba: new Date(Date.now() - 86400000), precioPlan: 0 },
    })
    const almacenero = await db.user.create({ data: { nombre: "Almacenero", email: `al-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const susAlmacenero = await db.suscripcionNelyx.create({
      data: { userId: almacenero.id, planId: planAlmacen.id, estado: "prueba_gratuita", fechaFinPrueba: new Date(Date.now() - 86400000), precioPlan: 0 },
    })

    await sincronizarSuscripciones()

    const cobroFeriante = await db.cobroNelyx.findFirstOrThrow({ where: { suscripcionId: susFeriante.id } })
    const cobroAlmacenero = await db.cobroNelyx.findFirstOrThrow({ where: { suscripcionId: susAlmacenero.id } })
    expect(Number(cobroFeriante.monto)).toBe(10000)
    expect(Number(cobroAlmacenero.monto)).toBe(20000)
  })

  it("editar el precio del plan afecta el PRÓXIMO ciclo, sin tocar un cobro ya generado", async () => {
    await crearAdmin()
    const plan = await db.planNelyx.create({ data: { nombre: "Mensual", precio: 20000, meses: 1 } })
    const cliente = await db.user.create({ data: { nombre: "Cliente", email: `c-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const sus = await db.suscripcionNelyx.create({
      data: { userId: cliente.id, planId: plan.id, estado: "al_dia", fechaProximoCobro: new Date(Date.now() - 86400000), precioPlan: 20000 },
    })
    // Un cobro de un ciclo anterior, ya pagado — no debe cambiar nunca.
    const cobroViejo = await db.cobroNelyx.create({
      data: { suscripcionId: sus.id, plan: "Mensual", monto: 20000, fechaEmision: new Date(Date.now() - 40 * 86400000), fechaVencimiento: new Date(Date.now() - 35 * 86400000), estado: "pagado" },
    })

    // El admin sube el precio del plan ANTES de que corra el próximo ciclo.
    await actualizarPlan(formData({ planId: plan.id, nombre: "Mensual", precio: "24000", meses: "1" }))

    await sincronizarSuscripciones()

    const cobroNuevo = await db.cobroNelyx.findFirstOrThrow({ where: { suscripcionId: sus.id, estado: "pendiente" } })
    expect(Number(cobroNuevo.monto)).toBe(24000)
    const cobroViejoIntacto = await db.cobroNelyx.findUniqueOrThrow({ where: { id: cobroViejo.id } })
    expect(Number(cobroViejoIntacto.monto)).toBe(20000) // el cobro ya generado nunca cambia
    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(Number(susFinal.precioPlan)).toBe(24000)
  })

  it("una suscripción sin plan asignado no revienta la sincronización y simplemente no se factura", async () => {
    await crearAdmin()
    const cliente = await db.user.create({ data: { nombre: "Sin plan", email: `sp-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const sus = await db.suscripcionNelyx.create({
      data: { userId: cliente.id, estado: "prueba_gratuita", fechaFinPrueba: new Date(Date.now() - 86400000), precioPlan: 0 },
    })

    await expect(sincronizarSuscripciones()).resolves.toBeUndefined()

    const cobros = await db.cobroNelyx.findMany({ where: { suscripcionId: sus.id } })
    expect(cobros).toHaveLength(0)
    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("prueba_gratuita") // queda esperando a que el admin le asigne un plan
  })
})

describe("sincronizarSuscripciones — genera el cobro con anticipación (ventana de aviso), no recién el día exacto", () => {
  it("dentro de la ventana de DIAS_ALERTA_PROXIMO genera el cobro YA y pasa a pendiente, antes de la fecha de vencimiento", async () => {
    await crearAdmin()
    const plan = await db.planNelyx.create({ data: { nombre: "Feria", precio: 10000, meses: 1 } })
    const cliente = await db.user.create({ data: { nombre: "Feriante", email: `ant-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const fechaProximoCobro = new Date(Date.now() + 2 * 86400000) // vence en 2 días — dentro de la ventana de 5
    const sus = await db.suscripcionNelyx.create({
      data: { userId: cliente.id, planId: plan.id, estado: "al_dia", fechaProximoCobro, precioPlan: 10000 },
    })

    await sincronizarSuscripciones()

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("pendiente") // puede pagar por adelantado, no tiene que esperar al día exacto
    const cobro = await db.cobroNelyx.findFirstOrThrow({ where: { suscripcionId: sus.id } })
    expect(cobro.estado).toBe("pendiente")
    expect(Number(cobro.monto)).toBe(10000)
    expect(cobro.fechaVencimiento.getTime()).toBeGreaterThan(fechaProximoCobro.getTime()) // la fecha de vencimiento real no se adelanta, solo se genera antes
  })

  it("fuera de la ventana de aviso todavía no genera nada (sigue al día)", async () => {
    await crearAdmin()
    const plan = await db.planNelyx.create({ data: { nombre: "Feria", precio: 10000, meses: 1 } })
    const cliente = await db.user.create({ data: { nombre: "Feriante", email: `lej-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const fechaProximoCobro = new Date(Date.now() + (DIAS_ALERTA_PROXIMO + 10) * 86400000)
    const sus = await db.suscripcionNelyx.create({
      data: { userId: cliente.id, planId: plan.id, estado: "al_dia", fechaProximoCobro, precioPlan: 10000 },
    })

    await sincronizarSuscripciones()

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("al_dia")
    const cobros = await db.cobroNelyx.findMany({ where: { suscripcionId: sus.id } })
    expect(cobros).toHaveLength(0)
  })

  it("una fila que haya quedado en el estado legado 'proximo_vencer' se migra sola: genera el cobro si ya corresponde", async () => {
    await crearAdmin()
    const plan = await db.planNelyx.create({ data: { nombre: "Feria", precio: 10000, meses: 1 } })
    const cliente = await db.user.create({ data: { nombre: "Feriante", email: `leg-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const fechaProximoCobro = new Date(Date.now() + 1 * 86400000)
    const sus = await db.suscripcionNelyx.create({
      data: { userId: cliente.id, planId: plan.id, estado: "proximo_vencer", fechaProximoCobro, precioPlan: 10000 },
    })

    await sincronizarSuscripciones()

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("pendiente")
    const cobros = await db.cobroNelyx.findMany({ where: { suscripcionId: sus.id } })
    expect(cobros).toHaveLength(1)
  })

  it("una fila 'proximo_vencer' cuya fecha el admin corrió hacia adelante vuelve a 'al_dia'", async () => {
    await crearAdmin()
    const plan = await db.planNelyx.create({ data: { nombre: "Feria", precio: 10000, meses: 1 } })
    const cliente = await db.user.create({ data: { nombre: "Feriante", email: `leg2-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const fechaProximoCobro = new Date(Date.now() + (DIAS_ALERTA_PROXIMO + 20) * 86400000)
    const sus = await db.suscripcionNelyx.create({
      data: { userId: cliente.id, planId: plan.id, estado: "proximo_vencer", fechaProximoCobro, precioPlan: 10000 },
    })

    await sincronizarSuscripciones()

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("al_dia")
    const cobros = await db.cobroNelyx.findMany({ where: { suscripcionId: sus.id } })
    expect(cobros).toHaveLength(0)
  })
})

describe("referenciaCobro", () => {
  it("genera un código corto y estable a partir del id del cobro", () => {
    expect(referenciaCobro("clx1234567890abcdef")).toBe("NLX-ABCDEF")
    expect(referenciaCobro("clx1234567890abcdef")).toBe(referenciaCobro("clx1234567890abcdef"))
  })
})

describe("registrarPagoCobro — agenda el próximo cobro según la recurrencia del plan vigente", () => {
  it("un plan trimestral agenda el próximo cobro 3 meses después, no 1", async () => {
    const admin = await crearAdmin()
    const plan = await db.planNelyx.create({ data: { nombre: "Trimestral", precio: 60000, meses: 3 } })
    const cliente = await db.user.create({ data: { nombre: "Cliente trimestral", email: `t-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    const sus = await db.suscripcionNelyx.create({
      data: { userId: cliente.id, planId: plan.id, estado: "pendiente", precioPlan: 60000 },
    })
    const cobro = await db.cobroNelyx.create({
      data: { suscripcionId: sus.id, plan: "Trimestral", monto: 60000, fechaEmision: new Date(), fechaVencimiento: new Date(Date.now() + 5 * 86400000), estado: "pendiente" },
    })

    await registrarPagoCobro(formData({ cobroId: cobro.id, metodoPago: "transferencia" }))

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("al_dia")
    const diasHastaProximoCobro = Math.round((susFinal.fechaProximoCobro!.getTime() - Date.now()) / 86400000)
    // ~90 días (3 meses), con margen para la duración real del test.
    expect(diasHastaProximoCobro).toBeGreaterThan(85)
    expect(diasHastaProximoCobro).toBeLessThan(95)
  })
})
