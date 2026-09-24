// Envío de correos transaccionales vía la API REST de Resend — sin
// dependencia nueva (fetch nativo). Igual que SENTRY_DSN: si no hay
// RESEND_API_KEY configurada, la función no hace nada y la plataforma
// sigue funcionando exactamente igual, solo sin el envío automático.
export async function enviarEmail(params: { to: string; subject: string; text: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
  const from = process.env.RESEND_FROM_EMAIL || "Nelyx <onboarding@resend.dev>"
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, text: params.text }),
    })
    return res.ok
  } catch {
    return false
  }
}
