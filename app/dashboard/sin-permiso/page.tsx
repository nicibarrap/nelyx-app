import Link from "next/link"
import { MODULOS_NELYX } from "@/lib/permisos"

export default function SinPermisoPage({ searchParams }: { searchParams: { modulo?: string } }) {
  const modulo = MODULOS_NELYX.find(m => m.key === searchParams.modulo)
  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl mx-auto">🔒</div>
      <h1 className="text-xl font-bold text-[var(--c-text)]">No tienes acceso a este módulo</h1>
      <p className="text-sm text-[var(--c-text3)]">
        {modulo ? <>El dueño de esta cuenta no te habilitó <span className="text-[var(--c-text)] font-semibold">{modulo.label}</span>.</> : "No tienes permiso para ver esta sección."}
        {" "}Si crees que deberías tenerlo, pídele que te lo habilite.
      </p>
      <Link href="/dashboard/resumen" className="inline-block h-11 px-6 leading-[44px] bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all">
        Volver al inicio
      </Link>
    </div>
  )
}
