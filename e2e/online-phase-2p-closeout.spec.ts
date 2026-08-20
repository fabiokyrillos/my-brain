import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * Slice 2P.8 — `2P-ACCESS-001` … `-004` and `2P-MOBILE-001` … `-004`, in an
 * authenticated browser against the production build.
 *
 * ## What this lane exists to settle, and what it deliberately cannot
 *
 * Phase 2O already scans these surfaces with axe, measures contrast on the
 * rendered page, asserts accessible names and focus indicators, and proves one
 * navigation strip is a strip rather than a tab row. None of that is repeated
 * here. What is new is the half those tests could not reach:
 *
 * - **`2P-ACCESS-003` over all five surfaces**, in the shape the owner signed on
 *   2026-08-20 — semantic links, `aria-current="page"`, visible focus, keyboard
 *   with Enter, working back and forward, and the new document announcing its
 *   own title and context. The 2O test proved exactly one of the five.
 * - **`2P-ACCESS-004`'s politeness half**, which had never been measured:
 *   background outcomes must be announced `polite`, not `assertive`.
 * - **`2P-MOBILE-001`'s five named surfaces**, on an iPhone-sized lane that did
 *   not exist until this slice added the Playwright project.
 *
 * ## The iPhone lane is an engine, not a device
 *
 * `--project=iphone-emulated` runs Playwright's **WebKit** at an iPhone 15's
 * viewport and DPR, which is a genuinely different engine from the Pixel 7
 * project (Chromium) and is the closest thing to Safari available without
 * hardware. It still proves **nothing** about a real device, a software
 * keyboard, the installed PWA shell, or VoiceOver — `2P-MOBILE-005` and
 * `2P-ACCESS-005` reserve all four for the owner, and no assertion in this file
 * may be read as discharging them.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

/**
 * The five surfaces, by the class each **emits** rather than by its filename.
 *
 * `relation-view-controls.tsx` emits `.relations-tabs` and
 * `settings-section-nav.tsx` emits `.settings-nav`. Phase 2O's own record has
 * the lesson written down: reading a class name off a filename is how an
 * assertion came to look for an element that has never existed, and a locator
 * that matches nothing passes every `toHaveCount(0)` in this file.
 */
const NAVIGATION_SURFACES = [
  { name: "work-modes", selector: ".work-modes", route: "/pt-BR/app/work" },
  { name: "brain-lenses", selector: ".brain-lenses", route: "/pt-BR/app/contexts" },
  { name: "relation-view-controls", selector: ".relations-tabs", route: "/pt-BR/app/relations" },
  { name: "settings-section-nav", selector: ".settings-nav", route: "/pt-BR/app/settings" },
  { name: "data-ai-tabs", selector: ".data-ai-tabs", route: "/pt-BR/app/history" },
] as const;

async function createAccount() {
  const email = `codex-2p8-${crypto.randomUUID()}@example.com`;
  const password = `Closeout!${crypto.randomUUID()}A7`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, id };
}

test.describe("Phase 2P closeout — access and phone evidence", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };

  test.beforeAll(async () => {
    owner = await createAccount();
  });

  test.afterAll(async () => {
    if (!owner?.id) return;
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${owner.id}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(response.ok, "fixture teardown failed").toBe(true);
  });

  const signIn = (page: Page) => signInOnline(page, { email: owner.email, locale: "pt-BR" });

  /* ---------------------------------------------------------------------- *
   * `2P-ACCESS-003` — the navigation the product actually uses.
   * ---------------------------------------------------------------------- */

  for (const surface of NAVIGATION_SURFACES) {
    test(`2P-ACCESS-003: ${surface.name} navigates by link and exposes the active destination`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(surface.route);

      const strip = page.locator(surface.selector);
      await expect(strip, `${surface.selector} did not render — a missing strip passes every absence check below`).toBeVisible();

      // The strip is a landmark with a name, so a reader can find it and knows
      // what it is before reading its items.
      const landmark = strip.locator("xpath=ancestor-or-self::nav").first();
      await expect(landmark).toHaveAttribute("aria-label", /\S/);

      // Exactly one active destination, announced as `page`.
      const current = strip.locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);

      // Every other item is a real link with a real href — not a button, not a
      // div with a click handler. This is the half that makes back, forward,
      // middle-click and "open in new tab" work at all.
      const links = strip.locator("a[href]");
      expect(await links.count(), `${surface.name} exposes no links`).toBeGreaterThan(0);

      // The owner's refusals, asserted as absences on the surface itself.
      await expect(strip.locator('[role="tablist"], [role="tab"], [role="tabpanel"]')).toHaveCount(0);
      // A roving tabindex is the other half of the ARIA tabs pattern: items
      // taken out of the tab order and moved through with the arrow keys. Every
      // item here must remain independently reachable.
      await expect(strip.locator('a[tabindex="-1"], [role="link"][tabindex="-1"]')).toHaveCount(0);
    });
  }

  test("2P-ACCESS-003: the keyboard reaches an item, Enter follows it, and back returns", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/settings");

    const strip = page.locator(".settings-nav");
    await expect(strip).toBeVisible();

    // A destination that is not the current one, so following it is observable.
    const target = strip.locator('a[href]:not([aria-current="page"])').first();
    const href = await target.getAttribute("href");
    expect(href, "no non-current destination to follow").toBeTruthy();

    await target.focus();
    await expect(target).toBeFocused();

    // Focus is visible, not merely present. An outline the browser draws and
    // CSS then removes is the defect this asserts against.
    const focusRing = await target.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });
    const visible =
      (focusRing.outlineStyle !== "none" && parseFloat(focusRing.outlineWidth) > 0)
      || (focusRing.boxShadow !== "none" && focusRing.boxShadow !== "");
    expect(visible, `no visible focus indicator: ${JSON.stringify(focusRing)}`).toBe(true);

    await page.keyboard.press("Enter");
    await page.waitForURL(`**${href}`);

    /*
      The arrival is asserted by **where `aria-current` moved**, not by the
      document title.

      Two reasons, both measured on the WebKit lane. `/app/settings` deliberately
      *renders* Geral rather than redirecting to it — the page's own docstring
      says a redirect would trap the back button, and `2P-SETTINGS-002` forbids
      that — so `/app/settings` and `/app/settings/general` legitimately share a
      title, and "the title changed" is not a property this navigation has. And
      `page.title()` read straight after `waitForURL` returned the previous
      document's title on WebKit, so the assertion was racing as well as wrong.

      `aria-current` is the thing the requirement is actually about: the reader
      must be told which destination they are on, and after following a link it
      must be the one they followed.
    */
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator(`.settings-nav a[href="${href}"][aria-current="page"]`)).toHaveCount(1);

    await page.goBack();
    await page.waitForURL("**/pt-BR/app/settings");
    // Back returns to a document that marks a different destination current.
    await expect(page.locator(`.settings-nav a[href="${href}"][aria-current="page"]`)).toHaveCount(0);
    await expect(page.locator('.settings-nav [aria-current="page"]')).toHaveCount(1);

    await page.goForward();
    await page.waitForURL(`**${href}`);
    await expect(page.locator(`.settings-nav a[href="${href}"][aria-current="page"]`)).toHaveCount(1);
  });

  /* ---------------------------------------------------------------------- *
   * `2P-ACCESS-004` — announced, and not by interrupting.
   * ---------------------------------------------------------------------- */

  test("2P-ACCESS-004: background outcomes are announced politely, never assertively", async ({
    page,
  }) => {
    await signIn(page);

    /*
      Three surfaces that announce an outcome of work the owner did not stand
      and wait for. `assertive` interrupts whatever a screen-reader user is
      reading; for a background result that is the wrong trade, and it is the
      half `2P-ACCESS-004` names that had never been measured.

      **The framework's own announcer is excluded, and it was measured rather
      than waved away.** The first version of this test asserted zero assertive
      regions and failed on every route, which read as a product defect. It is
      not: `grep -rn 'aria-live="assertive"' src` returns **nothing**, and the
      element is Next's `<next-route-announcer>` — `ariaLive = 'assertive'` in
      `node_modules/next/dist/client/components/app-router-announcer.js`. It
      announces a **navigation the reader just initiated**, which is the correct
      use of assertive and is not background work. Excluding it narrows the
      assertion to regions this product owns, which is what the requirement is
      about; a product region that turned assertive would still fail.
    */
    for (const route of ["/pt-BR/app/reminders", "/pt-BR/app", "/pt-BR/app/inbox"]) {
      await page.goto(route);
      const ours = await page.evaluate(() =>
        [...document.querySelectorAll('[aria-live="assertive"]')]
          .filter((element) => element.closest("next-route-announcer") === null)
          .map((element) => (element as HTMLElement).outerHTML.slice(0, 120)),
      );
      expect(ours, `${route} interrupts for background work: ${ours.join(" | ")}`).toEqual([]);
    }

    /*
      The control, so a zero above cannot mean "the selector found nothing".

      It is a **polite** region rather than the framework's announcer, and that
      is deliberate: the announcer's presence turned out to be engine-dependent
      — Chromium had it in the DOM on a fresh load and WebKit did not — so
      asserting on it made the control pass or fail for reasons that have
      nothing to do with this product. The reminders page's own live region is
      ours, is always rendered, and proves the `[aria-live]` query works on
      whichever engine is running. So the zero means *nothing here is
      assertive*, not *nothing here is live*.
    */
    await page.goto("/pt-BR/app/reminders");
    await expect(page.locator('[aria-live="polite"]').first()).toBeAttached();
  });

  /* ---------------------------------------------------------------------- *
   * `2P-ACCESS-001` — the composer says what it is and what it is doing.
   * ---------------------------------------------------------------------- */

  test("2P-ACCESS-001: composer controls are named and its states are announced", async ({ page }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/capture");

    const composer = page.locator("form.composer, .composer").first();
    await expect(composer).toBeVisible();

    /*
      Every control in the composer carries an accessible name. An icon-only
      button with no name is announced as "button" and is unusable.

      **The name computation had to be completed before it was right.** Its
      first version read only the associated `<label>`'s *text*, and reported
      the attachment input as unnamed — the label is
      `<label class="composer-attach" for={id} aria-label={copy.attach}>` whose
      visible content is an `aria-hidden` icon, so its text is empty and its
      name is on the attribute. A partial name computation does not under-report;
      it accuses working code, and this repository has already learned that a
      guard which fails on correct code is the one that gets weakened later.
    */
    const unnamed = await composer.locator("button, input, select, textarea").evaluateAll((elements) =>
      elements
        .filter((element) => {
          const el = element as HTMLElement;
          if (el.hasAttribute("aria-hidden")) return false;
          if ((el as HTMLInputElement).type === "hidden") return false;
          const own = (el.getAttribute("aria-label") ?? "").trim();
          const labelled = el.getAttribute("aria-labelledby");
          const title = (el.getAttribute("title") ?? "").trim();
          const text = (el.textContent ?? "").trim();
          // A control is named by any label that references it — whether the
          // label wraps it or points at it by `for` — and that label may carry
          // its own `aria-label` instead of text.
          const labels = [...(el as HTMLInputElement).labels ?? [], el.closest("label")].filter(
            (candidate): candidate is HTMLLabelElement => candidate !== null,
          );
          const fromLabel = labels
            .map((label) => (label.getAttribute("aria-label") ?? label.textContent ?? "").trim())
            .find((value) => value !== "") ?? "";
          return own === "" && !labelled && title === "" && text === "" && fromLabel === "";
        })
        .map((element) => (element as HTMLElement).outerHTML.slice(0, 120)),
    );
    expect(unnamed, `composer controls with no accessible name: ${unnamed.join(" | ")}`).toEqual([]);

    // The state channel exists before a state arrives: a live region created at
    // the moment its text appears is not a change to announce.
    await expect(composer.locator('[aria-live], [role="status"]').first()).toBeAttached();
  });

  /* ---------------------------------------------------------------------- *
   * `2P-MOBILE-001` … `-004`.
   * ---------------------------------------------------------------------- */

  test("2P-MOBILE-001: the five named surfaces render and stay within the viewport", async ({
    page,
  }, testInfo) => {
    await signIn(page);

    // The requirement names composer, dialogs, settings navigation, graph
    // alternative and calendar.
    const surfaces = [
      { name: "composer", route: "/pt-BR/app/capture", marker: ".composer" },
      { name: "settings navigation", route: "/pt-BR/app/settings", marker: ".settings-nav" },
      { name: "graph alternative", route: "/pt-BR/app/relations?view=list", marker: ".relations-tabs" },
      { name: "calendar", route: "/pt-BR/app/calendar?o=month", marker: ".calendar-view, .calendar-month, main" },
      { name: "dialogs", route: "/pt-BR/app/reminders", marker: ".reminder-compose-open" },
    ];

    for (const surface of surfaces) {
      await page.goto(surface.route);
      await expect(page.locator(surface.marker).first(), `${surface.name} did not render`).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${surface.name} scrolls sideways by ${overflow}px on ${testInfo.project.name}`).toBeLessThanOrEqual(1);
    }

    // The dialog opens and traps focus on this viewport too — the one surface
    // above whose failure mode is not layout.
    await page.getByRole("button", { name: "Novo lembrete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("2P-MOBILE-002: the primary action survives a viewport shrink and safe-area insets", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/pt-BR/app/reminders");
    await page.getByRole("button", { name: "Novo lembrete" }).click();

    const dialog = page.getByRole("dialog");
    const save = dialog.getByRole("button", { name: "Criar lembrete" });
    await expect(save).toBeVisible();

    const field = dialog.getByLabel("O que lembrar");
    await field.click();
    await field.fill("Um lembrete curto");

    /*
      A software keyboard is not scriptable, and pretending otherwise would be
      the false claim `2P-MOBILE-005` exists to prevent. What *is* scriptable is
      the observable consequence: iOS shrinks the visual viewport when the
      keyboard opens, so the test shrinks it and asserts that the field being
      typed into and the primary action both remain reachable. That is the
      failure this requirement is about; the keyboard itself stays owner-run.
    */
    const size = page.viewportSize();
    if (size) await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.55) });

    await expect(field).toBeVisible();
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeVisible();
    // And the value the owner typed survived the resize — a re-mounted form
    // would silently discard it.
    await expect(field).toHaveValue("Um lembrete curto");

    if (size) await page.setViewportSize(size);
    await page.keyboard.press("Escape");
  });

  test("2P-MOBILE-003: every target this phase added is at least 44 by 44", async ({ page }) => {
    await signIn(page);

    /*
      Scoped to what Phase 2P added, deliberately. ADR-122 Decision 7 keeps four
      inherited touch-target exceptions unabsorbed, and a sweep over the whole
      page would either re-report them as this phase's or invite the exemption
      list to grow — which is how an inherited residual quietly becomes a pass.
    */
    const scopes = [
      { route: "/pt-BR/app/reminders", selector: ".reminder-compose-open, .reminder-button" },
      { route: "/pt-BR/app/settings", selector: ".settings-nav a" },
      { route: "/pt-BR/app/relations?view=list", selector: ".relations-tabs a" },
      { route: "/pt-BR/app/calendar?o=month", selector: ".work-modes a" },
    ];

    for (const scope of scopes) {
      await page.goto(scope.route);
      const targets = page.locator(scope.selector);
      const total = await targets.count();
      expect(total, `${scope.selector} matched nothing on ${scope.route}`).toBeGreaterThan(0);

      const small = [];
      for (let index = 0; index < total; index += 1) {
        const box = await targets.nth(index).boundingBox();
        if (box === null) continue;
        if (box.width < 44 || box.height < 44) {
          small.push(`${await targets.nth(index).innerText()} ${Math.round(box.width)}×${Math.round(box.height)}`);
        }
      }
      expect(small, `targets under 44px on ${scope.route}: ${small.join(" | ")}`).toEqual([]);
    }
  });

  test("2P-MOBILE-004: 320px and 200% zoom keep content and actions", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 320, height: 720 });

    for (const route of [
      "/pt-BR/app/capture",
      "/pt-BR/app/settings",
      "/pt-BR/app/relations?view=list",
      "/pt-BR/app/calendar?o=month",
      "/pt-BR/app/reminders",
    ]) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} scrolls sideways by ${overflow}px at 320px`).toBeLessThanOrEqual(1);
      // Content, not just a shell: something the reader can actually read.
      await expect(page.locator("h1")).toHaveCount(1);
    }

    /*
      200% zoom, emulated the way a browser actually applies it — halve the CSS
      viewport rather than scale the page, which is what a reflow requirement is
      about. 320 CSS px at 200% is a 640px device; the reflow contract is that
      no content is lost, which is the assertion above repeated at the narrower
      effective width.
    */
    await page.setViewportSize({ width: 320, height: 512 });
    await page.goto("/pt-BR/app/reminders");
    await expect(page.getByRole("button", { name: "Novo lembrete" })).toBeVisible();
    const zoomedOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(zoomedOverflow).toBeLessThanOrEqual(1);
  });
});
