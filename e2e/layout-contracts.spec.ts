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
  // First, and load-bearing: since ADR-114 the palette and every measure live
  // here, so a fixture without it renders unstyled and every geometry assertion
  // below measures the wrong thing.
  "tokens.css",
  "experience.css",
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

/**
 * Mirrors `src/features/shell/navigation-links.tsx` — primary keys, capture,
 * then groups.
 *
 * **This mirror had gone stale, and the stale copy still passed.** The redesign
 * promoted Brain to the fourth destination and moved Conversar into the context
 * group; this list still read `Conversar`, and the bar below still claimed
 * Registros was demoted. Both fixtures had the right *shape* — four rail items,
 * five bar slots with capture in the middle — so every geometric assertion in
 * this file kept passing while measuring navigation the product no longer
 * renders. `shell-mirror-guard.test.ts` now derives both from `capabilities.ts`
 * and fails when they diverge.
 */
const PRIMARY = ["Hoje", "Registros", "Trabalho", "Brain"] as const;
/**
 * The mobile bar, mirroring `mobileBarSlots` (UX-14, DEC-1).
 *
 * Five slots with capture in the middle. Registros returned to the bar with the
 * redesign; Brain is the destination that sits in `Mais` instead, which
 * `mobileDemotedKeys` derives rather than lists.
 */
const MOBILE_BAR = ["Hoje", "Registros", "Captura rápida", "Trabalho", "Brain"] as const;
/*
 * The overflow disclosure's five groups.
 *
 * **This list was stale by six destinations.** It carried four context members
 * where the product renders eight, missed Conversar, Empresas, Contextos and
 * Relações entirely, and had Organização holding only Lembretes when Calendário
 * had joined it in Phase 2M. Every assertion over the panel was therefore
 * measuring a navigation the product does not render — the same failure the
 * `PRIMARY` and `MOBILE_BAR` lists had, found and fixed one commit before this
 * one, by a guard that only covered those two.
 *
 * `shell-mirror-guard.test.ts` now derives this one from `capabilities.ts` and
 * `messages.ts` too, with a planted-divergence control per group.
 */
const GROUPS = [
  ["Contexto", ["Conversar", "Projetos", "Pessoas", "Empresas", "Contextos", "Memórias", "Arquivos", "Relações"]],
  ["Reflexão", ["Revisões", "Perguntas pendentes"]],
  ["Organização", ["Calendário", "Lembretes"]],
  ["Transparência", ["Histórico", "Custos de IA"]],
  ["Preferências", ["Configurações"]],
] as const;

/**
 * Mirrors `navLink` in `navigation-links.tsx`, including the thing this fixture
 * never emitted: `aria-current="page"` on the destination you are standing in,
 * and the `active` class beside it.
 *
 * Its absence meant the lane had **no** way to check the active state — a bar
 * that marked every slot, or none, would have rendered identically here. The
 * fixture composes Hoje, so Hoje is the current destination.
 */
const CURRENT = "Hoje";

function navLink(label: string, className = "nav-item") {
  const active = label === CURRENT;
  const current = active ? ` aria-current="page"` : "";
  return `<a class="${className}${active ? " active" : ""}"${current} href="#">${ICON}<span>${label}</span></a>`;
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
 * Mirrors the mobile branch of `navigation-links.tsx`: the five declared slots,
 * in order, and nothing else.
 *
 * Slice 2P.5 retired the `Mais` disclosure from this bar, so the fixture has no
 * overflow panel to build either. The mirror is now a straight map over
 * `MOBILE_BAR`, which is what the component itself became.
 */
function bottomNav() {
  // Built from the declared slot order, so the fixture cannot drift from the
  // component's own sequence without this list changing too.
  return MOBILE_BAR.map((label) =>
    navLink(label, label === "Captura rápida" ? "capture-fab" : "mobile-primary-link"),
  ).join("");
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
:root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}
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

const BAR_TARGET_TITLE = (name: string) =>
  "every bar slot meets the 44px touch minimum at " + name;

test.describe("mobile bottom navigation", () => {
  for (const viewport of VIEWPORTS.filter((entry) => entry.width <= 412)) {
    test(`capture stays centred and in source order at ${viewport.name}`, async ({ page }) => {
      await render(page, homeBody(), viewport.width, viewport.height);

      const measured = await page.evaluate(() => {
        const nav = document.querySelector(".bottom-nav")!;
        const items = [...nav.children].map((element) => {
          const rect = element.getBoundingClientRect();
          // A disclosure is named by its summary, not by its whole subtree: the
          // panel's text is concatenated without whitespace, so reading
          // `element.textContent` labelled the `Mais` slot with every destination
          // inside it.
          const named = element.querySelector("summary") ?? element;
          return { label: (named.textContent ?? "").trim().split(/\s+/)[0], left: rect.left, right: rect.right };
        });
        const fab = nav.querySelector(".capture-fab")!.getBoundingClientRect();
        return {
          domOrder: items.map((item) => item.label),
          visualOrder: [...items].sort((a, b) => a.left - b.left).map((item) => item.label),
          fabCentre: (fab.left + fab.right) / 2,
          viewportCentre: window.innerWidth / 2,
        };
      });

      expect(measured.visualOrder, "grid order rearranged the navigation").toEqual(measured.domOrder);
      expect(measured.domOrder).toEqual([...MOBILE_BAR].map((label) => label.split(/\s+/)[0]));

      /*
       * Dead centre, within 2px (UX-14, closed by DEC-1).
       *
       * This assertion used to allow the middle *third*, because with six slots the
       * capture control sat third of six and no distribution can put slot 3 of 6 on
       * the centre line — making it exact required deciding how many destinations
       * the bar carries, which a stylesheet may not decide. That decision is taken:
       * five slots, capture in the middle, Brain in `Mais`. Five equal grid
       * columns put the third column's centre on the bar's centre, so the tolerance
       * is now sub-pixel rounding rather than a third of the screen.
       */
      expect(
        Math.abs(measured.fabCentre - measured.viewportCentre),
        `capture centre is ${measured.fabCentre.toFixed(1)}px, viewport centre is ${measured.viewportCentre}px`,
      ).toBeLessThanOrEqual(2);
    });
  }

  /*
   * The bar is the only navigation a phone has, so its slots are the targets
   * that matter most. Asserted at both widths the brief names, because a
   * five-column grid divides 375 and 412 differently and a slot that clears 44px
   * at one can fail at the other.
   */
  for (const viewport of VIEWPORTS.filter((entry) => entry.width <= 412)) {
    test(BAR_TARGET_TITLE(viewport.name), async ({ page }) => {
      await render(page, homeBody(), viewport.width, viewport.height);

      const boxes = await page.evaluate(() => {
        const nav = document.querySelector(".bottom-nav")!;
        return [...nav.children].map((element) => {
          // A disclosure is measured by its summary — the thing a thumb lands
          // on — not by the panel it opens.
          const target = element.querySelector("summary") ?? element;
          const rect = target.getBoundingClientRect();
          const named = (target.textContent ?? "").trim().split(/\s+/)[0];
          return { named, width: rect.width, height: rect.height };
        });
      });

      expect(boxes.length, "the bar rendered no slots to measure").toBe(5);
      for (const box of boxes) {
        expect(box.height, box.named + " is " + box.height.toFixed(1) + "px tall").toBeGreaterThanOrEqual(44);
        expect(box.width, box.named + " is " + box.width.toFixed(1) + "px wide").toBeGreaterThanOrEqual(44);
      }
    });
  }

  /*
   * Exactly one destination is current, and the disclosure is current only when
   * what you are reading lives inside it. Two marks would tell a screen-reader
   * user they are in two places; none would tell them they are nowhere.
   */
  test("marks exactly one slot as the current destination", async ({ page }) => {
    await render(page, homeBody(), 375, 667);
    const marked = await page.evaluate(() => {
      const nav = document.querySelector(".bottom-nav")!;
      return [...nav.querySelectorAll('[aria-current="page"]')].map(
        (node) => (node.textContent ?? "").trim().split(/\s+/)[0],
      );
    });
    expect(marked).toHaveLength(1);
  });

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

/**
 * The recomposed task detail — `03-componentes.md`, and `2L-EDIT-007`.
 *
 * Mirrors the DOM `src/features/daily-cycle/task-detail-view.tsx` emits: the
 * header, the two wrappers, and one section in each. Only the geometry is under
 * test here, so the sections carry a heading and a line rather than every field.
 */
function taskDetailBody(options: { panel?: boolean } = {}) {
  const frame = options.panel
    ? "content-page task-detail-page task-detail-panel"
    : "content-page task-detail-page";
  const back = options.panel
    ? '<button type="button" class="back-link task-panel-close">Trabalho</button>'
    : '<a class="back-link" href="#">Trabalho</a>';
  return `<div class="work-shell"><div class="work-shell-main">${listBody()}</div><div class="${frame}">
    ${back}
    <header class="task-detail-header">
      <div><p class="eyebrow">TAREFA</p><h1>${LONG_TITLE}</h1><p class="task-description">Conferir a cláusula de rescisão.</p></div>
      <span class="status-badge" data-state="blocked">Bloqueada</span>
    </header>
    <div class="task-detail-body">
      <div class="task-detail-primary">
        <div class="task-detail-actions"><div class="row-actions"><button class="row-action" type="button">Concluir</button></div></div>
        <section class="task-detail-section" aria-label="Detalhes"><h2>Detalhes</h2><dl class="task-fields"><div class="task-field"><dt>Prazo</dt><dd>31 de julho de 2026</dd></div><div class="task-field"><dt>Dia planejado</dt><dd>Sem dia planejado</dd></div></dl></section>
        <ul class="task-control-list"><li class="task-control"><form><label for="d">Prazo</label><input id="d" type="date"><button class="row-action" type="submit">Aplicar</button></form></li></ul>
      </div>
      <div class="task-detail-secondary">
        <section class="task-detail-section" aria-label="Relações"><h2>Relações</h2><dl class="task-relations"><div class="task-relation-group"><dt>Projetos</dt><dd><a class="task-relation" href="#">Aurora Participações</a></dd></div></dl></section>
        <section class="task-detail-section" aria-label="Histórico desta tarefa"><h2>Histórico desta tarefa</h2><ol class="task-history"><li><strong>Você alterou a tarefa</strong><time>29/07/2026</time></li></ol></section>
      </div>
    </div>
  </div></div>`;
}

test.describe("the task detail composes into two columns without reordering them", () => {
  /*
    The load-bearing assertion, and the one no unit test can make: the columns
    are grid *placement*, so the element that comes first in the DOM is also the
    element that appears first on screen. A CSS `order` would satisfy every
    jsdom test in the repository and put the focus order behind the visual one
    on exactly one viewport.
  */
  test("the decide column is left of the understand column, in DOM order", async ({ page }) => {
    await render(page, taskDetailBody(), 1440, 900);

    const [primary, secondary] = await Promise.all([
      page.locator(".task-detail-primary").boundingBox(),
      page.locator(".task-detail-secondary").boundingBox(),
    ]);
    expect(primary && secondary).toBeTruthy();
    expect(primary!.x).toBeLessThan(secondary!.x);
    // Genuinely two columns, not one column with a gap: they overlap vertically.
    expect(primary!.y).toBeCloseTo(secondary!.y, 0);
  });

  test("collapses to one column below the split, keeping the same order", async ({ page }) => {
    await render(page, taskDetailBody(), 1024, 900);

    const [primary, secondary] = await Promise.all([
      page.locator(".task-detail-primary").boundingBox(),
      page.locator(".task-detail-secondary").boundingBox(),
    ]);
    expect(primary!.x).toBeCloseTo(secondary!.x, 0);
    expect(primary!.y).toBeLessThan(secondary!.y);
  });

  /*
    `2L-EDIT-007`. The panel is a frame, and a frame may not take a control
    away. The panel is narrow enough that the two-column split must not apply
    to it — at 460px the side column would be 180px and the eleven-control grid
    would collapse — so the wrapper is a plain block there.
  */
  test("the docked panel is one column and still holds every control", async ({ page }) => {
    await render(page, taskDetailBody({ panel: true }), 1440, 900);

    const panel = page.locator(".task-detail-panel");
    await expect(panel).toBeVisible();
    // Docked beside the list, not over it.
    await expect(page.locator(".work-shell-main")).toBeVisible();
    const [main, box] = await Promise.all([
      page.locator(".work-shell-main").boundingBox(),
      panel.boundingBox(),
    ]);
    expect(main!.x + main!.width).toBeLessThanOrEqual(box!.x + 1);
    expect(box!.width).toBeLessThanOrEqual(460);

    const [primary, secondary] = await Promise.all([
      page.locator(".task-detail-primary").boundingBox(),
      page.locator(".task-detail-secondary").boundingBox(),
    ]);
    expect(primary!.x).toBeCloseTo(secondary!.x, 0);
    await expect(panel.locator("button[type=submit]")).toBeVisible();
    await expect(panel.locator(".task-detail-actions .row-action")).toBeVisible();
  });

  test("on a narrow viewport the panel is the surface and the list is removed", async ({ page }) => {
    await render(page, taskDetailBody({ panel: true }), 412, 915);

    // `display:none`, not covered: a covered list stays in the accessibility
    // tree and stays reachable while the user believes they are on the task.
    await expect(page.locator(".work-shell-main")).toBeHidden();
    await expect(page.locator(".task-detail-panel")).toBeVisible();
    // And it drops the docked frame, which would read as a dialog with no
    // backdrop once it fills the page.
    const border = await page.locator(".task-detail-panel").evaluate((node) =>
      getComputedStyle(node).borderTopWidth,
    );
    expect(border).toBe("0px");
  });

  test("neither frame scrolls horizontally at any width", async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      for (const body of [taskDetailBody(), taskDetailBody({ panel: true })]) {
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
});
