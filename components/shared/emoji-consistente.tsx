"use client"
import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import twemoji from "twemoji"

// CDN de jsdelivr (espejo confiable y gratuito del repositorio oficial de
// Twemoji) — SVG en vez de PNG: mucho más liviano y se ve nítido en
// cualquier tamaño de pantalla, incluidas las de alta densidad (Retina).
const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/"

function aplicarEmojisConsistentes() {
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

  // Cada vez que cambia de página (navegación del lado del cliente, sin
  // recarga), hay contenido nuevo que revisar.
  useEffect(() => {
    aplicarEmojisConsistentes()
  }, [pathname])

  // Contenido que aparece SIN cambiar de página (abrir un modal, un toast,
  // datos que llegan después de una carga) también necesita revisarse —
  // un observador que mira cualquier cambio en la página, con una pequeña
  // espera para no repetir el trabajo decenas de veces por segundo.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(aplicarEmojisConsistentes, 150)
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return null
}
