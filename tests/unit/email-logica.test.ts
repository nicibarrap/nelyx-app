import { describe, it, expect } from "vitest"
import { correoInvitacion, correoRecuperarPassword } from "@/lib/email"

// Regresión del hallazgo de Semgrep (lang.security.html-in-template-string,
// docs/SECURITY_SCAN_2026-10-06.md): nombre se interpolaba sin escapar en
// el HTML del correo.
describe("Las plantillas de correo escapan el HTML del nombre del usuario", () => {
  it("correoInvitacion escapa un nombre con HTML/script", () => {
    const { html } = correoInvitacion({ nombre: `<script>alert(1)</script>`, link: "https://nelyx.cl/x", diasValidez: 7 })
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("correoRecuperarPassword escapa un nombre con HTML/script", () => {
    const { html } = correoRecuperarPassword({ nombre: `<img src=x onerror=alert(1)>`, link: "https://nelyx.cl/x", minutosValidez: 30 })
    expect(html).not.toContain("<img src=x onerror=alert(1)>")
    expect(html).toContain("&lt;img")
  })

  it("el texto plano (sin HTML) no se toca — no corresponde escapar ahí", () => {
    const { text } = correoInvitacion({ nombre: "José & Cía", link: "https://nelyx.cl/x", diasValidez: 7 })
    expect(text).toContain("José & Cía")
  })
})
