"use server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import * as XLSX from "xlsx"
import { verificarCuentaActivaOExpulsar } from "@/lib/sesion-activa"

async function getSessionDueno() {
  const session = await auth()
  if (!session?.user?.id) throw new Error("No autorizado")
  await verificarCuentaActivaOExpulsar(session)
  // Ni un empleado ni la cuenta de soporte (ADMIN) tienen una cuenta
  // "propia" en este sentido — eliminar o exportar todo es una acción
  // exclusiva del dueño sobre sus propios datos.
  if (session.user.role !== "USER" || session.user.esEmpleado) throw new Error("Solo el dueño de la cuenta puede hacer esto.")
  return session
}

/** Elimina la cuenta del dueño y TODO lo asociado a ella — el schema ya
 * tiene onDelete: Cascade en cada relación con User (empleados incluidos),
 * así que un solo delete basta. Requiere reescribir el email de la cuenta
 * como confirmación — no hay vuelta atrás posible. */
export async function eliminarMiCuenta(emailConfirmacion: string): Promise<{ error: string } | undefined> {
  const session = await getSessionDueno()
  if (emailConfirmacion.trim().toLowerCase() !== session.user.email?.toLowerCase()) {
    return { error: "El email no coincide con el de tu cuenta." }
  }
  await db.user.delete({ where: { id: session.user.id } })
}

function hojaDesde(filas: Record<string, unknown>[], anchos: number[]) {
  const ws = XLSX.utils.json_to_sheet(filas)
  ws["!cols"] = anchos.map(wch => ({ wch }))
  return ws
}

/** Arma un .xlsx con todo lo identificable de la cuenta del dueño — una
 * hoja por categoría de dato. No incluye costo/utilidad (igual que el
 * export de Movimientos — ver exportar-movimientos-boton.tsx): este
 * archivo es para que el titular vea y se lleve SUS datos personales, no
 * una herramienta de análisis de negocio. */
export async function exportarMisDatos(): Promise<{ base64: string; filename: string }> {
  const session = await getSessionDueno()
  const userId = session.user.id

  const [user, empleados, clientes, proveedores] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { nombre: true, email: true, telefono: true, negocio: true, createdAt: true, consentimientoAceptadoAt: true } }),
    db.user.findMany({ where: { cuentaPrincipalId: userId }, select: { nombre: true, createdAt: true, modulosPermitidos: true, activo: true } }),
    db.cliente.findMany({ where: { userId }, select: { nombre: true, apellido: true, empresa: true, telefono: true, email: true, direccion: true, ciudad: true, cumpleanos: true, createdAt: true } }),
    db.proveedor.findMany({ where: { userId }, select: { nombre: true, empresa: true, rut: true, telefono: true, email: true, direccion: true, ciudad: true, createdAt: true } }),
  ])
  if (!user) throw new Error("Cuenta no encontrada")

  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, hojaDesde([{
    Nombre: user.nombre, Email: user.email, Teléfono: user.telefono ?? "", Negocio: user.negocio ?? "",
    "Cuenta creada": user.createdAt.toLocaleDateString("es-CL"),
    "Política de Privacidad aceptada": user.consentimientoAceptadoAt ? user.consentimientoAceptadoAt.toLocaleDateString("es-CL") : "Antes de este registro",
  }], [20, 28, 16, 24, 18, 28]), "Mi cuenta")

  XLSX.utils.book_append_sheet(wb, hojaDesde(empleados.map(e => ({
    Nombre: e.nombre, Activo: e.activo ? "Sí" : "No", "Módulos habilitados": e.modulosPermitidos.join(", "), "Creado el": e.createdAt.toLocaleDateString("es-CL"),
  })), [24, 10, 40, 16]), "Empleados")

  XLSX.utils.book_append_sheet(wb, hojaDesde(clientes.map(c => ({
    Nombre: c.nombre, Apellido: c.apellido ?? "", Empresa: c.empresa ?? "", Teléfono: c.telefono ?? "", Email: c.email ?? "",
    Dirección: c.direccion ?? "", Ciudad: c.ciudad ?? "", Cumpleaños: c.cumpleanos ? c.cumpleanos.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "",
    "Creado el": c.createdAt.toLocaleDateString("es-CL"),
  })), [20, 20, 20, 16, 24, 28, 16, 12, 16]), "Clientes")

  XLSX.utils.book_append_sheet(wb, hojaDesde(proveedores.map(p => ({
    Nombre: p.nombre, Empresa: p.empresa ?? "", RUT: p.rut ?? "", Teléfono: p.telefono ?? "", Email: p.email ?? "",
    Dirección: p.direccion ?? "", Ciudad: p.ciudad ?? "", "Creado el": p.createdAt.toLocaleDateString("es-CL"),
  })), [20, 20, 14, 16, 24, 28, 16, 16]), "Proveedores")

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return { base64: buffer.toString("base64"), filename: `mis-datos-nelyx-${new Date().toISOString().slice(0, 10)}.xlsx` }
}
