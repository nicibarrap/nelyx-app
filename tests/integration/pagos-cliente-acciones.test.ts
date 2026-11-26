import { describe, it, expect, vi, beforeEach } from "vitest"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { obtenerMiSuscripcion, reportarPagoCliente } from "@/app/actions/suscripcion-cliente-acciones"
import { confirmarPagoCliente, rechazarPagoCliente } from "@/app/actions/admin-acciones"
import { obtenerDatosBancarios, actualizarDatosBancarios } from "@/app/actions/datos-bancarios-acciones"

let sesionActual: any = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

// Mismo patrón que soporte-acciones.test.ts: after() no corre en un request
// real acá, así que se captura cada callback para poder esperarlo a
// propósito (flushAfter) antes de revisar lo que escribió (el aviso al admin).
const afterPromises: Promise<unknown>[] = []
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => { afterPromises.push(Promise.resolve().then(fn)) },
}))
async function flushAfter() {
  await Promise.all(afterPromises.splice(0))
}
beforeEach(() => { afterPromises.length = 0 })

async function crearAdmin() {
  const admin = await db.user.create({
    data: { nombre: "Admin Nelyx", email: `admin-${Math.random()}@nelyx.cl`, password: "x", rol: "ADMIN" },
  })
  sesionActual = { user: { id: admin.id, name: admin.nombre, role: "ADMIN", esEmpleado: false } }
  return admin
}

function comoCliente(cliente: { id: string; nombre: string }) {
  sesionActual = { user: { id: cliente.id, name: cliente.nombre, role: "USER", esEmpleado: false } }
}

function comoEmpleadoDe(cliente: { id: string; nombre: string }) {
  sesionActual = { user: { id: cliente.id, name: cliente.nombre, role: "USER", esEmpleado: true } }
}

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

async function crearClienteConCobroPendiente() {
  const cliente = await db.user.create({
    data: { nombre: "Cliente Feriante", email: `cliente-${Math.random()}@nelyx.cl`, password: await bcrypt.hash("x", 4), rol: "USER", activo: true },
  })
  const plan = await db.planNelyx.create({ data: { nombre: "Feria", precio: 10000, meses: 1 } })
  const sus = await db.suscripcionNelyx.create({
    data: { userId: cliente.id, planId: plan.id, estado: "pendiente", precioPlan: 10000 },
  })
  const cobro = await db.cobroNelyx.create({
    data: { suscripcionId: sus.id, plan: "Feria", monto: 10000, fechaEmision: new Date(), fechaVencimiento: new Date(Date.now() + 5 * 86400000), estado: "pendiente" },
  })
  return { cliente, plan, sus, cobro }
}

describe("obtenerMiSuscripcion", () => {
  it("un empleado no puede verla (es la facturación del dueño, no suya)", async () => {
    const { cliente } = await crearClienteConCobroPendiente()
    comoEmpleadoDe(cliente)
    await expect(obtenerMiSuscripcion()).rejects.toThrow(/no autorizado/i)
  })

  it("devuelve el cobro pendiente del dueño, sin comprobante todavía", async () => {
    const { cliente, cobro } = await crearClienteConCobroPendiente()
    comoCliente(cliente)
    const resultado = await obtenerMiSuscripcion()
    expect(resultado.tieneSuscripcion).toBe(true)
    expect(resultado.cobroPendiente?.id).toBe(cobro.id)
    expect(resultado.cobroPendiente?.pagoEnRevision).toBeNull()
  })
})

describe("reportarPagoCliente", () => {
  it("el cliente sube un comprobante y el cobro queda pendiente igual (nunca se auto-aprueba)", async () => {
    const admin = await crearAdmin()
    const { cliente, cobro } = await crearClienteConCobroPendiente()
    comoCliente(cliente)

    const resultado = await reportarPagoCliente(formData({ cobroId: cobro.id, comprobanteUrl: "https://blob.vercel-storage.com/comprobante.png" }))
    expect(resultado).toBeUndefined()

    const cobroActualizado = await db.cobroNelyx.findUniqueOrThrow({ where: { id: cobro.id }, include: { pago: true } })
    expect(cobroActualizado.estado).toBe("pendiente") // nunca se marca pagado por sí solo
    expect(cobroActualizado.pago?.estado).toBe("pendiente_confirmacion")
    expect(cobroActualizado.pago?.comprobanteUrl).toBe("https://blob.vercel-storage.com/comprobante.png")
    expect(Number(cobroActualizado.pago?.monto)).toBe(10000) // el monto lo define el cobro, no el formulario

    // El admin tiene que enterarse al instante (campanita + push), no recién
    // la próxima vez que abra /admin/clientes.
    await flushAfter()
    const aviso = await db.notificacion.findFirst({ where: { userId: admin.id, categoria: "renovaciones" } })
    expect(aviso?.titulo).toMatch(/comprobante/i)
    expect(aviso?.accionUrl).toBe("/admin/clientes")
  })

  it("rechaza reportar el cobro de otro cliente", async () => {
    const { cobro } = await crearClienteConCobroPendiente()
    const otroCliente = await db.user.create({ data: { nombre: "Otro", email: `otro-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })
    comoCliente(otroCliente)

    const resultado = await reportarPagoCliente(formData({ cobroId: cobro.id, comprobanteUrl: "https://x.png" }))
    expect(resultado?.error).toMatch(/no encontrado/i)
  })

  it("rechaza un segundo comprobante mientras el primero sigue en revisión", async () => {
    const { cliente, cobro } = await crearClienteConCobroPendiente()
    comoCliente(cliente)
    await reportarPagoCliente(formData({ cobroId: cobro.id, comprobanteUrl: "https://x1.png" }))
    await flushAfter()

    const resultado = await reportarPagoCliente(formData({ cobroId: cobro.id, comprobanteUrl: "https://x2.png" }))
    expect(resultado?.error).toMatch(/en revisión/i)
  })
})

describe("confirmarPagoCliente / rechazarPagoCliente — revisión del admin", () => {
  it("al confirmar: el cobro y el pago quedan pagados, y agenda el próximo cobro según el plan", async () => {
    const admin = await crearAdmin()
    const { cliente, cobro, plan } = await crearClienteConCobroPendiente()
    comoCliente(cliente)
    await reportarPagoCliente(formData({ cobroId: cobro.id, comprobanteUrl: "https://x.png" }))
    await flushAfter()

    sesionActual = { user: { id: admin.id, name: admin.nombre, role: "ADMIN", esEmpleado: false } }
    const pagoPendiente = await db.pagoNelyx.findFirstOrThrow({ where: { suscripcionId: cobro.suscripcionId } })
    await confirmarPagoCliente(pagoPendiente.id)

    const cobroFinal = await db.cobroNelyx.findUniqueOrThrow({ where: { id: cobro.id } })
    const pagoFinal = await db.pagoNelyx.findUniqueOrThrow({ where: { id: pagoPendiente.id } })
    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: cobro.suscripcionId } })
    expect(cobroFinal.estado).toBe("pagado")
    expect(pagoFinal.estado).toBe("pagado")
    expect(susFinal.estado).toBe("al_dia")
    const diasHastaProximoCobro = Math.round((susFinal.fechaProximoCobro!.getTime() - Date.now()) / 86400000)
    expect(diasHastaProximoCobro).toBeGreaterThan(25) // ~1 mes (plan.meses = 1)
    void plan
  })

  it("al rechazar: el pago queda rechazado con el motivo, el cobro sigue pendiente y el cliente puede volver a intentar", async () => {
    const admin = await crearAdmin()
    const { cliente, cobro } = await crearClienteConCobroPendiente()
    comoCliente(cliente)
    await reportarPagoCliente(formData({ cobroId: cobro.id, comprobanteUrl: "https://x.png" }))
    await flushAfter()

    sesionActual = { user: { id: admin.id, name: admin.nombre, role: "ADMIN", esEmpleado: false } }
    const pagoPendiente = await db.pagoNelyx.findFirstOrThrow({ where: { suscripcionId: cobro.suscripcionId } })
    await rechazarPagoCliente(pagoPendiente.id, "El monto transferido no coincide")

    const pagoRechazado = await db.pagoNelyx.findUniqueOrThrow({ where: { id: pagoPendiente.id } })
    const cobroTrasRechazo = await db.cobroNelyx.findUniqueOrThrow({ where: { id: cobro.id } })
    expect(pagoRechazado.estado).toBe("rechazado")
    expect(pagoRechazado.motivoRechazo).toBe("El monto transferido no coincide")
    expect(cobroTrasRechazo.estado).toBe("pendiente")
    expect(cobroTrasRechazo.pagoId).toBeNull() // se desvincula para dejar lugar al reintento

    comoCliente(cliente)
    const segundoIntento = await reportarPagoCliente(formData({ cobroId: cobro.id, comprobanteUrl: "https://x2.png" }))
    await flushAfter()
    expect(segundoIntento).toBeUndefined()
    const miSus = await obtenerMiSuscripcion()
    expect(miSus.cobroPendiente?.pagoEnRevision?.comprobanteUrl).toBe("https://x2.png")
  })
})

describe("obtenerDatosBancarios / actualizarDatosBancarios", () => {
  it("un cliente no puede editarlos, pero sí puede leerlos", async () => {
    const { cliente } = await crearClienteConCobroPendiente()
    comoCliente(cliente)
    const resultado = await actualizarDatosBancarios(formData({ banco: "Banco Falso" }))
    expect(resultado?.error).toMatch(/no autorizado/i)
    await expect(obtenerDatosBancarios()).resolves.toMatchObject({ banco: "" })
  })

  it("el admin los edita y el cliente ve los valores nuevos", async () => {
    const admin = await crearAdmin()
    await actualizarDatosBancarios(formData({
      banco: "Banco Estado", tipoCuenta: "Cuenta Vista", numeroCuenta: "123456789",
      rutTitular: "11.111.111-1", nombreTitular: "Nelyx SpA", email: "pagos@nelyx.cl",
    }))

    const { cliente } = await crearClienteConCobroPendiente()
    comoCliente(cliente)
    const datos = await obtenerDatosBancarios()
    expect(datos).toEqual({
      banco: "Banco Estado", tipoCuenta: "Cuenta Vista", numeroCuenta: "123456789",
      rutTitular: "11.111.111-1", nombreTitular: "Nelyx SpA", email: "pagos@nelyx.cl",
    })
    void admin
  })
})
