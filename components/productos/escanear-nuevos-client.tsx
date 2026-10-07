"use client"
import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { buscarProductoPorCodigoBarras } from "@/app/actions/openfoodfacts-acciones"
import { obtenerEmojiSugeridoIA } from "@/app/actions/emoji-ia-acciones"
import { generarPlantillaDesdeEscaneo, type ItemEscaneado } from "@/lib/importacion-productos"
import { getColorCategoria } from "@/lib/categorias"
import { getEmojiProducto } from "@/lib/emojis"
import { sugerirCategoria } from "@/lib/sugerencias-producto"
import dynamic from "next/dynamic"
// Carga perezosa: @zxing/library (el fallback del escáner) es una
// librería de decodificación no trivial que antes se incluía en el bundle
// inicial de esta pantalla aunque el escáner nunca se abriera — penaliza
// el Time-to-Interactive en celulares de gama baja.
const EscanerCodigoBarras = dynamic(() => import("@/components/shared/escaner-codigo-barras").then(m => m.EscanerCodigoBarras), { ssr: false })

interface ProductoExistente { sku: string | null; codigoBarras: string | null }

type ItemLista = ItemEscaneado & {
  id: string
  origen: "openfoodfacts" | "manual"
  editando: boolean
  // Respaldo por IA cuando el nombre no calza con ninguna palabra clave
  // local (getEmojiProducto cae al 📦 genérico) — se pide una sola vez por
  // producto y se guarda acá para no repetir la llamada en cada render.
  emojiIA?: string | null
}

const inp = "w-full bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 h-10 text-sm text-[var(--c-text)] placeholder:text-[var(--c-text4)] outline-none focus:border-sky-500 transition-colors"
const CATEGORIAS_RAPIDAS = ["Bebidas","Carnes","Verduras","Abarrotes","Limpieza","Accesorios","Panadería","Frutas","Lácteos","Otros"]

export function EscanearNuevosClient({ productosExistentes }: { productosExistentes: ProductoExistente[] }) {
  const [items, setItems] = useState<ItemLista[]>([])
  const [mostrarEscaner, setMostrarEscaner] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [inputManual, setInputManual] = useState("")

  // Cuando ninguna base de datos reconoce el código, se pide el nombre acá —
  // es lo único obligatorio, para que nunca quede un código "huérfano" sin
  // saber qué producto era, sin depender de que alguien se acuerde después.
  const [pendienteNombre, setPendienteNombre] = useState<string | null>(null)
  const [pendienteViaCamara, setPendienteViaCamara] = useState(true)
  const [nombreManualInput, setNombreManualInput] = useState("")
  const inputNombreRef = useRef<HTMLInputElement>(null)
  const inputManualRef = useRef<HTMLInputElement>(null)

  // El campo se deshabilita mientras busca (para no mandar dos escaneos a la
  // vez) y un input deshabilitado pierde el foco solo, por eso después de
  // cada vuelta al estado "listo para escanear" hay que recuperarlo a mano
  // — si no, hay que hacer clic de nuevo en el campo antes de cada producto.
  function reenfocarInputPistola() {
    setTimeout(() => inputManualRef.current?.focus(), 50)
  }

  useEffect(() => { reenfocarInputPistola() }, [])

  const codigosExistentes = new Set(productosExistentes.map(p => p.codigoBarras).filter(Boolean))
  const codigosYaEscaneados = new Set(items.map(it => it.codigoBarras))

  // Solo se llama a la IA cuando el nombre no calzó con ninguna palabra
  // clave local — la mayoría de los productos (los que sí dicen "arroz",
  // "yogurt", etc. en el nombre) nunca generan esta llamada, así que el
  // costo real es bajo. "Fire and forget": no bloquea la UI ni el flujo de
  // escaneo siguiente, el emoji aparece solo cuando la respuesta llega.
  async function pedirEmojiIASiHaceFalta(id: string, nombre: string, categoria: string | null) {
    if (getEmojiProducto(nombre, categoria) !== "📦") return
    const sugerido = await obtenerEmojiSugeridoIA(nombre).catch(() => null)
    if (!sugerido) return
    setItems(prev => prev.map(it => it.id === id ? { ...it, emojiIA: sugerido } : it))
  }

  // El match local (si existe) siempre gana sobre una sugerencia de IA
  // previa que pueda haber quedado desactualizada tras una edición — es
  // instantáneo, gratis y determinístico.
  function emojiVisible(it: ItemLista): string {
    const local = getEmojiProducto(it.nombre, it.categoria)
    return local !== "📦" ? local : (it.emojiIA ?? local)
  }

  async function handleCodigoDetectado(codigo: string, viaCamara = true) {
    setMostrarEscaner(false)

    if (codigosExistentes.has(codigo)) {
      toast.error(`Ya tienes ese producto en tu catálogo`, { description: `Código ${codigo}` })
      if (viaCamara) reabrirEscaner(); else reenfocarInputPistola()
      return
    }
    if (codigosYaEscaneados.has(codigo)) {
      toast.error("Ya escaneaste este código en esta misma sesión")
      if (viaCamara) reabrirEscaner(); else reenfocarInputPistola()
      return
    }

    setBuscando(true)
    const resultado = await buscarProductoPorCodigoBarras(codigo)
    setBuscando(false)

    if (resultado) {
      // A veces se reconoce el producto pero no trae una categoría mapeable
      // — en ese caso, igual que cuando no lo reconoce en absoluto, se usa
      // la sugerencia local por palabras clave del nombre en vez de
      // dejarlo sin categoría.
      const categoria = resultado.categoria ?? sugerirCategoria(resultado.nombre).categoria
      const nuevo: ItemLista = {
        id: crypto.randomUUID(), codigoBarras: codigo,
        nombre: resultado.nombre, categoria,
        origen: "openfoodfacts", editando: false,
      }
      setItems(prev => [...prev, nuevo])
      toast.success(`✨ ${resultado.nombre}`, { description: "Reconocido automáticamente" })
      pedirEmojiIASiHaceFalta(nuevo.id, nuevo.nombre, nuevo.categoria)
      if (viaCamara) reabrirEscaner(); else reenfocarInputPistola()
    } else {
      // No lo encontró — pide el nombre antes de seguir, sin excepción.
      setPendienteViaCamara(viaCamara)
      setPendienteNombre(codigo)
      setNombreManualInput("")
      setTimeout(() => inputNombreRef.current?.focus(), 50)
    }
  }

  function reabrirEscaner() {
    setTimeout(() => setMostrarEscaner(true), 400)
  }

  function confirmarNombreManual() {
    const nombre = nombreManualInput.trim()
    if (!nombre) { toast.error("Escribe un nombre para continuar"); return }
    // Ninguna base de datos reconoció el código, pero el nombre que el usuario
    // acaba de escribir sí puede alcanzar para sugerir la categoría — mismo
    // mecanismo local (sin red) que ya usa el asistente de creación manual.
    const nuevo: ItemLista = {
      id: crypto.randomUUID(), codigoBarras: pendienteNombre!,
      nombre, categoria: sugerirCategoria(nombre).categoria, origen: "manual", editando: false,
    }
    setItems(prev => [...prev, nuevo])
    setPendienteNombre(null)
    pedirEmojiIASiHaceFalta(nuevo.id, nuevo.nombre, nuevo.categoria)
    if (pendienteViaCamara) reabrirEscaner(); else reenfocarInputPistola()
  }

  function quitarItem(id: string) {
    setItems(prev => prev.filter(it => it.id !== id))
  }

  function toggleEditar(id: string) {
    const item = items.find(it => it.id === id)
    setItems(prev => prev.map(it => it.id === id ? { ...it, editando: !it.editando } : it))
    // item?.editando === true acá significa que se estaba editando y se
    // acaba de cerrar — reintenta el emoji IA por si el nombre cambió.
    if (item?.editando) pedirEmojiIASiHaceFalta(id, item.nombre, item.categoria)
  }

  function actualizarItem(id: string, cambios: Partial<ItemLista>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...cambios } : it))
  }

  function handleGenerarPlantilla() {
    if (items.length === 0) { toast.error("Escanea al menos un producto primero"); return }
    generarPlantillaDesdeEscaneo(items)
    toast.success(`📄 Plantilla descargada con ${items.length} producto${items.length === 1 ? "" : "s"}`)
  }

  const reconocidosOFF = items.filter(it => it.origen === "openfoodfacts").length

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">

      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
        <p className="text-sm font-semibold text-[var(--c-text)] mb-1">Escanea cada producto nuevo</p>
        <p className="text-xs text-[var(--c-text3)] mb-3">
          Si el código ya está en la base pública de productos, el nombre y la categoría se completan solos ✨. Si no, te pedimos el nombre antes de seguir — así nunca se pierde la referencia.
        </p>

        {/* Con lector físico (pistola USB/Bluetooth) — escribe el código
            solo y manda Enter, sin tocar el teclado. Mismo patrón que ya
            usan Venta y Actualizar inventario, reutilizando la misma
            función de detección que la cámara. */}
        <input ref={inputManualRef} value={inputManual} onChange={e => setInputManual(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && inputManual.trim() && !buscando) { const c = inputManual.trim(); setInputManual(""); handleCodigoDetectado(c, false) } }}
          placeholder="Con pistola: apunta acá y escanea..." disabled={buscando}
          className={`${inp} mb-2 disabled:opacity-60`} />

        <button onClick={() => setMostrarEscaner(true)} disabled={buscando}
          className="w-full h-12 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all">
          {buscando ? "Buscando..." : "📷 O escanear con la cámara"}
        </button>
      </div>

      {items.length > 0 && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--c-border)] flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--c-text)]">{items.length} producto{items.length === 1 ? "" : "s"} escaneado{items.length === 1 ? "" : "s"}</p>
            {reconocidosOFF > 0 && <p className="text-[11px] text-emerald-400">✨ {reconocidosOFF} autocompletado{reconocidosOFF === 1 ? "" : "s"}</p>}
          </div>
          <div className="divide-y divide-[var(--c-border2)]">
            {items.map((it, i) => (
              <div key={it.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xs font-bold text-[var(--c-text4)] w-5 flex-shrink-0 mt-1">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-1.5">
                      {emojiVisible(it)} {it.nombre}
                      {it.origen === "openfoodfacts" && <span className="text-[10px] text-emerald-400">✨</span>}
                    </p>
                    <p className="text-[11px] text-[var(--c-text4)] font-mono">{it.codigoBarras}</p>
                    {it.categoria && !it.editando && (
                      <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border font-medium"
                        style={{ backgroundColor: `${getColorCategoria(it.categoria)}1A`, color: getColorCategoria(it.categoria), borderColor: `${getColorCategoria(it.categoria)}40` }}>
                        {it.categoria}
                      </span>
                    )}
                  </div>
                  <button onClick={() => toggleEditar(it.id)} className="text-[var(--c-text4)] hover:text-sky-400 text-sm px-1 flex-shrink-0">✏️</button>
                  <button onClick={() => quitarItem(it.id)} className="text-[var(--c-text4)] hover:text-red-400 text-sm px-1 flex-shrink-0">🗑</button>
                </div>

                {it.editando && (
                  <div className="mt-3 pl-8 space-y-2.5">
                    <input value={it.nombre} onChange={e => actualizarItem(it.id, { nombre: e.target.value })} placeholder="Nombre" className={`${inp} h-9 text-xs`} />
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORIAS_RAPIDAS.map(c => (
                        <button key={c} type="button" onClick={() => actualizarItem(it.id, { categoria: it.categoria === c ? null : c })}
                          className="px-2 py-1 rounded-lg text-[10px] font-medium border transition-all"
                          style={it.categoria === c ? { backgroundColor: `${getColorCategoria(c)}1A`, color: getColorCategoria(c), borderColor: `${getColorCategoria(c)}40` } : { borderColor: "var(--c-border)", color: "var(--c-text3)" }}>
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text4)] text-xs">$</span>
                        <input type="number" min="0" placeholder="Precio" value={it.precio ?? ""} onChange={e => actualizarItem(it.id, { precio: e.target.value ? Number(e.target.value) : null })} className={`${inp} h-9 text-xs pl-6`} />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text4)] text-xs">$</span>
                        <input type="number" min="0" placeholder="Costo" value={it.costo ?? ""} onChange={e => actualizarItem(it.id, { costo: e.target.value ? Number(e.target.value) : null })} className={`${inp} h-9 text-xs pl-6`} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-[var(--c-border)]">
            <button onClick={handleGenerarPlantilla}
              className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold rounded-xl transition-all">
              📄 Generar plantilla Excel ({items.length})
            </button>
            <p className="text-[10px] text-[var(--c-text4)] text-center mt-2">
              Completa lo que falte (precio, costo, stock) y súbela en <span className="text-[var(--c-text3)]">Productos → Importación masiva</span>.
            </p>
            <p className="text-[10px] text-[var(--c-text4)] text-center mt-1">
              ¿No tienes Excel? Súbelo a tu Google Drive y ábrelo gratis con Google Sheets — no hace falta cuenta de Microsoft.
            </p>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-10 text-[var(--c-text4)]">
          <span className="text-3xl block mb-2">📷</span>
          <p className="text-sm">Escanea el primer producto para empezar.</p>
        </div>
      )}

      {mostrarEscaner && (
        <EscanerCodigoBarras
          titulo="Escanear producto nuevo"
          onDetectado={handleCodigoDetectado}
          onCerrar={() => setMostrarEscaner(false)}
        />
      )}

      {/* Nombre obligatorio cuando ninguna base de datos reconoce el código —
          es lo único que nunca se puede saltar, para no perder la referencia. */}
      {pendienteNombre && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 max-w-sm w-full">
            <p className="text-sm font-bold text-[var(--c-text)] mb-1">¿Qué producto es?</p>
            <p className="text-[11px] text-[var(--c-text4)] mb-3">No encontré este código en la base pública — código <span className="font-mono">{pendienteNombre}</span></p>
            <input ref={inputNombreRef} value={nombreManualInput} onChange={e => setNombreManualInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") confirmarNombreManual() }}
              placeholder="Nombre del producto..." className={inp} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setPendienteNombre(null); if (pendienteViaCamara) reabrirEscaner(); else reenfocarInputPistola() }} className="flex-1 h-10 border border-[var(--c-border)] text-[var(--c-text3)] text-sm rounded-xl hover:bg-[var(--c-hover)] transition-all">
                Omitir este código
              </button>
              <button onClick={confirmarNombreManual} className="flex-1 h-10 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all">
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
