import type { Metadata } from "next"
import { obtenerConfigNotificaciones } from "@/app/actions/notificaciones-acciones"
import { obtenerPlantillasCobranza } from "@/app/actions/cobranza-acciones"
import { obtenerConexionesPago } from "@/app/actions/pagos-acciones"
import { obtenerProyectosTarea } from "@/app/actions/acciones"
import { ConfigNotificacionesClient } from "@/components/configuracion/config-notificaciones-client"
import { DiagnosticoPushClient } from "@/components/configuracion/diagnostico-push-client"
import { PlantillasCobranzaClient } from "@/components/configuracion/plantillas-cobranza-client"
import { ConexionMaquinaPagoClient } from "@/components/configuracion/conexion-maquina-pago-client"
import { ProyectosTareaClient } from "@/components/configuracion/proyectos-tarea-client"

export const metadata: Metadata = { title: "Configuración" }
export const dynamic = "force-dynamic"

const CAMPOS = ["calendario","tareas","deudas","costosFijos","cuentasCobrar","clientes","inventario","reportes","renovaciones","alertasGenerales"] as const

function SeccionLabel({ label }: { label: string }) {
  return <p className="text-[11px] font-semibold text-[var(--c-text4)] uppercase tracking-wider px-1">{label}</p>
}

export default async function ConfiguracionPage() {
  const [cfgRaw, plantillas, conexionesPago, proyectosTarea] = await Promise.all([obtenerConfigNotificaciones(), obtenerPlantillasCobranza(), obtenerConexionesPago(), obtenerProyectosTarea()])
  const cfg: Record<string, boolean> = {}
  for (const campo of CAMPOS) cfg[campo] = cfgRaw[campo]

  return (
    <div className="space-y-5 animate-fade-up max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Configuración</h1>
        <p className="text-sm text-[var(--c-text3)] mt-0.5">Administra tus preferencias en NELYX.</p>
      </div>

      {/* Agrupado por tema, no por dónde "cupiera" — así se entiende de
          un vistazo qué hace cada sección. 2 columnas en pantallas
          grandes (aprovechando el espacio), 1 sola en celular. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="space-y-5">
          <div className="space-y-3">
            <SeccionLabel label="💳 Pagos" />
            <ConexionMaquinaPagoClient conexiones={conexionesPago} />
          </div>
          <div className="space-y-3">
            <SeccionLabel label="🔔 Notificaciones" />
            <ConfigNotificacionesClient cfg={cfg} />
          </div>
        </div>
        <div className="space-y-5">
          <div className="space-y-3">
            <SeccionLabel label="📋 Cobranza" />
            <PlantillasCobranzaClient plantillas={plantillas} />
          </div>
          <div className="space-y-3">
            <SeccionLabel label="🔧 Diagnóstico técnico" />
            <DiagnosticoPushClient />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <SeccionLabel label="🗂️ Tareas" />
        <ProyectosTareaClient proyectos={proyectosTarea} />
      </div>
    </div>
  )
}
