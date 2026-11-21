import * as Sentry from "@sentry/nextjs"
import { getEmojiProducto } from "@/lib/emojis"

// ══════════════════════════════════════════════════════════════════════
// Visibilidad de qué productos reales (de cualquier negocio que usa
// Nelyx) terminan sin un emoji confiable — ni la clasificación de Open
// Food/Beauty/Products Facts ni las palabras clave locales (lib/emojis.ts)
// le acertaron. En vez de intentar armar por adelantado un catálogo de
// "todo lo que se vende en Chile" (caro de mantener y legalmente delicado
// si viene de scrapear sitios de terceros), esto deja ver con el tiempo
// qué productos puntuales se repiten sin clasificar, para ir agregando
// esas palabras/marcas al diccionario local según el uso real — mismo
// principio con el que creció Open Food Facts.
//
// Se llama SOLO al crear un producto de verdad (wizard, importación
// masiva), nunca al mostrar uno ya existente — así nunca se repite el
// mismo aviso cada vez que alguien abre una lista o un reporte.
//
// Nivel "info" y con un tag propio a propósito: esto no es un error ni
// algo para investigar con la misma urgencia que una excepción real —
// es una señal de producto para revisar de vez en cuando, mezclada en el
// mismo proyecto de Sentry pero fácil de separar del resto con ese tag.
export function registrarSiProductoQuedaSinEmoji(nombre: string, categoria: string | null): void {
  try {
    if (getEmojiProducto(nombre, categoria) !== "📦") return
    Sentry.captureMessage(`[Catálogo] Producto sin emoji automático: "${nombre}"`, {
      level: "info",
      tags: { tipo: "catalogo-sin-clasificar" },
      extra: { nombre, categoria },
    })
  } catch {
    // Nunca debe poder romper la creación de un producto real por esto.
  }
}
