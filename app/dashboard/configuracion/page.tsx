import type { Metadata } from "next"
import { obtenerConfigNotificaciones } from "@/app/actions/notificaciones-acciones"
import { obtenerPlantillasCobranza } from "@/app/actions/cobranza-acciones"
import { obtenerTodasCategoriasPersonalizadas } from "@/app/actions/acciones"
import { obtenerConexionesPago } from "@/app/actions/pagos-acciones"
import { ConfigNotificacionesClient } from "@/components/configuracion/config-notificaciones-client"
import { DiagnosticoPushClient } from "@/components/configuracion/diagnostico-push-client"
import { PlantillasCobranzaClient } from "@/components/configuracion/plantillas-cobranza-client"
import { CategoriasConfigClient } from "@/components/configuracion/categorias-config-client"
import { ConexionMaquinaPagoClient } from "@/components/configuracion/conexion-maquina-pago-client"

export const metadata: Metadata = { title: "Configuración" }
export const dynamic = "force-dynamic"

const CAMPOS = ["calendario","tareas","deudas","costosFijos","cuentasCobrar","clientes","inventario","reportes","renovaciones","alertasGenerales"] as const

export default async function ConfiguracionPage() {
  const [cfgRaw, plantillas, categorias, conexionesPago] = await Promise.all([obtenerConfigNotificaciones(), obtenerPlantillasCobranza(), obtenerTodasCategoriasPersonalizadas(), obtenerConexionesPago()])
  const cfg: Record<string, boolean> = {}
  for (const campo of CAMPOS) cfg[campo] = cfgRaw[campo]

  return (
    <div className="space-y-4 animate-fade-up max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Configuración</h1>
        <p className="text-sm text-[var(--c-text3)] mt-0.5">Administra tus preferencias en NELYX.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <ConexionMaquinaPagoClient conexiones={conexionesPago} />
          <DiagnosticoPushClient />
          <ConfigNotificacionesClient cfg={cfg} />
        </div>
        <div className="space-y-4">
          <CategoriasConfigClient categorias={categorias} />
          <PlantillasCobranzaClient plantillas={plantillas} />
        </div>
      </div>
    </div>
  )
}
