import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // `*.remote.test.ts` needs live credentials and a deployed database
    // (ADR-059), so it is excluded here and run through `vitest.remote.config.ts`
    // by an explicit npm script. Without this line the default `include` would
    // sweep it into the `app` CI job, where it would fail for want of secrets.
    // `command-funnel.test.ts` asserts this exclusion is still present.
    exclude: ["e2e/**", "node_modules/**", ".next/**", "src/**/*.remote.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
