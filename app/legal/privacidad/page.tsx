import type { Metadata } from "next"
import Link from "next/link"
import { LOGO_B64 } from "@/lib/logo"

export const metadata: Metadata = { title: "Política de Privacidad — Nelyx" }

// Página pública (ver middleware.ts — excluida del chequeo de sesión):
// la tienen que poder leer tanto quienes todavía no tienen cuenta como los
// clientes finales de un negocio que usa Nelyx, que nunca inician sesión
// acá pero sí son titulares de los datos que un dueño carga sobre ellos.
export default function PrivacidadPage() {
  const actualizado = "9 de noviembre de 2026"
  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
      <div className="max-w-[720px] mx-auto px-6 py-10">
        <Link href="/auth/login" className="inline-flex items-center gap-2 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_B64} alt="NELYX" style={{ width: "110px", height: "auto", objectFit: "contain" }} />
        </Link>

        <h1 className="text-2xl font-bold mb-1">Política de Privacidad</h1>
        <p className="text-sm mb-10" style={{ color: "var(--c-text4)" }}>Última actualización: {actualizado}</p>

        <div className="space-y-8 text-[15px] leading-relaxed" style={{ color: "var(--c-text2)" }}>
          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>1. Quiénes somos</h2>
            <p>
              Nelyx es una plataforma para administrar negocios (ventas, inventario, cobranza y finanzas).
              Esta política explica qué datos personales recolectamos, para qué los usamos, con quién los
              compartimos y qué derechos tienes sobre ellos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>2. Qué datos recolectamos</h2>
            <p className="mb-3">Según quién seas, recolectamos distintos datos:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Si tienes una cuenta en Nelyx (dueño de un negocio):</strong> nombre, email, contraseña, teléfono (opcional) y el nombre de tu negocio.</li>
              <li><strong>Si eres empleado de una cuenta de Nelyx:</strong> tu nombre y un PIN de acceso (guardado siempre cifrado, nunca en texto plano).</li>
              <li><strong>Si eres cliente de un negocio que usa Nelyx:</strong> el dueño de ese negocio puede cargar tu nombre, apellido, teléfono, email, dirección y fecha de cumpleaños para gestionar sus ventas y cobranzas contigo. Nelyx trata esos datos por cuenta del negocio, siguiendo sus instrucciones — el negocio es responsable de esa información frente a ti.</li>
              <li><strong>Si eres proveedor de un negocio que usa Nelyx:</strong> nombre, RUT, teléfono, email y dirección, cargados por ese negocio.</li>
              <li><strong>Conversaciones de soporte:</strong> el contenido de los mensajes que nos escribas y las imágenes que adjuntes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>3. Para qué los usamos</h2>
            <p>
              Para operar la plataforma: crear y mantener tu cuenta, procesar tus ventas y movimientos,
              generar reportes, responder tus consultas de soporte, y enviarte notificaciones sobre tu
              cuenta (ej. cobranzas, cumpleaños de tus clientes, alertas de stock) cuando las activas tú mismo.
              No vendemos datos personales a terceros ni los usamos para publicidad.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>4. Con quién los compartimos</h2>
            <p className="mb-3">
              Usamos proveedores externos para operar la plataforma. Ninguno de ellos puede usar tus datos
              para sus propios fines — solo los procesan para que Nelyx funcione:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Supabase</strong> (EE.UU.) — aloja la base de datos.</li>
              <li><strong>Vercel</strong> (EE.UU.) — aloja la aplicación y las imágenes adjuntas al chat de soporte.</li>
              <li><strong>Anthropic</strong> (EE.UU.) — genera la primera respuesta automática del chat de soporte.</li>
              <li><strong>Resend</strong> (EE.UU.) — envía correos transaccionales (ej. recuperación de contraseña).</li>
              <li><strong>Sentry</strong> — nos avisa cuando algo falla técnicamente en la plataforma.</li>
              <li><strong>Transbank / Mercado Pago</strong> — procesan pagos, cuando conectas un medio de pago.</li>
            </ul>
            <p className="mt-3">
              Como parte de esto, algunos de tus datos se transfieren fuera de Chile (principalmente a EE.UU.).
              Estamos trabajando en formalizar esas transferencias conforme a la normativa vigente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>5. Cuánto tiempo los guardamos</h2>
            <p>
              Mientras tu cuenta esté activa. Las capturas adjuntas en conversaciones de soporte ya resueltas
              se eliminan automáticamente después de 7 días. Si eliminas un cliente o proveedor de tu cuenta,
              sus datos se eliminan de inmediato.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>6. Tus derechos</h2>
            <p>
              Puedes pedirnos acceder a tus datos, corregirlos, eliminarlos u oponerte a su tratamiento.
              Si tienes una cuenta en Nelyx, puedes eliminarla junto con tus datos desde Configuración, o
              escribirnos por el chat de soporte dentro de la plataforma. Si eres cliente o proveedor de un
              negocio que usa Nelyx, pídeselo directamente a ese negocio — es quien decide qué datos tuyos
              mantiene.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>7. Seguridad</h2>
            <p>
              Tu contraseña y tu PIN se guardan siempre cifrados, nunca en texto plano. Limitamos los intentos
              de inicio de sesión para protegerte de accesos no autorizados, y cada empleado solo ve las partes
              de la cuenta que su dueño le habilita explícitamente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>8. Cambios a esta política</h2>
            <p>
              Si hacemos cambios importantes, te avisaremos dentro de la plataforma. La fecha al inicio de esta
              página siempre refleja la última actualización.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--c-text)" }}>9. Contacto</h2>
            <p>
              Si tienes dudas sobre esta política o quieres ejercer tus derechos, escríbenos por el chat de
              soporte dentro de la plataforma.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
