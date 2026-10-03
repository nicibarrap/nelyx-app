import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "sonner"
import { EmojiConsistente } from "@/components/shared/emoji-consistente"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "Nelyx", template: "%s — Nelyx" },
  description: "Gestión financiera para emprendedores y pequeños negocios",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nelyx",
  },
}

export const viewport: Viewport = {
  themeColor: "#0B1220",
  width: "device-width",
  initialScale: 1,
  // Sin maximumScale fijo en 1 — bloqueaba el pellizco para hacer zoom en
  // toda la app, justo el tipo de ajuste que más pesa para el público real
  // (dueños de local, a veces con vista cansada, leyendo montos y stock).
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // El tema se lee de una cookie (no solo localStorage) para que el HTML
  // ya nazca con la clase correcta desde el servidor — antes dependía de
  // un script en el cliente que corriera antes del primer pintado, lo que
  // en una recarga podía perderse (ej. storage bloqueado/particionado en
  // ciertos navegadores móviles) y la página volvía a verse oscura aunque
  // la persona hubiera elegido claro.
  const cookieStore = await cookies()
  const esClaro = cookieStore.get("nelyx-theme")?.value === "light"

  return (
    <html lang="es" className={esClaro ? "light" : undefined} suppressHydrationWarning>
      <head>
        {/* Migración de la preferencia vieja (solo localStorage) a la
            cookie, para quienes ya habían elegido modo claro antes de
            este cambio — una sola vez, después el servidor manda. */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (!document.documentElement.classList.contains('light') && localStorage.getItem('nelyx-theme') === 'light') {
              document.documentElement.classList.add('light')
              document.cookie = 'nelyx-theme=light; path=/; max-age=31536000; samesite=lax'
            }
          } catch (e) {}
        `}} />
        {/* Después de cada despliegue, el navegador de alguien que ya tenía
            la app abierta puede quedar apuntando a archivos .js viejos que
            ya no existen en el servidor — se veía en Sentry como
            "Cannot read properties of undefined (reading 'call')" en
            páginas al azar. En vez de que la persona vea un error sin
            sentido, se detecta ese patrón puntual y se recarga una sola vez
            (con guarda de 10s para nunca entrar en loop). */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var KEY = 'nelyx-chunk-reload-ts';
              function esErrorDeChunk(msg) {
                if (!msg) return false;
                return /Loading chunk [\\d]+ failed|ChunkLoadError|Cannot read properties of undefined \\(reading 'call'\\)|Importing a module script failed/i.test(msg);
              }
              function intentarRecargar(msg) {
                if (!esErrorDeChunk(msg)) return;
                var ultimo = Number(sessionStorage.getItem(KEY) || 0);
                var ahora = Date.now();
                if (ahora - ultimo > 10000) {
                  sessionStorage.setItem(KEY, String(ahora));
                  window.location.reload();
                }
              }
              window.addEventListener('error', function(e){ intentarRecargar(e && e.message); });
              window.addEventListener('unhandledrejection', function(e){
                var msg = e && e.reason && (e.reason.message || String(e.reason));
                intentarRecargar(msg);
              });
            } catch (e) {}
          })();
        ` }} />
        {/* PWA */}
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <SessionProvider>
          {children}
          <EmojiConsistente />
          <Toaster richColors position="top-right" />
          {/* Register service worker */}
          <script dangerouslySetInnerHTML={{ __html: `
            if('serviceWorker' in navigator){
              window.addEventListener('load',function(){
                navigator.serviceWorker.register('/sw.js').catch(function(){});
              });
            }
          `}} />
        </SessionProvider>
      </body>
    </html>
  )
}
