import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

// Red de seguridad contra la clase de bug más repetida en toda esta
// auditoría (Calendario, Configuración): una función exportada que escribe
// en la base de datos se olvida de llamar getSessionEscritura(moduloKey),
// así que un empleado con ese módulo en modo solo lectura puede igual
// mutar datos. Este test recorre, por texto, cada función de los archivos
// que usan el patrón getSessionEscritura (por módulo) y falla si alguna
// escribe sin pasar por ahí — salvo que esté en EXCEPCIONES, documentada.
//
// Alcance a propósito: NO incluye admin-acciones.ts, soporte-acciones.ts,
// empleados-acciones.ts ni notificaciones-acciones.ts — esos usan modelos
// de autorización distintos (ADMIN de plataforma, dueño de la cuenta,
// preferencia personal), donde getSessionEscritura ni correspondería.

const ARCHIVOS = [
  "app/actions/acciones.ts",
  "app/actions/pagos-acciones.ts",
  "app/actions/cobranza-acciones.ts",
  "app/actions/automatizaciones-acciones.ts",
  "app/actions/kardex-acciones.ts",
]

// Funciones que SÍ escriben en la base de datos pero a propósito no exigen
// getSessionEscritura — cada una ya documentada con su motivo en el código
// fuente mismo (buscar su nombre ahí). Si agregas una función nueva a la
// lista de abajo sin ese comentario en el código, este test no te lo va a
// recordar — hazlo de todas formas.
const EXCEPCIONES: Record<string, string[]> = {
  "acciones.ts": [
    "generarCostosDelMes", // job perezoso; valida userId===session.user.id a mano, no permiso de escritura
    "generarOcurrenciasPendientes", // mismo patrón, para las series recurrentes del Calendario
    "crearCategoriaPersonalizada", // también se usa desde Productos/Movimientos/Costos Fijos, ya gateados
  ],
}

const PATRON_ESCRITURA = /\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/
const PATRON_GATE = /getSessionEscritura\s*\(/

function extraerFunciones(codigo: string): { nombre: string; cuerpo: string; exportada: boolean }[] {
  const funciones: { nombre: string; cuerpo: string; exportada: boolean }[] = []
  const regexInicio = /(export\s+)?async function\s+(\w+)\s*\([^)]*\)[^{]*\{/g
  let match: RegExpExecArray | null
  while ((match = regexInicio.exec(codigo))) {
    const exportada = !!match[1]
    const nombre = match[2]
    const inicioLlave = match.index + match[0].length - 1
    let profundidad = 1
    let i = inicioLlave + 1
    while (i < codigo.length && profundidad > 0) {
      if (codigo[i] === "{") profundidad++
      else if (codigo[i] === "}") profundidad--
      i++
    }
    funciones.push({ nombre, cuerpo: codigo.slice(inicioLlave, i), exportada })
  }
  return funciones
}

describe("Toda función que escribe en archivos con getSessionEscritura(moduloKey) la exige", () => {
  for (const archivoRel of ARCHIVOS) {
    const archivo = path.basename(archivoRel)
    it(archivo, () => {
      const codigo = fs.readFileSync(path.join(process.cwd(), archivoRel), "utf-8")
      const funciones = extraerFunciones(codigo)
      const porNombre = new Map(funciones.map(f => [f.nombre, f.cuerpo]))
      const excepciones = new Set(EXCEPCIONES[archivo] ?? [])

      const violaciones: string[] = []
      // Solo se exigen las EXPORTADAS: son las únicas que "use server"
      // expone como Server Action invocable directo por un cliente. Un
      // helper interno (ej. crearCuentaPorCobrarConNumero) solo se alcanza
      // a través de una función exportada que ya pasó su propio gate antes
      // de llamarlo — no necesita el suyo.
      for (const { nombre, cuerpo, exportada } of funciones) {
        if (!exportada || excepciones.has(nombre)) continue

        // Expande un nivel: el patrón envoltorio -> *Interno (ej.
        // ingresarMovimiento -> ingresarMovimientoInterno) hace que el
        // gate real viva en la función llamada, no en la envoltura.
        let cuerpoExpandido = cuerpo
        for (const [otroNombre, otroCuerpo] of porNombre) {
          if (otroNombre !== nombre && new RegExp(`\\b${otroNombre}\\s*\\(`).test(cuerpo)) {
            cuerpoExpandido += otroCuerpo
          }
        }

        if (PATRON_ESCRITURA.test(cuerpoExpandido) && !PATRON_GATE.test(cuerpoExpandido)) {
          violaciones.push(nombre)
        }
      }

      expect(
        violaciones,
        `Estas funciones de ${archivo} escriben en la base de datos sin pasar por getSessionEscritura: ${violaciones.join(", ")}. ` +
          `Si de verdad es a propósito, documenta el motivo en el código junto a la función y agrégala a EXCEPCIONES en este test.`
      ).toEqual([])
    })
  }
})
