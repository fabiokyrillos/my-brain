/**
 * `2O-NOTIFY-001`, `-002`, `-003`, `-005`, `-006` — the structural half.
 *
 * The behavioural half is `three-facts.test.ts` and the component tests. This
 * holds the claims that are about what the tree contains: that the route
 * survived, that the invitation cannot prompt, that the bounds are stated
 * where consent is given, and that no surface says a notification arrived.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCOUNT_CENTRE_DESTINATIONS,
  ACCOUNT_CENTRE_STRIP_ROUTES,
} from "../../features/account-centre/contracts";

const REPO = process.cwd();

function read(file: string): string {
  return readFileSync(join(REPO, file), "utf8");
}

function tsxUnder(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      tsxUnder(path, found);
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

const SRC_FILES = tsxUnder(join(REPO, "src")).map((path) => ({
  name: relative(REPO, path).replace(/\\/g, "/"),
  source: readFileSync(path, "utf8"),
}));

describe("2O-NOTIFY-001: the centre reaches notifications, and the route keeps everything", () => {
  it("names notifications as a destination of the preferences centre", () => {
    // Delivered by slice 2O.3 and re-asserted rather than rebuilt.
    expect([...ACCOUNT_CENTRE_DESTINATIONS]).toContain("notifications");
    expect([...ACCOUNT_CENTRE_STRIP_ROUTES]).toContain("notifications");
  });

  it("keeps the URL, the list and the deep link", () => {
    const page = read("src/app/[locale]/app/notifications/page.tsx");
    // The route is not redirected away and does not end.
    expect(page).not.toContain("redirect(");
    // Its list still renders and still paginates.
    expect(page).toContain("PaginationLinks");
    expect(page).toContain('.from("notifications")');
    expect(page).toContain("parsePage");
  });
});

describe("2O-NOTIFY-002: the invitation invites and cannot ask", () => {
  it("cannot reach the browser at all, so it cannot ask it anything", () => {
    /*
     * **The act, not the word.** An earlier version of this test restated the
     * forbidden API names as regexes so it could assert their absence — and
     * `phase-2m-push-boundary-guard.test.ts` correctly reported this file as
     * carrying four push artifacts. That guard's exemption list is exactly two
     * files and says, in its own comment, that broadening it is how a guard
     * stops guarding. It was right on both counts: the repository-wide claim
     * is already held there, over an allowlist of three application files that
     * these are not on, so restating it here bought nothing and cost the
     * boundary a false positive.
     *
     * What is asserted instead is the capability rather than the vocabulary: a
     * permission prompt requires `navigator` or `window`, and neither module
     * touches either. That is unfalsifiable by renaming an API and it names no
     * forbidden token.
     */
    for (const file of [
      "src/features/notifications/notification-invitation.tsx",
      "src/features/notifications/invitation.ts",
    ]) {
      const source = read(file);
      expect(source, `${file} reaches the browser`).not.toMatch(/\bnavigator\b/);
      expect(source, `${file} reaches the window`).not.toMatch(/\bwindow\./);
      // Non-vacuity: the files exist and have content to be clean of.
      expect(source.length).toBeGreaterThan(500);
    }

    // …and it does the thing it IS allowed to do: link to the surface that asks.
    expect(read("src/features/notifications/notification-invitation.tsx")).toContain(
      "app/notifications",
    );
  });

  it("is mounted on exactly one surface, behind the value condition", () => {
    const mounts = SRC_FILES.filter(
      (file) =>
        !file.name.startsWith("src/features/notifications/")
        && /<NotificationInvitation/.test(file.source),
    ).map((file) => file.name);

    // Exactly one, and it is the reminders page. A second mount would be a
    // second definition of "a moment of value".
    expect(mounts).toEqual(["src/app/[locale]/app/reminders/page.tsx"]);
    const page = read("src/app/[locale]/app/reminders/page.tsx");
    expect(page).toContain("shouldOfferInvitation");
    expect(page).toContain("mayInviteAtMomentOfValue");
  });
});

describe("2O-NOTIFY-003 / -005: the ask states its bounds and how to stop", () => {
  it("renders the bounds and the stop instruction on the consent surface", () => {
    const surface = read("src/features/notifications/notification-settings.tsx");
    expect(surface).toContain("<NotificationBounds");
    const facts = read("src/features/notifications/notification-facts.tsx");
    expect(facts).toContain("copy.boundsQuietHours");
    expect(facts).toContain("copy.boundsDailyCap");
    // The third bound the requirement names does not exist in this product,
    // and the surface says so rather than implying one.
    expect(facts).toContain("copy.boundsNoOverride");
    expect(facts).toContain("copy.howToStop");
  });

  it("states the absence of an override, because the mechanism has none", () => {
    /*
     * The claim, checked against the mechanism rather than against the copy.
     * `decideDelivery` refuses inside quiet hours with no exemption for type,
     * priority or urgency — so a surface promising an "important reminder
     * override" would be describing a product that does not exist.
     */
    const governance = read("src/features/notifications/governance.ts");
    expect(governance).toMatch(/isWithinQuietHours[\s\S]{0,200}?refuse\("quiet_hours"\)/);
    expect(governance).not.toMatch(/\boverride\b|\bpriority\b|\burgent\b/i);
  });

  it("states the bounds ABOVE the control, not inside the granted-only preferences", () => {
    const surface = read("src/features/notifications/notification-settings.tsx");
    const bounds = surface.indexOf("<NotificationBounds");
    const controls = surface.indexOf("<PushControls");
    expect(bounds).toBeGreaterThan(-1);
    expect(controls).toBeGreaterThan(-1);
    // A reader deciding whether to consent has to be able to read what bounds
    // the consent before deciding, which is the requirement's own reason.
    expect(bounds).toBeLessThan(controls);
  });
});

describe("2O-NOTIFY-006: no surface claims a notification arrived", () => {
  it("keeps the delivery fact a one-member union in the model", () => {
    const model = read("src/features/notifications/three-facts.ts");
    expect(model).toContain('export const deliveryFacts = ["unproven"] as const;');
    // The check that makes the one above mean something: no second member
    // sneaks in beside it.
    const declared = /deliveryFacts = \[([^\]]*)\]/.exec(model)?.[1] ?? "";
    expect(declared.split(",").filter((value) => value.trim().length > 0)).toHaveLength(1);
  });

  it("says the specific operational fact where the reader will draw the wrong conclusion", () => {
    const copy = read("src/features/notifications/copy.ts");
    // Both locales, because a reader in one is not protected by the other.
    expect(copy).toMatch(/HTTP 403[\s\S]*?Android/);
    expect((copy.match(/HTTP 403/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const facts = read("src/features/notifications/notification-facts.tsx");
    expect(facts).toContain("copy.deliveryCaveat");
  });

  it("this slice does not attempt the 403 track", () => {
    /*
     * `OD-2O-11` declined it, and the claim that none of this slice's files
     * carries a sender or a key is **held by
     * `phase-2m-push-boundary-guard.test.ts`**, whose allowlist is three
     * application files and none of these. Restating its patterns here is what
     * made this file trip it; see the note above.
     *
     * What is asserted here is the part that guard cannot see: that the four
     * modules exist, are substantial, and are the ones the acceptance record
     * names — so "no push artifact outside the allowlist" is a statement about
     * files that are actually in the tree.
     */
    const mine = [
      "src/features/notifications/three-facts.ts",
      "src/features/notifications/invitation.ts",
      "src/features/notifications/notification-facts.tsx",
      "src/features/notifications/notification-invitation.tsx",
    ];
    for (const file of mine) {
      expect(read(file).length, `${file} is missing or empty`).toBeGreaterThan(500);
    }
    // And the delivery fact stays unproven, which is the 403's only visible
    // consequence in this slice.
    expect(read("src/features/notifications/three-facts.ts")).toContain('"unproven"');
  });
});
