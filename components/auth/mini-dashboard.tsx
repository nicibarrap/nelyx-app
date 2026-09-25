"use client"
import { useEffect, useState } from "react"

/** Dispara la animación de entrada recién después del primer paint (no en
 * el render inicial) — así el servidor y el cliente coinciden en el HTML
 * inicial (todo "sin animar") y React no tira un warning de hidratación. */
function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return mounted
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])
  return reduced
}

/** Cuenta desde 0 hasta el valor real una sola vez al montar — el clásico
 * "número que sube" de un dashboard vivo, sin quedar animando para siempre.
 * Arranca siempre en 0 (server y cliente coinciden, sin warning de
 * hidratación) y solo el efecto decide cómo llegar al valor final: animado,
 * o directo si el usuario pidió reducir el movimiento. */
function useCountUp(target: number, mounted: boolean, reducedMotion: boolean, durationMs = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!mounted) return
    if (reducedMotion) { setValue(target); return }
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, mounted, reducedMotion, durationMs])
  return value
}

const fmtCLP = (n: number) => `$${n.toLocaleString("es-CL")}`

/* ─── Sparkline — se dibuja de izquierda a derecha al montar ─── */
function Spark({ color, d, animate, delayMs = 0 }: { color: string; d: string; animate: boolean; delayMs?: number }) {
  const gid = "g" + color.replace("#", "")
  return (
    <svg viewBox="0 0 120 36" className="w-full h-9" preserveAspectRatio="none" fill="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d + " L120,36 L0,36 Z"} fill={`url(#${gid})`}
        style={{ opacity: animate ? 1 : 0, transition: `opacity 500ms ease-out ${delayMs + 400}ms` }} />
      <path d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{
          strokeDasharray: 200,
          strokeDashoffset: animate ? 0 : 200,
          transition: `stroke-dashoffset 800ms ease-out ${delayMs}ms`,
        }} />
    </svg>
  )
}

export function MiniDashboard() {
  const mounted = useMounted()
  const reducedMotion = usePrefersReducedMotion()
  // `animate` solo dispara la transición CSS hacia el valor final — el
  // media query global (@media prefers-reduced-motion) ya se encarga de
  // volverla instantánea para quien lo pidió. Si acá también se apagara
  // con reducedMotion, esos elementos jamás recibirían su valor final:
  // se quedarían pegados en 0 para siempre en vez de solo "no animar".
  const animate = mounted

  const ventas = useCountUp(1250000, mounted, reducedMotion)
  const gastos = useCountUp(870000, mounted, reducedMotion)
  const utilidad = useCountUp(380000, mounted, reducedMotion)
  const disponible = useCountUp(380000, mounted, reducedMotion)

  const stats = [
    { label: "Ventas del mes", val: fmtCLP(ventas), pct: "+18%", up: true, c: "#4ade80", d: "M0,28 C20,22 40,18 60,12 C80,6 100,4 120,2" },
    { label: "Gastos del mes", val: fmtCLP(gastos), pct: "-8%", up: false, c: "#f87171", d: "M0,6 C20,12 40,10 60,18 C80,26 100,28 120,32" },
    { label: "Utilidad neta", val: fmtCLP(utilidad), pct: "+12%", up: true, c: "#60a5fa", d: "M0,30 C20,24 40,20 60,14 C80,8 100,5 120,2" },
    { label: "Disponible", val: fmtCLP(disponible), pct: "Efectivo disponible", up: null as boolean | null, c: "#3b82f6", d: "" },
  ]

  const donutSegmentos = [{ p: 45, c: "#3b82f6", o: 0 }, { p: 25, c: "#8b5cf6", o: 45 }, { p: 15, c: "#10b981", o: 70 }, { p: 15, c: "#f59e0b", o: 85 }]

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "rgba(5,12,35,0.9)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/70">Resumen general</span>
          <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-medium text-emerald-400">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </span>
            En vivo
          </span>
        </div>
        <span className="text-[11px] text-white/35 border border-white/10 rounded-lg px-3 py-1 flex items-center gap-1">
          Este mes
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </span>
      </div>
      {/* Top stats row */}
      <div className="grid grid-cols-4 divide-x divide-white/8 border-b border-white/8">
        {stats.map(({ label, val, pct, up, c, d }, i) => (
          <div key={label} className="p-2">
            <p className="text-[10px] text-white/35 mb-1">{label}</p>
            <p className="text-sm font-bold text-white mb-0.5 tabular-nums">{val}</p>
            {up !== null ? (
              <p className="text-[10px] font-semibold mb-2" style={{ color: c }}>{up ? "↑" : "↓"} {pct}</p>
            ) : (
              <p className="text-[10px] text-white/35 mb-2">{pct}</p>
            )}
            {d ? <Spark color={c} d={d} animate={animate} delayMs={i * 80} /> : (
              <div className="flex justify-center mt-1">
                <svg width="36" height="36" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(59,130,246,0.2)" strokeWidth="4" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#3b82f6" strokeWidth="4"
                    style={{
                      strokeDasharray: animate ? "62 26" : "0 88",
                      transition: "stroke-dasharray 700ms ease-out 300ms",
                    }}
                    strokeDashoffset="22" transform="rotate(-90 18 18)" />
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
        <div className="p-2 col-span-1">
          <p className="text-[10px] text-white/35 mb-2">Evolución de ventas</p>
          <div className="flex items-end gap-px h-12">
            {[30, 45, 38, 58, 50, 65, 60, 78, 70, 85, 80, 100].map((h, i) => (
              <div key={i} className="flex-1 rounded-sm" style={{
                height: animate ? `${h}%` : "2%",
                background: i === 11 ? "linear-gradient(to top,#2563eb,#60a5fa)" : "rgba(59,130,246,0.3)",
                transition: `height 550ms cubic-bezier(0.22,1,0.36,1) ${i * 25}ms`,
              }} />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {["1 Jun", "8 Jun", "15 Jun", "22 Jun", "29 Jun"].map(d => (
              <span key={d} className="text-[7px] text-white/20">{d}</span>
            ))}
          </div>
        </div>
        {/* Donut */}
        <div className="p-2 col-span-1">
          <p className="text-[10px] text-white/35 mb-2">Gastos por categoría</p>
          <div className="flex items-center gap-2">
            <svg width="40" height="40" viewBox="0 0 36 36" className="flex-shrink-0">
              {donutSegmentos.map(({ p, c, o }, i) => {
                const r = 13, cx = 18, cy = 18, circ = 2 * Math.PI * r, dash = (p / 100) * circ, off = (o / 100) * circ
                return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth="7"
                  style={{
                    strokeDasharray: animate ? `${dash} ${circ - dash}` : `0 ${circ}`,
                    transition: `stroke-dasharray 650ms ease-out ${i * 110}ms`,
                  }}
                  strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} />
              })}
            </svg>
            <div className="space-y-0.5 min-w-0">
              {[{ l: "Compra mercadería", p: "45%", c: "#3b82f6" }, { l: "Costos fijos", p: "25%", c: "#8b5cf6" }, { l: "Servicios", p: "15%", c: "#10b981" }, { l: "Otros", p: "15%", c: "#f59e0b" }].map(({ l, p, c }) => (
                <div key={l} className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
                  <span className="text-[8px] text-white/40 truncate">{l}</span>
                  <span className="text-[8px] font-bold text-white/60 ml-auto">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Proximos vencimientos */}
        <div className="p-2 col-span-1">
          <p className="text-[10px] text-white/35 mb-2">Próximos vencimientos</p>
          <div className="space-y-1.5">
            {[{ n: "Pago arriendo", f: "15 Jun", v: "$250.000" }, { n: "Proveedor ABC", f: "18 Jun", v: "$120.000" }, { n: "Luz", f: "20 Jun", v: "$80.000" }].map(({ n, f, v }) => (
              <div key={n} className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] text-white/60 font-medium">{n}</p>
                  <p className="text-[8px] text-white/30">{f}</p>
                </div>
                <span className="text-[9px] font-bold text-red-400">{v}</span>
              </div>
            ))}
          </div>
          {/* Texto, no botón: es una vista previa del dashboard real, no un
              control — que pareciera clickeable sin hacer nada se sentía
              roto. */}
          <p className="text-[9px] text-blue-400/70 mt-2 cursor-default select-none">Ver todos →</p>
        </div>
      </div>
    </div>
  )
}
