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
import { BRAIN_DOMAIN_LENSES, BRAIN_LENSES } from "@/features/library/lenses";

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
function definitionIn(source: string, name: string, schema: "public" | "private" = "public"): string | null {
  const opener = new RegExp(String.raw`create\s+or\s+replace\s+function\s+${schema}\.${name}\s*\(`, "gi");
  const starts = [...source.matchAll(opener)].map((match) => match.index ?? -1).filter((at) => at >= 0);
  if (starts.length === 0) return null;
  const from = starts[starts.length - 1]!;
  // The next function definition in the same file bounds this one; otherwise
  // the file's end does. Bounding matters: several migrations redefine four
  // functions in a row and an unbounded read would attribute all four bodies
  // to the first name. Slice 2P.1's migration defines in both schemas, so the
  // bound has to see either — otherwise a private body would swallow the
  // public one that follows it.
  const rest = source.slice(from + 1);
  const nextAt = rest.search(/create\s+or\s+replace\s+function\s+(public|private)\./i);
  return nextAt === -1 ? source.slice(from) : source.slice(from, from + 1 + nextAt);
}

function latestDefinition(name: string, schema: "public" | "private" = "public"): string | null {
  for (let index = migrationFiles.length - 1; index >= 0; index -= 1) {
    const source = sqlCode(readFileSync(join(MIGRATIONS, migrationFiles[index]!), "utf8"));
    const found = definitionIn(source, name, schema);
    if (found !== null) return found;
  }
  return null;
}

/** The definition a NAMED migration shipped, for comparing an era against its successor. */
function definitionInMigration(file: string, name: string): string | null {
  return definitionIn(sqlCode(readFileSync(join(MIGRATIONS, file), "utf8")), name);
}

/**
 * The reason literals a projection body decides, in CASE order.
 *
 * Comments are already stripped by `sqlCode`, and these five strings appear
 * nowhere in the function except as `then` values, so the sequence this returns
 * is the decision order the database will actually apply.
 */
function reasonOrder(body: string): string[] {
  const literals =
    /then\s+'(resolve_consistency|retry_processing|answer_existing_question|confirm_existing_candidates|review_interpretation)'/gi;
  return [...body.matchAll(literals)].map((match) => match[1]!.toLowerCase());
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

  /*
    SLICE 2P.1 PASSED THROUGH THIS PIN CONSCIOUSLY, AND THE ANSWER WAS NEITHER
    "move a resolver to REDERIVERS" NOR "leave it alone".

    2P.0 wrote the pin expecting 2P.1 to add `interpretation_lifecycle_status`
    to one or more resolver bodies. Re-measuring against the hosted database
    found twelve resolution functions, not nine, ten of them still granted to
    `authenticated` — so patching bodies would have had to be done twelve times
    and would still have been twelve places for the next divergence to start.

    What 202608180098 does instead: the union of everything the twelve write is
    four tables, and each of those four now carries an `after` trigger running
    ONE function, which calls ONE central contract. The resolvers are therefore
    still correct not to contain the derivation — but the reason changed
    completely, from "nothing re-derives" to "re-derivation is not their job".

    So the old assertion is kept (it is still true and still catches a stray
    twelfth copy of the rule) and it is no longer sufficient on its own. The
    two assertions below are what actually hold the contract now.
  */
  it("keeps the rule out of the resolution functions themselves", () => {
    for (const name of RESOLVERS) {
      expect(latestDefinition(name), `${name} grew its own copy of the lifecycle rule — the contract is central`)
        .not.toContain("interpretation_lifecycle_status");
    }
  });

  it("routes every resolution table through one central re-derivation contract", () => {
    const contract = latestDefinition("entry_pending_decisions", "private");
    expect(contract, "the central pending-decision contract must exist").not.toBeNull();
    // It is the single consumer of the deployed derivation for resolved state.
    expect(contract).toContain("interpretation_lifecycle_status");
    // And it reads the entry and the owner, which the derivation alone cannot.
    expect(contract).toContain("p_entry_id");
    expect(contract).toContain("p_user_id");

    // Every table the twelve resolution functions write reaches it. Missing one
    // means a resolution route that still cannot move the entry's status.
    const migration = sqlCode(read(
      "supabase/migrations/202608180098_phase_2p_slice_1_entry_lifecycle_rederivation.sql",
    ));
    for (const table of [
      "public.tasks",
      "public.entry_task_candidate_resolutions",
      "public.pending_questions",
      "public.entry_person_candidate_resolutions",
    ]) {
      expect(migration, `${table} must re-derive`).toMatch(
        new RegExp(String.raw`after insert or update or delete on ${table}\s+for each row execute function private\.rederive_entry_lifecycle_from_row`, "i"),
      );
    }
    // One trigger function, not four. Four would be four places to drift.
    expect([...migration.matchAll(/create or replace function private\.rederive_entry_lifecycle_from_row/gi)])
      .toHaveLength(1);
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

  /**
   * The order the queue decides its reason in, pinned.
   *
   * 2P.0 predicted the projection would need no change once the status could
   * move. That was half right, and the half that was wrong is why this pin
   * exists rather than the one it replaces. The finer predicates *are* correct
   * — but they were gated on `status = 'completed'` and sequenced *after* the
   * generic status branch, so making the status truthful made them **less**
   * reachable: an entry with one unconfirmed candidate becomes
   * `awaiting_review` and the generic branch swallowed
   * `confirm_existing_candidates`. The entry never wrongly left the queue; it
   * stayed under a less specific reason, which is a regression against
   * `2P-ATTENTION-004`.
   *
   * The predecessor pin said "the migration must not redefine this function".
   * That was the right instinct for a slice that changed only the status, and
   * the wrong rule once the reordering became the correction. It is **replaced,
   * not relaxed**: what follows pins the exact decision order and the exact
   * semantics, which is strictly more than "unchanged" ever asserted.
   */
  const QUEUE_DECISION_ORDER = [
    "resolve_consistency",
    "retry_processing",
    "retry_processing",
    "answer_existing_question",
    "confirm_existing_candidates",
    "confirm_existing_candidates",
    "review_interpretation",
    "resolve_consistency",
  ] as const;

  it("decides every finer reason before the generic one", () => {
    const body = latestDefinition("list_needs_attention")!;
    expect(reasonOrder(body)).toEqual([...QUEUE_DECISION_ORDER]);

    // The three finer branches are gated on the statuses the central contract
    // governs — not on 'completed' alone, which is the dependency that made
    // them unreachable.
    expect(body.match(/entry_status in \('awaiting_review', 'partially_processed', 'completed'\)/g))
      .toHaveLength(3);
    // ...and the generic branch keeps the two-status gate, so it can only be
    // reached by an entry whose finer decisions are all resolved. That is the
    // whole of its new meaning: the interpretation itself is still unconfirmed.
    expect(body).toMatch(
      /entry_status in \('awaiting_review', 'partially_processed'\)\s*then 'review_interpretation'/,
    );

    // Every predicate the queue decides on, still present and still the same
    // ones private.entry_pending_decisions uses.
    expect(body).toContain("has_open_question");
    expect(body).toContain("has_unconfirmed_candidate");
    expect(body).toContain("has_unresolved_person_candidate");

    // An unresolved person candidate is a real pending decision and reports a
    // FINER reason. It must not add a sixth vocabulary value: the five names
    // needs_attention_item_opened validates inside the database are unchanged,
    // and this migration does not touch that validator.
    expect(new Set(reasonOrder(body))).toEqual(
      new Set([
        "resolve_consistency",
        "retry_processing",
        "answer_existing_question",
        "confirm_existing_candidates",
        "review_interpretation",
      ]),
    );
    expect(sqlCode(read("supabase/migrations/202608180098_phase_2p_slice_1_entry_lifecycle_rederivation.sql")))
      .not.toMatch(/require_product_event_enum|needs_attention_item_opened/i);
  });

  it("is not vacuous: the definition this replaced fails the same pin", () => {
    // The control is the real predecessor, read from its own migration on disk
    // — not a synthetic body, and nothing is mutated to produce it. Restoring
    // the old order by editing a file would leave the tree dirty if the run
    // died between planting and restoring; reading the era that actually
    // shipped proves the same thing and cannot.
    const previous = definitionInMigration("202607230048_phase_2d_question_dispositions.sql", "list_needs_attention")!;
    const order = reasonOrder(previous);

    // This is the defect, in the bytes that shipped it: the generic reason was
    // decided BEFORE both finer ones.
    expect(order).toEqual([
      "resolve_consistency",
      "retry_processing",
      "retry_processing",
      "review_interpretation",
      "answer_existing_question",
      "confirm_existing_candidates",
      "resolve_consistency",
    ]);
    expect(order.indexOf("review_interpretation")).toBeLessThan(order.indexOf("answer_existing_question"));
    expect(order.indexOf("review_interpretation")).toBeLessThan(order.indexOf("confirm_existing_candidates"));

    // And the pin above rejects it — so the pin can fail, and says why.
    expect(order).not.toEqual([...QUEUE_DECISION_ORDER]);
    // Its finer branches were gated on 'completed' alone, and it knew nothing
    // about person candidates.
    expect(previous).toMatch(/entry_status = 'completed' and f\.has_open_question/);
    expect(previous).not.toContain("has_unresolved_person_candidate");
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
  /*
    Slice 2P.3 renamed this file: `quick-capture-form.tsx` became `composer.tsx`
    when the modality tabs were deleted and the text form grew the attachment
    and microphone controls. The PROPERTY this block pins is unchanged -- two
    mounting surfaces, one draft store, one consumer, text only -- so the pin is
    retargeted rather than relaxed, which is the passage 2P.0 asked any later
    slice to make consciously.
  */
  const composer = tsCode(read("src/features/capture/composer.tsx"));
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
      .toEqual(["src/features/capture/composer.tsx"]);

    const store = tsCode(read(draftModule));
    // `T-4`: a restored draft may never carry authority to replay a send.
    expect(store).not.toMatch(/localStorage/);
    expect(store).toContain("sessionStorage");
    expect(store).not.toMatch(/idempotenc/i);
    expect(composer).toContain("clearDraft");
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

  /**
   * **Inverted by slice 2P.2, which is what this pair was for.**
   *
   * Slice 2P.0 asserted the gap: the chat path contained no `recordErrorEvent`
   * call, and `error.tsx` still claimed *"There is no error sink in this product
   * yet"* although the sink shipped in `202608070080`. Both assertions carried a
   * message saying they must be inverted when the gap closed, so that closing it
   * could not arrive as an unremarked behaviour change. It closed; they are
   * inverted; the direction each one guards is now the opposite one.
   */
  it("records to the sink from the chat path, and the boundary no longer denies the sink", () => {
    const chat = tsCode(read("src/features/chat/actions.ts"));
    expect(chat, "the chat path stopped recording failures").toContain("recordErrorEvent");
    // Both provider operations are distinguishable in the row, or the sink
    // cannot answer "is retrieval failing, or is generation failing".
    expect(chat).toContain('"chat_answer"');
    expect(chat).toContain('"embed_text"');
    // `unstable_rethrow` guards the broadened catch. Without it, a future
    // `redirect()` inside the try becomes a rendered error state in silence.
    expect(chat).toContain("unstable_rethrow");

    const boundary = read("src/app/[locale]/app/error.tsx");
    expect(boundary, "the false no-sink claim came back").not.toContain(
      "There is no error sink in this product yet",
    );
    // It must still not claim the render-time fault WAS recorded — it is not,
    // and the digest is the only durable value on that screen.
    expect(boundary).toContain("error.digest");
  });

  it("leaves no thrown value able to escape the task-command guard", () => {
    const commands = tsCode(read("src/features/task-commands/actions.ts"));
    // The rethrow this replaced was the measured mechanism behind the generic
    // boundary: `runTaskCommand` runs before the knowledge path on the default
    // Conversation route.
    expect(commands, "an undeclared fault can escape the Server Action again")
      .not.toMatch(/if \(!known\) throw error;/);
    expect(commands).toContain("unstable_rethrow");
    expect(commands).toContain("recordErrorEvent");
  });

  it("is not vacuous: the vocabularies are real and a missing name is detected", () => {
    expect(ERROR_REASONS.length).toBeGreaterThan(10);
    expect(productEventNames.length).toBeGreaterThan(30);
    expect(ERROR_REASONS as readonly string[]).not.toContain("automation_declined");
    expect(productEventNames as readonly string[]).not.toContain("automation_decided");
  });
});

describe("2P-CHAT-004/005: Conversation is reachable, and the way in carries no content", () => {
  it("makes Conversas the first Brain domain lens, with the overview still leading", () => {
    // `OD-2P-7`. This reverses `lenses.ts`'s prior reading order, so the
    // assertion is on the derived arrays rather than on the literal — a future
    // edit that reorders `DECLARED_ORDER` back has to fail here.
    expect(BRAIN_LENSES[0]).toBe("overview");
    expect(BRAIN_LENSES[1]).toBe("chat");
    expect(BRAIN_DOMAIN_LENSES[0]).toBe("chat");
    // Nothing was dropped by the reorder.
    expect(BRAIN_DOMAIN_LENSES).toHaveLength(8);
    expect(new Set(BRAIN_LENSES).size).toBe(BRAIN_LENSES.length);
  });

  it("mounts the contextual entry on all four subject workspaces", () => {
    const pages = [
      "src/app/[locale]/app/people/[personId]/page.tsx",
      "src/app/[locale]/app/projects/[projectId]/page.tsx",
      "src/app/[locale]/app/organizations/[organizationId]/page.tsx",
      "src/app/[locale]/app/contexts/[contextId]/page.tsx",
    ];
    for (const page of pages) {
      const code = tsCode(read(page));
      expect(code, `${page} has no way into a conversation`).toContain("<AskAboutLink");
    }
    // The census, re-derived: exactly four mounts, so a fifth subject type
    // arriving without a route in `ask-about.ts` is visible here.
    const mounts = [...walkSource()]
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => tsCode(readFileSync(path, "utf8")).includes("<AskAboutLink"));
    expect(mounts).toHaveLength(pages.length);
  });

  it("carries only an opaque handle into the conversation surface", () => {
    // `T-11` in its 2P.2 form: the affordance must not put a name, a question or
    // any owner content into a URL. The href is built in exactly one place and
    // that place serializes `type:id`.
    const contract = tsCode(read("src/features/conversation-cards/ask-about.ts"));
    expect(contract).toContain("`${subject.type}:${subject.id}`");
    const link = tsCode(read("src/features/conversation-cards/ask-about-link.tsx"));
    expect(link).toContain("askAboutHref(locale, about)");
    // A name reaching the href would mean the link built its own query string.
    expect(link).not.toMatch(/href=\{`/);
  });

  it("resolves the subject name server-side, under the caller's own client", () => {
    const resolver = tsCode(read("src/features/conversation-cards/resolve-ask-about.ts"));
    expect(resolver).toContain('"server-only"');
    // Four explicit queries. `supabase.from(subject.type)` would make a query
    // parameter a table selector.
    expect(resolver).not.toMatch(/\.from\(\s*subject\./);
    for (const table of ["people", "projects", "organizations", "contexts"]) {
      expect(resolver, table).toContain(`read("${table}")`);
    }
  });

  it("seeds the composer without submitting it", () => {
    const composer = tsCode(read("src/features/assistant/assistant-composer.tsx"));
    // `idle`-only, so a resolved turn never has its field refilled, and the
    // owner's restored echo always wins over a seed.
    expect(composer).toContain('state.route === "idle" && initialText');
    expect(composer).toContain("restored ?? seeded ?? \"\"");
    // Still uncontrolled and still `required`: seeding is not sending.
    expect(composer).toContain("defaultValue={initial}");
    expect(composer).toContain("required");
  });

  it("is not vacuous: the mount and handle detectors answer differently on fixtures", () => {
    expect(tsCode("<AskAboutLink locale={l} />").includes("<AskAboutLink")).toBe(true);
    expect(tsCode("// mounts <AskAboutLink here").includes("<AskAboutLink")).toBe(false);
    expect(/\.from\(\s*subject\./.test('supabase.from(subject.type)')).toBe(true);
    expect(/\.from\(\s*subject\./.test('supabase.from("people")')).toBe(false);
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
    // 97 through slice 2P.3; 98 once slice 2P.1 spent the one migration the
    // owner's replacement authorization funded; 99 once slice 2P.4 spent the
    // second one ADR-123 authorized. This number is a corpus-length check for
    // `latestDefinition`, not a budget — the budget is pinned in
    // phase-2p-declarations.test.ts, which asserts exactly two 2P migrations
    // and names the authorization for each.
    // Chain head moved to 100 by Phase 2Q slice 2Q.1's ONE authorized migration (ADR-127 Decision 7 / ADR-128 Decision 3: summaries.citations). Same reasoning: this pin moves in the commit that adds the migration, visibly, and this guard's own claim is untouched. A SECOND 2Q migration is a stop condition and fails here.
    expect(migrationFiles).toHaveLength(100);
  });
});
