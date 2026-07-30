import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * The credentialed lane (ADR-059).
 *
 * `*.remote.test.ts` files need live credentials and a deployed database, so
 * they are excluded from `vitest.config.ts` and run only from here, through an
 * explicit `npm run test:remote:2f:baseline`. Keeping them under `src/` is the
 * point: the end-to-end match baseline has to import the **real**
 * `loadTaskCandidates` and the **real** `rankTaskCandidates`, because a baseline
 * measured against a reimplementation measures the reimplementation.
 *
 * `environment: "node"` rather than the default suite's jsdom: this talks to
 * PostgREST over the network and renders nothing. Timeouts are generous because
 * a fixture round trip is not a unit test.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.remote.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // One file, one owner, one seeded corpus: parallel files would race each
    // other's fixtures against the same project.
    fileParallelism: false,
  },
});
