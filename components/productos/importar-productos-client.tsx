"use client"
import { useState, useTransition, useRef } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { importarProductosMasivo } from "@/app/actions/acciones"
import { formatCLP } from "@/lib/utils"
import { generarPlantillaExcel, parseArchivoExcel, validarFilas, type FilaValidada } from "@/lib/importacion-productos"

interface Props {
  productosExistentes: { sku: string | null; codigoBarras: string | null }[]
}

export function ImportarProductosClient({ productosExistentes }: Props) {
  const [isPending, startTransition] = useTransition()
  const [cargando, setCargando] = useState(false)
  const [filas, setFilas] = useState<FilaValidada[] | null>(null)
  const [resultado, setResultado] = useState<{ exitosos: number; total: number; errores: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const conError = filas?.filter(f => f.estado === "error") ?? []
  const conAviso = filas?.filter(f => f.estado === "advertencia") ?? []
  const listas = filas?.filter(f => f.estado !== "error") ?? [] // se importan las "ok" y las "advertencia" (avisan, no bloquean)

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCargando(true)
    setResultado(null)
    try {
      const filasRaw = await parseArchivoExcel(file)
      const filasSinEjemplo = filasRaw.filter(f => !String(f["Nombre"] ?? "").startsWith("EJEMPLO"))
      if (filasSinEjemplo.length === 0) { toast.error("El archivo no tiene productos — solo las filas de ejemplo, o está vacío"); setCargando(false); return }
      const validadas = validarFilas(filasSinEjemplo, productosExistentes)
      setFilas(validadas)
    } catch {
      toast.error("No se pudo leer el archivo — confirma que sea un Excel (.xlsx) válido")
    }
    setCargando(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleConfirmar() {
    if (!filas) return
    const productos = listas.map(f => f.datos!).filter(Boolean)
    if (productos.length === 0) { toast.error("No hay ninguna fila lista para importar"); return }

    startTransition(async () => {
      try {
        const res = await importarProductosMasivo(productos)
        setResultado(res)
        setFilas(null)
        if (res.errores.length === 0) toast.success(`✅ ${res.exitosos} producto${res.exitosos === 1 ? "" : "s"} importado${res.exitosos === 1 ? "" : "s"}`)
        else toast.error(`${res.exitosos} de ${res.total} importados — revisa el detalle`)
      } catch (err: any) {
        toast.error(err?.message ?? "Error al importar")
      }
    })
  }

  function cancelar() {
    setFilas(null)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">

      {/* Paso 1: plantilla */}
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
        <p className="text-sm font-semibold text-[var(--c-text)] mb-1">1. Descarga la plantilla</p>
        <p className="text-xs text-[var(--c-text3)] mb-3">Ya viene con las columnas correctas y 2 filas de ejemplo — bórralas antes de subir tu archivo.</p>
        <button onClick={() => generarPlantillaExcel()} type="button"
          className="h-10 px-4 rounded-xl bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] text-sm font-semibold hover:border-sky-500/40 hover:text-sky-400 transition-all">
          📄 Descargar plantilla Excel
        </button>
      </div>

      {/* Paso 2: subir */}
      {!filas && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <p className="text-sm font-semibold text-[var(--c-text)] mb-1">2. Sube tu archivo completo</p>
          <p className="text-xs text-[var(--c-text3)] mb-3">Vas a poder revisar todo antes de que se cree nada — nada se importa a ciegas.</p>
          <button onClick={() => fileInputRef.current?.click()} disabled={cargando}
            className="w-full h-24 rounded-xl border-2 border-dashed border-[var(--c-border)] hover:border-sky-500/40 flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-60">
            <span className="text-xl">☁️</span>
            <span className="text-xs text-[var(--c-text3)]">{cargando ? "Leyendo archivo..." : "Toca para elegir tu Excel"}</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivo} />
        </div>
      )}

      {/* Paso 3: vista previa */}
      {filas && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--c-border)] flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--c-text)]">Vista previa — revisa antes de confirmar</p>
              <p className="text-xs text-[var(--c-text3)] mt-0.5">
                <span className="text-emerald-400 font-semibold">{listas.length} lista{listas.length===1?"":"s"} para importar</span>
                {conAviso.length > 0 && <> · <span className="text-[var(--c-warning)] font-semibold">{conAviso.length} con aviso</span></>}
                {conError.length > 0 && <> · <span className="text-red-400 font-semibold">{conError.length} con error (no se importan)</span></>}
              </p>
            </div>
            <button onClick={cancelar} className="text-xs text-[var(--c-text4)] hover:text-[var(--c-text)]">✕ Cancelar</button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-[var(--c-border2)]">
            {filas.map(f => {
              const cfg = f.estado === "ok" ? { icon: "✅", cls: "text-emerald-400" } : f.estado === "advertencia" ? { icon: "⚠️", cls: "text-[var(--c-warning)]" } : { icon: "❌", cls: "text-red-400" }
              return (
                <div key={f.fila} className="px-5 py-3 flex items-start gap-3">
                  <span className="text-sm flex-shrink-0 mt-0.5">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--c-text)]">
                      Fila {f.fila}{f.datos ? ` — ${f.datos.nombre}` : ""}
                      {f.datos?.precio != null && <span className="text-[var(--c-text3)] font-normal ml-2">{formatCLP(f.datos.precio)}</span>}
                    </p>
                    {f.mensajes.map((m, i) => <p key={i} className={`text-[11px] mt-0.5 ${cfg.cls}`}>{m}</p>)}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="p-5 border-t border-[var(--c-border)]">
            <button onClick={handleConfirmar} disabled={isPending || listas.length === 0}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
              {isPending ? "Importando..." : `✅ Importar ${listas.length} producto${listas.length===1?"":"s"}`}
            </button>
            {conError.length > 0 && (
              <p className="text-[11px] text-[var(--c-text4)] text-center mt-2">Las {conError.length} filas con error no se van a importar — corrígelas y súbelas en otro archivo si quieres agregarlas después.</p>
            )}
          </div>
        </div>
      )}

      {/* Resultado final */}
      {resultado && (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
          <p className="text-sm font-bold text-[var(--c-text)] mb-2">
            {resultado.errores.length === 0 ? "✅ Importación completa" : "Importación con algunos errores"}
          </p>
          <p className="text-xs text-[var(--c-text2)] mb-3">{resultado.exitosos} de {resultado.total} productos se crearon correctamente.</p>
          {resultado.errores.length > 0 && (
            <div className="space-y-1 mb-4">
              {resultado.errores.map((e, i) => <p key={i} className="text-[11px] text-red-400">{e}</p>)}
            </div>
          )}
          <Link href="/dashboard/productos" className="inline-flex h-10 px-4 items-center rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold transition-all">
            Ver mis productos →
          </Link>
        </div>
      )}
    </div>
  )
}
