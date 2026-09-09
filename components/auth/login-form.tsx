"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function LoginForm({ onLoginExitoso }: { onLoginExitoso?: () => void } = {}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(true)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const result = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    })
    setLoading(false)
    if (result?.error) { toast.error("Email o contraseña incorrectos"); return }
    // El emparejamiento de este dispositivo con la cuenta ya no se hace
    // acá — el middleware lo deja resuelto solo, con la sesión ya
    // garantizada fresca, apenas se visita el dashboard.
    onLoginExitoso?.()
    router.push("/dashboard/resumen")
    router.refresh()
  }

  const inp = "w-full h-12 rounded-xl px-4 pl-11 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
  const inpStyle = { background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)" }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <label className="text-xs font-semibold text-white/55 block mb-2">Contraseña</label>
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
      <label className="flex items-center gap-2.5 cursor-pointer w-fit group">
        <div onClick={()=>setRemember(!remember)}
          className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
          style={remember?{background:"#3b82f6",borderColor:"#3b82f6"}:{borderColor:"rgba(255,255,255,0.2)"}}>
          {remember&&<svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
        </div>
        <span className="text-sm text-white/45 group-hover:text-white/65 transition-colors select-none">Recordarme</span>
      </label>
      <button type="submit" disabled={loading}
        className="w-full h-12 font-semibold text-white rounded-xl transition-all flex items-center justify-center gap-2"
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
