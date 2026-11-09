import type { Metadata } from "next"
import { auth } from "@/lib/auth"
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
import { PrivacidadDatosClient } from "@/components/configuracion/privacidad-datos-client"
import { ConfiguracionLayout, type SeccionConfig } from "@/components/configuracion/configuracion-layout"

export const metadata: Metadata = { title: "Configuración" }
export const dynamic = "force-dynamic"

const CAMPOS = ["calendario","tareas","deudas","costosFijos","cuentasCobrar","clientes","inventario","reportes","renovaciones","alertasGenerales","soporte"] as const

export default async function ConfiguracionPage() {
  const session = await auth()
  const [cfgRaw, plantillas, conexionesPago, automatizaciones, proyectosTarea, categorias] = await Promise.all([obtenerConfigNotificaciones(), obtenerPlantillasCobranza(), obtenerConexionesPago(), obtenerAutomatizacionesCliente(), obtenerProyectosTarea(), obtenerTodasCategoriasPersonalizadas()])
  const cfg: Record<string, boolean> = {}
  for (const campo of CAMPOS) cfg[campo] = cfgRaw[campo]

  // Mismo orden de siempre = importancia/frecuencia de uso para el día a
  // día del negocio: primero cómo te enteras de lo que pasa
  // (Notificaciones) y cómo cobras (Cobranza, Pagos), después cómo
  // organizas tus tareas, y por último una herramienta de soporte que casi
  // nunca hace falta tocar (Diagnóstico técnico). ConfiguracionLayout
  // decide cómo mostrar esta lista según el tamaño de pantalla: acordeón
  // apilado en celular/tablet (como siempre), menú lateral + panel en
  // escritorio.
  const secciones: SeccionConfig[] = [
    { id: "notificaciones", icon: "🔔", titulo: "Notificaciones", content: <ConfigNotificacionesClient cfg={cfg} /> },
    { id: "cobranza", icon: "📋", titulo: "Cobranza", content: <PlantillasCobranzaClient plantillas={plantillas} /> },
    { id: "pagos", icon: "💳", titulo: "Pagos", content: <ConexionMaquinaPagoClient conexiones={conexionesPago} /> },
    { id: "automatizaciones", icon: "🎂", titulo: "Automatizaciones de clientes", content: <AutomatizacionesClienteClient valores={automatizaciones} /> },
    // Categorías de Productos/Gastos/Costos Fijos y Proyectos de Tareas
    // (las "categorías" del Calendario) viven juntas acá — antes Tareas
    // tenía su propia pestaña sin nada más adentro, separada sin motivo
    // real del resto de las categorías del negocio.
    { id: "categorias", icon: "🏷️", titulo: "Categorías", content: <div className="space-y-5"><CategoriasConfigClient categorias={categorias} /><ProyectosTareaClient proyectos={proyectosTarea} /></div> },
    { id: "diagnostico", icon: "🔧", titulo: "Diagnóstico técnico", content: <DiagnosticoPushClient /> },
  ]
  // Exportar/eliminar "mis datos" es una acción exclusiva del dueño sobre
  // su propia cuenta — un empleado ni siquiera debería ver la opción,
  // además de que la Server Action la rechaza igual si se invoca directo.
  if (!session?.user?.esEmpleado) {
    secciones.push({ id: "privacidad", icon: "🔒", titulo: "Privacidad y datos", content: <PrivacidadDatosClient email={session?.user?.email ?? ""} /> })
  }

  return (
    <div className="space-y-5 animate-fade-up max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--c-text)] tracking-tight">Configuración</h1>
        <p className="text-sm text-[var(--c-text3)] mt-0.5">Administra tus preferencias en NELYX.</p>
      </div>

      {/* "Automatizaciones de clientes" ya no manda correos a nombre del
          dueño (decisión explícita: Nelyx no le escribe a los clientes sin
          que el dueño lo sepa) — el recordatorio de cobranza automática se
          retiró por completo, y el de cumpleaños ahora solo avisa adentro
          de la app para que el dueño salude a mano. El envío manual vía
          Gmail (botón "Email" en el centro de cobranza) sigue funcionando
          igual que siempre.

          El ancho máximo crece con la pantalla (hasta max-w-6xl en
          monitores grandes) en vez de quedar fijo angosto — en celular es
          el acordeón de siempre (una columna angosta se ve bien ahí), pero
          en escritorio el menú lateral + panel de ConfiguracionLayout
          necesita más aire: la columna del menú (fija, ~240px) más el
          panel de contenido (que repite el mismo patrón "ícono + etiqueta
          a la izquierda, control a la derecha" de antes) se ven apretados
          en un ancho pensado para una sola columna de acordeón. */}
      <div className="max-w-2xl md:max-w-3xl lg:max-w-6xl">
        <ConfiguracionLayout secciones={secciones} />
      </div>
    </div>
  )
}
