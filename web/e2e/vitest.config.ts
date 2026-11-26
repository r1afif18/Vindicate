import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/** Scenario suite. Kept out of `pnpm test`: run it with `pnpm vitest run --config e2e/vitest.config.ts`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
