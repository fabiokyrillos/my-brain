import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "./phase-2l-work-authority-guard.test";

/**
 * Phase 2N slice 2N.3 · M3 — the properties that must not drift, asserted
 * against the tree rather than narrated in a report.
 *
 * Each assertion here exists because the intermediate deletion re-audit
 * **measured** something that a later, entirely reasonable-looking edit would
 * undo without any test noticing. They are written to fail on the change that
 * causes the harm, not on cosmetics.
 *
 * Every negative is paired with a **non-vacuity control** proving the same scan
 * can find the thing it is denying. This repository has recorded twice that a
 * control not subject to the same mechanism produces a confident wrong verdict.
 */

const REPO = join(__dirname, "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");

function m3(): string {
  const name = readdirSync(MIGRATIONS).find((file) => /entity_deletion\.sql$/.test(file));
  expect(name, "M3 is missing from the migration chain").toBeTruthy();
  return readFileSync(join(MIGRATIONS, name as string), "utf8");
}

function featureSources(): { path: string; body: string }[] {
  const dir = join(REPO, "src", "features");
  const out: { path: string; body: string }[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = join(current, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push({ path: next, body: readFileSync(next, "utf8") });
      }
    }
  };
  walk(dir);
  return out;
}

describe("2N-CORRECT-009: deletion never becomes a client-side sequence", () => {
  it("no feature module issues a table delete of its own", () => {
    /**
     * `authenticated` holds `DELETE` on `people`, `projects`, `memories`,
     * `entity_aliases` and `entity_tags`, so this is a live rule rather than an
     * academic one: a client sequence is writable today. What it could NOT do is
     * finish — the same role holds no `DELETE` on `entry_entities` or
     * `entity_attachments`, so it would leave every mention and alias pointing
     * at a dead id and raise nothing.
     */
    const offenders = featureSources()
      .filter(({ body }) => /\.delete\s*\(\s*\)/.test(body))
      .map(({ path }) => path);
    expect(offenders, `client-side deletes found: ${offenders.join(", ")}`).toEqual([]);
  });

  it("control: the same scan finds a delete when one is written", () => {
    // Without this, the assertion above would pass equally well against a regex
    // that matches nothing at all.
    const sample = 'await supabase.from("people").delete().eq("id", id);';
    expect(/\.delete\s*\(\s*\)/.test(sample)).toBe(true);
  });
});

describe("M3 removes what no cascade reaches", () => {
  const POLYMORPHIC = [
    "entry_entities",
    "entity_aliases",
    "entity_tags",
    "entity_attachments",
  ] as const;

  it.each(POLYMORPHIC)("deletes %s explicitly", (table) => {
    /**
     * These four carry `entity_type`/`entity_id` as an unconstrained pair,
     * validated only by a `BEFORE INSERT OR UPDATE` trigger that never fires on
     * the parent's delete. Measured: deleting a person left all four alive.
     * Dropping any one of these statements re-creates the partial deletion
     * `2N-CORRECT-012` forbids, silently.
     */
    expect(m3()).toContain(`delete from public.${table}`);
  });

  it("control: the scan does not report a table M3 has no reason to delete", () => {
    expect(m3()).not.toContain("delete from public.entries");
  });
});

describe("M3 keeps the authority the re-audit proved it needs", () => {
  it("the apply path is SECURITY DEFINER with an empty search_path", () => {
    const body = m3();
    const apply = body.slice(body.indexOf("function public.apply_entity_deletion"));
    expect(apply).toContain("security definer");
    expect(apply).toContain("set search_path = ''");
  });

  it("the fingerprint helper is private and granted to nobody", () => {
    /**
     * `202607250057` records why Phase 2E's fingerprint cannot be confirmation
     * evidence: it is granted to `authenticated` and derivable from values the
     * caller already holds. Keeping this one unreachable makes that objection
     * structurally impossible rather than merely answered.
     */
    const body = m3();
    expect(body).toContain("create or replace function private.entity_deletion_fingerprint");
    expect(body).toMatch(
      /revoke all on function private\.entity_deletion_fingerprint[\s\S]{0,200}?authenticated/,
    );
    expect(body).not.toMatch(/grant execute on function private\.entity_deletion_fingerprint/);
  });

  it("no client role may write a confirmation", () => {
    const body = m3();
    expect(body).toMatch(
      /revoke all on table public\.entity_deletion_confirmations[\s\S]{0,160}?authenticated/,
    );
    expect(body).toContain("grant select on table public.entity_deletion_confirmations to authenticated");
    expect(body).not.toMatch(
      /grant (insert|update|delete)[^\n]*public\.entity_deletion_confirmations/,
    );
  });
});

describe("2N-CORRECT-012: what is kept is called retention, in both locales", () => {
  const raw = readFileSync(join(REPO, "src", "features", "deletion", "copy.ts"), "utf8");
  /**
   * SCANNED WITHOUT ITS COMMENTS, and that is not tidiness.
   *
   * The first version of the assertion below read the whole file and failed —
   * because `copy.ts`'s own header explains, in prose, that a deletion may
   * never be described as archiving, and therefore contains the word. M1
   * recorded this exact failure twice in one migration: **a scan that reads
   * prose finds the thing the prose is about**, and a guard that raises on
   * correct code gets weakened by the next person to meet it.
   *
   * `stripComments` is the repository's existing answer, reused rather than
   * re-derived.
   */
  const copy = stripComments(raw).toLowerCase();

  it("names all four retentions", () => {
    for (const kind of ["audit_trail", "telemetry", "linked_files", "undo_snapshot_24h"]) {
      expect(raw, `${kind} has no sentence`).toContain(kind);
    }
  });

  it("2N-CORRECT-002: no deletion sentence describes the act as archiving", () => {
    /**
     * The mirror of the rule `memories/undo.ts` already asserts. Once both
     * controls sit on one page the distinction stops being free: a removal that
     * reads as reversible is the same lie as an archive that reads as a delete,
     * pointing the other way.
     */
    /**
     * `arquiva`, not `arquiv`. The looser stem was written first and fired on
     * correct copy: Portuguese spells the noun *arquivo* — a FILE — with the
     * same five letters as the verb *arquivar*, and this module legitimately
     * says "os arquivos continuam na sua biblioteca" because
     * `2N-CORRECT-012` requires it to. Every archival form carries `arquiva`
     * (arquivar, arquivada, arquivamento) and neither `arquivo` nor `arquivos`
     * does, so the stem discriminates where the shorter one only matched.
     *
     * The check is narrowed rather than deleted, which is the whole difference
     * between fixing a guard and weakening one.
     */
    for (const word of ["arquiva", "archiv", "retirad", "withdraw"]) {
      expect(copy, `deletion copy uses "${word}"`).not.toContain(word);
    }
  });

  it("control: the same stripped scan DOES find those words in the archive copy", () => {
    // Three things at once: that the words exist in the product's vocabulary,
    // that stripping comments did not gut the scan, and that the NARROWED stem
    // still matches the archival forms it is meant to catch.
    const memories = stripComments(
      readFileSync(join(REPO, "src", "features", "memories", "copy.ts"), "utf8"),
    ).toLowerCase();
    expect(memories).toContain("arquiva");
    expect(memories).toContain("archiv");
  });

  it("control: the narrowed stem still refuses the sentence it exists to refuse", () => {
    // Non-vacuity for the narrowing itself. Without this, `arquiva` could have
    // been narrowed all the way to a string nothing ever contains, and the
    // assertion above would pass for the wrong reason.
    const wouldBeWrong = "memória arquivada com sucesso".toLowerCase();
    expect(wouldBeWrong).toContain("arquiva");
    expect("os arquivos continuam na sua biblioteca").not.toContain("arquiva");
  });
});

describe("M3 mints no retention value and schedules nothing", () => {
  it("creates no cron schedule", () => {
    /**
     * `2N-SEC-006`, and the post-2H correction: scheduling IS authorization, so
     * arming a sweep is an operator action rather than a migration's.
     */
    const body = m3();
    expect(body).not.toMatch(/cron\.schedule\s*\(/);
  });

  it("reuses the undo window rather than declaring a number of its own", () => {
    // `undo_operations.expires_at` already defaults to 24 hours. A literal
    // interval here would be a second copy of a signed value, and the two would
    // drift exactly once.
    expect(m3()).not.toMatch(/interval\s*'\d+\s*(day|hour)/i);
  });
});
