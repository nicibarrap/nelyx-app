// Vive en su propio archivo porque un archivo "use server" no puede
// exportar nada que no sea una función async (exportar un tipo desde ahí
// rompe el bundle cliente bajo Turbopack — mismo problema documentado en
// pagos-acciones.ts).
//
// OJO — NO es una unión discriminada ({ok:true} | {ok:false,error:string})
// a propósito, aunque se vea más prolijo: se probó así primero y
// TypeScript, en este proyecto puntual, deja de poder angostar (narrow)
// la unión en cualquier archivo que haga `await registrarVenta(...)` —
// confirmado reproduciendo el error incluso con un archivo de prueba
// mínimo nuevo (no es algo particular a este código, parece una
// interacción rara de este entorno de TS con union types a través de un
// await) — así que `if (!resultado.ok) resultado.error` fallaba a
// compilar pese a estar bien escrito. `error` opcional siempre presente
// evita depender de ese narrowing.
export type ResultadoVenta = { ok: boolean; error?: string }
