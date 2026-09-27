"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { toast } from "sonner"
import { obtenerEmpleadosDeMiCuenta, verificarBloqueoLogin } from "@/app/actions/empleados-acciones"
import { SelectorIdentidad } from "@/components/auth/selector-identidad"

export function LoginForm({ onLoginExitoso }: { onLoginExitoso?: () => void } = {}) {
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [infoParaElegir, setInfoParaElegir] = useState<{ cuentaId: string; nombreDueno: string; negocio: string | null; emailDueno?: string; empleados: { id: string; nombre: string }[] } | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const email = form.get("email") as string
    const result = await signIn("credentials", {
      email,
      password: form.get("password"),
      redirect: false,
    })
    if (result?.error) {
      setLoading(false)
      // NextAuth nunca deja pasar el motivo exacto del rechazo hasta acá,
      // así que se consulta aparte para distinguir los tres casos que
      // hoy dan el mismo rechazo genérico: cuenta bloqueada, correo que
      // no existe, o contraseña incorrecta.
      const { registrado, bloqueado, minutosRestantes } = await verificarBloqueoLogin(email)
      if (bloqueado) {
        toast.error(`Demasiados intentos fallidos. Intenta de nuevo en ${minutosRestantes} minuto${minutosRestantes === 1 ? "" : "s"}.`)
      } else if (!registrado) {
        toast.error("No existe ninguna cuenta con ese correo")
      } else {
        toast.error("Contraseña incorrecta")
      }
      return
    }

    // Si esta cuenta tiene empleados, se pregunta "¿quién eres ahora?"
    // antes de entrar — siempre, cada vez, nunca se salta la contraseña
    // del dueño para llegar a esta pantalla.
    const info = await obtenerEmpleadosDeMiCuenta()
    setLoading(false)
    if (info && info.empleados.length > 0) {
      setInfoParaElegir(info)
      return
    }
    entrarAlDashboard()
  }

  function entrarAlDashboard() {
    onLoginExitoso?.()
    // Navegación dura a propósito, no router.push(): el middleware ya
    // redirige /auth/login → /dashboard/resumen en cuanto detecta la
    // cookie de sesión (recién creada por signIn()), y esa redirección
    // ocurre server-side. Pedírsela al router del cliente mientras el
    // componente sigue montado en /auth/login confunde su seguimiento de
    // la URL: el contenido del dashboard sí llega a mostrarse, pero la
    // barra de direcciones se queda apuntando a /auth/login — visible al
    // refrescar la página (vuelve a caer en el login) o al usar "atrás".
    // Con una navegación real, el navegador sigue la redirección del
    // middleware igual que lo haría al refrescar, y la URL queda correcta.
    window.location.href = "/dashboard/resumen"
  }

  if (infoParaElegir) {
    return <SelectorIdentidad info={infoParaElegir} cuentaId={infoParaElegir.cuentaId} onListo={entrarAlDashboard} oscuro />
  }

  const inp = "w-full h-12 rounded-xl px-4 pl-11 text-sm text-white placeholder:text-white/25 outline-none transition-all border border-white/[0.12] hover:border-white/20 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/20"
  const inpStyle = { background:"rgba(255,255,255,0.07)" }

  return (
    // method="post" es a propósito, aunque el submit real lo maneja
    // JavaScript (preventDefault + signIn): si alguien llega a hacer clic
    // ANTES de que React termine de hidratar (conexión lenta, dispositivo
    // viejo), el navegador cae al envío nativo del formulario — sin esto,
    // ese envío nativo usa GET por defecto y manda la contraseña como
    // parte de la URL (visible en el historial, en logs del servidor, en
    // el header Referer de cualquier recurso que cargue después).
    <form onSubmit={handleSubmit} method="post" className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-white/55 block mb-2">Correo electrónico</label>
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <input name="email" type="email" required placeholder="tu@correo.com"
            autoFocus autoComplete="email" className={inp} style={inpStyle}/>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-white/55">Contraseña</label>
          <a href="/auth/recuperar" className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">
            ¿Olvidaste tu contraseña?
          </a>
        </div>
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          <input name="password" type={showPass?"text":"password"} required
            placeholder="••••••••" autoComplete="current-password"
            className={`${inp} pr-11`} style={inpStyle}/>
          <button type="button" onClick={()=>setShowPass(!showPass)} tabIndex={-1}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
            {showPass?(
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
            ):(
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            )}
          </button>
        </div>
      </div>
      <button type="submit" disabled={loading}
        className="w-full h-12 font-semibold text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 active:brightness-95 disabled:hover:translate-y-0 disabled:hover:brightness-100"
        style={{background:"linear-gradient(135deg,#2563eb,#3b82f6)",boxShadow:"0 4px 24px rgba(37,99,235,0.35)"}}>
        {loading?(
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Ingresando...</>
        ):(
          <>Ingresar a mi cuenta <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg></>
        )}
      </button>
    </form>
  )
}
