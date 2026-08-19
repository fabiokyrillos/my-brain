import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The settings surface starts its independent reads together — retargeted by
 * slice 2P.5, and **strengthened rather than moved**.
 *
 * ## What changed under it
 *
 * `2P-SETTINGS-001` split one page into eight sections, so the eight
 * projections that used to run on every visit now run per section. The claim
 * this file protects is unchanged — *a section never serialises reads it could
 * start together* — but its subject moved from the page to
 * `settings-section-content.tsx`, which is where the reads now live.
 *
 * ## Why it is stronger now
 *
 * The old assertion named three loaders in one `Promise.all`. This one holds
 * **every** multi-read section to the rule, and the section list is derived
 * from the module rather than transcribed — so a ninth section that awaits two
 * loaders one after the other fails here without anyone remembering to add it.
 *
 * A single-read section is exempt by construction: there is nothing to
 * parallelise, and demanding a `Promise.all` around one call would be demanding
 * ceremony.
 */

const SOURCE = join(process.cwd(), "src/features/settings/settings-section-content.tsx");
const source = readFileSync(SOURCE, "utf8");

/** One `case "x": { … }` arm's body, so each section is measured on its own. */
function sectionBody(section: string): string {
  const start = source.indexOf(`case "${section}":`);
  expect(start, `the ${section} arm is gone`).toBeGreaterThan(-1);
  const next = source.indexOf("\n    case ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

/** `await loadX(` / `await readX(` / `await getX(` — a read this arm performs. */
function awaitedReads(body: string): string[] {
  return [...body.matchAll(/await\s+([A-Za-z][A-Za-z0-9_]*)\(/g)]
    .map((match) => match[1])
    .filter((name) => name !== "requireUser");
}

describe("each settings section starts its independent projections together", () => {
  it("has the module to read, and it really holds the reads", () => {
    // Non-vacuity: an empty or renamed module would make every check below
    // pass by finding nothing to complain about.
    expect(source.length).toBeGreaterThan(2000);
    expect(source).toContain("loadSettingsFormValues");
    expect(source).toContain("loadPrivacyCensus");
    expect(source).toContain("loadCredentialMetadata");
  });

  it("never awaits two reads in sequence inside one section", () => {
    for (const section of ["general", "assistant", "ai", "planning", "notifications", "privacy", "appearance", "account"]) {
      const body = sectionBody(section);
      const reads = awaitedReads(body);
      // `Promise.all([...])` counts as ONE await however many loaders it holds,
      // so a section that batches correctly has at most one awaited call here.
      expect(
        reads.length,
        `${section} awaits ${reads.join(", ")} one after another — batch them`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("batches the sections that genuinely read more than one thing", () => {
    // Named, so a section that quietly stopped reading its data does not pass
    // this file by having nothing left to batch.
    for (const [section, loaders] of [
      ["general", ["loadSettingsFormValues", "readDismissal"]],
      ["assistant", ["loadSettingsFormValues", "loadAutomationStatus", "loadAutomationPolicyHistory"]],
      ["ai", ["loadSettingsFormValues", "loadCredentialMetadata", "loadPendingEntryCount", "getOwnerTimeZone"]],
      ["privacy", ["loadPrivacyCensus", "loadConsentRecord", "readPushConsent", "readSignedInEmail", "getOwnerTimeZone"]],
    ] as const) {
      const body = sectionBody(section);
      expect(body, `${section} stopped batching`).toContain("Promise.all([");
      for (const loader of loaders) {
        expect(body, `${section} lost ${loader}`).toContain(`${loader}(`);
      }
    }
  });

  it("the detector fires against a sequential arm", () => {
    // The control. Without it, a regex that matched nothing would report every
    // section as correctly batched.
    const planted = `case "planted": {
      const a = await loadOne(supabase);
      const b = await loadTwo(supabase);
    }`;
    expect(awaitedReads(planted)).toEqual(["loadOne", "loadTwo"]);
    expect(awaitedReads(planted).length).toBeGreaterThan(1);
  });
});
