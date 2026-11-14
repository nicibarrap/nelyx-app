"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { moduloDeRuta, tieneAcceso } from "@/lib/permisos"

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
 *
 * Endurecimiento extra sobre el router.refresh() de arriba: el dueño
 * reportó un caso en producción donde, al quitarle Venta a un empleado
 * parado justo en esa pantalla (dándole otro módulo distinto al mismo
 * tiempo), el sidebar se actualizaba solo pero el contenido de Venta se
 * quedaba pegado en pantalla. No se logró reproducir esa variante exacta
 * con el middleware funcionando normal — en el único intento de
 * reproducirla en limpio, un router.refresh() de los de siempre ya
 * redirigía bien a "no tienes acceso" — así que puede haber sido
 * propagación del deploy o el Service Worker de la PWA sirviendo un
 * bundle viejo en ese momento, no esto. De todos modos, antes de pedir el
 * refresh "suave" ahora se chequea de verdad (mismo endpoint que ya usa
 * el middleware) si la página en la que está parado el empleado AHORA
 * MISMO sigue siendo válida; si no — perdió el módulo actual, o la cuenta
 * se desactivó — se fuerza una recarga dura (window.location.reload) en
 * vez de un refresh suave, que pasa de nuevo por el middleware desde cero
 * y no depende de que el Router Cache del cliente resuelva bien una
 * redirección a mitad de camino (mismo motivo por el que login-form.tsx
 * ya evita router.push() para entrar al dashboard — ver su comentario).
 * Si sigue siendo válida, el router.refresh() de siempre alcanza (no
 * pierde lo que el empleado tenga escrito en un formulario a medio
 * llenar).
 */
export function AutoRevalidarPermisos({ esEmpleado }: { esEmpleado?: boolean }) {
  const router = useRouter()
  const ultimoRefresh = useRef(0)

  useEffect(() => {
    if (!esEmpleado) return

    async function refrescar() {
      // Evita refrescar dos veces seguidas si el intervalo y
      // visibilitychange caen casi al mismo tiempo.
      const ahora = Date.now()
      if (ahora - ultimoRefresh.current < 5000) return
      ultimoRefresh.current = ahora

      try {
        const res = await fetch("/api/check-session", { cache: "no-store" })
        const data: { activo: boolean; modulosPermitidos: string[] | null } = await res.json()
        const moduloActual = moduloDeRuta(window.location.pathname)
        const sigueViendoAlgoValido = data.activo && (!moduloActual || tieneAcceso(data.modulosPermitidos, moduloActual))
        if (!sigueViendoAlgoValido) {
          window.location.reload()
          return
        }
      } catch {
        // Un error de red pasajero no debe forzar nada — se reintenta solo
        // en el próximo tick.
        return
      }
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
