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

/**
 * Mirrors Hoje as `src/features/shell/home-view.tsx` renders it **today**.
 *
 * ## This fixture was stale, and the stale copy passed for the whole time
 *
 * It mirrored `.panel` / `.attention-panel` / `.dashboard-recent-list`, which
 * the Hoje rewrite deleted. Measured on 2026-08-20 against the tree: **none of
 * those three class names exists anywhere in `src/` any more.** The product
 * renders `.home-section` containing `.home-list`, in three places on Hoje.
 *
 * So every assertion below has been measuring a surface the product does not
 * render — the third time this file has caught its own mirror going stale, and
 * the first where the drift hid a **live defect**: `.dashboard-recent-list`
 * establishes containment and `.home-list` does not, so the container query
 * written to stop titles wrapping one word per line never applied to Hoje at
 * all. The owner found it on a real iPhone; this lane could not have.
 *
 * `home-mirror-guard.test.ts` now derives the class names from the component,
 * so a fourth drift fails instead of passing quietly.
 */
function homeBody() {
  return `<div class="dashboard home-dashboard today-page">
    <header class="hero today-hero"><p class="eyebrow">QUINTA-FEIRA, 30 DE JULHO</p><h1>Boa tarde.<br><span>O que merece sua atenção agora?</span></h1></header>
    <div class="today-columns">
      <div class="today-main">
        <section class="home-section" data-testid="attention-panel" aria-label="Precisa de você">
          <header><div><h2>Precisa de você</h2></div><span class="count attention-count">2</span></header>
          <div class="home-list">${attentionRow(LONG_TITLE)}</div>
        </section>
      </div>
      <aside class="today-side" aria-label="Contexto do dia">
        <section class="home-section" data-testid="recent-panel" aria-label="Atividade recente">
          <header><div><h2>Atividade recente</h2></div></header>
          <div class="home-list">${inboxRow(LONG_TITLE)}</div>
        </section>
      </aside>
    </div>
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
      Math.round(document.querySelector(".today-columns")!.getBoundingClientRect().width),
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

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * `Histórico imutável` — the revision timeline.
 *
 * The owner reported the interpretation summary rendering "praticamente uma
 * palavra por linha" inside `Ver detalhes técnicos`. The cause is invisible to
 * every jsdom test in the repository, because it is a grid-placement fact:
 * `.revision-timeline li` declared three columns whose first was reserved for
 * the `History` icon, but that icon is `position:absolute` — so it is not a grid
 * item, does not consume a track, and the summary block auto-placed into the
 * 24px column meant for it.
 *
 * The second half of the finding is width, and it is why these tests measure the
 * **real ancestry** rather than the timeline alone: from 1080px up the block
 * lives in `.record-explanation`, a `minmax(320px,.65fr)` aside, so a desktop row
 * has ~240px of content — less than a 375px phone gives it. The viewport says
 * nothing useful about this container, which is why the layout switches on the
 * container and why the assertions below never hardcode "desktop means two
 * columns".
 */

/** Mirrors the `History` icon `technical-details.tsx` renders per row. */
const TIMELINE_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"></svg>';

/** A real interpretation summary, long enough that any starved column wraps it. */
const REVISION_SUMMARY =
  "Preciso desenvolver um relatório de Sweepstakes para Garo, que faz parte da Royal Caribbean, com o prazo jogado para a sexta-feira seguinte.";
const REVISION_SUMMARY_EN =
  "Develop the Sweepstakes report for Garo at Royal Caribbean, with the deadline moved to the following Friday.";
const CORRECTION_REASON = "Corrigi o prazo porque a sexta-feira seguinte cai depois dos quinze dias.";

/** `formatInstant(…, "dayAndTime", …)` — `dateStyle:"medium"`, `timeStyle:"short"`. */
const MEDIUM_DATE = "22 de ago. de 2026, 14:32";
/**
 * The longest timestamp this surface can be asked to render. `dayAndTime` is
 * medium today, so this is a deliberate over-statement of the input: a date
 * column that survives this cannot starve the summary with the real one.
 */
const LONG_DATE = "sábado, 22 de agosto de 2026 às 14:32:07 BRT";

function revisionRow(options: {
  version: number;
  origin: string;
  summary: string;
  date: string;
  current?: boolean;
  reason?: string;
}) {
  const reason = options.reason ? `<small>${options.reason}</small>` : "";
  return `<li${options.current ? ' class="revision-current"' : ""}>${TIMELINE_ICON}<div class="revision-entry"><strong>v${options.version} · ${options.origin}</strong><p>${options.summary}</p>${reason}</div><time datetime="2026-08-22T17:32:00.000Z">${options.date}</time></li>`;
}

/**
 * The disclosure is `open` here and closed in the product. That is the one
 * concession this fixture makes: a `<details>` that is shut has no layout to
 * measure, and the defect is in the layout it has when the owner opens it.
 */
function historyBody(options: { date?: string; revisions?: number } = {}) {
  const date = options.date ?? MEDIUM_DATE;
  const rows = [
    revisionRow({ version: 3, origin: "Reinterpretação por IA", summary: REVISION_SUMMARY, date, current: true }),
    revisionRow({ version: 2, origin: "Correção do usuário", summary: REVISION_SUMMARY_EN, date, reason: CORRECTION_REASON }),
    revisionRow({ version: 1, origin: "Interpretação inicial", summary: REVISION_SUMMARY, date }),
  ].slice(0, options.revisions ?? 3);
  return `<div class="content-page entry-detail-page"><div class="entry-review record-detail">
    <div class="record-detail-columns">
      <div class="record-decision"><section class="review-understanding"><p class="review-understanding-body">${REVISION_SUMMARY}</p></section></div>
      <aside class="record-explanation" aria-label="Como este registro foi lido">
        <details class="technical-details" open>
          <summary>Ver detalhes técnicos</summary>
          <div class="technical-details-body">
            <section class="interpretation-history">
              <div class="section-heading"><span aria-hidden="true">${ICON}</span><div><h2>Histórico imutável</h2><p>Cada correção, undo e reinterpretação acrescenta uma versão.</p></div></div>
              <ol class="revision-timeline">${rows.join("")}</ol>
            </section>
          </div>
        </details>
      </aside>
    </div>
  </div></div>`;
}

type RevisionGeometry = {
  lines: number;
  words: number;
  wordsPerLine: number;
  timeOverflows: boolean;
  entryColumn: string;
  timeColumn: string;
  entryLeft: number;
  entryWidth: number;
  timeLeft: number;
  timeWidth: number;
  rowWidth: number;
  sideBySide: boolean;
  iconIsGridItem: boolean;
};

/** `border-left:2px` plus `padding-left:18px` on `.revision-timeline li`. */
const ROW_CHROME = 20;
/** The `column-gap` on `.revision-timeline li`. */
const ROW_GAP = 11;

async function revisionGeometry(page: Page): Promise<RevisionGeometry[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".revision-timeline li")].map((row) => {
      const entry = row.querySelector(".revision-entry") as HTMLElement | null;
      if (!entry) throw new Error("the revision row rendered no .revision-entry block");
      const paragraph = entry.querySelector("p") as HTMLElement;
      const time = row.querySelector("time") as HTMLElement;
      const icon = row.querySelector(":scope > svg") as HTMLElement;
      const style = getComputedStyle(paragraph);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      const height = paragraph.getBoundingClientRect().height;
      const lines = Math.max(1, Math.round(height / lineHeight));
      const words = (paragraph.textContent ?? "").trim().split(/\s+/u).filter(Boolean).length;
      const entryBox = entry.getBoundingClientRect();
      const timeBox = time.getBoundingClientRect();
      return {
        lines,
        words,
        wordsPerLine: words / lines,
        // A `nowrap` timestamp wider than its column is truncated by the card's
        // `overflow:hidden` with no ellipsis, which the page-level overflow
        // check cannot see.
        timeOverflows: time.scrollWidth > time.clientWidth + 1,
        entryColumn: getComputedStyle(entry).gridColumnStart,
        timeColumn: getComputedStyle(time).gridColumnStart,
        entryLeft: Math.round(entryBox.left),
        entryWidth: Math.round(entryBox.width),
        timeLeft: Math.round(timeBox.left),
        timeWidth: Math.round(timeBox.width),
        rowWidth: Math.round(row.getBoundingClientRect().width),
        sideBySide: Math.abs(entryBox.top - timeBox.top) < 4,
        iconIsGridItem: getComputedStyle(icon).position !== "absolute",
      };
    }),
  );
}

/**
 * Every width the owner asked to see, plus the two the repository already
 * measures. 1440 and 1280 are above the 1080px split, so they exercise the
 * narrow aside; 900 and 700 are below it, so they exercise the wide row.
 */
/**
 * **Words** per line, not characters, and the metric change is deliberate.
 *
 * The row-title floor above is 24 characters, chosen for 13px UI titles in a
 * panel. This surface is a 17px reading serif inside a column the stylesheet
 * deliberately narrows: at 1440x900 the timeline is nested three cards deep —
 * `.record-explanation` is 320px, and `.technical-details-body` and
 * `.interpretation-history` each add 25px of padding on both sides — so the
 * summary has **188px**, and a character floor calibrated for a wide list is
 * measuring the aside's width rather than the defect.
 *
 * Words per line measures the reported symptom itself: *"praticamente uma
 * palavra por linha"*. The broken layout put the summary in a 24px track, about
 * one word per line; the fixed layout measures 2.8 (English, whose words are
 * longer) to 3.7 (Portuguese) in that same 188px column, and more everywhere
 * else. A floor of 2 separates those two populations and cannot be satisfied by
 * the defect returning in any form.
 */
const TIMELINE_MIN_WORDS_PER_LINE = 2;

const TIMELINE_VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "900x900", width: 900, height: 900 },
  { name: "700x900", width: 700, height: 900 },
  { name: "600x900", width: 600, height: 900 },
  { name: "440x900", width: 440, height: 900 },
  { name: "375x667", width: 375, height: 667 },
] as const;

test.describe("the immutable history timeline never starves the revision summary", () => {
  test("the summary block owns the main column at every width, and the icon owns none", async ({ page }) => {
    for (const viewport of TIMELINE_VIEWPORTS) {
      await render(page, historyBody(), viewport.width, viewport.height);
      const rows = await revisionGeometry(page);
      expect(rows, `no revision rows rendered at ${viewport.name}`).toHaveLength(3);
      for (const [index, row] of rows.entries()) {
        expect(row.iconIsGridItem, `${viewport.name} row ${index}: the icon became a grid item`).toBe(false);
        expect(row.entryColumn, `${viewport.name} row ${index}: the summary is not in the first column`).toBe("1");
        /*
          The font-independent half of the guard, and the one that would have
          caught the original defect on its own: the summary claims every pixel
          the date does not. A track reserved for something that is not there —
          the `24px` the absolutely-positioned icon never occupied — shows up
          here as missing width, whatever the type is doing.
        */
        const claimed = row.entryWidth + (row.sideBySide ? row.timeWidth + ROW_GAP : 0);
        expect(
          claimed,
          `${viewport.name} row ${index}: ${row.rowWidth - ROW_CHROME - claimed}px of the row is reserved for nothing`,
        ).toBeGreaterThanOrEqual(row.rowWidth - ROW_CHROME - 1);
      }
    }
  });

  for (const viewport of TIMELINE_VIEWPORTS) {
    test(`keeps the summary readable at ${viewport.name}`, async ({ page }) => {
      await render(page, historyBody(), viewport.width, viewport.height);
      for (const [index, row] of (await revisionGeometry(page)).entries()) {
        expect(
          row.wordsPerLine,
          `row ${index} at ${viewport.name}: ${row.words} words on ${row.lines} lines in a ${row.entryWidth}px column (row ${row.rowWidth}px)`,
        ).toBeGreaterThanOrEqual(TIMELINE_MIN_WORDS_PER_LINE);
      }
    });
  }

  test("a long timestamp cannot compress the summary", async ({ page }) => {
    for (const viewport of TIMELINE_VIEWPORTS) {
      await render(page, historyBody({ date: LONG_DATE }), viewport.width, viewport.height);
      for (const [index, row] of (await revisionGeometry(page)).entries()) {
        expect(
          row.wordsPerLine,
          `row ${index} at ${viewport.name} with a long date: ${row.words} words on ${row.lines} lines in ${row.entryWidth}px`,
        ).toBeGreaterThanOrEqual(TIMELINE_MIN_WORDS_PER_LINE);
        expect(
          row.timeOverflows,
          `row ${index} at ${viewport.name}: the long timestamp overflowed its column and was truncated`,
        ).toBe(false);
      }
    }
  });

  /*
   * The placement invariant, stated without naming a viewport: where the date
   * shares the row it is the *final* column and sits to the right of the
   * summary; where it does not, it is stacked underneath in the same column.
   * The two counters below make this a real control — a build where the date
   * never shared a row, or never stacked, would satisfy the invariant vacuously.
   */
  test("the date is either the final column or stacked under the summary, never beside it in column one", async ({ page }) => {
    let sideBySideSeen = 0;
    let stackedSeen = 0;
    for (const viewport of TIMELINE_VIEWPORTS) {
      for (const date of [MEDIUM_DATE, LONG_DATE]) {
        await render(page, historyBody({ date }), viewport.width, viewport.height);
        for (const [index, row] of (await revisionGeometry(page)).entries()) {
          const where = `row ${index} at ${viewport.name}`;
          if (row.sideBySide) {
            sideBySideSeen += 1;
            expect(row.timeColumn, `${where}: a shared row put the date outside the final column`).toBe("2");
            expect(row.timeLeft, `${where}: the date is not to the right of the summary`).toBeGreaterThan(row.entryLeft);
          } else {
            stackedSeen += 1;
            expect(row.timeColumn, `${where}: a stacked date left the main column`).toBe("1");
          }
        }
      }
    }
    expect(sideBySideSeen, "no width put the date in the final column").toBeGreaterThan(0);
    expect(stackedSeen, "no width stacked the date under the summary").toBeGreaterThan(0);
  });

  test("multiple revisions and their correction reasons each keep their own row", async ({ page }) => {
    for (const viewport of [TIMELINE_VIEWPORTS[0], TIMELINE_VIEWPORTS[5]]) {
      await render(page, historyBody(), viewport.width, viewport.height);
      const reasons = await page.locator(".revision-timeline small").count();
      expect(reasons, `the correction reason disappeared at ${viewport.name}`).toBe(1);
      const tops = await page.evaluate(() =>
        [...document.querySelectorAll(".revision-timeline li")].map((row) =>
          Math.round(row.getBoundingClientRect().top),
        ),
      );
      // Three rows, none overlapping: a collapsed row would repeat a top.
      expect(new Set(tops).size, `revision rows overlapped at ${viewport.name}`).toBe(3);
    }
  });

  test("survives print emulation, which is the export path", async ({ page }) => {
    // There is no `@media print` block in the repository, so printing renders
    // the screen layout — which is exactly why it has to be measured rather than
    // assumed: a rule that only held under a `screen`-scoped query would not.
    await page.emulateMedia({ media: "print" });
    try {
      for (const viewport of [TIMELINE_VIEWPORTS[0], TIMELINE_VIEWPORTS[5]]) {
        await render(page, historyBody(), viewport.width, viewport.height);
        for (const [index, row] of (await revisionGeometry(page)).entries()) {
          expect(
            row.wordsPerLine,
            `row ${index} at ${viewport.name} in print: ${row.words} words on ${row.lines} lines in ${row.entryWidth}px`,
          ).toBeGreaterThanOrEqual(TIMELINE_MIN_WORDS_PER_LINE);
        }
      }
    } finally {
      await page.emulateMedia({ media: "screen" });
    }
  });

  test("the timeline never scrolls its page sideways", async ({ page }) => {
    for (const viewport of TIMELINE_VIEWPORTS) {
      await render(page, historyBody({ date: LONG_DATE }), viewport.width, viewport.height);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `horizontal overflow at ${viewport.name}`).toBeLessThanOrEqual(
        overflow.clientWidth + 1,
      );
    }
  });

  /*
   * The mirror guard this file's own header warns about: every fixture here is a
   * copy of markup that lives somewhere else, and a copy that drifts keeps
   * measuring a layout the product no longer renders. `PRIMARY` and `MOBILE_BAR`
   * were stale for six destinations before anybody noticed.
   */
  test("the fixture still mirrors the markup the component emits", () => {
    const component = readFileSync(
      join(ROOT, "src", "features", "daily-cycle", "technical-details.tsx"),
      "utf8",
    );
    expect(component, "the timeline list lost its class").toContain('className="revision-timeline"');
    expect(component, "the summary block lost the class these assertions place")
      .toContain('className="revision-entry"');
    expect(component, "the row no longer renders a <time>").toMatch(/<time dateTime=\{revision\.createdAt\}>/);
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * `Pessoas mencionadas` — the person-candidate card.
 *
 * The owner reported it at ~440px: the evidence in an extremely narrow column
 * wrapping one word per line, colliding with `Criar pessoa`, `Ignorar menção`
 * out of alignment, the form illegible.
 *
 * The cause was a **shared layout class between two different shapes**.
 * `.candidate-item` describes the task form's `<label>` — a visually hidden
 * checkbox, a 24px check indicator, a copy block — so it declares
 * `grid-template-columns:24px 1fr auto` and
 * `.candidate-item>input{position:absolute;opacity:0;pointer-events:none}`.
 * `PersonCandidateForm` put that class on a `<fieldset>` whose children are a
 * legend, an evidence paragraph, two radio options, a name label and a text
 * input. Measured at 440px before the fix: the evidence occupied a **24px**
 * column, 5 words on 5 lines; the name label likewise; and the text input was
 * `position:absolute`, `opacity:0`, `pointer-events:none` — **invisible and
 * unusable**, which is a functional defect and not only a visual one.
 *
 * The two shapes now have two classes. Nothing here touches the task form.
 */

const PERSON_NAME = "Garo";
const PERSON_EVIDENCE = "relatório de Sweepstakes pra Garo";
/** A real sentence of evidence, long enough that any starved column shows it. */
const LONG_EVIDENCE =
  "preciso desenvolver um relatório de Sweepstakes pra Garo, que faz parte da Royal Caribbean, com o prazo jogado para a sexta-feira seguinte";
/** A name at the contract's own ceiling of meaningfulness, not at 160 chars. */
const LONG_NAME = "Garogandharva Vasconcellos de Albuquerque Menezes";

type CandidateFixture = { index: number; name: string; evidence: string; decision?: "confirmed" | "rejected" };

/**
 * Mirrors the per-candidate block `person-candidate-form.tsx` emits, including
 * the two wrappers that make the layout explicit rather than auto-placed.
 */
function personCandidate({ index, name, evidence, decision }: CandidateFixture) {
  const inputId = `person-candidate-${index}-name`;
  const radio = (value: "confirmed" | "rejected", label: string) =>
    `<label><input${decision === value ? " checked" : ""} name="person-decision-${index}" type="radio" value="${value}">${label}</label>`;
  return `<fieldset class="person-candidate-item" aria-label="Pessoa mencionada: ${name}"><legend>${name}</legend>${
    evidence ? `<p class="person-candidate-evidence">${evidence}</p>` : ""
  }<div class="person-candidate-options">${radio("confirmed", "Criar pessoa")}${radio("rejected", "Ignorar menção")}</div><div class="person-candidate-name"><label for="${inputId}">Nome para criar: ${name}</label><input${
    decision === "confirmed" ? "" : " disabled"
  } id="${inputId}" maxlength="160" type="text" value="${name}"></div></fieldset>`;
}

/**
 * The card renders inside the decision column of the record page, which is what
 * decides how much room it actually has — so the fixture composes that ancestry
 * rather than the card alone.
 */
function personCandidateBody(candidates: CandidateFixture[]) {
  return `<div class="content-page entry-detail-page"><div class="entry-review record-detail">
    <div class="record-detail-columns">
      <div class="record-decision">
        <section class="review-next-actions interpretation-actions phase-2b-task-actions" aria-label="Próximas ações">
          <div class="person-candidate-section">
            <form class="candidate-form">
              <fieldset class="candidate-list" aria-describedby="person-candidate-help">
                <legend>Pessoas mencionadas</legend>
                <p id="person-candidate-help" class="field-hint">Confirme apenas quem deve virar uma pessoa permanente. Você pode corrigir o nome ou ignorar a menção.</p>
                ${candidates.map(personCandidate).join("")}
              </fieldset>
              <button class="button-primary" type="submit">${ICON}Salvar decisões sobre pessoas</button>
            </form>
          </div>
        </section>
      </div>
      <aside class="record-explanation"></aside>
    </div>
  </div></div>`;
}

const ONE_CANDIDATE: CandidateFixture[] = [{ index: 0, name: PERSON_NAME, evidence: PERSON_EVIDENCE }];

type PersonGeometry = {
  cardWidth: number;
  evidenceWidth: number;
  evidenceWordsPerLine: number;
  evidenceColumn: string;
  nameInputVisible: boolean;
  nameInputWidth: number;
  nameInputPointerEvents: string;
  nameInputPosition: string;
  optionHeights: number[];
  optionsSideBySide: boolean;
  anyOverlap: boolean;
};

async function personGeometry(page: Page): Promise<PersonGeometry[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".person-candidate-item")].map((card) => {
      const rect = (el: Element) => el.getBoundingClientRect();
      const evidence = card.querySelector(".person-candidate-evidence") as HTMLElement | null;
      const input = card.querySelector(".person-candidate-name input") as HTMLInputElement;
      const options = [...card.querySelectorAll(".person-candidate-options label")] as HTMLElement[];
      const inputStyle = getComputedStyle(input);

      let wordsPerLine = Number.POSITIVE_INFINITY;
      let evidenceWidth = 0;
      let evidenceColumn = "n/a";
      if (evidence) {
        const style = getComputedStyle(evidence);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        const lines = Math.max(1, Math.round(rect(evidence).height / lineHeight));
        const words = (evidence.textContent ?? "").trim().split(/\s+/u).filter(Boolean).length;
        wordsPerLine = words / lines;
        evidenceWidth = Math.round(rect(evidence).width);
        evidenceColumn = getComputedStyle(evidence).gridColumnStart;
      }

      // Every visible pair inside the card, checked for geometric intersection.
      const boxes = [evidence, ...options, input, card.querySelector(".person-candidate-name label")]
        .filter((el): el is HTMLElement => el !== null)
        .map(rect)
        .filter((r) => r.width > 0 && r.height > 0);
      let anyOverlap = false;
      for (let a = 0; a < boxes.length; a += 1) {
        for (let b = a + 1; b < boxes.length; b += 1) {
          const x = boxes[a], y = boxes[b];
          if (!(x.right <= y.left + 0.5 || y.right <= x.left + 0.5 || x.bottom <= y.top + 0.5 || y.bottom <= x.top + 0.5)) {
            anyOverlap = true;
          }
        }
      }

      return {
        cardWidth: Math.round(rect(card).width),
        evidenceWidth,
        evidenceWordsPerLine: wordsPerLine,
        evidenceColumn,
        nameInputVisible: inputStyle.opacity !== "0" && inputStyle.visibility !== "hidden" && rect(input).width > 0,
        nameInputWidth: Math.round(rect(input).width),
        nameInputPointerEvents: inputStyle.pointerEvents,
        nameInputPosition: inputStyle.position,
        optionHeights: options.map((el) => Math.round(rect(el).height)),
        optionsSideBySide: options.length === 2 && Math.abs(rect(options[0]).top - rect(options[1]).top) < 4,
        anyOverlap,
      };
    }),
  );
}

/** The widths the owner asked for, plus the phone the repository already uses. */
const PERSON_VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "600x900", width: 600, height: 900 },
  { name: "440x900", width: 440, height: 900 },
  { name: "375x812", width: 375, height: 812 },
] as const;

/**
 * The same words-per-line floor the revision timeline uses, and for the same
 * reason: the defect measured **1.00** — literally one word per line.
 */
const PERSON_MIN_WORDS_PER_LINE = 2;
/** The product's own control height, from `.task-control input`. */
const TOUCH_TARGET = 44;

test.describe("the person-candidate card stays usable at every width", () => {
  for (const viewport of PERSON_VIEWPORTS) {
    test(`reads and behaves correctly at ${viewport.name}`, async ({ page }) => {
      await render(page, personCandidateBody(ONE_CANDIDATE), viewport.width, viewport.height);
      const [card] = await personGeometry(page);

      expect(card.evidenceColumn, `${viewport.name}: the evidence is not in the main column`).toBe("1");
      expect(
        card.evidenceWordsPerLine,
        `${viewport.name}: ${card.evidenceWordsPerLine.toFixed(2)} words per line in a ${card.evidenceWidth}px column (card ${card.cardWidth}px)`,
      ).toBeGreaterThanOrEqual(PERSON_MIN_WORDS_PER_LINE);

      /*
        The functional half, and the one a screenshot would not have named: the
        shared rule made this input `position:absolute; opacity:0;
        pointer-events:none`. The owner could not see or reach the field the
        form exists to edit.
      */
      expect(card.nameInputPosition, `${viewport.name}: the name field left the flow`).not.toBe("absolute");
      expect(card.nameInputVisible, `${viewport.name}: the name field is invisible`).toBe(true);
      expect(card.nameInputPointerEvents, `${viewport.name}: the name field cannot be clicked`).not.toBe("none");

      for (const [index, height] of card.optionHeights.entries()) {
        expect(height, `${viewport.name}: option ${index} is ${height}px tall`).toBeGreaterThanOrEqual(TOUCH_TARGET);
      }
      expect(card.anyOverlap, `${viewport.name}: two elements of the card overlap`).toBe(false);
    });
  }

  test("the evidence uses the width the card has, whatever that width is", async ({ page }) => {
    // The defect was a 24px column inside a 338px card. This is the invariant
    // that fails on it regardless of type metrics: the evidence is nearly the
    // whole content box, not a gutter beside it.
    for (const viewport of PERSON_VIEWPORTS) {
      await render(page, personCandidateBody(ONE_CANDIDATE), viewport.width, viewport.height);
      const [card] = await personGeometry(page);
      const chrome = 30; // 14px padding each side plus the 1px borders, rounded up.
      expect(
        card.evidenceWidth,
        `${viewport.name}: evidence ${card.evidenceWidth}px inside a ${card.cardWidth}px card`,
      ).toBeGreaterThanOrEqual(card.cardWidth - chrome - 1);
      expect(card.nameInputWidth, `${viewport.name}: the name field is narrower than its card`)
        .toBeGreaterThanOrEqual(card.cardWidth - chrome - 1);
    }
  });

  test("long evidence and a long name stay readable and never overflow", async ({ page }) => {
    for (const viewport of PERSON_VIEWPORTS) {
      await render(
        page,
        personCandidateBody([{ index: 0, name: LONG_NAME, evidence: LONG_EVIDENCE }]),
        viewport.width,
        viewport.height,
      );
      const [card] = await personGeometry(page);
      expect(
        card.evidenceWordsPerLine,
        `${viewport.name}: long evidence at ${card.evidenceWordsPerLine.toFixed(2)} words per line in ${card.evidenceWidth}px`,
      ).toBeGreaterThanOrEqual(PERSON_MIN_WORDS_PER_LINE);
      expect(card.anyOverlap, `${viewport.name}: overlap with a long name`).toBe(false);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `${viewport.name}: horizontal overflow`).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  });

  test("several candidates each keep their own card, none overlapping", async ({ page }) => {
    const many: CandidateFixture[] = [
      { index: 0, name: PERSON_NAME, evidence: PERSON_EVIDENCE },
      { index: 1, name: "Marina Sobral", evidence: LONG_EVIDENCE, decision: "confirmed" },
      { index: 2, name: LONG_NAME, evidence: "com o pessoal do jurídico", decision: "rejected" },
    ];
    for (const viewport of [PERSON_VIEWPORTS[0], PERSON_VIEWPORTS[2]]) {
      await render(page, personCandidateBody(many), viewport.width, viewport.height);
      const cards = await personGeometry(page);
      expect(cards, `${viewport.name}: not every candidate rendered`).toHaveLength(3);
      for (const [index, card] of cards.entries()) {
        expect(card.anyOverlap, `${viewport.name}: card ${index} overlaps itself`).toBe(false);
        expect(card.evidenceWordsPerLine, `${viewport.name}: card ${index} evidence density`).toBeGreaterThanOrEqual(PERSON_MIN_WORDS_PER_LINE);
      }
      // Cards are stacked, never on top of one another.
      const tops = await page.evaluate(() =>
        [...document.querySelectorAll(".person-candidate-item")].map((el) => Math.round(el.getBoundingClientRect().top)),
      );
      expect(new Set(tops).size, `${viewport.name}: two cards share a top edge`).toBe(3);
    }
  });

  test("a confirmed candidate exposes an enabled name field; a rejected one does not", async ({ page }) => {
    // The decision states the owner will actually be in. Both must lay out.
    for (const decision of ["confirmed", "rejected"] as const) {
      await render(page, personCandidateBody([{ index: 0, name: PERSON_NAME, evidence: LONG_EVIDENCE, decision }]), 440, 900);
      const [card] = await personGeometry(page);
      expect(card.anyOverlap, `${decision}: overlap`).toBe(false);
      expect(card.nameInputVisible, `${decision}: the name field is invisible`).toBe(true);
      const enabled = await page.evaluate(() => !(document.querySelector(".person-candidate-name input") as HTMLInputElement).disabled);
      expect(enabled, `${decision}: wrong enabled state`).toBe(decision === "confirmed");
    }
  });

  test("the options split into two columns only where the card has the room", async ({ page }) => {
    // Stated as an invariant plus two counters, so a build that never split —
    // or always split — fails rather than satisfying this vacuously.
    let split = 0;
    let stacked = 0;
    for (const viewport of PERSON_VIEWPORTS) {
      await render(page, personCandidateBody(ONE_CANDIDATE), viewport.width, viewport.height);
      const [card] = await personGeometry(page);
      if (card.optionsSideBySide) {
        split += 1;
        expect(card.cardWidth, `${viewport.name}: split in a ${card.cardWidth}px card`).toBeGreaterThanOrEqual(380);
      } else {
        stacked += 1;
      }
      expect(card.anyOverlap, `${viewport.name}: overlap`).toBe(false);
    }
    expect(split, "no width ever put the two options side by side").toBeGreaterThan(0);
    expect(stacked, "no width ever stacked the two options").toBeGreaterThan(0);
  });

  test("keyboard reaches both options and the name field, in that order", async ({ page }) => {
    await render(page, personCandidateBody([{ index: 0, name: PERSON_NAME, evidence: PERSON_EVIDENCE, decision: "confirmed" }]), 440, 900);
    const focused = async () => page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "none";
      return `${el.tagName.toLowerCase()}:${el.getAttribute("type") ?? el.className}:${(el as HTMLInputElement).value ?? ""}`;
    });

    await page.locator('.person-candidate-options input[value="confirmed"]').focus();
    expect(await focused()).toContain("input:radio");
    // Radios with one name are a single tab stop; the arrow keys move inside it.
    await page.keyboard.press("ArrowDown");
    const afterArrow = await page.evaluate(() => (document.activeElement as HTMLInputElement).value);
    expect(afterArrow, "the arrow key did not move within the radio group").toBe("rejected");

    /*
      And the keyboard reaches the field the form exists to edit. Asserted as
      "within a few tabs" rather than as an exact stop count: a radio group is a
      single tab stop whose position depends on which member is checked, and
      pinning that would be testing the browser rather than the card.
    */
    let reached = false;
    for (let press = 0; press < 4 && !reached; press += 1) {
      await page.keyboard.press("Tab");
      reached = (await focused()).includes("input:text");
    }
    expect(reached, "the keyboard never reached the name field").toBe(true);

    // The focused control must be visible — the defect made it opacity:0.
    const visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.opacity !== "0" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    });
    expect(visible, "the focused name field is not visible").toBe(true);
  });

  test("survives print emulation", async ({ page }) => {
    await page.emulateMedia({ media: "print" });
    try {
      for (const viewport of [PERSON_VIEWPORTS[0], PERSON_VIEWPORTS[2]]) {
        await render(page, personCandidateBody(ONE_CANDIDATE), viewport.width, viewport.height);
        const [card] = await personGeometry(page);
        expect(card.evidenceWordsPerLine, `${viewport.name} in print`).toBeGreaterThanOrEqual(PERSON_MIN_WORDS_PER_LINE);
        expect(card.anyOverlap, `${viewport.name} in print: overlap`).toBe(false);
      }
    } finally {
      await page.emulateMedia({ media: "screen" });
    }
  });

  test("the fixture still mirrors the markup the component emits", () => {
    const component = readFileSync(
      join(ROOT, "src", "features", "interpretations", "person-candidate-form.tsx"),
      "utf8",
    );
    for (const token of [
      'className="person-candidate-item"',
      'className="person-candidate-evidence"',
      'className="person-candidate-options"',
      'className="person-candidate-name"',
    ]) {
      expect(component, `the component no longer emits ${token}`).toContain(token);
    }
    /*
      And it must not go back to sharing the task form's layout class. Compared
      as a whole class token: `\bcandidate-item\b` also matches inside
      `person-candidate-item`, because `-` is not a word character — a guard
      that would have failed on the fix itself.
    */
    for (const value of [...component.matchAll(/className="([^"]*)"/g)].map((match) => match[1])) {
      expect(value.split(/\s+/u), "the person card is sharing `.candidate-item` again")
        .not.toContain("candidate-item");
    }
  });
});
