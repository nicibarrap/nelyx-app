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
import { SeccionColapsable } from "@/components/configuracion/seccion-colapsable"

export const metadata: Metadata = { title: "Configuración" }
export const dynamic = "force-dynamic"

const CAMPOS = ["calendario","tareas","deudas","costosFijos","cuentasCobrar","clientes","inventario","reportes","renovaciones","alertasGenerales"] as const

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

      {/* Orden de arriba hacia abajo = importancia/frecuencia de uso para
          el día a día del negocio: primero cómo te enteras de lo que pasa
          (Notificaciones) y cómo cobras (Pagos, Cobranza), después cómo
          organizas tus tareas (Tareas) y por último una herramienta de
          soporte que casi nunca hace falta tocar (Diagnóstico técnico).

          En celular y tablet (hasta lg:) cada sección es un acordeón
          colapsado — solo Notificaciones arranca abierta — para no
          obligar a hacer scroll por todo de una. En pc (lg:+, con espacio
          de sobra) todo queda expandido en 2 columnas, como antes. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="space-y-5">
          <SeccionColapsable icon="🔔" titulo="Notificaciones" defaultOpen>
            <ConfigNotificacionesClient cfg={cfg} />
          </SeccionColapsable>
          <SeccionColapsable icon="📋" titulo="Cobranza">
            <PlantillasCobranzaClient plantillas={plantillas} />
          </SeccionColapsable>
        </div>
        <div className="space-y-5">
          <SeccionColapsable icon="💳" titulo="Pagos">
            <ConexionMaquinaPagoClient conexiones={conexionesPago} />
          </SeccionColapsable>
        </div>
      </div>

      <SeccionColapsable icon="🗂️" titulo="Tareas">
        <ProyectosTareaClient proyectos={proyectosTarea} />
      </SeccionColapsable>

      <SeccionColapsable icon="🔧" titulo="Diagnóstico técnico">
        <DiagnosticoPushClient />
      </SeccionColapsable>
    </div>
  )
}
