import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { verificarBloqueoPin } from "@/app/actions/empleados-acciones"

// empleados-acciones.ts importa demasiadosIntentosDesdeIp/registrarIntentoFallido
// desde lib/auth.ts, que también llama a NextAuth(...) a nivel de módulo —
// eso rompe fuera del runtime de Next, igual que en el resto de los tests
// de este proyecto. "demasiadosIntentos" es una variable mutable para poder
// simular el límite por IP prendido/apagado en cada test, sin depender de
// la lógica real de conteo (esa vive en lib/auth.ts, no en
// verificarBloqueoPin — acá se prueba que verificarBloqueoPin reacciona
// bien a lo que esa función le devuelva, no la cuenta en sí).
let demasiadosIntentos = false
vi.mock("@/lib/auth", () => ({
  demasiadosIntentosDesdeIp: vi.fn(() => Promise.resolve(demasiadosIntentos)),
  registrarIntentoFallido: vi.fn(() => Promise.resolve()),
}))
vi.mock("next/headers", () => ({ headers: vi.fn(() => Promise.resolve(new Map())) }))
vi.mock("@/lib/notificaciones", () => ({ notificar: vi.fn(() => Promise.resolve()) }))

async function crearDuenoYEmpleado() {
  const dueno = await db.user.create({
    data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" },
  })
  const empleado = await db.user.create({
    data: {
      nombre: "Ana", email: `empleado-${Math.random()}@nelyx.local`, password: "x",
      cuentaPrincipalId: dueno.id, pin: await bcrypt.hash("1234", 10), modulosPermitidos: [],
    },
  })
  return { dueno, empleado }
}

// Regresión del hallazgo reportado en producción: antes, un bloqueo por IP
// (demasiados intentos desde este dispositivo, en cualquier cuenta) y un
// bloqueo de una cuenta puntual devolvían exactamente el mismo mensaje —
// alguien que agotaba el límite por IP probando varios empleados veía "tu
// PIN quedó bloqueado" para un empleado que en realidad nunca llegó a sus
// propios 5 intentos.
describe("verificarBloqueoPin — distingue bloqueo por IP del bloqueo de la cuenta", () => {
  it("sin ningún bloqueo, bloqueado=false y motivo=null", async () => {
    demasiadosIntentos = false
    const { empleado } = await crearDuenoYEmpleado()
    const estado = await verificarBloqueoPin(empleado.id)
    expect(estado.bloqueado).toBe(false)
    expect(estado.motivo).toBeNull()
  })

  it("empleado con bloqueadoHastaPin en el futuro (y sin límite por IP) → motivo \"cuenta\"", async () => {
    demasiadosIntentos = false
    const { empleado } = await crearDuenoYEmpleado()
    await db.user.update({ where: { id: empleado.id }, data: { bloqueadoHastaPin: new Date(Date.now() + 10 * 60 * 1000) } })

    const estado = await verificarBloqueoPin(empleado.id)
    expect(estado.bloqueado).toBe(true)
    expect(estado.motivo).toBe("cuenta")
  })

  it("límite por IP alcanzado → motivo \"red\", incluso para un empleado sin bloqueo propio", async () => {
    demasiadosIntentos = true
    const { empleado } = await crearDuenoYEmpleado()

    const estado = await verificarBloqueoPin(empleado.id)
    expect(estado.bloqueado).toBe(true)
    expect(estado.motivo).toBe("red")
  })
})
