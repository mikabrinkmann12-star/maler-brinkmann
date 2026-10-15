import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Datenbank-Tests gegen brinkmann-dev (echte Supabase-Verbindung).
// Laufen nacheinander, damit sie sich nicht gegenseitig stören.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    setupFiles: ["tests/rls/env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
