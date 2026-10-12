import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { cambiarEstadoCliente } from "@/app/actions/admin-acciones"
import { determinarEstadoAlReactivar } from "@/lib/suscripciones"
import { verificarBloqueoLogin } from "@/app/actions/empleados-acciones"
import { GET as checkSession } from "@/app/api/check-session/route"

let sesionActual: any = null
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(sesionActual)),
  demasiadosIntentosDesdeIp: vi.fn(() => Promise.resolve(false)),
  registrarIntentoFallido: vi.fn(() => Promise.resolve()),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: vi.fn(() => Promise.resolve(new Map())) }))

async function crearAdmin() {
  const admin = await db.user.create({
    data: { nombre: "Admin Nelyx", email: `admin-${Math.random()}@nelyx.cl`, password: "x", rol: "ADMIN" },
  })
  sesionActual = { user: { id: admin.id, role: "ADMIN", esEmpleado: false } }
  return admin
}

async function crearClienteConSuscripcion(overrides?: { estado?: string; fechaFinPrueba?: Date | null }) {
  const cliente = await db.user.create({
    data: { nombre: "Cliente de prueba", email: `cliente-${Math.random()}@nelyx.cl`, password: await bcrypt.hash("x", 4), rol: "USER", activo: true },
  })
  const sus = await db.suscripcionNelyx.create({
    data: {
      userId: cliente.id,
      plan: "mensual",
      estado: overrides?.estado ?? "al_dia",
      fechaFinPrueba: overrides?.fechaFinPrueba ?? null,
      precioPlan: 20000,
    },
  })
  return { cliente, sus }
}

// Bug real reportado: el admin suspendía una cuenta de cliente y luego la
// reactivaba — el botón "Reactivar" siempre mandaba la suscripción
// directo a "al_dia", sin importar si en realidad tenía un cobro vencido
// sin pagar. Eso borraba la deuda de la vista del admin como si se
// hubiera pagado sola.
describe("Reactivar una cuenta de cliente (admin/clientes)", () => {
  it("no marca 'al día' una cuenta reactivada que tenía un cobro VENCIDO sin pagar", async () => {
    await crearAdmin()
    const { cliente, sus } = await crearClienteConSuscripcion({ estado: "suspendido" })
    await db.cobroNelyx.create({
      data: {
        suscripcionId: sus.id, plan: "mensual", monto: 20000,
        fechaEmision: new Date(Date.now() - 20 * 86400000),
        fechaVencimiento: new Date(Date.now() - 5 * 86400000), // ya pasó
        estado: "vencido",
      },
    })

    await cambiarEstadoCliente(sus.id, "al_dia") // "Reactivar"

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("vencido")
    const clienteFinal = await db.user.findUniqueOrThrow({ where: { id: cliente.id } })
    expect(clienteFinal.activo).toBe(true) // recupera el acceso igual, aunque deba plata
  })

  it("no marca 'al día' una cuenta reactivada que tenía un cobro PENDIENTE (no vencido aún)", async () => {
    await crearAdmin()
    const { sus } = await crearClienteConSuscripcion({ estado: "suspendido" })
    await db.cobroNelyx.create({
      data: {
        suscripcionId: sus.id, plan: "mensual", monto: 20000,
        fechaEmision: new Date(),
        fechaVencimiento: new Date(Date.now() + 3 * 86400000), // todavía no vence
        estado: "pendiente",
      },
    })

    await cambiarEstadoCliente(sus.id, "al_dia")

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("pendiente")
  })

  it("devuelve una cuenta cancelada a 'prueba_gratuita' si la prueba seguía vigente", async () => {
    await crearAdmin()
    const { sus } = await crearClienteConSuscripcion({ estado: "cancelado", fechaFinPrueba: new Date(Date.now() + 10 * 86400000) })

    await cambiarEstadoCliente(sus.id, "al_dia") // "Reactivar" también aplica a cancelado

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("prueba_gratuita")
  })

  it("sí marca 'al día' una reactivación sin ningún cobro pendiente ni prueba vigente", async () => {
    await crearAdmin()
    const { sus } = await crearClienteConSuscripcion({ estado: "suspendido" })

    await cambiarEstadoCliente(sus.id, "al_dia")

    const susFinal = await db.suscripcionNelyx.findUniqueOrThrow({ where: { id: sus.id } })
    expect(susFinal.estado).toBe("al_dia")
  })
})

describe("determinarEstadoAlReactivar", () => {
  it("devuelve 'al_dia' para una suscripción inexistente (no debería pasar, pero no debe reventar)", async () => {
    const estado = await determinarEstadoAlReactivar("no-existe")
    expect(estado).toBe("al_dia")
  })
})

// Bug relacionado reportado: al suspender una cuenta de cliente, el login
// no distinguía "cuenta suspendida" de "contraseña incorrecta" — la
// persona suspendida no tenía forma de saber por qué no podía entrar.
describe("verificarBloqueoLogin — cuenta suspendida", () => {
  it("reporta suspendido:true para una cuenta con activo:false", async () => {
    await db.user.create({
      data: { nombre: "Cliente suspendido", email: "suspendido-login@nelyx.cl", password: await bcrypt.hash("x", 4), rol: "USER", activo: false },
    })
    const resultado = await verificarBloqueoLogin("suspendido-login@nelyx.cl")
    expect(resultado.registrado).toBe(true)
    expect(resultado.bloqueado).toBe(false)
    expect(resultado.suspendido).toBe(true)
  })

  it("no reporta suspendido:true para una cuenta activa normal", async () => {
    await db.user.create({
      data: { nombre: "Cliente activo", email: "activo-login@nelyx.cl", password: await bcrypt.hash("x", 4), rol: "USER", activo: true },
    })
    const resultado = await verificarBloqueoLogin("activo-login@nelyx.cl")
    expect(resultado.suspendido).toBe(false)
  })
})

// Bug real reportado: Nelyx suspende la cuenta de un negocio (el dueño),
// pero los EMPLEADOS de ese negocio que ya estaban conectados seguían
// adentro — /api/check-session solo revisaba el registro propio del
// empleado (que nadie tocó), nunca el de la cuenta dueña de la que
// depende.
describe("GET /api/check-session — cascada dueño → empleados", () => {
  async function crearNegocioConEmpleado() {
    const dueno = await db.user.create({
      data: { nombre: "Dueño del negocio", email: `dueno-${Math.random()}@nelyx.cl`, password: "x", rol: "USER", activo: true },
    })
    const empleado = await db.user.create({
      data: { nombre: "Empleado", email: `empleado-${Math.random()}@nelyx.cl`, password: "x", rol: "USER", activo: true, cuentaPrincipalId: dueno.id, modulosPermitidos: ["ventas"] },
    })
    return { dueno, empleado }
  }

  it("expulsa a un empleado conectado cuando Nelyx suspende la cuenta del negocio (dueño)", async () => {
    const { dueno, empleado } = await crearNegocioConEmpleado()
    await db.user.update({ where: { id: dueno.id }, data: { activo: false } }) // Nelyx admin suspende el negocio

    // session.user.id = cuenta dueña (por diseño); empleadoId = el propio empleado
    sesionActual = { user: { id: dueno.id, empleadoId: empleado.id } }
    const res = await checkSession()
    const body = await res.json()

    expect(body.activo).toBe(false)
  })

  it("mantiene adentro a un empleado activo de un negocio activo", async () => {
    const { dueno, empleado } = await crearNegocioConEmpleado()
    sesionActual = { user: { id: dueno.id, empleadoId: empleado.id } }
    const res = await checkSession()
    const body = await res.json()

    expect(body.activo).toBe(true)
  })

  it("sigue expulsando a un empleado cuyo PROPIO registro se desactivó (regresión del fix anterior)", async () => {
    const { dueno, empleado } = await crearNegocioConEmpleado()
    await db.user.update({ where: { id: empleado.id }, data: { activo: false } })

    sesionActual = { user: { id: dueno.id, empleadoId: empleado.id } }
    const res = await checkSession()
    const body = await res.json()

    expect(body.activo).toBe(false)
  })
})
