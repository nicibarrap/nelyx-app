"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { ChevronLeft } from "lucide-react"
import { tieneAcceso, esSoloLectura } from "@/lib/permisos"
import { contarNoLeidosAdmin } from "@/app/actions/soporte-acciones"
import { SincronizarPendiente } from "@/components/dashboard/navegacion-provider"

const NAV_PRINCIPAL = [
  { href: "/dashboard/resumen",     icon: "◈", label: "Resumen",     activo: true, moduloKey: "resumen" },
  { href: "/dashboard/venta",       icon: "🛒", label: "Venta",       activo: true, moduloKey: "venta" },
  { href: "/dashboard/movimientos", icon: "⇄", label: "Movimientos", activo: true, moduloKey: "movimientos" },
  { href: "/dashboard/productos",   icon: "▣", label: "Productos",   activo: true, moduloKey: "productos" },
  { href: "/dashboard/deudas",      icon: "◎", label: "Deudas",      activo: true, moduloKey: "deudas" },
  { href: "/dashboard/alertas",     icon: "🔔", label: "Alertas",     activo: true, moduloKey: "alertas" },
  { href: "/dashboard/costos-fijos", icon: "🏠", label: "Costos fijos",activo: true, moduloKey: "costos-fijos" },
]
const NAV_FINANZAS = [
  { href: "/dashboard/clientes", icon: "◉", label: "Clientes", activo: true, moduloKey: "clientes" },
  { href: "/dashboard/proveedores", icon: "◈", label: "Proveedores", activo: true, moduloKey: "proveedores" },
  { href: "/dashboard/cuentas-cobrar", icon: "⊙", label: "Cuentas cobrar", activo: true, moduloKey: "cuentas-cobrar" },
  { href: "/dashboard/reportes", icon: "▦", label: "Reportes", activo: true, moduloKey: "reportes" },
]
const NAV_EXTRA = [
  { href: "/dashboard/calendario", icon: "📅", label: "Calendario", activo: true, moduloKey: "calendario" },
  { href: "/dashboard/aprende", icon: "📚", label: "Aprende",    activo: true, moduloKey: "aprende" },
  { href: "/dashboard/configuracion", icon: "⚙️", label: "Configuración", activo: true, moduloKey: "configuracion" },
]

type NavItemProps = { href: string; icon: string; label: string; badge?: string; activo?: boolean; collapsed?: boolean; moduloKey?: string; modulosPermitidos?: string[] | null }

function NavItem({ href, icon, label, badge, activo, collapsed, moduloKey, modulosPermitidos }: NavItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== "#" && pathname.startsWith(href + "/"))
  const sinPermiso = !!moduloKey && !tieneAcceso(modulosPermitidos, moduloKey)
  const soloLectura = !!moduloKey && esSoloLectura(modulosPermitidos, moduloKey)

  // Un módulo sin permiso se oculta del todo, no se muestra "candado" — el
  // dueño decide qué módulos existen para cada empleado, y mostrar el
  // nombre de un módulo bloqueado ya revela información que el dueño puede
  // no querer que ese empleado sepa que existe.
  if (sinPermiso) return null

  if (!activo || badge === "Pronto") {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-[var(--c-text4)] cursor-not-allowed select-none">
        <span className="text-sm w-5 text-center opacity-30">{icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1">{label}</span>
            {badge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--c-card2)] text-[var(--c-text4)] border border-[var(--c-border2)] font-medium">
                {badge}
              </span>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <Link href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
        isActive
          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm"
          : "text-[var(--c-text2)] hover:text-[var(--c-text)] hover:bg-[var(--c-card2)]"
      }`}>
      <span className={`text-sm w-5 text-center ${isActive ? "text-sky-400" : "text-[var(--c-text3)] group-hover:text-[var(--c-text2)]"}`}>
        {icon}
      </span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && soloLectura && <span className="text-[10px] text-[var(--c-text4)]" title="Solo puedes ver, no modificar">👁</span>}
      {!collapsed && isActive && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
      <SincronizarPendiente />
    </Link>
  )
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  return !collapsed
    ? <p className="text-[10px] text-[var(--c-text4)] uppercase tracking-widest font-semibold px-3 pt-5 pb-1.5">{label}</p>
    : <div className="h-3" />
}

export function Sidebar({ userRole, modulosPermitidos, esEmpleado }: { userRole: string; modulosPermitidos?: string[] | null; esEmpleado?: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [noLeidosSoporte, setNoLeidosSoporte] = useState(0)
  const pathname = usePathname()

  // Cierra el menú móvil apenas cambia la ruta — sin esto, al tocar un
  // módulo desde el celular, el menú se quedaba abierto encima de la
  // pantalla nueva en vez de cerrarse solo.
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Número de mensajes de clientes sin leer, junto a "Soporte NELYX" — mismo
  // patrón de polling que ya usa el widget de soporte del lado del cliente.
  // Se marcan como leídos al abrir esa conversación (en /admin/soporte), así
  // que acá solo hace falta volver a consultar el total cada cierto tiempo.
  useEffect(() => {
    if (userRole !== "ADMIN" || esEmpleado) return
    let activo = true
    async function chequear() {
      const n = await contarNoLeidosAdmin().catch(() => 0)
      if (activo) setNoLeidosSoporte(n)
    }
    chequear()
    const interval = setInterval(chequear, 20000)
    return () => { activo = false; clearInterval(interval) }
  }, [userRole, esEmpleado])

  // El sidebar fijo ahora arranca en md (tablet), no solo en lg (desktop) —
  // antes una tablet caía al mismo ☰ superpuesto que un celular, sin
  // aprovechar que ya tiene ancho de sobra para una navegación siempre
  // visible. Arranca colapsado (solo íconos) únicamente en el rango de
  // tablet para no comerse tanto ancho — en desktop sigue expandido por
  // defecto, como antes. El usuario puede expandir/colapsar manualmente
  // en cualquier tamaño con el botón de siempre.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px) and (max-width: 1023px)")
    if (mq.matches) setCollapsed(true)
  }, [])

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      <div className={`px-4 py-5 border-b border-[var(--c-border2)] flex items-center ${collapsed && !isMobile ? "justify-center" : "justify-between"}`}>
        {(!collapsed || isMobile) && (
          <>
            <img src="/logos/sidebar-wordmark-dark.png" alt="Nelyx" className="logo-dark h-7 sm:h-8 w-auto max-w-[150px] object-contain flex-shrink-0" />
            <img src="/logos/sidebar-wordmark-light.png" alt="Nelyx" className="logo-light h-7 sm:h-8 w-auto max-w-[150px] object-contain flex-shrink-0" />
          </>
        )}
        {collapsed && !isMobile && (
          // El propio ícono expande el menú — así no compite por espacio
          // con un botón aparte dentro de una franja de apenas 64px, que
          // es justo lo que hacía que el botón de abrir quedara sin
          // espacio y pareciera "desaparecido".
          <button onClick={() => setCollapsed(false)} title="Expandir menú" className="p-1 rounded-lg hover:bg-[var(--c-card2)] transition-colors">
            <img src="/icon-x.png" alt="Expandir menú" className="logo-dark w-8 h-8 object-contain" />
            <img src="/icon-x-light.png" alt="Expandir menú" className="logo-light w-8 h-8 object-contain" />
          </button>
        )}
        {!isMobile && !collapsed && (
          // Sin fondo ni caja a propósito — solo la flecha, para que lea
          // como un control sutil de la cabecera y no como un botón más.
          // El color usa las mismas variables de texto que el resto del
          // sidebar, así que ya se adapta solo: más clara en modo oscuro,
          // más oscura en modo claro.
          <button onClick={() => setCollapsed(true)} title="Ocultar menú" aria-label="Ocultar menú"
            className="ml-auto flex items-center justify-center w-6 h-6 text-[var(--c-text4)] hover:text-[var(--c-text2)] transition-all duration-200 hover:-translate-x-0.5">
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
          </button>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="text-[var(--c-text3)] hover:text-[var(--c-text)] text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--c-card2)]">×</button>
        )}
      </div>

      <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
        <SectionLabel label="Principal" collapsed={!isMobile && collapsed} />
        {NAV_PRINCIPAL.map(item => <NavItem key={item.href} {...item} collapsed={!isMobile && collapsed} modulosPermitidos={modulosPermitidos} />)}

        <SectionLabel label="Finanzas" collapsed={!isMobile && collapsed} />
        {NAV_FINANZAS.map(item => <NavItem key={item.href} {...item} collapsed={!isMobile && collapsed} modulosPermitidos={modulosPermitidos} />)}

        <SectionLabel label="Herramientas" collapsed={!isMobile && collapsed} />
        {NAV_EXTRA.map(item => <NavItem key={item.href} {...item} collapsed={!isMobile && collapsed} modulosPermitidos={modulosPermitidos} />)}

        {!esEmpleado && (
          <>
            <SectionLabel label="Equipo" collapsed={!isMobile && collapsed} />
            <NavItem href="/dashboard/usuarios" icon="👥" label="Usuarios" activo collapsed={!isMobile && collapsed} />
          </>
        )}

        {userRole === "ADMIN" && !esEmpleado && (
          <>
            <SectionLabel label="Administración" collapsed={!isMobile && collapsed} />
            {[
              { href: "/admin/clientes", icon: "👥", label: "Clientes NELYX" },
              { href: "/admin/soporte", icon: "💬", label: "Soporte NELYX" },
            ].map(item => (
              <Link key={item.href} href={item.href}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  pathname === item.href
                    ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                    : "text-[var(--c-text2)] hover:text-[var(--c-text)] hover:bg-[var(--c-card2)]"
                }`}>
                <span className="text-sm w-5 text-center">{item.icon}</span>
                {(!collapsed || isMobile) && <span className="flex-1">{item.label}</span>}
                {item.href === "/admin/soporte" && noLeidosSoporte > 0 && (
                  <span
                    className={`flex-shrink-0 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ${
                      collapsed && !isMobile ? "absolute top-1 right-1 w-2 h-2" : "min-w-[18px] h-[18px] px-1"
                    }`}
                  >
                    {(!collapsed || isMobile) && (noLeidosSoporte > 99 ? "99+" : noLeidosSoporte)}
                  </span>
                )}
              </Link>
            ))}
          </>
        )}
      </nav>

      {(!collapsed || isMobile) && (
        <div className="px-4 py-3 border-t border-[var(--c-border2)]">
          <p className="text-[10px] text-[var(--c-text4)]">© {new Date().getFullYear()} Nelyx</p>
        </div>
      )}
    </>
  )

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 w-9 h-9 bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl flex items-center justify-center text-[var(--c-text2)] hover:text-[var(--c-text)] hover:border-sky-500/30 transition-all"
      >
        ☰
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 md:hidden backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[var(--c-sidebar)] border-r border-[var(--c-border2)] flex flex-col z-50 md:hidden">
            <SidebarContent isMobile={true} />
          </aside>
        </>
      )}

      {/* Desktop/tablet sidebar */}
      <aside className={`hidden md:flex ${collapsed ? "w-16" : "w-60"} min-h-screen bg-[var(--c-sidebar)] border-r border-[var(--c-border2)] flex-col transition-all duration-300 flex-shrink-0`}>
        <SidebarContent />
      </aside>
    </>
  )
}
