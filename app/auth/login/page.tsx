import type { Metadata } from "next"
import { LoginForm } from "@/components/auth/login-form"
import { ComoFunciona } from "@/components/auth/como-funciona"
import { MiniDashboard } from "@/components/auth/mini-dashboard"
import { LOGO_B64 } from "@/lib/logo"

export const metadata: Metadata = { title: "Ingresa a tu cuenta — Nelyx" }

/* ─── Shield / Cloud / Bolt SVGs ─── */
const Shield = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
const Cloud = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg>
const Bolt = () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>

const TRUST = [
  {icon:<Shield/>,title:"Seguridad empresarial",desc:"Tus datos protegidos.",color:"text-blue-400"},
  {icon:<Cloud/>,title:"Respaldo automático",desc:"Accede desde cualquier lugar.",color:"text-purple-400"},
  {icon:<Bolt/>,title:"Tiempo real",desc:"Datos actualizados al instante para mejores decisiones.",color:"text-emerald-400"},
]

const FEATURES = [
  {icon:"🛒",label:"Ventas",desc:"Registra tus ventas en segundos"},
  {icon:"📦",label:"Inventario",desc:"Nunca te quedes sin stock"},
  {icon:"🏷",label:"Costos fijos",desc:"Controla tus gastos recurrentes"},
  {icon:"👤",label:"Deudas",desc:"Al día con tus pagos y cuotas"},
  {icon:"📋",label:"Cuentas por cobrar",desc:"Cobra más rápido a tus clientes"},
  {icon:"📊",label:"Reportes",desc:"Diagnóstico y oportunidades automáticas"},
]

export default function LoginPage() {
  const year = new Date().getFullYear()
  return (
    <div className="min-h-screen flex flex-col" style={{background:"#030b1f",colorScheme:"dark",position:"relative",overflow:"hidden"}}>

      {/* ── Tech background: grid + glowing line ── */}
      <div className="absolute inset-0 pointer-events-none" style={{zIndex:0}}>
        {/* Subtle grid */}
        <div className="absolute inset-0" style={{
          backgroundImage:"linear-gradient(rgba(59,130,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.04) 1px,transparent 1px)",
          backgroundSize:"60px 60px"
        }}/>
        {/* Glow top */}
        <div className="absolute top-0 right-1/3 w-[600px] h-[600px] rounded-full opacity-10"
          style={{background:"radial-gradient(circle,#1d4ed8,transparent 70%)"}}/>
        {/* Glowing curve line */}
        <svg className="absolute top-0 right-0 w-1/2 h-full opacity-70" viewBox="0 0 500 900" fill="none" preserveAspectRatio="xMaxYMid meet">
          <defs>
            <linearGradient id="lineg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0"/>
              <stop offset="35%" stopColor="#60a5fa" stopOpacity="0.8"/>
              <stop offset="65%" stopColor="#3b82f6" stopOpacity="0.6"/>
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0"/>
            </linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <path d="M 480,0 C 420,80 350,160 300,280 C 250,400 280,500 220,620 C 160,740 100,800 60,900"
            stroke="url(#lineg)" strokeWidth="2" fill="none" filter="url(#glow)"/>
          <circle cx="480" cy="0" r="5" fill="#60a5fa" opacity="0.9" filter="url(#glow)"/>
        </svg>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="relative flex flex-1" style={{zIndex:1}}>

        {/* ════════════════════════════════
            DESKTOP — LEFT PANEL (62%)
            ════════════════════════════════ */}
        <div className="hidden lg:flex flex-col w-[62%] px-14 py-6 relative isolate" style={{background:"#030b1f"}}>

          {/* Marca — motivo geométrico basado en la X de NELYX: dos líneas de
              luz que se cruzan, como un eco abstracto del logo en vez de un
              fondo genérico. z-[-1] + position:relative en el panel para
              quedar detrás del contenido real, sin depender de la capa
              decorativa de fondo (grid/glow de arriba) que en la práctica
              nunca se llega a ver — los paneles tienen fondo sólido propio
              y la tapan por completo. */}
          <svg className="absolute -z-10 -top-16 -right-24 w-[65%] h-[55%] opacity-[0.22] pointer-events-none" viewBox="0 0 400 400" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="xbrand" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0"/>
                <stop offset="50%" stopColor="#60a5fa" stopOpacity="1"/>
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <line x1="0" y1="0" x2="400" y2="400" stroke="url(#xbrand)" strokeWidth="2"/>
            <line x1="400" y1="0" x2="0" y2="400" stroke="url(#xbrand)" strokeWidth="2"/>
          </svg>

          {/* Logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_B64} alt="NELYX" className="animate-zoom-in" style={{width:"190px",height:"auto",display:"block",objectFit:"contain"}}/>

          {/* Badge */}
          <div className="mt-5 animate-fade-up" style={{animationDelay:"60ms",animationFillMode:"backwards"}}>
            <span className="inline-flex items-center gap-2 border border-blue-500/30 rounded-full px-4 py-1.5 text-xs font-medium text-blue-400"
              style={{background:"rgba(59,130,246,0.08)"}}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
              Plataforma financiera para emprendedores
            </span>
          </div>

          {/* Headline */}
          <div className="mt-4 animate-fade-up" style={{animationDelay:"120ms",animationFillMode:"backwards"}}>
            <h1 className="text-[2.5rem] font-black text-white leading-[1.1] tracking-tight">
              Controla tu negocio<br/>
              con{" "}
              <span style={{background:"linear-gradient(90deg,#60a5fa,#3b82f6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                claridad.
              </span>
            </h1>
            <p className="mt-2 text-[0.95rem] text-white/50 leading-relaxed max-w-lg">
              Gestiona ventas, gastos, inventario, deudas y flujo de caja en una sola plataforma. Toma mejores decisiones y haz crecer tu negocio.
            </p>
          </div>

          {/* Feature pills — el detalle de valor aparece al pasar el mouse
              (tooltip puramente CSS, group-hover), no agregado siempre
              visible: así no le suma alto permanente al panel (el fold ya
              se ajustó justo en un PR anterior) y de paso queda "vivo". */}
          <div className="mt-4 flex flex-wrap gap-2 animate-fade-up" style={{animationDelay:"180ms",animationFillMode:"backwards"}}>
            {FEATURES.map(({icon,label,desc})=>(
              <div key={label} className="group relative flex items-center gap-2 border border-white/12 rounded-xl px-3.5 py-1.5 transition-all duration-200 hover:border-blue-400/40 hover:-translate-y-0.5 cursor-default"
                style={{background:"rgba(255,255,255,0.04)"}}>
                <span className="text-sm">{icon}</span>
                <span className="text-sm text-white/65 font-medium">{label}</span>
                <span className="pointer-events-none absolute left-0 top-full mt-2 w-48 rounded-lg border border-white/10 px-3 py-2 text-[11px] leading-snug text-white/70 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 z-30"
                  style={{background:"#0b1730"}}>
                  {desc}
                </span>
              </div>
            ))}
          </div>

          {/* Mini Dashboard */}
          <div className="mt-4 flex-1 animate-fade-up" style={{animationDelay:"240ms",animationFillMode:"backwards"}}>
            <MiniDashboard/>
          </div>

        </div>

        {/* ════════════════════════════════
            RIGHT PANEL — Form (38%)
            ════════════════════════════════ */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 lg:px-10" style={{background:"#080f23"}}>

          {/* ── MOBILE ONLY branding ── */}
          <div className="lg:hidden w-full max-w-sm mb-8 animate-fade-up">
            {/* Logo mobile — left aligned */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_B64} alt="NELYX" className="animate-zoom-in" style={{width:"65%",maxWidth:"260px",height:"auto",display:"block",objectFit:"contain",marginBottom:"20px"}}/>

            {/* Badge */}
            <span className="inline-flex items-center gap-1.5 border border-blue-500/30 rounded-full px-3 py-1 text-[11px] text-blue-400 mb-6"
              style={{background:"rgba(59,130,246,0.08)"}}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
              Plataforma financiera para emprendedores
            </span>

            {/* Headline */}
            <h1 className="text-[2rem] font-black text-white leading-tight mb-3">
              Controla tu negocio<br/>
              con{" "}
              <span style={{background:"linear-gradient(90deg,#60a5fa,#3b82f6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                claridad.
              </span>
            </h1>
            <p className="text-sm text-white/50 leading-relaxed mb-7">
              Gestiona ventas, gastos, inventario, deudas y flujo de caja en una sola plataforma. Toma mejores decisiones y haz crecer tu negocio.
            </p>
          </div>

          {/* ── LOGIN CARD ── */}
          <div className="w-full max-w-[440px] animate-fade-up" style={{animationDelay:"100ms",animationFillMode:"backwards"}}>
            <div className="rounded-2xl border border-white/10 p-8 shadow-2xl transition-shadow duration-300 hover:shadow-[0_0_60px_-15px_rgba(59,130,246,0.25)]"
              style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(20px)"}}>

              {/* Card header — desktop only */}
              <div className="hidden lg:block mb-7">
                <h2 className="text-[1.65rem] font-bold text-white">Bienvenido de vuelta 👋</h2>
                <p className="text-sm text-white/40 mt-2 leading-relaxed">Ingresa a tu cuenta para continuar<br/>gestionando tu negocio.</p>
              </div>

              {/* Auth form */}
              <LoginForm/>

              {/* Trust badges inside card */}
              <div className="grid grid-cols-3 gap-2 mt-7 pt-6 border-t border-white/8">
                {TRUST.map(({icon,title,desc,color})=>(
                  <div key={title} className="flex flex-col items-center text-center gap-1.5">
                    <div className={color}>{icon}</div>
                    <p className="text-[11px] font-semibold text-white/50 leading-tight">{title}</p>
                    <p className="text-[10px] text-white/25 leading-tight">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── MOBILE extras below card ── */}
            <div className="lg:hidden mt-8 space-y-4">
              <ComoFunciona/>
            </div>
          </div>
        </div>
      </div>

      {/* ── Single footer ── */}
      <footer className="relative text-center py-2.5" style={{zIndex:1,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        <p style={{color:"rgba(255,255,255,0.25)"}} className="text-xs">© {year} Nelyx. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}
