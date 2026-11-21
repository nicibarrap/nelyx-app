import type { Metadata } from "next"
import Link from "next/link"
import { LOGO_B64 } from "@/lib/logo"

export const metadata: Metadata = { title: "Términos y Condiciones — Nelyx" }

// Página pública (ver middleware.ts — excluida del chequeo de sesión), mismo
// criterio que /legal/privacidad: la tiene que poder leer cualquiera antes de
// tener cuenta.
export default function TerminosPage() {
  const actualizado = "20 de noviembre de 2026"
  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <div className="max-w-[720px] mx-auto px-6 py-10">
        <Link href="/auth/login" className="inline-flex items-center gap-2 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_B64} alt="NELYX" style={{ width: "110px", height: "auto", objectFit: "contain" }} />
        </Link>

        <h1 className="text-2xl font-bold mb-1">Términos y Condiciones</h1>
        <p className="text-sm mb-10" style={{ color: "var(--c-text4)" }}>Última actualización: {actualizado}</p>

        <div className="space-y-8 text-[15px] leading-relaxed" style={{ color: "var(--c-text2)" }}>
          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>1. Qué es Nelyx</h2>
            <p>
              Nelyx es una plataforma para administrar negocios: ventas, inventario, cobranza, finanzas y
              conexión con máquinas de pago de terceros. Al crear una cuenta o usar la plataforma, aceptas
              estos Términos y la{" "}
              <a href="/legal/privacidad" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                Política de Privacidad
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>2. Suscripción y pago</h2>
            <p>
              El uso de Nelyx requiere una suscripción de monto fijo. La periodicidad del pago (mensual,
              cada dos o tres meses, semestral, anual, u otra que se acuerde contigo) se define caso a caso
              según lo que convenga a tu negocio. El monto y la periodicidad acordados se te informan antes
              de confirmar la suscripción y no cambian durante el periodo ya pagado.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>3. Qué pasa si no pagas</h2>
            <p>
              Si no renuevas tu suscripción, tu cuenta se suspende: dejas de poder ingresar y de poder
              registrar ventas, movimientos o cualquier otra operación, pero tus datos no se pierden de
              inmediato. Los mantenemos guardados durante 1 mes desde la suspensión, tiempo en el que puedes
              reactivar tu cuenta pagando la suscripción pendiente, o pedirnos una copia de tus datos. Pasado
              ese mes sin reactivación, eliminamos tus datos de forma permanente (ver también la sección
              "Cuánto tiempo los guardamos" de la Política de Privacidad).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>4. Conexión con máquinas de pago</h2>
            <p>
              Nelyx te permite conectar máquinas/medios de pago de terceros (Transbank, Mercado Pago, TUU,
              SumUp, BCI Pagos) para que sus cobros queden registrados automáticamente en tu negocio. Nelyx es
              solo el conector entre tu cuenta y esos proveedores: nuestra responsabilidad es que la conexión
              funcione y que los movimientos se registren correctamente en la plataforma. Nelyx no procesa ni
              recibe el dinero de ningún cobro, y no es responsable del funcionamiento, disponibilidad,
              comisiones, soporte técnico ni de cualquier otro aspecto de las máquinas o de los servicios de
              esos proveedores — eso depende exclusivamente de cada proveedor.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>5. Tu cuenta y tus datos</h2>
            <p>
              Eres responsable de la información que cargas en Nelyx (productos, clientes, proveedores,
              movimientos) y de mantener segura tu contraseña. Si creas accesos para empleados, eres
              responsable de informarles sobre el tratamiento de sus datos, como ya se indica al crear ese
              acceso dentro de la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>6. Uso aceptable</h2>
            <p>
              No puedes usar Nelyx para actividades ilegales, para intentar vulnerar su seguridad, ni para
              acceder a datos de otro negocio sin autorización. Nos reservamos el derecho de suspender cuentas
              que incumplan esto.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>7. Disponibilidad del servicio</h2>
            <p>
              Hacemos un esfuerzo razonable para que Nelyx esté disponible de forma continua, pero no
              garantizamos un funcionamiento ininterrumpido ni libre de errores. No somos responsables de
              interrupciones causadas por proveedores externos (hosting, base de datos, proveedores de pago)
              fuera de nuestro control directo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>8. Cambios a estos Términos</h2>
            <p>
              Si hacemos cambios importantes, te avisaremos dentro de la plataforma. La fecha al inicio de
              esta página siempre refleja la última actualización.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>9. Contacto</h2>
            <p>
              Si tienes dudas sobre estos Términos, escríbenos por el chat de soporte dentro de la plataforma.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
