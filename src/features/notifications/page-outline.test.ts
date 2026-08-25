import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getNotificationSettingsCopy } from "./copy";

/**
 * The notifications route's shape, as a guard — retargeted by slice 2P.5 and
 * **not relaxed**.
 *
 * ## What it protected before, and why that claim retired
 *
 * The page mounted `NotificationSettings` — whose first child was
 * `<h2>Notificações no aparelho</h2>` — **above** its own `<h1>Notificações</h1>`,
 * so the document opened at level two and the word appeared twice. This file
 * asserted the `<h1>` came first.
 *
 * `2P-SETTINGS-008` moved that component to Settings → Notificações entirely,
 * so the ordering claim no longer has two things to order. Asserting it would
 * be asserting nothing.
 *
 * ## What it protects now
 *
 * The **absence**, plus everything the move could plausibly have taken with it.
 * An absence assertion is the dangerous kind — it passes on a file that never
 * loaded, on a renamed component, on a page reduced to nothing — so every one
 * below is paired with a positive control that fails if the page stopped being
 * the page.
 *
 * ## Why this reads source rather than rendering
 *
 * The page is an async Server Component that authenticates, reads `profiles`,
 * queries `notifications` and paginates. Rendering it in jsdom would mean
 * mocking four modules to assert two `<` positions, and the mocks would be the
 * thing under test. The repository already takes this posture for page-level
 * composition claims — `account-centre.test.tsx` asserts the same file mounts
 * `AccountDataStrip` by reading it.
 */

const PAGE = join(__dirname, "..", "..", "app", "[locale]", "app", "notifications", "page.tsx");
const source = readFileSync(PAGE, "utf8");

/**
 * The rendered code, with comments removed.
 *
 * **A guard must forbid the act, not the word**, and the first cut of this file
 * forbade the word. It failed on the page's own docstring — the sentence
 * explaining that `NotificationSettings` moved to Settings — which is the third
 * time this repository has recorded that exact shape. Weakening the pattern or
 * deleting the sentence would each have traded a real property for a passing
 * test; stripping comments keeps both.
 *
 * `{/* … *\/}` JSX comment blocks go too: this page keeps its reasoning inside
 * the tree, so a block comment there is prose in exactly the same way.
 */
const code = source
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the guard has a page to read", () => {
  /**
   * The non-vacuity control for every absence assertion below.
   *
   * A missing, emptied or renamed file would satisfy "does not contain
   * `<NotificationSettings`" for free. These are the markers that prove the
   * file under inspection is still the notifications route.
   */
  it("is reading the notifications route and not an empty string", () => {
    expect(source.length).toBeGreaterThan(2000);
    expect(code).toContain("export default async function NotificationsPage");
    expect(code).toContain('supabase.from("notifications")');
  });

  /**
   * The comment stripper's own control.
   *
   * If it ever removed too much, every absence assertion below would pass
   * against an empty string. So: prose that exists only in a comment is gone,
   * and code that exists only outside one survives.
   */
  it("strips prose and keeps code", () => {
    expect(source, "the page lost the docstring this control reads").toContain(
      "`NotificationSettings` — consent",
    );
    expect(code, "the stripper left the docstring behind").not.toContain(
      "`NotificationSettings` — consent",
    );
    expect(code.length).toBeGreaterThan(1500);
  });
});

describe("`2P-SETTINGS-008`: the governance controls are gone from this page", () => {
  it("no longer mounts the settings component, and no longer imports it", () => {
    expect(code, "the governance section is back on the history page").not.toContain(
      "<NotificationSettings",
    );
    // The import too, so a mount cannot reappear behind a rename or a wrapper.
    // Matched as an import specifier rather than as a bare word, because
    // `getNotificationSettingsCopy` legitimately contains the same characters
    // and the copy module is still used for the history's own strings.
    expect(code).not.toMatch(/import\s*\{[^}]*\bNotificationSettings\b[^}]*\}/);
  });

  it("mounts none of the controls it carried, directly either", () => {
    // Each of these would be a re-implementation rather than a re-mount, which
    // is the shape the requirement forbids most: two surfaces owning one
    // preference is how their semantics drift apart.
    for (const control of ["PushControls", "NotificationBounds", "NotificationFacts"]) {
      expect(code, `${control} is still rendered on the history page`).not.toContain(`<${control}`);
      expect(code, `${control} is still imported by the history page`).not.toMatch(
        new RegExp(`import\\s*\\{[^}]*\\b${control}\\b[^}]*\\}`),
      );
    }
  });

  it("does not read the consent record or the sender key any more", () => {
    // Nothing on this page needs either, and a read with no consumer is how a
    // moved control quietly grows a second home.
    expect(code).not.toContain("readPushConsent");
    expect(code).not.toContain("readVapidPublicKey");
  });
});

describe("exactly one discreet entry back to the preferences", () => {
  it("links to the settings notifications section, resolved rather than typed", () => {
    expect(code).toContain("settingsSectionHref(locale, \"notifications\")");
    expect(code).toContain("copy.preferencesLink");
  });

  it("offers it once — `at most one` is the requirement's own word", () => {
    const occurrences = code.split("preferencesLink").length - 1;
    expect(occurrences, "the preferences are linked more than once").toBe(1);
  });

  it("has copy for it in both locales, and they differ", () => {
    expect(getNotificationSettingsCopy("pt-BR").preferencesLink).toBe("Ajustar preferências de notificação");
    expect(getNotificationSettingsCopy("en").preferencesLink).toBe("Adjust notification preferences");
  });
});

describe("the history surface keeps everything that makes it one", () => {
  it("opens with its one heading, below the way back", () => {
    // `2O-PREF-002`. A reader who arrived from the bell or a deep link needs to
    // know where they are before they read what is here.
    const strip = code.indexOf("<AccountDataStrip");
    const heading = code.indexOf("<h1>");
    expect(strip).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(heading);
  });

  it("names the feed instead of leaving it as an unlabelled tail", () => {
    expect(code).toContain('className="notification-history"');
    expect(code).toContain("copy.historyHeading");
    expect(getNotificationSettingsCopy("pt-BR").historyHeading).toBe("Avisos recebidos");
    expect(getNotificationSettingsCopy("en").historyHeading).toBe("Alerts you received");
    expect(getNotificationSettingsCopy("pt-BR").historyHeading)
      .not.toBe(getNotificationSettingsCopy("en").historyHeading);
  });

  it("keeps the route's own properties, which a consolidation would have taken", () => {
    expect(code).toContain("PaginationLinks");
    expect(code).toContain("parsePage");
    expect(code).not.toContain("redirect(");
  });

  it("keeps the empty state and the destination link", () => {
    expect(code).toContain("<UniversalStateView");
    expect(code).toContain("item.action_url");
  });
});

describe("`2P-SETTINGS-008`: read and unread are words, not only a colour", () => {
  it("renders the state as a badge with its own copy", () => {
    expect(code).toContain('className="notification-status-badge"');
    expect(code).toContain("copy.unreadBadge");
    expect(code).toContain("copy.readBadge");
  });

  it("announces the unread count above the list", () => {
    expect(code).toContain("copy.unreadSummary");
    expect(code).toContain("copy.allReadSummary");
    expect(code).toMatch(/notification-unread-summary[^>]*role="status"|role="status"[^>]*notification-unread-summary/);
  });

  it("offers `mark as read` only where it changes something", () => {
    /*
     * `R-24`, and the rule survived a rewrite that could easily have dropped it.
     *
     * Slice 2S.2 replaced the single inline `item.status === "unread" ? <form …>`
     * with a shared verb list, and the first version of that list offered
     * *marcar como lido* on every row — including rows already read, which is a
     * control that cannot change anything. **This test caught it.**
     *
     * The rule now lives in `verbsForRow`, which is where both surfaces read it
     * from, and `verbs.test.ts` asserts the behaviour directly. What is checked
     * here is that the page still HANDS IT the fact it needs: a projection that
     * stopped passing the notice's status would silently restore the defect.
     */
    expect(code).toContain("projectNotificationRows");
    const projection = readFileSync(
      join(__dirname, "row-projection.ts"),
      "utf8",
    );
    expect(projection).toContain("noticeStatus: row.status");
  });

  it("names each row's controls after the row, so twenty are distinguishable", () => {
    // The destination link still carries its own name here.
    expect(code).toContain("aria-label={`${copy.openDestination}: ${item.title}`}");
    /*
     * The verb controls moved into `NotificationRowActions`, and their names are
     * built from the shared copy — `accessibleName(subject)` — rather than
     * assembled at this call site. The requirement is unchanged and the
     * assertion follows it: every verb's accessible name carries the subject,
     * proved by name in `verbs.test.ts`, and the row is handed the subject's own
     * title to put in it.
     */
    expect(code).toContain("subjectLabel=");
    const row = readFileSync(
      join(__dirname, "notification-row-actions.tsx"),
      "utf8",
    );
    expect(row).toContain("accessibleName(subjectLabel)");
  });

  it("has both locales for every one of the new strings", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = getNotificationSettingsCopy(locale);
      for (const value of [copy.unreadBadge, copy.readBadge, copy.markRead, copy.openDestination, copy.allReadSummary]) {
        expect(value.length, `${locale} is missing a string`).toBeGreaterThan(0);
      }
      expect(copy.unreadSummary(1)).not.toBe(copy.unreadSummary(2));
    }
  });
});
