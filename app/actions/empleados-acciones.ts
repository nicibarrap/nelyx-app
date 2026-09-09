"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

/** Solo el dueño puede administrar empleados — nunca un empleado, sin
 * importar qué módulos tenga habilitados. Esta restricción vive acá, no
 * solo en la pantalla, para que ninguna llamada directa la salte. */
async function getSessionDueno() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  if (session.user.esEmpleado) throw new Error("Solo el dueño de la cuenta puede administrar usuarios")
  return session
}

export async function obtenerEmpleados() {
  const session = await getSessionDueno()
  const empleados = await db.user.findMany({
    where: { cuentaPrincipalId: session.user.id },
    select: { id: true, nombre: true, activo: true, modulosPermitidos: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  return empleados
}

export async function crearEmpleado(nombre: string, pin: string, modulosPermitidos: string[]) {
  const session = await getSessionDueno()
  const nombreLimpio = nombre.trim()
  if (!nombreLimpio) throw new Error("El nombre es obligatorio")
  if (!/^\d{4}$/.test(pin)) throw new Error("El PIN debe ser de exactamente 4 números")

  const pinHash = await bcrypt.hash(pin, 10)
  // Email sintético — nunca se muestra ni se usa para enviar nada, solo
  // existe porque la tabla lo exige como único. El empleado nunca inicia
  // sesión con esto, siempre por PIN.
  const emailSintetico = `empleado-${crypto.randomUUID()}@nelyx.local`
  const passwordInutilizable = await bcrypt.hash(crypto.randomUUID(), 10)

  await db.user.create({
    data: {
      nombre: nombreLimpio, email: emailSintetico, password: passwordInutilizable,
      cuentaPrincipalId: session.user.id, pin: pinHash, modulosPermitidos,
      activo: true,
    },
  })
  revalidatePath("/dashboard/usuarios")
}

export async function actualizarEmpleado(empleadoId: string, cambios: { nombre?: string; modulosPermitidos?: string[]; pin?: string }) {
  const session = await getSessionDueno()
  const empleado = await db.user.findFirst({ where: { id: empleadoId, cuentaPrincipalId: session.user.id } })
  if (!empleado) throw new Error("Empleado no encontrado")

  const data: any = {}
  if (cambios.nombre !== undefined) {
    const nombreLimpio = cambios.nombre.trim()
    if (!nombreLimpio) throw new Error("El nombre es obligatorio")
    data.nombre = nombreLimpio
  }
  if (cambios.modulosPermitidos !== undefined) data.modulosPermitidos = cambios.modulosPermitidos
  if (cambios.pin !== undefined && cambios.pin !== "") {
    if (!/^\d{4}$/.test(cambios.pin)) throw new Error("El PIN debe ser de exactamente 4 números")
    data.pin = await bcrypt.hash(cambios.pin, 10)
  }

  await db.user.update({ where: { id: empleadoId }, data })
  revalidatePath("/dashboard/usuarios")
}

/** Nicolás desactiva a Danilo cuando ya no trabaja con él — no se borra su
 * historial ni nada de lo que hizo, simplemente deja de poder entrar. */
export async function toggleActivoEmpleado(empleadoId: string) {
  const session = await getSessionDueno()
  const empleado = await db.user.findFirst({ where: { id: empleadoId, cuentaPrincipalId: session.user.id } })
  if (!empleado) throw new Error("Empleado no encontrado")
  await db.user.update({ where: { id: empleadoId }, data: { activo: !empleado.activo } })
  revalidatePath("/dashboard/usuarios")
}

/**
 * Pública — sin sesión — usada por la pantalla de login para mostrar la
 * lista de "¿quién eres?" en un dispositivo ya emparejado con una cuenta.
 * Solo expone nombres, nunca nada sensible.
 */
export async function obtenerEmpleadosParaLogin(cuentaId: string) {
  const cuenta = await db.user.findFirst({ where: { id: cuentaId, activo: true, cuentaPrincipalId: null }, select: { nombre: true, negocio: true } })
  if (!cuenta) return null
  const empleados = await db.user.findMany({
    where: { cuentaPrincipalId: cuentaId, activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  })
  return { nombreDueno: cuenta.nombre, negocio: cuenta.negocio, empleados }
}
