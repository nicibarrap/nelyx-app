"use client"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { listarTerminalesParaConectar, conectarMercadoPago, probarConexionTuu, conectarTuu, listarLectoresParaConectarSumup, conectarSumup, conectarTransbank, conectarBciPagos, desconectarPago } from "@/app/actions/pagos-acciones"
import { conectarAgenteTransbank, listarPuertosTransbank, probarPuertoTransbank } from "@/lib/pagos/transbank-cliente"
import type { TerminalMP } from "@/lib/pagos/mercadopago"
import type { LectorSumup } from "@/lib/pagos/sumup"

type Conexion = { id: string; proveedor: string; terminalId: string | null; activo: boolean; ultimaConexionOk: string | null }

const MARCAS = [
  { id: "mercadopago", nombre: "Mercado Pago", emoji: "🟡", disponible: true },
  { id: "tuu", nombre: "TUU (Haulmer)", emoji: "🟣", disponible: true },
  { id: "sumup", nombre: "SumUp", emoji: "🟠", disponible: true },
  { id: "transbank", nombre: "Transbank (POS Integrado)", emoji: "🔵", disponible: true },
  { id: "bcipagos", nombre: "BCI Pagos (Cloud to Cloud)", emoji: "🔷", disponible: true },
  { id: "getnet", nombre: "Getnet", emoji: "🔴", disponible: false },
  { id: "bancoestado", nombre: "BancoEstado (CompraAquí)", emoji: "🟢", disponible: false },
]

export function ConexionMaquinaPagoClient({ conexiones: conexionesIniciales }: { conexiones: Conexion[] }) {
  const [conexiones, setConexiones] = useState(conexionesIniciales)
  const [marcaAbierta, setMarcaAbierta] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState("")
  const [terminales, setTerminales] = useState<TerminalMP[] | null>(null)
  const [terminalElegida, setTerminalElegida] = useState("")
  const [apiKeyTuu, setApiKeyTuu] = useState("")
  const [deviceTuu, setDeviceTuu] = useState("")
  const [tuuValidado, setTuuValidado] = useState(false)
  const [apiKeySumup, setApiKeySumup] = useState("")
  const [merchantCodeSumup, setMerchantCodeSumup] = useState("")
  const [lectoresSumup, setLectoresSumup] = useState<LectorSumup[] | null>(null)
  const [lectorElegidoSumup, setLectorElegidoSumup] = useState("")
  const [puertosTransbank, setPuertosTransbank] = useState<{ valor: string; etiqueta: string }[] | null>(null)
  const [puertoElegidoTransbank, setPuertoElegidoTransbank] = useState("")
  const [transbankProbado, setTransbankProbado] = useState(false)
  const [appIdBci, setAppIdBci] = useState("")
  const [appSecretBci, setAppSecretBci] = useState("")
  const [codigoBci, setCodigoBci] = useState("")
  const [isPending, startTransition] = useTransition()

  const conexionMP = conexiones.find(c => c.proveedor === "mercadopago")

  function handleProbarConexion() {
    if (!accessToken.trim()) { toast.error("Ingresa tu Access Token primero"); return }
    startTransition(async () => {
      try {
        const lista = await listarTerminalesParaConectar(accessToken.trim())
        if (lista.length === 0) { toast.error("El token es válido, pero no encontré ninguna terminal asociada a esta cuenta"); return }
        setTerminales(lista)
        setTerminalElegida(lista[0].id)
        toast.success(`Encontré ${lista.length} terminal${lista.length === 1 ? "" : "es"}`)
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo conectar")
      }
    })
  }

  function handleConectar() {
    if (!terminalElegida) return
    startTransition(async () => {
      try {
        await conectarMercadoPago(accessToken.trim(), terminalElegida)
        toast.success("✅ Máquina conectada")
        setConexiones(prev => [...prev.filter(c => c.proveedor !== "mercadopago"), { id: "temp", proveedor: "mercadopago", terminalId: terminalElegida, activo: true, ultimaConexionOk: new Date().toISOString() }])
        setMarcaAbierta(null)
        setAccessToken("")
        setTerminales(null)
      } catch (err: any) {
        toast.error(err?.message ?? "Error al conectar")
      }
    })
  }

  function handleProbarConexionTuu() {
    if (!apiKeyTuu.trim()) { toast.error("Ingresa tu API Key primero"); return }
    startTransition(async () => {
      try {
        await probarConexionTuu(apiKeyTuu.trim())
        setTuuValidado(true)
        toast.success("API Key válida")
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo validar la API Key")
      }
    })
  }

  function handleConectarTuu() {
    if (!deviceTuu.trim()) { toast.error("Ingresa el número de serie del terminal"); return }
    startTransition(async () => {
      try {
        await conectarTuu(apiKeyTuu.trim(), deviceTuu.trim())
        toast.success("✅ Máquina conectada")
        setConexiones(prev => [...prev.filter(c => c.proveedor !== "tuu"), { id: "temp", proveedor: "tuu", terminalId: deviceTuu.trim(), activo: true, ultimaConexionOk: new Date().toISOString() }])
        setMarcaAbierta(null)
        setApiKeyTuu("")
        setDeviceTuu("")
        setTuuValidado(false)
      } catch (err: any) {
        toast.error(err?.message ?? "Error al conectar")
      }
    })
  }

  function handleProbarConexionSumup() {
    if (!apiKeySumup.trim() || !merchantCodeSumup.trim()) { toast.error("Ingresa tu API Key y tu código de comercio"); return }
    startTransition(async () => {
      try {
        const lista = await listarLectoresParaConectarSumup(apiKeySumup.trim(), merchantCodeSumup.trim())
        if (lista.length === 0) { toast.error("Las credenciales son válidas, pero no encontré ningún lector emparejado a esta cuenta"); return }
        setLectoresSumup(lista)
        setLectorElegidoSumup(lista[0].id)
        toast.success(`Encontré ${lista.length} lector${lista.length === 1 ? "" : "es"}`)
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo conectar")
      }
    })
  }

  function handleConectarSumup() {
    if (!lectorElegidoSumup) return
    startTransition(async () => {
      try {
        await conectarSumup(apiKeySumup.trim(), merchantCodeSumup.trim(), lectorElegidoSumup)
        toast.success("✅ Máquina conectada")
        setConexiones(prev => [...prev.filter(c => c.proveedor !== "sumup"), { id: "temp", proveedor: "sumup", terminalId: lectorElegidoSumup, activo: true, ultimaConexionOk: new Date().toISOString() }])
        setMarcaAbierta(null)
        setApiKeySumup("")
        setMerchantCodeSumup("")
        setLectoresSumup(null)
      } catch (err: any) {
        toast.error(err?.message ?? "Error al conectar")
      }
    })
  }

  // Transbank no tiene API Key: busca el Agente instalado en este mismo
  // computador y lista los puertos donde encuentre un POS conectado por
  // cable. "Probar conexión" abre el puerto elegido y le hace un poll (sin
  // cobrar nada) para confirmar que el POS responde antes de guardar.
  function handleBuscarPuertosTransbank() {
    startTransition(async () => {
      try {
        await conectarAgenteTransbank()
        const lista = await listarPuertosTransbank()
        if (lista.length === 0) { toast.error("El Agente está corriendo, pero no encontré ningún puerto — revisa que el cable esté conectado"); return }
        setPuertosTransbank(lista)
        setPuertoElegidoTransbank(lista[0].valor)
        toast.success(`Encontré ${lista.length} puerto${lista.length === 1 ? "" : "s"}`)
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo conectar con el Agente")
      }
    })
  }

  function handleProbarPuertoTransbank() {
    if (!puertoElegidoTransbank) return
    startTransition(async () => {
      try {
        await probarPuertoTransbank(puertoElegidoTransbank)
        setTransbankProbado(true)
        toast.success("El POS respondió correctamente")
      } catch (err: any) {
        toast.error(err?.message ?? "No se pudo probar la conexión")
      }
    })
  }

  function handleConectarTransbank() {
    if (!puertoElegidoTransbank) return
    startTransition(async () => {
      try {
        await conectarTransbank(puertoElegidoTransbank)
        toast.success("✅ Máquina conectada")
        setConexiones(prev => [...prev.filter(c => c.proveedor !== "transbank"), { id: "temp", proveedor: "transbank", terminalId: puertoElegidoTransbank, activo: true, ultimaConexionOk: new Date().toISOString() }])
        setMarcaAbierta(null)
        setPuertosTransbank(null)
        setPuertoElegidoTransbank("")
        setTransbankProbado(false)
      } catch (err: any) {
        toast.error(err?.message ?? "Error al conectar")
      }
    })
  }

  // BCI Pagos no tiene "probar" separado de "conectar": el código de
  // vinculación que se genera en el terminal (pantalla "Bind New EPOS")
  // dura solo ~5 minutos, así que se consume de una sola vez.
  function handleConectarBciPagos() {
    if (!appIdBci.trim() || !appSecretBci.trim() || !codigoBci.trim()) { toast.error("Completa el APP ID, el APP Secret y el código de vinculación"); return }
    startTransition(async () => {
      try {
        await conectarBciPagos(appIdBci.trim(), appSecretBci.trim(), codigoBci.trim())
        toast.success("✅ Máquina conectada")
        setConexiones(prev => [...prev.filter(c => c.proveedor !== "bcipagos"), { id: "temp", proveedor: "bcipagos", terminalId: null, activo: true, ultimaConexionOk: new Date().toISOString() }])
        setMarcaAbierta(null)
        setAppIdBci("")
        setAppSecretBci("")
        setCodigoBci("")
      } catch (err: any) {
        toast.error(err?.message ?? "Error al conectar")
      }
    })
  }

  function handleDesconectar(proveedor: string) {
    startTransition(async () => {
      try {
        await desconectarPago(proveedor)
        setConexiones(prev => prev.filter(c => c.proveedor !== proveedor))
        toast.success("Desconectado")
      } catch (err: any) {
        toast.error(err?.message ?? "Error")
      }
    })
  }

  return (
    <div className="bg-[var(--c-card)] border border-[var(--c-border)] rounded-2xl p-5">
      <h2 className="text-sm font-bold text-[var(--c-text)] mb-1">💳 Máquinas de pago</h2>
      <p className="text-xs text-[var(--c-text3)] mb-4">Conecta tu máquina para cobrar directo desde Venta, sin tipear el monto dos veces.</p>

      <div className="space-y-2">
        {MARCAS.map(marca => {
          const conectada = conexiones.find(c => c.proveedor === marca.id)
          return (
            <div key={marca.id} className="border border-[var(--c-border)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{marca.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--c-text)]">{marca.nombre}</p>
                    {conectada && <p className="text-[10px] text-emerald-400">Conectado — terminal {conectada.terminalId}</p>}
                    {!marca.disponible && <p className="text-[10px] text-[var(--c-text4)]">Próximamente</p>}
                  </div>
                </div>
                {marca.disponible ? (
                  conectada ? (
                    <button onClick={() => handleDesconectar(marca.id)} disabled={isPending}
                      className="text-xs px-3 py-1.5 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/10 transition-all disabled:opacity-50">
                      Desconectar
                    </button>
                  ) : (
                    <button onClick={() => setMarcaAbierta(marcaAbierta === marca.id ? null : marca.id)}
                      className="text-xs px-3 py-1.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg hover:bg-sky-500/20 transition-all">
                      + Conectar
                    </button>
                  )
                ) : (
                  <span className="text-[10px] text-[var(--c-text4)] px-2">No disponible aún</span>
                )}
              </div>

              {marcaAbierta === marca.id && marca.id === "mercadopago" && !conectada && (
                <div className="px-4 pb-4 pt-1 border-t border-[var(--c-border)] space-y-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Access Token</label>
                    <input type="password" value={accessToken} onChange={e => { setAccessToken(e.target.value); setTerminales(null) }}
                      placeholder="APP_USR-..." className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">Lo encuentras en tu cuenta de Mercado Pago → Tus integraciones → Credenciales.</p>
                  </div>

                  {!terminales && (
                    <button onClick={handleProbarConexion} disabled={isPending}
                      className="h-9 px-4 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] text-xs font-semibold rounded-lg hover:border-sky-500/40 transition-all disabled:opacity-50">
                      {isPending ? "Buscando..." : "Probar conexión"}
                    </button>
                  )}

                  {terminales && (
                    <>
                      <div>
                        <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Terminal encontrada</label>
                        <select value={terminalElegida} onChange={e => setTerminalElegida(e.target.value)}
                          className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500">
                          {terminales.map(t => <option key={t.id} value={t.id}>{t.id} {t.operatingMode !== "PDV" ? "(⚠️ modo standalone)" : ""}</option>)}
                        </select>
                        {terminales.find(t => t.id === terminalElegida)?.operatingMode !== "PDV" && (
                          <p className="text-[10px] text-[var(--c-warning)] mt-1">⚠️ Esta terminal está en modo "standalone" — hay que cambiarla a modo integrado (PDV) desde la app de Mercado Pago antes de poder cobrar desde Nelyx.</p>
                        )}
                      </div>
                      <button onClick={handleConectar} disabled={isPending}
                        className="h-10 px-4 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 w-full">
                        {isPending ? "Conectando..." : "✅ Conectar esta terminal"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {marcaAbierta === marca.id && marca.id === "tuu" && !conectada && (
                <div className="px-4 pb-4 pt-1 border-t border-[var(--c-border)] space-y-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">API Key</label>
                    <input type="password" value={apiKeyTuu} onChange={e => { setApiKeyTuu(e.target.value); setTuuValidado(false) }}
                      placeholder="API Key de TUU" className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">La encuentras en tu Espacio de Trabajo de TUU (espacio.haulmer.com), en la sección de integración.</p>
                  </div>

                  {!tuuValidado && (
                    <button onClick={handleProbarConexionTuu} disabled={isPending}
                      className="h-9 px-4 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] text-xs font-semibold rounded-lg hover:border-sky-500/40 transition-all disabled:opacity-50">
                      {isPending ? "Validando..." : "Probar conexión"}
                    </button>
                  )}

                  {tuuValidado && (
                    <>
                      <div>
                        <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Número de serie del terminal</label>
                        <input value={deviceTuu} onChange={e => setDeviceTuu(e.target.value)}
                          placeholder="TJ44245N20440" className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                        <p className="text-[10px] text-[var(--c-text4)] mt-1">Está impreso atrás del terminal. Antes de conectar, activa "modo integración" en la app de pagos del terminal (se habilita primero desde el Espacio de Trabajo).</p>
                      </div>
                      <button onClick={handleConectarTuu} disabled={isPending}
                        className="h-10 px-4 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 w-full">
                        {isPending ? "Conectando..." : "✅ Conectar esta terminal"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {marcaAbierta === marca.id && marca.id === "sumup" && !conectada && (
                <div className="px-4 pb-4 pt-1 border-t border-[var(--c-border)] space-y-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">API Key</label>
                    <input type="password" value={apiKeySumup} onChange={e => { setApiKeySumup(e.target.value); setLectoresSumup(null) }}
                      placeholder="sup_sk_..." className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Código de comercio</label>
                    <input value={merchantCodeSumup} onChange={e => { setMerchantCodeSumup(e.target.value); setLectoresSumup(null) }}
                      placeholder="Ej: MB436VFT" className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">Ambos datos están en tu cuenta de SumUp, en Ajustes → Para desarrolladores → Claves API (el código de comercio aparece arriba a la izquierda, junto al nombre de la cuenta).</p>
                  </div>

                  {!lectoresSumup && (
                    <button onClick={handleProbarConexionSumup} disabled={isPending}
                      className="h-9 px-4 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] text-xs font-semibold rounded-lg hover:border-sky-500/40 transition-all disabled:opacity-50">
                      {isPending ? "Buscando..." : "Probar conexión"}
                    </button>
                  )}

                  {lectoresSumup && (
                    <>
                      <div>
                        <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Lector encontrado</label>
                        <select value={lectorElegidoSumup} onChange={e => setLectorElegidoSumup(e.target.value)}
                          className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500">
                          {lectoresSumup.map(l => <option key={l.id} value={l.id}>{l.nombre} ({l.estado})</option>)}
                        </select>
                      </div>
                      <button onClick={handleConectarSumup} disabled={isPending}
                        className="h-10 px-4 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 w-full">
                        {isPending ? "Conectando..." : "✅ Conectar esta terminal"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {marcaAbierta === marca.id && marca.id === "transbank" && !conectada && (
                <div className="px-4 pb-4 pt-1 border-t border-[var(--c-border)] space-y-3">
                  <div className="bg-[var(--c-card2)] border border-[var(--c-border)] rounded-xl px-3 py-2.5 space-y-1">
                    <p className="text-[11px] font-semibold text-[var(--c-text2)]">Antes de conectar, en este mismo computador:</p>
                    <p className="text-[10px] text-[var(--c-text4)]">1. Instala el <a href="https://github.com/TransbankDevelopers/transbank-pos-sdk-web-agent2/releases/latest" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">Agente Transbank</a> (queda corriendo solo, se inicia con el computador).</p>
                    <p className="text-[10px] text-[var(--c-text4)]">2. Conecta el POS por cable USB o serial a este computador.</p>
                    <p className="text-[10px] text-[var(--c-text4)]">3. En el POS: menú Comercio → clave supervisora (123456 por defecto) → POS Integrado → Conectar Caja.</p>
                    <p className="text-[10px] text-[var(--c-text4)]">La primera vez el navegador puede pedirte confiar en el certificado del Agente — es normal, acéptalo.</p>
                  </div>

                  {!puertosTransbank && (
                    <button onClick={handleBuscarPuertosTransbank} disabled={isPending}
                      className="h-9 px-4 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] text-xs font-semibold rounded-lg hover:border-sky-500/40 transition-all disabled:opacity-50">
                      {isPending ? "Buscando..." : "Buscar mi POS"}
                    </button>
                  )}

                  {puertosTransbank && (
                    <>
                      <div>
                        <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Puerto encontrado</label>
                        <select value={puertoElegidoTransbank} onChange={e => { setPuertoElegidoTransbank(e.target.value); setTransbankProbado(false) }}
                          className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500">
                          {puertosTransbank.map(p => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
                        </select>
                      </div>

                      {!transbankProbado ? (
                        <button onClick={handleProbarPuertoTransbank} disabled={isPending}
                          className="h-9 px-4 bg-[var(--c-card2)] border border-[var(--c-border)] text-[var(--c-text2)] text-xs font-semibold rounded-lg hover:border-sky-500/40 transition-all disabled:opacity-50 w-full">
                          {isPending ? "Probando..." : "Probar conexión"}
                        </button>
                      ) : (
                        <button onClick={handleConectarTransbank} disabled={isPending}
                          className="h-10 px-4 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 w-full">
                          {isPending ? "Conectando..." : "✅ Conectar esta terminal"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {marcaAbierta === marca.id && marca.id === "bcipagos" && !conectada && (
                <div className="px-4 pb-4 pt-1 border-t border-[var(--c-border)] space-y-3">
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">APP ID</label>
                    <input value={appIdBci} onChange={e => setAppIdBci(e.target.value)}
                      placeholder="Ej: 600045" className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">APP Secret</label>
                    <input type="password" value={appSecretBci} onChange={e => setAppSecretBci(e.target.value)}
                      className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">Te los entrega BCI Pagos al crear tu aplicación en la Nube.</p>
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--c-text3)] font-semibold block mb-1">Código de vinculación</label>
                    <input value={codigoBci} onChange={e => setCodigoBci(e.target.value)}
                      placeholder="5 dígitos" className="w-full h-10 bg-[var(--c-input)] border border-[var(--c-border)] rounded-xl px-3 text-sm text-[var(--c-text)] outline-none focus:border-sky-500" />
                    <p className="text-[10px] text-[var(--c-text4)] mt-1">En el terminal: Configuración → Connection Mode → Cloud → "Bind New EPOS". Dura ~5 minutos, así que ingrésalo apenas aparezca.</p>
                  </div>
                  <button onClick={handleConectarBciPagos} disabled={isPending}
                    className="h-10 px-4 bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 w-full">
                    {isPending ? "Conectando..." : "✅ Conectar esta terminal"}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
