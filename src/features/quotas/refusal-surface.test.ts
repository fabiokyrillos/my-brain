import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { QUOTAS } from "@/lib/quotas";
import { locales } from "@/lib/preferences";

import { getQuotaRefusalCopy, getQuotaStatusCopy } from "./copy";
import { QUOTA_DETAILS } from "./refusal";

/**
 * `2O-COST-003` — *"a refusal caused by a quota says so, names the ceiling, and
 * says when it resets"* — **re-asserted rather than rebuilt**.
 *
 * ## The re-audit finding that changed what this slice had to do
 *
 * `AUTONOMOUS_LOOP_HANDOFF.md` §81 recorded that `src/features/quotas/refusal.ts`
 * *"has no consumer"* and that `2O-COST-003` must therefore **wire it**. Checked
 * against `main`, that is false: `quotaRefusal` is called from
 * `capture/actions.ts` and from `agent/actions.ts` in three places — the upload's
 * post-insert refusal, its job insert, and a pre-check — and every one of them
 * renders through `quotaRefusalMessage`.
 *
 * So the module has consumers, the copy already interpolates the ceiling from
 * `QUOTAS`, and the two daily ceilings already say when they reset. `2O-COST-003`
 * ships. What this slice adds is **the assertion that it keeps shipping**, plus
 * the state surface (`getQuotaStatusCopy`) keyed by the same vocabulary so the
 * before and the after cannot describe two different limits.
 *
 * Rebuilding it was the alternative, and it would have produced a second
 * refusal path for one database contract — the producer-with-no-consumer shape
 * inverted, and worse, because two consumers can disagree.
 */

const REPO = resolve(__dirname, "../../..");

function productSources(): { paths: string[]; text: string } {
  const paths: string[] = [];
  const chunks: string[] = [];
  const walk = (absolute: string, relative: string) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const nextAbsolute = join(absolute, entry.name);
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(nextAbsolute, nextRelative);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) continue;
      paths.push(nextRelative);
      chunks.push(readFileSync(nextAbsolute, "utf8"));
    }
  };
  walk(join(REPO, "src"), "src");
  return { paths, text: chunks.join("\n") };
}

const SOURCES = productSources();

describe("2O-COST-003: the refusal module has real consumers", () => {
  it("is called from product code, not only from its own test", () => {
    const callers = SOURCES.paths.filter(
      (path, index) =>
        !path.startsWith("src/features/quotas/") &&
        SOURCES.text.split("\n").length > 0 &&
        readFileSync(join(REPO, path), "utf8").includes("quotaRefusal(") &&
        index >= 0,
    );
    expect(callers.sort()).toEqual([
      "src/features/agent/actions.ts",
      "src/features/capture/actions.ts",
    ]);
  });

  it("renders through the shared message, so no caller writes its own sentence", () => {
    for (const caller of ["src/features/agent/actions.ts", "src/features/capture/actions.ts"]) {
      expect(readFileSync(join(REPO, caller), "utf8")).toContain("quotaRefusalMessage(");
    }
  });

  it("is non-vacuous: the corpus is the product", () => {
    expect(SOURCES.paths.length).toBeGreaterThan(400);
    expect(SOURCES.text).toContain("quotaRefusal(");
  });
});

describe("2O-COST-003: the refusal names its ceiling and says when it frees", () => {
  it.each(locales)("interpolates the enforced number for every ceiling, in %s", (locale) => {
    const numbers: Record<string, string> = {
      QUOTA_ENTRIES_PER_DAY: String(QUOTAS.entriesPerDay),
      QUOTA_LIVE_JOBS: String(QUOTAS.liveJobsPerUser),
      QUOTA_STORAGE_BYTES: String(Math.round(QUOTAS.storageBytesPerUser / (1024 * 1024))),
      QUOTA_STORAGE_OBJECTS: String(QUOTAS.storageObjectsPerUser),
      QUOTA_ATTACHMENTS_PER_DAY: String(QUOTAS.attachmentsPerDay),
      QUOTA_ATTACHMENTS_PER_ENTRY: String(QUOTAS.attachmentsPerEntry),
    };
    for (const detail of QUOTA_DETAILS) {
      const copy = getQuotaRefusalCopy(locale, detail);
      expect(copy.body, `${locale}/${detail} does not name its ceiling`).toContain(numbers[detail]);
      expect(copy.title.length).toBeGreaterThan(10);
    }
  });

  it.each(locales)("says when each ceiling frees, and never invents a reset it has not got, in %s", (locale) => {
    /*
     * The precise half. Two of the six are **windows** and reset at a stated
     * time; the other four are **states** and free when something is removed or
     * finishes. Saying "resets at midnight" about stored files would be an
     * invention, so the requirement's *"says when it resets"* is honoured by
     * saying what actually frees it.
     */
    const resetting = ["QUOTA_ENTRIES_PER_DAY", "QUOTA_ATTACHMENTS_PER_DAY"] as const;
    const midnight = locale === "pt-BR" ? "meia-noite" : "midnight";
    for (const detail of QUOTA_DETAILS) {
      const body = getQuotaRefusalCopy(locale, detail).body;
      expect(
        body.includes(midnight),
        `${locale}/${detail} claims a midnight reset it does not have`,
      ).toBe((resetting as readonly string[]).includes(detail));
    }

    /*
     * And the one ceiling that frees **never**, asserted separately rather than
     * folded into a rule about all six.
     *
     * `QUOTA_ATTACHMENTS_PER_ENTRY` is five attachments per record, permanently.
     * Its body is the shortest of the six because there is nothing further to
     * say — an earlier version of this test required a minimum length and
     * failed here, which was the test being wrong about the product rather than
     * the product being terse. A sentence about what frees it would have to
     * invent one.
     */
    const perEntry = getQuotaRefusalCopy(locale, "QUOTA_ATTACHMENTS_PER_ENTRY").body;
    expect(perEntry).toContain(String(QUOTAS.attachmentsPerEntry));
    for (const freeing of ["meia-noite", "midnight", "Remova", "Remove", "terminar", "finish"]) {
      expect(perEntry.includes(freeing), `it claims ${freeing} frees a per-record ceiling`).toBe(false);
    }
  });
});

describe("2O-COST-002 shares one vocabulary with the refusal", () => {
  it.each(locales)("has a status row for every refusal detail in %s", (locale) => {
    for (const detail of QUOTA_DETAILS) {
      const status = getQuotaStatusCopy(locale, detail);
      expect(status.title.length).toBeGreaterThan(3);
      expect(status.window.length).toBeGreaterThan(3);
    }
  });

  it("does not reuse the refusal's past-tense wording on a limit nobody has hit", () => {
    // "Limite diário de registros atingido" is a statement about something that
    // just happened. A row on Custos describing a ceiling with room left must
    // not claim it was reached.
    for (const locale of locales) {
      for (const detail of QUOTA_DETAILS) {
        const status = getQuotaStatusCopy(locale, detail).title;
        for (const pastTense of ["atingido", "esgotado", "cheia", "reached", "is full"]) {
          expect(status.includes(pastTense), `${locale}/${detail} says "${pastTense}"`).toBe(false);
        }
      }
    }
  });
});
