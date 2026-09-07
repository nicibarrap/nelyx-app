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

export function EscanerCodigoBarras({ onDetectado, onCerrar, titulo = "Escanear código" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectadoRef = useRef(false)

  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [tieneLinterna, setTieneLinterna] = useState(false)
  const [linternaActiva, setLinternaActiva] = useState(false)
  const [tieneZoom, setTieneZoom] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [zoomMax, setZoomMax] = useState(1)
  const [resolucion, setResolucion] = useState<string | null>(null)

  const reportarDetectado = useCallback((texto: string) => {
    if (detectadoRef.current) return
    detectadoRef.current = true
    if (navigator.vibrate) navigator.vibrate(80)
    onDetectado(texto)
  }, [onDetectado])

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

    let cancelado = false

    // Paso 1: pedir el stream con la resolución forzada de verdad — "min" y
    // "max" además de "ideal", para que el navegador no pueda entregar algo
    // muy por debajo sin que lo notemos.
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { min: 1280, ideal: 1920, max: 2560 },
        height: { min: 720, ideal: 1080, max: 1440 },
      },
    }).then(async stream => {
      if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]

      // Paso 2: recién CON el stream ya andando, se piden por separado las
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
      iniciarLoopDecodificacion(reader)
    }).catch(() => {
      if (!cancelado) setError("No se pudo acceder a la cámara. Revisa los permisos del navegador.")
    })

    function iniciarLoopDecodificacion(reader: MultiFormatReader) {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return
      let ultimoIntento = 0

      function procesarFrame(ahora: number) {
        if (cancelado || detectadoRef.current) return
        if (ahora - ultimoIntento >= 100) {
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

              try {
                const luminancia = new HTMLCanvasElementLuminanceSource(canvas)
                const bitmap = new BinaryBitmap(new HybridBinarizer(luminancia))
                const resultado = reader.decode(bitmap)
                if (resultado) reportarDetectado(resultado.getText())
              } catch (e) {
                if (!(e instanceof NotFoundException)) { /* se reintenta en el próximo cuadro */ }
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
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const capacidades = track.getCapabilities?.() as any
    if (capacidades?.pointsOfInterest) {
      const rect = e.currentTarget.getBoundingClientRect()
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
        <p className="text-xs text-white/70 text-center max-w-xs mx-auto">
          Centra el código dentro del recuadro. Toca la pantalla para reenfocar si se ve borroso.
        </p>
      </div>
    </div>,
    document.body
  )
}
