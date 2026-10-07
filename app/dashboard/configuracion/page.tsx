import type { Metadata } from "next"
import { obtenerConfigNotificaciones } from "@/app/actions/notificaciones-acciones"
import { obtenerPlantillasCobranza } from "@/app/actions/cobranza-acciones"
import { obtenerConexionesPago } from "@/app/actions/pagos-acciones"
import { obtenerAutomatizacionesCliente } from "@/app/actions/automatizaciones-acciones"
import { obtenerProyectosTarea, obtenerTodasCategoriasPersonalizadas } from "@/app/actions/acciones"
import { ConfigNotificacionesClient } from "@/components/configuracion/config-notificaciones-client"
import { DiagnosticoPushClient } from "@/components/configuracion/diagnostico-push-client"
import { PlantillasCobranzaClient } from "@/components/configuracion/plantillas-cobranza-client"
import { ConexionMaquinaPagoClient } from "@/components/configuracion/conexion-maquina-pago-client"
import { AutomatizacionesClienteClient } from "@/components/configuracion/automatizaciones-cliente-client"
import { ProyectosTareaClient } from "@/components/configuracion/proyectos-tarea-client"
import { CategoriasConfigClient } from "@/components/configuracion/categorias-config-client"
import { SeccionColapsable } from "@/components/configuracion/seccion-colapsable"

export const metadata: Metadata = { title: "Configuración" }
export const dynamic = "force-dynamic"

const CAMPOS = ["calendario","tareas","deudas","costosFijos","cuentasCobrar","clientes","inventario","reportes","renovaciones","alertasGenerales","soporte"] as const

export default async function ConfiguracionPage() {
  const [cfgRaw, plantillas, conexionesPago, automatizaciones, proyectosTarea, categorias] = await Promise.all([obtenerConfigNotificaciones(), obtenerPlantillasCobranza(), obtenerConexionesPago(), obtenerAutomatizacionesCliente(), obtenerProyectosTarea(), obtenerTodasCategoriasPersonalizadas()])
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
          (Notificaciones) y cómo cobras (Cobranza, Pagos), después cómo
          organizas tus tareas (Tareas) y por último una herramienta de
          soporte que casi nunca hace falta tocar (Diagnóstico técnico).

          Cada sección es un acordeón colapsado — solo Notificaciones
          arranca abierta — para no obligar a hacer scroll por todo de
          una. Antes en pc (lg:+) todo quedaba forzado a expandido en 2
          columnas, lo que con secciones de largo muy distinto (10
          notificaciones vs. 1 tarjeta de pago) dejaba columnas muy
          desparejas. Una sola columna se ve igual de ordenada en
          cualquier tamaño de pantalla.

          "Automatizaciones de clientes" ya no manda correos a nombre del
          dueño (decisión explícita: Nelyx no le escribe a los clientes sin
          que el dueño lo sepa) — el recordatorio de cobranza automática se
          retiró por completo, y el de cumpleaños ahora solo avisa adentro
          de la app para que el dueño salude a mano. El envío manual vía
          Gmail (botón "Email" en el centro de cobranza) sigue funcionando
          igual que siempre. */}
      <div className="space-y-5 max-w-2xl">
        <SeccionColapsable icon="🔔" titulo="Notificaciones" defaultOpen>
          <ConfigNotificacionesClient cfg={cfg} />
        </SeccionColapsable>
        <SeccionColapsable icon="📋" titulo="Cobranza">
          <PlantillasCobranzaClient plantillas={plantillas} />
        </SeccionColapsable>
        <SeccionColapsable icon="💳" titulo="Pagos">
          <ConexionMaquinaPagoClient conexiones={conexionesPago} />
        </SeccionColapsable>
        <SeccionColapsable icon="🎂" titulo="Automatizaciones de clientes">
          <AutomatizacionesClienteClient valores={automatizaciones} />
        </SeccionColapsable>
        <SeccionColapsable icon="🗂️" titulo="Tareas">
          <ProyectosTareaClient proyectos={proyectosTarea} />
        </SeccionColapsable>
        <SeccionColapsable icon="🏷️" titulo="Categorías">
          <CategoriasConfigClient categorias={categorias} />
        </SeccionColapsable>
        <SeccionColapsable icon="🔧" titulo="Diagnóstico técnico">
          <DiagnosticoPushClient />
        </SeccionColapsable>
      </div>
    </div>
  )
}
