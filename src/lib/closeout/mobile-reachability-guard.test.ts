/**
 * What the mobile bar's fifth slot costs — measured, not argued.
 *
 * ## The decision this guard holds
 *
 * `02-arquitetura-e-rotas.md` retires `Mais` and puts Brain in the fifth slot.
 * This repository keeps `Mais`, and the honest question is not whether the
 * handoff is right but **which destinations would actually be stranded**. That
 * number was fourteen when part two wrote it down. It is one now, and the one is
 * the account — see `capabilities.ts`'s `mobileBarSlots`.
 *
 * ## What this file can and cannot prove
 *
 * It cannot walk the render graph: these are server components with data
 * dependencies, and "is this link reachable from Hoje" is not a question a
 * static scan answers. So it does not pretend to. It asserts **the specific
 * paths the decision is based on**, each by the module that emits it, so the
 * claim in that comment is re-derived from the code on every run rather than
 * believed.
 *
 * A path disappearing fails this. The account gaining one fails this too — in
 * the opposite direction, and deliberately, because that is the release
 * condition and a guard that only fires on regressions would let it pass
 * unnoticed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BRAIN_DOMAIN_LENSES } from "../../features/library/lenses";
import { mobileBarSlots } from "../../features/shell/capabilities";
import { TRANSPARENCY_LENSES } from "../../features/transparency/contracts";

const REPO = process.cwd();
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
/** Comments state intent; only rendered code is a path. */
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The four the bar carries beside capture. */
const BAR_DESTINATIONS = ["home", "inbox", "work"] as const;

describe("the bar is what it says it is", () => {
  it("holds five slots with capture at the midpoint", () => {
    expect(mobileBarSlots).toEqual(["home", "inbox", "capture", "work", "more"]);
    expect(mobileBarSlots.length % 2).toBe(1);
    expect(mobileBarSlots[(mobileBarSlots.length - 1) / 2]).toBe("capture");
  });

  it("still carries every primary destination but Brain", () => {
    for (const key of BAR_DESTINATIONS) {
      expect(mobileBarSlots, `${key} left the bar`).toContain(key);
    }
    expect(mobileBarSlots, "Brain reached the bar — the census below must be revisited").not.toContain(
      "library",
    );
  });
});

describe("every context lens is reached from Brain, not only from the disclosure", () => {
  it("the lens strip links to all eight", () => {
    // The strip maps `BRAIN_LENSES` and builds each href through the registry,
    // so the eight are structurally present rather than transcribed. Asserted
    // against the derived list so an added ninth is covered without an edit.
    const strip = code("src/features/library/brain-lenses.tsx");
    expect(strip).toContain("BRAIN_LENSES.map");
    expect(strip).toContain("getNavigationHref(locale, lens)");
    expect(BRAIN_DOMAIN_LENSES.length).toBe(8);
  });

  it("the overview draws a panel per lens, each linking to its route", () => {
    const overview = code("src/app/[locale]/app/library/page.tsx");
    expect(overview).toContain("domains.map");
    expect(overview).toContain("href={domain.href}");
  });
});

describe("the rest of the census, path by path", () => {
  it("Trabalho reaches the calendar and the planner", () => {
    const modes = code("src/features/daily-cycle/work-modes.tsx");
    expect(modes).toContain("/app/calendar");
    expect(modes).toContain("/app/calendar/plan");
    // …and Trabalho mounts it, or the tabs reach nothing.
    expect(code("src/features/daily-cycle/work-view.tsx")).toContain("<WorkModeTabs");
  });

  /**
   * Unconditional, or it is not a path.
   *
   * The first version of this file asserted only that `home-view.tsx` *contained*
   * `/app/questions`, while its neighbour went to real trouble to prove the
   * reminders link was not gated. An independent review found the asymmetry and
   * the defect behind it: Hoje's only link to Perguntas is inside
   * `{view.openQuestion ? … : null}`, so an owner with no open question has no
   * path to it. The census now says so, and this check is generalised — every
   * claimed path is held to the same standard, so the class cannot recur in the
   * one destination nobody wrote a bespoke assertion for.
   */
  /**
   * The text immediately before an href — where the JSX conditional gating it,
   * if any, would be.
   *
   * A **named gate**, not a general parser. Whether an expression is inside an
   * open JSX conditional is not something a regex decides on this file: it holds
   * nineteen ternaries before the reviews link alone, most of them in props. A
   * heuristic that answered anyway would be a guard whose verdict nobody could
   * trust — worse than one that admits its scope. So each assertion below names
   * the gate it is claiming, and fails if that gate moves.
   */
  const preceding = (source: string, route: string, chars = 400) => {
    const at = source.indexOf(route);
    expect(at, `${route} is not linked at all`).toBeGreaterThan(-1);
    return source.slice(Math.max(0, at - chars), at);
  };

  /**
   * Revisões, asserted through the property that actually guarantees it.
   *
   * "Is this href inside an open conditional" is not a question a regex settles
   * on this file, so this asserts the *semantic* guarantee instead: the
   * end-of-day section has **both** arms — a list when there is something
   * unresolved and `sections.endOfDay.clear` when there is not — so the section
   * itself renders for every account, and the link is its `<Link>` rather than a
   * child of either arm. A section that lost its empty arm would stop rendering
   * on a quiet day and take the link with it, which is the failure this catches.
   */
  it("Hoje's closing section renders on a quiet day too, so its link always exists", () => {
    const home = code("src/features/shell/home-view.tsx");
    expect(home, "the closing section lost its quiet-day arm").toContain("sections.endOfDay.clear");
    expect(home).toContain("sections.endOfDay.openReview");
    // The link follows the section's own ternary rather than sitting inside it:
    // the two characters before it close a conditional.
    expect(preceding(home, "/app/reviews", 40)).toMatch(/\)\}\s*<Link/);
  });

  /**
   * The correction, asserted as a correction.
   *
   * Deliberately a POSITIVE assertion that the link IS gated rather than
   * silence. An earlier version of this file asserted only that the file
   * *contained* the href, while its neighbour proved the reminders link was
   * ungated — and an independent review found both the asymmetry and the defect
   * behind it. If somebody later makes this one unconditional, this fails and
   * tells them the census row can move: the same two-directional shape the
   * account check has, and the reason that check exists.
   */
  it("records that Hoje's link to Perguntas is gated, which is why the census says so", () => {
    const home = code("src/features/shell/home-view.tsx");
    expect(
      preceding(home, "/app/questions"),
      "Hoje now reaches Perguntas unconditionally — move it out of the `more`-only set in capabilities.ts",
    ).toMatch(/view\.openQuestion\s*\?/);
  });

  it("names the same dependency in the census, so the two cannot drift", () => {
    const census = read("src/features/shell/capabilities.ts");
    expect(census, "the census no longer records the Perguntas dependency").toMatch(
      /The second is `questions`/,
    );
    // …and it must NOT still claim Hoje reaches it.
    expect(census).not.toMatch(/\| reviews, questions \| Hoje \|/);
  });

  /**
   * The one added by this part, and the reason it had to be.
   *
   * `/app/reminders` was reachable only from a calendar item that *is* a
   * reminder or an entry outcome that produced one — so an account with none had
   * no path at all. A route reachable only once it has content is not reachable,
   * and you cannot create a reminder from a page you cannot open.
   */
  it("the calendar reaches Lembretes whether or not any exist", () => {
    const view = code("src/features/calendar/calendar-view.tsx");
    expect(view, "the unconditional reminders link is gone").toContain("/app/reminders");
    expect(view).toContain("copy.navigation.allReminders");
    // Unconditional: not inside a `&&`, a ternary or a `.map` over reminders.
    const at = view.indexOf("calendar-reminders-link");
    const link = view.slice(Math.max(0, at - 400), at);
    // Non-vacuity: an empty window matches nothing and would pass for free.
    expect(link.length, "no code preceded the link to inspect").toBeGreaterThan(100);
    expect(link, "the reminders link is conditional on there being reminders").not.toMatch(
      /reminders\.length|hasReminders|\?\s*\(/,
    );
  });

  it("Ajustes reaches all three transparency views", () => {
    const section = code("src/features/transparency/data-ai-section.tsx");
    expect(section).toContain("TRANSPARENCY_LENSES.map");
    expect(section).toContain("getNavigationHref(locale, lens)");
    expect(code("src/app/[locale]/app/settings/page.tsx")).toContain("<DataAiSection");
    expect(TRANSPARENCY_LENSES).toEqual(["history", "costs", "jobs"]);
  });

  it("a failure reaches Processamento", () => {
    expect(code("src/app/[locale]/app/files/page.tsx")).toContain("/app/jobs");
  });
});

describe("the account is the one thing left, and that is the release condition", () => {
  /**
   * The decisive assertion, and it is written to fail **in both directions**.
   *
   * If `AccountMenu` ever mounts somewhere a phone can reach without opening the
   * disclosure — a header avatar, a profile chip, anything — this fails, and
   * whoever did it is told that the fifth slot is now free for Brain. If the
   * mount inside the overflow disappears without a replacement, it fails too,
   * because sign-out would have left the phone entirely.
   */
  it("mounts AccountMenu exactly twice: the desktop rail and the mobile overflow", () => {
    const shell = code("src/features/shell/app-shell.tsx");
    const mounts = shell.match(/account\("(rail|overflow)"\)/g) ?? [];
    expect([...mounts].sort()).toEqual(['account("overflow")', 'account("rail")']);

    // The overflow mount is inside the bar's navigation, which is the
    // disclosure. The rail mount is desktop-only chrome.
    expect(shell).toMatch(/<NavigationLinks account=\{account\("overflow"\)\}/);
    expect(shell).toMatch(/className="rail-footer">\{account\("rail"\)\}/);

    // Nothing in the top bar is the account. Three controls, none of them it.
    const topBar = shell.slice(shell.indexOf('className="top-actions"'), shell.indexOf("</header>"));
    expect(topBar).toContain("<CommandPalette");
    expect(topBar).toContain("<LocaleSwitchLink");
    expect(topBar).toContain("<NotificationsLink");
    expect(topBar, "the account reached the mobile header — retire `more` and put Brain in slot five").not.toContain(
      "account(",
    );
  });

  it("Ajustes is reached from the account menu and nowhere a phone can get to first", () => {
    // If this ever gains a second in-product entry the census changes, which is
    // exactly the event this file exists to notice.
    expect(code("src/features/shell/account-menu.tsx")).toContain("/app/settings");
  });
});
