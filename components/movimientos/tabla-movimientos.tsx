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
// sí, el encabezado deja de servir de guía visual. Hora | Tipo | Detalle
// (único elástico) | Medio de pago | Importe (con la utilidad debajo,
// misma celda) | Acciones.
const GRID_COLS = "lg:grid-cols-[76px_140px_minmax(0,1fr)_160px_140px_44px]"

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

  // Menú "⋮" de acciones — solo uno abierto a la vez, y se cierra solo al
  // clickear afuera (solo aplica en escritorio: en mobile los botones de
  // acción siguen siempre visibles, como antes).
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null)
  useEffect(() => {
    if (!menuAbiertoId) return
    const cerrar = () => setMenuAbiertoId(null)
    document.addEventListener("click", cerrar)
    return () => document.removeEventListener("click", cerrar)
  }, [menuAbiertoId])

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
      <div className={`hidden lg:grid ${GRID_COLS} lg:gap-3 px-1 pb-2 text-[10px] font-bold text-[var(--c-text4)] uppercase tracking-wide border-b border-[var(--c-border2)]`}>
        <span>Hora</span>
        <span>Tipo</span>
        <span>Detalle</span>
        <span>Medio de pago</span>
        <span className="text-right">Importe</span>
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

        // "Detalle" (columna de escritorio): una línea principal — lo que
        // se vendió/gastó/etc., con nombre de producto primero si hay uno
        // — y una secundaria con el primer dato de contexto disponible
        // (nota, cliente o categoría) que no repita lo ya dicho arriba.
        const detallePrincipal = m.producto?.nombre ?? m.descripcion ?? m.categoria ?? et.label
        const clienteNombre = m.cliente ? `${m.cliente.nombre} ${m.cliente.apellido ?? ""}`.trim() : null
        const detalleSecundario =
          m.descripcion && m.descripcion !== detallePrincipal ? { texto: m.descripcion, icono: null as string | null }
          : clienteNombre ? { texto: clienteNombre, icono: "👤" }
          : m.categoria && m.categoria !== detallePrincipal ? { texto: m.categoria, icono: null }
          : null

        const menuAbierto = menuAbiertoId === m.id
        const toggleMenu = (e: React.MouseEvent) => { e.stopPropagation(); setMenuAbiertoId(menuAbierto ? null : m.id) }

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
          <div className={`flex items-center gap-3 lg:grid ${GRID_COLS} lg:gap-3 py-3 lg:py-3 px-1 hover:bg-white/[0.02] rounded-lg transition-colors ${!esNuevoDia ? "border-t border-[#1A1A1A]" : ""}`}>
            {/* Hora — solo desde lg, columna propia (en mobile va más abajo,
                junto a quién registró el movimiento). */}
            <div className="hidden lg:flex lg:flex-col lg:justify-center">
              <span className="text-xs text-[var(--c-text3)]">{horaDe(m)}</span>
              {m.realizadoPorNombre && <span className="text-[10px] text-[var(--c-text4)] truncate">{m.realizadoPorNombre}</span>}
            </div>
            {/* Tipo — solo desde lg, columna propia con la misma etiqueta de
                siempre (ya no hay un emoji grande aparte: esta es la única
                marca visual del tipo de movimiento). */}
            <div className="hidden lg:flex lg:items-center">
              <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full border font-medium whitespace-nowrap ${et.color}`}>{et.label}</span>
            </div>
            <div className="min-w-0 flex-1 lg:flex-auto">
              {/* En mobile se mantiene el bloque de chips de siempre (tipo +
                  categoría/producto + cliente + método), ahora sin el emoji
                  grande que iba a la izquierda de toda la fila — la
                  etiqueta de tipo (con su emoji chico, ej. "🛒 Gasto") pasa
                  a ser la primera marca visual. Desde lg, en cambio, el
                  tipo y el método ya tienen su propia columna, así que acá
                  solo se arma la línea "Detalle" (principal + secundaria). */}
              <div className="flex items-center gap-1.5 flex-wrap lg:hidden">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${et.color}`}>{et.label}</span>
                {m.categoria && !m.producto && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium"
                    style={{ color: colorCat!, borderColor: `${colorCat}30`, backgroundColor: `${colorCat}10` }}>
                    {m.categoria}
                  </span>
                )}
                {m.producto && <span className="text-[10px] text-[var(--c-text3)] truncate">{getEmojiProducto(m.producto.nombre)} {m.producto.nombre}</span>}
                {clienteNombre && <span className="text-[10px] text-sky-400/80 truncate">👤 {clienteNombre}</span>}
                {m.metodoPago && <span className="text-[10px] text-[var(--c-text4)] truncate">{ICONO_METODO_PAGO[m.metodoPago] ?? "💳"} {m.metodoPago}</span>}
              </div>
              <p className="hidden lg:block text-sm text-[var(--c-text)] truncate">{detallePrincipal}</p>
              {/* En mobile la descripción va suelta (como siempre); desde lg
                  usa la secundaria ya resuelta arriba (nota, cliente o
                  categoría — la primera que aporte algo nuevo). */}
              {m.descripcion && <p className="lg:hidden text-xs text-[var(--c-text3)] truncate mt-0.5">{m.descripcion}</p>}
              {detalleSecundario && (
                <p className="hidden lg:block text-xs text-[var(--c-text3)] truncate mt-0.5">{detalleSecundario.icono ? `${detalleSecundario.icono} ` : ""}{detalleSecundario.texto}</p>
              )}
              {parCambio && (
                <p className="text-[11px] text-[var(--c-warning)] truncate mt-0.5">🔄 Parte de un cambio — {parCambio.descripcion ?? "ver par"}</p>
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
            {/* Medio de pago — columna propia desde lg; en mobile ya va
                como chip arriba, junto al resto. */}
            <div className="hidden lg:flex lg:items-center">
              {m.metodoPago && <span className="text-xs text-[var(--c-text3)] truncate">{ICONO_METODO_PAGO[m.metodoPago] ?? "💳"} {m.metodoPago}</span>}
            </div>
            {/* Importe — en la misma celda va la utilidad debajo (cuando
                aplica), sin un estado de pago aparte: con el color del
                monto y el signo ya se entiende si fue un ingreso o un
                egreso, un "Pagado/Registrado" repetido en cada fila no
                sumaba información nueva. */}
            <div className="hidden lg:block lg:text-right">
              <span className={`text-base font-bold ${esIngreso ? "text-green-400" : esDevolucion ? "text-[var(--c-warning)]" : "text-red-400"}`}>
                {esIngreso ? "+" : "−"}{formatCLP(Math.abs(Number(m.monto)))}
              </span>
              {m.tipo === "VENTA" && m.utilidad != null && (
                <p className={`text-[11px] font-semibold ${Number(m.utilidad) >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                  {Number(m.utilidad) >= 0 ? "+" : ""}{formatCLP(Number(m.utilidad))} util.
                </p>
              )}
            </div>
            {/* En mobile el monto/utilidad/acciones se quedan juntos a la
                derecha de la fila (no hay columnas separadas) — mismo
                formato e íconos de siempre, sin cambios acá. */}
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
            {/* Acciones — solo en escritorio, como menú "⋮" (en mobile los
                botones de arriba se quedan siempre visibles como antes: con
                tan poco ancho, un menú desplegable no suma nada). */}
            <div className="hidden lg:flex lg:items-center lg:justify-end relative">
              {/* Fondo y borde sutiles YA en reposo (no solo al hacer hover):
                  sin esto, tres puntos grises sueltos no se leían como
                  clickeables hasta pasar el mouse por encima. */}
              <button onClick={toggleMenu} title="Acciones"
                className="p-1.5 text-[var(--c-text3)] bg-[var(--c-card2)] border border-[var(--c-border)] hover:text-[var(--c-text)] hover:border-[var(--c-border2)] hover:bg-[var(--c-hover)] rounded-full transition-colors">⋮</button>
              {menuAbierto && (
                <div onClick={e => e.stopPropagation()}
                  className="absolute right-0 top-full mt-1 z-20 w-48 bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl shadow-2xl overflow-hidden py-1">
                  {puedeCambiarse && (
                    <button onClick={() => { setMenuAbiertoId(null); router.push(`/dashboard/venta?cambioDeId=${m.id}`) }}
                      className="w-full text-left px-3 py-2 text-xs text-[var(--c-text2)] hover:bg-amber-500/10 hover:text-[var(--c-warning)] transition-colors flex items-center gap-2">
                      ↩️ Cambiar por otro producto
                    </button>
                  )}
                  <button onClick={() => { setMenuAbiertoId(null); handleEliminar(m.id) }} disabled={isPending}
                    className="w-full text-left px-3 py-2 text-xs text-[var(--c-text2)] hover:bg-red-950/30 hover:text-red-400 transition-colors flex items-center gap-2 disabled:opacity-50">
                    🗑 Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
        )
      })}
    </div>
  )
}
