import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { crearCostoRecurrente, editarCostoRecurrente } from "@/app/actions/acciones"

// Mismos stubs que en deudas.test.ts / movimiento-no-operativo.test.ts.
let sesionActual: { user: { id: string; esEmpleado: boolean; name: string } } | null = null
vi.mock("@/lib/auth", () => ({ auth: vi.fn(() => Promise.resolve(sesionActual)) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

async function crearUsuario() {
  const user = await db.user.create({
    data: { nombre: "Negocio de prueba", email: `user-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" },
  })
  sesionActual = { user: { id: user.id, esEmpleado: false, name: user.nombre } }
  return user
}

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

describe("editarCostoRecurrente", () => {
  it("actualiza nombre, categoría, monto, descripción y fechas", async () => {
    await crearUsuario()
    await crearCostoRecurrente(formData({
      nombre: "Arriendo viejo", categoria: "Arriendo", monto: "100000",
      fechaInicio: new Date(2026, 0, 5).toISOString(),
    }))
    const costo = await db.costoFijoRecurrente.findFirstOrThrow({ where: { userId: sesionActual!.user.id } })

    await editarCostoRecurrente(costo.id, formData({
      nombre: "Arriendo local nuevo", categoria: "Arriendo", monto: "150000",
      descripcion: "Local calle principal",
      fechaInicio: new Date(2026, 0, 10).toISOString(),
      fechaTermino: new Date(2026, 11, 10).toISOString(),
    }))

    const actualizado = await db.costoFijoRecurrente.findUniqueOrThrow({ where: { id: costo.id } })
    expect(actualizado.nombre).toBe("Arriendo local nuevo")
    expect(Number(actualizado.monto)).toBe(150000)
    expect(actualizado.descripcion).toBe("Local calle principal")
    expect(actualizado.fechaInicio.getDate()).toBe(10)
    expect(actualizado.fechaTermino?.getDate()).toBe(10)
  })

  it("rechaza fecha de término anterior a la fecha de inicio", async () => {
    await crearUsuario()
    await crearCostoRecurrente(formData({
      nombre: "Internet", monto: "20000", fechaInicio: new Date(2026, 0, 15).toISOString(),
    }))
    const costo = await db.costoFijoRecurrente.findFirstOrThrow({ where: { userId: sesionActual!.user.id } })

    await expect(editarCostoRecurrente(costo.id, formData({
      nombre: "Internet", monto: "20000",
      fechaInicio: new Date(2026, 5, 1).toISOString(),
      fechaTermino: new Date(2026, 0, 1).toISOString(),
    }))).rejects.toThrow(/no puede ser antes/)
  })

  it("rechaza monto inválido (cero o negativo)", async () => {
    await crearUsuario()
    await crearCostoRecurrente(formData({
      nombre: "Software", monto: "15000", fechaInicio: new Date(2026, 0, 1).toISOString(),
    }))
    const costo = await db.costoFijoRecurrente.findFirstOrThrow({ where: { userId: sesionActual!.user.id } })

    await expect(editarCostoRecurrente(costo.id, formData({
      nombre: "Software", monto: "0", fechaInicio: new Date(2026, 0, 1).toISOString(),
    }))).rejects.toThrow("Monto inválido")
  })

  it("un usuario no puede editar el costo fijo de otro (IDOR)", async () => {
    await crearUsuario()
    await crearCostoRecurrente(formData({
      nombre: "Arriendo", monto: "100000", fechaInicio: new Date(2026, 0, 1).toISOString(),
    }))
    const costoDeOtro = await db.costoFijoRecurrente.findFirstOrThrow({ where: { userId: sesionActual!.user.id } })

    // Cambia de sesión a un segundo usuario distinto.
    await crearUsuario()
    await expect(editarCostoRecurrente(costoDeOtro.id, formData({
      nombre: "Hackeado", monto: "1", fechaInicio: new Date(2026, 0, 1).toISOString(),
    }))).rejects.toThrow("Costo fijo no encontrado")

    const sinCambios = await db.costoFijoRecurrente.findUniqueOrThrow({ where: { id: costoDeOtro.id } })
    expect(sinCambios.nombre).toBe("Arriendo")
  })

  it("no afecta generaciones/movimientos ya creados de meses pasados", async () => {
    await crearUsuario()
    await crearCostoRecurrente(formData({
      nombre: "Sueldo", monto: "500000", fechaInicio: new Date(2026, 0, 1).toISOString(),
    }))
    const costo = await db.costoFijoRecurrente.findFirstOrThrow({ where: { userId: sesionActual!.user.id } })
    const generacion = await db.generacionCosto.create({ data: { costoFijoId: costo.id, mes: 1, anio: 2026, pagado: false } })

    await editarCostoRecurrente(costo.id, formData({
      nombre: "Sueldo (ajustado)", monto: "600000", fechaInicio: new Date(2026, 0, 15).toISOString(),
    }))

    const generacionSinTocar = await db.generacionCosto.findUniqueOrThrow({ where: { id: generacion.id } })
    expect(generacionSinTocar.mes).toBe(1)
    expect(generacionSinTocar.anio).toBe(2026)
    expect(generacionSinTocar.pagado).toBe(false)
  })
})
