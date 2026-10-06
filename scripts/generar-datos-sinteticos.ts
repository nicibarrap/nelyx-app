import { PrismaClient, TipoMovimiento } from "@prisma/client"
import bcrypt from "bcryptjs"

/**
 * Genera datos sintéticos de VOLUMEN REAL (miles de movimientos, cientos de
 * clientes/cuentas) para probar que listados, reportes y dashboards se
 * comportan bien con datos de verdad — no los 5-10 registros de prueba con
 * los que normalmente se desarrolla, donde un LIMIT faltante o una query
 * O(n²) no se nota.
 *
 * Todo queda bajo UNA cuenta dedicada (nunca mezclado con una cuenta real
 * existente), para poder borrarlo entero con limpiar-datos-sinteticos.ts.
 *
 * Seguridad: antes de escribir, imprime a qué base de datos (host) se va a
 * conectar. Si no es localhost, exige la bandera --si-produccion para
 * evitar escribir miles de filas por error en una base que no era la
 * intención (ej. quedó seteada una DATABASE_URL de Supabase en el shell).
 */

const SYNTH_EMAIL = "datos-sinteticos@nelyx.internal"
const SYNTH_PASSWORD_PLAIN = "no-se-usa-para-login-" + Math.random().toString(36).slice(2)

const N_PRODUCTOS = 60
const N_CLIENTES = 120
const N_PROVEEDORES = 12
const N_MOVIMIENTOS = 4000
const MESES_HISTORIA = 14
const N_DEUDAS = 25
const N_COSTOS_FIJOS = 8
const N_CUENTAS_COBRAR = 150

const CATEGORIAS_PRODUCTO = ["Abarrotes", "Bebidas", "Limpieza", "Snacks", "Lácteos", "Panadería", "Cuidado personal"]
const NOMBRES = ["María", "José", "Ana", "Carlos", "Luisa", "Pedro", "Camila", "Diego", "Valentina", "Francisco", "Sofía", "Matías", "Javiera", "Andrés", "Catalina"]
const APELLIDOS = ["González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda"]
const CATEGORIAS_GASTO = ["Arriendo", "Luz", "Agua", "Internet", "Transporte", "Insumos", "Marketing", "Mantención"]

function elegir<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function entero(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function fechaAleatoriaUltimosMeses(meses: number): Date {
  const hoy = new Date()
  const diasAtras = entero(0, meses * 30)
  const f = new Date(hoy)
  f.setDate(f.getDate() - diasAtras)
  f.setHours(entero(8, 21), entero(0, 59), 0, 0)
  return f
}

async function verificarDestino(db: PrismaClient) {
  const urlCruda = process.env.DATABASE_URL || ""
  let host = "desconocido"
  try { host = new URL(urlCruda).hostname } catch { /* ignora, se valida abajo igual */ }

  const esLocal = host === "localhost" || host === "127.0.0.1"
  const permitirNoLocal = process.argv.includes("--si-produccion")

  console.log(`→ Destino: ${host}`)
  if (!esLocal && !permitirNoLocal) {
    console.error(
      `\n✋ DATABASE_URL no apunta a localhost (host: "${host}").\n` +
      `Esto generaría ${N_MOVIMIENTOS}+ filas ahí. Si es realmente la intención ` +
      `(ej. sembrar datos sintéticos en el proyecto real de Supabase para probar ` +
      `volumen), vuelve a correr agregando --si-produccion. Si no, revisa tu DATABASE_URL.`
    )
    await db.$disconnect()
    process.exit(1)
  }
}

async function obtenerOCrearCuentaSintetica(db: PrismaClient) {
  const hash = await bcrypt.hash(SYNTH_PASSWORD_PLAIN, 12)
  return db.user.upsert({
    where: { email: SYNTH_EMAIL },
    update: {},
    create: {
      nombre: "Cuenta de datos sintéticos (NO USAR PARA LOGIN)",
      email: SYNTH_EMAIL,
      password: hash,
      rol: "USER",
      negocio: "Negocio sintético — generado por generar-datos-sinteticos.ts",
    },
  })
}

async function limpiarGeneracionAnterior(db: PrismaClient, userId: string) {
  // onDelete: Cascade en casi todas las relaciones de User se encarga del
  // resto — esto es lo mismo que hace limpiar-datos-sinteticos.ts, repetido
  // aquí para que correr el script dos veces no vaya acumulando duplicados.
  await db.user.delete({ where: { id: userId } }).catch(() => {})
}

async function main() {
  const db = new PrismaClient()
  const inicio = Date.now()
  try {
    await verificarDestino(db)

    const cuentaPrevia = await db.user.findUnique({ where: { email: SYNTH_EMAIL } })
    if (cuentaPrevia) {
      console.log("→ Borrando generación sintética anterior antes de regenerar...")
      await limpiarGeneracionAnterior(db, cuentaPrevia.id)
    }
    const user = await obtenerOCrearCuentaSintetica(db)
    console.log(`→ Cuenta sintética: ${user.id}`)

    // ── Productos ──────────────────────────────────────────────────────
    const productos = await Promise.all(
      Array.from({ length: N_PRODUCTOS }, (_, i) =>
        db.producto.create({
          data: {
            userId: user.id,
            nombre: `Producto sintético ${i + 1}`,
            sku: `SYN-${String(i + 1).padStart(4, "0")}`,
            categoria: elegir(CATEGORIAS_PRODUCTO),
            precio: entero(500, 25000),
            costo: entero(200, 15000),
            stock: entero(0, 300),
            stockMinimo: 5,
            controlaInventario: true,
            formaVenta: "unidad",
          },
        })
      )
    )
    console.log(`→ ${productos.length} productos`)

    // ── Clientes ───────────────────────────────────────────────────────
    const clientes = await Promise.all(
      Array.from({ length: N_CLIENTES }, (_, i) =>
        db.cliente.create({
          data: {
            userId: user.id,
            nombre: elegir(NOMBRES),
            apellido: elegir(APELLIDOS),
            telefono: `+569${entero(10000000, 99999999)}`,
            tipoCliente: elegir(["Minorista", "Mayorista", "VIP"]),
            esFrecuente: Math.random() < 0.3,
            esVip: Math.random() < 0.1,
            permiteCredito: Math.random() < 0.4,
            activo: true,
          },
        })
      )
    )
    console.log(`→ ${clientes.length} clientes`)

    // ── Proveedores ────────────────────────────────────────────────────
    const proveedores = await Promise.all(
      Array.from({ length: N_PROVEEDORES }, (_, i) =>
        db.proveedor.create({
          data: {
            userId: user.id,
            nombre: `Proveedor sintético ${i + 1}`,
            categoria: elegir(["Alimentos", "Limpieza", "Servicios", "Otros"]),
            activo: true,
          },
        })
      )
    )
    console.log(`→ ${proveedores.length} proveedores`)

    // ── Movimientos (el grueso del volumen) ───────────────────────────
    const TIPOS_CON_PESO: { tipo: TipoMovimiento; peso: number }[] = [
      { tipo: "VENTA", peso: 60 },
      { tipo: "GASTO", peso: 20 },
      { tipo: "COSTO_FIJO", peso: 8 },
      { tipo: "INGRESO_EXTRA", peso: 5 },
      { tipo: "RETIRO", peso: 7 },
    ]
    const bolsaTipos: TipoMovimiento[] = TIPOS_CON_PESO.flatMap(t => Array(t.peso).fill(t.tipo))

    const movimientosData = Array.from({ length: N_MOVIMIENTOS }, () => {
      const tipo = elegir(bolsaTipos)
      const fecha = fechaAleatoriaUltimosMeses(MESES_HISTORIA)
      const esVenta = tipo === "VENTA"
      const producto = esVenta && Math.random() < 0.85 ? elegir(productos) : null
      const cantidad = entero(1, 5)
      const precioUnit = producto ? Number(producto.precio ?? 1000) : entero(1000, 15000)
      const costoUnit = producto ? Number(producto.costo ?? 500) : null
      const monto = esVenta ? precioUnit * cantidad : entero(1000, 80000)

      return {
        tipo,
        monto,
        fecha,
        categoria: esVenta ? null : elegir(CATEGORIAS_GASTO),
        productoId: producto?.id ?? null,
        clienteId: esVenta && Math.random() < 0.7 ? elegir(clientes).id : null,
        proveedorId: tipo === "GASTO" && Math.random() < 0.3 ? elegir(proveedores).id : null,
        userId: user.id,
        costoUnitario: esVenta && costoUnit !== null ? costoUnit : null,
        utilidad: esVenta && costoUnit !== null ? (precioUnit - costoUnit) * cantidad : null,
        margen: esVenta && costoUnit !== null && precioUnit > 0 ? ((precioUnit - costoUnit) / precioUnit) * 100 : null,
        metodoPago: elegir(["Efectivo", "Débito", "Crédito", "Transferencia"]),
      }
    })

    const TAMANO_LOTE = 500
    let insertados = 0
    for (let i = 0; i < movimientosData.length; i += TAMANO_LOTE) {
      const lote = movimientosData.slice(i, i + TAMANO_LOTE)
      await db.movimiento.createMany({ data: lote })
      insertados += lote.length
      console.log(`  ... ${insertados}/${N_MOVIMIENTOS} movimientos`)
    }

    // ── Deudas + pagos parciales ───────────────────────────────────────
    for (let i = 0; i < N_DEUDAS; i++) {
      const monto = entero(50000, 2000000)
      const pagada = Math.random() < 0.3
      const deuda = await db.deuda.create({
        data: {
          userId: user.id,
          acreedor: `Acreedor sintético ${i + 1}`,
          tipo: elegir(["Tarjeta de crédito", "Préstamo", "Proveedor", "Otros"]),
          monto,
          montoPagado: pagada ? monto : entero(0, monto),
          fechaDeuda: fechaAleatoriaUltimosMeses(MESES_HISTORIA),
          fechaVence: Math.random() < 0.8 ? fechaAleatoriaUltimosMeses(-2) : null, // algunas a futuro
          pagada,
        },
      })
      if (Math.random() < 0.5) {
        await db.pagoDeuda.create({
          data: { deudaId: deuda.id, monto: entero(10000, Number(deuda.monto)), fecha: fechaAleatoriaUltimosMeses(6) },
        })
      }
    }
    console.log(`→ ${N_DEUDAS} deudas`)

    // ── Costos fijos recurrentes ───────────────────────────────────────
    const costosFijos = await Promise.all(
      Array.from({ length: N_COSTOS_FIJOS }, (_, i) => {
        const inicio = new Date()
        inicio.setMonth(inicio.getMonth() - MESES_HISTORIA)
        inicio.setDate(entero(1, 28))
        return db.costoFijoRecurrente.create({
          data: {
            userId: user.id,
            nombre: `Costo fijo sintético ${i + 1}`,
            monto: entero(10000, 500000),
            categoria: elegir(CATEGORIAS_GASTO),
            fechaInicio: inicio,
            estado: "activo",
          },
        })
      })
    )
    for (const cf of costosFijos) {
      for (let m = 0; m < MESES_HISTORIA; m++) {
        const fecha = new Date()
        fecha.setMonth(fecha.getMonth() - m)
        await db.generacionCosto.create({
          data: { costoFijoId: cf.id, mes: fecha.getMonth() + 1, anio: fecha.getFullYear(), pagado: Math.random() < 0.9 },
        }).catch(() => {}) // @@unique([costoFijoId, mes, anio]) — ignora colisiones improbables
      }
    }
    console.log(`→ ${N_COSTOS_FIJOS} costos fijos con su historial de generaciones`)

    // ── Cuentas por cobrar + pagos ──────────────────────────────────────
    for (let i = 0; i < N_CUENTAS_COBRAR; i++) {
      const montoOriginal = entero(5000, 300000)
      const estado = elegir(["pendiente", "pendiente", "pagada", "vencida", "parcial"])
      const saldoPendiente = estado === "pagada" ? 0 : estado === "parcial" ? entero(1, montoOriginal - 1) : montoOriginal
      const cuenta = await db.cuentaPorCobrar.create({
        data: {
          userId: user.id,
          numero: i + 1,
          clienteId: elegir(clientes).id,
          montoOriginal,
          saldoPendiente,
          fechaVenta: fechaAleatoriaUltimosMeses(MESES_HISTORIA),
          fechaVence: estado === "vencida" ? fechaAleatoriaUltimosMeses(2) : fechaAleatoriaUltimosMeses(-1),
          estado,
        },
      })
      if (saldoPendiente < montoOriginal) {
        await db.pagoCuenta.create({
          data: { cuentaId: cuenta.id, monto: montoOriginal - saldoPendiente, fecha: fechaAleatoriaUltimosMeses(3) },
        })
      }
    }
    console.log(`→ ${N_CUENTAS_COBRAR} cuentas por cobrar`)

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
    console.log(`\n✅ Listo en ${segundos}s. Cuenta sintética: ${SYNTH_EMAIL} (id ${user.id})`)
    console.log(`   Para borrar todo: npm run datos-sinteticos:limpiar`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
