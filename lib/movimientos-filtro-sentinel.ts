// Valor reservado para el filtro "realizadoPor" de Movimientos — significa
// "lo registró el dueño" (Movimiento.realizadoPorNombre === null), nunca un
// nombre real de empleado (que siempre es el texto tal cual, nunca este
// valor). Vive en su propio archivo, sin más imports, para que
// filtro-movimientos.tsx (componente de cliente) pueda usar el mismo valor
// que movimientos-filtro.ts sin arrastrar @prisma/client — que ese otro
// archivo sí importa en runtime — al bundle del navegador.
export const FILTRO_DUENO = "__dueno__"
