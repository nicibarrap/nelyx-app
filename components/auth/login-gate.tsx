"use client"
import { useState, useEffect, useRef } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LoginForm } from "@/components/auth/login-form"
import { obtenerEmpleadosParaLogin } from "@/app/actions/empleados-acciones"
import { desemparejarDispositivo } from "@/app/actions/dispositivo-acciones"

type InfoCuenta = { nombreDueno: string; negocio: string | null; empleados: { id: string; nombre: string }[] }

function leerCookie(nombre: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function LoginGate() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [info, setInfo] = useState<InfoCuenta | null>(null)
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [mostrarLoginDueno, setMostrarLoginDueno] = useState(false)
  const [empleadoElegido, setEmpleadoElegido] = useState<{ id: string; nombre: string } | null>(null)
  const [pin, setPin] = useState("")
  const [isPending, setIsPending] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const cid = leerCookie("nelyx_dispositivo_cuenta")
    if (!cid) { setCargando(false); return }
    obtenerEmpleadosParaLogin(cid).then(data => {
      if (data && data.empleados.length > 0) { setCuentaId(cid); setInfo(data) }
      setCargando(false)
    }).catch(() => setCargando(false))
  }, [])

  useEffect(() => { if (empleadoElegido) pinRef.current?.focus() }, [empleadoElegido])

  async function handlePinSubmit(valorPin?: string) {
    if (isPending) return // evita doble envío si el teclado dispara 2 eventos casi juntos
    const pinAUsar = valorPin ?? pin
    if (pinAUsar.length !== 4 || !cuentaId || !empleadoElegido) return
    setIsPending(true)
    const result = await signIn("empleado-pin", { cuentaId, empleadoId: empleadoElegido.id, pin: pinAUsar, redirect: false })
    setIsPending(false)
    if (result?.error) { toast.error("PIN incorrecto"); setPin(""); pinRef.current?.focus(); return }
    router.push("/dashboard/resumen")
    router.refresh()
  }

  async function handleUsarOtraCuenta() {
    await desemparejarDispositivo()
    setInfo(null); setCuentaId(null)
  }

  if (cargando) return <div className="h-40" />

  // Sin dispositivo emparejado (o sin empleados) — el login de siempre,
  // exactamente igual que antes de todo esto.
  if (!info || mostrarLoginDueno) {
    return (
      <>
        <LoginForm onLoginExitoso={() => setMostrarLoginDueno(false)} />
        {info && (
          <button onClick={() => setMostrarLoginDueno(false)} className="text-xs text-white/40 hover:text-white/60 mt-4 block mx-auto transition-colors">
            ← Volver a la lista de {info.negocio ?? info.nombreDueno}
          </button>
        )}
      </>
    )
  }

  // Eligiendo el PIN de un empleado específico
  if (empleadoElegido) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setEmpleadoElegido(null); setPin("") }} className="text-xs text-white/40 hover:text-white/60 transition-colors">← Elegir otra persona</button>
        <p className="text-sm text-white/70 text-center">Hola, <span className="font-semibold text-white">{empleadoElegido.nombre}</span> — ingresa tu PIN</p>
        <input ref={pinRef} type="password" inputMode="numeric" maxLength={4} value={pin} autoComplete="off"
          onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setPin(v); if (v.length === 4) handlePinSubmit(v) }}
          onKeyDown={e => { if (e.key === "Enter") handlePinSubmit() }}
          className="w-full h-14 rounded-xl text-center text-2xl tracking-[0.5em] text-white outline-none"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
          placeholder="••••" disabled={isPending} autoFocus />
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
      <p className="text-sm text-white/50 text-center mb-4">{info.negocio ?? "Nelyx"} — ¿quién va a usar la plataforma?</p>
      {info.empleados.map(emp => (
        <button key={emp.id} onClick={() => setEmpleadoElegido(emp)}
          className="w-full h-12 rounded-xl px-4 flex items-center gap-3 text-left text-white text-sm font-medium transition-all hover:bg-white/10"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-xs font-bold flex-shrink-0">{emp.nombre[0]?.toUpperCase()}</span>
          {emp.nombre}
        </button>
      ))}
      <button onClick={() => setMostrarLoginDueno(true)}
        className="w-full h-12 rounded-xl px-4 flex items-center gap-3 text-left text-white/70 text-sm font-medium transition-all hover:bg-white/10 border border-dashed"
        style={{ borderColor: "rgba(255,255,255,0.15)" }}>
        <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs flex-shrink-0">🔑</span>
        Soy {info.nombreDueno} (dueño)
      </button>
      <button onClick={handleUsarOtraCuenta} className="text-xs text-white/30 hover:text-white/50 mt-2 block mx-auto transition-colors">
        Usar otra cuenta en este dispositivo
      </button>
    </div>
  )
}
