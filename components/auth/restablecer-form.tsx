"use client"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { validarTokenReset, resetearPassword } from "@/app/actions/password-reset-acciones"

export function RestablecerForm({ token }: { token: string }) {
  const [estado, setEstado] = useState<"validando" | "valido" | "invalido" | "listo">("validando")
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    if (!token) {
      setEstado("invalido")
      return
    }
    validarTokenReset(token).then(({ valido }) => setEstado(valido ? "valido" : "invalido"))
  }, [token])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const nuevaPassword = form.get("password") as string
    const confirmar = form.get("confirmar") as string
    if (nuevaPassword !== confirmar) {
      toast.error("Las contraseñas no coinciden")
      return
    }
    setLoading(true)
    try {
      await resetearPassword(token, nuevaPassword)
      setEstado("listo")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo restablecer la contraseña")
    } finally {
      setLoading(false)
    }
  }

  const inp = "w-full h-12 rounded-xl px-4 pl-11 text-sm text-white placeholder:text-white/25 outline-none transition-all border border-white/[0.12] hover:border-white/20 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/20"
  const inpStyle = { background: "rgba(255,255,255,0.07)" }

  if (estado === "validando") {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  if (estado === "invalido") {
    return (
      <div className="text-center py-2">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-sm text-white/70 leading-relaxed">
          Este link ya no es válido — puede haber expirado o haberse usado antes. Solicita uno nuevo.
        </p>
        <a href="/auth/recuperar" className="inline-block mt-6 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
          Solicitar nuevo link
        </a>
      </div>
    )
  }

  if (estado === "listo") {
    return (
      <div className="text-center py-2">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)" }}>
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-white/70 leading-relaxed">Tu contraseña se actualizó correctamente.</p>
        <a href="/auth/login" className="inline-block mt-6 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
          Ingresar con mi nueva contraseña
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-white/55 block mb-2">Nueva contraseña</label>
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <input name="password" type={showPass ? "text" : "password"} required minLength={8}
            placeholder="••••••••" autoFocus autoComplete="new-password"
            className={`${inp} pr-11`} style={inpStyle} />
          <button type="button" onClick={() => setShowPass(!showPass)} tabIndex={-1}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
            {showPass ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            )}
          </button>
        </div>
        <p className="text-xs text-white/35 mt-2">Mínimo 8 caracteres.</p>
      </div>
      <div>
        <label className="text-xs font-semibold text-white/55 block mb-2">Confirma tu nueva contraseña</label>
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <input name="confirmar" type={showPass ? "text" : "password"} required minLength={8}
            placeholder="••••••••" autoComplete="new-password"
            className={inp} style={inpStyle} />
        </div>
      </div>
      <button type="submit" disabled={loading}
        className="w-full h-12 font-semibold text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 active:brightness-95 disabled:hover:translate-y-0 disabled:hover:brightness-100"
        style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)", boxShadow: "0 4px 24px rgba(37,99,235,0.35)" }}>
        {loading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Guardando...</>
        ) : (
          <>Restablecer contraseña</>
        )}
      </button>
    </form>
  )
}
