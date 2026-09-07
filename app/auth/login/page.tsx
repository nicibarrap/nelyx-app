import type { Metadata } from "next"
import { LoginGate } from "@/components/auth/login-gate"
import { ComoFunciona } from "@/components/auth/como-funciona"

export const metadata: Metadata = { title: "Ingresa a tu cuenta — Nelyx" }

const LOGO_B64 = "data:image/png;base64,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"

/* ─── Sparkline ─── */
function Spark({ color, d }: { color: string; d: string }) {
  return (
    <svg viewBox="0 0 120 36" className="w-full h-9" preserveAspectRatio="none" fill="none">
      <defs>
        <linearGradient id={"g" + color.replace("#","")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={d + " L120,36 L0,36 Z"} fill={"url(#g" + color.replace("#","") + ")"}/>
      <path d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ─── Mini Dashboard ─── */
function MiniDashboard() {
  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{background:"rgba(5,12,35,0.9)"}}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-xs font-semibold text-white/70">Resumen general</span>
        <span className="text-[11px] text-white/35 border border-white/10 rounded-lg px-3 py-1 flex items-center gap-1">
          Este mes
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </span>
      </div>
      {/* Top stats row */}
      <div className="grid grid-cols-4 divide-x divide-white/8 border-b border-white/8">
        {[
          {label:"Ventas del mes", val:"$1.250.000", pct:"+18%", up:true, c:"#4ade80", d:"M0,28 C20,22 40,18 60,12 C80,6 100,4 120,2"},
          {label:"Gastos del mes", val:"$870.000", pct:"-8%", up:false, c:"#f87171", d:"M0,6 C20,12 40,10 60,18 C80,26 100,28 120,32"},
          {label:"Utilidad neta", val:"$380.000", pct:"+12%", up:true, c:"#60a5fa", d:"M0,30 C20,24 40,20 60,14 C80,8 100,5 120,2"},
          {label:"Disponible", val:"$380.000", pct:"Efectivo disponible", up:null, c:"#3b82f6", d:""},
        ].map(({label,val,pct,up,c,d})=>(
          <div key={label} className="p-3">
            <p className="text-[10px] text-white/35 mb-1">{label}</p>
            <p className="text-sm font-bold text-white mb-0.5">{val}</p>
            {up !== null ? (
              <p className="text-[10px] font-semibold mb-2" style={{color:c}}>{up?"↑":"↓"} {pct}</p>
            ) : (
              <p className="text-[10px] text-white/35 mb-2">{pct}</p>
            )}
            {d ? <Spark color={c} d={d}/> : (
              <div className="flex justify-center mt-1">
                <svg width="36" height="36" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(59,130,246,0.2)" strokeWidth="4"/>
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#3b82f6" strokeWidth="4"
                    strokeDasharray="62 26" strokeDashoffset="22" transform="rotate(-90 18 18)"/>
                  <text x="18" y="21" textAnchor="middle" fill="#3b82f6" fontSize="10" fontWeight="bold">$</text>
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Bottom row */}
      <div className="grid grid-cols-3 divide-x divide-white/8">
        {/* Bar chart */}
        <div className="p-3 col-span-1">
          <p className="text-[10px] text-white/35 mb-2">Evolución de ventas</p>
          <div className="flex items-end gap-px h-12">
            {[30,45,38,58,50,65,60,78,70,85,80,100].map((h,i)=>(
              <div key={i} className="flex-1 rounded-sm" style={{height:`${h}%`,background:i===11?"linear-gradient(to top,#2563eb,#60a5fa)":"rgba(59,130,246,0.3)"}}/>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {["1 Jun","8 Jun","15 Jun","22 Jun","29 Jun"].map(d=>(
              <span key={d} className="text-[7px] text-white/20">{d}</span>
            ))}
          </div>
        </div>
        {/* Donut */}
        <div className="p-3 col-span-1">
          <p className="text-[10px] text-white/35 mb-2">Gastos por categoría</p>
          <div className="flex items-center gap-2">
            <svg width="40" height="40" viewBox="0 0 36 36" className="flex-shrink-0">
              {[{p:45,c:"#3b82f6",o:0},{p:25,c:"#8b5cf6",o:45},{p:15,c:"#10b981",o:70},{p:15,c:"#f59e0b",o:85}].map(({p,c,o},i)=>{
                const r=13,cx=18,cy=18,circ=2*Math.PI*r,dash=(p/100)*circ,off=(o/100)*circ
                return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth="7"
                  strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`}/>
              })}
            </svg>
            <div className="space-y-0.5 min-w-0">
              {[{l:"Compra mercadería",p:"45%",c:"#3b82f6"},{l:"Costos fijos",p:"25%",c:"#8b5cf6"},{l:"Servicios",p:"15%",c:"#10b981"},{l:"Otros",p:"15%",c:"#f59e0b"}].map(({l,p,c})=>(
                <div key={l} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:c}}/>
                  <span className="text-[8px] text-white/40 truncate">{l}</span>
                  <span className="text-[8px] font-bold text-white/60 ml-auto">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Proximos vencimientos */}
        <div className="p-3 col-span-1">
          <p className="text-[10px] text-white/35 mb-2">Próximos vencimientos</p>
          <div className="space-y-1.5">
            {[{n:"Pago arriendo",f:"15 Jun",v:"$250.000"},{n:"Proveedor ABC",f:"18 Jun",v:"$120.000"},{n:"Luz",f:"20 Jun",v:"$80.000"}].map(({n,f,v})=>(
              <div key={n} className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] text-white/60 font-medium">{n}</p>
                  <p className="text-[8px] text-white/30">{f}</p>
                </div>
                <span className="text-[9px] font-bold text-red-400">{v}</span>
              </div>
            ))}
          </div>
          <button className="text-[9px] text-blue-400 mt-2 hover:text-blue-300">Ver todos</button>
        </div>
      </div>
    </div>
  )
}

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
  {icon:"🛒",label:"Ventas"},{icon:"📦",label:"Inventario"},
  {icon:"🏷",label:"Costos fijos"},{icon:"👤",label:"Deudas"},{icon:"📋",label:"Cuentas por cobrar"},
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
        <div className="hidden lg:flex flex-col w-[62%] px-14 py-12 min-h-screen" style={{background:"#030b1f"}}>

          {/* Logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_B64} alt="NELYX" style={{width:"220px",height:"auto",display:"block",objectFit:"contain"}}/>

          {/* Badge */}
          <div className="mt-8">
            <span className="inline-flex items-center gap-2 border border-blue-500/30 rounded-full px-4 py-1.5 text-xs font-medium text-blue-400"
              style={{background:"rgba(59,130,246,0.08)"}}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
              Plataforma financiera para emprendedores
            </span>
          </div>

          {/* Headline */}
          <div className="mt-6">
            <h1 className="text-[3rem] font-black text-white leading-[1.1] tracking-tight">
              Controla tu negocio<br/>
              con{" "}
              <span style={{background:"linear-gradient(90deg,#60a5fa,#3b82f6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
                claridad.
              </span>
            </h1>
            <p className="mt-4 text-[0.95rem] text-white/50 leading-relaxed max-w-lg">
              Gestiona ventas, gastos, inventario, deudas y flujo de caja en una sola plataforma. Toma mejores decisiones y haz crecer tu negocio.
            </p>
          </div>

          {/* Feature pills */}
          <div className="mt-6 flex flex-wrap gap-2">
            {FEATURES.map(({icon,label})=>(
              <div key={label} className="flex items-center gap-2 border border-white/12 rounded-xl px-3.5 py-2"
                style={{background:"rgba(255,255,255,0.04)"}}>
                <span className="text-sm">{icon}</span>
                <span className="text-sm text-white/65 font-medium">{label}</span>
              </div>
            ))}
          </div>

          {/* Mini Dashboard */}
          <div className="mt-6 flex-1">
            <MiniDashboard/>
          </div>

        </div>

        {/* ════════════════════════════════
            RIGHT PANEL — Form (38%)
            ════════════════════════════════ */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 min-h-screen lg:px-10" style={{background:"#080f23"}}>

          {/* ── MOBILE ONLY branding ── */}
          <div className="lg:hidden w-full max-w-sm mb-8">
            {/* Logo mobile — left aligned */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_B64} alt="NELYX" style={{width:"65%",maxWidth:"260px",height:"auto",display:"block",objectFit:"contain",marginBottom:"20px"}}/>

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
          <div className="w-full max-w-[440px]">
            <div className="rounded-2xl border border-white/10 p-8 shadow-2xl"
              style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(20px)"}}>

              {/* Card header — desktop only */}
              <div className="hidden lg:block mb-7">
                <h2 className="text-[1.65rem] font-bold text-white">Bienvenido de vuelta 👋</h2>
                <p className="text-sm text-white/40 mt-2 leading-relaxed">Ingresa a tu cuenta para continuar<br/>gestionando tu negocio.</p>
              </div>

              {/* Auth form */}
              <LoginGate/>

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
      <footer className="relative text-center py-4" style={{zIndex:1,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
        <p style={{color:"rgba(255,255,255,0.25)"}} className="text-xs">© {year} Nelyx. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}
