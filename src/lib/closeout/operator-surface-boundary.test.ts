import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-075's boundary, mechanised — `2H-OPS-003`, `2H-OPS-004`, `2H-OPS-005`.
 *
 * The operator surfaces are a CLI over narrow `service_role` SQL. There is no
 * product admin UI and no generic service-role HTTP endpoint, and the plan's own
 * adversarial table says a route in this slice is *a scope violation, not a
 * stretch goal*.
 *
 * A written boundary is the kind of thing that is true when written and false
 * later. The two ways it decays are both cheap and both plausible: someone adds
 * a page because reading a terminal is inconvenient, or someone adds a route
 * handler holding the service-role key because a script is inconvenient. Either
 * one converts an operator tool into an internet-reachable administrative
 * surface, which is the exact shape SH-EXPOSURE-005 removed from `heartbeat`.
 *
 * These read the repository rather than a list of files someone maintains, so a
 * new file is covered the day it lands.
 */

const REPO = join(import.meta.dirname, "..", "..", "..");

function read(relative: string): string {
  return readFileSync(join(REPO, relative), "utf8");
}

function walk(relative: string, predicate: (path: string) => boolean): string[] {
  const found: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(join(REPO, current), { withFileTypes: true })) {
      const next = `${current}/${entry.name}`;
      if (entry.isDirectory()) visit(next);
      else if (predicate(next)) found.push(next);
    }
  };
  visit(relative);
  return found;
}

/** The operator CLI, discovered rather than listed. */
const OPERATOR_SCRIPTS = readdirSync(join(REPO, "scripts"))
  .filter((name) => name.startsWith("phase-2h-") && name.endsWith(".mjs"))
  .map((name) => `scripts/${name}`);

describe("2H-OPS-003: the operator surface is a CLI, not a product surface", () => {
  it("has operator scripts to check at all", () => {
    // A guard whose subject set is empty passes by measuring nothing. Two of
    // this repository's published verdicts have already been wrong that way.
    expect(OPERATOR_SCRIPTS.length).toBeGreaterThanOrEqual(4);
    expect(OPERATOR_SCRIPTS).toContain("scripts/phase-2h-operator-health.mjs");
    expect(OPERATOR_SCRIPTS).toContain("scripts/phase-2h-account-health.mjs");
  });

  it("adds no admin route, page or API handler anywhere in the app", () => {
    const routes = walk("src/app", (path) => /\/(page|route|layout)\.tsx?$/.test(path));
    expect(routes.length).toBeGreaterThan(10);

    const administrative = routes.filter((path) =>
      /\/(admin|ops|operator|internal|debug)(\/|\b)/i.test(path));
    expect(
      administrative,
      "ADR-075: an operator route is a scope violation, not a stretch goal",
    ).toEqual([]);
  });

  it("keeps the service-role key out of every route handler and page", () => {
    const surfaces = walk("src/app", (path) => path.endsWith(".ts") || path.endsWith(".tsx"));
    const holders = surfaces.filter((path) => read(path).includes("SERVICE_ROLE_KEY"));
    expect(
      holders,
      "a route holding the service-role key is the generic admin endpoint ADR-075 forbids",
    ).toEqual([]);
  });

  it("calls no operator RPC from application code", () => {
    // The reads are `service_role`-only, so an application caller could not
    // succeed — but it would fail at run time rather than at review time, and
    // the attempt is itself the boundary erosion worth catching.
    //
    // The match is the CALL shape, not the identifier. `operator_suspension` is
    // a lifecycle reason code in `shell/lifecycle-copy.ts` and has nothing to do
    // with these functions; a guard that failed on it would be teaching people
    // to rename product vocabulary to satisfy a test.
    const application = walk("src", (path) =>
      (path.endsWith(".ts") || path.endsWith(".tsx")) && !path.endsWith(".test.ts")
      && !path.endsWith(".test.tsx") && !path.includes("/closeout/"));
    expect(application.length).toBeGreaterThan(100);
    const callers = application.filter((path) =>
      /\.rpc\(\s*["'`](operator_|scheduled_job_liveness|record_scheduled_job_)/.test(read(path)));
    expect(callers, "operator reads belong to the CLI, not to the product").toEqual([]);
  });
});

describe("2H-OPS-003: the operator CLI cannot mutate", () => {
  it("calls only reads, and every RPC it names is an operator read", () => {
    const readOnly = [
      "phase-2h-operator-health.mjs",
      "phase-2h-account-health.mjs",
      "phase-2h-stalled-deletions.mjs",
    ];
    // Both shapes: a direct `.rpc("name")` and the `call("name")` helper the
    // health scripts route through. Matching only the first would have made
    // this assertion vacuous for exactly the two files the slice added.
    const NAMED_RPC = /(?:\.rpc|\bcall)\(\s*["'`]([a-z_]+)["'`]/g;

    for (const name of readOnly) {
      const source = read(`scripts/${name}`);
      const calls = [...source.matchAll(NAMED_RPC)].map((match) => match[1]);
      expect(calls.length, `${name} names no RPC at all`).toBeGreaterThan(0);
      for (const call of calls) {
        expect(
          call.startsWith("operator_") || call === "scheduled_job_liveness",
          `${name} calls ${call}, which is not an operator read`,
        ).toBe(true);
      }
      expect(source, `${name} writes through the table API`)
        .not.toMatch(/\.from\(["'`][a-z_]+["'`]\)\s*\.\s*(insert|update|delete|upsert)/);
    }
  });

  it("never issues a DDL or DML statement of its own", () => {
    for (const path of OPERATOR_SCRIPTS) {
      const source = read(path);
      // The schedule tool is the one operator script that *may* write, and it is
      // the arming door: it requires --enable and it is the deletion reaper's,
      // not a health read's. Naming it here keeps the exception explicit.
      if (path.endsWith("deletion-reaper-schedule.mjs")) {
        expect(source, "the arming tool must still require an explicit flag").toContain("--enable");
        continue;
      }
      expect(source, `${path} contains a destructive statement`).not.toMatch(
        /\b(delete\s+from|drop\s+(table|function|schema)|truncate|cron\.schedule|cron\.unschedule)\b/i,
      );
    }
  });
});

describe("2H-OPS-004: nothing the CLI prints can carry content or a secret", () => {
  it("prints no field whose name admits content, a credential or a session", () => {
    for (const name of ["phase-2h-operator-health.mjs", "phase-2h-account-health.mjs"]) {
      const source = read(`scripts/${name}`);
      const printed = [...source.matchAll(/row\.([a-z_]+)/g)].map((match) => match[1]);
      expect(printed.length, `${name} prints no field`).toBeGreaterThan(3);
      for (const field of printed) {
        expect(
          /(hash|session|secret|token|credential|password|payload|content|prompt|email|filename|stack)/.test(field),
          `${name} prints ${field}`,
        ).toBe(false);
      }
    }
  });

  it("never prints a raw error message from the database", () => {
    // `error.message` from PostgREST can echo a constraint's detail, and a
    // detail can echo a value. The CLIs surface the CODE and their own sentence.
    const health = read("scripts/phase-2h-operator-health.mjs");
    expect(health).toContain("error.code");
  });
});

describe("2H-DEADMAN-004: parity is readable beside liveness, from one command", () => {
  it("reads Edge Function parity in the same report as scheduled-job liveness", () => {
    const health = read("scripts/phase-2h-operator-health.mjs");
    expect(health).toContain("readEdgeFunctionParity");
    expect(health).toContain("scheduled_job_liveness");
  });

  it("classifies the deliberately undeployed function as by-design and not as an error", () => {
    const parity = read("scripts/edge-function-parity.mjs");
    expect(parity).toContain("undeployed_by_design");
    // And it is NOT folded into `ok`: a function that silently stopped being
    // deployed must not be able to hide inside the allowlist's shape.
    expect(parity).toMatch(/undeployed_by_design[\s\S]{0,400}?not `ok`|`undeployed_by_design` is deliberately NOT `ok`/);
  });

  it("treats a stale or orphaned deployment as a finding", () => {
    const parity = read("scripts/edge-function-parity.mjs");
    expect(parity).toMatch(/parityFindings[\s\S]*?state === "stale"/);
    expect(parity).toMatch(/parityFindings[\s\S]*?state === "orphan"/);
  });
});

describe("2H-OPS-005: alerting is a recorded decision, not an omission", () => {
  it("is named in the decision log with its dependency stated", () => {
    const decisions = read("docs/DECISIONS.md");
    expect(decisions).toContain("ADR-089");
    expect(decisions).toMatch(/2H-OPS-005/);
  });
});
