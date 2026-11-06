import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { crearEventoCalendario, actualizarEventoCalendario, generarOcurrenciasPendientes } from "@/app/actions/acciones"

// Mismos stubs que costos-fijos.test.ts / deudas.test.ts.
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

function formData(campos: Record<string, string | string[]>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) {
    if (Array.isArray(v)) v.forEach(x => fd.append(k, x))
    else fd.set(k, v)
  }
  return fd
}

const fmtFecha = (d: Date) => d.toISOString().slice(0, 10)

describe("actualizarEventoCalendario — edición de repetición", () => {
  it("editar otro campo sin tocar la repetición solo desengancha esa ocurrencia", async () => {
    const user = await crearUsuario()
    // Viernes 6 de noviembre de 2026 — ancla de una serie semanal (solo viernes).
    await crearEventoCalendario(formData({
      titulo: "Reporte semanal", fecha: "2026-11-06", tipo: "tarea",
      frecuencia: "semanal", diasSemana: ["4"],
    }))
    const ocurrencias = await db.eventoCalendario.findMany({ where: { userId: user.id }, orderBy: { fecha: "asc" } })
    expect(ocurrencias.length).toBeGreaterThan(1)
    const serieId = ocurrencias[0].serieId!
    expect(serieId).toBeTruthy()

    const primera = ocurrencias[0]
    await actualizarEventoCalendario(primera.id, formData({
      titulo: "Reporte semanal (ajustado)", fecha: fmtFecha(primera.fecha), tipo: "tarea",
      frecuencia: "semanal", diasSemana: ["4"], // misma regla que ya tenía la serie
    }))

    const editada = await db.eventoCalendario.findUniqueOrThrow({ where: { id: primera.id } })
    expect(editada.titulo).toBe("Reporte semanal (ajustado)")
    expect(editada.serieId).toBeNull()

    // El resto de la serie sigue intacta — ninguna otra ocurrencia cambió.
    const resto = await db.eventoCalendario.findMany({ where: { serieId } })
    expect(resto.length).toBe(ocurrencias.length - 1)
  })

  it("quitar la repetición detiene la serie y borra las ocurrencias futuras pendientes", async () => {
    const user = await crearUsuario()
    await crearEventoCalendario(formData({
      titulo: "Backup", fecha: "2026-11-02", tipo: "tarea", frecuencia: "diaria",
    }))
    const antes = await db.eventoCalendario.findMany({ where: { userId: user.id }, orderBy: { fecha: "asc" } })
    expect(antes.length).toBeGreaterThan(5)
    const serieId = antes[0].serieId!
    const tercera = antes[2]

    await actualizarEventoCalendario(tercera.id, formData({
      titulo: tercera.titulo, fecha: fmtFecha(tercera.fecha), tipo: "tarea",
      frecuencia: "ninguna",
    }))

    const serie = await db.serieRecurrente.findUniqueOrThrow({ where: { id: serieId } })
    expect(fmtFecha(serie.fechaFin!)).toBe(fmtFecha(tercera.fecha))

    const editada = await db.eventoCalendario.findUniqueOrThrow({ where: { id: tercera.id } })
    expect(editada.serieId).toBeNull()

    // Nada pendiente de la serie queda con fecha posterior a la ocurrencia editada.
    const futurasPendientes = await db.eventoCalendario.findMany({
      where: { serieId, estado: "pendiente", fecha: { gt: tercera.fecha } },
    })
    expect(futurasPendientes).toHaveLength(0)

    // Las anteriores a la editada (pasado de la serie) no se tocan.
    const anteriores = await db.eventoCalendario.findMany({ where: { serieId, fecha: { lt: tercera.fecha } } })
    expect(anteriores.length).toBe(2)
  })

  it("cambiar la regla de repetición actualiza la serie y limpia las ocurrencias futuras con la regla vieja", async () => {
    const user = await crearUsuario()
    await crearEventoCalendario(formData({
      titulo: "Riego", fecha: "2026-11-02", tipo: "tarea", frecuencia: "diaria",
    }))
    const antes = await db.eventoCalendario.findMany({ where: { userId: user.id }, orderBy: { fecha: "asc" } })
    const serieId = antes[0].serieId!
    const segunda = antes[1]

    await actualizarEventoCalendario(segunda.id, formData({
      titulo: segunda.titulo, fecha: fmtFecha(segunda.fecha), tipo: "tarea",
      frecuencia: "semanal", diasSemana: ["4"], // de diaria a solo viernes
    }))

    const serie = await db.serieRecurrente.findUniqueOrThrow({ where: { id: serieId } })
    expect(serie.frecuencia).toBe("semanal")
    expect(serie.diasSemana).toEqual([4])

    // La ocurrencia editada se queda enganchada a la (misma) serie, ahora con la regla nueva.
    const editada = await db.eventoCalendario.findUniqueOrThrow({ where: { id: segunda.id } })
    expect(editada.serieId).toBe(serieId)

    // No debe quedar ninguna ocurrencia futura calculada bajo la regla diaria vieja.
    const futurasViejas = await db.eventoCalendario.findMany({ where: { serieId, fecha: { gt: segunda.fecha } } })
    expect(futurasViejas).toHaveLength(0)

    // Al volver a abrir el Calendario (generarOcurrenciasPendientes, mismo
    // mecanismo perezoso que al crear) se regeneran bajo la regla nueva.
    await generarOcurrenciasPendientes()
    const futurasNuevas = await db.eventoCalendario.findMany({ where: { serieId, fecha: { gt: segunda.fecha } } })
    expect(futurasNuevas.length).toBeGreaterThan(0)
    for (const f of futurasNuevas) expect(f.fecha.getUTCDay()).toBe(5) // viernes
  })

  it("agregar repetición a una tarea que no la tenía crea una serie nueva", async () => {
    const user = await crearUsuario()
    await crearEventoCalendario(formData({ titulo: "Pago único", fecha: "2026-11-10", tipo: "tarea", frecuencia: "ninguna" }))
    const evento = await db.eventoCalendario.findFirstOrThrow({ where: { userId: user.id } })
    expect(evento.serieId).toBeNull()

    await actualizarEventoCalendario(evento.id, formData({
      titulo: "Pago único", fecha: "2026-11-10", tipo: "tarea",
      frecuencia: "mensual",
    }))

    const actualizado = await db.eventoCalendario.findUniqueOrThrow({ where: { id: evento.id } })
    expect(actualizado.serieId).not.toBeNull()
    const serie = await db.serieRecurrente.findUniqueOrThrow({ where: { id: actualizado.serieId! } })
    expect(serie.frecuencia).toBe("mensual")
  })
})

describe("prioridad opcional en EventoCalendario", () => {
  it("se puede crear y editar un evento sin prioridad asignada", async () => {
    await crearUsuario()
    await crearEventoCalendario(formData({ titulo: "Llamar proveedor", fecha: "2026-11-06", tipo: "recordatorio" }))
    const ev = await db.eventoCalendario.findFirstOrThrow({})
    expect(ev.prioridad).toBeNull()

    await actualizarEventoCalendario(ev.id, formData({ titulo: ev.titulo, fecha: "2026-11-07", tipo: "recordatorio", prioridad: "alta" }))
    expect((await db.eventoCalendario.findUniqueOrThrow({ where: { id: ev.id } })).prioridad).toBe("alta")

    await actualizarEventoCalendario(ev.id, formData({ titulo: ev.titulo, fecha: "2026-11-07", tipo: "recordatorio", prioridad: "" }))
    expect((await db.eventoCalendario.findUniqueOrThrow({ where: { id: ev.id } })).prioridad).toBeNull()
  })
})
