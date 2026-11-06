import { describe, it, expect, vi } from "vitest"
import { db } from "@/lib/db"
import { crearProducto, actualizarProducto, importarProductosMasivo, toggleProducto } from "@/app/actions/acciones"

// Mismos stubs que costos-fijos.test.ts / calendario-repeticion.test.ts.
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

describe("crearProducto — nombre duplicado", () => {
  it("no deja crear dos productos activos con el mismo nombre (insensible a mayúsculas)", async () => {
    const user = await crearUsuario()
    await crearProducto(formData({ nombre: "Mani", precio: "1000", costo: "500" }))

    await expect(crearProducto(formData({ nombre: "MANI", precio: "1200", costo: "600" })))
      .rejects.toThrow(/ya tienes un producto llamado/i)

    const productos = await db.producto.findMany({ where: { userId: user.id } })
    expect(productos).toHaveLength(1)
  })

  it("sí deja reusar el nombre de un producto que ya se desactivó", async () => {
    await crearUsuario()
    await crearProducto(formData({ nombre: "Mani", precio: "1000", costo: "500" }))
    const original = await db.producto.findFirstOrThrow({ where: { nombre: "Mani" } })
    await toggleProducto(original.id, false) // lo desactiva

    await expect(crearProducto(formData({ nombre: "Mani", precio: "1100", costo: "550" }))).resolves.toBeUndefined()
    const activos = await db.producto.findMany({ where: { userId: original.userId, activo: true } })
    expect(activos).toHaveLength(1)
  })
})

describe("actualizarProducto — nombre duplicado", () => {
  it("no deja renombrar un producto para que choque con otro ya activo", async () => {
    await crearUsuario()
    await crearProducto(formData({ nombre: "Mani", precio: "1000", costo: "500" }))
    await crearProducto(formData({ nombre: "Galleta", precio: "800", costo: "400" }))
    const galleta = await db.producto.findFirstOrThrow({ where: { nombre: "Galleta" } })

    await expect(actualizarProducto(galleta.id, formData({ nombre: "mani", precio: "800", costo: "400" })))
      .rejects.toThrow(/ya tienes un producto llamado/i)
  })

  it("deja guardar un producto sin tocarle el nombre (no choca consigo mismo)", async () => {
    await crearUsuario()
    await crearProducto(formData({ nombre: "Mani", precio: "1000", costo: "500" }))
    const mani = await db.producto.findFirstOrThrow({ where: { nombre: "Mani" } })

    await expect(actualizarProducto(mani.id, formData({ nombre: "Mani", precio: "1200", costo: "500" }))).resolves.toBeUndefined()
    const actualizado = await db.producto.findUniqueOrThrow({ where: { id: mani.id } })
    expect(Number(actualizado.precio)).toBe(1200)
  })
})

describe("importarProductosMasivo — nombre duplicado", () => {
  it("salta las filas que chocan con un producto activo existente o repiten nombre dentro del mismo archivo", async () => {
    const user = await crearUsuario()
    await crearProducto(formData({ nombre: "Mani", precio: "1000", costo: "500" }))

    const resultado = await importarProductosMasivo([
      { nombre: "Mani", categoria: null, sku: null, codigoBarras: null, precio: 900, costo: 400, formaVenta: "unidad", stock: 0, stockMinimo: 0, descripcion: null },
      { nombre: "Galleta", categoria: null, sku: null, codigoBarras: null, precio: 800, costo: 300, formaVenta: "unidad", stock: 0, stockMinimo: 0, descripcion: null },
      { nombre: "galleta", categoria: null, sku: null, codigoBarras: null, precio: 850, costo: 300, formaVenta: "unidad", stock: 0, stockMinimo: 0, descripcion: null },
    ])

    expect(resultado.exitosos).toBe(1)
    expect(resultado.errores).toHaveLength(2)
    expect(resultado.errores.some(e => e.includes("Mani"))).toBe(true)
    expect(resultado.errores.some(e => e.includes("galleta"))).toBe(true)

    const productos = await db.producto.findMany({ where: { userId: user.id } })
    expect(productos.map(p => p.nombre).sort()).toEqual(["Galleta", "Mani"])
  })
})
