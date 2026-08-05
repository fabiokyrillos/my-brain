import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QUOTAS } from "@/lib/quotas";
import { getQuotaRefusalCopy, quotaRefusalMessage } from "./copy";
import { QUOTA_DETAILS, isQuotaCeilingMissing, quotaRefusal, type QuotaDetail } from "./refusal";

/**
 * SH-QUOTA-009 and SH-COPY-004 — three refusal vocabularies, kept apart.
 *
 * The database gives lifecycle, throttle and quota refusals the same SQLSTATE
 * on purpose, so everything that tells them apart lives in the DETAIL. If this
 * module ever matched on the message instead, a prose edit in a migration would
 * turn a ceiling into an outage — silently, and only in production.
 */

const locales = ["pt-BR", "en"] as const;

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/202608050076_quota_enforcement.sql"),
  "utf8",
);

function errorWith(details: string) {
  return { message: "Daily entry quota reached", details, code: "P0001" };
}

describe("quotaRefusal: the declared detail is what classifies", () => {
  it.each(QUOTA_DETAILS)("recognises %s", (detail) => {
    expect(quotaRefusal(errorWith(detail))).toBe(detail);
  });

  it("every declared detail is one the migration actually raises", () => {
    // The other direction, and the one that catches a detail this module
    // invented. A vocabulary only the client knows is a vocabulary nobody speaks.
    for (const detail of QUOTA_DETAILS) {
      expect(MIGRATION, `${detail} must be raised somewhere`).toContain(`detail = '${detail}'`);
    }
  });

  it("every detail the migration raises is one this module knows", () => {
    const raised = [...MIGRATION.matchAll(/detail = '(QUOTA_[A-Z_]+)'/g)].map((m) => m[1]);
    expect(raised.length).toBeGreaterThan(0);
    const known = new Set<string>([...QUOTA_DETAILS, "QUOTA_CEILING_MISSING"]);
    for (const detail of raised) {
      expect(known.has(detail), `the app does not know ${detail}`).toBe(true);
    }
  });

  it("a lifecycle refusal is not a quota refusal", () => {
    expect(quotaRefusal(errorWith("ACCOUNT_LIFECYCLE_NOT_ACTIVE"))).toBeNull();
  });

  it("a throttle refusal is not a quota refusal", () => {
    expect(quotaRefusal(errorWith("AUTH_EVENT_THROTTLED"))).toBeNull();
  });

  it("a broken deployment is a fault, not a ceiling", () => {
    // Telling somebody they reached a limit that does not exist would be worse
    // than the generic failure — it is a lie with a number in it.
    const broken = errorWith("QUOTA_CEILING_MISSING");
    expect(quotaRefusal(broken)).toBeNull();
    expect(isQuotaCeilingMissing(broken)).toBe(true);
  });

  it("absent and unrelated errors classify as nothing", () => {
    expect(quotaRefusal(null)).toBeNull();
    expect(quotaRefusal(undefined)).toBeNull();
    expect(quotaRefusal({ message: "connection reset", details: "", code: "08006" })).toBeNull();
  });
});

describe("SH-COPY-004: the copy states the ceiling the database enforces", () => {
  it.each(QUOTA_DETAILS)("%s has distinct text in both locales", (detail) => {
    const pt = getQuotaRefusalCopy("pt-BR", detail);
    const en = getQuotaRefusalCopy("en", detail);
    expect(pt.title).not.toBe(en.title);
    expect(pt.body).not.toBe(en.body);
    for (const copy of [pt, en]) {
      expect(copy.title.length).toBeGreaterThan(8);
      expect(copy.body.length).toBeGreaterThan(20);
    }
  });

  it("every number on the screen comes from the constants", () => {
    // SH-QUOTA-010: no page may state a ceiling the database does not enforce.
    const expectations: Partial<Record<QuotaDetail, number>> = {
      QUOTA_ENTRIES_PER_DAY: QUOTAS.entriesPerDay,
      QUOTA_LIVE_JOBS: QUOTAS.liveJobsPerUser,
      QUOTA_STORAGE_OBJECTS: QUOTAS.storageObjectsPerUser,
      QUOTA_ATTACHMENTS_PER_DAY: QUOTAS.attachmentsPerDay,
      QUOTA_ATTACHMENTS_PER_ENTRY: QUOTAS.attachmentsPerEntry,
    };
    for (const locale of locales) {
      for (const [detail, value] of Object.entries(expectations)) {
        expect(
          getQuotaRefusalCopy(locale, detail as QuotaDetail).body,
          `${detail} in ${locale} must state ${value}`,
        ).toContain(String(value));
      }
      expect(getQuotaRefusalCopy(locale, "QUOTA_STORAGE_BYTES").body).toContain(
        String(Math.round(QUOTAS.storageBytesPerUser / (1024 * 1024))),
      );
    }
  });

  it("no refusal leaks a code, a table or a function name", () => {
    for (const locale of locales) {
      for (const detail of QUOTA_DETAILS) {
        const rendered = quotaRefusalMessage(locale, detail);
        expect(rendered).not.toContain("QUOTA_");
        expect(rendered).not.toContain("P0001");
        expect(rendered).not.toContain("quota_ceilings");
        expect(rendered).not.toContain("public.");
      }
    }
  });

  it("the entry ceiling says nothing was saved, because nothing was", () => {
    // The refusal aborts the statement, so the capture really is gone. Copy
    // that left that ambiguous would have people wondering where it went.
    expect(getQuotaRefusalCopy("pt-BR", "QUOTA_ENTRIES_PER_DAY").body).toContain("Nada do que você escreveu agora foi salvo");
    expect(getQuotaRefusalCopy("en", "QUOTA_ENTRIES_PER_DAY").body).toContain("was saved");
  });
});
