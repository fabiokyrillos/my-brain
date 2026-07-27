import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(
  process.cwd(),
  "scripts/local-task-command-creation-race.mjs",
);

describe("local two-session task-command creation race gate", () => {
  it("rejects duplicate persisted evidence in its executable self-test", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--self-test"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("race evidence validator self-test passed");
  });

  it("is wired into the database CI job after local credentials are exported", () => {
    const workflow = readFileSync(
      path.resolve(process.cwd(), ".github/workflows/ci.yml"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const exportStep = workflow.indexOf("Export the local Supabase credentials");
    const raceStep = workflow.indexOf("npm run test:local:2e:creation-race");

    expect(exportStep).toBeGreaterThan(0);
    expect(raceStep).toBeGreaterThan(exportStep);
  });
});
