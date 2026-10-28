"use client"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formatCLP, ETIQUETAS } from "@/lib/utils"
import { eliminarMovimiento } from "@/app/actions/acciones"
import { getColorCategoria } from "@/lib/categorias"
import { getEmojiProducto } from "@/lib/emojis"
import { TZ_CHILE } from "@/lib/timezone"

// Mismos íconos que el selector de método de pago en Venta — así el
// mismo método se reconoce de un vistazo en ambas pantallas. "Débito" y
// "Crédito" ya no se generan para ventas nuevas (se fusionaron en
// "Tarjeta"), pero se mantienen acá para que las ventas antiguas sigan
// mostrando su ícono correcto.
const ICONO_METODO_PAGO: Record<string, string> = {
  "Efectivo": "💵", "Tarjeta": "💳", "Débito": "💳", "Crédito": "🏦", "Transferencia": "🏛️", "Pendiente": "📄",
}

// Mismas columnas en el encabezado y en cada fila — si se desalinean entre
// sí, el encabezado deja de servir de guía visual. Icono | Detalle (único
// elástico) | Medio de pago | Hora | Importe | Utilidad | Acciones.
const GRID_COLS = "lg:grid-cols-[auto_minmax(0,1fr)_170px_90px_130px_110px_60px]"

export function TablaMovimientos({ movimientos }: { movimientos: any[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // La hora (a diferencia de la fecha) se muestra recién después de montar:
  // Node (servidor) y el navegador pueden traer datos de Intl ligeramente
  // distintos para el mismo locale/huso horario (p. ej. el espacio antes de
  // "a. m." difiere) — eso basta para que React marque un mismatch de
  // hidratación y descarte TODO el HTML del servidor, no solo esta hora.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este movimiento?")) return
    startTransition(async () => {
      try { await eliminarMovimiento(id); toast.success("Eliminado") }
      catch { toast.error("No se pudo eliminar") }
    })
  }

  if (movimientos.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--c-text4)]">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-sm">Sin movimientos con estos filtros</p>
      </div>
    )
  }

  // Clave estable para agrupar por día — la fecha se guarda como medianoche
  // UTC de ese día (mismo criterio que formatFecha), así que tomar los
  // primeros 10 caracteres del ISO evita cualquier ambigüedad de huso horario.
  const claveDia = (fecha: string | Date) => new Date(fecha).toISOString().slice(0, 10)
  const labelDia = (fecha: string | Date) =>
    new Date(fecha).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
  const horaDe = (m: any) => mounted && m.createdAt ? new Date(m.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: TZ_CHILE }) : ""

  return (
    <div>
      {/* Encabezado de columnas — solo desde lg, el mismo grid que cada fila
          de abajo. En mobile no hace falta: ahí todo va apilado en una sola
          columna y un encabezado de tabla no tendría a qué apuntar. */}
      <div className={`hidden lg:grid ${GRID_COLS} lg:gap-4 px-1 pb-2 text-[10px] font-bold text-[var(--c-text4)] uppercase tracking-wide border-b border-[var(--c-border2)]`}>
        <span />
        <span>Detalle</span>
        <span>Medio de pago</span>
        <span>Hora</span>
        <span className="text-right">Importe</span>
        <span className="text-right">Utilidad</span>
        <span />
      </div>
      {movimientos.map((m, idx) => {
        const et = ETIQUETAS[m.tipo]
        const esIngreso = m.tipo === "VENTA" || m.tipo === "INGRESO_EXTRA"
        // DEVOLUCION es la única fila cuyo monto se guarda NEGATIVO (ver
        // registrarCambioProducto) — así una simple suma junto a VENTA en
        // Resumen/Reportes/Productos resta lo que corresponde sin que esos
        // lugares necesiten saber que es una reversión. Acá, para mostrarla,
        // hay que deshacer ese signo: por eso Math.abs + su propio color
        // ámbar (no verde "ingreso", no rojo "gasto") en vez de reusar
        // esIngreso.
        const esDevolucion = m.tipo === "DEVOLUCION"
        const colorCat = m.categoria ? getColorCategoria(m.categoria) : null
        // Cambio de producto: cada mitad del par (devolución ↔ venta nueva)
        // apunta a la otra por un lado o el otro — ver registrarCambioProducto.
        const parCambio = m.movimientoVinculado ?? m.movimientoVinculadoDe ?? null
        // Solo una VENTA con producto, que todavía no fue cambiada por otra
        // (movimientoVinculadoDe == null), puede iniciar un cambio nuevo —
        // mismo chequeo que obtenerMovimientoParaCambio en el servidor,
        // repetido acá para no ofrecer el botón cuando de todos modos se
        // va a rechazar.
        const puedeCambiarse = m.tipo === "VENTA" && !!m.productoId && !m.movimientoVinculadoDe
        const esNuevoDia = idx === 0 || claveDia(m.fecha) !== claveDia(movimientos[idx - 1].fecha)

        return (
          <div key={m.id}>
          {esNuevoDia && (
            <div className={`flex items-center gap-3 ${idx === 0 ? "pb-2" : "pt-5 pb-2"}`}>
              <span className="text-[11px] font-bold text-[var(--c-text3)] capitalize whitespace-nowrap">{labelDia(m.fecha)}</span>
              <div className="flex-1 h-px bg-[var(--c-border2)]" />
            </div>
          )}
          {/* Desde lg: grid con columnas FIJAS (no flex con justify-between)
              — con flex, el ancho de cada columna dependía de cuánto medía
              el contenido de ESA fila en particular (una fila con "Parte de
              un cambio" es más ancha que una sin eso), así que las columnas
              quedaban en una posición horizontal distinta fila a fila. Con
              columnas fijas (mismo GRID_COLS que el encabezado), la columna
              Detalle es la única elástica — absorbe lo que sobra — y todas
              las demás (incluido el encabezado) quedan exactamente
              alineadas en todo el historial. */}
          <div className={`flex items-center gap-3 lg:grid ${GRID_COLS} lg:gap-4 py-3 lg:py-3.5 px-1 hover:bg-white/[0.02] rounded-lg transition-colors ${!esNuevoDia ? "border-t border-[#1A1A1A]" : ""}`}>
            <span className="text-xl lg:text-2xl flex-shrink-0">{et.emoji}</span>
            <div className="min-w-0 flex-1 lg:flex-auto">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${et.color}`}>{et.label}</span>
                {m.categoria && !m.producto && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium"
                    style={{ color: colorCat!, borderColor: `${colorCat}30`, backgroundColor: `${colorCat}10` }}>
                    {m.categoria}
                  </span>
                )}
                {m.producto && <span className="text-[10px] text-[var(--c-text3)] truncate">{getEmojiProducto(m.producto.nombre)} {m.producto.nombre}</span>}
                {/* Cliente y método/hora se repiten acá SOLO hasta lg — desde
                    lg el método y la hora tienen su propia columna (ver
                    abajo). El cliente se queda siempre en Detalle (no tiene
                    columna propia): es parte de "qué fue" el movimiento, no
                    un dato operativo como el medio de pago o la hora. */}
                {m.cliente && <span className="text-[10px] text-sky-400/80 truncate">👤 {m.cliente.nombre} {m.cliente.apellido ?? ""}</span>}
                {m.metodoPago && <span className="text-[10px] text-[var(--c-text4)] truncate lg:hidden">{ICONO_METODO_PAGO[m.metodoPago] ?? "💳"} {m.metodoPago}</span>}
              </div>
              {m.descripcion && <p className="text-xs text-[var(--c-text3)] truncate mt-0.5">{m.descripcion}</p>}
              {parCambio && (
                <p className="text-[11px] text-[var(--c-warning)] mt-0.5">🔄 Parte de un cambio — {parCambio.descripcion ?? "ver par"}</p>
              )}
              {/* La fecha ya la da el separador "Miércoles, 28 de Octubre" de
                  arriba — repetirla en cada fila es redundante, tanto acá
                  (mobile) como en la columna Hora de escritorio: en ambos
                  casos solo queda la hora + quién la registró. */}
              <p className="text-[11px] text-[var(--c-text3)] mt-0.5 lg:hidden">
                {horaDe(m)}
                {m.realizadoPorNombre && <span className="opacity-70"> · {m.realizadoPorNombre}</span>}
              </p>
            </div>
            <div className="hidden lg:flex lg:items-center">
              {m.metodoPago && <span className="text-xs text-[var(--c-text3)] truncate">{ICONO_METODO_PAGO[m.metodoPago] ?? "💳"} {m.metodoPago}</span>}
            </div>
            <div className="hidden lg:flex lg:flex-col lg:items-start">
              <span className="text-xs text-[var(--c-text3)]">{horaDe(m)}</span>
              {m.realizadoPorNombre && <span className="text-[10px] text-[var(--c-text4)] truncate">{m.realizadoPorNombre}</span>}
            </div>
            <div className="hidden lg:block lg:text-right">
              <span className={`text-sm font-bold ${esIngreso ? "text-green-400" : esDevolucion ? "text-[var(--c-warning)]" : "text-red-400"}`}>
                {esIngreso ? "+" : "−"}{formatCLP(Math.abs(Number(m.monto)))}
              </span>
              <p className={`text-[10px] font-medium ${esIngreso ? "text-emerald-400/70" : esDevolucion ? "text-[var(--c-warning)]" : "text-[var(--c-text3)]"}`}>{esIngreso ? "Pagado" : esDevolucion ? "Devuelto" : "Registrado"}</p>
            </div>
            <div className="hidden lg:block lg:text-right">
              {m.tipo === "VENTA" && m.utilidad != null ? (
                <span className={`text-xs font-semibold ${Number(m.utilidad) >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                  {Number(m.utilidad) >= 0 ? "+" : ""}{formatCLP(Number(m.utilidad))}
                </span>
              ) : <span className="text-xs text-[var(--c-text4)]">—</span>}
            </div>
            {/* En mobile el monto/utilidad/acciones se quedan juntos a la
                derecha de la fila (no hay columnas separadas) — mismo
                formato que ya se usaba antes de tener grid de escritorio. */}
            <div className="flex items-center gap-2 flex-shrink-0 lg:hidden">
              <div className="text-right">
                <span className={`text-base font-bold ${esIngreso ? "text-green-400" : esDevolucion ? "text-[var(--c-warning)]" : "text-red-400"}`}>
                  {esIngreso ? "+" : "−"}{formatCLP(Math.abs(Number(m.monto)))}
                </span>
                {m.tipo === "VENTA" && m.utilidad != null && (
                  <p className={`text-[11px] font-semibold ${Number(m.utilidad) >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                    {Number(m.utilidad) >= 0 ? "+" : ""}{formatCLP(Number(m.utilidad))} util.
                  </p>
                )}
                <p className={`text-[10px] font-medium mt-0.5 ${esIngreso ? "text-emerald-400/70" : esDevolucion ? "text-[var(--c-warning)]" : "text-[var(--c-text3)]"}`}>{esIngreso ? "Pagado" : esDevolucion ? "Devuelto" : "Registrado"}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                {puedeCambiarse && (
                  <button onClick={() => router.push(`/dashboard/venta?cambioDeId=${m.id}`)} title="Cambiar por otro producto"
                    className="p-1 text-xs text-zinc-700 hover:text-[var(--c-warning)] hover:bg-amber-500/10 rounded-md transition-colors">↩️</button>
                )}
                <button onClick={() => handleEliminar(m.id)} disabled={isPending} title="Eliminar"
                  className="p-1 text-xs text-zinc-700 hover:text-red-400 hover:bg-red-950/30 rounded-md transition-colors">🗑</button>
              </div>
            </div>
            {/* Acciones — columna propia desde lg, apiladas verticalmente
                (no en fila) para que la columna se quede angosta sea cual
                sea la cantidad de botones que tenga cada fila. */}
            <div className="hidden lg:flex lg:flex-col lg:gap-0.5 lg:items-end">
              {puedeCambiarse && (
                <button onClick={() => router.push(`/dashboard/venta?cambioDeId=${m.id}`)} title="Cambiar por otro producto"
                  className="p-1 text-xs text-zinc-700 hover:text-[var(--c-warning)] hover:bg-amber-500/10 rounded-md transition-colors">↩️</button>
              )}
              <button onClick={() => handleEliminar(m.id)} disabled={isPending} title="Eliminar"
                className="p-1 text-xs text-zinc-700 hover:text-red-400 hover:bg-red-950/30 rounded-md transition-colors">🗑</button>
            </div>
          </div>
          </div>
        )
      })}
    </div>
  )
}
