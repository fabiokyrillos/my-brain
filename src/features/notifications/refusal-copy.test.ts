import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ACTION_REFUSALS, refusalMessage, type ActionRefusal } from "./refusal-copy";

const REPO = resolve(__dirname, "../../..");
const LOCALES = ["pt-BR", "en"] as const;

describe("the refusal set is closed, and every member has a sentence", () => {
  it("renders a non-empty sentence for every refusal in both locales", () => {
    for (const locale of LOCALES) {
      for (const refusal of ACTION_REFUSALS) {
        expect(refusalMessage(locale, refusal).trim(), `${locale}/${refusal}`).not.toBe("");
      }
    }
  });

  it("covers every refusal the Server Action can actually return", () => {
    /*
     * The Server Action's own list, read from the source. If a refusal is added
     * there and not here, this fails by NAME — the alternative being a blank
     * space on screen, or worse, a fallback that prints whatever the database
     * said.
     */
    const actions = readFileSync(join(REPO, "src/features/notifications/actions.ts"), "utf8");
    const block = actions.slice(
      actions.indexOf("const SUPPRESSION_REFUSALS = ["),
      actions.indexOf("] as const;", actions.indexOf("const SUPPRESSION_REFUSALS = [")),
    );
    const codes = [...block.matchAll(/"(SUPPRESSION_[A-Z_]+)"/g)].map((match) => match[1]);
    expect(codes.length, "the Server Action's refusal list was not found").toBeGreaterThan(0);

    const missing = codes.filter((code) => !ACTION_REFUSALS.includes(code as ActionRefusal));
    expect(missing, "a refusal the Server Action returns has no sentence").toEqual([]);
  });

  it("says something different in each locale, so neither is the other untranslated", () => {
    for (const refusal of ACTION_REFUSALS) {
      expect(refusalMessage("pt-BR", refusal), refusal).not.toBe(refusalMessage("en", refusal));
    }
  });
});

describe("nothing from the database reaches a screen", () => {
  /*
   * The whole point of this module. A constraint name or a SQLSTATE on screen
   * tells the owner nothing they can act on, and tells a stranger something
   * about the schema. These assertions are cheap and they are the ones that
   * would catch a well-meaning "include the detail so support can debug it".
   */
  const FORBIDDEN = [
    /\b\d{5}\b/,                       // SQLSTATE, e.g. 22023, 42501, P0001-adjacent numerics
    /P0001/,
    /notification_suppressions/,
    /_check\b/,
    /_fkey\b/,
    /\bconstraint\b/i,
    /\bsqlstate\b/i,
    /\bpostgres\b/i,
    /\brpc\b/i,
  ];

  it("keeps every rendered sentence free of internals", () => {
    for (const locale of LOCALES) {
      for (const refusal of ACTION_REFUSALS) {
        const message = refusalMessage(locale, refusal);
        for (const pattern of FORBIDDEN) {
          expect(pattern.test(message), `${locale}/${refusal} leaks internals: "${message}"`).toBe(false);
        }
      }
    }
  });

  it("never renders the refusal code itself", () => {
    // The code is a lookup key on the server. It is not a sentence.
    for (const locale of LOCALES) {
      for (const refusal of ACTION_REFUSALS) {
        expect(refusalMessage(locale, refusal)).not.toContain(refusal);
        expect(refusalMessage(locale, refusal)).not.toContain("SUPPRESSION_");
      }
    }
  });
});

describe("the sentences are useful, not merely safe", () => {
  it("tells the owner what to do for each of the three scope/instant refusals", () => {
    /*
     * Slice 2S.1 built these as three SEPARATE refusals so the owner could be
     * told which of the three mistakes they made. Collapsing them into one
     * generic sentence at the last step would throw that away — so each must
     * differ from the others.
     */
    for (const locale of LOCALES) {
      const unbounded = refusalMessage(locale, "SUPPRESSION_UNBOUNDED");
      const past = refusalMessage(locale, "SUPPRESSION_PAST_DATED");
      const malformed = refusalMessage(locale, "SUPPRESSION_MALFORMED");
      expect(new Set([unbounded, past, malformed]).size, `${locale} collapses the three`).toBe(3);
    }
  });

  it("promises the notice survives a generic failure (2S-ACT-008)", () => {
    expect(refusalMessage("pt-BR", "failed")).toContain("continua aqui");
    expect(refusalMessage("en", "failed")).toContain("still here");
  });

  it("offers the reload that stale state needs, rather than leaving it to be guessed", () => {
    expect(refusalMessage("pt-BR", "stale").toLowerCase()).toContain("recarregue");
    expect(refusalMessage("en", "stale").toLowerCase()).toContain("reload");
  });
});
