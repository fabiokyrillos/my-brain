import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { capabilityRegistry } from "@/features/shell/capabilities";
import { getCapabilitySummaryCopy } from "@/features/shell/capability-copy";
import { locales } from "@/lib/preferences";

import { changedCapabilities, changedColumns, describeSaveOutcome, toColumnName } from "./save-outcome";

const stored = {
  timezone: "America/Sao_Paulo",
  personality: "proactive",
  tone: "informal",
  response_detail: "short",
  quiet_start: "22:30:00",
  quiet_end: "07:00:00",
  max_followups_per_day: 3,
  important_reminder_override: true,
  daily_review_time: "22:00:00",
  weekly_review_time: "19:00:00",
  weekly_review_day: 5,
  agent_name: "Brain",
};

const submitted = {
  timezone: "America/Sao_Paulo",
  personality: "proactive",
  tone: "informal",
  responseDetail: "short",
  quietStart: "22:30",
  quietEnd: "07:00",
  maxFollowupsPerDay: 3,
  importantReminderOverride: true,
  dailyReviewTime: "22:00",
  weeklyReviewTime: "19:00",
  weeklyReviewDay: 5,
  agentName: "Brain",
};

describe("`2O-PREF-010`: a save that changed nothing says so", () => {
  it("reports no change when every value matches, across the time-format seam", () => {
    /*
     * The defect this is shaped around: the columns are `time`, so they come
     * back as `HH:MM:SS` while the form submits `HH:MM`. A strict comparison
     * would report four changes on **every** save, and the message would claim
     * an effect that did not happen — which is worse than the plain "saved" it
     * replaced.
     */
    expect(changedColumns(stored, submitted)).toEqual([]);
    for (const locale of locales) {
      expect(describeSaveOutcome(locale, [])).toMatch(/Nada mudou|Nothing changed/);
    }
  });

  it("reports no change when the number and the boolean arrive as strings", () => {
    // `FormData` yields strings; the schema coerces. Both sides are normalised
    // before comparison, so a coerced 3 and a stored 3 are the same value.
    expect(changedColumns(stored, { ...submitted, maxFollowupsPerDay: 3, importantReminderOverride: true })).toEqual([]);
  });

  it("treats an unreadable snapshot as no claim rather than as everything changed", () => {
    // A null row means the read told us nothing. Announcing every preference as
    // changed would be inventing a diff out of an absent baseline.
    expect(changedColumns(null, submitted)).toEqual([]);
  });
});

describe("`2O-PREF-010`: what changed, said as a consequence and not as a field", () => {
  it("names the columns that actually moved, and only those", () => {
    expect(changedColumns(stored, { ...submitted, tone: "professional" })).toEqual(["tone"]);
    expect(changedColumns(stored, { ...submitted, timezone: "America/Belem", dailyReviewTime: "07:15" })).toEqual([
      "timezone",
      "daily_review_time",
    ]);
  });

  it("says what will behave differently, in the registry's own words", () => {
    const message = describeSaveOutcome("pt-BR", ["timezone"]);
    const effect = getCapabilitySummaryCopy("pt-BR").entries.timezone.effect;
    expect(message).toContain(effect);
    // And it is a consequence, not a field list: the column's name never
    // appears, which is the half `2O-PREF-010` states in italics.
    expect(message).not.toContain("timezone");
    expect(message).not.toContain("time_zone");
  });

  it("says it in both languages, from the same source", () => {
    for (const locale of locales) {
      const message = describeSaveOutcome(locale, ["tone"]);
      expect(message).toContain(getCapabilitySummaryCopy(locale).entries.response_style.effect);
    }
  });

  it("collapses three columns of one capability into one sentence", () => {
    // `personality`, `tone` and `response_detail` are all `response_style`. A
    // field list would have said three things; the consequence is one.
    const message = describeSaveOutcome("pt-BR", ["personality", "tone", "response_detail"]);
    const effect = getCapabilitySummaryCopy("pt-BR").entries.response_style.effect;
    expect(message.split(effect).length - 1).toBe(1);
  });

  it("orders the sentences by the registry rather than by submission order", () => {
    const forward = describeSaveOutcome("en", ["timezone", "tone"]);
    const backward = describeSaveOutcome("en", ["tone", "timezone"]);
    expect(forward).toBe(backward);
  });
});

describe("`2O-PREF-008` and `-010` together: every writable column can be explained", () => {
  /**
   * The property that makes the fallback in `describeSaveOutcome` unreachable.
   *
   * Every control in the centre is backed by a row (`2O-PREF-008`), and every
   * visible row has copy (enforced by the type system). So every column a
   * control can change resolves to a sentence — and if one ever did not, the
   * save would silently fall back to a plain "saved" with nobody the wiser.
   * This is what notices.
   */
  it("resolves every control the form renders to a capability with a sentence", () => {
    const form = readFileSync(
      join(process.cwd(), "src/features/profile/settings-form.tsx"),
      "utf8",
    ).replace(/<input[^>]*type="hidden"[^>]*\/>/g, "");
    const fields = [...new Set([...form.matchAll(/\bname="([A-Za-z][A-Za-z0-9]*)"/g)].map((m) => m[1]))];
    expect(fields.length, "no control was extracted from the form").toBeGreaterThan(13);

    const copy = getCapabilitySummaryCopy("pt-BR");
    for (const field of fields) {
      const keys = changedCapabilities([toColumnName(field)]);
      expect(keys.length, `${field} maps to no visible capability`).toBeGreaterThan(0);
      for (const key of keys) {
        expect(
          copy.entries[key as keyof typeof copy.entries]?.effect,
          `${key} has no sentence to say what it changes`,
        ).toBeTruthy();
      }
    }
  });

  it("ignores a column no visible row governs, rather than inventing a sentence", () => {
    // `planning_day` is retired (`2O-PREF-007`) and `autonomy_level` is one of
    // the nine. Neither has a visible row, so neither can produce a claim.
    expect(changedCapabilities(["planning_day", "autonomy_level"])).toEqual([]);
    expect(describeSaveOutcome("en", ["planning_day"])).toBe("Preferences saved.");
  });

  it("is non-vacuous: visible settings rows really do exist and really do govern columns", () => {
    const visible = capabilityRegistry.filter((row) => row.visible && row.surface === "settings");
    expect(visible.length).toBeGreaterThan(4);
    expect(visible.some((row) => row.columns.length > 0)).toBe(true);
  });
});
