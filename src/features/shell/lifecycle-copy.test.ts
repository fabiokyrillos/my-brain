/**
 * SH-COPY-001 for the account-state surface: both locales complete, no stored
 * enum leaking as user-facing text, and the copy never claims more than the
 * database said (the `unknown` state says "unavailable", not "suspended").
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AccountStateKind,
  getLifecycleCopy,
  getSuspensionReasonLabel,
  isSuspensionReasonCode,
  SUSPENSION_REASON_CODES,
} from "./lifecycle-copy";

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

/**
 * SH-COPY-002 — the reason's public label, and the pin that keeps the label set
 * and the database's CHECK from drifting.
 */
describe("suspension reasons (SH-COPY-002)", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/202608040073_account_lifecycle_admin.sql"),
    "utf8",
  );

  it("every stored suspension reason has a non-empty public label in both locales", () => {
    for (const locale of locales) {
      const copy = getLifecycleCopy(locale);
      for (const code of SUSPENSION_REASON_CODES) {
        expect(copy.suspensionReasons[code].trim(), `${locale}/${code}`).not.toBe("");
      }
      expect(Object.keys(copy.suspensionReasons).sort()).toEqual([...SUSPENSION_REASON_CODES].sort());
    }
  });

  it("the label set is exactly the suspension vocabulary the migration accepts", () => {
    // Both directions against the migration text: a code the database would
    // accept but this file does not label would render the generic fallback
    // silently, and a label for a code the database refuses is dead copy.
    const suspensionCodesInMigration = [
      ...new Set(
        [...migration.matchAll(/'(operator_suspension[a-z_]*)'/g)].map((match) => match[1]),
      ),
    ].sort();
    expect(suspensionCodesInMigration).toEqual([...SUSPENSION_REASON_CODES].sort());
  });

  it("no reason code renders raw: an unknown or absent code falls back to the generic label", () => {
    for (const locale of locales) {
      const copy = getLifecycleCopy(locale);
      expect(getSuspensionReasonLabel(locale, null)).toBe(copy.suspensionReasons.operator_suspension);
      expect(getSuspensionReasonLabel(locale, "operator_suspension_future_thing")).toBe(
        copy.suspensionReasons.operator_suspension,
      );
      for (const code of SUSPENSION_REASON_CODES) {
        expect(getSuspensionReasonLabel(locale, code)).not.toContain(code);
      }
    }
  });

  it("isSuspensionReasonCode accepts only the declared members", () => {
    for (const code of SUSPENSION_REASON_CODES) expect(isSuspensionReasonCode(code)).toBe(true);
    expect(isSuspensionReasonCode("operator_deletion_start")).toBe(false);
    expect(isSuspensionReasonCode("deletion_reverted")).toBe(false);
    expect(isSuspensionReasonCode(null)).toBe(false);
    expect(isSuspensionReasonCode(42)).toBe(false);
  });

  it("the labels say what kind of suspension it is and nothing about who decided", () => {
    for (const locale of locales) {
      const copy = getLifecycleCopy(locale);
      for (const label of Object.values(copy.suspensionReasons)) {
        expect(label.toLowerCase()).not.toContain("service_role");
        expect(label.toLowerCase()).not.toContain("operator_");
        expect(label).not.toMatch(/@/);
      }
    }
  });

  it("SH-SUSPEND-005 is stated to the user, in both locales", () => {
    for (const locale of locales) {
      expect(getLifecycleCopy(locale).suspendedReminders.trim()).not.toBe("");
    }
    expect(getLifecycleCopy("pt-BR").suspendedReminders).not.toBe(
      getLifecycleCopy("en").suspendedReminders,
    );
  });
});
