"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const INTERVALO_MS = 45 * 1000

/**
 * Si el dueño cambia los módulos de un empleado MIENTRAS ese empleado sigue
 * con la pantalla abierta (sin navegar ni recargar), nada en el cliente se
 * entera solo — ni el sidebar ni la página en pantalla se actualizan por sí
 * mismos: Next.js no vuelve a pedir los Server Components de un layout ya
 * montado hasta que hay una navegación real o un router.refresh() explícito
 * (bug real encontrado probando en producción: el dueño le quitaba
 * Calendario/Configuración a un empleado y le daba Venta/Movimientos, y el
 * empleado seguía viendo el sidebar y la pantalla de antes, sin ningún
 * aviso, hasta que por su cuenta recargaba). Las Server Actions ya estaban
 * protegidas (ver lib/sesion-activa.ts) — esto es sobre lo que se VE, no
 * sobre lo que de verdad se puede hacer.
 *
 * router.refresh() vuelve a pedir el árbol de Server Components de la URL
 * actual sin perder el estado del cliente (como si el usuario navegara a la
 * misma página) — eso incluye al layout (Sidebar con los módulos frescos) y
 * pasa de nuevo por el middleware, que expulsa a /dashboard/sin-permiso si
 * la página en la que está ya no le corresponde. Mismo patrón que
 * AutoRevalidarReconexion (ahí es la conexión; acá son los permisos), y
 * mismo gatillo "sin esEmpleado, no corre nada" que AutoLogoutEmpleado — el
 * dueño nunca tiene módulos restringidos, así que nunca hace falta para él.
 *
 * Dos disparadores, no solo uno: el intervalo es la red de seguridad para
 * una pantalla que se queda abierta sin que nadie cambie de pestaña (un
 * mostrador con la pantalla siempre visible); visibilitychange hace que,
 * además, el cambio se note de inmediato apenas alguien vuelve a mirar la
 * pantalla, en vez de tener que esperar hasta el próximo tick del
 * intervalo.
 */
export function AutoRevalidarPermisos({ esEmpleado }: { esEmpleado?: boolean }) {
  const router = useRouter()
  const ultimoRefresh = useRef(0)

  useEffect(() => {
    if (!esEmpleado) return

    function refrescar() {
      // Evita refrescar dos veces seguidas si el intervalo y
      // visibilitychange caen casi al mismo tiempo.
      const ahora = Date.now()
      if (ahora - ultimoRefresh.current < 5000) return
      ultimoRefresh.current = ahora
      router.refresh()
    }

    const intervalo = setInterval(refrescar, INTERVALO_MS)
    function alVolverVisible() {
      if (document.visibilityState === "visible") refrescar()
    }
    document.addEventListener("visibilitychange", alVolverVisible)

    return () => {
      clearInterval(intervalo)
      document.removeEventListener("visibilitychange", alVolverVisible)
    }
  }, [esEmpleado, router])

  return null
}
