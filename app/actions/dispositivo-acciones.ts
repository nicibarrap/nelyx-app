"use server"
import { cookies } from "next/headers"
import { auth } from "@/lib/auth"

const NOMBRE_COOKIE = "nelyx_dispositivo_cuenta"
const UN_ANIO = 60 * 60 * 24 * 365

/**
 * Se llama SOLO cuando el dueño marcó explícitamente "Recordar este
 * dispositivo" al iniciar sesión — nunca automático, para no emparejar
 * sin querer un computador prestado o público (eso mostraría después los
 * nombres de los empleados a cualquiera que lo use, y dejaría la puerta
 * abierta a que alguien intente adivinar un PIN desde ahí).
 *
 * Lee la sesión directo del servidor (no recibe el id del cliente) — así
 * es confiable incluso llamada justo después de un login recién hecho,
 * sin depender de que el navegador ya tenga la sesión "asentada".
 */
export async function emparejarDispositivo() {
  const session = await auth()
  if (!session?.user?.id) return
  cookies().set(NOMBRE_COOKIE, session.user.id, {
    maxAge: UN_ANIO, path: "/", sameSite: "lax", secure: true,
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
