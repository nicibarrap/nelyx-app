"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { signOut } from "next-auth/react"
import { eliminarMiCuenta, exportarMisDatos } from "@/app/actions/privacidad-acciones"

export function PrivacidadDatosClient({ email }: { email: string }) {
  const [exportando, setExportando] = useState(false)
  const [mostrarEliminar, setMostrarEliminar] = useState(false)
  const [confirmacion, setConfirmacion] = useState("")
  const [isPending, start] = useTransition()

  async function handleExportar() {
    setExportando(true)
    try {
      const { base64, filename } = await exportarMisDatos()
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Archivo descargado")
    } catch {
      toast.error("No se pudo generar el archivo")
    } finally {
      setExportando(false)
    }
  }

  function handleEliminar() {
    start(async () => {
      const resultado = await eliminarMiCuenta(confirmacion)
      if (resultado?.error) { toast.error(resultado.error); return }
      toast.success("Tu cuenta fue eliminada")
      await signOut({ callbackUrl: "/auth/login" })
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-[var(--c-text)] mb-1">Tus datos</h3>
        <p className="text-xs text-[var(--c-text3)] mb-3">
          Descarga toda la información personal que Nelyx guarda sobre tu cuenta, tus empleados, clientes y
          proveedores. Lee más en nuestra{" "}
          <a href="/legal/privacidad" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline">Política de Privacidad</a>.
        </p>
        <button onClick={handleExportar} disabled={exportando}
          className="h-10 px-4 bg-[var(--c-card)] hover:bg-[var(--c-hover)] border border-[var(--c-border)] text-[var(--c-text2)] text-sm font-semibold rounded-xl transition-all disabled:opacity-60">
          {exportando ? "Generando..." : "⬇️ Descargar mis datos"}
        </button>
      </div>

      <div className="pt-5 border-t border-[var(--c-border)]">
        <h3 className="text-sm font-bold text-red-400 mb-1">Eliminar mi cuenta</h3>
        <p className="text-xs text-[var(--c-text3)] mb-3">
          Elimina tu cuenta y todos tus datos de forma permanente: movimientos, clientes, proveedores,
          productos, empleados y conversaciones de soporte. Esta acción no se puede deshacer.
        </p>
        {!mostrarEliminar ? (
          <button onClick={() => setMostrarEliminar(true)}
            className="h-10 px-4 border border-red-500/30 text-red-400 text-sm font-semibold rounded-xl hover:bg-red-500/10 transition-all">
            Eliminar mi cuenta
          </button>
        ) : (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3 max-w-md">
            <p className="text-xs text-[var(--c-text2)]">
              Para confirmar, escribe tu email (<strong>{email}</strong>) acá abajo:
            </p>
            <input value={confirmacion} onChange={e => setConfirmacion(e.target.value)} placeholder={email}
              className="w-full h-10 px-3 rounded-xl text-sm bg-[var(--c-card)] border border-[var(--c-border)] text-[var(--c-text)] outline-none focus:border-red-400/50" />
            <div className="flex gap-2">
              <button onClick={() => { setMostrarEliminar(false); setConfirmacion("") }}
                className="flex-1 h-10 border border-[var(--c-border)] text-[var(--c-text3)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all">
                Cancelar
              </button>
              <button onClick={handleEliminar} disabled={isPending || confirmacion.trim().toLowerCase() !== email.toLowerCase()}
                className="flex-1 h-10 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-all">
                {isPending ? "Eliminando..." : "Sí, eliminar todo"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
