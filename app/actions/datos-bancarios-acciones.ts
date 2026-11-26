"use server"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

// Fila única — nunca hay más de una. No hace falta una tabla de config
// genérica para esto: Nelyx tiene UNA cuenta bancaria, no una por negocio.
async function obtenerOCrearFila() {
  const existente = await db.datosBancariosNelyx.findFirst()
  if (existente) return existente
  return db.datosBancariosNelyx.create({ data: {} })
}

export type DatosBancariosDTO = {
  banco: string; tipoCuenta: string; numeroCuenta: string; rutTitular: string; nombreTitular: string; email: string
}

function serializar(d: Awaited<ReturnType<typeof obtenerOCrearFila>>): DatosBancariosDTO {
  return { banco: d.banco, tipoCuenta: d.tipoCuenta, numeroCuenta: d.numeroCuenta, rutTitular: d.rutTitular, nombreTitular: d.nombreTitular, email: d.email }
}

// Cualquier usuario autenticado puede leerlos — el cliente los necesita
// para hacer la transferencia, el admin para editarlos. No hay nada
// sensible que un dueño de cuenta no debiera ver (es la cuenta de Nelyx,
// no la de otro cliente).
export async function obtenerDatosBancarios(): Promise<DatosBancariosDTO> {
  const session = await auth()
  if (!session) throw new Error("No autorizado")
  return serializar(await obtenerOCrearFila())
}

export async function actualizarDatosBancarios(formData: FormData): Promise<{ error: string } | undefined> {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN" || session.user.esEmpleado) return { error: "No autorizado" }

  const fila = await obtenerOCrearFila()
  await db.datosBancariosNelyx.update({
    where: { id: fila.id },
    data: {
      banco: ((formData.get("banco") as string) ?? "").trim(),
      tipoCuenta: ((formData.get("tipoCuenta") as string) ?? "").trim(),
      numeroCuenta: ((formData.get("numeroCuenta") as string) ?? "").trim(),
      rutTitular: ((formData.get("rutTitular") as string) ?? "").trim(),
      nombreTitular: ((formData.get("nombreTitular") as string) ?? "").trim(),
      email: ((formData.get("email") as string) ?? "").trim(),
    },
  })
  revalidatePath("/admin/clientes")
  revalidatePath("/dashboard/configuracion")
}
