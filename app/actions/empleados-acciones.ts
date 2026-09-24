"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { notificar } from "@/lib/notificaciones"

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

/** Qué hizo cada empleado — usa Movimiento.realizadoPorNombre, que ya se
 * guarda como texto plano (no una relación) precisamente para que este
 * historial siga existiendo aunque el empleado se elimine después. */
export async function obtenerActividadEmpleados(dias: number = 30) {
  const session = await getSessionDueno()
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  const movimientos = await db.movimiento.findMany({
    where: { userId: session.user.id, realizadoPorNombre: { not: null }, fecha: { gte: desde } },
    select: { id: true, tipo: true, monto: true, fecha: true, descripcion: true, categoria: true, realizadoPorNombre: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return movimientos.map(m => ({ ...m, monto: Number(m.monto), fecha: m.fecha.toISOString(), createdAt: m.createdAt.toISOString() }))
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
 * Pública — sin sesión — se consulta después de un intento fallido para
 * saber si fue "PIN incorrecto" o "ya estás bloqueado por varios
 * intentos", ya que NextAuth nunca deja pasar el mensaje exacto de un
 * error de autorización hasta el cliente.
 */
export async function verificarBloqueoPin(empleadoId: string) {
  const empleado = await db.user.findUnique({ where: { id: empleadoId }, select: { nombre: true, cuentaPrincipalId: true, bloqueadoHastaPin: true } })
  if (!empleado?.bloqueadoHastaPin || empleado.bloqueadoHastaPin <= new Date()) {
    return { bloqueado: false, minutosRestantes: 0 }
  }
  const minutosRestantes = Math.ceil((empleado.bloqueadoHastaPin.getTime() - Date.now()) / 60000)
  // Avisa al dueño — 5 PIN incorrectos seguidos puede ser un empleado que
  // olvidó su PIN, o alguien intentando adivinarlo. claveUnica está atada
  // al momento exacto del bloqueo (bloqueadoHastaPin no cambia mientras
  // sigue bloqueado), así que reintentos repetidos durante esos 15
  // minutos no generan avisos duplicados — notificar() ya lo deduplica.
  if (empleado.cuentaPrincipalId) {
    await notificar({
      userId: empleado.cuentaPrincipalId, categoria: "alertasGenerales", prioridad: "alta",
      titulo: `PIN bloqueado: ${empleado.nombre}`,
      mensaje: "5 intentos de PIN incorrectos seguidos — el acceso queda bloqueado 15 minutos.",
      accionUrl: "/dashboard/usuarios",
      claveUnica: `pin-bloqueo:${empleadoId}:${empleado.bloqueadoHastaPin.getTime()}`,
    }).catch(() => {})
  }
  return { bloqueado: true, minutosRestantes }
}

/**
 * Mismo propósito que verificarBloqueoPin, pero para el login principal
 * (dueño, por email+contraseña) — se consulta después de un intento
 * fallido para distinguir entre tres casos que hoy dan el mismo mensaje
 * genérico "email o contraseña incorrectos": la cuenta está bloqueada por
 * varios intentos fallidos, el correo no existe, o simplemente la
 * contraseña está mal.
 */
export async function verificarBloqueoLogin(email: string) {
  const emailEscrito = email.trim()
  // Mismo criterio "insensitive" que usa el login real (lib/auth.ts) —
  // si acá se buscara distinto, este chequeo podría decir "no existe"
  // para una cuenta que el login sí reconoce, o viceversa.
  const user = await db.user.findFirst({ where: { email: { equals: emailEscrito, mode: "insensitive" } }, select: { bloqueadoHastaPin: true } })
  if (!user) return { registrado: false, bloqueado: false, minutosRestantes: 0 }
  if (!user.bloqueadoHastaPin || user.bloqueadoHastaPin <= new Date()) {
    return { registrado: true, bloqueado: false, minutosRestantes: 0 }
  }
  const minutosRestantes = Math.ceil((user.bloqueadoHastaPin.getTime() - Date.now()) / 60000)
  return { registrado: true, bloqueado: true, minutosRestantes }
}

/**
 * Basado en la sesión activa (no en una cookie de dispositivo) — se usa
 * tanto justo después de que el dueño inicia sesión, como desde "Cambiar
 * de usuario" dentro del dashboard. Requiere sesión válida.
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
