import { NextResponse } from "next/server"

// Sin caché: tiene que reflejar el build que está corriendo ESTE
// momento en el servidor, no uno guardado de antes del último deploy.
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null })
}
