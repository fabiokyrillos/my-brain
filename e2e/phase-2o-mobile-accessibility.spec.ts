import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

/**
 * Slice 2O.7 — `2O-MOBILE-001`, `-002`, `-005`, `2O-ACCESS-001` … `-005`.
 *
 * ## Why this lane renders the product instead of mirroring it
 *
 * Four Playwright lanes in this repository build a fixture: they read
 * `src/app/*.css` off disk, inline it into a bare document and assert over
 * hand-written markup. That shape is load-bearing where it is used — it can
 * render a state the product reaches only after a job runs — and it has a
 * standing cost this handoff has recorded twice: a `STYLESHEETS` array that
 * goes stale makes every geometric and contrast assertion measure unstyled
 * markup and **pass**. §85 found `settings-extended.css` missing from one of
 * them, and the notifications lane had been measuring the user-agent default
 * for as long as it had existed.
 *
 * `2O-ACCESS-005` says contrast is verified **on the rendered page**, and
 * `2O-MOBILE-001` says every surface this phase creates or changes is usable at
 * 375px. Both are properties of the artifact that ships. So this lane drives
 * the production build over real routes: there is no `STYLESHEETS` array to go
 * stale, no mirrored copy to drift, and a stylesheet deleted from
 * `globals.css` fails here rather than passing quietly.
 *
 * ## Why only the public surfaces
 *
 * These are the ones reachable without a session, so this lane runs in **CI**
 * on every push rather than by hand. The authenticated half of the phase —
 * Ajustes, appearance, BYOK, AI and cost, privacy and consent, notifications —
 * is covered by `online-phase-2o-mobile-accessibility.spec.ts`, which needs the
 * hosted project. Splitting them is what keeps the half that *can* gate,
 * gating.
 *
 * ## The dark run and its control
 *
 * `2O-ACCESS-001` requires the dark scan and **a control proving the dark run
 * really is dark**. Both directions are covered: `emulateMedia` for the machine
 * setting, and `localStorage` for the explicit choice that must beat it. Each
 * asserts the canvas it actually rendered before scanning it, so a dark scan
 * that silently ran light fails instead of reporting a clean light page as a
 * clean dark one.
 */

const require_ = createRequire(__filename);
const AXE_PATH = require_.resolve("axe-core");

/** The storage key `src/features/appearance/contracts.ts` owns. */
const APPEARANCE_KEY = "my-brain.appearance";

/**
 * Every public surface Phase 2O created or changed, in both locales.
 *
 * `legal/*` is included because slice 2O.5's consent record links to these two
 * documents and `2O-CONSENT` treats them as part of the surface it ships. They
 * predate the phase; the strip that reaches them does not.
 */
const PUBLIC_SURFACES = [
  { name: "entry (pt-BR)", path: "/pt-BR" },
  { name: "entry (en)", path: "/en" },
  { name: "login (pt-BR)", path: "/pt-BR/auth/login" },
  { name: "login (en)", path: "/en/auth/login" },
  { name: "register — closed (pt-BR)", path: "/pt-BR/auth/register" },
  { name: "register — closed (en)", path: "/en/auth/register" },
  { name: "recover (pt-BR)", path: "/pt-BR/auth/recover" },
  { name: "terms (pt-BR)", path: "/pt-BR/legal/terms" },
  { name: "privacy (en)", path: "/en/legal/privacy" },
] as const;

/**
 * Serious and critical only, and the threshold is argued rather than inherited.
 *
 * `2O-ACCESS-001` names exactly these two classes. Unlike the fixture lanes,
 * this one renders the real page chrome — so `region` stays **enabled** here:
 * a landmark failure on the shipped document is a real finding, and disabling
 * it would be importing a fixture's excuse into a place that has none.
 */
async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error injected by addScriptTag
    const results = await window.axe.run(document, { resultTypes: ["violations"] });
    return (results.violations as Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown }> }>)
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.slice(0, 3).map((node) => String(node.target)),
      }));
  });
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

/** The document's own painted background, as three numbers. */
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
    // Rec. 601 luma, which is enough to tell a dark canvas from a light one and
    // does not pretend to be a contrast calculation.
    return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  });
}

/**
 * Loads `path` with the appearance choice already stored, so the pre-paint
 * script sees it on the very first document rather than on a reload.
 *
 * `addInitScript` runs before any page script on every navigation, which is the
 * only moment early enough: setting `localStorage` after `goto` would leave the
 * first paint following the machine and make every "explicit choice" assertion
 * below measure the wrong thing.
 */
async function open(page: Page, path: string, choice?: "light" | "dark") {
  if (choice) {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [APPEARANCE_KEY, choice] as const,
    );
  }
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await settle(page);
}

/* -------------------------------------------------------------------------- *
 * `2O-MOBILE-001` — usable at 375px, and at 320px, with no sideways scroll.
 * -------------------------------------------------------------------------- */

const WIDTHS = [
  { name: "320px — the narrowest phone still in use", width: 320, height: 720 },
  { name: "375px — the width the requirement names", width: 375, height: 812 },
  { name: "414px — a larger phone", width: 414, height: 896 },
  { name: "1280px — desktop", width: 1280, height: 800 },
] as const;

for (const viewport of WIDTHS) {
  test(`2O-MOBILE-001: no public surface scrolls sideways at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const surface of PUBLIC_SURFACES) {
      await open(page, surface.path);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        // The widest element that actually exceeds the viewport, named — a bare
        // "it overflows" sends the next reader to bisect the stylesheet by hand.
        culprit: [...document.querySelectorAll("body *")]
          .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .slice(0, 3)
          .map((element) => `${element.tagName.toLowerCase()}.${element.className || "—"}`),
      }));
      expect(
        overflow.scrollWidth,
        `${surface.name} overflows by ${overflow.scrollWidth - overflow.clientWidth}px — ${overflow.culprit.join(", ")}`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  });
}

test("2O-MOBILE-001: the surfaces reflow at 200% zoom rather than scrolling sideways", async ({ page }) => {
  // WCAG 1.4.10 in the form a browser can be asked about: 320 CSS pixels at
  // 200% is the same layout question as a 640px window, and a fixed-width card
  // fails it while passing every fixed-viewport check above.
  await page.setViewportSize({ width: 640, height: 720 });
  for (const surface of PUBLIC_SURFACES) {
    await open(page, surface.path);
    await page.evaluate(() => {
      document.documentElement.style.zoom = "200%";
    });
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(scrolls, `${surface.name} scrolls sideways at 200% zoom`).toBe(false);
  }
});

/* -------------------------------------------------------------------------- *
 * `2O-MOBILE-002` — 44 CSS pixels, measured rather than asserted.
 * -------------------------------------------------------------------------- */

/**
 * The two surfaces this assertion may not repair, and why the list is not an
 * exemption.
 *
 * `2O-MOBILE-002`'s subject is *every interactive target **this phase creates
 * or changes***, and `git diff 57beb06..` shows Phase 2O touched neither
 * `src/features/legal/` nor the `legal/*` routes: they shipped with Signup
 * Hardening and this phase only **links to** them from the consent record.
 *
 * **ADR-116 Decision 2 is what makes this binding rather than convenient.**
 * `OD-2O-11` admits exactly two residuals, and the implementation plan states
 * that `2O-MOBILE-003` *"is the one place the phase changes a surface it did
 * not create"*. Repairing these two links would be a second place — a real
 * improvement taken without a signature, which is the shape this phase has
 * refused six times already.
 *
 * They stay **in** the axe, contrast and reflow coverage above, because those
 * assertions cost nothing to satisfy and would catch a regression this phase
 * did cause. Only the geometric repair is withheld.
 */
const TARGET_EXCEPTIONS = [
  {
    surface: "terms (pt-BR)",
    reason: "legal/* predates Phase 2O; ADR-116 Decision 2 spends the phase's one licence on 2O-MOBILE-003",
    destination: "a named residual in the 2O.7 acceptance record, for the owner",
  },
  {
    surface: "privacy (en)",
    reason: "same document family, same reason",
    destination: "a named residual in the 2O.7 acceptance record, for the owner",
  },
] as const;

test("2O-MOBILE-002: every interactive target is at least 44×44 CSS pixels at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  for (const surface of PUBLIC_SURFACES.filter(
    (candidate) => !TARGET_EXCEPTIONS.some((exception) => exception.surface === candidate.name),
  )) {
    await open(page, surface.path);
    const undersized = await page.evaluate(() => {
      const targets = [...document.querySelectorAll("a[href], button, input, select, textarea, [role='button']")];
      return targets
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const box = element.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) return false;
          // An inline link inside a running paragraph is exempt by WCAG 2.5.8's
          // own "inline" exception: it is sized by the text around it, and
          // padding it to 44px would break the line box it lives in. Recognised
          // structurally — the element is `inline` and has a text sibling —
          // rather than by an allowlist of hrefs.
          const inlineInProse =
            style.display === "inline" &&
            element.parentElement !== null &&
            (element.parentElement.textContent ?? "").trim() !== (element.textContent ?? "").trim();
          if (inlineInProse) return false;
          return box.height < 44 || box.width < 44;
        })
        .slice(0, 6)
        .map((element) => {
          const box = element.getBoundingClientRect();
          const label = (element.textContent ?? "").trim().slice(0, 30) || element.getAttribute("aria-label") || "";
          return `${element.tagName.toLowerCase()}.${element.className || "—"} "${label}" ${Math.round(box.width)}×${Math.round(box.height)}`;
        });
    });
    expect(undersized, `${surface.name} renders targets below 44px: ${undersized.join(" · ")}`).toEqual([]);
  }
});

test("2O-MOBILE-002: every withheld surface still needs its exception", async ({ page }) => {
  /*
    The liveness check §84 named. An exception nobody re-derives is a permission
    that outlives its reason: someone repairs the surface for an unrelated
    motive, the entry stays, and the next reader inherits a list of holes with
    no way to tell which are still holes.

    This asserts the finding **still reproduces**. When it stops, this test
    fails and the exception has to be deleted rather than carried — and the
    assertion above starts covering the surface on the same commit.
  */
  await page.setViewportSize({ width: 375, height: 812 });

  for (const exception of TARGET_EXCEPTIONS) {
    const surface = PUBLIC_SURFACES.find((candidate) => candidate.name === exception.surface);
    expect(surface, `the exception names \`${exception.surface}\`, which this lane does not visit`).toBeDefined();

    await open(page, surface!.path);
    const undersized = await page.evaluate(
      () =>
        [...document.querySelectorAll("a[href], button")].filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const box = element.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) return false;
          const inlineInProse =
            style.display === "inline" &&
            element.parentElement !== null &&
            (element.parentElement.textContent ?? "").trim() !== (element.textContent ?? "").trim();
          return !inlineInProse && (box.height < 44 || box.width < 44);
        }).length,
    );
    expect(
      undersized,
      `${exception.surface} now meets 44px, so its exception is stale — delete it and let the assertion above cover the surface. Reason recorded: ${exception.reason}`,
    ).toBeGreaterThan(0);
  }
});

/* -------------------------------------------------------------------------- *
 * `2O-ACCESS-001` — axe, light and dark, with the control the requirement names.
 * -------------------------------------------------------------------------- */

for (const surface of PUBLIC_SURFACES) {
  test(`2O-ACCESS-001: ${surface.name} has no serious or critical axe violation in light`, async ({ page }) => {
    await open(page, surface.path, "light");
    // The control, before the scan rather than after it. A run that silently
    // rendered dark would otherwise report a clean dark page as a clean light
    // one, and the requirement's two runs would be one run twice.
    expect(await canvasLuminance(page), `${surface.name} did not render a light canvas`).toBeGreaterThan(0.7);
    expect(await axeViolations(page)).toEqual([]);
  });

  test(`2O-ACCESS-001: ${surface.name} has no serious or critical axe violation in dark`, async ({ page }) => {
    await open(page, surface.path, "dark");
    expect(await canvasLuminance(page), `${surface.name} did not render a dark canvas`).toBeLessThan(0.3);
    expect(await axeViolations(page)).toEqual([]);
  });
}

test("2O-ACCESS-001: the dark control can fail, so a light run cannot pass as a dark one", async ({ page }) => {
  // The control's own control. `canvasLuminance` returning a constant, or
  // reading a transparent body and defaulting, would make every dark assertion
  // above pass over a light page — which is the exact vacuity `2O-ACCESS-001`
  // names. The two readings are taken from one route and must disagree.
  await open(page, "/pt-BR", "light");
  const light = await canvasLuminance(page);
  await page.context().clearCookies();
  await open(page, "/pt-BR", "dark");
  const dark = await canvasLuminance(page);
  expect(light, "light and dark rendered the same canvas").toBeGreaterThan(dark + 0.4);
});

/* -------------------------------------------------------------------------- *
 * `2O-ACCESS-002` — an accessible name, a focus indicator, a keyboard path.
 * -------------------------------------------------------------------------- */

test("2O-ACCESS-002: every control on every public surface has an accessible name", async ({ page }) => {
  for (const surface of PUBLIC_SURFACES) {
    await open(page, surface.path);
    // Computed by axe rather than guessed from the DOM: `aria-labelledby`, a
    // wrapping `<label>`, `title` and the element's own text are four different
    // sources and a hand-rolled check gets one of them wrong.
    await page.addScriptTag({ path: AXE_PATH });
    const nameless = await page.evaluate(async () => {
      // @ts-expect-error injected by addScriptTag
      const results = await window.axe.run(document, {
        resultTypes: ["violations"],
        runOnly: ["button-name", "link-name", "input-button-name", "label", "select-name", "aria-input-field-name"],
      });
      return (results.violations as Array<{ id: string; nodes: unknown[] }>).map(
        (violation) => `${violation.id} ×${violation.nodes.length}`,
      );
    });
    expect(nameless, `${surface.name} renders controls with no accessible name`).toEqual([]);
  }
});

test("2O-ACCESS-002: every focusable control paints a visible focus indicator", async ({ page }) => {
  for (const surface of PUBLIC_SURFACES) {
    await open(page, surface.path);
    const invisible = await page.evaluate(() => {
      const focusable = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea")].filter(
        (element) => element.offsetParent !== null,
      );
      const failures: string[] = [];
      for (const element of focusable.slice(0, 25)) {
        element.focus();
        const style = getComputedStyle(element);
        const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
        const ring = style.boxShadow !== "none";
        // A border change alone is deliberately not accepted: it moves layout
        // and is what the redesign replaced.
        if (!outline && !ring) failures.push(`${element.tagName.toLowerCase()}.${element.className || "—"}`);
      }
      return failures;
    });
    expect(invisible, `${surface.name} focuses controls with no visible indicator`).toEqual([]);
  }
});

test("2O-ACCESS-002: the login form is completable from the keyboard alone", async ({ page }) => {
  await open(page, "/pt-BR/auth/login");
  // Tab order, not merely reachability. A control reachable only after twenty
  // presses through a hidden region is reachable and unusable, so the order is
  // asserted as the visual one.
  const reached: string[] = [];
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press("Tab");
    reached.push(
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body) return "";
        return `${active.tagName.toLowerCase()}:${active.getAttribute("name") ?? active.getAttribute("type") ?? ""}`;
      }),
    );
  }
  expect(reached.some((entry) => entry.includes("email"))).toBe(true);
  expect(reached.some((entry) => entry.includes("password"))).toBe(true);
  expect(reached.filter((entry) => entry.startsWith("button")).length).toBeGreaterThan(0);
});

/* -------------------------------------------------------------------------- *
 * `2O-ACCESS-003` — no meaning carried by colour alone.
 * -------------------------------------------------------------------------- */

test("2O-ACCESS-003: every status region states its meaning in words", async ({ page }) => {
  // The failure this catches is a tone that reads as an error only because it
  // is red. Asserted over the live regions the phase's surfaces use, because a
  // region with no text is the shape that can only be understood by colour.
  for (const surface of PUBLIC_SURFACES) {
    await open(page, surface.path);
    const silent = await page.evaluate(() =>
      [...document.querySelectorAll("[role='status'], [role='alert'], [data-tone], [data-status]")]
        .filter((element) => (element.textContent ?? "").trim().length === 0)
        .map((element) => `${element.tagName.toLowerCase()}.${element.className || "—"}`),
    );
    expect(silent, `${surface.name} carries a toned region with no words in it`).toEqual([]);
  }
});

/* -------------------------------------------------------------------------- *
 * `2O-ACCESS-005` — contrast on the rendered page, in both themes.
 * -------------------------------------------------------------------------- */

for (const theme of ["light", "dark"] as const) {
  test(`2O-ACCESS-005: text meets contrast on the rendered page in ${theme}`, async ({ page }) => {
    for (const surface of PUBLIC_SURFACES) {
      await open(page, surface.path, theme);
      await page.addScriptTag({ path: AXE_PATH });
      const failures = await page.evaluate(async () => {
        // @ts-expect-error injected by addScriptTag
        const results = await window.axe.run(document, {
          resultTypes: ["violations"],
          runOnly: ["color-contrast"],
        });
        return (results.violations as Array<{ nodes: Array<{ target: unknown; failureSummary?: string }> }>).flatMap(
          (violation) => violation.nodes.slice(0, 4).map((node) => `${String(node.target)} — ${node.failureSummary ?? ""}`),
        );
      });
      expect(failures, `${surface.name} fails contrast in ${theme}`).toEqual([]);
    }
  });
}

/* -------------------------------------------------------------------------- *
 * The browser chrome — the residual slices 2O.3 and 2O.4 both routed here.
 * -------------------------------------------------------------------------- */

test.describe("the browser chrome follows the appearance choice, not only the machine", () => {
  const ownedThemeColor = (page: Page) =>
    page.evaluate(() => {
      const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
      const owned = document.querySelector('meta[name="theme-color"][data-appearance-theme-color]');
      return {
        content: owned?.getAttribute("content") ?? null,
        hasMedia: owned?.hasAttribute("media") ?? null,
        first: metas.length > 0 && metas[0] === owned,
        total: metas.length,
      };
    });

  test("an explicit light choice on a dark machine states the light colour first", async ({ page }) => {
    // The divergence, in the exact configuration that produced it: the canvas
    // obeyed the choice and the status bar obeyed the operating system.
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, "/pt-BR", "light");
    expect(await canvasLuminance(page), "the canvas did not follow the explicit light choice").toBeGreaterThan(0.7);
    const meta = await ownedThemeColor(page);
    expect(meta.content, "no unconditional theme colour was stated").not.toBeNull();
    expect(meta.hasMedia, "the override carries a media query, so the machine can still win").toBe(false);
    expect(meta.first, "the override is not the first theme-color, so an earlier tag wins").toBe(true);
  });

  test("an explicit dark choice on a light machine states the dark colour first", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, "/pt-BR", "dark");
    expect(await canvasLuminance(page)).toBeLessThan(0.3);
    const meta = await ownedThemeColor(page);
    expect(meta.content).not.toBeNull();
    expect(meta.first).toBe(true);
  });

  test("the two colours differ, so the override is not a constant", async ({ page }) => {
    // Without this, a bug that always stated the light colour would pass both
    // assertions above.
    await open(page, "/pt-BR", "light");
    const light = (await ownedThemeColor(page)).content;
    await open(page, "/pt-BR", "dark");
    const dark = (await ownedThemeColor(page)).content;
    expect(light).not.toBe(dark);
  });

  test("`system` adds nothing, and leaves the framework's two tags alone", async ({ page }) => {
    await open(page, "/pt-BR");
    const meta = await ownedThemeColor(page);
    expect(meta.content, "an override was added for a reader following the machine").toBeNull();
    expect(meta.total, "the framework's own two media-keyed tags are not what this touches").toBe(2);
  });

  test("adding the tag before hydration produces no React error", async ({ page }) => {
    // The risk this mechanism carries, asserted rather than reasoned about: the
    // script inserts a node into `<head>` that the server never rendered, and
    // React owns that subtree. A hydration mismatch would recover by
    // client-rendering — discarding the corrected DOM and reintroducing the
    // flash the whole pre-paint script exists to prevent.
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page, "/pt-BR", "dark");
    await page.waitForTimeout(1_500);
    expect(errors.filter((text) => /hydrat|did not match|Minified React error/i.test(text))).toEqual([]);
    // …and the tag survived hydration rather than being reconciled away.
    expect((await ownedThemeColor(page)).content).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- *
 * `2O-MOBILE-005` — the mobile lane can fail, proved by planting a divergence.
 * -------------------------------------------------------------------------- */

test("2O-MOBILE-005: the mobile project really is mobile, and a planted divergence fails it", async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  await open(page, "/pt-BR");

  const width = await page.evaluate(() => window.innerWidth);
  expect(width < 500, `the ${testInfo.project.name} project reported ${width}px`).toBe(mobile);

  // The planted divergence. A rule only a narrow viewport can violate is
  // injected, and the assertion that catches it is the same one every surface
  // above is measured by — so a lane that had silently stopped measuring
  // reports this as passing and fails here instead.
  await page.evaluate(() => {
    const rule = document.createElement("style");
    rule.textContent = "body::after{content:'';display:block;width:900px;height:1px}";
    document.head.append(rule);
  });
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows, `a 900px element did not overflow the ${testInfo.project.name} viewport`).toBe(mobile);
});
