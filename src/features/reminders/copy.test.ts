import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { locales } from "@/lib/preferences";

import { getReminderCopy } from "./copy";
import { REMINDER_ACTIONS, REMINDER_STATUSES, SNOOZE_PRESET_MINUTES } from "./lifecycle";
import { REMINDER_VIEWS } from "./projection";

/**
 * Every user-facing string, in both locales (UX-12, UX-21, UX-22).
 *
 * The compiler already refuses a missing key — that is what `satisfies
 * Record<Locale, …>` buys. What it cannot see is a key present in both locales
 * with the *same* string, which is how a copy module ships half-translated and
 * still typechecks. So the cases below compare the two locales against each
 * other rather than only checking each is complete.
 */

const read = (relative: string) =>
  readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("both locales are complete", () => {
  for (const locale of locales) {
    it(`covers every status, action, preset and view in ${locale}`, () => {
      const copy = getReminderCopy(locale);
      for (const status of REMINDER_STATUSES) {
        expect(copy.statusLabel[status], `${status} label`).toBeTruthy();
        expect(copy.statusHint[status], `${status} hint`).toBeTruthy();
      }
      for (const action of REMINDER_ACTIONS) {
        expect(copy.actionLabel[action], `${action} label`).toBeTruthy();
        expect(copy.success[action], `${action} success`).toBeTruthy();
      }
      for (const minutes of SNOOZE_PRESET_MINUTES) {
        expect(copy.snoozePreset[minutes], `${minutes} preset`).toBeTruthy();
      }
      for (const view of REMINDER_VIEWS) {
        expect(copy.viewLabel[view], `${view} view`).toBeTruthy();
      }
    });
  }

  it("never prints a raw database enum as a label", () => {
    // The defect UX-21 names: `{item.status}` rendered `scheduled` to a pt-BR
    // reader. A pt-BR label identical to the column value is that defect back.
    const pt = getReminderCopy("pt-BR");
    for (const status of REMINDER_STATUSES) {
      expect(pt.statusLabel[status]).not.toBe(status);
    }
  });

  it("differs between locales wherever the two languages differ", () => {
    const pt = getReminderCopy("pt-BR");
    const en = getReminderCopy("en");
    for (const status of REMINDER_STATUSES) {
      expect(pt.statusHint[status], `${status} hint is untranslated`).not.toBe(
        en.statusHint[status],
      );
    }
    for (const action of REMINDER_ACTIONS) {
      expect(pt.success[action], `${action} success is untranslated`).not.toBe(en.success[action]);
    }
    expect(pt.cancelConfirmBody).not.toBe(en.cancelConfirmBody);
  });
});

describe("the assistant is never named in a literal", () => {
  it("takes the configured name as an argument", () => {
    // Slice F1's rule: no surface hardcodes "Brain". The empty state is the one
    // string on this page that names the assistant.
    for (const locale of locales) {
      const body = getReminderCopy(locale).emptyBody("Íris");
      expect(body).toContain("Íris");
      expect(body).not.toContain("Brain");
    }
  });
});

describe("UX-22: the route carries no inline locale ternary", () => {
  it("has no `pt ?` or locale === comparison left in the page", () => {
    // The page used to hold twelve of them. The mechanism that replaced them is
    // this module, and this case is what stops the next edit reintroducing one.
    const page = read("src/app/[locale]/app/reminders/page.tsx");
    expect(page).not.toMatch(/\bpt\s*\?/);
    expect(page).not.toMatch(/locale === ["']pt-BR["']\s*\?/);
  });

  it("has none in the feature's own components either", () => {
    for (const file of [
      "src/features/reminders/reminder-list.tsx",
      "src/features/reminders/reminder-actions.tsx",
    ]) {
      expect(read(file), `${file} carries a locale ternary`).not.toMatch(
        /locale === ["']pt-BR["']\s*\?/,
      );
    }
  });
});

describe("UX-21: the page renders no column value as a label", () => {
  it("does not interpolate a status directly", () => {
    const list = read("src/features/reminders/reminder-list.tsx");
    // The lookbehind excludes `${reminder.status}` inside a template literal:
    // that form appears in a `className`, where the column value is a style
    // hook and not a word anyone reads. JSX text interpolation is the defect.
    expect(list).not.toMatch(/(?<!\$)\{\s*reminder\.status\s*\}/);
    expect(list).toContain("copy.statusLabel[reminder.status]");
  });
});

describe("the History copy and this module agree on reminder status labels", () => {
  it("uses the same words in both surfaces", () => {
    // Two maps exist on purpose — History must keep rendering already-written
    // rows if this surface rewords its badges — so the duplication is checked
    // rather than assumed. If a future slice deliberately diverges them, this
    // case is where that decision gets made explicitly.
    const history = read("src/features/history/copy.ts");
    for (const locale of locales) {
      for (const status of REMINDER_STATUSES) {
        expect(history, `History has no ${locale} label for ${status}`).toContain(
          `${status}: "${getReminderCopy(locale).statusLabel[status]}"`,
        );
      }
    }
  });
});
