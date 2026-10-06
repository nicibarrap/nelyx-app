import { describe, it, expect } from "vitest"
import { tieneAcceso, esSoloLectura, claveSoloLectura, moduloDeRuta } from "@/lib/permisos"

// Estas funciones son la base de todo el control de acceso multi-usuario —
// cada bug de "permiso faltante" encontrado en las auditorías (Deudas,
// Cuentas por Cobrar, Venta, Movimientos, Costos Fijos, Alertas) era un
// server action que no las llamaba. Que ellas mismas estén bien probadas
// es la última línea de defensa.

describe("tieneAcceso", () => {
  it("null/undefined = acceso total (dueño, o empleado con todo habilitado)", () => {
    expect(tieneAcceso(null, "ventas")).toBe(true)
    expect(tieneAcceso(undefined, "ventas")).toBe(true)
  })

  it("un empleado sin nada marcado no ve nada, ni con arreglo vacío", () => {
    expect(tieneAcceso([], "ventas")).toBe(false)
  })

  it("el módulo explícito en la lista da acceso", () => {
    expect(tieneAcceso(["ventas", "productos"], "ventas")).toBe(true)
  })

  it("un módulo no incluido en la lista no da acceso", () => {
    expect(tieneAcceso(["productos"], "ventas")).toBe(false)
  })

  it("la variante de solo lectura (':ro') también cuenta como acceso al módulo", () => {
    expect(tieneAcceso(["ventas:ro"], "ventas")).toBe(true)
  })
})

describe("esSoloLectura", () => {
  it("el dueño (modulosPermitidos null) nunca es de solo lectura", () => {
    expect(esSoloLectura(null, "ventas")).toBe(false)
    expect(esSoloLectura(undefined, "ventas")).toBe(false)
  })

  it("un módulo marcado ':ro' es de solo lectura", () => {
    expect(esSoloLectura(["ventas:ro"], "ventas")).toBe(true)
  })

  it("un módulo con acceso completo (sin ':ro') no es de solo lectura", () => {
    expect(esSoloLectura(["ventas"], "ventas")).toBe(false)
  })

  it("un módulo fuera de la lista no es 'de solo lectura' (es simplemente sin acceso)", () => {
    expect(esSoloLectura(["productos"], "ventas")).toBe(false)
  })
})

describe("claveSoloLectura", () => {
  it("agrega el sufijo ':ro' al módulo", () => {
    expect(claveSoloLectura("ventas")).toBe("ventas:ro")
  })
})

describe("moduloDeRuta", () => {
  it("extrae el módulo del primer segmento después de /dashboard/", () => {
    expect(moduloDeRuta("/dashboard/productos/reponer")).toBe("productos")
    expect(moduloDeRuta("/dashboard/alertas")).toBe("alertas")
  })

  it("una ruta fuera de la lista de módulos conocidos no se bloquea (null)", () => {
    expect(moduloDeRuta("/dashboard/algo-que-no-existe")).toBeNull()
  })

  it("la raíz /dashboard (sin módulo) no se bloquea", () => {
    expect(moduloDeRuta("/dashboard")).toBeNull()
  })

  it("una ruta fuera de /dashboard no matchea nada", () => {
    expect(moduloDeRuta("/login")).toBeNull()
  })
})
