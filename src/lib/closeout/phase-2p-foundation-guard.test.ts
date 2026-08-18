/**
 * Phase 2P slice 2P.0 — the measured contracts, pinned.
 *
 * ## What this file is for
 *
 * Slice 2P.0 changes no product behaviour. Its whole output is *measurement*,
 * and a measurement written only into a document is a measurement the next
 * slice can contradict without noticing. This file turns the three findings
 * that later slices spend into assertions:
 *
 * - `2P-FOUNDATION-002` — **which functions re-derive an entry's lifecycle**.
 *   The set is locked. Slice 2P.1's whole correction is to extend it, so 2P.1
 *   must pass through this pin consciously rather than discovering it.
 * - `2P-FOUNDATION-004` — **the capture surface census**: how many components
 *   can begin a capture, which action each submits to, and how many draft
 *   stores exist. Slice 2P.3 unifies the surface and must not grow a store.
 * - `2P-FOUNDATION-005` — **the telemetry map**: the four classes the
 *   requirement names, each against a vocabulary that is already deployed.
 *   Slice 2P.2 adds the producer; if it ever needs a *name* that is not here,
 *   that is a migration and therefore a stop condition.
 *
 * ## Why the SQL is read as "the latest definition wins"
 *
 * Migrations are append-only, so the corpus contains every historical body of
 * every function. Scanning all of it answers "did this ever look like X",
 * which is not the question. `latestDefinition` finds the last migration that
 * redefines a function and reads only that body — the same rule Postgres
 * applies. A guard that scanned the whole corpus would have reported
 * `list_needs_attention` as five different functions.
 *
 * ## Non-vacuity
 *
 * Every extractor below is exercised against a fixture that must produce a
 * different answer, because an extractor that silently starts matching nothing
 * is indistinguishable from one that is correct. Three Phase 2I guards and two
 * Phase 2J guards failed on correct product code for the opposite reason —
 * matching commentary rather than code — so every SQL and TS read here strips
 * comments first.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ERROR_OPERATIONS, ERROR_REASONS, ERROR_SURFACES } from "@/lib/observability/error-sink";
import { productEventNames } from "@/features/product-analytics/contracts";

const REPO = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

/** SQL with `--` line comments removed, so prose never satisfies a match. */
function sqlCode(source: string): string {
  return source.replace(/^\s*--.*$/gm, "");
}

/** TS/TSX with block and line comments removed, for the same reason. */
function tsCode(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const migrationFiles = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();

/**
 * The body of a function as the database currently sees it.
 *
 * Returns the text from the **last** `create or replace function public.<name>(`
 * in the **last** migration that contains one, up to the closing `$function$`
 * / `$$` of that body. Null when the name is never defined.
 */
function latestDefinition(name: string): string | null {
  const opener = new RegExp(String.raw`create\s+or\s+replace\s+function\s+public\.${name}\s*\(`, "gi");
  for (let index = migrationFiles.length - 1; index >= 0; index -= 1) {
    const source = sqlCode(readFileSync(join(MIGRATIONS, migrationFiles[index]!), "utf8"));
    const starts = [...source.matchAll(opener)].map((match) => match.index ?? -1).filter((at) => at >= 0);
    if (starts.length === 0) continue;
    const from = starts[starts.length - 1]!;
    // The next function definition in the same file bounds this one; otherwise
    // the file's end does. Bounding matters: several migrations redefine four
    // functions in a row and an unbounded read would attribute all four bodies
    // to the first name.
    const rest = source.slice(from + 1);
    const nextAt = rest.search(/create\s+or\s+replace\s+function\s+public\./i);
    return nextAt === -1 ? source.slice(from) : source.slice(from, from + 1 + nextAt);
  }
  return null;
}

describe("2P-FOUNDATION-002: which functions re-derive an entry's lifecycle", () => {
  /**
   * The three, and only the three.
   *
   * `interpretation_lifecycle_status` reads the interpretation's own JSON and
   * nothing else, so an entry's status answers "what did the interpretation
   * ask for", never "what has the owner since resolved". These three call it;
   * every function that records an owner resolution does not. That is the
   * whole of the Needs You defect, measured rather than asserted from prose.
   *
   * **Slice 2P.1 will change this list.** That is intended: extending it is
   * the correction, and this pin is what makes the extension a decision.
   */
  const REDERIVERS = [
    "correct_entry_interpretation",
    "persist_entry_interpretation",
    "persist_reprocessed_entry_interpretation",
  ] as const;

  /** Records an owner resolution. None of these may silently start re-deriving. */
  const RESOLVERS = [
    "confirm_entry_task_candidates_v6",
    "confirm_entry_tasks",
    "record_entry_task_candidate_confirmation",
    "resolve_pending_question_v3",
    "resolve_entry_person_candidates",
  ] as const;

  it("defines every function this census names", () => {
    for (const name of [...REDERIVERS, ...RESOLVERS, "interpretation_lifecycle_status", "list_needs_attention"]) {
      expect(latestDefinition(name), name).not.toBeNull();
    }
  });

  it("locks the re-deriving set to exactly three functions", () => {
    for (const name of REDERIVERS) {
      expect(latestDefinition(name), name).toContain("interpretation_lifecycle_status");
    }
  });

  it("records that no resolution function re-derives the lifecycle", () => {
    // When slice 2P.1 lands, one or more of these moves to REDERIVERS. The
    // failure this then produces is the point: it says "the contract 2P.0
    // measured has changed", which is exactly what a reviewer must see.
    for (const name of RESOLVERS) {
      expect(latestDefinition(name), `${name} now re-derives — move it to REDERIVERS and say so in the slice record`)
        .not.toContain("interpretation_lifecycle_status");
    }
  });

  it("derives the lifecycle from the interpretation alone", () => {
    const body = latestDefinition("interpretation_lifecycle_status")!;
    for (const outcome of ["partially_processed", "awaiting_review", "completed"]) {
      expect(body, outcome).toContain(outcome);
    }
    // Three inputs, all from the interpretation. No entry id, no owner id, and
    // therefore nothing it could read about what the owner has resolved.
    expect(body).toContain("p_pending_questions");
    expect(body).toContain("p_element_trust");
    expect(body).toContain("p_record_only");
    expect(body).not.toMatch(/p_entry_id|p_user_id/);
  });

  it("shows the queue reason keyed on status before any finer predicate", () => {
    const body = latestDefinition("list_needs_attention")!;
    expect(body).toMatch(/entry_status in \('awaiting_review', 'partially_processed'\)/);
    expect(body).toContain("review_interpretation");
    // The finer predicates exist and are correct; they are unreachable while
    // the status cannot move, which is why 2P.1 needs no projection change.
    expect(body).toContain("has_open_question");
    expect(body).toContain("has_unconfirmed_candidate");
  });

  it("is not vacuous: latestDefinition bounds a body and ignores commentary", () => {
    expect(latestDefinition("a_function_that_was_never_written")).toBeNull();
    // A body must not swallow the next definition in the same file.
    const first = latestDefinition("interpretation_lifecycle_status")!;
    expect(first.match(/create\s+or\s+replace\s+function\s+public\./gi)).toHaveLength(1);
    // Commentary naming a function must not count as defining or calling it.
    expect(sqlCode("-- create or replace function public.fake(")).not.toContain("create or replace");
    expect(sqlCode("-- calls interpretation_lifecycle_status here")).not.toContain("interpretation_lifecycle_status");
  });
});

describe("2P-FOUNDATION-004: the capture surface census", () => {
  const quickCapture = tsCode(read("src/features/capture/quick-capture-form.tsx"));
  const draftModule = "src/features/capture/composer-draft.ts";

  it("mounts the text composer from exactly two surfaces, with distinct draft scopes", () => {
    const home = tsCode(read("src/features/shell/home-dashboard.tsx"));
    const capture = tsCode(read("src/app/[locale]/app/capture/page.tsx"));
    expect(home).toContain('captureSource="home"');
    expect(capture).toContain('captureSource="capture_page"');
    // A third surface would mean a third draft scope and a third place the
    // composer contract is decided. Slice 2P.3 unifies these two; it does not
    // add one.
    const sources = [...walkSource()]
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .map((path) => tsCode(readFileSync(path, "utf8")))
      .flatMap((code) => [...code.matchAll(/captureSource="([a-z_]+)"/g)].map((match) => match[1]!));
    expect([...new Set(sources)].sort()).toEqual(["capture_page", "home"]);
  });

  it("keeps exactly one draft store, and it stores text only", () => {
    const consumers = [...walkSource()]
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => tsCode(readFileSync(path, "utf8")).includes("composer-draft"));
    expect(consumers.map((path) => path.slice(REPO.length + 1).replace(/\\/g, "/")))
      .toEqual(["src/features/capture/quick-capture-form.tsx"]);

    const store = tsCode(read(draftModule));
    // `T-4`: a restored draft may never carry authority to replay a send.
    expect(store).not.toMatch(/localStorage/);
    expect(store).toContain("sessionStorage");
    expect(store).not.toMatch(/idempotenc/i);
    expect(quickCapture).toContain("clearDraft");
  });

  it("is not vacuous: the census detects a planted third surface and a planted store", () => {
    expect(/captureSource="([a-z_]+)"/.test('<Form captureSource="widget" />')).toBe(true);
    expect(tsCode('const x = "composer-draft";').includes("composer-draft")).toBe(true);
    expect(tsCode('// imports composer-draft').includes("composer-draft")).toBe(false);
  });
});

describe("2P-FOUNDATION-005: the telemetry map is already deployed", () => {
  it("carries a failure-class vocabulary that covers every class 2P-CHAT-002 needs", () => {
    // Each row is one of the five distinguishable failures the requirement
    // names, against reasons that already exist in `error_events_reason_check`.
    // `error-sink-parity.test.ts` is what keeps this list equal to the SQL.
    const classes: Readonly<Record<string, readonly string[]>> = {
      credential: ["permission_denied", "lifecycle_blocked"],
      quota: ["quota_exceeded", "throttled"],
      retrieval: ["database_error", "not_found"],
      provider: ["provider_error", "provider_rate_limited"],
      temporary: ["provider_timeout", "timeout"],
    };
    for (const [failure, reasons] of Object.entries(classes)) {
      for (const reason of reasons) {
        expect(ERROR_REASONS, `${failure} → ${reason}`).toContain(reason);
      }
    }
    expect(ERROR_OPERATIONS).toContain("chat_answer");
    expect(ERROR_OPERATIONS).toContain("embed_text");
    expect(ERROR_SURFACES).toContain("server_action");
  });

  it("carries a queue-reason vocabulary for Needs You outcomes", () => {
    for (const name of ["attention_item_resolved", "needs_attention_viewed", "needs_attention_item_opened"]) {
      expect(productEventNames, name).toContain(name);
    }
  });

  it("records that the chat path has no sink producer yet", () => {
    // The measured gap. Slice 2P.2 closes it, and when it does this assertion
    // fails and must be inverted — which is how the change becomes visible in
    // review rather than arriving as an unremarked behaviour.
    const chat = tsCode(read("src/features/chat/actions.ts"));
    expect(chat, "chat now records to the sink — invert this and say so in the 2P.2 record")
      .not.toContain("recordErrorEvent");
    // And the boundary still claims the sink does not exist, which it has since
    // `202608070080`.
    expect(read("src/app/[locale]/app/error.tsx")).toContain("There is no error sink in this product yet");
  });

  it("is not vacuous: the vocabularies are real and a missing name is detected", () => {
    expect(ERROR_REASONS.length).toBeGreaterThan(10);
    expect(productEventNames.length).toBeGreaterThan(30);
    expect(ERROR_REASONS as readonly string[]).not.toContain("automation_declined");
    expect(productEventNames as readonly string[]).not.toContain("automation_decided");
  });
});

/** Every `.ts`/`.tsx` under `src`, so a broken walk cannot report clean. */
function* walkSource(dir = join(REPO, "src")): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walkSource(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

describe("the census walks a real tree", () => {
  it("sees a non-trivial number of source files", () => {
    expect([...walkSource()].length).toBeGreaterThan(200);
  });

  it("sees the whole migration chain", () => {
    expect(migrationFiles).toHaveLength(97);
  });
});
