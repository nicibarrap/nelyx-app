import type { Metadata } from "next"
import { RestablecerForm } from "@/components/auth/restablecer-form"
import { LOGO_B64 } from "@/lib/logo"

export const metadata: Metadata = { title: "Restablecer contraseña — Nelyx" }

export default async function RestablecerPage(props: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams
  const token = searchParams.token || ""

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: "#030b1f", colorScheme: "dark" }}>
      <div className="w-full max-w-[440px] animate-fade-up">
        <div className="flex flex-col items-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_B64} alt="NELYX" style={{ width: "150px", height: "auto", objectFit: "contain" }} />
        </div>
        <div className="rounded-2xl border border-white/10 p-8 shadow-2xl" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)" }}>
          <div className="mb-7">
            <h2 className="text-[1.4rem] font-bold text-white">Crea tu nueva contraseña</h2>
            <p className="text-sm text-white/40 mt-2 leading-relaxed">
              Elige una contraseña nueva para tu cuenta.
            </p>
          </div>
          <RestablecerForm token={token} />
        </div>
      </div>
    </div>
  )
}
