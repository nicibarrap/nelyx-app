"use server"
import { cookies } from "next/headers"

const NOMBRE_COOKIE = "nelyx_dispositivo_cuenta"
const UN_ANIO = 60 * 60 * 24 * 365

/** Se llama justo después de que el dueño inicia sesión con su email y
 * contraseña — deja este dispositivo "recordado" para esa cuenta, así la
 * próxima vez (y cualquier empleado que use este mismo aparato) ve
 * directo la pantalla de "¿quién eres?" en vez de tener que pedirle al
 * dueño que vuelva a escribir su contraseña cada vez. */
export async function emparejarDispositivo(cuentaId: string) {
  cookies().set(NOMBRE_COOKIE, cuentaId, {
    maxAge: UN_ANIO, path: "/", sameSite: "lax",
  })
}

/** "Cambiar de cuenta" — para cuando el dispositivo debe dejar de estar
 * emparejado con este negocio (ej. se vende el celular, o simplemente el
 * dueño quiere entrar con otra cuenta distinta). */
export async function desemparejarDispositivo() {
  cookies().delete(NOMBRE_COOKIE)
}

export async function obtenerCuentaEmparejada(): Promise<string | null> {
  return cookies().get(NOMBRE_COOKIE)?.value ?? null
}
