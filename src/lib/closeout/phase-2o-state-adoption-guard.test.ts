/**
 * `2O-RECOVER-001`, `-002`, `-007` — the guard that reads the census.
 *
 * ## What it actually checks
 *
 * Not *"nobody wrote a forbidden class"* — that is satisfied by a repository
 * with no surfaces in it. It checks the pair: **every site that renders one of
 * the seven states does so through `universal-state.tsx`, or is recorded with
 * a reason**, and **the module really has the consumers the census claims**.
 *
 * ## `2O-RECOVER-007`, and why it is in a structural guard at all
 *
 * *"The guard for this family plants a fixture marker, so an absence assertion
 * cannot pass on a page that never rendered."* The rendering half of that
 * lives in the component tests. The structural half is here and is the same
 * hazard in a different costume: a scan that finds no files reports no
 * violations, and reads exactly like a clean tree. Every absence assertion
 * below is therefore preceded by a count, and the detector itself is run
 * against a **planted violating source** so that "it found nothing" is only
 * ever said by a detector that has just been shown to find something.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LEGACY_STATE_CLASSES,
  STATE_ADOPTION_CENSUS,
  STATE_ADOPTION_EXCEPTIONS,
} from "../../features/experience/state-adoption";

const REPO = process.cwd();
const SRC = join(REPO, "src");
/** The module itself defines the vocabulary; it is not a consumer of it. */
const MODULE_DIR = "src/features/experience/";

function surfaceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      surfaceFiles(path, found);
      continue;
    }
    // Components only, and not their tests: a test renders a state on purpose.
    if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) found.push(path);
  }
  return found;
}

const FILES = surfaceFiles(SRC).map((path) => ({
  name: relative(REPO, path).replace(/\\/g, "/"),
  source: readFileSync(path, "utf8"),
}));

/** Does this source render a state through the shared module? */
function rendersThroughTheModule(source: string): boolean {
  return /<UniversalStateView|<UniversalStateLine|<UniversalSkeleton/.test(source);
}

/**
 * Legacy state classes appearing in this source, whatever element carries
 * them. A class passed to the shared component as `className` is fine and is
 * filtered by the caller, not here — this function answers one question only.
 */
function legacyClassesIn(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/className="([^"]*)"/g)) {
    for (const token of match[1].split(/\s+/)) {
      if ((LEGACY_STATE_CLASSES as readonly string[]).includes(token)) found.add(token);
    }
  }
  return [...found];
}

/**
 * `quiet-state` paragraphs that say a section has nothing in it.
 *
 * The separator is what the paragraph renders, not the class: `.quiet-state`
 * is also the product's muted-note style. A paragraph naming emptiness,
 * absence or failure is a state; one carrying a content promise or a
 * provenance line is prose.
 */
const ABSENCE_WORDING = /[Ee]mpty|[Nn]othing|[Nn]one\b|[Ff]ailed|[Cc]lear\b/;

function quietStateAbsences(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/<p\s+className="quiet-state"[^>]*>([\s\S]{0,220}?)<\/p>/g)) {
    const body = match[1].replace(/\s+/g, " ").trim();
    if (ABSENCE_WORDING.test(body)) found.push(body);
  }
  return found;
}

/** Exceptions that excuse a whole file — those with no expression scope. */
const EXCEPTION_SITES = new Set(
  STATE_ADOPTION_EXCEPTIONS.filter((entry) => entry.onlyForExpression === undefined).map(
    (entry) => entry.site,
  ),
);

/** Is this one flagged paragraph excused by an expression-scoped exception? */
function isExcusedExpression(site: string, body: string): boolean {
  return STATE_ADOPTION_EXCEPTIONS.some(
    (entry) =>
      entry.site === site
      && entry.onlyForExpression !== undefined
      && body.includes(entry.onlyForExpression),
  );
}

describe("2O-RECOVER-002: the guard has a tree to read", () => {
  it("finds the product's surfaces", () => {
    // Non-vacuity for every absence assertion in this file.
    expect(FILES.length).toBeGreaterThan(150);
    const names = FILES.map((file) => file.name);
    expect(names).toContain("src/features/experience/universal-state.tsx");
    expect(names).toContain("src/app/[locale]/app/inbox/page.tsx");
  });

  it("the detector fires against a planted violation", () => {
    /*
     * `2O-RECOVER-007` in its structural form. Every assertion below reports
     * the absence of something; this proves the thing that looks for it can
     * find it. Without this, a typo in either regex turns the whole file into
     * a test that passes because it sees nothing.
     */
    const plantedLegacy = `export function X(){return <div className="empty-list"><strong>a</strong></div>;}`;
    expect(legacyClassesIn(plantedLegacy)).toEqual(["empty-list"]);
    expect(rendersThroughTheModule(plantedLegacy)).toBe(false);

    const plantedAbsence = `<p className="quiet-state">{copy.linkedTasksEmpty}</p>`;
    expect(quietStateAbsences(plantedAbsence)).toHaveLength(1);

    // …and the two negative controls, so the detector is not simply always-on.
    const plantedNote = `<p className="quiet-state">{copy.contentPromise}</p>`;
    expect(quietStateAbsences(plantedNote)).toEqual([]);
    const plantedConverted = `<UniversalStateLine description={copy.x} locale={locale} state="empty" />`;
    expect(legacyClassesIn(plantedConverted)).toEqual([]);
    expect(rendersThroughTheModule(plantedConverted)).toBe(true);
  });
});

describe("2O-RECOVER-001: a universal state is rendered through the module, or recorded", () => {
  it("no surface carries a legacy state class without the module", () => {
    const offenders = FILES.filter((file) => {
      if (file.name.startsWith(MODULE_DIR)) return false;
      if (EXCEPTION_SITES.has(file.name)) return false;
      return legacyClassesIn(file.source).length > 0 && !rendersThroughTheModule(file.source);
    }).map((file) => `${file.name} (${legacyClassesIn(file.source).join(", ")})`);

    expect(
      offenders,
      `surfaces rendering a universal state in their own words: ${offenders.join("; ")}. `
        + "2O-RECOVER-001: render it through features/experience/universal-state.tsx, "
        + "or record the site in STATE_ADOPTION_EXCEPTIONS with a reason.",
    ).toEqual([]);
  });

  it("no section absence is written as a bare muted paragraph", () => {
    const offenders = FILES.flatMap((file) => {
      if (file.name.startsWith(MODULE_DIR)) return [];
      if (EXCEPTION_SITES.has(file.name)) return [];
      const flagged = quietStateAbsences(file.source).filter(
        (body) => !isExcusedExpression(file.name, body),
      );
      return flagged.length ? [`${file.name}: ${flagged.join(" | ")}`] : [];
    });

    expect(
      offenders,
      `section absences outside the vocabulary: ${offenders.join("; ")}. `
        + "2O-RECOVER-002: use <UniversalStateLine/>, which is the same "
        + "vocabulary at section density — a muted paragraph is a typography "
        + "choice and carries no state, no tone and no data-ux-state.",
    ).toEqual([]);
  });

  it("the module really has the consumers the census claims", () => {
    /*
     * The half that cannot be satisfied by deleting surfaces. Before this
     * slice `UniversalStateView` had exactly ONE renderer in `src`, and every
     * absence assertion above was already true — which is how a contract ships
     * and governs nothing.
     */
    const consumers = FILES.filter(
      (file) => !file.name.startsWith(MODULE_DIR) && rendersThroughTheModule(file.source),
    );
    expect(consumers.length).toBeGreaterThanOrEqual(
      STATE_ADOPTION_CENSUS.minimumFilesThroughTheModule,
    );
  });
});

describe("2O-RECOVER-002: every exception is live, and says why", () => {
  it("matches the recorded count", () => {
    expect(STATE_ADOPTION_EXCEPTIONS).toHaveLength(STATE_ADOPTION_CENSUS.exceptions);
    // Non-vacuity: the per-exception loop below is trivially true of an empty
    // list, and an empty list is also what "we converted everything" looks
    // like — so the count is asserted exactly rather than as a maximum.
    expect(STATE_ADOPTION_EXCEPTIONS.length).toBeGreaterThan(0);
  });

  it("each names a file that exists and still contains its subject", () => {
    for (const entry of STATE_ADOPTION_EXCEPTIONS) {
      const file = FILES.find((candidate) => candidate.name === entry.site);
      expect(file, `${entry.site} is recorded as an exception and does not exist`).toBeDefined();
      expect(
        file!.source.includes(entry.evidence),
        `${entry.site} no longer contains "${entry.evidence}" — the exception is stale, `
          + "and a stale exception is a permission nobody is using and nobody will notice.",
      ).toBe(true);
    }
  });

  it("each carries a reason long enough to be one", () => {
    for (const entry of STATE_ADOPTION_EXCEPTIONS) {
      // A one-word reason is an exemption wearing a reason's clothes.
      expect(entry.reason.length, `${entry.site} has a token reason`).toBeGreaterThan(160);
    }
  });
});

/**
 * `2O-RECOVER-005` — an incomplete configuration is recoverable from where it
 * blocks something, in the shape `awaiting_ai_configuration` already set.
 *
 * **Re-asserted rather than rebuilt.** The four-part shape the requirement
 * names — *a named state, a count, a message and one action* — was already in
 * the tree when this slice started, and the re-audit found it. What it did not
 * have was anything holding it there: the count and the action live in two
 * different modules, and a change to either could have removed a part of the
 * shape without a single test noticing.
 */
describe("2O-RECOVER-005: the incomplete-configuration recovery keeps all four of its parts", () => {
  const panel = FILES.find(
    (file) => file.name === "src/features/byok/credential-panel.tsx",
  );

  it("has the surface to read", () => {
    // Non-vacuity: every assertion below is over this one file.
    expect(panel, "the credential panel is missing").toBeDefined();
    expect(panel!.source.length).toBeGreaterThan(1000);
  });

  it("names the state, counts it, says something, and offers exactly one way out", () => {
    const source = panel!.source;
    // The named state, and the count that makes it a quantity rather than a mood.
    expect(source).toContain("pending.count");
    expect(source).toMatch(/pending\.count > 0/);
    // The message.
    expect(source).toContain("copy.pendingEntries.description");
    // One action, and one only — a recovery offering two routes is a decision
    // handed back to the reader who is already blocked.
    expect(source).toContain("copy.pendingEntries.button");
    expect((source.match(/copy\.pendingEntries\.button/g) ?? []).length).toBe(1);
  });

  it("is gated on the configuration being complete, so it never offers a recovery that cannot run", () => {
    // The block is only recoverable once there is a key to reprocess with.
    // Offering the action before that would be a control whose only outcome is
    // the same refusal the reader is already looking at.
    expect(panel!.source).toMatch(/credential\.status === "active"[\s\S]{0,40}pending\.count > 0/);
  });
});
