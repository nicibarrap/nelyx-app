"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

/**
 * Si el dueño se queda viendo una pantalla (stock, cuentas por cobrar,
 * resumen) mientras pierde la conexión un rato, los números en pantalla
 * quedan congelados en el momento en que cargó la página — sin ningún
 * aviso de que están desactualizados. Al volver la conexión, se refresca
 * la página actual para traer los datos reales (otro empleado puede haber
 * vendido o cobrado algo mientras tanto).
 */
export function AutoRevalidarReconexion() {
  const router = useRouter()
  const offlineRef = useRef(false)

  useEffect(() => {
    function alVolver() {
      // Solo si realmente hubo un corte — "online" también puede dispararse
      // en otras situaciones del navegador sin que haya pasado por offline.
      if (!offlineRef.current) return
      offlineRef.current = false
      router.refresh()
      toast.info("Conexión recuperada — datos actualizados", { duration: 4000 })
    }
    function alPerder() {
      offlineRef.current = true
    }

    window.addEventListener("online", alVolver)
    window.addEventListener("offline", alPerder)
    return () => {
      window.removeEventListener("online", alVolver)
      window.removeEventListener("offline", alPerder)
    }
  }, [router])

  return null
}
