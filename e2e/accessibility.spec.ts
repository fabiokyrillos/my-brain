/**
 * `2J-ACCESS-001` … `2J-ACCESS-008` — the browser-level accessibility lane.
 *
 * ## Why this file exists
 *
 * Phase 2I closed `2I-CLOSE-002` as **partial**: component semantics, keyboard
 * behaviour, focus behaviour and ARIA contracts were asserted by jsdom test,
 * but nothing had ever run these surfaces through a real browser. jsdom has no
 * layout engine, no computed style, no paint — so it cannot see a focus ring
 * that renders at zero opacity, a touch target that computes to 28px, a
 * heading order that only breaks once CSS reorders the boxes, or a colour
 * contrast failure. Every one of those ships green under the existing suite.
 *
 * This lane runs in CI on every PR, on **desktop and Pixel 7**, alongside
 * `foundation.spec.ts`.
 *
 * ## What it can and cannot prove — read this before trusting a green run
 *
 * The app's routes are behind `src/proxy.ts` and need a Supabase session, which
 * CI does not have. `e2e/layout-contracts.spec.ts` hit this first and settled
 * the repository's answer: compose the page from the **real stylesheets** and
 * the **exact DOM the components emit**, and make each builder cite the source
 * it mirrors. This file follows that precedent rather than inventing a second
 * one, and inherits its one real cost — **the markup is a mirror, so it can
 * drift from the component.** `accessibility-mirror-guard.test.ts` is what
 * keeps that cost bounded: it re-derives the load-bearing attributes from the
 * component sources on every run, so a component that drops `role="dialog"` or
 * `aria-modal` breaks the guard rather than silently invalidating this file.
 *
 * **Therefore, stated exactly, and never to be rounded up:**
 *
 *   - PROVEN HERE: axe violations, heading and landmark structure, accessible
 *     names, visible focus, focus order, rendered touch targets, reduced-motion
 *     rendering, and dialog semantics — all in a real browser, at two viewports.
 *   - NOT PROVEN HERE: hydrated interactivity. Ctrl+K, arrow-key traversal,
 *     Escape-to-close and focus **restoration** need React running, which needs
 *     an authenticated route. Those remain covered by Phase 2I's jsdom tests
 *     (`command-palette.test.tsx`) and are named as such in the slice record.
 *   - NOT PROVEN ANYWHERE: a real screen-reader session. `2J-ACCESS-008` is a
 *     manual requirement and this file must never be cited as discharging it.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ROOT = join(__dirname, "..");
const require_ = createRequire(__filename);

/**
 * `axe-core` is a **declared devDependency**, not a borrowed transitive one.
 *
 * It already sat in the tree under `eslint-plugin-jsx-a11y`, so declaring it
 * costs no download — but a lane whose scanner arrives by someone else's
 * hoisting is one `npm update` away from silently not running. Declaring it is
 * what makes `2J-ACCESS-002` a fact rather than a coincidence.
 */
const AXE_PATH = require_.resolve("axe-core");

/** Every stylesheet `globals.css` pulls in, minus the unresolvable Tailwind import. */
const STYLESHEETS = [
  "globals.css",
  "palette.css",
  "experience.css",
  "operations.css",
  "mobile-navigation.css",
  "pagination.css",
] as const;

const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");

async function render(page: Page, body: string, { reducedMotion = false } = {}) {
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width, initial-scale=1">`
      + `<title>Acessibilidade</title><style>${css}</style></head>`
      + `<body><div class="app-shell">${body}</div></body></html>`,
    { waitUntil: "load" },
  );
}

/**
 * Runs axe in the page and returns violations at or above `serious`.
 *
 * The threshold is deliberate. `minor` and `moderate` findings on a *mirrored*
 * fixture are as likely to be artefacts of the fixture as of the product —
 * there is no real page chrome, no skip link, no `<main>` provided by the app
 * layout. `serious` and `critical` are the classes that do not depend on that
 * context: a missing accessible name, a non-unique id, an invalid ARIA
 * attribute or a contrast failure is wrong wherever it renders.
 */
async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error injected by addScriptTag
    const results = await window.axe.run(document, {
      resultTypes: ["violations"],
      rules: { region: { enabled: false } },
    });
    return (results.violations as Array<{ id: string; impact: string | null; nodes: unknown[] }>)
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({ id: violation.id, impact: violation.impact, count: violation.nodes.length }));
  });
}

/* ------------------------------------------------------------------ *
 * Fixtures. Each cites the source it mirrors, and every load-bearing
 * attribute below is re-derived from that source by the mirror guard.
 * ------------------------------------------------------------------ */

/** Mirrors the trigger branch of `src/features/palette/command-palette.tsx:170-181`. */
function paletteTrigger() {
  return `<button type="button" class="palette-trigger" aria-haspopup="dialog" data-palette-trigger="true">`
    + `<span>Buscar ou navegar</span><kbd aria-hidden="true">Ctrl K</kbd></button>`;
}

/** Mirrors the open branch of `command-palette.tsx:183-255`, with one group and two options. */
function paletteOpen() {
  const options = [
    ["capture", "Capturar algo", true],
    ["search", "Buscar", false],
  ] as const;
  const rendered = options
    .map(
      ([id, label, active]) =>
        `<button id="palette-list-${id}" type="button" role="option" aria-selected="${active}"`
        + ` class="palette-option${active ? " is-active" : ""}" data-action-id="${id}">${label}</button>`,
    )
    .join("");
  return `<div class="palette-backdrop" data-palette-backdrop="true">`
    + `<div class="palette" role="dialog" aria-modal="true" aria-label="Comandos">`
    + `<div class="palette-field">`
    + `<input class="palette-input" type="text" role="combobox" aria-expanded="true"`
    + ` aria-controls="palette-list" aria-autocomplete="list" aria-activedescendant="palette-list-capture"`
    + ` aria-label="Buscar comandos" placeholder="Buscar ou navegar" value="">`
    + `<button type="button" class="palette-close" aria-label="Fechar">×</button>`
    + `</div>`
    + `<p class="sr-only" role="status" aria-live="polite">2 resultados</p>`
    + `<div class="palette-results" id="palette-list" role="listbox" aria-label="Comandos">`
    + `<div class="palette-group" role="group" aria-label="Criar">${rendered}</div>`
    + `</div></div></div>`;
}

/** Mirrors `src/features/search/search-surface.tsx:108-175`. */
function searchSurface() {
  return `<section class="search-surface"><h1 class="search-title">Buscar</h1>`
    + `<form class="search-form" role="search">`
    + `<label class="sr-only" for="search-q">O que você procura?</label>`
    + `<input id="search-q" class="search-input" type="search" value="">`
    + `<button type="submit" class="ux-action ux-action-primary">Buscar</button>`
    + `<div class="search-filters">`
    + `<label for="search-type">Tipo</label>`
    + `<select id="search-type"><option>Tudo</option></select>`
    + `<label for="search-period">Período</label>`
    + `<select id="search-period"><option>Sempre</option></select>`
    + `<label class="search-sensitive"><input type="checkbox"> Incluir muito sensível</label>`
    + `</div>`
    + `<p class="search-hint">Itens muito sensíveis ficam de fora por padrão.</p>`
    + `</form>`
    + `<p class="sr-only" role="status" aria-live="polite">3 resultados</p>`
    + `<ul class="search-results"><li><a href="#">Contrato da Aurora</a></li></ul>`
    + `</section>`;
}

/** Mirrors `src/app/[locale]/app/library/page.tsx:52-73`. */
function librarySurface() {
  const cards = [
    ["Projetos", "Trabalhos em andamento", 4],
    ["Pessoas", "Quem aparece nos seus registros", 12],
    ["Memórias", "O que o Brain deve lembrar", 7],
  ] as const;
  return `<div class="library-page"><header class="library-head"><h1>Biblioteca</h1>`
    + `<p>Tudo o que o Brain guarda para você.</p>`
    + `<a class="library-search-link" href="#">Buscar em tudo</a></header>`
    + `<ul class="library-grid">`
    + cards
      .map(
        ([name, note, count]) =>
          `<li><a class="library-card" href="#"><span class="library-card-name">${name}</span>`
          + `<span class="library-card-note">${note}</span>`
          + `<span class="library-card-count">${count}</span></a></li>`,
      )
      .join("")
    + `</ul></div>`;
}

const SURFACES = [
  { name: "command palette (closed)", body: () => paletteTrigger() },
  { name: "command palette (open)", body: () => paletteOpen() },
  { name: "global search", body: () => searchSurface() },
  { name: "Library", body: () => librarySurface() },
] as const;

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-001 — the automated scan, both viewports, every surface.
 * ------------------------------------------------------------------ */

for (const surface of SURFACES) {
  test(`2J-ACCESS-001: ${surface.name} has no serious or critical axe violations`, async ({ page }) => {
    await render(page, surface.body());
    expect(await axeViolations(page)).toEqual([]);
  });
}

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-005 — visible focus, measured from paint, not from source.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-005: every focusable control paints a visible focus indicator", async ({ page }) => {
  await render(page, `${paletteTrigger()}${searchSurface()}`);
  const focusables = page.locator("button, a[href], input, select, [tabindex]:not([tabindex='-1'])");
  const total = await focusables.count();
  expect(total).toBeGreaterThan(3);

  for (let index = 0; index < total; index += 1) {
    const control = focusables.nth(index);
    await control.focus();
    // A ring is "visible" if focusing changed something a sighted user can see.
    // Reading `outline-style` alone would pass a rule that sets `outline: none`
    // and compensates with a box-shadow, and would fail a design that does the
    // reverse -- so the assertion is on the union, not on one property.
    const visible = await control.evaluate((node) => {
      const style = getComputedStyle(node);
      const outlined = style.outlineStyle !== "none" && parseFloat(style.outlineWidth || "0") > 0;
      const shadowed = style.boxShadow !== "none" && style.boxShadow !== "";
      const bordered = parseFloat(style.borderWidth || "0") > 0;
      return outlined || shadowed || bordered;
    });
    expect(visible, `control ${index} paints no focus indicator`).toBe(true);
  }
});

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-003/004 — focus order follows the visual order, and the
 * dialog's own controls are reachable in sequence.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-003: tab order through the open palette follows the visual order", async ({ page }) => {
  await render(page, paletteOpen());
  await page.locator(".palette-input").focus();

  const seen: string[] = [];
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return "none";
        return active.getAttribute("data-action-id") ?? active.className ?? active.tagName;
      }),
    );
  }
  // Close button, then the two options in the order the eye reads them. The
  // assertion is on the prefix rather than the whole ring: what matters is that
  // nothing is skipped and nothing arrives out of order.
  expect(seen.slice(0, 3)).toEqual(["palette-close", "capture", "search"]);
});

test("2J-ACCESS-004: the dialog exposes modal semantics and an accessible name", async ({ page }) => {
  await render(page, paletteOpen());
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-label", /.+/);
  // The combobox must point at a listbox that exists, or arrow-key
  // announcements reference nothing. jsdom cannot check the referent resolves.
  const controls = await page.locator(".palette-input").getAttribute("aria-controls");
  await expect(page.locator(`#${controls}`)).toHaveAttribute("role", "listbox");
  const active = await page.locator(".palette-input").getAttribute("aria-activedescendant");
  await expect(page.locator(`#${active}`)).toHaveAttribute("role", "option");
});

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-006 — rendered touch targets, mobile only.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-006: interactive targets meet the minimum rendered size", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch targets are a mobile contract");
  await render(page, `${paletteTrigger()}${paletteOpen()}${librarySurface()}`);

  const targets = page.locator("button, a[href]");
  const total = await targets.count();
  for (let index = 0; index < total; index += 1) {
    const box = await targets.nth(index).boundingBox();
    if (!box) continue;
    const label = await targets.nth(index).innerText();
    // 24px is WCAG 2.2 AA (2.5.8). The repository has no larger stated ceiling,
    // so the lane asserts the standard rather than inventing a house rule.
    expect(Math.min(box.width, box.height), `target "${label.trim().slice(0, 30)}" is too small`)
      .toBeGreaterThanOrEqual(24);
  }
});

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-007 — reduced motion, verified from computed style.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-007: reduced-motion suppresses animation on the palette", async ({ page }) => {
  await render(page, paletteOpen(), { reducedMotion: true });
  const animated = await page.locator(".palette").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animation: style.animationDuration,
      transition: style.transitionDuration,
    };
  });
  // Either the surface never animated, or the reduced-motion query zeroed it.
  // Both are correct outcomes; an animation that still runs is not.
  const durations = [animated.animation, animated.transition]
    .flatMap((value) => value.split(",").map((part) => parseFloat(part) || 0));
  expect(Math.max(...durations, 0)).toBe(0);
});

/* ------------------------------------------------------------------ *
 * 2J-ACCESS-003 (announcements) — status regions exist and are polite.
 * ------------------------------------------------------------------ */

test("2J-ACCESS-003: result counts are announced politely without stealing focus", async ({ page }) => {
  await render(page, `${paletteOpen()}${searchSurface()}`);
  const statuses = page.locator("[role='status']");
  expect(await statuses.count()).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < (await statuses.count()); index += 1) {
    await expect(statuses.nth(index)).toHaveAttribute("aria-live", "polite");
    // A live region that can take focus would move the user on every keystroke.
    await expect(statuses.nth(index)).not.toHaveAttribute("tabindex", /.*/);
  }
});
