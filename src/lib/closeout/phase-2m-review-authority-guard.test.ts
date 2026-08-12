import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `2M-REVIEW-004` — **"a guard fails the build if a review path acquires a
 * direct write."**
 *
 * The requirement names the guard, so this is it, and it is deliberately the
 * planner guard's shape rather than a new idea: one corpus scan over the day
 * review's feature directory and its route, refusing the four ways a surface
 * acquires authority it was not given.
 *
 * A review is the *most* tempting surface to give a shortcut to. Every row is
 * something the user has already decided about, so "just mark them all done" is
 * one line — and it would be a second write path with its own idea of
 * eligibility, confirmation, audit and undo. The five verbs go through
 * `applyTaskDetailCommand` or they do not exist.
 *
 * ## The one difference from the planner's guard, stated
 *
 * The review's corpus includes `/app/reviews`, which **legitimately** imports
 * `generateReview` and `markNotification`-style Server Actions that predate this
 * slice: the generated-review buttons have been on that page since long before
 * Phase 2M. So the scan refuses a Server Action *declared* here and a direct
 * write *performed* here; it does not refuse importing an existing, separately
 * governed action, because that is what "on the existing command path" means.
 */

const ROOTS = [
  "src/features/day-review",
  "src/app/[locale]/app/reviews",
];

function walk(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SOURCES = ROOTS.flatMap((root) => walk(path.resolve(process.cwd(), root)))
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .map((file) => ({
    file: path.relative(process.cwd(), file).replace(/\\/g, "/"),
    text: withoutComments(readFileSync(file, "utf8")),
  }));

describe("2M-REVIEW-004: the review has no write path of its own", () => {
  it("scans a corpus that actually exists", () => {
    // A guard over an empty directory passes vacuously and says nothing.
    expect(SOURCES.length).toBeGreaterThanOrEqual(5);
    const files = SOURCES.map(({ file }) => file);
    expect(files).toContain("src/features/day-review/day-review-view.tsx");
    expect(files).toContain("src/features/day-review/day-review-projection.ts");
    expect(files).toContain("src/app/[locale]/app/reviews/page.tsx");
  });

  it("writes to no table", () => {
    for (const { file, text } of SOURCES) {
      for (const table of ["tasks", "reminders", "entries", "memories", "reviews", "agent_preferences"]) {
        expect(text, `${file} writes directly to ${table}`).not.toMatch(
          new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)[\\s\\S]{0,200}?\\.(update|insert|upsert|delete)\\(`),
        );
      }
    }
  });

  it("calls no RPC and reaches for no privileged client", () => {
    for (const { file, text } of SOURCES) {
      expect(text, `${file} calls an RPC`).not.toMatch(/\.rpc\(/);
      expect(text, `${file} reaches for a privileged client`)
        .not.toMatch(/service_role|createAdminClient|SUPABASE_SERVICE_ROLE/);
    }
  });

  it("declares no Server Action", () => {
    for (const { file, text } of SOURCES) {
      expect(text, `${file} declares a Server Action`).not.toMatch(/["']use server["']/);
    }
  });

  it("applies nothing on mount, on a timer, or from an effect", () => {
    for (const { file, text } of SOURCES) {
      expect(text, `${file} schedules work`).not.toMatch(/setTimeout|setInterval|requestIdleCallback/);
      const effects = text.match(/useEffect\([\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\)/g) ?? [];
      for (const effect of effects) {
        expect(effect, `${file} applies from an effect`).not.toMatch(/\baction\(|\bapply/);
      }
    }
  });

  it("adds no gesture, which OD-2M-6 A signed for every surface in this phase", () => {
    for (const { file, text } of SOURCES) {
      expect(text, `${file} carries a gesture handler`)
        .not.toMatch(/onDrag|onDrop|onTouchStart|onTouchMove|onPointerDown|draggable=/);
    }
  });

  it("calls no model: review generation is unchanged and this slice adds none", () => {
    // The implementation plan's own stop condition, as a guard. A new model call
    // here is a cost, consent and provenance decision that is not this slice's.
    for (const { file, text } of SOURCES.filter(({ file }) => file.startsWith("src/features/day-review"))) {
      expect(text, `${file} reaches for the provider`).not.toMatch(/@\/lib\/ai|AIProvider|openai/);
    }
  });
});

describe("2M-REVIEW-003: the verbs are the taxonomy's, and the mapping lives in one place", () => {
  it("names a taxonomy verb only in the declared mapping", () => {
    /*
     * `contracts.ts` is the mapping and is allowed to name the five actions it
     * maps onto. Everywhere else — the projection, the view, the route — a verb
     * as a literal would be a second copy of taxonomy knowledge, and the second
     * copy is what lets a surface offer something the RPC would refuse.
     */
    const elsewhere = SOURCES.filter(({ file }) => file !== "src/features/day-review/contracts.ts");
    for (const { file, text } of elsewhere) {
      for (const verb of ["set_planned", "reschedule_due", "cancel_task", "set_status", "clear_planned", "complete_task"]) {
        expect(text, `${file} names ${verb}`).not.toContain(`"${verb}"`);
      }
    }
    // Non-vacuity: the mapping really does name them, so the exclusion above is
    // excluding something.
    const mapping = SOURCES.find(({ file }) => file === "src/features/day-review/contracts.ts");
    expect(mapping?.text).toContain('"set_planned"');
    expect(mapping?.text).toContain('"cancel_task"');
  });
});
