export default function AdminLoading() {
  return (
    <div className="p-5 space-y-5 animate-pulse">
      <div className="h-7 w-48 rounded-lg" style={{ backgroundColor: "var(--c-card2)" }} />
      <div className="h-64 rounded-2xl border" style={{ backgroundColor: "var(--c-card)", borderColor: "var(--c-border)" }} />
    </div>
  )
}
