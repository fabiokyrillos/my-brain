/**
 * SH-COPY-001 for the account-state surface: both locales complete, no stored
 * enum leaking as user-facing text, and the copy never claims more than the
 * database said (the `unknown` state says "unavailable", not "suspended").
 */

import { describe, expect, it } from "vitest";
import { type AccountStateKind, getLifecycleCopy } from "./lifecycle-copy";

const locales = ["pt-BR", "en"] as const;
const states: readonly AccountStateKind[] = ["suspended", "deleting", "unknown"];

describe("lifecycle copy", () => {
  it.each(locales)("%s carries complete, non-empty copy for every state", (locale) => {
    const copy = getLifecycleCopy(locale);

    for (const state of states) {
      expect(copy.states[state].title.trim()).not.toBe("");
      expect(copy.states[state].body.trim()).not.toBe("");
      expect(copy.states[state].nextStep.trim()).not.toBe("");
    }
    expect(copy.signOut.trim()).not.toBe("");
    expect(copy.signingOut.trim()).not.toBe("");
  });

  it("never renders the stored status enum verbatim", () => {
    // The database vocabulary is lowercase machine words; prose may share a
    // human word ("suspended" is legitimate English) but the raw enum shapes
    // that only exist in the schema must not surface.
    for (const locale of locales) {
      const copy = getLifecycleCopy(locale);
      const rendered = JSON.stringify(copy);
      expect(rendered).not.toContain("account_lifecycle");
      expect(rendered).not.toContain("ACCOUNT_LIFECYCLE_NOT_ACTIVE");
    }
  });

  it("the unknown state claims unavailability, never a suspension it cannot prove", () => {
    for (const locale of locales) {
      const copy = getLifecycleCopy(locale);
      const unknown = `${copy.states.unknown.title} ${copy.states.unknown.body}`.toLowerCase();
      expect(unknown).not.toContain("suspend");
      expect(unknown).not.toContain("suspens");
    }
  });

  it("the two locales are distinct texts, not one pasted twice", () => {
    expect(getLifecycleCopy("pt-BR").states.suspended.title).not.toBe(
      getLifecycleCopy("en").states.suspended.title,
    );
  });
});
