import type { Metadata } from "next"
import { RecuperarForm } from "@/components/auth/recuperar-form"
import { LOGO_B64 } from "@/lib/logo"

export const metadata: Metadata = { title: "Recuperar contraseña — Nelyx" }

export default function RecuperarPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: "#030b1f", colorScheme: "dark" }}>
      <div className="w-full max-w-[440px] animate-fade-up">
        <div className="flex flex-col items-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_B64} alt="NELYX" style={{ width: "150px", height: "auto", objectFit: "contain" }} />
        </div>
        <div className="rounded-2xl border border-white/10 p-8 shadow-2xl" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)" }}>
          <div className="mb-7">
            <h2 className="text-[1.4rem] font-bold text-white">¿Olvidaste tu contraseña?</h2>
            <p className="text-sm text-white/40 mt-2 leading-relaxed">
              Ingresa el correo de tu cuenta y te enviaremos un link para crear una nueva contraseña.
            </p>
          </div>
          <RecuperarForm />
        </div>
      </div>
    </div>
  )
}
