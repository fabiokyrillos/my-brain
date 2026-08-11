import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { productEventNames, productSurfaces } from "@/features/product-analytics/contracts";

/**
 * `2M-METRICS-001` / `2M-AUDIT-002` — **no producer may precede its migration**,
 * enforced instead of promised.
 *
 * ## What this would have caught, twice
 *
 * `202608080087` and `202608090089` are both extraordinary post-phase
 * corrections, authorized outside a closed budget, and both fixed the same
 * defect: the application declared a vocabulary the deployed database did not
 * admit. Every emission was refused at the last real write path, inside
 * producers that wrap emission in `.catch(() => {})` — so it was **silent**, and
 * Phase 2K reached closeout with its telemetry entirely inert.
 *
 * The property that was missing is small and checkable: **every name and every
 * surface the application declares must already be admitted by the migration
 * chain.** This asserts it on every run.
 *
 * ## Why it reads the chain rather than the live database
 *
 * The chain is what CI has, and it is the thing a pull request changes. A live
 * reading proves deployment and belongs to G8; this proves *ordering*, which is
 * the half that was wrong. They are different questions and both are asked.
 *
 * ## The enforcement points, by name
 *
 * `2M-AUDIT-002` requires them enumerated rather than counted, because a count
 * is what let a "non-vocabulary guard" survive one correction and cause the
 * next. At this baseline they are exactly five:
 *
 * 1. `product_events_event_name_check` — the table CHECK on the name;
 * 2. `private.validate_product_event_properties` — the per-name key whitelist;
 * 3. `productEventNames` — the application's name vocabulary;
 * 4. `product_events_surface_check` — the table CHECK on the surface;
 * 5. `productSurfaces` — the application's surface vocabulary.
 *
 * The writer holds **no** copy of either: `202608080087` deleted the frozen
 * event-name list and `202608090089` deleted the surface list. That absence is
 * asserted below, because it is the property those two migrations bought.
 */

const REPO = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase/migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
}

/**
 * The values a named `check (<column> in (...))` constraint admits, taken from
 * the **last** migration that rewrites it — which is what the deployed database
 * has, because the chain is append-only and applied in order.
 */
function admittedValues(column: string): readonly string[] {
  let latest: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const at = sql.search(new RegExp(`${column}\\s+in\\s*\\(`));
    if (at < 0) continue;
    const open = sql.indexOf("(", at);
    let depth = 0;
    let close = -1;
    for (let index = open; index < sql.length; index += 1) {
      if (sql[index] === "(") depth += 1;
      else if (sql[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }
    if (close < 0) continue;
    const values = [...sql.slice(open + 1, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    // A later migration that rewrites the constraint replaces it wholesale, so
    // the last one wins — but a *narrower* rewrite would be a real vocabulary
    // loss rather than a parse failure, and taking the last is what represents
    // that faithfully.
    if (values.length > 0) latest = values;
  }
  return latest;
}

/** The event names `private.validate_product_event_properties` has a branch for. */
function validatedEventNames(): readonly string[] {
  let latest: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const start = sql.indexOf("function private.validate_product_event_properties");
    if (start < 0) continue;
    const body = sql.slice(start);
    const end = body.indexOf("raise exception 'Unsupported product event'");
    if (end < 0) continue;
    const names = [...body.slice(0, end).matchAll(/when\s+((?:'[a-z_]+'\s*,?\s*)+)then/g)]
      .flatMap((match) => [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    if (names.length > 0) latest = names;
  }
  return latest;
}

describe("2M-METRICS-001: no producer precedes its migration", () => {
  it("admits every event name the application declares", () => {
    const admitted = new Set(admittedValues("event_name"));
    const undeclared = productEventNames.filter((name) => !admitted.has(name));
    expect(
      undeclared,
      `the application declares event names the migration chain does not admit: ${undeclared.join(", ")}`,
    ).toEqual([]);
  });

  it("admits every surface the application declares", () => {
    const admitted = new Set(admittedValues("surface"));
    const undeclared = productSurfaces.filter((surface) => !admitted.has(surface));
    expect(
      undeclared,
      `the application declares surfaces the migration chain does not admit: ${undeclared.join(", ")}`,
    ).toEqual([]);
  });

  it("gives every declared event name a property branch, so none is refused at 22023", () => {
    // The second gate. Phase 2K widened the CHECK and the validator but not the
    // surface CHECK; a name admitted by one and refused by another is exactly as
    // inert as a name admitted by neither, and just as silent.
    const validated = new Set(validatedEventNames());
    const missing = productEventNames.filter((name) => !validated.has(name));
    expect(
      missing,
      `these event names have no property branch and would raise 22023: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("detects the defect it exists for, on a name the chain does not admit", () => {
    // The mutation. Without it, a rule whose extraction silently returned
    // everything would pass and prove nothing.
    const admitted = new Set(admittedValues("event_name"));
    expect(admitted.has("calendar_day_viewed")).toBe(false);
    expect(admitted.size).toBeGreaterThan(20);
    const wouldFail = ["capture_started", "calendar_day_viewed"].filter((n) => !admitted.has(n));
    expect(wouldFail).toEqual(["calendar_day_viewed"]);
  });
});

describe("2M-AUDIT-002: the enforcement points are enumerated, not counted", () => {
  it("finds all five where the audit says they are", () => {
    const chain = migrationFiles().map((file) => readFileSync(join(MIGRATIONS, file), "utf8")).join("\n");
    expect(chain).toContain("product_events_event_name_check");
    expect(chain).toContain("private.validate_product_event_properties");
    expect(chain).toContain("product_events_surface_check");

    const contracts = readFileSync(
      join(REPO, "src/features/product-analytics/contracts.ts"),
      "utf8",
    );
    expect(contracts).toMatch(/export const productEventNames = \[/);
    expect(contracts).toMatch(/export const productSurfaces = \[/);
  });

  it("keeps the writer free of a vocabulary copy, which is what two corrections bought", () => {
    /*
     * `202608080087` deleted the frozen event-name list from
     * `private.record_product_event` and `202608090089` deleted the surface
     * list. A third copy reappearing is the exact shape of both defects, so it
     * is asserted against rather than remembered.
     *
     * The check is deliberately on the LAST definition of the function: earlier
     * migrations legitimately contain the copies they later delete, and a scan
     * over the whole chain would fail on its own history.
     */
    let lastDefinition = "";
    for (const file of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8");
      const start = sql.lastIndexOf("function private.record_product_event");
      if (start < 0) continue;
      const body = sql.slice(start);
      const end = body.indexOf("\n$$;");
      lastDefinition = end < 0 ? body : body.slice(0, end);
    }
    expect(lastDefinition, "record_product_event was not found in the chain").not.toBe("");
    expect(lastDefinition, "the writer carries an event-name vocabulary copy again")
      .not.toMatch(/p_event_name\s+(not\s+)?in\s*\(\s*'/);
    expect(lastDefinition, "the writer carries a surface vocabulary copy again")
      .not.toMatch(/p_surface\s+(not\s+)?in\s*\(\s*'/);
  });

  it("declares the calendar surface, and the migration chain admits it", () => {
    /*
     * This assertion was the inverse until migration 1 was spent: it read
     * "declares no calendar surface yet, because migration 1 has not been
     * spent", and the plan said the change would be "a migration plus this
     * line". It is now that migration plus this line, so the transition is
     * visible as a decision rather than as a diff nobody read.
     *
     * OD-2M-2 signed `calendar` as its own surface. `2M-PRIVACY-001` requires
     * it to join `GOVERNED_SURFACES` in the same change that ships its first
     * consumer, which is a **later** pull request — this one deliberately ships
     * no producer and no surface.
     */
    expect((productSurfaces as readonly string[]).includes("calendar")).toBe(true);
    expect(admittedValues("surface")).toContain("calendar");
  });
});

/**
 * `2M-METRICS-002` … `-005` — migration 1's own properties.
 *
 * The migration is `202608110090`. It widens the three database enforcement
 * points in one file, and lands with the two application vocabularies and with
 * **no producer**, which is `2M-METRICS-001`'s ordering.
 */
describe("Phase 2M migration 1: the daily-cycle vocabulary", () => {
  const MIGRATION = "supabase/migrations/202608110090_phase_2m_daily_cycle_telemetry.sql";
  const WRITE_PATH = "supabase/tests/post_2j_product_event_write_path.sql";
  const FUNNEL = "scripts/phase-2m-daily-cycle-funnel.mjs";
  const READER = "scripts/phase-2m-daily-cycle-funnel-reader.mjs";
  const read = (path: string) => readFileSync(join(REPO, path), "utf8");

  const PHASE_2M_EVENTS = [
    "calendar_viewed",
    "day_planned",
    "day_review_opened",
    "day_review_action_applied",
    "notification_consent_changed",
    "notification_suppressed",
  ] as const;

  /**
   * Keys that could hold free text or a user-chosen value. None may appear on
   * any Phase 2M event.
   *
   * The date and time entries are the ones this phase adds to the inherited
   * list, and they are the point: a calendar phase is exactly where a
   * `plannedDate` or an `anchorDate` would feel harmless, and it is a
   * behavioural fingerprint — it says which days somebody works and which they
   * protect.
   */
  const CONTENT_SHAPED = [
    "title", "description", "name", "personName", "projectName", "text",
    "content", "summary", "excerpt", "snippet", "label", "note", "query",
    "date", "plannedDate", "anchorDate", "dueDate", "remindAt", "time",
    "timezone", "endpoint", "subscription", "payload", "reviewText",
  ];

  it("declares all six events in the canonical application vocabulary", () => {
    for (const name of PHASE_2M_EVENTS) {
      expect(productEventNames as readonly string[], name).toContain(name);
    }
  });

  it("carries the identical six into the migration's CHECK", () => {
    const check = read(MIGRATION).match(/check \(event_name in \(([\s\S]*?)\n {2}\)\);/)?.[1] ?? "";
    expect(check, "CHECK block not found").not.toBe("");
    for (const name of PHASE_2M_EVENTS) {
      expect(check, `${name} missing from the CHECK`).toContain(`'${name}'`);
    }
  });

  it("carries them into the validator too — both live gates, in one file", () => {
    const migration = read(MIGRATION);
    const validator = migration.slice(
      migration.indexOf("create or replace function private.validate_product_event_properties"),
    );
    for (const name of PHASE_2M_EVENTS) {
      // Once in the key whitelist, once in the value check. A name in only one
      // is a name the database would accept and then refuse, or accept
      // unchecked.
      expect(validator.split(`'${name}'`).length - 1, `${name} appears in only one case block`)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it("loses no pre-existing name to the re-declaration", () => {
    // The failure mode a `create or replace` invites. Compared against the
    // chain's own previous vocabulary, so it cannot pass by comparing a list
    // against itself.
    const migration = read(MIGRATION);
    const inherited = admittedValues("event_name").filter(
      (name) => !(PHASE_2M_EVENTS as readonly string[]).includes(name),
    );
    expect(inherited.length, "no inherited vocabulary was extracted").toBeGreaterThanOrEqual(33);
    for (const name of inherited) {
      expect(migration, `${name} lost from the migration`).toContain(`'${name}'`);
    }
  });

  it("loses no pre-existing surface either", () => {
    const migration = read(MIGRATION);
    for (const surface of productSurfaces as readonly string[]) {
      expect(migration, `${surface} lost from the surface CHECK`).toContain(`'${surface}'`);
    }
    expect(productSurfaces.length).toBeGreaterThanOrEqual(12);
  });

  it("2M-METRICS-004: declares only closed enums and one bounded count", () => {
    const contracts = read("src/features/product-analytics/contracts.ts");
    for (const name of PHASE_2M_EVENTS) {
      const start = contracts.indexOf(`  ${name}: {`);
      expect(start, `${name} property shape not found`).toBeGreaterThan(0);
      const shape = contracts.slice(start, contracts.indexOf("};", start));
      const fields = [...shape.matchAll(/^\s{4}(\w+):\s*(.+);$/gm)];
      expect(fields.length, `${name} declares no fields`).toBeGreaterThan(0);
      for (const [, field, type] of fields) {
        // `itemCount` is this phase's only number, and it is bounded in three
        // places: the type, `isBoundedInteger` in the parser, and
        // `require_product_event_integer` in the database.
        const bounded = field === "itemCount"
          ? type.trim() === "number"
          : /^(boolean|[A-Z]\w+)$/.test(type.trim()) || /^"[^"]+"(\s*\|\s*"[^"]+")*$/.test(type.trim());
        expect(bounded, `${name}.${field} is "${type.trim()}", which is not a closed enum, a boolean or the bounded count`)
          .toBe(true);
      }
    }
  });

  it("2M-METRICS-004: names no content-shaped KEY on any Phase 2M event", () => {
    // Scanned per arm and only over the KEY WHITELIST: the requirement is about
    // what a key can hold, and an enum VALUE that happens to read like a word
    // is not a key.
    const migration = read(MIGRATION);
    for (const name of PHASE_2M_EVENTS) {
      const arm = migration.match(
        new RegExp(`when '${name}' then\\s*\\n\\s*allowed_keys := array\\[([^\\]]*)\\]`),
      );
      expect(arm, `${name} declares no key whitelist`).not.toBeNull();
      const keys = (arm?.[1] ?? "").match(/'([^']+)'/g) ?? [];
      expect(keys.length, `${name} whitelists no key`).toBeGreaterThan(0);
      for (const key of CONTENT_SHAPED) {
        expect(keys, `${name} admits a "${key}" key`).not.toContain(`'${key}'`);
      }
    }
  });

  it("fires on a planted date key, so the assertion above is not vacuous", () => {
    const planted = "when 'day_planned' then\n      allowed_keys := array['operation', 'plannedDate'];";
    const arm = planted.match(/when 'day_planned' then\s*\n\s*allowed_keys := array\[([^\]]*)\]/);
    const keys = (arm?.[1] ?? "").match(/'([^']+)'/g) ?? [];
    expect(keys).toContain("'plannedDate'");
  });

  it("2M-METRICS-002: proves every value through the REAL writer, with negative controls", () => {
    const writePath = read(WRITE_PATH);
    for (const name of PHASE_2M_EVENTS) {
      expect(writePath, `${name} has no legal payload in the write-path suite`)
        .toContain(`'${name}'`);
    }
    expect(writePath).toContain("all six Phase 2M daily-cycle events are written through the real public writer");
    expect(writePath).toContain("PHASE 2M: the calendar surface is accepted by the real writer");
    // Negative controls that are NOT vacuous: refused by the gate under test,
    // on a valid surface and for a valid event name.
    expect(writePath).toContain("a user-chosen date is refused");
    expect(writePath).toContain("an orientation outside the declared three is refused on the calendar surface itself");
    // Idempotency and owner scope.
    expect(writePath).toContain("a repeated idempotency key records exactly once");
    expect(writePath).toContain("the authenticated write is owned by the session identity, not by an argument");
  });

  it("2M-METRICS-003: a consumer exists, reads all six, and is RLS-scoped", () => {
    const funnel = read(FUNNEL);
    for (const name of PHASE_2M_EVENTS) {
      expect(funnel, `the consumer does not read ${name}`).toContain(name);
    }
    const reader = read(READER);
    expect(reader).toContain("signInWithPassword");
    expect(reader).not.toMatch(/service_role|SERVICE_ROLE|serviceRoleKey/);
    // Measuring must not perturb what is measured.
    expect(reader).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|record_product_event/);
    // "Not deployed yet", "no producer yet" and "a quiet week" must be
    // distinguishable, which is the confusion SH.6 stayed invisible inside.
    expect(reader).toContain("process.exit(2)");
    expect(reader).toContain("does not know the Phase 2M event vocabulary yet");
    expect(funnel).toContain("unrecognised");
  });

  it("2M-METRICS-003: the consumer queries a column the ledger actually has", () => {
    /*
     * The defect this exists for, found by running the reader against the
     * deployed project rather than by reading it.
     *
     * `public.product_events` has exactly one timestamp — `created_at`
     * (`202607170024`). Both this phase's reader and Phase 2K's asked for
     * `occurred_at`, which does not exist, so every invocation died on
     * *"column product_events.occurred_at does not exist"*. Neither had ever
     * fired, because a manual script nobody runs reports nothing at all — the
     * same silence SH.6's producer-without-a-consumer had.
     *
     * The column list is derived from the migration that creates the table, so
     * this cannot pass by comparing a hardcoded name against itself.
     */
    const created = read("supabase/migrations/202607170024_phase_2x_product_events.sql");
    const body = created.slice(
      created.indexOf("create table public.product_events ("),
      created.indexOf("constraint product_events_subject_pair_check"),
    );
    const columns = new Set(
      [...body.matchAll(/^ {2}([a-z_]+) (uuid|text|jsonb|boolean|timestamptz)/gm)].map((match) => match[1]),
    );
    expect(columns.size, "no columns were extracted from the create table").toBeGreaterThan(8);
    expect(columns.has("created_at")).toBe(true);
    expect(columns.has("occurred_at"), "the ledger grew an occurred_at; this guard is now wrong").toBe(false);

    for (const consumer of [FUNNEL, READER, "scripts/phase-2k-conversation-funnel-reader.mjs"]) {
      const source = read(consumer);
      const selected = [
        ...source.matchAll(/\.(?:select|gte|lte|order|eq)\(\s*"([a-z_,]+)"/g),
      ].flatMap((match) => match[1].split(","));
      for (const column of selected) {
        expect(columns.has(column), `${consumer} reads product_events.${column}, which does not exist`)
          .toBe(true);
      }
    }
  });

  it("2M-METRICS-002/003: the hosted proof exists, cleans up, and does not overclaim", () => {
    /*
     * The proof is a separate file from the reader on purpose: it needs
     * `service_role` to create and destroy a disposable owner, and the reader
     * must never have it — which is the assertion above this one.
     */
    const proof = read("scripts/phase-2m-daily-cycle-funnel-proof.mjs");
    // It reads through the consumer's own code path, not a query of its own.
    expect(proof).toContain("readDailyCycleRows");
    expect(proof).toContain("aggregateDailyCycleFunnel");
    // Non-vacuous controls, each named.
    for (const control of [
      "undeclared-event-name", "undeclared-surface", "planted-date",
      "out-of-enum-value", "idempotent-replay", "RLS-bound-against-a-real-row",
    ]) {
      expect(proof, `the proof does not run the ${control} control`).toContain(control);
    }
    // Fixtures are disposable, marked, and their removal is proved rather than
    // assumed — owner-scoped, because `product_events` is unreadable to
    // `service_role` and a global count would prove nothing.
    expect(proof).toContain("p_is_synthetic: true");
    expect(proof).toContain("deleteUser");
    expect(proof).toContain("zero residue");
    // And it says plainly which half it cannot prove.
    expect(proof, "the proof must not present a harness as a producer")
      .toContain("no product producer exists yet");
  });

  it("2M-METRICS-005: every declared event answers a question stated before it", () => {
    // The four questions are written into the migration header and into the
    // consumer, and each event is named beneath the one it answers. A seventh
    // name would have no question to sit under.
    const migration = read(MIGRATION);
    const funnel = read(FUNNEL);
    for (const source of [migration, funnel]) {
      expect(source).toMatch(/Q1\./);
      expect(source).toMatch(/Q2\./);
      expect(source).toMatch(/Q3\./);
      expect(source).toMatch(/Q4\./);
    }
    for (const name of PHASE_2M_EVENTS) {
      expect(migration, `${name} is not named under a declared question`).toContain(name);
    }
  });

  /**
   * `2M-METRICS-001` — the producer census, which replaced the absence.
   *
   * Until migration 1 was deployed this asserted that **no** producer existed,
   * and the plan said so: the six names were admitted by the chain and emitted
   * by nothing. That assertion did its job and has been replaced rather than
   * deleted, because "no producer yet" stops being true the moment the first
   * slice ships one and a guard that asserted it forever would have to be
   * disabled instead of moved.
   *
   * What survives is the property that actually matters and is durable: a
   * producer may name only an event the **migration chain already admits**, on a
   * **surface it already admits** — checked against the chain rather than
   * against a list written here — and every event still waiting for its
   * producer is named, so the remaining work is visible instead of assumed.
   */
  function producerSites(): Map<string, string[]> {
    const found = new Map<string, string[]>();
    const walk = (relative: string) => {
      for (const entry of readdirSync(join(REPO, relative), { withFileTypes: true })) {
        const child = `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(child);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        // The vocabulary declaration is not a producer; a call site is.
        if (child === "src/features/product-analytics/contracts.ts") continue;
        const source = readFileSync(join(REPO, child), "utf8");
        for (const name of PHASE_2M_EVENTS) {
          if (!source.includes(`name: "${name}"`)) continue;
          found.set(name, [...(found.get(name) ?? []), child]);
        }
      }
    };
    for (const root of ["src/features", "src/app", "src/lib"]) walk(root);
    return found;
  }

  it("2M-METRICS-001: every producer names an event the deployed chain admits", () => {
    const admittedNames = new Set(admittedValues("event_name"));
    const producers = producerSites();
    expect(admittedNames.size, "no vocabulary was extracted from the chain").toBeGreaterThan(30);
    for (const [name, sites] of producers) {
      expect(admittedNames.has(name), `${sites.join(", ")} emits '${name}', which the chain does not admit`)
        .toBe(true);
    }
  });

  it("2M-METRICS-001: every producer's surface is admitted too", () => {
    // The half `202608090089` was written to correct: Phase 2K's names were
    // admitted and its SURFACE was not, so every event was refused at the last
    // real write path inside a `.catch(() => {})`.
    const admittedSurfaces = new Set(admittedValues("surface"));
    const producers = producerSites();
    for (const [name, sites] of producers) {
      for (const site of sites) {
        const source = readFileSync(join(REPO, site), "utf8");
        const block = source.slice(source.indexOf(`name: "${name}"`));
        const surface = /surface:\s*"([a-z_]+)"/.exec(block)?.[1];
        expect(surface, `${site} emits '${name}' without a literal surface`).toBeDefined();
        expect(admittedSurfaces.has(surface!), `${site} emits '${name}' on the undeclared surface '${surface}'`)
          .toBe(true);
      }
    }
  });

  it("names the events still waiting for a producer, so the remainder is visible", () => {
    /*
     * `2M-METRICS-003` closes only when all six have a real producer. This is
     * the running tally, updated by the slice that ships each one — which makes
     * a forgotten producer a failing diff rather than a closeout surprise.
     *
     * `calendar_viewed`   — slice 2M.1 part 2, SHIPPED
     * `day_planned`       — slice 2M.2
     * `day_review_opened` / `day_review_action_applied` — slice 2M.3
     * `notification_consent_changed` — slice 2M.4a
     * `notification_suppressed`      — slice 2M.4b
     */
    const producers = producerSites();
    expect([...producers.keys()].sort()).toEqual(["calendar_viewed"]);
    expect(producers.get("calendar_viewed"))
      .toEqual(["src/features/product-analytics/interaction-events.tsx"]);
  });

  it("2M-METRICS-004: the shipped producer carries no date and no time", () => {
    // The one place a calendar phase would leak a behavioural fingerprint, and
    // the assertion is on the payload the producer actually builds rather than
    // on the type that describes it.
    const source = readFileSync(join(REPO, "src/features/product-analytics/interaction-events.tsx"), "utf8");
    const block = source.slice(source.indexOf('name: "calendar_viewed"'));
    const properties = /properties:\s*\{([^}]*)\}/.exec(block)?.[1] ?? "";
    /*
     * Compared as KEYS, never as substrings — which is the trap this
     * repository has already stepped in once. Phase 2K's first draft scanned a
     * property blob for `title` and fired on the enum *value*
     * `normalized_exact_title`; the first draft of this assertion scanned for
     * `at` and fired on `orientation`. A key list is the thing the requirement
     * is about, so a key list is what gets checked.
     */
    const keys = properties.split(",").map((entry) => entry.split(":")[0].trim()).filter(Boolean);
    expect(keys).toEqual(["orientation"]);
    for (const forbidden of ["date", "anchor", "anchorDate", "time", "timezone", "at", "day"]) {
      expect(keys, `the calendar producer carries a '${forbidden}' key`).not.toContain(forbidden);
    }
  });
});
