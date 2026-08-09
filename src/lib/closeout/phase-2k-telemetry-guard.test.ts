/**
 * `2K-METRICS-001` … `2K-METRICS-008`, T-2K-06 — the telemetry payload's shape.
 *
 * ## The threat, stated the way the model states it
 *
 * Every event this phase wants is *about* content: which sources were shown,
 * what kind of card, why an action expired. The gravitational pull toward a
 * `query`, a `title`, or a `sourceExcerpt` field is strong **precisely because
 * it would be useful**.
 *
 * A code-review rule that says "don't log content" is a promise, and this
 * repository has proved twice that promises about telemetry fail quietly: SH.6
 * shipped a producer with no consumer and recorded nothing for weeks, and
 * `202608080087` found a third frozen vocabulary copy silently rejecting four
 * event names. So content-freeness is asserted **by shape**, at every gate.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  productEventNames,
  productSurfaces,
  type ProductEventName,
} from "@/features/product-analytics/contracts";

const REPO = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

const MIGRATION = "supabase/migrations/202608090088_phase_2k_conversation_telemetry.sql";
const CONTRACTS = "src/features/product-analytics/contracts.ts";
const WRITE_PATH = "supabase/tests/post_2j_product_event_write_path.sql";
const FUNNEL = "scripts/phase-2k-conversation-funnel.mjs";
const READER = "scripts/phase-2k-conversation-funnel-reader.mjs";

const PHASE_2K_EVENTS = [
  "conversation_answer_shown",
  "conversation_memory_resolved",
  "conversation_suggestion_shown",
] as const;

/** Keys that could hold free text. None of these may appear on any 2K event. */
const CONTENT_SHAPED = [
  "query", "question", "answer", "prompt", "transcript", "title", "name",
  "excerpt", "snippet", "content", "text", "filename", "label", "personName",
  "projectName", "summary",
];

describe("2K-METRICS-001: the vocabulary is declared once and derived everywhere", () => {
  it("declares the three events and the surface in the canonical source", () => {
    for (const name of PHASE_2K_EVENTS) {
      expect(productEventNames as readonly string[], name).toContain(name);
    }
    expect(productSurfaces as readonly string[]).toContain("conversation");
  });

  it("carries the identical three names into the migration's CHECK", () => {
    const migration = read(MIGRATION);
    const check = migration.match(/check \(event_name in \(([\s\S]*?)\n {2}\)\);/)?.[1] ?? "";
    expect(check, "CHECK block not found").not.toBe("");
    for (const name of PHASE_2K_EVENTS) {
      expect(check, `${name} missing from the CHECK`).toContain(`'${name}'`);
    }
  });

  it("carries them into the validator too — 2K-METRICS-004's two live gates", () => {
    const migration = read(MIGRATION);
    const validator = migration.slice(
      migration.indexOf("create or replace function private.validate_product_event_properties"),
    );
    for (const name of PHASE_2K_EVENTS) {
      // Once in the key whitelist, once in the value check. A name in only one
      // is a name the database would accept and then refuse, or accept
      // unchecked.
      expect(validator.split(`'${name}'`).length - 1, `${name} appears in only one case block`)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it("loses no pre-existing name to the re-declaration", () => {
    // The failure mode a `create or replace` invites: the function is rewritten
    // whole, so an arm dropped by a hand-copy would deploy clean and refuse at
    // runtime, inside a path that swallows the error.
    const migration = read(MIGRATION);
    for (const name of productEventNames as readonly ProductEventName[]) {
      expect(migration, `${name} lost from the migration`).toContain(`'${name}'`);
    }
  });
});

describe("2K-METRICS-002: no property can hold free text", () => {
  it("declares only closed enums and booleans for the three events", () => {
    const contracts = read(CONTRACTS);
    for (const name of PHASE_2K_EVENTS) {
      const start = contracts.indexOf(`  ${name}: {`);
      expect(start, `${name} property shape not found`).toBeGreaterThan(0);
      const shape = contracts.slice(start, contracts.indexOf("};", start));
      // Every declared field is either a union of string literals or a boolean.
      const fields = [...shape.matchAll(/^\s{4}(\w+):\s*(.+);$/gm)];
      expect(fields.length, `${name} declares no fields`).toBeGreaterThan(0);
      for (const [, field, type] of fields) {
        const bounded = /^boolean$/.test(type.trim())
          || /^"[^"]+"(\s*\|\s*"[^"]+")*$/.test(type.trim());
        expect(bounded, `${name}.${field} is "${type.trim()}", which is not a closed enum or a boolean`)
          .toBe(true);
      }
    }
  });

  it("names no content-shaped KEY on any Phase 2K event", () => {
    /*
     * Scanned per arm, and only over the **key whitelist**.
     *
     * The first draft sliced from the first Phase 2K arm to the end of the file
     * and fired on `capture_mode_selected`'s enum **value** `'text'` — a
     * capture modality, not a property key, belonging to a different event.
     * `2K-METRICS-002` is about what a key can hold, so the assertion has to
     * look at keys.
     */
    const migration = read(MIGRATION);
    for (const name of PHASE_2K_EVENTS) {
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

  it("fires on a planted content key, so the assertion above is not vacuous", () => {
    const planted = "when 'conversation_answer_shown' then\n      allowed_keys := array['evidence', 'question'];";
    const arm = planted.match(/when 'conversation_answer_shown' then\s*\n\s*allowed_keys := array\[([^\]]*)\]/);
    const keys = (arm?.[1] ?? "").match(/'([^']+)'/g) ?? [];
    expect(keys).toContain("'question'");
  });

  it("measures nothing: no duration, no timestamp, no count", () => {
    // `2K-METRICS-003`. A millisecond count is a behavioural fingerprint — it
    // says when somebody was at their desk and how fast they read. Phase 2K
    // needs none, so it declares none rather than bucketing one.
    const contracts = read(CONTRACTS);
    for (const name of PHASE_2K_EVENTS) {
      const shape = contracts.slice(contracts.indexOf(`  ${name}: {`), contracts.indexOf("};", contracts.indexOf(`  ${name}: {`)));
      expect(shape, `${name} carries a measurement`).not.toMatch(/durationMs|Ms\b|timestamp|At\b|Count\b/);
    }
  });
});

describe("2K-METRICS-005: the vocabulary is proved through the REAL public writer", () => {
  it("extends the existing write-path suite rather than adding a parallel one", () => {
    const writePath = read(WRITE_PATH);
    for (const name of PHASE_2K_EVENTS) {
      expect(writePath, `${name} has no legal payload in the write-path suite`)
        .toContain(`'${name}'`);
    }
    // The suite derives the vocabulary from the CHECK at test time and asserts
    // set-difference in BOTH directions, so a name added to one and not the
    // other fails rather than passing quietly.
    expect(writePath).toContain("declared_event_names");
    expect(writePath).toContain("record_product_event_for_user");
  });

  it("names the three explicitly, so a closing report can cite a line", () => {
    expect(read(WRITE_PATH))
      .toContain("all three Phase 2K conversation events are written through the real public writer");
  });

  it("keeps the historical-gate non-vacuity proof honest about its own number", () => {
    // The gate froze at `202607280061`; every name added since is one it would
    // silently refuse. Four became seven when Phase 2K added three, and the
    // assertion says seven rather than being left to fail for a correct reason.
    expect(read(WRITE_PATH)).toContain("the historical gate refuses exactly the seven events");
  });
});

describe("2K-METRICS-007: a consumer exists, and it is RLS-scoped", () => {
  it("reads the three events this phase declared", () => {
    const funnel = read(FUNNEL);
    for (const name of PHASE_2K_EVENTS) {
      expect(funnel, `the consumer does not read ${name}`).toContain(name);
    }
  });

  it("authenticates as the owner and never as service-role", () => {
    const reader = read(READER);
    expect(reader).toContain("signInWithPassword");
    expect(reader).not.toMatch(/service_role|SERVICE_ROLE|serviceRoleKey/);
  });

  it("writes nothing, because measuring must not perturb what is measured", () => {
    const reader = read(READER);
    expect(reader).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|record_product_event/);
  });

  it("distinguishes 'not deployed yet' from 'a quiet week'", () => {
    // The confusion `2K-METRICS-007` exists to prevent: a reader that printed
    // zeros against an undeployed vocabulary would look exactly like one
    // reporting a quiet period, which is how SH.6 stayed invisible.
    const reader = read(READER);
    expect(reader).toContain("process.exit(2)");
    expect(reader).toContain("does not know the Phase 2K event vocabulary yet");
    expect(reader).toContain("That is either a quiet period or a broken");
  });

  it("surfaces a value it does not recognise rather than dropping it", () => {
    // A row the database accepted but the reader does not understand means the
    // vocabulary moved and the reader did not — the silent divergence
    // `202608080087` was.
    expect(read(FUNNEL)).toContain("unrecognised");
    expect(read(FUNNEL)).toContain("The vocabulary moved and the reader did not");
  });
});

describe("2K-METRICS-003: durations are bucketed, never measured", () => {
  it("is vacuously satisfied, and says so rather than implying a bucket exists", () => {
    // Phase 2K declares no duration at all. Recorded explicitly so the closing
    // report does not claim a bucketing mechanism this phase never built.
    const contracts = read(CONTRACTS);
    for (const name of PHASE_2K_EVENTS) {
      const start = contracts.indexOf(`  ${name}: {`);
      const shape = contracts.slice(start, contracts.indexOf("};", start));
      expect(shape).not.toContain("Bucket");
      expect(shape).not.toContain("durationMs");
    }
  });
});
