// Envío de correos transaccionales vía la API REST de Resend — sin
// dependencia nueva (fetch nativo). Igual que SENTRY_DSN: si no hay
// RESEND_API_KEY configurada, la función no hace nada y la plataforma
// sigue funcionando exactamente igual, solo sin el envío automático.
export async function enviarEmail(params: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
  const from = process.env.RESEND_FROM_EMAIL || "Nelyx <onboarding@resend.dev>"
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, text: params.text, html: params.html }),
    })
    return res.ok
  } catch {
    return false
  }
}

const LOGO_URL = `${process.env.NEXT_PUBLIC_APP_URL || "https://nelyx.vercel.app"}/nelyx-x-logo.png`

/** Envuelve el contenido de un correo transaccional en una plantilla HTML
 * simple y consistente (logo + tarjeta + pie de página) — solo tablas y
 * estilos en línea, para que se vea igual en cualquier cliente de correo. */
function plantillaCorreo(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f2f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e9f0;">
            <tr>
              <td style="padding:32px 32px 20px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td style="background:#0a0e14;border-radius:14px;padding:12px;">
                      <img src="${LOGO_URL}" width="32" height="32" alt="Nelyx" style="display:block;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;color:#1a1f2e;font-size:14px;line-height:1.65;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#f8f9fb;border-top:1px solid #e5e9f0;text-align:center;">
                <p style="margin:0;color:#9aa3b2;font-size:12px;">Nelyx · nelyx.cl</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Botón de acción principal de un correo — mismo estilo en todos. */
function botonCorreo(url: string, texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">
    <tr><td style="border-radius:10px;background:#2563eb;">
      <a href="${url}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;border-radius:10px;">${texto}</a>
    </td></tr>
  </table>`
}

export function correoInvitacion(params: { nombre: string; link: string; diasValidez: number }): { text: string; html: string } {
  const { nombre, link, diasValidez } = params
  const text = `Hola ${nombre},\n\nTu cuenta en Nelyx ya está lista. Para activarla, crea tu contraseña en este link (válido por ${diasValidez} días):\n\n${link}\n\nUna vez que la crees, vas a poder ingresar con tu correo y esa contraseña.`
  const html = plantillaCorreo(`
    <p style="margin:0 0 16px;font-size:16px;font-weight:600;">Hola ${nombre} 👋</p>
    <p style="margin:0 0 20px;">Tu cuenta en Nelyx ya está lista. Para activarla, crea tu contraseña haciendo clic en el siguiente botón — el link es válido por ${diasValidez} días.</p>
    ${botonCorreo(link, "Crear mi contraseña")}
    <p style="margin:0;color:#5b6473;font-size:13px;">Una vez que la crees, vas a poder ingresar con tu correo y esa contraseña.</p>
  `)
  return { text, html }
}

export function correoRecuperarPassword(params: { nombre: string; link: string; minutosValidez: number }): { text: string; html: string } {
  const { nombre, link, minutosValidez } = params
  const text = `Hola ${nombre},\n\nRecibimos una solicitud para restablecer tu contraseña de Nelyx. Este link es válido por ${minutosValidez} minutos:\n\n${link}\n\nSi no solicitaste este cambio, puedes ignorar este mensaje — tu contraseña actual seguirá funcionando.`
  const html = plantillaCorreo(`
    <p style="margin:0 0 16px;font-size:16px;font-weight:600;">Hola ${nombre},</p>
    <p style="margin:0 0 20px;">Recibimos una solicitud para restablecer tu contraseña de Nelyx. Este link es válido por ${minutosValidez} minutos.</p>
    ${botonCorreo(link, "Restablecer contraseña")}
    <p style="margin:0;color:#5b6473;font-size:13px;">Si no solicitaste este cambio, puedes ignorar este mensaje — tu contraseña actual seguirá funcionando.</p>
  `)
  return { text, html }
}
