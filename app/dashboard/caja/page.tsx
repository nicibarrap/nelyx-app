import type { Metadata } from "next"
import { obtenerCajaActual, obtenerHistorialCajas } from "@/app/actions/caja-acciones"
import { CajaClient } from "@/components/caja/caja-client"

export const metadata: Metadata = { title: "Caja" }

export default async function CajaPage() {
  const [actual, historial] = await Promise.all([
    obtenerCajaActual(),
    obtenerHistorialCajas(),
  ])

  return <CajaClient actual={actual} historialInicial={historial} />
}
