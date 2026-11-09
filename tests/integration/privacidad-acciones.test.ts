import { describe, it, expect, vi } from "vitest"
import * as XLSX from "xlsx"
import { db } from "@/lib/db"
import { eliminarMiCuenta, exportarMisDatos } from "@/app/actions/privacidad-acciones"
import { resetearPassword, enviarInvitacionCliente } from "@/app/actions/password-reset-acciones"
import { eliminarCliente, eliminarProveedor } from "@/app/actions/acciones"

// Mismo patrón que soporte-acciones.test.ts / caja.test.ts.
let sesionActual: { user: { id: string; email?: string; esEmpleado?: boolean; name: string; role?: string; modulosPermitidos?: string[] | null } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`) }),
}))
// enviarInvitacionCliente/solicitarResetPassword mandan un correo real por
// Resend — sin RESEND_API_KEY configurada ya no hacen nada (ver lib/email.ts),
// así que no hace falta mockear nada más para que el test corra limpio.

async function crearDueno() {
  const email = `dueno-${Math.random()}@nelyx.cl`
  const user = await db.user.create({ data: { nombre: "Dueño de prueba", email, password: "x", rol: "USER" } })
  return { ...user, email }
}

function comoDueno(dueno: { id: string; nombre: string; email: string }) {
  sesionActual = { user: { id: dueno.id, email: dueno.email, esEmpleado: false, name: dueno.nombre, role: "USER", modulosPermitidos: null } }
}

function comoEmpleado(duenoId: string, nombre: string) {
  sesionActual = { user: { id: duenoId, esEmpleado: true, name: nombre, role: "USER", modulosPermitidos: ["clientes"] } }
}

function comoAdmin(id: string) {
  sesionActual = { user: { id, esEmpleado: false, name: "Soporte Nelyx", role: "ADMIN", modulosPermitidos: null } }
}

describe("eliminarMiCuenta", () => {
  it("elimina la cuenta y todo lo asociado (cascade) cuando el email coincide", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await db.cliente.create({ data: { userId: dueno.id, nombre: "Cliente de prueba" } })

    const resultado = await eliminarMiCuenta(dueno.email)
    expect(resultado).toBeUndefined()

    expect(await db.user.findUnique({ where: { id: dueno.id } })).toBeNull()
    expect(await db.cliente.count({ where: { userId: dueno.id } })).toBe(0)
  })

  it("no elimina nada si el email no coincide", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)

    const resultado = await eliminarMiCuenta("otro-email@nelyx.cl")
    expect(resultado?.error).toMatch(/no coincide/i)
    expect(await db.user.findUnique({ where: { id: dueno.id } })).not.toBeNull()
  })

  it("un empleado no puede eliminar la cuenta del dueño", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana")
    await expect(eliminarMiCuenta(dueno.email)).rejects.toThrow(/solo el dueño/i)
    expect(await db.user.findUnique({ where: { id: dueno.id } })).not.toBeNull()
  })

  it("la cuenta de soporte (ADMIN) no puede usar esto", async () => {
    const admin = await crearDueno()
    comoAdmin(admin.id)
    await expect(eliminarMiCuenta(admin.email)).rejects.toThrow(/solo el dueño/i)
  })
})

describe("exportarMisDatos", () => {
  it("genera un .xlsx con la cuenta, clientes y proveedores reales", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    await db.cliente.create({ data: { userId: dueno.id, nombre: "Ana", apellido: "Soto" } })
    await db.proveedor.create({ data: { userId: dueno.id, nombre: "Distribuidora X" } })

    const { base64, filename } = await exportarMisDatos()
    expect(filename).toMatch(/\.xlsx$/)

    const wb = XLSX.read(Buffer.from(base64, "base64"))
    expect(wb.SheetNames).toEqual(["Mi cuenta", "Empleados", "Clientes", "Proveedores"])

    const cuenta = XLSX.utils.sheet_to_json(wb.Sheets["Mi cuenta"]) as Record<string, unknown>[]
    expect(cuenta[0].Email).toBe(dueno.email)

    const clientes = XLSX.utils.sheet_to_json(wb.Sheets["Clientes"]) as Record<string, unknown>[]
    expect(clientes.map(c => c.Nombre)).toEqual(["Ana"])

    const proveedores = XLSX.utils.sheet_to_json(wb.Sheets["Proveedores"]) as Record<string, unknown>[]
    expect(proveedores.map(p => p.Nombre)).toEqual(["Distribuidora X"])
  })

  it("un empleado no puede exportar los datos del dueño", async () => {
    const dueno = await crearDueno()
    comoEmpleado(dueno.id, "Ana")
    await expect(exportarMisDatos()).rejects.toThrow(/solo el dueño/i)
  })
})

describe("resetearPassword — consentimiento solo en la primera activación", () => {
  it("una invitación nueva exige aceptar la Política de Privacidad", async () => {
    const dueno = await crearDueno()
    // enviarInvitacionCliente exige sesión ADMIN — getAdminSession verifica
    // contra una cuenta real (verificarCuentaActivaOExpulsar consulta la DB).
    const admin = await db.user.create({ data: { nombre: "Soporte", email: `admin-${Math.random()}@nelyx.cl`, password: "x", rol: "ADMIN" } })
    comoAdmin(admin.id)

    await enviarInvitacionCliente(dueno.id)
    const token = await db.passwordResetToken.findFirstOrThrow({ where: { userId: dueno.id } })
    expect(token.esInvitacion).toBe(true)

    // El token real nunca se guarda (solo su hash) — para probar resetearPassword
    // hay que generar uno nuevo propio y guardar su hash a mano, mismo hash
    // que usa la acción (sha256).
    const crypto = await import("crypto")
    const tokenPlano = "token-de-prueba-" + Math.random()
    const tokenHash = crypto.createHash("sha256").update(tokenPlano).digest("hex")
    await db.passwordResetToken.update({ where: { id: token.id }, data: { tokenHash } })

    await expect(resetearPassword(tokenPlano, "contraseñaNueva123")).rejects.toThrow(/aceptar la política de privacidad/i)

    const resultado = await resetearPassword(tokenPlano, "contraseñaNueva123", true)
    expect(resultado.ok).toBe(true)
    const actualizado = await db.user.findUniqueOrThrow({ where: { id: dueno.id } })
    expect(actualizado.consentimientoAceptadoAt).not.toBeNull()
  })

  it("un reset normal (olvidé mi contraseña) no exige el checkbox", async () => {
    const dueno = await crearDueno()
    // Un token de "olvidé mi contraseña" real pasa por solicitarResetPassword,
    // que usa next/headers (sin contexto de request en un test) — acá se
    // crea el mismo tipo de fila directo, con esInvitacion en su default (false).
    const crypto = await import("crypto")
    const tokenPlano = "token-reset-" + Math.random()
    const tokenHash = crypto.createHash("sha256").update(tokenPlano).digest("hex")
    const token = await db.passwordResetToken.create({
      data: { userId: dueno.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    })
    expect(token.esInvitacion).toBe(false)

    const resultado = await resetearPassword(tokenPlano, "otraContraseña123")
    expect(resultado.ok).toBe(true)
  })
})

describe("RegistroEliminacion al eliminar Cliente/Proveedor", () => {
  it("eliminar un Cliente deja un snapshot en RegistroEliminacion", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    const cliente = await db.cliente.create({ data: { userId: dueno.id, nombre: "Pedro", apellido: "Pérez" } })

    await eliminarCliente(cliente.id)

    const registro = await db.registroEliminacion.findFirstOrThrow({ where: { userId: dueno.id, tipo: "CLIENTE" } })
    expect(registro.resumen).toContain("Pedro")
    expect(registro.resumen).toContain("Pérez")
  })

  it("eliminar un Proveedor deja un snapshot en RegistroEliminacion", async () => {
    const dueno = await crearDueno()
    comoDueno(dueno)
    const proveedor = await db.proveedor.create({ data: { userId: dueno.id, nombre: "Distribuidora Y" } })

    await eliminarProveedor(proveedor.id)

    const registro = await db.registroEliminacion.findFirstOrThrow({ where: { userId: dueno.id, tipo: "PROVEEDOR" } })
    expect(registro.resumen).toContain("Distribuidora Y")
  })
})
