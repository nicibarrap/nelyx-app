import type { Metadata, Viewport } from "next"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "sonner"
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
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado ANTES de pintar — evita el parpadeo de
            "se ve oscuro un instante y después cambia a claro" al cargar. */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.getItem('nelyx-theme') === 'light') {
              document.documentElement.classList.add('light')
            }
          } catch (e) {}
        `}} />
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
