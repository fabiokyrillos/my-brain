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
  "ui.css",
  "globals.css",
  // The command trigger's own rules. It is one of the top bar's three controls
  // since Editorial calmo's slice 7, so the bar cannot be measured without it;
  // `globals.css` imports it before `mobile-navigation.css`, as it sits here.
  "palette.css",
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
const PRIMARY = ["Hoje", "Conversar", "Agenda", "Memória"] as const;
/**
 * The rail's secondary pair (Life Brain A.2), mirroring `secondaryNavigationKeys`:
 * rendered under a rule below capture, and never a bar slot.
 */
const SECONDARY = ["Registros", "Tarefas"] as const;
/**
 * The mobile bar, mirroring `mobileBarSlots` (UX-14, DEC-1).
 *
 * Five slots with capture in the middle. Life Brain A.2 (LB-OD-1) made them
 * Hoje · Conversar · Agenda · Memória; `shell-mirror-guard` derives this list
 * from the registry and fails when the two diverge.
 */
const MOBILE_BAR = ["Hoje", "Conversar", "Captura rápida", "Agenda", "Memória"] as const;
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
  // Conversar and Calendário (Agenda) left these two groups' copies in Life
  // Brain A.2: both are primary now, while keeping their registry groups.
  ["Contexto", ["Projetos", "Pessoas", "Organizações", "Áreas da vida", "Memórias", "Arquivos", "Relações"]],
  ["Reflexão", ["Revisões", "Perguntas pendentes"]],
  ["Organização", ["Lembretes"]],
  ["Transparência", ["Histórico", "Custos de IA"]],
  ["Preferências", ["Ajustes"]],
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
  const secondary = SECONDARY.map((label) => navLink(label)).join("");
  const groups = GROUPS.map(
    ([label, items]) =>
      `<div class="nav-group" role="group" aria-label="${label}"><span class="nav-group-label" aria-hidden="true">${label}</span><div class="nav-group-items">${items
        .map((item) => navLink(item))
        .join("")}</div></div>`,
  ).join("");
  // Primary, capture, the secondary pair under its rule, then the groups —
  // the order `navigation-links.tsx` renders since Life Brain A.2.
  return `<div class="nav-group nav-group-primary" role="group" aria-label="Principal"><div class="nav-group-items">${primary}</div></div>${navLink("Captura rápida", "capture-fab")}<div class="nav-group nav-group-secondary" role="group" aria-label="Secundário"><div class="nav-group-items">${secondary}</div></div>${groups}`;
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

/**
 * Mirrors the header mount of `src/features/shell/account-menu.tsx` — the
 * `variant="header"` branch, where the name heads the panel instead of sitting
 * beside the control — with its three rows in the component's order.
 */
function accountMenu(open: boolean) {
  const row = (tag: "a" | "button", extra: string, inner: string) =>
    `<${tag} class="account-menu-item${extra}"${tag === "a" ? ' href="#"' : ' type="submit"'}>${ICON}${inner}</${tag}>`;
  return `<details class="account-menu account-menu-header"${open ? " open" : ""}>
<summary aria-label="Sua conta: Marina Duarte"><span aria-hidden="true" class="account-avatar">${ICON}</span></summary>
<div aria-label="Conta e sessão" class="account-menu-panel" role="group">
<div class="account-menu-identity"><span class="account-summary-text"><small>Conectado como</small><strong>Marina Duarte</strong></span></div>
${row("a", "", "<span>Ajustes</span>")}
${row("a", "", '<span class="account-menu-item-text"><span>Idioma: Português</span><small>Mudar para <span lang="en">English</span></small></span>').replace("<a ", '<a aria-label="Idioma: Português. Mudar para English" hreflang="en" ')}
<form><input type="hidden" name="locale" value="pt-BR">${row("button", " account-sign-out", "<span>Sair da conta</span>")}</form>
<div aria-atomic="true" aria-busy="false" aria-live="polite" class="sr-only" role="status"></div>
</div></details>`;
}

/**
 * Mirrors the `<header className="top-bar">` of `src/features/shell/app-shell.tsx`:
 * the brand, then the three controls — the command trigger
 * (`command-palette.tsx`), the bell (`NotificationsLink`) and the account.
 *
 * **This mirror had gone stale too**: it was a single `<a>EN</a>`, the locale
 * link, standing in for a bar that also carried a palette trigger, a bell and
 * an account. Nothing here measured the bar, so nothing noticed. The
 * "fixture still mirrors the markup" test below reads the two components and
 * fails when a class this builder emits is no longer one they render.
 */
function topBar(accountOpen: boolean) {
  return `<header class="top-bar"><a href="#" class="top-brand" aria-label="My Brain"><span class="brand-mark">B</span><span class="brand-name">My Brain</span></a><div class="top-actions"><button type="button" class="palette-trigger" aria-haspopup="dialog" data-palette-trigger="true">${ICON}<span>Buscar e agir</span><kbd aria-hidden="true">Ctrl+K</kbd></button><a aria-label="Notificações" class="notification-link" href="#">${ICON}</a><span class="top-account">${accountMenu(accountOpen)}</span></div></header>`;
}

function document_(body: string, options: { accountOpen?: boolean } = {}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}
${css}
</style></head><body><div class="app-frame">
<aside class="side-rail"><a href="#" class="brand" aria-label="My Brain"><span class="brand-mark">B</span><span class="brand-name">My Brain</span></a><nav aria-label="Navegação principal" class="side-nav">${sideNav()}</nav></aside>
<div class="main-stage">${topBar(options.accountOpen ?? false)}<main>${body}</main></div>
<nav aria-label="Navegação móvel" class="bottom-nav">${bottomNav()}</nav>
</div></body></html>`;
}

async function render(
  page: Page,
  body: string,
  width: number,
  height: number,
  options: { accountOpen?: boolean } = {},
) {
  await page.setViewportSize({ width, height });
  await page.setContent(document_(body, options));
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
       * five slots, capture in the middle, no `Mais`. Five equal grid
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

/*
 * Editorial calmo, slice 7 — the top bar a phone sees.
 *
 * It was four unlike controls pushed to the right edge with nothing on the
 * left. These hold the recomposition where only a layout engine can: the brand
 * leads, three controls of one size follow, nothing is under 44px, nothing is
 * wider than the screen, and the account's panel opens inside the space the two
 * bars leave.
 */
const PHONES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "320x568", width: 320, height: 568 },
] as const;

test.describe("the phone top bar", () => {
  test("the fixture still mirrors the markup the shell renders", () => {
    const shell = readFileSync(join(ROOT, "src/features/shell/app-shell.tsx"), "utf8");
    const menu = readFileSync(join(ROOT, "src/features/shell/account-menu.tsx"), "utf8");
    const palette = readFileSync(join(ROOT, "src/features/palette/command-palette.tsx"), "utf8");

    for (const className of ["top-bar", "top-brand", "brand-mark", "brand-name", "top-actions", "top-account"]) {
      expect(shell, `app-shell.tsx no longer renders .${className}`).toContain(className);
    }
    for (const className of [
      "account-menu-panel", "account-menu-identity", "account-menu-item", "account-menu-item-text",
      "account-sign-out", "account-avatar", "account-summary-text",
    ]) {
      expect(menu, `account-menu.tsx no longer renders .${className}`).toContain(className);
    }
    // The bar's three controls, in the order this fixture emits them.
    const actions = shell.slice(shell.indexOf('className="top-actions"'), shell.indexOf("</header>"));
    const order = ["<CommandPalette", "<NotificationsLink", 'account("header")'].map((token) => actions.indexOf(token));
    expect(order.every((index) => index >= 0), "a top-bar control is missing from app-shell.tsx").toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // And the one this fixture used to stand in for is not among them.
    expect(actions).not.toContain("<LocaleSwitchLink");
    expect(menu).toContain("<LocaleSwitchLink");
    // The trigger's glyph precedes its words, as the fixture has it.
    expect(palette).toMatch(/<Search[^>]*\/>\s*<span>\{text\.trigger\}<\/span>/);
  });

  for (const viewport of PHONES) {
    test(`is the brand and three 44px controls, in one row, at ${viewport.name}`, async ({ page }) => {
      await render(page, homeBody(), viewport.width, viewport.height);

      const measured = await page.evaluate(() => {
        const bar = document.querySelector(".top-bar")!;
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height };
        };
        const controls = [
          ...bar.querySelectorAll(".top-actions > button, .top-actions > a, .top-actions > .top-account > details > summary"),
        ];
        return {
          bar: box(bar),
          brand: box(bar.querySelector(".top-brand")!),
          brandText: (bar.querySelector(".top-brand")!.textContent ?? "").trim(),
          controls: controls.map((control) => ({
            named: control.getAttribute("aria-label") ?? (control.textContent ?? "").trim(),
            ...box(control),
          })),
          // Anything else in the bar that a finger could land on.
          others: [...bar.querySelectorAll("a, button, summary")].filter(
            (element) => !controls.includes(element) && !element.classList.contains("top-brand")
              && (element as HTMLElement).offsetParent !== null && element.closest("details:not([open]) > :not(summary)") === null,
          ).length,
          viewport: window.innerWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(measured.overflow, "the page scrolls sideways").toBeLessThanOrEqual(1);
      expect(measured.brandText).toBe("BMy Brain");
      expect(measured.controls.map((control) => control.named)).toEqual([
        expect.stringContaining("Buscar e agir"),
        "Notificações",
        "Sua conta: Marina Duarte",
      ]);
      expect(measured.others, "a fourth control is in the bar").toBe(0);

      // The brand leads and is itself a full target; the controls follow it.
      expect(measured.brand.height).toBeGreaterThanOrEqual(44);
      expect(measured.brand.left).toBeGreaterThanOrEqual(0);
      expect(measured.brand.right).toBeLessThanOrEqual(measured.controls[0].left);

      let previousRight = measured.brand.right;
      for (const control of measured.controls) {
        expect(control.width, `${control.named} is ${control.width.toFixed(1)}px wide`).toBeGreaterThanOrEqual(44);
        expect(control.height, `${control.named} is ${control.height.toFixed(1)}px tall`).toBeGreaterThanOrEqual(44);
        // One family: the three are the same box.
        expect(Math.abs(control.width - measured.controls[0].width)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(control.height - measured.controls[0].height)).toBeLessThanOrEqual(0.5);
        // DOM order is visual order, with no overlap, inside the screen.
        expect(control.left, `${control.named} overlaps the control before it`).toBeGreaterThanOrEqual(previousRight - 0.5);
        expect(control.right, `${control.named} leaves the screen`).toBeLessThanOrEqual(measured.viewport + 0.5);
        // One row: every control sits inside the bar's own height.
        expect(control.top).toBeGreaterThanOrEqual(measured.bar.top - 0.5);
        expect(control.top + control.height).toBeLessThanOrEqual(measured.bar.top + measured.bar.height + 0.5);
        previousRight = control.right;
      }
    });

    test(`the account panel opens inside the screen, clear of both bars, at ${viewport.name}`, async ({ page }) => {
      await render(page, homeBody(), viewport.width, viewport.height, { accountOpen: true });

      const measured = await page.evaluate(() => {
        const rect = (element: Element) => element.getBoundingClientRect();
        const panel = rect(document.querySelector(".account-menu-header .account-menu-panel")!);
        const rows = [...document.querySelectorAll(".account-menu-header .account-menu-item")];
        return {
          panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
          barBottom: rect(document.querySelector(".top-bar")!).bottom,
          navTop: rect(document.querySelector(".bottom-nav")!).top,
          rows: rows.map((row) => ({ named: (row.textContent ?? "").trim(), height: rect(row).height, right: rect(row).right })),
          name: (document.querySelector(".account-menu-identity strong")!.textContent ?? "").trim(),
          viewport: window.innerWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(measured.overflow, "the open panel makes the page scroll sideways").toBeLessThanOrEqual(1);
      expect(measured.panel.left, "the panel is clipped by the left edge").toBeGreaterThanOrEqual(0);
      expect(measured.panel.right, "the panel is clipped by the right edge").toBeLessThanOrEqual(measured.viewport);
      expect(measured.panel.top).toBeGreaterThanOrEqual(measured.barBottom - 8);
      expect(measured.panel.bottom, "the panel reaches behind the bottom bar").toBeLessThanOrEqual(measured.navTop);

      expect(measured.name).toBe("Marina Duarte");
      expect(measured.rows.map((row) => row.named)).toEqual([
        "Ajustes",
        "Idioma: PortuguêsMudar para English",
        "Sair da conta",
      ]);
      for (const row of measured.rows) {
        expect(row.height, `${row.named} is ${row.height.toFixed(1)}px tall`).toBeGreaterThanOrEqual(44);
        expect(row.right).toBeLessThanOrEqual(measured.panel.right);
      }
    });
  }

  test("stays at the top of the screen while the page scrolls", async ({ page }) => {
    await render(page, `${homeBody()}<div style="height:1600px"></div>`, 390, 844);
    await page.evaluate(() => window.scrollTo(0, 600));
    const top = await page.evaluate(() => document.querySelector(".top-bar")!.getBoundingClientRect().top);
    expect(Math.abs(top)).toBeLessThanOrEqual(0.5);
  });

  test("on desktop the rail carries the brand and the account, and the bar keeps search and the bell", async ({ page }) => {
    await render(page, homeBody(), 1440, 900);
    await expect(page.locator(".top-brand")).toBeHidden();
    await expect(page.locator(".top-account")).toBeHidden();
    await expect(page.locator(".side-rail .brand")).toBeVisible();
    await expect(page.locator(".top-actions .palette-trigger")).toBeVisible();
    await expect(page.locator(".top-actions .notification-link")).toBeVisible();
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
 * Mirrors the DOM `src/features/daily-cycle/task-detail-view.tsx` emits with the
 * `fields` frame of `TaskDetailControls` injected (ADR-184): the header, the two
 * wrappers, the title's verbs, the status actions, the one list of facts — a
 * row at rest, a row open, a row with a long unbroken value — the cancellation,
 * and on the other side the account and the collapsed history.
 */
function taskDetailBody(options: { panel?: boolean } = {}) {
  const frame = options.panel
    ? "content-page task-detail-page task-detail-panel"
    : "content-page task-detail-page";
  const back = options.panel
    ? '<button type="button" class="back-link task-panel-close">Tarefas</button>'
    : '<a class="back-link" href="#">Tarefas</a>';
  return `<div class="work-shell"><div class="work-shell-main">${listBody()}</div><div class="${frame}">
    ${back}
    <header class="task-detail-header">
      <div><p class="eyebrow">TAREFA</p><h1>${LONG_TITLE}</h1><p class="task-description">Conferir a cláusula de rescisão.</p></div>
      <span class="status-badge" data-state="blocked">Bloqueada</span>
    </header>
    <div class="task-detail-body">
      <div class="task-detail-primary">
        <div class="task-detail-controls task-detail-fields">
          <div class="task-title-controls"><div class="task-title-verbs"><button class="task-fact-verb" type="button" aria-expanded="false">Renomear</button><button class="task-fact-verb" type="button" aria-expanded="false">Acrescentar uma nota</button></div></div>
          <div class="task-detail-actions"><div class="row-actions"><button class="row-action" type="button">Concluir</button></div></div>
          <section class="task-detail-section" aria-label="Detalhes"><h2>Detalhes</h2><dl class="task-facts">
            <div class="task-fact"><dt>Prazo</dt><dd><span class="task-fact-value">31 de julho de 2026 às 14:00</span><button class="task-fact-verb" type="button" aria-expanded="true" aria-controls="e-due" aria-label="Alterar prazo">Alterar</button>
              <div class="task-fact-editor" id="e-due"><div class="task-fact-form"><form><label for="d">Prazo</label><input id="d" type="date"><button class="row-action" type="submit">Aplicar</button></form></div><div class="task-fact-form"><form><button class="row-action" type="submit">Tirar o prazo</button></form></div><button class="task-fact-verb" type="button">Fechar</button></div></dd></div>
            <div class="task-fact"><dt>Dia planejado</dt><dd><span class="task-fact-value" data-empty="true">Sem dia planejado</span><button class="task-fact-verb" type="button" aria-expanded="false" aria-label="Definir dia planejado">Definir</button></dd></div>
            <div class="task-fact"><dt>Projetos</dt><dd><span class="task-fact-value"><span class="task-relations"><a class="task-relation" href="#">Aurora Participações</a><a class="task-relation" href="#">${"Projeto".repeat(18)}</a></span></span><button class="task-fact-verb" type="button" aria-expanded="false" aria-label="Alterar projetos">Alterar</button></dd></div>
          </dl></section>
          <div class="task-detail-endnote"><div class="task-fact-form"><form><button class="row-action row-action-destructive" type="submit">Cancelar a tarefa</button></form></div></div>
        </div>
      </div>
      <div class="task-detail-secondary">
        <section class="task-detail-section" aria-label="De onde veio"><h2>De onde veio</h2><p class="quiet-state">Esta tarefa nasceu de um registro seu.</p><blockquote class="task-provenance">Preciso revisar o contrato da Aurora antes da reunião.</blockquote><p class="task-origin">Criada por você · criada em 20 de julho de 2026 às 07:00</p><a class="panel-view-all" href="#">Abrir o registro original</a></section>
        <section class="task-detail-section task-history-section" aria-label="Histórico desta tarefa"><details class="record-footnote"><summary><h2>Histórico desta tarefa</h2></summary><ol class="task-history"><li><strong>Você alterou a tarefa</strong><time>29/07/2026</time></li></ol></details></section>
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
    to it — at 460px the side column would be 180px and a row could not hold its
    label, value and verb — so the wrapper is a plain block there.
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
    // The opened row's own submit, the row verbs and the last control: the
    // panel is a frame, and a frame may not take any of them away.
    await expect(panel.locator(".task-fact-editor button[type=submit]").first()).toBeVisible();
    await expect(panel.locator(".task-fact-verb").first()).toBeVisible();
    await expect(panel.locator(".task-detail-endnote button[type=submit]")).toBeVisible();
    await expect(panel.locator(".task-detail-actions .row-action")).toBeVisible();
  });

  /*
    The recomposition's own contracts (ADR-184). A row is label · value · verb,
    and the three things that can go wrong with that are a value that pushes
    the page sideways, a verb too small to hit, and an opened editor wider than
    the row it opened under.
  */
  for (const width of [390, 320]) {
    test(`nothing in the list of facts is wider than a ${width}px screen`, async ({ page }) => {
      for (const body of [taskDetailBody(), taskDetailBody({ panel: true })]) {
        await render(page, body, width, 800);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth, `horizontal overflow at ${width}`).toBeLessThanOrEqual(overflow.clientWidth + 1);

        const [row, editor] = await Promise.all([
          page.locator(".task-fact").first().boundingBox(),
          page.locator(".task-fact-editor").boundingBox(),
        ]);
        expect(editor!.x).toBeGreaterThanOrEqual(row!.x);
        expect(editor!.x + editor!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
      }
    });
  }

  test("every control of the detail is a 44px target on a phone", async ({ page }) => {
    await render(page, taskDetailBody(), 390, 844);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll(".task-detail-page a, .task-detail-page button, .task-detail-page summary, .task-detail-page input")]
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => ({ named: (node.textContent ?? "").trim().slice(0, 24) || node.tagName, height: node.getBoundingClientRect().height }))
        .filter((box) => box.height < 44),
    );
    expect(small, JSON.stringify(small)).toEqual([]);
  });

  test("a field is 16px on a phone, so focusing it does not zoom the page", async ({ page }) => {
    await render(page, taskDetailBody(), 390, 844);
    const size = await page.locator(".task-fact-editor input[type=date]").evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).fontSize),
    );
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test("the history rests as one line and the cancellation is not a card", async ({ page }) => {
    await render(page, taskDetailBody(), 390, 844);
    await expect(page.locator(".task-history")).toBeHidden();
    const border = await page.locator(".task-detail-endnote .row-action").evaluate((node) =>
      getComputedStyle(node).borderTopWidth,
    );
    expect(border).toBe("0px");
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
 * `Pessoas mencionadas` — one question per person, with its answers beside it.
 *
 * This block has a history. The owner once reported the card at ~440px with its
 * evidence wrapping one word per line and its name field invisible: it shared
 * `.candidate-item` with the task form, whose rules reserve a 24px column and
 * hide any direct `<input>` child. The two shapes got two classes.
 *
 * On 2026-11-17 the card stopped being a form — a radio pair, a name field and
 * one save button under all of them — and became a row: the question, the
 * evidence, *Criar pessoa* · *Ignorar* · *Mudar o nome*, and the name field
 * only when it is asked for. What is measured here is that row.
 */

const PERSON_NAME = "Garo";
const PERSON_EVIDENCE = "relatório de Sweepstakes pra Garo";
/** A real sentence of evidence, long enough that any starved column shows it. */
const LONG_EVIDENCE =
  "preciso desenvolver um relatório de Sweepstakes pra Garo, que faz parte da Royal Caribbean, com o prazo jogado para a sexta-feira seguinte";
/** A name at the contract's own ceiling of meaningfulness, not at 160 chars. */
const LONG_NAME = "Garogandharva Vasconcellos de Albuquerque Menezes";

type CandidateFixture = { index: number; name: string; evidence: string; renaming?: boolean };

/** Mirrors the per-candidate block `person-candidate-form.tsx` emits. */
function personCandidate({ index, name, evidence, renaming }: CandidateFixture) {
  const inputId = `person-candidate-${index}-name`;
  const button = (variant: string, label: string, extra = "") =>
    `<button class="ui-button ui-button--${variant} ui-button--md" type="button"${extra}>${label}</button>`;
  return `<li><div class="person-candidate-item" role="group" aria-label="Pessoa mencionada: ${name}">`
    + `<p class="person-candidate-question">Criar a pessoa “${name}”?</p>`
    + (evidence ? `<p class="person-candidate-evidence">${evidence}</p>` : "")
    + `<div class="person-candidate-actions">${button("secondary", "Criar pessoa")}${button("ghost", "Ignorar")}`
    + `${button("link", "Mudar o nome", ` aria-controls="${inputId}" aria-expanded="${renaming ? "true" : "false"}"`)}</div>`
    + `<div class="person-candidate-name"${renaming ? "" : " hidden"}><label for="${inputId}">Nome para criar: ${name}</label>`
    + `<input id="${inputId}" maxlength="160" type="text" value="${name}"></div></div></li>`;
}

/**
 * The row renders inside the decision column of the record page, which is what
 * decides how much room it actually has — so the fixture composes that ancestry
 * rather than the row alone.
 */
function personCandidateBody(candidates: CandidateFixture[]) {
  return `<div class="content-page entry-detail-page"><div class="entry-review record-detail">
    <div class="record-detail-columns">
      <div class="record-decision">
        <section class="review-next-actions interpretation-actions phase-2b-task-actions" aria-label="Próximas ações">
          <div class="person-candidate-section">
            <ul class="person-candidate-list" aria-label="Pessoas mencionadas">${candidates.map(personCandidate).join("")}</ul>
          </div>
        </section>
      </div>
      <aside class="record-explanation"></aside>
    </div>
  </div></div>`;
}

const ONE_CANDIDATE: CandidateFixture[] = [{ index: 0, name: PERSON_NAME, evidence: PERSON_EVIDENCE }];

type PersonGeometry = {
  rowWidth: number;
  evidenceWidth: number;
  evidenceWordsPerLine: number;
  questionWithinRow: boolean;
  buttonHeights: number[];
  buttonsWithinRow: boolean;
  nameInputVisible: boolean;
  nameInputWidth: number;
  nameInputPointerEvents: string;
  anyOverlap: boolean;
};

async function personGeometry(page: Page): Promise<PersonGeometry[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".person-candidate-item")].map((row) => {
      const rowBox = row.getBoundingClientRect();
      const question = row.querySelector(".person-candidate-question") as HTMLElement;
      const evidence = row.querySelector(".person-candidate-evidence") as HTMLElement | null;
      const input = row.querySelector(".person-candidate-name input") as HTMLInputElement;
      const buttons = [...row.querySelectorAll(".person-candidate-actions button")] as HTMLElement[];
      const shown = (el: Element) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && box.width > 0 && box.height > 0;
      };
      const lines = evidence
        ? Math.max(1, Math.round(evidence.getBoundingClientRect().height / parseFloat(getComputedStyle(evidence).lineHeight)))
        : 1;
      const words = evidence ? (evidence.textContent ?? "").trim().split(/\s+/).length : 0;
      const within = (el: Element) => {
        const box = el.getBoundingClientRect();
        return box.left >= rowBox.left - 0.5 && box.right <= rowBox.right + 0.5;
      };
      const boxes = [question, evidence, ...buttons, ...(shown(input) ? [input] : [])]
        .filter((el): el is HTMLElement => el !== null)
        .map((el) => el.getBoundingClientRect());
      const anyOverlap = boxes.some((one, i) => boxes.some((two, j) => i < j
        && one.left < two.right - 0.5 && two.left < one.right - 0.5
        && one.top < two.bottom - 0.5 && two.top < one.bottom - 0.5));
      return {
        rowWidth: Math.round(rowBox.width),
        evidenceWidth: evidence ? Math.round(evidence.getBoundingClientRect().width) : 0,
        evidenceWordsPerLine: evidence ? words / lines : Number.POSITIVE_INFINITY,
        questionWithinRow: within(question),
        buttonHeights: buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
        buttonsWithinRow: buttons.every(within),
        nameInputVisible: shown(input),
        nameInputWidth: Math.round(input.getBoundingClientRect().width),
        nameInputPointerEvents: getComputedStyle(input).pointerEvents,
        anyOverlap,
      };
    }),
  );
}

/** The widths the owner asked for, plus the phones the repository already uses. */
const PERSON_VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "600x900", width: 600, height: 900 },
  { name: "440x900", width: 440, height: 900 },
  { name: "375x812", width: 375, height: 812 },
  { name: "320x700", width: 320, height: 700 },
] as const;

/** The defect once measured **1.00** — literally one word per line. */
const PERSON_MIN_WORDS_PER_LINE = 2;
/** The product's own control height. */
const TOUCH_TARGET = 44;

test.describe("the person-candidate row stays usable at every width", () => {
  for (const viewport of PERSON_VIEWPORTS) {
    test(`reads and can be answered at ${viewport.name}`, async ({ page }) => {
      await render(page, personCandidateBody(ONE_CANDIDATE), viewport.width, viewport.height);
      const [row] = await personGeometry(page);

      expect(
        row.evidenceWordsPerLine,
        `${viewport.name}: ${row.evidenceWordsPerLine.toFixed(2)} words per line in a ${row.evidenceWidth}px column (row ${row.rowWidth}px)`,
      ).toBeGreaterThanOrEqual(PERSON_MIN_WORDS_PER_LINE);
      expect(row.buttonHeights, `${viewport.name}: three answers`).toHaveLength(3);
      for (const height of row.buttonHeights) {
        expect(height, `${viewport.name}: an answer ${height}px tall`).toBeGreaterThanOrEqual(TOUCH_TARGET);
      }
      expect(row.buttonsWithinRow, `${viewport.name}: an answer leaves the row`).toBe(true);
      expect(row.anyOverlap, `${viewport.name}: two parts of the row overlap`).toBe(false);
      // At rest the row is a question and its answers; the name field is not drawn.
      expect(row.nameInputVisible, `${viewport.name}: the name field is drawn at rest`).toBe(false);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.name}: the page scrolls sideways`).toBeLessThanOrEqual(0);
    });

    test(`shows a usable name field when it is asked for at ${viewport.name}`, async ({ page }) => {
      await render(
        page,
        personCandidateBody([{ index: 0, name: PERSON_NAME, evidence: PERSON_EVIDENCE, renaming: true }]),
        viewport.width,
        viewport.height,
      );
      const [row] = await personGeometry(page);

      // The three properties the shared rule once took from it.
      expect(row.nameInputVisible, `${viewport.name}: the name field is not visible`).toBe(true);
      expect(row.nameInputPointerEvents, `${viewport.name}: the name field cannot be clicked`).not.toBe("none");
      expect(row.nameInputWidth, `${viewport.name}: the name field is ${row.nameInputWidth}px in a ${row.rowWidth}px row`)
        .toBeGreaterThanOrEqual(row.rowWidth - 2);
      expect(row.anyOverlap, `${viewport.name}: the open field overlaps the answers`).toBe(false);
    });

    test(`holds a long name and long evidence at ${viewport.name}`, async ({ page }) => {
      await render(
        page,
        personCandidateBody([{ index: 0, name: LONG_NAME, evidence: LONG_EVIDENCE }]),
        viewport.width,
        viewport.height,
      );
      const [row] = await personGeometry(page);

      expect(row.questionWithinRow, `${viewport.name}: the question leaves the row`).toBe(true);
      expect(row.evidenceWordsPerLine, `${viewport.name}: long evidence`).toBeGreaterThanOrEqual(PERSON_MIN_WORDS_PER_LINE);
      expect(row.anyOverlap, `${viewport.name}: overlap with a long name`).toBe(false);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.name}: a long name scrolls the page sideways`).toBeLessThanOrEqual(0);
    });
  }

  test("stacks several people as separate rows, in order", async ({ page }) => {
    const many = [0, 1, 2].map((index) => ({ index, name: `${PERSON_NAME} ${index + 1}`, evidence: PERSON_EVIDENCE }));
    await render(page, personCandidateBody(many), 440, 900);
    const rows = await personGeometry(page);
    expect(rows).toHaveLength(3);
    const tops = await page.evaluate(() =>
      [...document.querySelectorAll(".person-candidate-item")].map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect([...tops].sort((one, two) => one - two)).toEqual(tops);
    expect(new Set(tops).size, "two rows share a line").toBe(3);
  });

  test("is reachable by keyboard, in the order it reads", async ({ page }) => {
    await render(page, personCandidateBody(ONE_CANDIDATE), 440, 900);
    // From the row's first answer onward: the fixture's shell has controls of
    // its own before it, and they are not what this asserts.
    await page.locator(".person-candidate-actions button").first().focus();
    const focused: string[] = [await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "")];
    for (let step = 0; step < 2; step += 1) {
      await page.keyboard.press("Tab");
      focused.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ""));
    }
    expect(focused).toEqual(["Criar pessoa", "Ignorar", "Mudar o nome"]);
  });

  test("survives print emulation", async ({ page }) => {
    await page.emulateMedia({ media: "print" });
    try {
      for (const viewport of [PERSON_VIEWPORTS[0], PERSON_VIEWPORTS[2]]) {
        await render(page, personCandidateBody(ONE_CANDIDATE), viewport.width, viewport.height);
        const [row] = await personGeometry(page);
        expect(row.evidenceWordsPerLine, `${viewport.name} in print`).toBeGreaterThanOrEqual(PERSON_MIN_WORDS_PER_LINE);
        expect(row.anyOverlap, `${viewport.name} in print: overlap`).toBe(false);
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
      'className="person-candidate-list"',
      'className="person-candidate-item"',
      'className="person-candidate-question"',
      'className="person-candidate-evidence"',
      'className="person-candidate-actions"',
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
      expect(value.split(/\s+/u), "the person row is sharing `.candidate-item` again")
        .not.toContain("candidate-item");
    }
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Everything else a record can ask — an event, a birthday, keeping it as a
 * memory, confirming the reading — is the same row as the person one above.
 *
 * On 2026-11-18 these stopped being four differently-drawn widgets (a checkbox
 * list under a primary button, a heading with small buttons, a dashed card, a
 * centred panel) and became `.record-question` rows. What is measured here is
 * that they are answerable on a phone AND that, beside a person row, they read
 * as one list: same edges, same padding, same question size.
 */

const questionButton = (variant: string, label: string, extra = "") =>
  `<button class="ui-button ui-button--${variant} ui-button--md" type="button"${extra}>${label}</button>`;

/** Mirrors a pending row of `event-candidate-form.tsx`. */
function eventQuestion(title: string, meta: string) {
  return `<li><div class="record-question" role="group" aria-label="Evento sugerido: ${title}">`
    + `<p class="record-question-text">Pôr “${title}” na agenda?</p>`
    + `<p class="record-question-meta">${meta}</p>`
    + `<div class="record-question-actions">${questionButton("secondary", "Pôr na agenda")}${questionButton("ghost", "Agora não")}</div>`
    + `</div></li>`;
}

/** Mirrors an on-agenda row of `event-candidate-form.tsx`. */
function agendaStatement(title: string, meta: string) {
  return `<li class="record-question"><p class="record-question-text">“${title}” está na agenda.</p>`
    + `<p class="record-question-meta">${meta}</p>`
    + `<form class="record-question-actions">${questionButton("ghost", "Cancelar", ` aria-label="Cancelar ${title}"`)}</form></li>`;
}

/** Mirrors `birthday-proposal.tsx`. */
function birthdayQuestion(name: string) {
  return `<li><div class="record-question" role="group" aria-label="Aniversário de ${name}">`
    + `<p class="record-question-text">Guardar o aniversário de ${name}: 5 de maio?</p>`
    + `<form class="record-question-actions">${questionButton("secondary", "Guardar aniversário")}${questionButton("ghost", "Não, obrigado")}`
    + `<a class="record-question-link" href="#">Outra data? Ajuste na página de ${name}.</a></form>`
    + `<p class="birthday-status" role="status" aria-live="polite" data-status="idle"></p></div></li>`;
}

/** Mirrors `record-memory-question.tsx`, with *Ajustar* open or closed. */
function memoryQuestion(adjusting: boolean) {
  return `<div class="record-question" role="group" aria-label="Guardar isto como memória?">`
    + `<p class="record-question-text">Guardar isto como memória?</p>`
    + `<p class="record-question-meta">Tipo: Relacionamento</p>`
    + `<div class="record-question-actions">${questionButton("secondary", "Guardar memória")}${questionButton("ghost", "Descartar")}`
    + `${questionButton("link", "Ajustar", ` aria-controls="memory-adjust" aria-expanded="${adjusting}"`)}</div>`
    + `<div class="record-question-more" id="memory-adjust"${adjusting ? "" : " hidden"}>`
    + `<label for="memory-content">Memória</label><textarea id="memory-content" rows="3">Ana faz aniversário em 5 de maio.</textarea>`
    + `<label for="memory-kind">Tipo</label><select id="memory-kind"><option>Relacionamento</option></select></div></div>`;
}

/** Mirrors `confirmation-panel.tsx`. */
const CONFIRMATION_QUESTION = `<div class="record-question" role="group" aria-label="A leitura está certa?">`
  + `<p class="record-question-text">A leitura está certa?</p>`
  + `<p class="record-question-meta">Confirmar tira este registro da fila.</p>`
  + `<form class="record-question-actions">${questionButton("secondary", "Confirmar leitura")}</form></div>`;

function recordQuestionsBody({ title = "Revisão do carro", person = "Ana", adjusting = false } = {}) {
  return `<div class="content-page entry-detail-page"><div class="entry-review record-detail">
    <div class="record-detail-columns">
      <div class="record-decision">
        <section class="review-next-actions interpretation-actions phase-2b-task-actions" aria-label="Próximas ações">
          <div class="person-candidate-section">
            <ul class="person-candidate-list" aria-label="Pessoas mencionadas">${personCandidate({ index: 0, name: PERSON_NAME, evidence: PERSON_EVIDENCE })}</ul>
          </div>
          <div>
            <ul class="record-question-list" aria-label="Eventos sugeridos">${eventQuestion(title, "20 de nov. de 2026, 09:00 · Oficina do Zé")}</ul>
            <ul class="record-question-list" aria-label="Na agenda">${agendaStatement("Dentista", "12 de dez. de 2026, 15:00")}</ul>
          </div>
          <ul class="record-question-list" aria-label="Aniversário no registro">${birthdayQuestion(person)}</ul>
          ${memoryQuestion(adjusting)}
          ${CONFIRMATION_QUESTION}
        </section>
      </div>
      <aside class="record-explanation"></aside>
    </div>
  </div></div>`;
}

type QuestionGeometry = {
  label: string;
  left: number;
  right: number;
  paddingTop: string;
  paddingBottom: string;
  borderBottom: string;
  questionFont: string;
  targetHeights: number[];
  targetsWithinRow: boolean;
  anyOverlap: boolean;
  fieldWidths: number[];
};

async function questionGeometry(page: Page): Promise<QuestionGeometry[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".record-question, .person-candidate-item")].map((row) => {
      const rowBox = row.getBoundingClientRect();
      const rowStyle = getComputedStyle(row);
      const question = row.querySelector(".record-question-text, .person-candidate-question") as HTMLElement;
      const shown = (el: Element) => {
        const box = el.getBoundingClientRect();
        return getComputedStyle(el).display !== "none" && box.width > 0 && box.height > 0;
      };
      const targets = ([...row.querySelectorAll("button, a")] as HTMLElement[]).filter(shown);
      const fields = ([...row.querySelectorAll("textarea, select")] as HTMLElement[]).filter(shown);
      const parts = ([...row.querySelectorAll("p, button, a, textarea, select, label")] as HTMLElement[])
        .filter(shown)
        .map((el) => el.getBoundingClientRect());
      return {
        label: (question.textContent ?? "").trim(),
        left: Math.round(rowBox.left),
        right: Math.round(rowBox.right),
        paddingTop: rowStyle.paddingTop,
        paddingBottom: rowStyle.paddingBottom,
        borderBottom: `${rowStyle.borderBottomWidth} ${rowStyle.borderBottomStyle}`,
        questionFont: `${getComputedStyle(question).fontFamily} ${getComputedStyle(question).fontSize} ${getComputedStyle(question).lineHeight}`,
        targetHeights: targets.map((target) => Math.round(target.getBoundingClientRect().height)),
        targetsWithinRow: targets.every((target) => {
          const box = target.getBoundingClientRect();
          return box.left >= rowBox.left - 0.5 && box.right <= rowBox.right + 0.5;
        }),
        anyOverlap: parts.some((one, i) => parts.some((two, j) => i < j
          && one.left < two.right - 0.5 && two.left < one.right - 0.5
          && one.top < two.bottom - 0.5 && two.top < one.bottom - 0.5)),
        fieldWidths: fields.map((field) => Math.round(field.getBoundingClientRect().width)),
      };
    }),
  );
}

const QUESTION_VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "320x700", width: 320, height: 700 },
] as const;

test.describe("the record's other questions are rows of the same list", () => {
  for (const viewport of QUESTION_VIEWPORTS) {
    test(`every question can be answered at ${viewport.name}`, async ({ page }) => {
      await render(page, recordQuestionsBody(), viewport.width, viewport.height);
      const rows = await questionGeometry(page);
      expect(rows, `${viewport.name}: person, event, agenda, birthday, memory, confirmation`).toHaveLength(6);

      for (const row of rows) {
        expect(row.targetHeights.length, `${viewport.name}: “${row.label}” has no answer`).toBeGreaterThan(0);
        for (const height of row.targetHeights) {
          expect(height, `${viewport.name}: “${row.label}” has a ${height}px target`).toBeGreaterThanOrEqual(TOUCH_TARGET);
        }
        expect(row.targetsWithinRow, `${viewport.name}: an answer of “${row.label}” leaves the row`).toBe(true);
        expect(row.anyOverlap, `${viewport.name}: parts of “${row.label}” overlap`).toBe(false);
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.name}: the page scrolls sideways`).toBeLessThanOrEqual(0);
    });

    test(`the kinds read as one list at ${viewport.name}`, async ({ page }) => {
      await render(page, recordQuestionsBody(), viewport.width, viewport.height);
      const rows = await questionGeometry(page);
      const [first] = rows;
      for (const row of rows) {
        expect([row.left, row.right], `${viewport.name}: “${row.label}” has its own edges`).toEqual([first.left, first.right]);
        expect([row.paddingTop, row.paddingBottom], `${viewport.name}: “${row.label}” has its own padding`)
          .toEqual([first.paddingTop, first.paddingBottom]);
        expect(row.borderBottom, `${viewport.name}: “${row.label}” has its own rule`).toBe(first.borderBottom);
        expect(row.questionFont, `${viewport.name}: “${row.label}” is set in its own type`).toBe(first.questionFont);
      }
      // Rows touch: no kind opens with a gap of its own.
      const gaps = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll(".record-question, .person-candidate-item")].map((row) => row.getBoundingClientRect());
        return boxes.slice(1).map((box, index) => Math.round(box.top - boxes[index].bottom));
      });
      expect(gaps, `${viewport.name}: a gap between two rows`).toEqual([0, 0, 0, 0, 0]);
    });

    test(`holds a long title, a long name and the open adjust fields at ${viewport.name}`, async ({ page }) => {
      await render(
        page,
        recordQuestionsBody({ title: "Reuniãodeacompanhamentotrimestralcomofornecedor de peças", person: LONG_NAME, adjusting: true }),
        viewport.width,
        viewport.height,
      );
      const rows = await questionGeometry(page);
      for (const row of rows) {
        expect(row.targetsWithinRow, `${viewport.name}: an answer of “${row.label}” leaves the row`).toBe(true);
        expect(row.anyOverlap, `${viewport.name}: parts of “${row.label}” overlap`).toBe(false);
      }
      const memory = rows.find((row) => row.label === "Guardar isto como memória?");
      expect(memory?.fieldWidths, `${viewport.name}: the text and the kind are drawn`).toHaveLength(2);
      for (const width of memory?.fieldWidths ?? []) {
        expect(width, `${viewport.name}: an adjust field is ${width}px`).toBeGreaterThanOrEqual((memory?.right ?? 0) - (memory?.left ?? 0) - 2);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.name}: a long title scrolls the page sideways`).toBeLessThanOrEqual(0);
    });
  }

  test("the adjust fields are not drawn at rest", async ({ page }) => {
    await render(page, recordQuestionsBody(), 390, 844);
    const rows = await questionGeometry(page);
    expect(rows.flatMap((row) => row.fieldWidths)).toEqual([]);
  });

  test("the fixture still mirrors the markup the components emit", () => {
    const sources: Record<string, string[]> = {
      "src/features/events/event-candidate-form.tsx": [
        'className="record-question-list"', 'className="record-question"', 'className="record-question-text"',
        'className="record-question-meta"', 'className="record-question-actions"',
      ],
      "src/features/birthdays/birthday-proposal.tsx": [
        'className="record-question-list"', 'className="record-question"', 'className="record-question-text"',
        'className="record-question-actions"', 'className="record-question-link"', 'className="birthday-status"',
      ],
      "src/features/memories/record-memory-question.tsx": [
        'className="record-question"', 'className="record-question-text"', 'className="record-question-meta"',
        'className="record-question-actions"', 'className="record-question-more"',
      ],
      "src/features/interpretations/confirmation-panel.tsx": [
        'className="record-question"', 'className="record-question-text"', 'className="record-question-meta"',
        'className="record-question-actions"',
      ],
    };
    for (const [file, tokens] of Object.entries(sources)) {
      const component = readFileSync(join(ROOT, ...file.split("/")), "utf8");
      for (const token of tokens) {
        expect(component, `${file} no longer emits ${token}`).toContain(token);
      }
      // One primary control per view: none of these rows may claim it.
      expect(component, `${file} draws a primary button`).not.toContain('variant="primary"');
    }
  });
});

/*
 * Life Brain A.3 (`LB-A-006`) — the compact Tarefas page, mirroring what
 * `WorkView` renders: `PageHeader compact` with the quick add as its action,
 * (since Life Brain A.4, no Lista · Calendário · Planejar strip), the `SegmentedControl` for the
 * views, and the toolbar of ghost buttons. The baseline recorded a two-line
 * "Adicionar" and segmented options under the touch minimum on a phone.
 */
function tarefasBody(options: { quickAddOpen?: boolean } = {}) {
  const ghost = "ui-button ui-button--ghost ui-button--sm";
  const icon = '<span aria-hidden="true" class="ui-button__icon"><svg width="16" height="16"></svg></span>';
  return `<div class="content-page work-page">
    <header class="ui-page-header ui-page-header--compact work-page-header">
      <div class="ui-page-header__text"><h1 class="ui-page-header__title">Tarefas</h1>
        <p class="ui-page-header__description">Prazos de hoje e atrasos que ainda estão abertos.</p></div>
      <div class="ui-page-header__actions"><details class="work-quick-add"${options.quickAddOpen ? " open" : ""}>
        <summary class="ui-button ui-button--primary ui-button--md ui-icon-button">${icon}<span class="sr-only">Adicionar uma tarefa</span></summary>
        <div><form class="inline-create">
          <label for="new-task" class="sr-only">Nova tarefa</label>
          <input id="new-task" name="name" placeholder="Nova tarefa">
          <button type="submit" aria-label="Adicionar nova tarefa" class="ui-button ui-button--primary ui-button--md ui-icon-button">${icon}</button>
        </form></div>
      </details></div>
    </header>
    <div class="work-controls">
      <nav aria-label="Visões das tarefas" class="ui-segmented work-view-tabs">
        <a aria-current="page" class="ui-segmented__option" href="#">Hoje</a><a class="ui-segmented__option" href="#">Todas</a><a class="ui-segmented__option" href="#">Aguardando</a>
      </nav>
      <div class="work-toolbar">
        <details class="work-disclosure"><summary class="${ghost}">${icon}<span class="ui-button__label work-control-label">Filtros</span></summary></details>
        <details class="work-disclosure"><summary class="${ghost}">${icon}<span class="ui-button__label work-control-label">Mude uma tarefa com suas palavras</span></summary></details>
      </div>
    </div>
    <div class="list-stack">${taskRow("first-task", "Exame de sangue")}${taskRow("second-task", LONG_TITLE)}</div>
  </div>`;
}

/** Mirrors `TaskRow` (part 3): selection, title + meta line, state + actions. */
function taskRow(id: string, title: string) {
  const icon = '<span aria-hidden="true" class="ui-button__icon"><svg width="16" height="16"></svg></span>';
  return `<article class="list-row work-row" id="${id}">`
    + `<label class="work-row-select"><input type="checkbox"><span class="sr-only">Selecionar ${title}</span></label>`
    + `<div class="list-row-main"><a class="work-title-link" href="#"><strong>${title}</strong></a>`
    + `<div class="work-row-meta"><small class="work-origin">Criada por você</small><span>06/11/2026, 12:00</span>`
    + `<span class="ui-badge ui-badge--sm">Alta</span><span class="work-relations"><span class="ui-badge ui-badge--sm">Saúde</span></span></div></div>`
    + `<div class="list-meta"><span class="ui-badge ui-badge--sm">Não iniciada</span>`
    + `<div class="work-row-inline"><div class="row-actions">`
    + `<form><button class="row-action" type="submit">Concluir</button></form>`
    + `<form><button class="row-action" type="submit">Aguardar</button></form></div>`
    + `<details class="work-quick-edit"><summary class="work-quick-edit-summary">Editar aqui</summary></details></div>`
    + `<button aria-haspopup="dialog" aria-label="Mais ações para ${title}" class="ui-button ui-button--ghost ui-button--md ui-icon-button work-row-more" type="button">${icon}</button>`
    + `</div></article>`;
}

/** Mirrors the open sheet: `ConfirmDialog` with `work-row-sheet`, portalled to body. */
function rowSheet() {
  return `<div class="task-command-dialog-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="s-title" class="task-command-dialog work-row-sheet">`
    + `<h3 id="s-title">Exame de sangue</h3><p>O que fazer com esta tarefa.</p>`
    + `<div class="task-command-dialog-body"><div class="row-actions">`
    + `<form><button class="row-action" type="submit">Concluir</button></form>`
    + `<form><button class="row-action" type="submit">Aguardar</button></form></div>`
    + `<a class="ui-button ui-button--secondary ui-button--md" href="#">Abrir tarefa</a>`
    + `<button class="task-command-dialog-cancel" type="button">Fechar</button></div></div></div>`;
}

test.describe("Life Brain A.3: the compact Tarefas page on a phone", () => {
  test("the quick add waits behind a square "+" on the title's row", async ({ page }) => {
    await render(page, tarefasBody(), 390, 844);
    const plus = (await page.locator(".work-quick-add > summary").boundingBox())!;
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(plus.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(plus.width - plus.height)).toBeLessThanOrEqual(1);
    expect(plus.y).toBeLessThan(title.y + title.height);
    await expect(page.getByLabel("Nova tarefa", { exact: true })).toBeHidden();
  });

  test("the views and both toolbar buttons fit one row on a 390px phone", async ({ page }) => {
    await render(page, tarefasBody(), 390, 844);
    const tops = await page.locator(".work-controls > nav, .work-controls summary").evaluateAll(
      (nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
    );
    expect(tops).toHaveLength(3);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(8);
  });

  /*
   * Life Brain A.4 removed the Lista · Calendário · Planejar strip (~66px).
   * A.3 measured the first task at 286px with it; the plan's target is 180px.
   * What is left above the first task is the top bar and the page padding,
   * a shell change recorded for A.6 — so the bound here is the measured
   * result, held so it cannot creep back.
   */
  test("the first task starts higher now that the modes strip is gone", async ({ page }) => {
    await render(page, tarefasBody(), 390, 844);
    const top = Math.round((await page.locator("#first-task").boundingBox())!.y);
    expect(top, `the first task starts at ${top}px`).toBeLessThanOrEqual(230);
  });

  test("the add control is one square that never wraps, and the field takes the width", async ({ page }) => {
    await render(page, tarefasBody({ quickAddOpen: true }), 390, 844);
    const add = page.getByRole("button", { name: "Adicionar nova tarefa" });
    const box = (await add.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
    const field = (await page.getByLabel("Nova tarefa", { exact: true }).boundingBox())!;
    expect(Math.abs((field.y + field.height / 2) - (box.y + box.height / 2))).toBeLessThanOrEqual(2);
    expect(field.width).toBeGreaterThan(box.width * 3);
  });

  test("every view option and toolbar button meets the touch minimum", async ({ page }) => {
    await render(page, tarefasBody(), 390, 844);
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    for (const name of ["Hoje", "Todas", "Aguardando"]) {
      const box = (await page.getByRole("navigation", { name: "Visões das tarefas" }).getByRole("link", { name }).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    if (coarse) {
      for (const summary of await page.locator(".work-toolbar summary").all()) {
        expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("the page never scrolls sideways at 320 CSS px", async ({ page }) => {
    await render(page, tarefasBody(), 320, 700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Life Brain A.3 part 3: the task row and its sheet", () => {
  test("on a phone the row keeps three slots, shows the “⋯” and hides the inline verbs", async ({ page }) => {
    await render(page, tarefasBody(), 390, 844);
    const row = page.locator("#first-task");
    await expect(row.locator(".work-row-more")).toBeVisible();
    await expect(row.locator(".work-row-inline")).toBeHidden();
    const more = (await row.locator(".work-row-more").boundingBox())!;
    expect(more.width).toBeGreaterThanOrEqual(44);
    expect(more.height).toBeGreaterThanOrEqual(44);
    const title = (await row.locator(".list-row-main").boundingBox())!;
    // The title keeps the row's width: the trailing column is narrow, beside it.
    expect(title.width).toBeGreaterThan(180);
    // The state badge sits over the "⋯"; both stay within the title's first lines.
    expect(more.y - title.y).toBeLessThanOrEqual(40);
  });

  test("on a phone a short task is one compact row, not a stack", async ({ page }) => {
    await render(page, tarefasBody(), 390, 844);
    const height = (await page.locator("#first-task").boundingBox())!.height;
    // A title, one wrapped meta line and the state-over-"⋯" column. Before
    // part 3 the same row stacked its dates, chips, two full-width verbs and
    // "Editar aqui" under the title.
    expect(height).toBeLessThanOrEqual(120);
  });

  test("from a tablet up the verbs are inline and the “⋯” is gone", async ({ page }) => {
    await render(page, tarefasBody(), 1280, 900);
    const row = page.locator("#first-task");
    await expect(row.locator(".work-row-inline .row-action").first()).toBeVisible();
    await expect(row.locator(".work-row-more")).toBeHidden();
  });

  test("a long title never pushes the trailing slot off the row", async ({ page }) => {
    await render(page, tarefasBody(), 375, 812);
    const row = (await page.locator("#second-task").boundingBox())!;
    const more = (await page.locator("#second-task .work-row-more").boundingBox())!;
    expect(more.x + more.width).toBeLessThanOrEqual(row.x + row.width + 1);
  });

  test("the sheet rises from the bottom at full width on a phone", async ({ page }) => {
    await render(page, rowSheet(), 390, 844);
    const sheet = (await page.getByRole("dialog").boundingBox())!;
    expect(Math.round(sheet.width)).toBe(390);
    expect(Math.round(sheet.y + sheet.height)).toBe(844);
    for (const name of ["Concluir", "Aguardar", "Fechar"]) {
      const box = (await page.getByRole("dialog").getByRole("button", { name }).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test("the same dialog stays centred on a desktop", async ({ page }) => {
    await render(page, rowSheet(), 1280, 900);
    const sheet = (await page.getByRole("dialog").boundingBox())!;
    expect(sheet.width).toBeLessThanOrEqual(461);
    expect(Math.abs(sheet.x + sheet.width / 2 - 640)).toBeLessThanOrEqual(2);
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Life Brain A.5 — Notificações with fifty notices fits in 3,500px on a phone
 * (`IMPLEMENTATION_PLAN.md` §A.5). Each row is two lines and one visible
 * control; the verbs wait behind a "⋯".
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Mirrors `NotificationHistoryRow` with `NotificationVerbs collapsed`. */
function notificationItem(index: number) {
  const status = index % 3 === 0 ? "unread" : "read";
  const title = index % 5 === 0 ? LONG_TITLE : `Tarefa atrasada ${index}`;
  return `<li class="notification-item" data-status="${status}">`
    + `<span aria-hidden="true" class="notification-item-dot"></span>`
    + `<div class="notification-item-main"><p class="notification-item-title">${title}</p>`
    + `<p class="notification-item-meta"><span class="notification-status-badge" data-status="${status}">${status === "unread" ? "Não lida" : "Lida"}</span>`
    + `<span class="notification-item-time">04/11/2026, 14:00</span>`
    + `<span class="notification-item-body">Pagar a conta de luz antes do vencimento, que é amanhã de manhã</span></p></div>`
    + `<div class="notification-item-trailing">`
    + `<a aria-label="Abrir: ${title}" class="row-action notification-open-link" href="#">Abrir</a>`
    + `<div class="notification-row-actions"><div class="notification-verb-menu">`
    + `<button aria-haspopup="menu" aria-label="Mais ações para: ${title}" class="row-action notification-menu-trigger notification-menu-trigger--icon" type="button">${ICON}</button></div>`
    + `<p aria-live="polite" class="notification-row-outcome" role="status"></p></div>`
    + `</div></li>`;
}

function notificationsBody(count: number) {
  return `<div class="content-page">`
    + `<header class="ui-page-header ui-page-header--compact"><div class="ui-page-header__text"><h1 class="ui-page-header__title">Notificações</h1>`
    + `<p class="ui-page-header__description">Somente sinais relevantes, com deduplicação e respeito ao silêncio.</p></div>`
    + `<div class="ui-page-header__actions"><a class="notification-preferences-link" href="#">Ajustar preferências de notificação</a></div></header>`
    + `<section class="notification-history"><h2>Avisos recebidos</h2><p class="notification-unread-summary" role="status">17 não lidas</p>`
    + `<ul class="notification-list">${Array.from({ length: count }, (_, index) => notificationItem(index)).join("")}</ul>`
    + `<nav class="pagination-links" aria-label="Paginação"><a href="#">Próxima</a></nav></section></div>`;
}

test.describe("Life Brain A.5: Notificações on a phone", () => {
  test("fifty notices fit in 3,500px at 390px", async ({ page }) => {
    await render(page, notificationsBody(50), 390, 844);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThanOrEqual(3500);
  });

  test("each row is two lines high, with one visible control and the “⋯”", async ({ page }) => {
    await render(page, notificationsBody(6), 390, 844);
    const rows = await page.locator(".notification-item").evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    for (const height of rows) expect(height).toBeLessThanOrEqual(70);
    for (const control of await page.locator(".notification-open-link, .notification-menu-trigger").all()) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // The trailing controls sit on the title's row, never under it.
    const first = page.locator(".notification-item").first();
    const title = (await first.locator(".notification-item-title").boundingBox())!;
    const trigger = (await first.locator(".notification-menu-trigger").boundingBox())!;
    expect(trigger.x).toBeGreaterThan(title.x + title.width - 1);
  });

  test("the page never scrolls sideways at 320 CSS px", async ({ page }) => {
    await render(page, notificationsBody(6), 320, 700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("the fixture still mirrors the markup the component emits", () => {
    const row = readFileSync(join(ROOT, "src", "features", "notifications", "notification-history-row.tsx"), "utf8");
    for (const name of ["notification-item", "notification-item-dot", "notification-item-main", "notification-item-title",
      "notification-item-meta", "notification-status-badge", "notification-item-time", "notification-item-body",
      "notification-item-trailing", "row-action notification-open-link"]) {
      expect(row, `the row lost ${name}`).toContain(`className="${name}"`);
    }
    const actions = readFileSync(join(ROOT, "src", "features", "notifications", "notification-row-actions.tsx"), "utf8");
    expect(actions).toContain("notification-menu-trigger notification-menu-trigger--icon");
    expect(actions).toContain('className="notification-row-outcome"');
  });
});
