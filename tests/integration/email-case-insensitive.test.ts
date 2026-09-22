import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { verificarBloqueoLogin } from "@/app/actions/empleados-acciones"

// empleados-acciones.ts importa "@/lib/auth" (NextAuth) aunque
// verificarBloqueoLogin no lo use — y NextAuth trae módulos de Next.js
// (next/server) que solo existen bajo el bundler de Next, no en un test
// de Node plano. Se reemplaza por un stub mínimo. vi.mock se "hoistea"
// automáticamente antes que el import de arriba, así que esto alcanza
// sin necesitar un import dinámico.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))

// Regresión directa del incidente del 22/09: una cuenta guardada con
// mayúsculas dejó de encontrarse porque el login forzaba el correo
// escrito a minúsculas antes de buscarlo. Este test recrea exactamente
// ese escenario contra la base de datos real.
describe("Login: búsqueda de cuenta sin distinguir mayúsculas/minúsculas", () => {
  it("encuentra la cuenta aunque el email guardado tenga mayúsculas y se escriba distinto", async () => {
    const hash = await bcrypt.hash("clave-segura-123", 10)
    await db.user.create({
      data: { nombre: "Admin de prueba", email: "Nic.Ibarrap@Gmail.com", password: hash, rol: "ADMIN" },
    })

    // La persona escribe el correo todo en minúsculas, distinto a como quedó guardado.
    const resultado = await verificarBloqueoLogin("nic.ibarrap@gmail.com")
    expect(resultado.registrado).toBe(true)
  })

  it("encuentra la cuenta si se escribe con espacios de más alrededor", async () => {
    const hash = await bcrypt.hash("clave-segura-123", 10)
    await db.user.create({
      data: { nombre: "Admin de prueba", email: "cuenta@nelyx.cl", password: hash, rol: "USER" },
    })

    const resultado = await verificarBloqueoLogin("  CUENTA@nelyx.cl  ")
    expect(resultado.registrado).toBe(true)
  })

  it("dice que no está registrado un correo que de verdad no existe", async () => {
    const resultado = await verificarBloqueoLogin("nadie@nelyx.cl")
    expect(resultado).toEqual({ registrado: false, bloqueado: false, minutosRestantes: 0 })
  })

  it("reporta bloqueada una cuenta con bloqueadoHastaPin en el futuro", async () => {
    const hash = await bcrypt.hash("clave", 10)
    await db.user.create({
      data: {
        nombre: "Bloqueado", email: "bloqueado@nelyx.cl", password: hash, rol: "USER",
        bloqueadoHastaPin: new Date(Date.now() + 10 * 60 * 1000),
      },
    })

    const resultado = await verificarBloqueoLogin("bloqueado@nelyx.cl")
    expect(resultado.registrado).toBe(true)
    expect(resultado.bloqueado).toBe(true)
    expect(resultado.minutosRestantes).toBeGreaterThan(0)
    expect(resultado.minutosRestantes).toBeLessThanOrEqual(10)
  })
})
