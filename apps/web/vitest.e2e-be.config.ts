import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/e2e-be/**/*.test.ts"],
    hookTimeout: 120000,
    testTimeout: 120000,
    setupFiles: ["./tests/setup/e2e-be.setup.ts"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
