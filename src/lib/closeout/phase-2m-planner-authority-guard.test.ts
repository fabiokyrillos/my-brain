import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `2M-PLAN-005` — **"the planner never moves anything by itself."**
 *
 * The requirement asks for the property "enforced by a guard as well as by
 * review", and this is that guard. It is a corpus scan over
 * `src/features/planning` and the planner route, and it refuses the four shapes
 * that would make the sentence false:
 *
 *  1. a **direct write** to `tasks` — the shape `2F` revoked `authenticated`'s
 *     UPDATE to prevent, and the one a planner is most tempted into, because
 *     "just set `planned_at`" is one line and the command path is not;
 *  2. a **Server Action of its own** — a `"use server"` module here would be a
 *     second authority for the same write, with its own idea of eligibility,
 *     confirmation and undo;
 *  3. a **service-role or admin client**, which would leave the caller's own
 *     session and therefore RLS;
 *  4. an **automatic apply** — anything that submits without a user acting.
 *
 * The fourth is the one a scan cannot fully express, so it is approximated
 * precisely rather than vaguely: the planner may not call the injected action
 * from a `useEffect`, a timer or a mount, which are the three ways a surface
 * moves something by itself. What it may do is call it from a handler the user
 * triggered, which is what every control here does.
 *
 * ## Why a corpus scan rather than a test of behaviour
 *
 * A behavioural test proves the code that exists does not auto-apply. This
 * proves the code that does not exist yet cannot: the failure mode is a later
 * edit adding a convenience, and a guard is the only thing that speaks to an
 * edit nobody has written yet.
 */

const ROOTS = [
  "src/features/planning",
  "src/app/[locale]/app/calendar/plan",
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

describe("the planner has no write path of its own", () => {
  it("scans a corpus that actually exists", () => {
    // A guard over an empty directory passes vacuously and says nothing. This
    // is what makes every assertion below a statement about real files.
    expect(SOURCES.length).toBeGreaterThanOrEqual(6);
    expect(SOURCES.map(({ file }) => file)).toContain("src/features/planning/planner-view.tsx");
    expect(SOURCES.map(({ file }) => file))
      .toContain("src/app/[locale]/app/calendar/plan/page.tsx");
  });

  it("writes to no table, through no client", () => {
    for (const { file, text } of SOURCES) {
      expect(text, `${file} writes directly`).not.toMatch(/\.from\(\s*["'`]tasks["'`]\s*\)[\s\S]{0,200}?\.(update|insert|upsert|delete)\(/);
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
      // An effect that calls the injected action is an apply nobody asked for.
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
});

describe("what the planner may change is bounded by the taxonomy, not by this surface", () => {
  it("names no action, so it cannot offer one the taxonomy does not admit", () => {
    /*
     * The planner's controls come from `plannedControlsFor`, which filters the
     * derived controls by the taxonomy's declared `changedFields`. A verb named
     * as a literal anywhere in this corpus would be a second copy of taxonomy
     * knowledge — the shape `calendar-scheduling.ts` refused for the same
     * reason, and the one that would let this surface offer `reschedule_due` and
     * move a deadline from a screen whose premise is that an intention is not
     * one.
     */
    for (const { file, text } of SOURCES) {
      for (const verb of ["reschedule_due", "clear_due", "set_status", "cancel_task", "complete_task"]) {
        expect(text, `${file} names ${verb}`).not.toContain(`"${verb}"`);
      }
    }
  });
});
