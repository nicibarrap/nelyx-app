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

/**
 * Pública — sin sesión — se consulta después de un intento fallido para
 * saber si fue "PIN incorrecto" o "ya estás bloqueado por varios
 * intentos", ya que NextAuth nunca deja pasar el mensaje exacto de un
 * error de autorización hasta el cliente.
 */
export async function verificarBloqueoPin(empleadoId: string) {
  const empleado = await db.user.findUnique({ where: { id: empleadoId }, select: { bloqueadoHastaPin: true } })
  if (!empleado?.bloqueadoHastaPin || empleado.bloqueadoHastaPin <= new Date()) {
    return { bloqueado: false, minutosRestantes: 0 }
  }
  const minutosRestantes = Math.ceil((empleado.bloqueadoHastaPin.getTime() - Date.now()) / 60000)
  return { bloqueado: true, minutosRestantes }
}

/**
 * Basado en la sesión activa (no en una cookie de dispositivo) — se usa
 * tanto justo después de que el dueño inicia sesión, como desde "Cambiar
 * de usuario" dentro del dashboard. Requiere sesión válida — a diferencia
 * de obtenerEmpleadosParaLogin, que es pública porque se usa antes de
 * autenticarse.
 */
export async function obtenerEmpleadosDeMiCuenta() {
  const session = await auth()
  if (!session?.user?.id) return null
  // session.user.id siempre es la cuenta (dueño), sea quien sea quien
  // esté actuando ahora mismo — así funciona igual estés como dueño o
  // como un empleado viendo el selector para cambiar de nuevo.
  const cuenta = await db.user.findUnique({ where: { id: session.user.id }, select: { nombre: true, negocio: true, email: true } })
  if (!cuenta) return null
  const empleados = await db.user.findMany({
    where: { cuentaPrincipalId: session.user.id, activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  })
  return { cuentaId: session.user.id, nombreDueno: cuenta.nombre, negocio: cuenta.negocio, emailDueno: cuenta.email, empleados }
}
