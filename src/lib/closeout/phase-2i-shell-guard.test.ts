/**
 * `2I-SHELL-001` … `2I-SHELL-006` — the navigation convergence slice.
 *
 * ## Most of this slice asserts rather than builds, and that is the finding
 *
 * The parent PRD describes a navigation redesign. The Phase 2I audit found the
 * structure already delivered — and then **the audit itself was wrong once
 * more**, in the same direction: it called `Mais` "an undifferentiated list of
 * twelve". It is not. `moreNavigationGroups` derives its groups from
 * `capability.group` and `navigation-links.tsx` renders each one with a visible
 * label and `role="group"`, on **both** breakpoints. That shipped before this
 * phase began.
 *
 * So this slice owns **one label** (`home` → Hoje/Today) and a set of
 * regression assertions. The assertions are the deliverable: a phase that
 * rebuilt delivered navigation would spend its budget proving nothing, and a
 * phase that leaves it unguarded invites the next slice to break it.
 *
 * Requirements marked `baseline` in the traceability matrix are exactly these —
 * true before the phase, protected by it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  moreNavigationGroups,
  navigationCapabilities,
  primaryNavigationKeys,
} from "../../features/shell/capabilities";

const REPO = process.cwd();
const MESSAGES = readFileSync(join(REPO, "src/i18n/messages.ts"), "utf8");
const LINKS = readFileSync(join(REPO, "src/features/shell/navigation-links.tsx"), "utf8");
const GLOBALS = readFileSync(join(REPO, "src/app/globals.css"), "utf8");

describe("2I-SHELL-001: the primary destinations are the delivered baseline", () => {
  it("exposes exactly home, inbox, work and chat as primary", () => {
    // BASELINE, not built. This asserts what product-UX slice H delivered and
    // forbids a later slice from quietly changing it.
    expect([...primaryNavigationKeys].sort()).toEqual(["chat", "home", "inbox", "work"]);
  });

  it("keeps capture as a global action rather than a primary destination", () => {
    const capture = navigationCapabilities.find((item) => item.key === "capture");
    expect(capture?.visibility).toBe("global");
    expect(capture?.group).toBe("global");
  });

  it("keeps work absorbing today, tasks and waiting", () => {
    const work = navigationCapabilities.find((item) => item.key === "work");
    expect([...(work?.aliases ?? [])].sort()).toEqual(["tasks", "today", "waiting"]);
  });
});

describe("2I-SHELL-002: home is Hoje / Today, and it is the ONLY rename this phase owns", () => {
  it("renames home in both locales", () => {
    expect(MESSAGES).toMatch(/home: "Hoje"/);
    expect(MESSAGES).toMatch(/home: "Today"/);
    expect(MESSAGES).not.toMatch(/home: "Início"/);
    expect(MESSAGES).not.toMatch(/home: "Home"/);
  });

  it("leaves chat alone, because Conversar shipped before this phase", () => {
    // The earlier planning study listed this rename as pending. It was wrong,
    // and touching it now would be churn dressed as delivery.
    expect(MESSAGES).toMatch(/chat: "Conversar"/);
  });

  it("changes no route key, so no saved URL breaks", () => {
    const home = navigationCapabilities.find((item) => item.key === "home");
    expect(home?.route).toBe("");
  });
});

describe("2I-SHELL-003: Mais renders the grouping that already exists as data", () => {
  it("derives groups from capability.group rather than a second list", () => {
    // BASELINE. The audit claimed this was missing; the code disagrees, and the
    // code is authoritative.
    expect(moreNavigationGroups.length).toBeGreaterThanOrEqual(4);
    for (const group of moreNavigationGroups) {
      expect(group.items.length, `${group.key} renders no destination`).toBeGreaterThan(0);
      for (const key of group.items) {
        const capability = navigationCapabilities.find((item) => item.key === key);
        expect(capability?.group, `${key} is in ${group.key} but declares another group`).toBe(group.key);
      }
    }
  });

  it("labels every group for a screen reader, on both breakpoints", () => {
    expect(LINKS).toContain('role="group"');
    expect(LINKS).toContain("t.navGroups[group.key]");
    expect(LINKS).toContain("mobile-nav-group");
    expect(LINKS).toContain("nav-group-label");
  });

  it("carries a label for every rendered group in both locales", () => {
    for (const group of moreNavigationGroups) {
      // A group whose label is missing renders `undefined` to a screen reader.
      const occurrences = MESSAGES.split(`${group.key}: "`).length - 1;
      expect(occurrences, `navGroups.${group.key} is not defined in both locales`).toBeGreaterThanOrEqual(2);
    }
  });

  it("groups the six context domains together, which is what Library will render", () => {
    const context = moreNavigationGroups.find((group) => group.key === "context");
    expect([...(context?.items ?? [])].sort()).toEqual(
      ["contexts", "files", "memories", "organizations", "people", "projects"].sort(),
    );
  });
});

describe("2I-SHELL-004: every existing route stays reachable", () => {
  it("gives every non-global capability a route or an explicit empty home route", () => {
    for (const capability of navigationCapabilities) {
      expect(typeof capability.route, `${capability.key} has no route`).toBe("string");
    }
  });

  it("declares no duplicate route", () => {
    // Two keys on one route is how a destination silently disappears.
    const routes = navigationCapabilities.map((item) => item.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("keeps every destination visible somewhere", () => {
    // primary, more, global or context-only — but never nowhere.
    for (const capability of navigationCapabilities) {
      expect(
        ["primary", "more", "global", "context-only"],
        `${capability.key} has visibility ${capability.visibility}`,
      ).toContain(capability.visibility);
    }
  });
});

describe("2I-SHELL-006: the mobile shell honours the device", () => {
  it("reserves the bottom bar's height including the device inset", () => {
    expect(GLOBALS).toContain("--page-bottom");
    expect(GLOBALS).toContain("env(safe-area-inset-bottom");
  });

  it("keeps a visible focus ring on every interactive element", () => {
    expect(GLOBALS).toContain("focus-visible");
  });
});
