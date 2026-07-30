/**
 * Layout contracts — the regression guard for the Slice A responsive defects.
 *
 * These assertions need a real layout engine. A jsdom component test cannot see
 * that a grid's `auto` track starved its `1fr` sibling, or that a flex item's
 * `order` put the capture button in the wrong slot, so every defect this file
 * guards shipped green under the existing unit suite.
 *
 * The page under test is composed from the repository's **real** stylesheets and
 * the **exact** DOM the components emit, rather than from the authenticated app:
 * the app's routes are behind `src/proxy.ts` and need a Supabase session, which
 * CI does not have. Keeping the markup here in sync with the components is the
 * cost of that, so each builder cites the source it mirrors.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ROOT = join(__dirname, "..");

/**
 * Every stylesheet `src/app/layout.tsx` and `globals.css` pull in, minus the
 * Tailwind import — none of the markup below uses a Tailwind utility, and the
 * directive cannot be resolved without the build pipeline.
 */
const STYLESHEETS = [
  "globals.css",
  "operations.css",
  "chat.css",
  "agent.css",
  "settings-extended.css",
  "timelines.css",
  "files.css",
  "costs.css",
  "task-commands.css",
  "mobile-navigation.css",
  "pagination.css",
] as const;

const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");

/** A title long enough that any container narrower than ~250px must wrap it. */
const LONG_TITLE =
  "Revisar o contrato de prestação de serviços da Aurora Participações antes da reunião de quinta";

const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"></svg>';

/** Mirrors `src/features/shell/navigation-links.tsx` — primary keys, capture, then groups. */
const PRIMARY = ["Início", "Caixa", "Trabalho", "Brain"] as const;
const GROUPS = [
  ["Contexto", ["Projetos", "Pessoas", "Memórias", "Arquivos"]],
  ["Reflexão", ["Revisões", "Perguntas pendentes"]],
  ["Organização", ["Lembretes"]],
  ["Transparência", ["Histórico", "Custos de IA"]],
  ["Preferências", ["Configurações"]],
] as const;

function navLink(label: string, className = "nav-item") {
  return `<a class="${className}" href="#">${ICON}<span>${label}</span></a>`;
}

function sideNav() {
  const primary = PRIMARY.map((label) => navLink(label)).join("");
  const groups = GROUPS.map(
    ([label, items]) =>
      `<div class="nav-group" role="group" aria-label="${label}"><span class="nav-group-label" aria-hidden="true">${label}</span><div class="nav-group-items">${items
        .map((item) => navLink(item))
        .join("")}</div></div>`,
  ).join("");
  return `<div class="nav-group nav-group-primary" role="group" aria-label="Principal"><div class="nav-group-items">${primary}</div></div>${navLink("Captura rápida", "capture-fab")}${groups}`;
}

/**
 * Mirrors the mobile branch of `navigation-links.tsx:145-176`: the first two
 * primary keys, the capture link, the remaining primary keys, then `Mais`.
 */
function bottomNav() {
  const head = PRIMARY.slice(0, 2).map((label) => navLink(label, "mobile-primary-link")).join("");
  const tail = PRIMARY.slice(2).map((label) => navLink(label, "mobile-primary-link")).join("");
  const groups = GROUPS.map(
    ([label, items]) =>
      `<div class="mobile-nav-group" role="group" aria-label="${label}"><span class="mobile-nav-group-label" aria-hidden="true">${label}</span><div class="nav-group-items">${items
        .map((item) => navLink(item))
        .join("")}</div></div>`,
  ).join("");
  return `${head}${navLink("Captura rápida", "capture-fab")}${tail}<details class="mobile-more"><summary aria-label="Mais">${ICON}<span>Mais</span></summary><div class="mobile-more-menu">${groups}</div></details>`;
}

/** Mirrors `src/features/daily-cycle/needs-attention-item.tsx`. */
function attentionRow(title: string) {
  return `<a href="#" class="list-row needs-attention-row"><div class="list-row-main"><strong>${title}</strong><p>O Brain entendeu isso como uma decisão, mas não teve confiança suficiente.</p></div><div class="list-meta"><span>29/07/2026, 11:32</span><span class="needs-attention-action-hint">Corrigir interpretação</span></div></a>`;
}

/** Mirrors `src/features/daily-cycle/inbox-item.tsx`. */
function inboxRow(title: string) {
  return `<a href="#" class="list-row"><div class="list-row-main"><strong>${title}</strong><p>Preciso revisar o contrato da Aurora antes da reunião.</p></div><div class="list-meta"><span>29/07/2026, 11:32</span><span class="list-attention-hint">Revise a interpretação</span><span class="status-badge needs_attention">precisa de você</span></div></a>`;
}

/** Mirrors the panel markup in `src/features/shell/home-dashboard.tsx:53-62`. */
function homeBody() {
  return `<div class="dashboard">
    <section class="hero"><p class="eyebrow">QUINTA-FEIRA, 30 DE JULHO</p><h1>Boa tarde.<br><span>O que merece sua atenção agora?</span></h1></section>
    <section class="dashboard-grid">
      <article class="panel priority-panel"><header><div><h2>Prioridades de hoje</h2></div><span class="count">2</span></header><div class="dashboard-task-list"><a class="dashboard-task" href="#"><strong>${LONG_TITLE}</strong><span>31 jul.</span></a></div></article>
      <article class="panel attention-panel" data-testid="attention-panel"><header><div><h2>Precisa de você</h2></div><span class="count attention-count">2</span></header><div class="dashboard-recent-list">${attentionRow(LONG_TITLE)}</div></article>
      <article class="panel recent-panel" data-testid="recent-panel"><header><div><h2>Atividade recente</h2></div></header><div class="dashboard-recent-list">${inboxRow(LONG_TITLE)}</div></article>
    </section>
  </div>`;
}

/** Mirrors the full-width list on `/app/inbox` and `/app/work`. */
function listBody() {
  return `<div class="content-page"><header class="list-header"><div><h1>Registros</h1></div></header><div class="list-stack">${inboxRow(LONG_TITLE)}</div></div>`;
}

function document_(body: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--font-manrope:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-jetbrains:ui-monospace,monospace}
${css}
</style></head><body><div class="app-frame">
<aside class="side-rail"><a href="#" class="brand"><span class="brand-mark">B</span><span>My Brain</span></a><nav aria-label="Navegação principal" class="side-nav">${sideNav()}</nav></aside>
<div class="main-stage"><header class="top-bar"><div class="top-actions"><a href="#">EN</a></div></header><main>${body}</main></div>
<nav aria-label="Navegação móvel" class="bottom-nav">${bottomNav()}</nav>
</div></body></html>`;
}

async function render(page: Page, body: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.setContent(document_(body));
  await page.waitForTimeout(60);
}

/** Characters per rendered line of a row title — the readability measure. */
async function titleDensity(page: Page, rowSelector: string) {
  return page.evaluate((selector) => {
    const strong = document.querySelector(`${selector} .list-row-main strong`);
    if (!strong) throw new Error(`no title found for ${selector}`);
    const style = getComputedStyle(strong);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    const lines = Math.max(1, Math.round(strong.getBoundingClientRect().height / lineHeight));
    const row = document.querySelector(selector)!;
    const main = row.querySelector(".list-row-main")!;
    return {
      lines,
      chars: (strong.textContent ?? "").length,
      charsPerLine: (strong.textContent ?? "").length / lines,
      rowWidth: Math.round(row.getBoundingClientRect().width),
      mainWidth: Math.round(main.getBoundingClientRect().width),
    };
  }, rowSelector);
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "375x667", width: 375, height: 667 },
  { name: "412x915", width: 412, height: 915 },
] as const;

/**
 * The readability floor. Below roughly this density a wrapped title reads as one
 * word per line, which is the defect the owner reported: at 1920 the "Precisa de
 * você" title measured 5.9 characters per line across 16 lines.
 */
const MIN_CHARS_PER_LINE = 24;

test.describe("row titles stay readable in every container", () => {
  for (const viewport of VIEWPORTS) {
    test(`home panels do not starve the title at ${viewport.name}`, async ({ page }) => {
      await render(page, homeBody(), viewport.width, viewport.height);

      for (const panel of ['[data-testid="attention-panel"]', '[data-testid="recent-panel"]']) {
        const measured = await titleDensity(page, `${panel} .list-row`);
        expect(
          measured.charsPerLine,
          `${panel} at ${viewport.name}: ${measured.chars} chars on ${measured.lines} lines in a ${measured.mainWidth}px column`,
        ).toBeGreaterThanOrEqual(MIN_CHARS_PER_LINE);
      }
    });
  }

  test("the full-width list keeps its title on one or two lines at 1440x900", async ({ page }) => {
    await render(page, listBody(), 1440, 900);
    const measured = await titleDensity(page, ".list-stack .list-row");
    expect(measured.lines).toBeLessThanOrEqual(2);
  });
});

test("usable content width never shrinks as the viewport grows", async ({ page }) => {
  const widths: { viewport: string; content: number }[] = [];
  for (const viewport of VIEWPORTS) {
    await render(page, homeBody(), viewport.width, viewport.height);
    const content = await page.evaluate(() =>
      Math.round(document.querySelector(".dashboard-grid")!.getBoundingClientRect().width),
    );
    widths.push({ viewport: viewport.name, content });
  }

  const desktop = widths.filter((entry) => entry.viewport.startsWith("1"));
  const wide = desktop.find((entry) => entry.viewport === "1920x1080")!;
  const narrow = desktop.find((entry) => entry.viewport === "1440x900")!;
  expect(
    wide.content,
    `1920 gave ${wide.content}px of content where 1440 gave ${narrow.content}px`,
  ).toBeGreaterThanOrEqual(narrow.content);
});

/*
 * UX-17 (the rail clipping `Configurações` at 1440x900) is deliberately **not**
 * guarded here. This document substitutes system fonts for Manrope, which makes
 * the rail measurably shorter, so an assertion would pass without the defect
 * being fixed — worse than no assertion. It is verified by screenshot against the
 * real fonts, and it is Slice B's to fix, since the real remedy is rendering
 * fewer destinations rather than making the overflow prettier.
 */

test.describe("mobile bottom navigation", () => {
  for (const viewport of VIEWPORTS.filter((entry) => entry.width <= 412)) {
    test(`capture stays centred and in source order at ${viewport.name}`, async ({ page }) => {
      await render(page, homeBody(), viewport.width, viewport.height);

      const measured = await page.evaluate(() => {
        const nav = document.querySelector(".bottom-nav")!;
        const items = [...nav.children].map((element) => {
          const rect = element.getBoundingClientRect();
          return { label: (element.textContent ?? "").trim().split(/\s+/)[0], left: rect.left, right: rect.right };
        });
        const fab = nav.querySelector(".capture-fab")!.getBoundingClientRect();
        return {
          domOrder: items.map((item) => item.label),
          visualOrder: [...items].sort((a, b) => a.left - b.left).map((item) => item.label),
          fabCentre: (fab.left + fab.right) / 2,
          viewportCentre: window.innerWidth / 2,
        };
      });

      expect(measured.visualOrder, "flex order rearranged the navigation").toEqual(measured.domOrder);
      // The middle third rather than dead centre: with six slots the capture link
      // sits third, and no distribution can put slot 3 of 6 exactly on the centre
      // line. Making it exact means changing how many primary destinations the bar
      // carries, which is Slice B's decision, not a stylesheet's.
      const viewportWidth = measured.viewportCentre * 2;
      expect(
        measured.fabCentre,
        `capture button sits ${Math.round(measured.fabCentre)}px into a ${viewportWidth}px bar`,
      ).toBeGreaterThan(viewportWidth / 3);
      expect(measured.fabCentre).toBeLessThan((viewportWidth * 2) / 3);
    });
  }

  test("the bar reserves the device safe area", async ({ page }) => {
    await render(page, homeBody(), 375, 667);
    const declared = await page.evaluate(() => {
      const sheet = [...document.styleSheets][0] as CSSStyleSheet;
      const rules = [...sheet.cssRules].flatMap((rule) =>
        rule instanceof CSSMediaRule ? [...rule.cssRules] : [rule],
      );
      return rules
        .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.includes(".bottom-nav"))
        .map((rule) => rule.style.getPropertyValue("padding-bottom") || rule.style.padding)
        .filter(Boolean);
    });
    expect(
      declared.some((value) => value.includes("safe-area-inset-bottom")),
      "no .bottom-nav rule reserves env(safe-area-inset-bottom)",
    ).toBe(true);
  });
});

test("no surface scrolls horizontally", async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    for (const body of [homeBody(), listBody()]) {
      await render(page, body, viewport.width, viewport.height);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(
        overflow.clientWidth + 1,
      );
    }
  }
});
