// Se muestra automáticamente mientras el servidor arma la página de
// destino (sus consultas a la base de datos) — antes, ese tiempo se
// sentía como que "no pasó nada" al cambiar de módulo, porque no había
// ningún loading.tsx en toda la sección /dashboard. Sidebar y Header no
// se ven afectados: viven en el layout, fuera de este límite de Suspense.
export default function DashboardLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-7 w-48 rounded-lg" style={{ backgroundColor: "var(--c-card2)" }} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border" style={{ backgroundColor: "var(--c-card)", borderColor: "var(--c-border)" }} />
        ))}
      </div>
      <div className="h-64 rounded-2xl border" style={{ backgroundColor: "var(--c-card)", borderColor: "var(--c-border)" }} />
    </div>
  )
}
