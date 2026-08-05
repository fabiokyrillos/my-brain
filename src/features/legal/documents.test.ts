/**
 * SH-LEGAL-002/003/013 and SH-COPY-001/006 — the drafts say what the repository
 * actually does, admit what they cannot know, and promise nothing the retention
 * schedule contradicts.
 *
 * These are content pins, and they are deliberately about *claims* rather than
 * about wording: each assertion names a fact the PRD requires the document to
 * state, so the prose can be rewritten freely and the fact cannot quietly leave.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getLegalDocument } from "./documents";
import { LEGAL_PLACEHOLDERS, renderPlaceholder } from "./placeholders";
import { hasUnenforcedWindow, RETENTION_SCHEDULE, retentionLine } from "./retention";
import { POLICY_DOCUMENTS, POLICY_VERSIONS } from "./versions";

const locales = ["pt-BR", "en"] as const;

function flatten(locale: (typeof locales)[number], kind: (typeof POLICY_DOCUMENTS)[number]) {
  const document = getLegalDocument(locale, kind);
  return document.sections.flatMap((section) => [section.heading, ...section.paragraphs]).join("\n");
}

describe("both documents, both locales, complete", () => {
  it.each(locales)("%s renders both documents with non-empty structure", (locale) => {
    for (const kind of POLICY_DOCUMENTS) {
      const document = getLegalDocument(locale, kind);
      expect(document.title.trim()).not.toBe("");
      expect(document.sections.length).toBeGreaterThan(4);
      for (const section of document.sections) {
        expect(section.heading.trim()).not.toBe("");
        expect(section.paragraphs.length).toBeGreaterThan(0);
        for (const paragraph of section.paragraphs) expect(paragraph.trim()).not.toBe("");
      }
    }
  });

  it("the two locales are distinct texts, not one pasted twice", () => {
    for (const kind of POLICY_DOCUMENTS) {
      expect(flatten("pt-BR", kind)).not.toBe(flatten("en", kind));
    }
  });

  it("each document carries the current version, from the one constant", () => {
    for (const locale of locales) {
      for (const kind of POLICY_DOCUMENTS) {
        const document = getLegalDocument(locale, kind);
        expect(document.version).toBe(POLICY_VERSIONS[kind]);
        expect(document.versionLabel).toContain(POLICY_VERSIONS[kind]);
      }
    }
  });

  it("SH-LEGAL-013: the professional-review banner is on both, in both locales", () => {
    for (const locale of locales) {
      for (const kind of POLICY_DOCUMENTS) {
        const banner = getLegalDocument(locale, kind).reviewBanner.toLowerCase();
        expect(banner).not.toBe("");
        expect(banner).toMatch(/jur[ií]dic|legal/);
      }
    }
  });
});

describe("SH-LEGAL-002/003: the placeholders are named and visibly unfilled", () => {
  it("every placeholder appears in a document, in both locales", () => {
    for (const locale of locales) {
      const all = `${flatten(locale, "terms")}\n${flatten(locale, "privacy")}`;
      for (const name of LEGAL_PLACEHOLDERS) {
        expect(all, `${name} is not stated anywhere in ${locale}`).toContain(name);
      }
    }
  });

  it("each placeholder renders as an unfilled marker, never as prose", () => {
    for (const locale of locales) {
      for (const name of LEGAL_PLACEHOLDERS) {
        const rendered = renderPlaceholder(locale, name);
        expect(rendered.startsWith("«") && rendered.endsWith("»")).toBe(true);
        expect(rendered).toContain(name);
      }
    }
  });

  it("the terms name the law and the forum; the privacy policy names the controller", () => {
    for (const locale of locales) {
      const terms = flatten(locale, "terms");
      expect(terms).toContain("GOVERNING_LAW");
      expect(terms).toContain("JURISDICTION");
      const privacy = flatten(locale, "privacy");
      expect(privacy).toContain("OPERATOR_ENTITY");
      expect(privacy).toContain("OPERATOR_CONTACT");
    }
  });
});

describe("SH-LEGAL-002: the privacy policy states repository truth", () => {
  it.each(locales)("%s names OpenAI as the external processor", (locale) => {
    expect(flatten(locale, "privacy")).toContain("OpenAI");
  });

  it.each(locales)("%s discloses the signed URL handed to the provider", (locale) => {
    expect(flatten(locale, "privacy").toLowerCase()).toMatch(/url assinada|signed url/);
  });

  it.each(locales)("%s discloses that the key is decrypted server-side per call", (locale) => {
    expect(flatten(locale, "privacy").toLowerCase()).toMatch(/decifrada no servidor|decrypted server-side/);
  });

  it.each(locales)("%s states that processing is asynchronous", (locale) => {
    expect(flatten(locale, "privacy").toLowerCase()).toMatch(/ass[ií]ncrono|asynchronous/);
  });

  it.each(locales)("%s enumerates every retention class, generated not retyped", (locale) => {
    const privacy = flatten(locale, "privacy");
    for (const entry of RETENTION_SCHEDULE) {
      expect(privacy, `${entry.id} is missing from the retention section`).toContain(
        retentionLine(locale, entry),
      );
    }
  });

  it.each(locales)("%s states what the deletion log keeps, and that it identifies nobody", (locale) => {
    const privacy = flatten(locale, "privacy").toLowerCase();
    expect(privacy).toMatch(/identificador de evento opaco|identificador aleat[óo]rio|opaque event id|random identifier/);
    expect(privacy).toMatch(/n[ãa]o h[áa] nele|n[ãa]o cont[ée]m|holds no|no user id/);
  });
});

describe("SH-LEGAL-003: the terms state the user's own provider costs", () => {
  it.each(locales)("%s says the provider bills the user, not the operator", (locale) => {
    expect(flatten(locale, "terms").toLowerCase()).toMatch(
      /faturadas na sua conta|billed to your account/,
    );
  });

  it.each(locales)("%s says the displayed amounts are estimates", (locale) => {
    expect(flatten(locale, "terms").toLowerCase()).toMatch(/estimativas|estimates/);
  });

  it.each(locales)("%s states as-is, suspension and deletion as the ways it ends", (locale) => {
    const terms = flatten(locale, "terms").toLowerCase();
    expect(terms).toMatch(/no estado em que se encontra|as is/);
    expect(terms).toMatch(/suspen/);
    expect(terms).toMatch(/exclus|delet/);
  });
});

describe("T-31: the retention copy cannot promise a sweep that does not run", () => {
  it("the honest warning is present exactly while a window is unenforced", () => {
    for (const locale of locales) {
      const privacy = flatten(locale, "privacy").toLowerCase();
      const warned = /aviso honesto|honest notice/.test(privacy);
      expect(
        warned,
        "the warning must appear if and only if some declared window has no active sweep",
      ).toBe(hasUnenforcedWindow());
    }
  });

  it("today, at least one window is genuinely unenforced -- the flag is not decorative", () => {
    // SH.6 BUILT the sweeps (202608050077) but the flags do not flip on merge.
    // They flip when the migration is applied to the shared environment, which
    // is when a sweep starts actually running — and a policy that announced
    // enforcement on the strength of a merged file would be T-31 with extra
    // steps. The assertion below is what keeps the two apart.
    expect(hasUnenforcedWindow()).toBe(true);
  });

  it("every unenforced window nonetheless has a sweep built for it", () => {
    // The distinction this pins: "not implemented" and "implemented, not yet
    // deployed" are different states, and only the second one is where SH.6
    // leaves things. If a class ever appears here with no sweep in the chain,
    // the schedule is promising something nothing was even written to do.
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/202608050077_retention_and_exposure.sql"),
      "utf8",
    );
    const built: Record<string, string> = {
      jobs: "prune_terminal_jobs",
      notifications: "prune_notifications",
      product_events: "prune_product_events",
      heartbeat_runs: "prune_heartbeat_runs",
      undo_operations: "prune_undo_operations",
      auth_event_attempts: "prune_auth_event_attempts",
      credential_validation_attempts: "prune_credential_validation_attempts",
    };
    for (const entry of RETENTION_SCHEDULE) {
      if (entry.rule.kind === "retained") continue;
      const sweep = built[entry.id];
      expect(sweep, `${entry.id} has no sweep named for it`).toBeDefined();
      expect(
        migration.includes(`create or replace function public.${sweep}()`),
        `${entry.id} declares a window with no sweep in the chain`,
      ).toBe(true);
      // And its dry-run twin, without which the window could only be measured
      // by enforcing it.
      expect(
        migration.includes(`create or replace function public.count_${sweep.replace("prune_", "prunable_")}()`),
        `${entry.id} has a sweep with no count-only twin`,
      ).toBe(true);
    }
  });
});
