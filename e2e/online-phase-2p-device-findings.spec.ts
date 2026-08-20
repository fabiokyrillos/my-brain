import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * The owner's real-device findings of 2026-08-20, as executable assertions.
 *
 * ## Why these could not have been caught by what already existed
 *
 * `mobile-reachability-guard.test.ts` proves, from **source text**, that Hoje
 * links to Revisões and that the calendar links to Lembretes, both
 * unconditionally. Both proofs are true and both destinations were, in the
 * owner's words, impossible to find on an iPhone: Lembretes only through
 * Trabalho → Calendário → *Todos os lembretes*, and Revisões only through global
 * search.
 *
 * **A link that exists is not a link that can be found.** A source-text guard
 * cannot see how far down a page an element sits, how many navigations precede
 * it, or whether anything names it. These assertions measure the rendered page,
 * which is the only place that distinction exists.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

/** How far down a page a destination may sit and still count as discoverable. */
const DISCOVERABLE_SCREENS = 1.5;

async function createAccount() {
  const email = `codex-2p9-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: `Dev!${crypto.randomUUID()}A7`, email_confirm: true }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, id };
}

test.describe("the owner's device findings", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };

  test.beforeAll(async () => { owner = await createAccount(); });
  test.afterAll(async () => {
    if (!owner?.id) return;
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${owner.id}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(response.ok, "fixture teardown failed").toBe(true);
  });

  const signIn = (page: Page) => signInOnline(page, { email: owner.email, locale: "pt-BR" });

  /**
   * Where a destination sits, in screens from the top — counting only links a
   * person could actually see.
   *
   * **Visibility is the whole point.** The desktop rail's `Mais` disclosure and
   * the mobile chrome both carry a link to every destination, and on a phone the
   * rail is `display:none`. Counting those would let this assertion pass on
   * exactly the arrangement the owner reported: a destination that exists in the
   * DOM and cannot be found on the screen. A zero-size box is not a path.
   */
  async function depthOf(page: Page, href: string) {
    return page.evaluate((suffix) => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((a) => {
        if (!a.getAttribute("href")?.endsWith(suffix)) return false;
        const box = a.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        const style = getComputedStyle(a);
        return style.visibility !== "hidden" && style.display !== "none";
      });
      if (links.length === 0) return null;
      const tops = links.map((a) => a.getBoundingClientRect().top + window.scrollY);
      return {
        count: links.length,
        screens: Math.min(...tops) / window.innerHeight,
        label: (links[0].textContent ?? "").trim(),
      };
    }, href);
  }

  /* ------------------------------------------------------------------ *
   * Finding 2 — Lembretes must not depend on Trabalho.
   * ------------------------------------------------------------------ */

  test("Lembretes is reachable directly from Hoje, not only through Trabalho", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app");

    /*
      Wait for the row to be laid out before measuring how far down it is.

      App Router streams, and a page measured straight after `goto` can still
      have its subtree in an unclassed placeholder `<div>` with every box at
      zero width — which `depthOf` correctly discards as invisible, and then
      reports the destination as absent. It made this assertion flaky on the
      Pixel 7 lane, and it is the same trap the calendar assertions in this file
      already carry a wait for. **A flake is a defect**, and this one was mine.
    */
    await expect(page.locator(".today-destinations")).toBeVisible();

    const found = await depthOf(page, "/app/reminders");
    expect(found, "Hoje offers no link to Lembretes at all").not.toBeNull();
    expect(
      found!.screens,
      `Lembretes is ${found!.screens.toFixed(1)} screens down on Hoje — the owner found it only via Trabalho → Calendário`,
    ).toBeLessThanOrEqual(DISCOVERABLE_SCREENS);

    // And it is a real destination: following it lands on the reminders page.
    // Scoped to the row this fix added: the rail also links here and is hidden
    // on a phone, so an unscoped locator would click something invisible.
    await page.locator('.today-destinations a[href$="/app/reminders"]').click();
    await page.waitForURL("**/app/reminders");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  /* ------------------------------------------------------------------ *
   * Finding 3 — Revisões must be in the navigation, not only in search.
   * ------------------------------------------------------------------ */

  test("Revisões is reachable from Hoje without scrolling to the last section", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app");

    // Same wait, same reason as the Lembretes assertion above.
    await expect(page.locator(".today-destinations")).toBeVisible();

    const found = await depthOf(page, "/app/reviews");
    expect(found, "Hoje offers no link to Revisões at all").not.toBeNull();
    expect(
      found!.screens,
      `Revisões is ${found!.screens.toFixed(1)} screens down on Hoje — the owner found it only through global search`,
    ).toBeLessThanOrEqual(DISCOVERABLE_SCREENS);

    await page.locator('.today-destinations a[href$="/app/reviews"]').click();
    await page.waitForURL("**/app/reviews");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("the destination row names itself and keeps 44px targets", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app");

    const row = page.locator(".today-destinations");
    await expect(row).toBeVisible();
    // A landmark with a name, so a screen reader can find it and knows what it
    // is — the same standard the calendar's control band is held to.
    await expect(row.locator("xpath=ancestor-or-self::nav").first()).toHaveAttribute("aria-label", /\S/);

    const links = row.locator("a[href]");
    expect(await links.count()).toBeGreaterThanOrEqual(3);
    const small: string[] = [];
    for (let i = 0; i < (await links.count()); i += 1) {
      const box = await links.nth(i).boundingBox();
      if (box && (box.width < 44 || box.height < 44)) {
        small.push(`${await links.nth(i).innerText()} ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    }
    expect(small, `targets under 44px: ${small.join(" | ")}`).toEqual([]);
  });

  /* ------------------------------------------------------------------ *
   * Finding 1 — the calendar respects the page's own edges.
   * ------------------------------------------------------------------ */

  for (const orientation of ["day", "week", "month"] as const) {
    test(`the calendar keeps a gutter and stays inside the viewport — ${orientation}`, async ({
      page,
    }, testInfo) => {
      await signIn(page);
      /*
        `orientation`, not `o`.

        `o` is the key inside the serialized *return position* payload, and the
        page's own query parameter is `orientation` — so `?o=month` silently
        falls back to the default and renders the DAY view. Slice 2P.8's own
        mobile assertions used `?o=month` and therefore measured a day while
        their names said month; corrected here, and recorded rather than
        quietly repaired.
      */
      await page.goto(`/pt-BR/app/calendar?orientation=${orientation}`);

      /*
        Wait for the calendar to be **laid out**, not merely present.

        The first version measured straight after `goto` and reported the title
        at 0 px from the edge on `day` and `week` while `month` passed. Nothing
        was wrong with the page: the subtree was still in App Router's streaming
        placeholder — an unclassed `<div>` directly under `<body>`, outside
        `.app-frame`, with every ancestor measuring **width 0**. `month` happened
        to finish streaming first.

        `toBeVisible` is the right wait because Playwright requires a non-empty
        bounding box for it, so it cannot resolve against the zero-width copy.
        Measuring a streaming placeholder and calling it a layout defect is the
        mistake this comment exists to stop the next reader repeating.
      */
      await expect(page.locator(".calendar-page")).toBeVisible();

      // The selected orientation really is the one asked for — the assertion
      // that would have caught the parameter mistake above.
      await expect(page.locator(`.calendar-orientation a[aria-current="true"]`)).toHaveCount(1);

      const measured = await page.evaluate(() => {
        const page_ = document.querySelector(".calendar-page");
        const heading = document.querySelector(".calendar-header h1");
        const description = document.querySelector(".calendar-description");
        const left = (element: Element | null) =>
          element ? Math.round(element.getBoundingClientRect().left) : -1;
        return {
          hasContainer: Boolean(page_),
          headingLeft: left(heading),
          descriptionLeft: left(description),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          headingSize: heading ? parseFloat(getComputedStyle(heading).fontSize) : 0,
          rangeSize: (() => {
            const range = document.querySelector(".calendar-range");
            return range ? parseFloat(getComputedStyle(range).fontSize) : 0;
          })(),
        };
      });

      expect(measured.hasContainer, "the calendar has no page container").toBe(true);
      // Nothing flush against the edge. `0` is what every one of these measured
      // before the container was added.
      expect(
        measured.headingLeft,
        `the title sits ${measured.headingLeft}px from the edge on ${testInfo.project.name}`,
      ).toBeGreaterThanOrEqual(12);
      expect(measured.descriptionLeft).toBeGreaterThanOrEqual(12);
      // No sideways scroll: the grid and the controls stay inside the page.
      expect(measured.overflow, `${orientation} overflows by ${measured.overflow}px`).toBeLessThanOrEqual(1);
      // The page title outranks the range label. It used to be the other way
      // round, because `.calendar-header` had no rule at all.
      expect(
        measured.headingSize,
        `h1 ${measured.headingSize}px vs range ${measured.rangeSize}px`,
      ).toBeGreaterThan(measured.rangeSize);
    });
  }

  /* ------------------------------------------------------------------ *
   * Round two, finding 1 — the filters, arranged rather than shrunk.
   * ------------------------------------------------------------------ */

  test("the filter groups form even rows on a phone, with no chip alone on a line", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop",
      "The arrangement under test is the narrow one; desktop keeps the single-row band.",
    );
    await signIn(page);
    await page.goto("/pt-BR/app/calendar?orientation=month");
    await expect(page.locator(".calendar-page")).toBeVisible();

    /*
      What the owner reported, measured rather than described.

      As `flex-wrap` rows every group broke wherever the words ran out, so the
      last chip of each fell alone onto its own line — *Datas sugeridas* under
      four lane chips, *Próximo período* under three pager controls — and each
      chip was only as wide as its word, leaving both edges ragged. This asserts
      the two properties a grid gives and a wrap cannot: **equal widths within a
      row**, and **no row holding a single chip while an earlier row holds
      several**.
    */
    for (const group of [".calendar-orientation", ".calendar-lanes"]) {
      const rows = await page.locator(`${group} a`).evaluateAll((links) => {
        const byRow = new Map<number, number[]>();
        for (const link of links) {
          const box = link.getBoundingClientRect();
          const top = Math.round(box.top);
          byRow.set(top, [...(byRow.get(top) ?? []), Math.round(box.width)]);
        }
        return [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, widths]) => widths);
      });

      expect(rows.length, `${group} rendered no rows`).toBeGreaterThan(0);

      // Equal widths inside every row — the segmented look, and the thing a
      // content-sized chip cannot produce.
      for (const widths of rows) {
        const spread = Math.max(...widths) - Math.min(...widths);
        expect(spread, `${group} row widths differ by ${spread}px: ${widths.join(", ")}`).toBeLessThanOrEqual(2);
      }

      // No lone chip under a fuller row. The last row may hold fewer only when
      // it holds the same count as the rows above it or spans the width.
      if (rows.length > 1) {
        const last = rows[rows.length - 1];
        const previous = rows[rows.length - 2];
        if (last.length < previous.length) {
          const lastWidth = last.reduce((total, width) => total + width, 0);
          const previousWidth = previous.reduce((total, width) => total + width, 0);
          expect(
            lastWidth,
            `${group}'s last row holds ${last.length} of ${previous.length} and does not fill the width`,
          ).toBeGreaterThanOrEqual(previousWidth - 8);
        }
      }
    }

    /*
      The pager puts the period on its own line and the three controls beneath
      it, so the month name is never squeezed to ~90px and broken mid-word.

      Asserted as **two facts** rather than as a count of distinct `top` values.
      The first version counted them and got 3, which reads as "the layout is
      wrong" and was not: the three controls sit in one grid row and one of them
      wraps to two lines, so their boxes differ in height and, without stretch,
      by a pixel or two at the top. Counting rounded tops turns a sub-pixel
      difference into a failed layout. What the arrangement actually promises is
      that the label is above all three, and that the three are side by side.
    */
    const pager = await page.locator(".calendar-navigation > *").evaluateAll((nodes) => {
      const box = (selector: string) => {
        const node = nodes.find((candidate) => candidate.matches(selector));
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left };
      };
      return {
        range: box(".calendar-range"),
        prev: box('a[rel="prev"]'),
        next: box('a[rel="next"]'),
        today: box("a:not([rel])"),
      };
    });

    expect(pager.range, "the pager has no range label").not.toBeNull();
    for (const [name, control] of [["prev", pager.prev], ["today", pager.today], ["next", pager.next]] as const) {
      expect(control, `the pager has no ${name} control`).not.toBeNull();
      expect(
        control!.top,
        `${name} sits above or beside the period label instead of below it`,
      ).toBeGreaterThanOrEqual(pager.range!.bottom - 1);
    }
    // Side by side, in reading order.
    expect(pager.prev!.left, "prev is not left of today").toBeLessThan(pager.today!.left);
    expect(pager.today!.left, "today is not left of next").toBeLessThan(pager.next!.left);

    // And nothing anywhere pushed the page sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the calendar overflows by ${overflow}px`).toBeLessThanOrEqual(1);

    // Every control still comfortably pressable.
    const small = await page.locator(".calendar-toolbar a").evaluateAll((links) =>
      links
        .map((link) => ({ text: (link.textContent ?? "").trim(), box: link.getBoundingClientRect() }))
        .filter(({ box }) => box.height < 44 || box.width < 44)
        .map(({ text, box }) => `${text} ${Math.round(box.width)}×${Math.round(box.height)}`),
    );
    expect(small, `controls under 44px: ${small.join(" | ")}`).toEqual([]);
  });

  test("the control band says what its two chip families are for", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/calendar?orientation=month");

    // The owner's words were *"filtros estranhos e pouco claros"*. Both families
    // carried an `aria-label` and neither showed one, so a sighted reader saw
    // thirteen identical pills with nothing naming them.
    const labels = page.locator(".calendar-control-label");
    await expect(labels).toHaveCount(2);
    await expect(labels.first()).toHaveText("Formato");
    await expect(labels.last()).toHaveText("O que mostrar");

    // The destination left the band: a link to another page is not a control
    // that changes this one.
    await expect(page.locator(".calendar-toolbar .calendar-reminders-link")).toHaveCount(0);
    await expect(page.locator(".calendar-destinations .calendar-reminders-link")).toHaveCount(1);
  });
});
