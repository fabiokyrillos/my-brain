import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `2L-METRICS-001…007` — Phase 2L's telemetry, and the one thing it must not do.
 *
 * ## The phase declared no new event, and that is the finding
 *
 * `product_events.event_name` and every property enum are **database
 * constraints**. A new event name therefore costs a migration — and OD-2L-2
 * option A signed the phase's single allocation away, which slice 2L.3 then let
 * lapse. So Phase 2L reports through the vocabulary already deployed:
 *
 *  - quick edit and each applied bulk item → `task_command_applied` with
 *    `commandOrigin: 'work'`, an outcome from the closed set, and `replayed`;
 *  - undo from a Work surface → `task_command_undone` with the same origin and a
 *    closed `undoResult`.
 *
 * **Selection and bulk preview have no admitting name, and are recorded as
 * not-built-by-rule rather than invented.** Declaring `work_selection_changed`
 * would produce a producer the deployed CHECK rejects — a vocabulary that is
 * declared and unwritable, which is precisely what cost `202608080087` and
 * `202608090089`. This guard asserts the absence so the refusal is mechanical.
 *
 * ## Why this is a guard and not a paragraph
 *
 * Post-2J and post-2K were both corrections to a *second copy* of a vocabulary.
 * The lesson is that vocabulary defects are found by naming enforcement points,
 * not by counting them — so what follows names each one.
 */

const REPO = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every event Phase 2L reports through. Both predate it. */
const PHASE_2L_EVENTS = ["task_command_applied", "task_command_undone"] as const;

/** The Work-surface modules that may emit. Named, so a new emitter is reviewed. */
const WORK_EMITTERS = [
  "src/features/operations/actions.ts",
  "src/features/task-commands/actions.ts",
  "src/features/task-commands/detail-actions.ts",
] as const;

/**
 * The declared vocabulary, read as text.
 *
 * Imported would be simpler and would compare the module with itself; this
 * compares *declarations*, which is what a vocabulary census is for.
 */
const DECLARED_EVENTS = [
  ...read("src/features/product-analytics/contracts.ts")
    .slice(
      read("src/features/product-analytics/contracts.ts").indexOf("export const productEventNames = ["),
      read("src/features/product-analytics/contracts.ts").indexOf("] as const", read("src/features/product-analytics/contracts.ts").indexOf("export const productEventNames = [")),
    )
    .matchAll(/"([a-z_]+)"/g),
].map((match) => match[1]);

/**
 * Which declared events a module emits.
 *
 * Not `name: "…"`, because the console routes every emission through one
 * helper that takes the name as an argument — a shape-based extractor would
 * have found the direct emitters and silently missed the routed ones, which is
 * the same defect slice 2L.0's authority census had to pay for.
 */
function eventNamesIn(source: string): string[] {
  const quoted = new Set([...source.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]));
  return DECLARED_EVENTS.filter((event) => quoted.has(event));
}

describe("2L-METRICS-002/003: every event this phase reports through already exists", () => {
  it("declares no new event name", () => {
    // The application's own vocabulary is unchanged by this phase. Compared
    // against the deployed CHECK below, not against itself.
    const contracts = read("src/features/product-analytics/contracts.ts");
    for (const event of PHASE_2L_EVENTS) {
      expect(contracts, `${event} is not in the declared vocabulary`).toContain(`"${event}"`);
    }
  });

  it("names events the deployed table CHECK admits", () => {
    /*
     * The half that matters. `2L-METRICS-003` exists because a declared but
     * unwritable vocabulary reached a deployment twice. Read from the migration
     * chain rather than from the application, because the database is the
     * authority on what can be written.
     */
    const migrations = readdirSync(join(REPO, "supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const chain = migrations
      .map((file) => readFileSync(join(REPO, "supabase/migrations", file), "utf8"))
      .join("\n");
    for (const event of PHASE_2L_EVENTS) {
      expect(chain, `${event} appears in no migration, so it cannot be written`)
        .toContain(`'${event}'`);
    }
  });

  it("emits both from the Work surfaces, so neither is a producer with no writer", () => {
    const emitted = WORK_EMITTERS.flatMap((file) => eventNamesIn(code(file)));
    for (const event of PHASE_2L_EVENTS) {
      expect(emitted, `${event} is declared for this phase but never emitted`).toContain(event);
    }
  });

  it("emits nothing outside the two, from the modules that are Work's alone", () => {
    /*
     * `2L-METRICS-004`. Scoped to the two Work-only modules, deliberately:
     * `task-commands/actions.ts` is shared with the natural-language console
     * and legitimately carries that surface's whole vocabulary. Asserting over
     * it would have been a census of the console rather than of this phase —
     * and the guard would have had to be loosened until it said nothing.
     *
     * What *is* asserted about the shared module is narrower and sharper: the
     * Work undo function emits exactly one event, by name, in the test below.
     */
    const workOnly = ["src/features/operations/actions.ts", "src/features/task-commands/detail-actions.ts"];
    const emitted = new Set(workOnly.flatMap((file) => eventNamesIn(code(file))));
    const unexpected = [...emitted].filter(
      (event) => !(PHASE_2L_EVENTS as readonly string[]).includes(event)
        // `task_status_changed` predates Phase 2L on this path and is Phase 2F's.
        && event !== "task_status_changed",
    );
    expect(unexpected).toEqual([]);
  });

  it("emits exactly one event from the Work undo, and it is the existing one", () => {
    // The shared module's Work-specific half, isolated by reading the function
    // rather than the file. A second name here would be a new vocabulary
    // arriving through the door the console already holds open.
    const source = code("src/features/task-commands/actions.ts");
    const start = source.indexOf("export async function undoWorkOperation");
    expect(start, "undoWorkOperation could not be located").toBeGreaterThan(0);
    const body = source.slice(start, source.indexOf("function undoResult(", start));
    expect(eventNamesIn(body)).toEqual(["task_command_undone"]);
  });
});

describe("2L-METRICS-001/008: no property carries user content", () => {
  it("sends only closed enums, booleans and a policy version", () => {
    /*
     * The properties are built by `analytics.ts`'s builders rather than
     * assembled at the call site, so the assertion is on the builders: each
     * returns a fixed set of keys, and none of them is a title, a note, a name,
     * a filter value or a search term.
     */
    const analytics = code("src/features/task-commands/analytics.ts");
    for (const forbidden of ["title", "note", "description", "personName", "projectName", "query", "text"]) {
      const property = new RegExp(`\\b${forbidden}\\s*:`);
      expect(property.test(analytics), `analytics.ts builds a \`${forbidden}\` property`).toBe(false);
    }
  });

  it("carries no classification-derived value anywhere near an event", () => {
    // `2L-PRIVACY-008`. The derived sensitivity must not reach telemetry, and
    // the cheapest way to be sure is that no emitter imports it at all.
    for (const file of WORK_EMITTERS) {
      expect(code(file), file).not.toMatch(/sensitivity|task-derivation/);
    }
  });

  it("keeps the bulk path free of a per-item content property", () => {
    // A bulk apply emits one event per applied item. If any of them carried the
    // item's title, fifty titles would leave the application in one round.
    const source = code("src/features/operations/actions.ts");
    const emitBlock = source.slice(source.indexOf("function emitApplied"));
    expect(emitBlock).not.toMatch(/title|description/);
  });
});

describe("2L-METRICS-005: selection and bulk preview are not-built-by-rule", () => {
  it("declares no selection or preview event", () => {
    /*
     * Recorded mechanically rather than in prose. The deployed `event_name`
     * CHECK admits neither, and this phase's migration allocation lapsed by a
     * signed decision — so declaring one would produce a producer the database
     * rejects. That is the defect `2L-METRICS-003` exists to catch, and
     * inventing the name to satisfy a different requirement would be trading
     * one requirement for another.
     */
    const contracts = read("src/features/product-analytics/contracts.ts");
    for (const invented of [
      "work_selection_changed",
      "work_bulk_previewed",
      "bulk_selection_changed",
      "work_filter_applied",
    ]) {
      expect(contracts, `an event named ${invented} was declared`).not.toContain(invented);
    }
  });

  it("adds no migration to make room for one", () => {
    // The budget, asserted where a future edit would have to break it.
    const migrations = readdirSync(join(REPO, "supabase/migrations"))
      .filter((file) => file.endsWith(".sql"));
    expect(migrations.filter((file) => /2l|phase_2l/i.test(file))).toEqual([]);
  });
});

describe("2L-METRICS-007: nothing here reaches a provider", () => {
  it("constructs no provider, records no usage and requests no rate-limit slot", () => {
    for (const file of WORK_EMITTERS) {
      const source = code(file);
      // `operations/actions.ts` legitimately reaches the provider on the
      // *memory* creation branch, which predates this phase; what must be true
      // is that nothing on a Work-command path does.
      const workPaths = source.slice(source.indexOf("applyWorkItemAction"));
      expect(workPaths, file).not.toMatch(/getAIProvider|recordAIUsage|admitRateLimitedOperation/);
    }
  });
});

describe("2L-METRICS-004: the enforcement points are named, and they agree", () => {
  it("scans a real corpus, so a broken read cannot report clean", () => {
    for (const file of WORK_EMITTERS) {
      expect(statSync(join(REPO, file)).isFile(), `${file} is not a file`).toBe(true);
      expect(read(file).length).toBeGreaterThan(1000);
    }
    expect(eventNamesIn(code(WORK_EMITTERS[0])).length).toBeGreaterThan(0);
  });
});
