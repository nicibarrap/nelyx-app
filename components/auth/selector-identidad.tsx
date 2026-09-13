"use client"
import { useState, useRef, useEffect } from "react"
import { signIn } from "next-auth/react"
import { toast } from "sonner"
import { verificarBloqueoPin } from "@/app/actions/empleados-acciones"

type Persona = { id: string; nombre: string }
type InfoCuenta = { nombreDueno: string; negocio: string | null; emailDueno?: string; empleados: Persona[] }

/**
 * "¿Quién eres ahora?" — reutilizado en dos momentos:
 * 1. Justo después de que el dueño inicia sesión con su email y
 *    contraseña (si esa cuenta tiene empleados).
 * 2. Desde "Cambiar de usuario", dentro del dashboard, en cualquier
 *    momento — sin tener que cerrar sesión.
 *
 * Elegir un empleado solo pide su PIN. Volver a "soy el dueño" pide su
 * contraseña de nuevo — así, aunque el aparato esté siendo usado como un
 * empleado, nadie puede volver a ver todo el negocio con solo tocar un
 * botón, sin saber la contraseña real.
 */
export function SelectorIdentidad({ info, cuentaId, onListo, oscuro, esEmpleadoActual }: {
  info: InfoCuenta
  cuentaId: string
  onListo: () => void
  /** true = fondo oscuro tipo login (texto blanco); false = dentro del dashboard (usa colores de tema) */
  oscuro?: boolean
  /** true = quien está eligiendo ahora mismo ya está actuando como un
   * empleado — en ese caso, "seguir como dueño" SÍ debe pedir contraseña,
   * no saltarse directo (si no, cualquiera podría volver a ver todo el
   * negocio con solo tocar un botón). Cuando viene del login normal, esto
   * es false, y "seguir como dueño" no necesita nada más. */
  esEmpleadoActual?: boolean
}) {
  const [empleadoElegido, setEmpleadoElegido] = useState<Persona | null>(null)
  const [modoDueno, setModoDueno] = useState(false)
  const [pin, setPin] = useState("")
  const [password, setPassword] = useState("")
  const [isPending, setIsPending] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)
  const passRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (empleadoElegido) pinRef.current?.focus() }, [empleadoElegido])
  useEffect(() => { if (modoDueno) passRef.current?.focus() }, [modoDueno])

  async function handlePinSubmit(valorPin?: string) {
    if (isPending) return
    const pinAUsar = valorPin ?? pin
    if (pinAUsar.length !== 4 || !empleadoElegido) return
    setIsPending(true)
    const result = await signIn("empleado-pin", { cuentaId, empleadoId: empleadoElegido.id, pin: pinAUsar, redirect: false })
    setIsPending(false)
    if (result?.error) {
      const estado = await verificarBloqueoPin(empleadoElegido.id)
      if (estado.bloqueado) {
        toast.error(`Demasiados intentos — espera ${estado.minutosRestantes} minuto${estado.minutosRestantes === 1 ? "" : "s"} e inténtalo de nuevo.`)
      } else {
        toast.error("PIN incorrecto")
      }
      setPin(""); pinRef.current?.focus(); return
    }
    onListo()
  }

  async function handlePasswordSubmit() {
    if (isPending || !info.emailDueno) return
    setIsPending(true)
    const result = await signIn("credentials", { email: info.emailDueno, password, redirect: false })
    setIsPending(false)
    if (result?.error) { toast.error("Contraseña incorrecta"); setPassword(""); passRef.current?.focus(); return }
    onListo()
  }

  const txtPrincipal = oscuro ? "text-white" : "text-[var(--c-text)]"
  const txtSecundario = oscuro ? "text-white/50" : "text-[var(--c-text3)]"
  const cardBg = oscuro ? "rgba(255,255,255,0.05)" : "var(--c-card2)"
  const cardBorder = oscuro ? "rgba(255,255,255,0.1)" : "var(--c-border)"
  const inputStyle = oscuro
    ? { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }
    : { background: "var(--c-input)", border: "1px solid var(--c-border)" }

  // Confirmando contraseña para volver a ser el dueño
  if (modoDueno) {
    return (
      <div className="space-y-4">
        <button onClick={() => setModoDueno(false)} className={`text-xs ${txtSecundario} hover:${txtPrincipal} transition-colors`}>← Elegir otra opción</button>
        <p className={`text-sm text-center ${txtPrincipal}`}>Confirma tu contraseña para ver todo el negocio</p>
        <input ref={passRef} type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handlePasswordSubmit() }}
          placeholder="Tu contraseña" disabled={isPending}
          className={`w-full h-12 rounded-xl px-4 text-sm ${txtPrincipal} outline-none`} style={inputStyle} />
        <button onClick={handlePasswordSubmit} disabled={isPending || !password}
          className="w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-bold transition-all">
          {isPending ? "Verificando..." : "Continuar"}
        </button>
      </div>
    )
  }

  // Eligiendo el PIN de un empleado específico
  if (empleadoElegido) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setEmpleadoElegido(null); setPin("") }} className={`text-xs ${txtSecundario} hover:${txtPrincipal} transition-colors`}>← Elegir otra persona</button>
        <p className={`text-sm text-center ${txtPrincipal}`}>Hola, <span className="font-semibold">{empleadoElegido.nombre}</span> — ingresa tu PIN</p>
        <input ref={pinRef} type="password" inputMode="numeric" maxLength={4} value={pin} autoComplete="off"
          onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setPin(v); if (v.length === 4) handlePinSubmit(v) }}
          onKeyDown={e => { if (e.key === "Enter") handlePinSubmit() }}
          className={`w-full h-14 rounded-xl text-center text-2xl tracking-[0.5em] ${txtPrincipal} outline-none`}
          style={inputStyle} placeholder="••••" disabled={isPending} autoFocus />
        <button onClick={() => handlePinSubmit()} disabled={isPending || pin.length !== 4}
          className="w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-sm font-bold transition-all">
          {isPending ? "Verificando..." : "Ingresar"}
        </button>
      </div>
    )
  }

  // Pantalla "¿quién eres?"
  return (
    <div className="space-y-3">
      <p className={`text-sm ${txtSecundario} text-center mb-4`}>{info.negocio ?? "Nelyx"} — ¿quién va a usar la plataforma?</p>
      <button onClick={() => esEmpleadoActual ? setModoDueno(true) : onListo()}
        className={`w-full h-12 rounded-xl px-4 flex items-center gap-3 text-left ${txtPrincipal} text-sm font-medium transition-all hover:opacity-80`}
        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
        <span className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold flex-shrink-0">👑</span>
        Seguir como {info.nombreDueno} (dueño)
      </button>
      {info.empleados.map(emp => (
        <button key={emp.id} onClick={() => setEmpleadoElegido(emp)}
          className={`w-full h-12 rounded-xl px-4 flex items-center gap-3 text-left ${txtPrincipal} text-sm font-medium transition-all hover:opacity-80`}
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{emp.nombre[0]?.toUpperCase()}</span>
          {emp.nombre}
        </button>
      ))}
    </div>
  )
}
