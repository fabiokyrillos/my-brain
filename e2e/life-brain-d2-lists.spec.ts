import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Life Brain D.2 — Memória and Notificações in a real browser (ADR-166).
 *
 * Fixture markup with the product's own stylesheets, mirroring
 * `brain-lens-scroller.tsx` + `brain-lenses.tsx`, `notification-bulk-bar.tsx`
 * and the open menu of `notification-row-actions.tsx`. With
 * `LIFE_BRAIN_EVIDENCE` set it writes the open menu (which the signed-in
 * instrument also captures) for side-by-side reading.
 */

const ROOT = join(__dirname, "..");
// Token sheets first (ADR-114).
const STYLESHEETS = ["tokens.css", "experience.css", "ui.css", "globals.css", "operations.css", "settings-extended.css", "brain.css", "mobile-navigation.css"] as const;
const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");
const FONT_STUB = ":root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}";
const EVIDENCE = process.env.LIFE_BRAIN_EVIDENCE?.trim() ?? "";

function shell(body: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main><div class="content-page">${body}</div></main></body></html>`;
}

const LENSES = ["Visão geral", "Conversar", "Pessoas", "Projetos", "Organizações", "Áreas da vida", "Memórias", "Arquivos", "Relações"];

/** What `BrainLensScroller` renders once it has measured: the end hides tabs. */
function lensStrip(start: boolean, end: boolean): string {
  return `<div class="brain-lenses-frame" data-overflow-start="${start}" data-overflow-end="${end}">`
    + `<nav aria-label="Lentes da Memória" class="brain-lenses">`
    + LENSES.map((label, index) => `<a class="brain-lens" href="#"${index === 2 ? ' aria-current="page"' : ""}>${label}</a>`).join("")
    + `</nav></div>`;
}

const GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Muda a tarefa", ["Concluir tarefa", "Reagendar tarefa"]],
  ["Só este aviso", ["Marcar aviso como lido", "Descartar aviso"]],
  ["Próximos avisos", ["Silenciar por um tempo", "Silenciar este assunto"]],
];

function openMenu(): string {
  const items = GROUPS.flatMap(([label, verbs]) => [
    `<li aria-hidden="true" class="notification-verb-group-label" role="none">${label}</li>`,
    ...verbs.map((verb, index) => `<li role="none"><button aria-describedby="m-${label}-${index}" class="notification-verb-menu-item" role="menuitem" tabindex="-1" type="button">${verb}</button><span class="notification-verb-meaning sr-only" id="m-${label}-${index}">Explicação longa do que isto muda e do que não muda.</span></li>`),
  ]).join("");
  return `<ul class="notification-list"><li class="notification-item" data-status="unread">`
    + `<span aria-hidden="true" class="notification-item-dot"></span>`
    + `<div class="notification-item-main"><p class="notification-item-title">Tarefa sem movimento</p>`
    + `<p class="notification-item-meta"><span class="notification-status-badge" data-status="unread">Não lida</span><span class="notification-item-time">24 de ago. de 2026, 12:00</span></p></div>`
    + `<div class="notification-item-trailing"><a class="row-action notification-open-link" href="#">Abrir</a>`
    + `<div class="notification-row-actions"><div class="notification-verb-menu">`
    + `<button aria-expanded="true" aria-haspopup="menu" class="row-action notification-menu-trigger notification-menu-trigger--icon" type="button">⋯</button>`
    + `<ul class="notification-verb-menu-list" role="menu">${items}</ul></div></div></div></li></ul>`;
}

function bulkBar(message = ""): string {
  return `<div aria-label="Todos os avisos" class="notification-bulk" role="group">`
    + `<div class="notification-bulk-verbs">`
    + `<form><button class="ui-button ui-button--secondary ui-button--sm" type="submit"><span class="ui-button__label">Marcar todos como lidos</span></button></form>`
    + `<form><button class="ui-button ui-button--ghost ui-button--sm" type="submit"><span class="ui-button__label">Limpar os lidos</span></button></form>`
    + `</div><div class="notification-bulk-outcome"><p aria-live="polite" class="notification-bulk-message" role="status">${message}</p>`
    + (message ? `<form><button class="ui-button ui-button--ghost ui-button--sm" type="submit"><span class="ui-button__label">Desfazer</span></button></form>` : "")
    + `</div></div>`;
}

test.describe("Life Brain D.2: the Memória strip says when it hides tabs", () => {
  test("at 390px the strip overflows, the hidden edge fades, and the scrollbar is visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(shell(lensStrip(false, true)), { waitUntil: "load" });
    const overflow = await page.locator(".brain-lenses").evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow, "the strip does not overflow at 390px, so this test proves nothing").toBeGreaterThan(20);
    const fades = await page.locator(".brain-lenses-frame").evaluate((node) => ({
      before: getComputedStyle(node, "::before").opacity,
      after: getComputedStyle(node, "::after").opacity,
    }));
    expect(fades).toEqual({ before: "0", after: "1" });
    const scrollbar = await page.locator(".brain-lenses").evaluate((node) => getComputedStyle(node).scrollbarWidth);
    expect(scrollbar).not.toBe("none");
    const page2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(page2).toBeLessThanOrEqual(1);
  });

  test("the fade never takes a tap from the tab under it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(shell(lensStrip(true, true)), { waitUntil: "load" });
    const pointer = await page.locator(".brain-lenses-frame").evaluate((node) => getComputedStyle(node, "::after").pointerEvents);
    expect(pointer).toBe("none");
  });
});

test.describe("Life Brain D.2: a notice's menu is short", () => {
  for (const width of [390, 1440]) {
    test(`six items under three labels, no paragraph, 44px rows, inside the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(shell(openMenu()), { waitUntil: "load" });
      const menu = page.locator(".notification-verb-menu-list");
      const box = await menu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      // Six rows of 44 plus three short labels: well under the old menu, which
      // ran past the bottom bar on an iPhone.
      expect(box!.height).toBeLessThanOrEqual(420);
      const heights = await page.locator(".notification-verb-menu-item").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
      const meanings = await page.locator(".notification-verb-meaning").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      expect(Math.max(...meanings)).toBeLessThanOrEqual(1);
      if (EVIDENCE && width === 390) {
        mkdirSync(EVIDENCE, { recursive: true });
        await page.screenshot({ path: `${EVIDENCE}/fixture-notice-menu-iphone-390.png` });
      }
    });
  }
});

test.describe("Life Brain D.2: the bulk verbs", () => {
  test("fit a 320px phone with the undo beside the outcome", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.setContent(shell(bulkBar("18 avisos marcados como lidos.")), { waitUntil: "load" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("status")).toHaveText("18 avisos marcados como lidos.");
    await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
  });

  test("before anything happens, the live region takes no room and is still in the tree", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(shell(bulkBar()), { waitUntil: "load" });
    const region = page.getByRole("status");
    await expect(region).toHaveCount(1);
    expect(await region.evaluate((node) => getComputedStyle(node).display)).not.toBe("none");
  });
});
