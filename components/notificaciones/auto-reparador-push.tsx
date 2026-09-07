"use client"
import { useEffect } from "react"
import { asegurarSuscripcionPush } from "@/components/notificaciones/push-client"

/**
 * Se monta en el layout del dashboard. Si el permiso del navegador ya está
 * en "granted" pero no hay una suscripción push guardada en el servidor
 * (por ejemplo, porque el primer intento falló en silencio, o el usuario
 * limpió datos del navegador), la repara automáticamente en segundo plano.
 * No muestra nada — es responsable de que "permiso concedido" siempre
 * termine en una suscripción real y funcional.
 */
export function AutoReparadorPush() {
  useEffect(() => {
    if (typeof Notification === "undefined") return
    if (Notification.permission !== "granted") return
    asegurarSuscripcionPush().catch(() => {})
  }, [])
  return null
}
