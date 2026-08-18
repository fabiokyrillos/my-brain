import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getNotificationSettingsCopy } from "./copy";

/**
 * The notifications route's heading outline, as a guard.
 *
 * ## The defect this locks out
 *
 * The page mounted `NotificationSettings` — whose first child is
 * `<h2>Notificações no aparelho</h2>` — **above** its own
 * `<header class="list-header"><h1>Notificações</h1>`. Two things followed, and
 * both were reported by a reader before any test noticed:
 *
 *  1. the document opened at level two, so the outline a screen reader
 *     announces began in the middle of its own hierarchy;
 *  2. the word "Notificações" appeared twice, the second time as a display-size
 *     serif `<h1>` two-thirds of the way down, which reads as the start of a
 *     different page rather than as the name of a section.
 *
 * A component test cannot see either, because both are facts about the ORDER in
 * which the page composes two components that are each correct on their own.
 * `online-notifications-and-recovery.spec.ts` asserts the `<h1>` is present and
 * would have passed against the broken page, which is precisely why the claim
 * that needs a guard is the ordering one.
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

describe("the notifications route has one page heading, and it is first", () => {
  it("puts the `<h1>` above the governance section that opens with an `<h2>`", () => {
    const heading = source.indexOf("<h1>");
    const governance = source.indexOf("<NotificationSettings");
    expect(heading, "the page lost its <h1>").toBeGreaterThan(-1);
    expect(governance, "the page lost its governance section").toBeGreaterThan(-1);
    expect(heading).toBeLessThan(governance);
  });

  it("keeps the way back above the heading, so the orientation comes first", () => {
    // `2O-PREF-002`. A reader who arrived from the bell or a deep link needs to
    // know where they are before they read what is here.
    expect(source.indexOf("<AccountDataStrip")).toBeLessThan(source.indexOf("<h1>"));
  });

  it("names the feed instead of leaving it as an unlabelled tail", () => {
    // Moving the `<h1>` to the top left the list below with no name at all. The
    // name goes through the typed copy record, in both locales.
    expect(source).toContain('className="notification-history"');
    expect(source).toContain("notifyCopy.historyHeading");
    expect(getNotificationSettingsCopy("pt-BR").historyHeading).toBe("Avisos recebidos");
    expect(getNotificationSettingsCopy("en").historyHeading).toBe("Alerts you received");
    expect(getNotificationSettingsCopy("pt-BR").historyHeading)
      .not.toBe(getNotificationSettingsCopy("en").historyHeading);
  });

  it("keeps the governance section above the list it makes a promise about", () => {
    // `2M-NOTIFY-008`. The heading moved; this did not, and it is the one
    // ordering claim the reordering could plausibly have broken.
    expect(source.indexOf("<NotificationSettings"))
      .toBeLessThan(source.indexOf('className="notification-history"'));
  });

  it("keeps the route's own properties, which a consolidation would have taken", () => {
    // The same three checks `account-centre.test.tsx` makes, restated here
    // because this file is the one that reorders the page.
    expect(source).toContain("PaginationLinks");
    expect(source).toContain("parsePage");
    expect(source).not.toContain("redirect(");
  });
});
