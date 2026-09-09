"use client"
import { useState, useTransition, useEffect } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { crearEmpleado, actualizarEmpleado, toggleActivoEmpleado } from "@/app/actions/empleados-acciones"
import { MODULOS_NELYX } from "@/lib/permisos"

type Empleado = { id: string; nombre: string; activo: boolean; modulosPermitidos: string[]; createdAt: string }

const inp = "w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500 transition-colors"

function SelectorModulos({ seleccionados, onChange }: { seleccionados: string[]; onChange: (m: string[]) => void }) {
  function toggle(key: string) {
    onChange(seleccionados.includes(key) ? seleccionados.filter(k => k !== key) : [...seleccionados, key])
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] text-[var(--c-text3)] font-semibold">¿Qué puede ver?</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(MODULOS_NELYX.map(m => m.key))} className="text-[10px] text-sky-400 hover:text-sky-300">Todo</button>
          <button type="button" onClick={() => onChange([])} className="text-[10px] text-[var(--c-text4)] hover:text-[var(--c-text3)]">Nada</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {MODULOS_NELYX.map(m => (
          <button key={m.key} type="button" onClick={() => toggle(m.key)}
            className={`text-xs px-2.5 py-2 rounded-lg border font-medium text-left transition-all ${seleccionados.includes(m.key) ? "bg-sky-500/10 text-sky-400 border-sky-500/30" : "bg-[var(--c-card2)] text-[var(--c-text3)] border-[var(--c-border)]"}`}>
            {seleccionados.includes(m.key) ? "✓ " : ""}{m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function FormEmpleado({ empleado, onCerrar, onGuardado }: { empleado?: Empleado; onCerrar: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(empleado?.nombre ?? "")
  const [pin, setPin] = useState("")
  const [modulos, setModulos] = useState<string[]>(empleado?.modulosPermitidos ?? ["venta", "productos"])
  const [isPending, start] = useTransition()
  const esEdicion = !!empleado

  // Portal directo a document.body — la página tiene una animación de
  // entrada (animate-fade-up) que deja un transform permanente, y eso
  // rompe el centrado de un modal "fixed" si queda anidado adentro.
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])

  function handleGuardar() {
    if (!nombre.trim()) { toast.error("Escribe un nombre"); return }
    if (!esEdicion && !/^\d{4}$/.test(pin)) { toast.error("El PIN debe ser de 4 números"); return }
    if (esEdicion && pin && !/^\d{4}$/.test(pin)) { toast.error("El PIN debe ser de 4 números"); return }

    start(async () => {
      try {
        if (esEdicion) {
          await actualizarEmpleado(empleado.id, { nombre, modulosPermitidos: modulos, pin: pin || undefined })
          toast.success("Usuario actualizado")
        } else {
          await crearEmpleado(nombre, pin, modulos)
          toast.success(`✅ ${nombre} ya puede entrar con su PIN`)
        }
        onGuardado()
      } catch (err: any) {
        toast.error(err?.message ?? "Error al guardar")
      }
    })
  }

  if (!montado) return null

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <p className="text-sm font-bold text-[var(--c-text)] mb-4">{esEdicion ? `Editar a ${empleado.nombre}` : "Nuevo usuario"}</p>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Danilo" className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">
              PIN de 4 números {esEdicion && <span className="text-[var(--c-text4)] font-normal">(déjalo vacío para no cambiarlo)</span>}
            </label>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="••••" className={`${inp} tracking-[0.3em]`} />
          </div>
          <SelectorModulos seleccionados={modulos} onChange={setModulos} />
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCerrar} className="flex-1 h-10 border border-[var(--c-border)] text-[var(--c-text3)] text-sm font-semibold rounded-xl hover:bg-[var(--c-hover)] transition-all">Cancelar</button>
          <button onClick={handleGuardar} disabled={isPending} className="flex-1 h-10 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
            {isPending ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function UsuariosClient({ empleadosIniciales }: { empleadosIniciales: Empleado[] }) {
  const [empleados, setEmpleados] = useState(empleadosIniciales)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [isPending, start] = useTransition()

  function recargar() {
    setMostrarForm(false); setEditando(null)
    window.location.reload()
  }

  function handleToggle(emp: Empleado) {
    start(async () => {
      try {
        await toggleActivoEmpleado(emp.id)
        setEmpleados(prev => prev.map(e => e.id === emp.id ? { ...e, activo: !e.activo } : e))
        toast.success(emp.activo ? `${emp.nombre} ya no puede entrar` : `${emp.nombre} puede volver a entrar`)
      } catch (err: any) {
        toast.error(err?.message ?? "Error")
      }
    })
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setMostrarForm(true)}
        className="h-10 px-5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-sky-500/20">
        + Nuevo usuario
      </button>

      {empleados.length === 0 ? (
        <div className="text-center py-12 text-[var(--c-text4)]">
          <span className="text-3xl block mb-2">👥</span>
          <p className="text-sm">Aún no has creado ningún usuario adicional.</p>
        </div>
      ) : (
        <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl divide-y divide-[var(--c-border2)]">
          {empleados.map(emp => (
            <div key={emp.id} className="flex items-center gap-3 px-5 py-4">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${emp.activo ? "bg-sky-500/15 text-sky-400" : "bg-[var(--c-card2)] text-[var(--c-text4)]"}`}>
                {emp.nombre[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-2">
                  {emp.nombre}
                  {!emp.activo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Desactivado</span>}
                </p>
                <p className="text-[11px] text-[var(--c-text4)]">
                  {emp.modulosPermitidos.length === 0 ? "Sin módulos habilitados" : emp.modulosPermitidos.map(k => MODULOS_NELYX.find(m => m.key === k)?.label ?? k).join(", ")}
                </p>
              </div>
              <button onClick={() => setEditando(emp)} className="text-xs px-3 py-1.5 border border-[var(--c-border)] text-[var(--c-text3)] rounded-lg hover:bg-[var(--c-hover)] transition-all flex-shrink-0">Editar</button>
              <button onClick={() => handleToggle(emp)} disabled={isPending}
                className={`text-xs px-3 py-1.5 border rounded-lg transition-all flex-shrink-0 disabled:opacity-50 ${emp.activo ? "border-red-500/20 text-red-400 hover:bg-red-500/10" : "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"}`}>
                {emp.activo ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {mostrarForm && <FormEmpleado onCerrar={() => setMostrarForm(false)} onGuardado={recargar} />}
      {editando && <FormEmpleado empleado={editando} onCerrar={() => setEditando(null)} onGuardado={recargar} />}
    </div>
  )
}
