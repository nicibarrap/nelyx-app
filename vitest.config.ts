import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Los tests de integración pegan a una Postgres local real (ver
    // tests/setup.ts) — corren uno a la vez para no pisarse entre sí con
    // datos compartidos (usuarios, cuentas) creados en cada test.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
