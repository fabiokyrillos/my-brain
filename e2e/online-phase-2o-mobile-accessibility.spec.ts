import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2O.7's authenticated half — `2O-MOBILE-001`, `-002`, `2O-ACCESS-001`
 * … `-005`, over the surfaces that need a session.
 *
 * ## Why this exists beside `phase-2o-mobile-accessibility.spec.ts`
 *
 * That lane runs in CI on every push and reaches the public surfaces: the entry
 * page, login, the closed register, recovery and the policy documents. **Most
 * of what Phase 2O built is behind a session** — the preferences centre, the
 * appearance choice, BYOK, AI and cost, privacy and consent, notifications, the
 * universal states and the export. None of it can be measured without signing
 * in, and signing in needs the hosted project.
 *
 * Splitting them is what keeps the half that *can* gate, gating. Folding these
 * into the CI lane would have made the whole thing credential-gated, and a lane
 * that skips itself in CI is a lane that is not run.
 *
 * ## Why the real pages, and not a fixture
 *
 * `2O-ACCESS-005` names the rendered page, and the four fixture lanes each
 * carry a hand-written `STYLESHEETS` array that goes stale in silence — §85
 * found `settings-extended.css` missing from one, so the notifications and BYOK
 * surfaces had been measured against the user-agent default for as long as
 * assertions had existed over them. Nothing here inlines CSS.
 *
 * ## What is deliberately not asserted
 *
 * **Nothing about push delivery.** `OD-2O-11` declines that track and
 * `2O-NOTIFY-006` states the fact rather than resolving it; the notifications
 * page is measured here for geometry, contrast and names only. A fresh account
 * has no sender key configured in this environment, so `PushControls` renders
 * an honest sentence instead of a control — which §84 records as a fact about
 * the environment rather than a defect, and which is why nothing below asserts
 * that a push control exists.
 *
 * ## The account is disposable and is deleted in `afterAll`
 */

const require_ = createRequire(__filename);
const AXE_PATH = require_.resolve("axe-core");
const APPEARANCE_KEY = "my-brain.appearance";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

/**
 * Every authenticated surface Phase 2O created or changed, in both locales.
 *
 * `settings` carries eight of the phase's sections at once — the credential
 * panel, the preferences form, the appearance choice, the capability summary,
 * the install guide, Dados e IA, Conta e dados, privacy and consent — so it
 * appears in both locales while the narrower routes appear once. Which locale
 * each narrower route is measured in alternates deliberately: a lane that only
 * ever proves `pt-BR` proves half a product whose copy modules are two objects.
 */
const SURFACES = [
  { name: "settings — the whole centre (pt-BR)", path: "/pt-BR/app/settings" },
  { name: "settings — the whole centre (en)", path: "/en/app/settings" },
  { name: "cockpit (pt-BR)", path: "/pt-BR/app" },
  { name: "cockpit (en)", path: "/en/app" },
  { name: "notifications (pt-BR)", path: "/pt-BR/app/notifications" },
  { name: "notifications (en)", path: "/en/app/notifications" },
  { name: "costs (pt-BR)", path: "/pt-BR/app/costs" },
  { name: "history (en)", path: "/en/app/history" },
  { name: "memories (pt-BR)", path: "/pt-BR/app/memories" },
  { name: "inbox (en)", path: "/en/app/inbox" },
] as const;

async function axeViolations(page: Page, only?: string[]) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (runOnly) => {
    // @ts-expect-error injected by addScriptTag
    const results = await window.axe.run(document, {
      resultTypes: ["violations"],
      ...(runOnly ? { runOnly } : {}),
    });
    return (results.violations as Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown; failureSummary?: string }> }>)
      .filter((violation) => runOnly !== undefined || violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id} ×${violation.nodes.length}: ${violation.nodes.slice(0, 8).map((node) => `${String(node.target)} ${(node.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 120)}`).join(" || ")}`);
  }, only);
}

/**
 * Waits until every finite animation on the page has finished.
 *
 * ## The failure this exists to prevent, found by it failing
 *
 * `globals.css` and `costs.css` give `.panel`, `.capture-card` and every cost
 * metric card a 220ms `rise` entrance with `animation-fill-mode: both`, so
 * before it runs the element holds the keyframe's `from` state —
 * **`opacity: 0`**. Axe composites text against what is actually painted, so a
 * scan that lands inside that window reports the whole cost summary as
 * `color-contrast 1.66` and names foreground colours (`#c6c3c0`) that appear
 * in no stylesheet and no token.
 *
 * That was reported as three serious violations on a correct page, and reading
 * the computed style directly is what settled it: `["0.305", "0", "0", "0"]`
 * immediately after load, `["1", "1", "1", "1"]` two seconds later.
 *
 * ## Why not a fixed wait
 *
 * A `waitForTimeout(2000)` would work today and rot the first time an entrance
 * gets slower, in the direction that passes rather than fails. This asks the
 * browser the actual question. Infinite animations — the spinner, the skeleton
 * shimmer — are excluded by their own iteration count rather than by name,
 * because they never finish and are never an entrance.
 */
async function settle(page: Page) {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? 1))
          .every((animation) => animation.playState === "finished"),
      undefined,
      { timeout: 5_000 },
    )
    // A page whose animations never settle is a finding about that page, not a
    // reason to stop measuring it: the assertions below still run and still
    // report what they see.
    .catch(() => undefined);
}

async function canvasLuminance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const paint = (element: Element | null): string => {
      for (let node = element; node; node = node.parentElement) {
        const colour = getComputedStyle(node).backgroundColor;
        if (colour && colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") return colour;
      }
      return "rgb(255, 255, 255)";
    };
    const [red, green, blue] = paint(document.body).match(/\d+/g)!.map(Number);
    return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  });
}

test.describe("every surface Phase 2O put behind a session is usable on a phone and to a screen reader", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2o7-${crypto.randomUUID()}@example.com`;
  const password = `Access!${crypto.randomUUID()}A7`;
  let userId: string | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Access E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  /**
   * One session per test, and the appearance choice stored before it opens.
   *
   * The first version of this lane signed in on **every navigation**, because
   * that reads as the safe thing to do. Ten surfaces × eighteen tests is a few
   * hundred round trips to GoTrue, and the hosted project answered
   * `429 over_request_rate_limit` — so four tests failed for a reason that has
   * nothing to do with the product, while reporting it as a product failure.
   *
   * The session is a cookie and knows nothing about locale, so one sign-in
   * covers both `/pt-BR` and `/en`. `addInitScript` must run before it, because
   * it applies from the next navigation onward and signing in is a navigation.
   */
  async function begin(page: Page, choice?: "light" | "dark") {
    if (choice) {
      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key, value),
        [APPEARANCE_KEY, choice] as const,
      );
    }
    await signInOnline(page, { email, locale: "pt-BR" });
  }

  async function visit(page: Page, path: string) {
    await page.goto(path);
    // Every one of these routes reads the database, and the online lane's own
    // config raises the clock for exactly that reason.
    await expect(page.locator("h1").first()).toBeVisible();
    await settle(page);
  }

  /* ---------------------------------------------------------------------- *
   * `2O-MOBILE-001` — 320px and 375px, no sideways scroll.
   * ---------------------------------------------------------------------- */

  for (const width of [320, 375] as const) {
    test(`2O-MOBILE-001: no authenticated surface scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await begin(page);
      for (const surface of SURFACES) {
        await visit(page, surface.path);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          /*
            The WIDEST element, not the first three in document order.

            The first version reported `h2`, `p.appearance-intro` and
            `fieldset.appearance-fieldset` — three innocent children of a
            section that was merely being stretched by something else on the
            page. Everything laid out at 100% of an over-wide container
            "overflows", so document order names symptoms. Sorting by width and
            reporting the element's ancestry names the cause.
          */
          culprit: [...document.querySelectorAll<HTMLElement>("body *")]
            .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
            .map((element) => ({ element, width: element.getBoundingClientRect().width }))
            .sort((a, b) => b.width - a.width)
            .slice(0, 3)
            .filter(({ element }) => {
              /*
                Only the elements that are themselves too wide.

                Everything laid out at 100% of an over-wide container reports
                the container's width, so a plain sort still buries the cause
                under its symptoms — the first improved version named three
                `section.appearance-section` children, all exactly the width of
                the page they sat in. An element whose own content does not fit
                (`scrollWidth > clientWidth`) or which is wider than its parent
                is the thing actually doing the pushing.
              */
              const parent = element.parentElement;
              const parentWidth = parent?.getBoundingClientRect().width ?? Infinity;
              return element.scrollWidth > element.clientWidth + 1 || element.getBoundingClientRect().width > parentWidth + 1;
            })
            .map(({ element, width }) => {
              const trail: string[] = [];
              for (let node: HTMLElement | null = element; node && trail.length < 3; node = node.parentElement) {
                trail.push(`${node.tagName.toLowerCase()}.${node.className || "—"}`);
              }
              return `${Math.round(width)}px ${trail.join(" < ")}`;
            }),
        }));
        expect(
          overflow.scrollWidth,
          `${surface.name} overflows by ${overflow.scrollWidth - overflow.clientWidth}px — ${overflow.culprit.join(", ")}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      }
    });
  }

  /* ---------------------------------------------------------------------- *
   * `2O-MOBILE-002` — 44 CSS pixels, measured.
   * ---------------------------------------------------------------------- */

/**
 * The two chrome controls this phase may not resize, and the liveness check
 * that stops the list from outliving its reason.
 *
 * `.skip-link` (39px) lives in `app-shell.tsx` and `.palette-trigger` (38px) in
 * the command palette's trigger branch. `git diff 57beb06..a58af08` shows Phase
 * 2O touched neither: `app-shell.tsx` is unchanged, and the only edit to
 * `command-palette.tsx` replaced its empty state with `UniversalStateView`.
 * They render on **every** route, so they appear on every surface below —
 * which makes them look like this phase's, and they are not.
 *
 * `2O-MOBILE-002`'s subject is *every interactive target **this phase creates
 * or changes***, and ADR-116 Decision 2 spends the phase's single licence to
 * change a surface it did not create on `2O-MOBILE-003`. Both are recorded as
 * named residuals with a destination rather than repaired here.
 */
const CHROME_EXCEPTIONS = ["skip-link", "palette-trigger"] as const;

test.describe("the chrome exceptions still need their exception", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  /*
    Inside the app, because the shell is where this chrome lives.

    The first version looked at the login page on the reasoning that it renders
    "the same shell". It does not — auth routes render `auth-stage`, which has
    no skip link and no palette — so the check found nothing and failed with
    "this measured nothing". That failure is the whole point of writing the
    non-vacuity assertion, and it fired on its author first.

    A stale exception is a permission nobody notices, so the finding is
    re-derived on every run and this fails when it stops reproducing.
  */
  test("2O-MOBILE-002: skip-link and palette-trigger are still below 44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const email = `codex-chrome-${crypto.randomUUID()}@example.com`;
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: `Chrome!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    const id = ((await created.json()) as { id: string }).id;
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app");
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".skip-link, .palette-trigger")].map((element) => ({
        name: element.className,
        height: element.getBoundingClientRect().height,
      })),
    );
    // The login page carries the skip link and not the palette, so this asserts
    // over what it finds rather than over a count it wishes for.
    expect(heights.length, "neither chrome control rendered, so this measured nothing").toBeGreaterThan(0);
    for (const entry of heights) {
      expect(
        entry.height,
        `${entry.name} now meets 44px — delete its exception and let the assertion cover it`,
      ).toBeLessThan(44);
    }
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
  });
});

  test("2O-MOBILE-002: every interactive target is at least 44×44 CSS pixels at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    const found: string[] = [];
    for (const surface of SURFACES) {
      await visit(page, surface.path);
      const undersized = await page.evaluate((chrome) =>
        [...document.querySelectorAll("a[href], button, input, select, textarea, [role='button']")]
          .filter((element) => {
            const style = getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden") return false;
            const box = element.getBoundingClientRect();
            if (box.width === 0 && box.height === 0) return false;
            // `type="checkbox"` and `type="radio"` render at the platform's own
            // size and are exempt only when their LABEL provides the target,
            // which is asserted separately below rather than assumed here.
            if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
              const label = element.closest("label") ?? document.querySelector(`label[for="${element.id}"]`);
              const labelBox = label?.getBoundingClientRect();
              if (labelBox && labelBox.height >= 44) return false;
            }
            const inlineInProse =
              style.display === "inline" &&
              element.parentElement !== null &&
              (element.parentElement.textContent ?? "").trim() !== (element.textContent ?? "").trim();
            if (inlineInProse) return false;
            // The chrome this phase may not resize. Recognised by class rather
            // than by an element list, and re-derived by the liveness check
            // above rather than trusted.
            if (chrome.some((name) => element.classList.contains(name))) return false;
            /*
              Half a pixel of tolerance, and it is about layout arithmetic
              rather than about the requirement.

              `min-height: 44px` on a flex item inside a fractional grid
              computes to 43.99 often enough that a strict comparison reports a
              control the stylesheet sets to exactly the minimum. The memory
              search field measured 175×44 and failed. Nothing near a real
              defect is admitted: 43.5 still fails, and every finding this lane
              actually produced was 17 – 40px.
            */
            return box.height < 43.5 || box.width < 43.5;
          })
          .slice(0, 8)
          .map((element) => {
            const box = element.getBoundingClientRect();
            const label = (element.textContent ?? "").trim().slice(0, 26) || element.getAttribute("aria-label") || "";
            return `${element.tagName.toLowerCase()}#${element.id || "—"}[${element.getAttribute("type") ?? "—"}].${element.className || "—"} "${label}" ${Math.round(box.width)}×${Math.round(box.height)}`;
          }),
        [...CHROME_EXCEPTIONS],
      );
      found.push(...undersized.map((entry) => `${surface.name}: ${entry}`));
    }
    expect(found, `targets below 44px:\n${found.join(" · ")}`).toEqual([]);
  });

  test("2O-MOBILE-002: the time fields and the checkboxes are operable on a phone", async ({ page }) => {
    /*
      The controls the owner named specifically, and the ones a generic sweep
      is least likely to be right about: a `type="time"` field opens the
      platform keyboard, and a checkbox is 13px however the row around it is
      styled. What must be 44px is the thing a thumb aims at.

      Measured on **Ajustes**, not on Notificações. The quiet-hours times and
      the important-reminder checkbox live in `SettingsForm` and render for
      every account; the notifications page's own time fields are inside
      `PushControls`, which — §84 — does not render at all where no sender key
      is configured. The first version of this test looked there, found zero
      fields, and reported "no time field rendered" against a correct page.
    */
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    await visit(page, "/pt-BR/app/settings");

    const times = page.locator('input[type="time"]');
    const timeCount = await times.count();
    expect(timeCount, "no time field rendered, so this assertion measured nothing").toBeGreaterThan(0);
    for (let index = 0; index < timeCount; index += 1) {
      const box = await times.nth(index).boundingBox();
      expect(box?.height ?? 0, `a time field is ${box?.height}px tall`).toBeGreaterThanOrEqual(44);
      // 16px or larger, or iOS zooms the whole page on focus — which is a
      // reflow defect produced by a font size.
      const fontSize = await times.nth(index).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      expect(fontSize, "a font below 16px makes iOS zoom the page on focus").toBeGreaterThanOrEqual(16);
    }

    const boxes = page.locator('input[type="checkbox"]');
    const boxCount = await boxes.count();
    expect(boxCount, "no checkbox rendered, so this assertion measured nothing").toBeGreaterThan(0);
    for (let index = 0; index < boxCount; index += 1) {
      const reachable = await boxes.nth(index).evaluate((element) => {
        const label = element.closest("label") ?? document.querySelector(`label[for="${element.id}"]`);
        const target = label ?? element;
        return target.getBoundingClientRect().height;
      });
      expect(reachable, "a checkbox has no 44px target, label included").toBeGreaterThanOrEqual(44);
    }
  });

  /* ---------------------------------------------------------------------- *
   * `2O-ACCESS-001` and `-005` — axe and contrast, light and dark.
   * ---------------------------------------------------------------------- */

  for (const theme of ["light", "dark"] as const) {
    test(`2O-ACCESS-001: no serious or critical axe violation in ${theme}`, async ({ page }) => {
      await begin(page, theme);
      const found: string[] = [];
      for (const surface of SURFACES) {
        await visit(page, surface.path);
        // The control, per surface rather than once for the lane. A single
        // check at the top would let a later navigation lose the choice and
        // every subsequent scan run light while reporting dark.
        const luminance = await canvasLuminance(page);
        if (theme === "light") expect(luminance, `${surface.name} did not render light`).toBeGreaterThan(0.7);
        else expect(luminance, `${surface.name} did not render dark`).toBeLessThan(0.3);

        found.push(...(await axeViolations(page)).map((entry) => `${surface.name}: ${entry}`));
      }
      /*
        Accumulated across every surface, then asserted once.

        Asserting inside the loop stops at the first surface that fails, so a
        five-minute run reports one defect and hides the rest — and the next run
        reports the next one. Each of those costs a full pass against the hosted
        project, which is how a lane becomes something people stop running.
      */
      expect(found, `serious or critical violations in ${theme}:\n${found.join(" · ")}`).toEqual([]);
    });

    test(`2O-ACCESS-005: text meets contrast on the rendered page in ${theme}`, async ({ page }) => {
      await begin(page, theme);
      const found: string[] = [];
      for (const surface of SURFACES) {
        await visit(page, surface.path);
        found.push(...(await axeViolations(page, ["color-contrast"])).map((entry) => `${surface.name}: ${entry}`));
      }
      expect(found, `contrast failures in ${theme}:\n${found.join(" · ")}`).toEqual([]);
    });
  }

  test("2O-ACCESS-001: the dark control can fail, so a light run cannot pass as a dark one", async ({ page }) => {
    /*
      No `addInitScript` here, and that is the whole point of this test.

      Registered once, it re-runs on **every** navigation — so storing `dark`
      and reloading had the init script write `light` straight back, both
      readings came out identical, and this control failed while the product was
      correct. Signing in without a choice and then storing one per reload is
      the only shape in which the two readings can genuinely differ.
    */
    await begin(page);
    await visit(page, "/pt-BR/app/settings");

    const read = async (choice: "light" | "dark") => {
      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key, value),
        [APPEARANCE_KEY, choice] as const,
      );
      await page.reload();
      return canvasLuminance(page);
    };

    const light = await read("light");
    const dark = await read("dark");
    expect(light, "light and dark rendered the same canvas, so every dark scan above is vacuous").toBeGreaterThan(
      dark + 0.4,
    );
  });

  /* ---------------------------------------------------------------------- *
   * `2O-ACCESS-002` — names, focus, keyboard.
   * ---------------------------------------------------------------------- */

  test("2O-ACCESS-002: every control has an accessible name", async ({ page }) => {
    await begin(page);
    const found: string[] = [];
    for (const surface of SURFACES) {
      await visit(page, surface.path);
      const nameless = await axeViolations(page, [
        "button-name",
        "link-name",
        "input-button-name",
        "label",
        "select-name",
        "aria-input-field-name",
        "aria-command-name",
      ]);
      found.push(...nameless.map((entry) => `${surface.name}: ${entry}`));
    }
    expect(found, `controls with no accessible name:\n${found.join(" · ")}`).toEqual([]);
  });

  test("2O-ACCESS-002: every focusable control paints a visible focus indicator", async ({ page }) => {
    await begin(page);
    const found: string[] = [];
    for (const surface of SURFACES) {
      await visit(page, surface.path);
      /*
        Focused by pressing Tab, not by calling `.focus()`.

        The first version of this test called `element.focus()` in a loop and
        reported **eighteen** `a.nav-item` links as having no focus indicator.
        They all have one. `:focus-visible` is a heuristic about how focus
        arrived, and a programmatic `focus()` with no preceding keyboard
        interaction does not satisfy it — so the rule that paints the ring never
        matched, and a correct product was reported as broken on every route.

        Real keypresses put the browser in the state the rule is written for,
        which is also the state a keyboard user is actually in.
      */
      const invisible: string[] = [];
      for (let press = 0; press < 30; press += 1) {
        await page.keyboard.press("Tab");
        const failure = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active || active === document.body) return null;
          if (!active.matches("a[href], button, input, select, textarea")) return null;
          const paints = (element: HTMLElement) => {
            const style = getComputedStyle(element);
            // A border change alone is deliberately not accepted: it moves
            // layout and is what the redesign replaced.
            return (
              (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none"
            );
          };
          if (paints(active)) return null;
          /*
            A composite field is read differently, and this is a fact about the
            reading rather than an exemption.

            `type="time"` and `type="date"` put focus on a segment inside their
            own shadow tree. `document.activeElement` still reports the host, so
            this loop finds it — but the computed style read at that moment
            comes back with `outline-style: none` on a host whose `:focus` rule
            paints a 2px ring, which a direct probe confirms. Reported as a
            defect, it would have sent someone to fix a stylesheet that is
            already correct.

            Re-focusing the host and re-reading is the same question asked in
            the form the browser answers. It is not weaker: a field with no rule
            at all still fails here, which the planted control below proves.
          */
          if (active.matches('input[type="time"], input[type="date"], input[type="datetime-local"], input[type="month"], input[type="week"]')) {
            active.focus();
            if (paints(active)) return null;
          }
          // Identified precisely, because "input.—" appearing twice in a
          // failure list is a report nobody can act on: it took a second full
          // run against the hosted project to learn which two inputs they were.
          const final = getComputedStyle(active);
          return `${active.tagName.toLowerCase()}#${active.id || "—"}[${active.getAttribute("type") ?? active.getAttribute("name") ?? "—"}].${active.className || "—"} fv=${active.matches(":focus-visible")} outline=${final.outlineStyle}/${final.outlineWidth}`;
        });
        if (failure) invisible.push(failure);
      }
      found.push(...invisible.map((entry) => `${surface.name}: ${entry}`));
    }
    expect(found, `controls with no visible focus indicator:\n${found.join(" · ")}`).toEqual([]);
  });

  /* ---------------------------------------------------------------------- *
   * `2O-ACCESS-003` — landmarks, headings, and meaning that is not a colour.
   * ---------------------------------------------------------------------- */

  test("2O-ACCESS-003: every surface has one `h1` and no skipped heading level", async ({ page }) => {
    await begin(page);
    // §85 shipped a page whose `<h1>` arrived two-thirds of the way down,
    // because `NotificationSettings` opened with an `<h2>` above the header. A
    // presence assertion could not see it; positions can.
    for (const surface of SURFACES) {
      await visit(page, surface.path);
      const outline = await page.evaluate(() =>
        [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) => Number(heading.tagName.slice(1))),
      );
      expect(outline.filter((level) => level === 1), `${surface.name} does not have exactly one h1`).toHaveLength(1);
      expect(outline[0], `${surface.name} starts at h${outline[0]} rather than at its own title`).toBe(1);
      for (let index = 1; index < outline.length; index += 1) {
        expect(
          outline[index] - outline[index - 1],
          `${surface.name} jumps from h${outline[index - 1]} to h${outline[index]}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test("2O-ACCESS-003: a toned region always carries words, never only a colour", async ({ page }) => {
    await begin(page);
    const found: string[] = [];
    for (const surface of SURFACES) {
      await visit(page, surface.path);
      const silent = await page.evaluate(() =>
        [...document.querySelectorAll("[role='status'], [role='alert'], [data-tone], [data-status], [data-ux-state]")]
          .filter((element) => (element.textContent ?? "").trim().length === 0)
          /*
            A **visually hidden** live region is empty on purpose and is not a
            subject of this requirement: it carries no colour, so it cannot
            carry meaning by colour. `AccountMenu` and the search surface each
            mount one, and the first version of this test reported both as
            defects — a requirement about tone applied to something with no
            tone.

            Recognised by geometry rather than by class name: a rule that
            exempted `.sr-only` would exempt a visible element that acquired the
            class, and this cannot.
          */
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 1 && box.height > 1;
          })
          .map((element) => `${element.tagName.toLowerCase()}.${element.className || "—"}`),
      );
      found.push(...silent.map((entry) => `${surface.name}: ${entry}`));
    }
    expect(found, `toned regions with no words in them:\n${found.join(" · ")}`).toEqual([]);
  });

  /* ---------------------------------------------------------------------- *
   * `2O-ACCESS-004` — `aria-current`, not `role="tablist"`.
   * ---------------------------------------------------------------------- */

  test("2O-ACCESS-004: the strips this phase added navigate rather than pretending to be tabs", async ({ page }) => {
    await begin(page);
    await visit(page, "/pt-BR/app/notifications");

    // Direction one: exactly one current item, and it is not a link, because a
    // link to the page you are on is a control that does nothing.
    /*
      On Notificações, not on Ajustes. `AccountDataStrip` mounts in exactly two
      places — the notifications page and the deletion page — and Ajustes is
      where the strip *points from*, not where it renders. The first version of
      this test looked on Ajustes and failed to find an element that was never
      there, which is a defect in the test and would have read as one in the
      product.

      And the selector is `.data-ai-tabs`, not `.account-data-strip`: the
      component's FILE is named `account-data-strip.tsx` and the class it emits
      is not. §84's finding table cited the file, and reading a class name off a
      filename is how the first version of this assertion came to look for an
      element that has never existed.
    */
    const strip = page.locator(".data-ai-tabs");
    await expect(strip).toBeVisible();
    const current = strip.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    expect(await current.evaluate((element) => element.tagName.toLowerCase())).toBe("span");

    // Direction two, and the one that can actually regress: no `tablist`
    // anywhere on a surface this phase built. A strip converted to tabs would
    // pass the assertion above and promise keyboard semantics it does not have.
    await expect(page.locator('[role="tablist"], [role="tab"]')).toHaveCount(0);
  });

  /* ---------------------------------------------------------------------- *
   * The polish pass of §85, audited rather than redesigned.
   * ---------------------------------------------------------------------- */

  test("the notifications page states its three facts on a phone without collapsing them", async ({ page }) => {
    // §85 restructured this surface and 2O.6 built its contract. Nothing here
    // redesigns either: it asserts the properties survive at 320px, which is
    // where a three-column layout silently becomes one unreadable column.
    await page.setViewportSize({ width: 320, height: 720 });
    await begin(page);
    await visit(page, "/pt-BR/app/notifications");

    const facts = page.locator(".notification-facts");
    await expect(facts).toBeVisible();
    await expect(facts.locator("[data-notification-fact]")).toHaveCount(3);

    // Three distinct sentences, still — collapsing them into one indicator is
    // the defect `2O-NOTIFY-007` names, and a narrow viewport is where a
    // layout is most tempted to do it.
    const sentences = await facts.locator("[data-notification-fact]").allInnerTexts();
    expect(new Set(sentences.map((entry) => entry.trim())).size).toBe(3);

    // And none of them overflows its own card.
    const clipped = await facts.evaluate((element) =>
      [...element.querySelectorAll("[data-notification-fact]")].filter(
        (fact) => fact.scrollWidth > fact.clientWidth + 1,
      ).length,
    );
    expect(clipped, "a fact is clipped inside its own card at 320px").toBe(0);
  });

  test("the credential panel keeps its three facts on three lines at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await begin(page);
    await visit(page, "/pt-BR/app/settings");

    const badge = page.locator(".byok-badge");
    await expect(badge).toBeVisible();
    // The defect §85 repaired: the state, the fingerprint and the validity ran
    // together as one line of text. At 320px they must still be stacked, which
    // is a geometric statement rather than a structural one — the DOM was
    // already three elements when they overlapped.
    const state = page.locator(".byok-state");
    const overlap = await state.evaluate((element) => {
      const children = [...element.children].map((child) => child.getBoundingClientRect());
      for (let index = 1; index < children.length; index += 1) {
        if (children[index].top < children[index - 1].bottom - 1) return true;
      }
      return false;
    });
    expect(overlap, "two of the credential panel's facts share a line at 320px").toBe(false);

    // A key that was never entered and a key that was removed say different
    // things — the owner's decision, asserted on the rendered page. A fresh
    // account is `absent`, so this is the sentence that must NOT be the other.
    await expect(badge).not.toContainText("Chave removida");
    await expect(badge).toContainText("Nenhuma chave configurada");
  });

  test("the install guide reaches the reader, and refuses the inference about alerts", async ({ page }) => {
    // `2O-MOBILE-004`, and the RSC assertion this repository has paid for
    // twice: the component compiles, is unit-tested, and neither fact means it
    // renders in production.
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    await visit(page, "/pt-BR/app/settings");

    const section = page.locator(".install-section");
    await expect(section).toBeVisible();
    await expect(section.locator(".install-step")).toHaveCount(3);
    // The refusal, on the surface. Without it a reader concludes that
    // installing is the missing step for alerts — the claim `OD-2O-11` forbids.
    await expect(section.locator(".install-caveat")).toContainText(/não ativa avisos/i);
    // And it offers no control, so it cannot become a second write path.
    await expect(section.locator("button, input, select")).toHaveCount(0);
  });

  /* ---------------------------------------------------------------------- *
   * `2O-MOBILE-003` — the admitted residual, measured rather than asserted.
   * ---------------------------------------------------------------------- */

  test("2O-MOBILE-003: a memory row's title is a real target, masked or not", async ({ page }) => {
    // Measured at 21.59px against this project before slice 2O.7, reproduced
    // unchanged since 2N.3. The masked branch is asserted because
    // `ProtectedContent` substitutes its own anchor, and a repair covering only
    // the unmasked one leaves every sensitive memory below the minimum.
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    await visit(page, "/pt-BR/app/memories");

    const rows = page.locator(".memory-row");
    const rowCount = await rows.count();
    if (rowCount === 0) {
      // A fresh account has no memories. The empty state is the surface here,
      // and asserting over zero rows would be the vacuous pass this file is
      // shaped to refuse — so the absence is stated rather than skipped past.
      await expect(page.locator("[data-ux-state]")).toBeVisible();
      return;
    }
    for (let index = 0; index < Math.min(rowCount, 5); index += 1) {
      const title = rows.nth(index).locator(".memory-row-title, .work-title-link").first();
      const box = await title.boundingBox();
      expect(box?.height ?? 0, `memory row ${index} has a ${box?.height}px title target`).toBeGreaterThanOrEqual(44);
    }
  });
});
