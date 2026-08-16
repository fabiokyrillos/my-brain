import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { attentionReasons, dailyCycleActions, trackedAttentionReasons } from "@/features/daily-cycle/contracts";
import { CONFLICT_KINDS, detectMemoryValidityConflicts } from "@/features/daily-cycle/conflict-detection";
import { dailyCycleCopy, dailyCycleLocales } from "@/features/daily-cycle/copy";

/**
 * Slice 2N.4's structural guards.
 *
 * Every one of these is a claim the slice made in prose and would otherwise be
 * unenforced. Each has a **mutation control** in `describe("mutation controls")`
 * at the bottom: the scan is run against a deliberately broken input and asserted
 * to fail, so a guard that could no longer detect its own subject is itself a
 * failure. A control that cannot fail is not a control — the lesson M1 and M3
 * both paid for.
 *
 * Comments are stripped before every content scan. Twice in this phase a guard
 * read the prose *explaining* the thing it forbids and raised on correct code.
 */

const REPO = process.cwd();

const CONFLICT_SOURCES = [
  "src/features/daily-cycle/conflict-detection.ts",
  "src/features/daily-cycle/conflict-projection.ts",
  "src/features/daily-cycle/conflict-attention-item.tsx",
];

const ENUMERATION_DOC = "docs/reports/phase-2n/PHASE_2N_SLICE_4_CONFLICT_ENUMERATION.md";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("--") && !line.trim().startsWith("*"))
    .join("\n");
}

function read(file: string): string {
  return readFileSync(join(REPO, file), "utf8");
}

function code(file: string): string {
  return stripComments(read(file));
}

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, directory))) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const relative = `${directory}/${entry}`;
    if (statSync(join(REPO, relative)).isDirectory()) walk(relative, found);
    else if (/\.(ts|tsx)$/.test(entry)) found.push(relative);
  }
  return found;
}

const ALL_SOURCES = walk("src").filter((file) => !file.includes(".test."));

/* ------------------------------------------------------------------ */
/* The enumeration is closed                                           */
/* ------------------------------------------------------------------ */

describe("2N-CONFLICT-001: the enumeration is closed", () => {
  it("declares exactly one implementable conflict kind", () => {
    expect(CONFLICT_KINDS).toEqual(["memory_validity_window"]);
  });

  /**
   * The document is the authorization. A kind that exists in code and not in the
   * enumeration is detection that nobody signed off.
   */
  it("every code kind is named in the enumeration document", () => {
    const doc = read(ENUMERATION_DOC);
    for (const kind of CONFLICT_KINDS) {
      expect(doc, `${kind} must be named in the enumeration`).toContain("memory validity window");
    }
  });

  it("names all eight candidates and classifies every one", () => {
    const doc = read(ENUMERATION_DOC);
    for (const candidate of ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]) {
      expect(doc, `${candidate} must be enumerated`).toContain(`| ${candidate} |`);
    }
    for (const classification of [
      "conflito implementável",
      "detectável, mas não conflitante",
      "ambíguo demais",
      "fora do escopo",
      "not-built-by-rule",
      "sem ação disponível",
    ]) {
      expect(doc, `${classification} must appear as a classification`).toContain(classification);
    }
  });

  it("declares the excluded candidates by name rather than leaving them implied", () => {
    const doc = read(ENUMERATION_DOC);
    expect(doc).toContain("entity_aliases");
    expect(doc).toContain("person_projects");
    expect(doc).toContain("source_entry_id");
    expect(doc).toContain("confidence");
  });
});

/* ------------------------------------------------------------------ */
/* Every conflict has a rule and an action                             */
/* ------------------------------------------------------------------ */

describe("2N-CONFLICT-005: nothing enters the queue that cannot be acted on", () => {
  it("every derived conflict carries an action", () => {
    const conflicts = detectMemoryValidityConflicts([{
      memoryId: "m1",
      content: "x",
      sensitivity: "normal",
      validFrom: "2026-09-01T00:00:00Z",
      validUntil: "2026-08-01T00:00:00Z",
    }]);
    expect(conflicts).toHaveLength(1);
    for (const conflict of conflicts) {
      expect(conflict.action.id).toBe("resolve_validity_conflict");
      expect(conflict.action.href.length).toBeGreaterThan(0);
    }
  });

  it("the action is a real member of the daily-cycle action vocabulary", () => {
    expect(dailyCycleActions).toContain("resolve_validity_conflict");
  });

  it("the action has copy in both locales", () => {
    for (const locale of dailyCycleLocales) {
      const label = dailyCycleCopy[locale].actions.resolve_validity_conflict;
      expect(label, `${locale} action label`).toBeTruthy();
      expect(label.trim().length, `${locale} action label`).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* resolve_consistency keeps its meaning                               */
/* ------------------------------------------------------------------ */

describe("resolve_consistency is not repurposed", () => {
  it("both reasons exist and are distinct", () => {
    expect(attentionReasons).toContain("resolve_consistency");
    expect(attentionReasons).toContain("resolve_validity_conflict");
  });

  /**
   * The sentence, verbatim in both locales. It is about **one entry that could
   * not be organized** — and if a later change edits it into something about two
   * disagreeing facts, this fails.
   */
  it("keeps its exact prior sentence in both locales", () => {
    expect(dailyCycleCopy["pt-BR"].attentionReasons.resolve_consistency.description)
      .toBe("Encontramos uma inconsistência e preservamos o registro para sua revisão.");
    expect(dailyCycleCopy.en.attentionReasons.resolve_consistency.description)
      .toBe("We found an inconsistency and preserved the record for your review.");
  });

  it("keeps its live producer in the entry lifecycle", () => {
    expect(code("src/features/daily-cycle/lifecycle.ts")).toContain("resolve_consistency");
    expect(code("src/features/daily-cycle/inbox-projection.ts")).toContain("resolve_consistency");
  });

  /** The conflict path must never mention it — that would be the collision. */
  it("is absent from every conflict source file", () => {
    for (const file of CONFLICT_SOURCES) {
      expect(code(file), `${file} must not mention resolve_consistency`).not.toContain("resolve_consistency");
    }
  });

  it("the two reasons carry different copy in both locales", () => {
    for (const locale of dailyCycleLocales) {
      const reasons = dailyCycleCopy[locale].attentionReasons;
      expect(reasons.resolve_consistency.title).not.toBe(reasons.resolve_validity_conflict.title);
      expect(reasons.resolve_consistency.description).not.toBe(reasons.resolve_validity_conflict.description);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The new reason has a producer and a consumer                        */
/* ------------------------------------------------------------------ */

describe("the new reason is neither a producer without a consumer nor the reverse", () => {
  it("has a producer", () => {
    expect(code("src/features/daily-cycle/conflict-projection.ts")).toContain("resolve_validity_conflict");
  });

  it("has a consumer that renders it", () => {
    expect(code("src/features/daily-cycle/conflict-attention-item.tsx")).toContain("item.reason");
  });

  it("is reached by the two surfaces that own the queue", () => {
    expect(code("src/app/[locale]/app/inbox/page.tsx")).toContain("loadMemoryConflicts");
    expect(code("src/features/shell/home-dashboard.tsx")).toContain("loadMemoryConflicts");
  });

  it("has copy in both locales, with an empty-state and a resolved-state path", () => {
    for (const locale of dailyCycleLocales) {
      const reason = dailyCycleCopy[locale].attentionReasons.resolve_validity_conflict;
      expect(reason.title.trim().length, `${locale} title`).toBeGreaterThan(0);
      expect(reason.description.trim().length, `${locale} description`).toBeGreaterThan(0);
    }
  });

  /**
   * `needs_attention_item_opened` validates its reason against a five-member enum
   * inside Postgres. 2N.4 spends no migration, so the tracked list must still be
   * exactly those five and the new reason must not be among them.
   */
  it("is NOT in the database-validated tracked subset", () => {
    expect(trackedAttentionReasons).toHaveLength(5);
    expect(trackedAttentionReasons as readonly string[]).not.toContain("resolve_validity_conflict");
  });

  it("fires no analytics event from the conflict row", () => {
    const row = code("src/features/daily-cycle/conflict-attention-item.tsx");
    expect(row).not.toContain("recordNeedsAttentionItemOpened");
    expect(row).not.toContain("product-analytics");
    expect(row).not.toContain("onClick");
  });
});

/* ------------------------------------------------------------------ */
/* Zero schema, zero authority                                         */
/* ------------------------------------------------------------------ */

describe("2N.4 spends no migration, no RPC and no new authority", () => {
  it("creates no migration", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((file) => file.endsWith(".sql"));
    expect(migrations).toHaveLength(95);
    expect(migrations[migrations.length - 1]).toBe("202608160095_entry_person_candidate_suggestions.sql");
    for (const file of migrations) {
      expect(file, "no migration may belong to this slice").not.toContain("phase_2n_slice_4");
    }

    // Narrowed twice, and both narrowings are the same lesson: a scan for a
    // generic token finds the history of every phase that used the same word.
    // `conflict` matched `202607170021_fix_interpretation_timestamp_conflict`
    // from July; bare `slice_4` matched `202607220041_phase_2c_slice_4_…` from
    // Phase 2C. Neither is a violation, and a guard that called them one would
    // have been weakened rather than fixed. The count, the tail name and the
    // phase-qualified token are what discriminate.
  });

  it("the phase has spent exactly two of its three migrations, and M2 is unspent", () => {
    const phase2n = readdirSync(join(REPO, "supabase/migrations"))
      .filter((file) => file.includes("phase_2n_"))
      .sort();
    expect(phase2n).toEqual([
      "202608130093_phase_2n_slice_3_validity_aware_retrieval.sql",
      "202608140094_phase_2n_slice_3_entity_deletion.sql",
    ]);
  });

  it("calls no RPC from any conflict source", () => {
    for (const file of CONFLICT_SOURCES) {
      expect(code(file), `${file} must call no RPC`).not.toContain(".rpc(");
    }
  });

  it("performs no write from any conflict source", () => {
    for (const file of CONFLICT_SOURCES) {
      const source = code(file);
      for (const verb of [".insert(", ".update(", ".upsert(", ".delete("]) {
        expect(source, `${file} must not ${verb}`).not.toContain(verb);
      }
    }
  });

  it("persists no inference — the detector reaches no client at all", () => {
    const detector = code("src/features/daily-cycle/conflict-detection.ts");
    expect(detector).not.toContain("supabase");
    expect(detector).not.toContain("server-only");
    expect(detector).not.toContain("createClient");
  });

  it("reads exactly one table, and only memories", () => {
    const projection = code("src/features/daily-cycle/conflict-projection.ts");
    const tables = [...projection.matchAll(/\.from\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(tables).toEqual(["memories"]);
  });
});

/* ------------------------------------------------------------------ */
/* No semantics, no provider, no precedence, no automatic correction   */
/* ------------------------------------------------------------------ */

describe("the detector contract, enforced rather than described", () => {
  it("consults no provider and no embedding", () => {
    for (const file of CONFLICT_SOURCES) {
      const source = code(file);
      for (const token of ["@/lib/ai", "embedText", "embedding", "openAiGate", "getAIProvider"]) {
        expect(source, `${file} must not reference ${token}`).not.toContain(token);
      }
    }
  });

  it("compares no free text semantically — the detector touches content only to copy it", () => {
    const detector = code("src/features/daily-cycle/conflict-detection.ts");
    for (const token of ["similarity", "cosine", "distance", "localeCompare", "includes(", "match("]) {
      expect(detector, `detector must not use ${token}`).not.toContain(token);
    }
  });

  it("applies no implicit precedence by recency, confidence or similarity", () => {
    for (const file of CONFLICT_SOURCES) {
      const source = code(file);
      expect(source, `${file} must not read confidence`).not.toContain("confidence");
    }
    // And the projection never selects the column, so it cannot be read later.
    expect(code("src/features/daily-cycle/conflict-projection.ts")).not.toContain("confidence");
  });

  it("consults no clock, so the same row is a conflict at every instant", () => {
    const detector = code("src/features/daily-cycle/conflict-detection.ts");
    expect(detector).not.toContain("Date.now(");
    expect(detector).not.toContain("new Date(");
  });

  it("corrects nothing automatically — the only write path is the owner's own", () => {
    for (const file of CONFLICT_SOURCES) {
      const source = code(file);
      expect(source, `${file} must not call setMemoryLifecycle`).not.toContain("setMemoryLifecycle");
      expect(source, `${file} must not call updateMemory`).not.toContain("updateMemory");
      expect(source, `${file} must not be a Server Action`).not.toContain("use server");
    }
  });

  /**
   * `2N-CORRECT-002`. The refusal is structural: no product path writes
   * `valid_from`, and `setMemoryLifecycle` writes only `now()` or `null`. This
   * fails the moment a raw timestamp becomes writable, which is the only way an
   * inverted window could be re-entered through the product.
   */
  it("no product path writes memories.valid_from", () => {
    // A **write**, not a mention. `valid_from` appears legitimately as a type
    // annotation, a selected column and an object key passed to the pure
    // predicate; what must not exist is the column inside a mutation payload.
    // A scan for the bare identifier would have flagged four correct files and
    // taught the next reader to weaken it.
    const offenders = ALL_SOURCES.filter((file) => {
      const source = code(file);
      return [...source.matchAll(/\.(insert|update|upsert)\(\s*\{/g)]
        .some((match) => source.slice(match.index ?? 0, (match.index ?? 0) + 400).includes("valid_from"));
    });
    expect(offenders, "valid_from must remain read-only on memories").toEqual([]);
  });

  it("the memory update schema still refuses raw validity timestamps", () => {
    const schema = code("src/features/memories/schema.ts");
    const update = schema.slice(schema.indexOf("memoryUpdateSchema"), schema.indexOf("memoryLifecycleSchema"));
    expect(update).not.toContain("validFrom");
    expect(update).not.toContain("validUntil");
    expect(update).not.toContain("valid_from");
    expect(update).not.toContain("valid_until");
  });

  it("the lifecycle transition vocabulary is still exactly archive and restore", () => {
    expect(code("src/features/memories/schema.ts")).toContain('z.enum(["archive", "restore"])');
  });
});

/* ------------------------------------------------------------------ */
/* Mutation controls                                                   */
/* ------------------------------------------------------------------ */

describe("mutation controls: each guard fails for its own named reason", () => {
  it("the comment stripper removes prose, so a guard cannot be satisfied by a comment", () => {
    const withComment = stripComments([
      "// this file mentions resolve_consistency in a comment",
      "/* and resolve_consistency in a block */",
      " * and resolve_consistency in a jsdoc line",
      "const real = 1;",
    ].join("\n"));
    expect(withComment).not.toContain("resolve_consistency");
    expect(withComment).toContain("const real = 1;");
  });

  it("the comment stripper does NOT remove code, so the scans are not vacuous", () => {
    const kept = stripComments('const reason = "resolve_consistency";');
    expect(kept).toContain("resolve_consistency");
  });

  it("the resolve_consistency scan would catch a conflict file that mentioned it", () => {
    const mutated = stripComments('const reason = "resolve_consistency";\nexport {};');
    expect(mutated.includes("resolve_consistency")).toBe(true);
  });

  it("the RPC scan would catch an added RPC call", () => {
    expect(stripComments('await supabase.rpc("anything");').includes(".rpc(")).toBe(true);
  });

  it("the write scan would catch an added update", () => {
    expect(stripComments('await supabase.from("memories").update({});').includes(".update(")).toBe(true);
  });

  it("the confidence scan would catch a precedence read", () => {
    expect(stripComments("const winner = a.confidence > b.confidence ? a : b;").includes("confidence")).toBe(true);
  });

  it("the clock scan would catch a detector that consulted the time", () => {
    expect(stripComments("const at = Date.now();").includes("Date.now(")).toBe(true);
  });

  /**
   * Two halves, because the narrowing above could have gone too far: the scan
   * must still catch a real write, **and** must not catch the type annotation
   * and selected column that legitimately name the same identifier.
   */
  it("the valid_from writer scan would catch a raw timestamp write", () => {
    const writes = (source: string) => [...source.matchAll(/\.(insert|update|upsert)\(\s*\{/g)]
      .some((match) => source.slice(match.index ?? 0, (match.index ?? 0) + 400).includes("valid_from"));

    expect(writes(stripComments('.update({ valid_from: input, updated_at: now })'))).toBe(true);
    expect(writes(stripComments('.insert({ user_id: id, valid_from: input })'))).toBe(true);
    expect(writes(stripComments('type Row = { valid_from: string | null };'))).toBe(false);
    expect(writes(stripComments('.select("id,valid_from,valid_until")'))).toBe(false);
    expect(writes(stripComments('.update({ valid_until: null, updated_at: now })'))).toBe(false);
  });

  /**
   * Both halves again: the token must catch a fourth migration for **this**
   * phase and must not catch Phase 2C's fourth slice, which is what the first
   * version of this guard did.
   */
  it("the migration token would catch a fourth migration for this phase only", () => {
    expect("202608150095_phase_2n_slice_4_conflicts.sql").toContain("phase_2n_slice_4");
    expect("202607220041_phase_2c_slice_4_candidate_dispositions.sql").not.toContain("phase_2n_slice_4");
    expect("202607170021_fix_interpretation_timestamp_conflict.sql").not.toContain("phase_2n_slice_4");
  });

  /**
   * The detector's own control: a coherent window must not produce a conflict.
   * Without this, a detector that returned every row would satisfy every
   * assertion above about actions and copy.
   */
  it("the detector distinguishes — it does not simply return everything", () => {
    const coherent = detectMemoryValidityConflicts([{
      memoryId: "m1",
      content: "x",
      sensitivity: "normal",
      validFrom: "2026-08-01T00:00:00Z",
      validUntil: "2026-09-01T00:00:00Z",
    }]);
    expect(coherent).toEqual([]);

    const inverted = detectMemoryValidityConflicts([{
      memoryId: "m1",
      content: "x",
      sensitivity: "normal",
      validFrom: "2026-09-01T00:00:00Z",
      validUntil: "2026-08-01T00:00:00Z",
    }]);
    expect(inverted).toHaveLength(1);
  });
});
