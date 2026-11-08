// Constantes compartidas del tablero de Sugerencias — separadas de
// sugerencias-acciones.ts porque un archivo "use server" solo puede
// exportar funciones async (Next.js lo exige); todo lo demás (constantes,
// tipos) tiene que vivir en un módulo aparte, mismo motivo que
// lib/soporte-logica.ts.

export const ESTADOS_SUGERENCIA = ["nueva", "en_analisis", "planificado", "en_desarrollo", "implementado", "no_por_ahora"] as const
export type EstadoSugerencia = typeof ESTADOS_SUGERENCIA[number]
