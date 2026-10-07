"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  MultiFormatReader, DecodeHintType, BarcodeFormat,
  HTMLCanvasElementLuminanceSource, BinaryBitmap, HybridBinarizer, NotFoundException,
} from "@zxing/library"

interface Props {
  onDetectado: (codigo: string) => void
  onCerrar: () => void
  titulo?: string
}

const FORMATOS_PRODUCTO = [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
]

// Mismos formatos, en la nomenclatura de la BarcodeDetector API nativa del
// navegador (Chrome/Android) — que corre sobre el motor de reconocimiento de
// códigos del propio sistema operativo (ML Kit en Android), mucho más
// tolerante a desenfoque, ángulo y poca luz que decodificar cuadro a cuadro
// en JS puro. Se usa cuando el navegador la soporta; si no (Safari/iOS,
// navegadores viejos), se cae automáticamente al decodificador de
// @zxing/library de siempre — ningún dispositivo pierde la función, solo
// que en unos queda más preciso que en otros.
const FORMATOS_NATIVOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"]

type DetectorNativo = { detect: (fuente: CanvasImageSource) => Promise<{ rawValue: string }[]> }
declare global {
  interface Window {
    BarcodeDetector?: new (opciones?: { formats?: string[] }) => DetectorNativo
  }
}

export function EscanerCodigoBarras({ onDetectado, onCerrar, titulo = "Escanear código" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectadoRef = useRef(false)
  // Candidato a confirmar: mientras la cámara está desenfocada (sobre todo
  // apuntando de cerca, justo cuando recién se abre el escáner), un solo
  // cuadro puede decodificar un código con un dígito corrido y aceptarlo de
  // inmediato — "coloca cualquier código". Exigir el mismo valor en dos
  // lecturas seguidas (resuelto en ~66-100ms cuando el código sí es
  // correcto, imperceptible) filtra casi todas esas lecturas falsas: un
  // error de decodificación cambia el valor completo, así que acertar el
  // mismo valor erróneo dos veces seguidas es estadísticamente muy raro.
  const candidatoRef = useRef<{ texto: string; veces: number } | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [tieneLinterna, setTieneLinterna] = useState(false)
  const [linternaActiva, setLinternaActiva] = useState(false)
  const [tieneZoom, setTieneZoom] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [zoomMax, setZoomMax] = useState(1)
  const [resolucion, setResolucion] = useState<string | null>(null)
  // Si pasan varios segundos sin lograr una lectura, lo más probable no es
  // un problema de software sino que el celular está más cerca del producto
  // que la distancia mínima de enfoque del lente (~10-15cm en la mayoría de
  // cámaras traseras sin lente macro) — ningún reenfoque por software puede
  // compensar eso, así que se lo decimos directo al usuario.
  const [sugerenciaDistancia, setSugerenciaDistancia] = useState(false)
  // Breve anillo animado donde se tocó, para que quede claro que el toque
  // sí hizo algo (antes no había ninguna confirmación visual del reenfoque).
  const [puntoEnfoque, setPuntoEnfoque] = useState<{ x: number; y: number; key: number } | null>(null)

  const reportarDetectado = useCallback((texto: string) => {
    if (detectadoRef.current) return
    detectadoRef.current = true
    setSugerenciaDistancia(false)
    if (navigator.vibrate) navigator.vibrate(80)
    onDetectado(texto)
  }, [onDetectado])

  const LECTURAS_REQUERIDAS = 2
  const confirmarLectura = useCallback((texto: string) => {
    if (detectadoRef.current) return
    const candidato = candidatoRef.current
    if (candidato && candidato.texto === texto) {
      candidato.veces++
      if (candidato.veces >= LECTURAS_REQUERIDAS) reportarDetectado(texto)
    } else {
      candidatoRef.current = { texto, veces: 1 }
    }
  }, [reportarDetectado])

  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = original }
  }, [])

  // El escáner se renderiza vía portal directo a document.body (más abajo),
  // así que se monta recién en el cliente, nunca durante el render de servidor.
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])

  useEffect(() => {
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS_PRODUCTO)
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new MultiFormatReader()
    reader.setHints(hints)

    let detectorNativo: DetectorNativo | null = null
    if (typeof window !== "undefined" && window.BarcodeDetector) {
      try { detectorNativo = new window.BarcodeDetector({ formats: FORMATOS_NATIVOS }) } catch { detectorNativo = null }
    }

    let cancelado = false
    let intervaloReenfoque: ReturnType<typeof setInterval> | null = null
    let timeoutDistancia: ReturnType<typeof setTimeout> | null = null

    // Algunos celulares de gama baja no pueden cumplir el mínimo de
    // 1280×720 y el navegador rechaza el pedido entero con
    // OverconstrainedError — sin este respaldo, eso se veía igual que un
    // problema de permisos ("No se pudo acceder a la cámara"). Se reintenta
    // una vez sin el mínimo forzado antes de darlo por perdido.
    async function pedirCamara(): Promise<MediaStream> {
      const constraintsEstrictas: MediaStreamConstraints = {
        video: {
          facingMode: "environment",
          width: { min: 1280, ideal: 1920, max: 2560 },
          height: { min: 720, ideal: 1080, max: 1440 },
        },
      }
      try {
        return await navigator.mediaDevices.getUserMedia(constraintsEstrictas)
      } catch (err) {
        if (err instanceof Error && err.name === "OverconstrainedError") {
          return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          })
        }
        throw err
      }
    }

    pedirCamara().then(async stream => {
      if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]

      // Recién CON el stream ya andando, se piden por separado las
      // capacidades avanzadas (enfoque continuo). Pedirlo junto con la
      // resolución en la misma llamada inicial hace que algunos celulares
      // rechacen o ignoren silenciosamente todo el bloque "advanced".
      try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }) } catch {}

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      // Recién ahora, con el track ya asentado, se consultan zoom/linterna —
      // antes podía consultarse demasiado pronto y no reportar nada.
      await new Promise(r => setTimeout(r, 300))
      const capacidades = track.getCapabilities?.() as any
      if (capacidades?.torch) setTieneLinterna(true)
      if (capacidades?.zoom) {
        setTieneZoom(true)
        setZoomMax(capacidades.zoom.max ?? 1)
        setZoom(track.getSettings?.().zoom as number ?? capacidades.zoom.min ?? 1)
      }

      const settings = track.getSettings?.()
      if (settings?.width && settings?.height) setResolucion(`${settings.width}×${settings.height}`)

      setListo(true)
      iniciarLoopDecodificacion(reader, detectorNativo)

      // Si pasan varios segundos sin detectar nada, se fuerza un reenfoque
      // solo — en algunos celulares el enfoque continuo se "traba" mirando
      // a un punto borroso y no vuelve a ajustar por su cuenta, sobre todo
      // apuntando de cerca a un código de barras. Mismo truco que el toque
      // manual (handleTapEnfoque), pero automático mientras no hay lectura.
      // Intervalo corto (antes 3.5s) porque mientras no hay lectura esto es
      // lo único que puede destrabar un enfoque continuo "pegado".
      if (capacidades?.focusMode?.includes?.("continuous")) {
        intervaloReenfoque = setInterval(() => {
          if (cancelado || detectadoRef.current) return
          track.applyConstraints({ advanced: [{ focusMode: "manual" } as any] })
            .then(() => track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }))
            .catch(() => {})
        }, 1600)
      }

      // Pasados unos segundos sin lograr una lectura, lo más probable es que
      // el celular esté más cerca del código que la distancia mínima de
      // enfoque del lente — ahí ningún reenfoque por software ayuda, así
      // que se sugiere alejar el celular en vez de seguir reintentando a
      // ciegas.
      timeoutDistancia = setTimeout(() => {
        if (!cancelado && !detectadoRef.current) setSugerenciaDistancia(true)
      }, 4000)
    }).catch(() => {
      if (!cancelado) setError("No se pudo acceder a la cámara. Revisa los permisos del navegador.")
    })

    function iniciarLoopDecodificacion(reader: MultiFormatReader, detectorNativo: DetectorNativo | null) {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return
      let ultimoIntento = 0
      let procesando = false
      // El detector nativo corre sobre el motor del sistema operativo —
      // mucho más liviano que decodificar en JS, así que puede intentarlo
      // más seguido sin recargar el celular.
      const intervaloMs = detectorNativo ? 66 : 100

      function procesarFrame(ahora: number) {
        if (cancelado || detectadoRef.current) return
        if (!procesando && ahora - ultimoIntento >= intervaloMs) {
          ultimoIntento = ahora
          if (video!.readyState === video!.HAVE_ENOUGH_DATA) {
            const vw = video!.videoWidth, vh = video!.videoHeight
            if (vw > 0 && vh > 0) {
              const anchoRecorte = vw * 0.85
              const altoRecorte = vh * 0.42
              const x = (vw - anchoRecorte) / 2
              const y = (vh - altoRecorte) / 2

              canvas.width = anchoRecorte
              canvas.height = altoRecorte
              ctx.drawImage(video!, x, y, anchoRecorte, altoRecorte, 0, 0, anchoRecorte, altoRecorte)

              if (detectorNativo) {
                procesando = true
                detectorNativo.detect(canvas)
                  .then(resultados => { if (resultados.length > 0) confirmarLectura(resultados[0].rawValue) })
                  .catch(() => { /* se reintenta en el próximo cuadro */ })
                  .finally(() => { procesando = false })
              } else {
                try {
                  const luminancia = new HTMLCanvasElementLuminanceSource(canvas)
                  const bitmap = new BinaryBitmap(new HybridBinarizer(luminancia))
                  const resultado = reader.decode(bitmap)
                  if (resultado) confirmarLectura(resultado.getText())
                } catch (e) {
                  if (!(e instanceof NotFoundException)) { /* se reintenta en el próximo cuadro */ }
                }
              }
            }
          }
        }
        if (!detectadoRef.current) rafRef.current = requestAnimationFrame(procesarFrame)
      }
      rafRef.current = requestAnimationFrame(procesarFrame)
    }

    return () => {
      cancelado = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (intervaloReenfoque) clearInterval(intervaloReenfoque)
      if (timeoutDistancia) clearTimeout(timeoutDistancia)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleLinterna() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const nuevoEstado = !linternaActiva
    track.applyConstraints({ advanced: [{ torch: nuevoEstado } as any] }).then(() => setLinternaActiva(nuevoEstado)).catch(() => {})
  }

  function cambiarZoom(valor: number) {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.applyConstraints({ advanced: [{ zoom: valor } as any] }).then(() => setZoom(valor)).catch(() => {})
  }

  // Reenfocar al tocar la pantalla. "pointsOfInterest" (enfocar un punto
  // exacto) casi ningún navegador lo soporta todavía — como respaldo real,
  // se apaga y prende el enfoque continuo, un truco conocido para forzar
  // que la cámara vuelva a enfocar desde cero en vez de quedarse "pegada".
  async function handleTapEnfoque(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setPuntoEnfoque({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() })

    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const capacidades = track.getCapabilities?.() as any
    if (capacidades?.pointsOfInterest) {
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }] } as any] }).catch(() => {})
    } else if (capacidades?.focusMode?.includes("continuous")) {
      try {
        await track.applyConstraints({ advanced: [{ focusMode: "manual" } as any] })
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] })
      } catch {}
    }
  }

  if (!montado) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black h-dvh overflow-hidden">
      <div className="absolute inset-0" onClick={handleTapEnfoque}>
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
        <canvas ref={canvasRef} className="hidden" />
        {puntoEnfoque && (
          <div
            key={puntoEnfoque.key}
            className="absolute w-16 h-16 border-2 border-sky-300 rounded-full pointer-events-none animate-enfoque-tap"
            style={{ left: puntoEnfoque.x - 32, top: puntoEnfoque.y - 32 }}
          />
        )}
      </div>

      {!error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[88%] max-w-sm h-[38%] border-2 border-sky-400/90 rounded-2xl overflow-hidden" style={{ boxShadow: "0 0 0 999px rgba(0,0,0,0.55)" }}>
            {listo && <div className="absolute left-0 right-0 h-0.5 bg-sky-400 shadow-[0_0_10px_3px_rgba(56,189,248,0.85)] animate-escaner-linea" />}
            {["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map(pos => (
              <div key={pos} className={`absolute w-6 h-6 border-sky-300 ${pos}`} />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center bg-black">
          <span className="text-3xl">📷</span>
          <p className="text-sm text-white/80">{error}</p>
        </div>
      )}
      {!listo && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-white/60">Iniciando cámara...</p>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <div>
          <p className="text-sm font-semibold text-white drop-shadow">{titulo}</p>
          {resolucion && <p className="text-[10px] text-white/50">Cámara: {resolucion}</p>}
        </div>
        <div className="flex items-center gap-2">
          {tieneLinterna && (
            <button onClick={toggleLinterna} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${linternaActiva ? "bg-amber-400 text-black" : "bg-white/15 hover:bg-white/25 text-white"}`}>
              💡
            </button>
          )}
          <button onClick={onCerrar} className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center">✕</button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 bg-gradient-to-t from-black/70 to-transparent">
        {tieneZoom && (
          <div className="flex items-center gap-2 mb-3 max-w-sm mx-auto">
            <span className="text-xs text-white/70">🔍</span>
            <input type="range" min={1} max={zoomMax} step={0.1} value={zoom} onChange={e => cambiarZoom(parseFloat(e.target.value))} className="flex-1" />
          </div>
        )}
        {sugerenciaDistancia ? (
          <p className="text-xs text-amber-300 text-center max-w-xs mx-auto font-medium animate-fade-in">
            📏 ¿Se ve borroso? Aleja el celular unos 10-15 cm del código — más cerca que eso, la cámara no puede enfocar.
          </p>
        ) : (
          <p className="text-xs text-white/70 text-center max-w-xs mx-auto">
            Centra el código dentro del recuadro. Toca la pantalla para reenfocar si se ve borroso.
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
