// Definición de los planes de Nelyx — en su propio archivo (sin `db` ni
// Sentry) para que un componente cliente (ej. clientes-admin-client.tsx)
// pueda importarla directo, en vez de mantener una copia local a mano.
// Antes existían DOS copias idénticas de esta tabla (una en
// lib/suscripciones.ts, otra duplicada en el componente del panel admin)
// — un cambio de precio hecho en una y olvidado en la otra mostraba un
// precio distinto al que realmente se cobra, sin que nada lo avisara.
export type PlanKey = "mensual" | "trimestral" | "semestral" | "anual"

export const PLANES: Record<PlanKey, { label: string; precio: number; meses: number }> = {
  mensual:    { label: "Mensual",    precio: 20000,  meses: 1 },
  trimestral: { label: "Trimestral", precio: 60000,  meses: 3 },
  semestral:  { label: "Semestral",  precio: 120000, meses: 6 },
  anual:      { label: "Anual",      precio: 240000, meses: 12 },
}

export function esPlanValido(plan: string): plan is PlanKey {
  return plan in PLANES
}

export function precioDePlan(plan: string): number {
  return esPlanValido(plan) ? PLANES[plan].precio : 0
}
