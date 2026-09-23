"use client"
import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import twemoji from "twemoji"

// CDN de jsdelivr (espejo confiable y gratuito del repositorio oficial de
// Twemoji) — SVG en vez de PNG: mucho más liviano y se ve nítido en
// cualquier tamaño de pantalla, incluidas las de alta densidad (Retina).
const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/"

// Si el CDN no responde varias veces seguidas (red que lo bloquea, sin
// internet), se deja de intentar por el resto de la sesión — sin esto,
// cada navegación o cambio en la pantalla dispara una nueva tanda de
// peticiones que también van a fallar, indefinidamente.
const MAX_FALLOS_SEGUIDOS = 15
let fallosSeguidos = 0
let deshabilitado = false

function aplicarEmojisConsistentes() {
  if (deshabilitado) return
  try {
    twemoji.parse(document.body, {
      folder: "svg",
      ext: ".svg",
      base: TWEMOJI_BASE,
      className: "emoji-nelyx",
      // Si la imagen no llega a cargar (sin internet, CDN caído), el
      // propio navegador muestra el "alt" en su lugar — que Twemoji ya
      // deja como el emoji original — así nunca se ve un ícono roto,
      // en el peor caso vuelve a como se veía antes.
    })
  } catch {
    // Si algo falla, simplemente se quedan los emojis nativos de siempre
    // — nunca debe romper la página por esto.
  }
}

/**
 * Reemplaza los emojis nativos (que cada sistema operativo dibuja distinto)
 * por una versión consistente e idéntica en cualquier dispositivo — mismo
 * mecanismo que usan Discord, Slack y X/Twitter. No toca ningún componente
 * existente: escanea el HTML ya renderizado y sustituye ahí mismo.
 */
export function EmojiConsistente() {
  const pathname = usePathname()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const observerRef = useRef<MutationObserver | null>(null)

  // Cada <img> que se inserta es en sí misma una mutación del DOM — sin
  // desconectar el observador mientras se aplica, se dispara a sí mismo
  // en bucle: aplica → inserta imágenes → el observador lo detecta como
  // cambio → vuelve a aplicar → ... Si esas imágenes encima fallan en
  // cargar (CDN bloqueado), el bucle nunca se frena solo y termina
  // disparando cientos de peticiones por segundo sin parar.
  function aplicarYReconectar() {
    observerRef.current?.disconnect()
    aplicarEmojisConsistentes()
    observerRef.current?.observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  useEffect(() => {
    aplicarYReconectar()
  }, [pathname])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(aplicarYReconectar, 150)
    })
    observerRef.current = observer
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    // Cuenta fallos de carga de las imágenes de emoji (fase de captura:
    // el evento "error" de <img> no burbujea) para activar el freno de
    // MAX_FALLOS_SEGUIDOS. Un emoji que sí carga bien reinicia el conteo.
    function onError(e: Event) {
      const target = e.target as HTMLElement
      if (target?.tagName !== "IMG" || !target.classList.contains("emoji-nelyx")) return
      fallosSeguidos++
      if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) deshabilitado = true
    }
    function onLoad(e: Event) {
      const target = e.target as HTMLElement
      if (target?.tagName !== "IMG" || !target.classList.contains("emoji-nelyx")) return
      fallosSeguidos = 0
    }
    document.body.addEventListener("error", onError, true)
    document.body.addEventListener("load", onLoad, true)

    return () => {
      observer.disconnect()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      document.body.removeEventListener("error", onError, true)
      document.body.removeEventListener("load", onLoad, true)
    }
  }, [])

  return null
}
