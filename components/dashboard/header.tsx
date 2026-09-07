"use client"
import { signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import { NotificationBell } from "@/components/notificaciones/notification-bell"
import { ThemeToggle } from "@/components/shared/theme-toggle"

function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", () => { setInstalled(true); setInstallPrompt(null) })
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  async function install() {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === "accepted") setInstallPrompt(null)
  }

  return { canInstall: !!installPrompt && !installed, install }
}

export function Header({ session }: { session: any }) {
  const [open, setOpen] = useState(false)
  const { canInstall, install } = usePWA()

  const iniciales = session?.user?.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "U"
  const hora = new Date().getHours()
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches"

  return (
    <header className="h-14 bg-[var(--c-card)] border-b border-[var(--c-border)] px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
      {/* Saludo */}
      <div className="hidden sm:block">
        <p className="text-sm font-semibold text-[var(--c-text)]">
          {saludo}, {session?.user?.name?.split(" ")[0]} 👋
        </p>
        <p className="text-xs text-[var(--c-text3)] mt-0.5 capitalize">
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 ml-auto">
        <ThemeToggle />
        <NotificationBell />
        {/* Avatar + dropdown */}
        <div className="relative">
          <button onClick={() => setOpen(!open)}
            className="flex items-center gap-2.5 hover:bg-[var(--c-hover)] rounded-xl px-2.5 py-1.5 transition-all">
            <div className="h-7 w-7 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-xs font-bold text-sky-400 flex-shrink-0">
              {iniciales}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-[var(--c-text)] leading-none">{session?.user?.name}</p>
              {session?.user?.negocio && (
                <p className="text-[10px] text-[var(--c-text3)] mt-0.5">{session.user.negocio}</p>
              )}
            </div>
            <span className="text-[var(--c-text3)] text-xs hidden sm:block">▾</span>
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl shadow-2xl z-20 overflow-hidden animate-scale-in">

                {/* Perfil */}
                <div className="px-4 py-3 border-b border-[var(--c-border2)]">
                  <p className="text-xs font-semibold text-[var(--c-text)]">{session?.user?.name}</p>
                  <p className="text-[10px] text-[var(--c-text3)] mt-0.5 truncate">{session?.user?.email}</p>
                  {session?.user?.negocio && (
                    <p className="text-[10px] text-sky-400 mt-0.5">🏪 {session.user.negocio}</p>
                  )}
                </div>

                {/* Instalar PWA */}
                <div className="px-1.5 py-1.5 border-b border-[var(--c-border2)]">
                  {canInstall ? (
                    <button onClick={() => { install(); setOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--c-text2)] hover:bg-[var(--c-hover)] rounded-xl transition-all">
                      <span>📲</span> Instalar aplicación
                    </button>
                  ) : (
                    <div className="px-3 py-2 text-xs text-[var(--c-text3)]">
                      <p className="font-semibold text-[var(--c-text2)] mb-0.5">📲 Instalar app</p>
                      <p className="text-[10px] leading-relaxed">iOS: Compartir → "Agregar a inicio". Android: menú del navegador → "Instalar".</p>
                    </div>
                  )}
                </div>

                {/* Cerrar sesión */}
                <div className="p-1.5">
                  <button onClick={() => signOut({ callbackUrl: "/auth/login" })}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/8 rounded-xl transition-all">
                    <span>🚪</span> Cerrar sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
