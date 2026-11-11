import { describe, it, expect } from "vitest"
import { db } from "@/lib/db"
import { notificar } from "@/lib/notificaciones"

// Reproduce JAVASCRIPT-NEXTJS-G (Sentry): el cron procesa notificaciones en
// lotes paralelos (procesarEnLotes) y dos ítems del mismo usuario en el mismo
// lote podían disparar dos notificar() concurrentes — antes, configDe hacía
// findUnique+create y ambos pasaban el findUnique antes de que el primer
// create confirmara, rompiendo el @unique de NotificacionConfig.userId.
describe("notificar — configDe con llamadas concurrentes", () => {
  it("dos notificaciones en paralelo para un usuario sin NotificacionConfig no revientan por el unique de userId", async () => {
    const user = await db.user.create({ data: { nombre: "Dueño de prueba", email: `notif-${Math.random()}@nelyx.cl`, password: "x", rol: "USER" } })

    const [a, b] = await Promise.all([
      notificar({ userId: user.id, categoria: "deudas", prioridad: "alta", titulo: "A", mensaje: "msg", claveUnica: `test:${user.id}:a` }),
      notificar({ userId: user.id, categoria: "deudas", prioridad: "alta", titulo: "B", mensaje: "msg", claveUnica: `test:${user.id}:b` }),
    ])

    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(await db.notificacionConfig.count({ where: { userId: user.id } })).toBe(1)
  })
})
