import type { Metadata } from "next"
import { AprendeClient } from "@/components/aprende/aprende-client"

export const metadata: Metadata = { title: "Centro de Aprendizaje" }

export default function AprendePage() {
  return <AprendeClient />
}
