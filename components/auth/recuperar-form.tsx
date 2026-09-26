"use client"
import { useState } from "react"
import { solicitarResetPassword } from "@/app/actions/password-reset-acciones"

export function RecuperarForm() {
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [mensaje, setMensaje] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const email = form.get("email") as string
    const { mensaje } = await solicitarResetPassword(email)
    setMensaje(mensaje)
    setEnviado(true)
    setLoading(false)
  }

  const inp = "w-full h-12 rounded-xl px-4 pl-11 text-sm text-white placeholder:text-white/25 outline-none transition-all border border-white/[0.12] hover:border-white/20 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-500/20"
  const inpStyle = { background: "rgba(255,255,255,0.07)" }

  if (enviado) {
    return (
      <div className="text-center py-2">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(59,130,246,0.12)" }}>
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-sm text-white/70 leading-relaxed">{mensaje}</p>
        <a href="/auth/login" className="inline-block mt-6 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
          Volver a ingresar
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-white/55 block mb-2">Correo electrónico</label>
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <input name="email" type="email" required placeholder="tu@correo.com"
            autoFocus autoComplete="email" className={inp} style={inpStyle} />
        </div>
        <p className="text-xs text-white/35 mt-2 leading-relaxed">
          Usa el correo con el que registraste tu cuenta. Te enviaremos un link para crear una nueva contraseña.
        </p>
      </div>
      <button type="submit" disabled={loading}
        className="w-full h-12 font-semibold text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 active:brightness-95 disabled:hover:translate-y-0 disabled:hover:brightness-100"
        style={{ background: "linear-gradient(135deg,#2563eb,#3b82f6)", boxShadow: "0 4px 24px rgba(37,99,235,0.35)" }}>
        {loading ? (
          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enviando...</>
        ) : (
          <>Enviar link de recuperación</>
        )}
      </button>
      <a href="/auth/login" className="block text-center text-sm text-white/40 hover:text-white/60 transition-colors">
        Volver a ingresar
      </a>
    </form>
  )
}
