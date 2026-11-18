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
 * Avisos (Life Brain A.5, recomposed by Editorial calmo, ADR-180).
 *
 * A.5's budget stands: fifty notices fit in 3,500px on a phone
 * (`IMPLEMENTATION_PLAN.md` §A.5). What changed is what a row is. An unanswered
 * notice is its subject, one caption and a line with its one visible verb, the
 * "⋯" and "Abrir"; a read one is a single quieter row. Unread notices come
 * first under the line that counts them; the read ones follow behind a
 * disclosure, folded once there are more than a few beside something unread.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Mirrors `NotificationHistoryRow`: verbs shown when unread, collapsed when read. */
function notificationItem(index: number, status: "unread" | "read") {
  const subject = index % 5 === 0 ? LONG_TITLE : `Pagar a conta de luz ${index}`;
  const kind = "Tarefa atrasada";
  const primary = status === "unread"
    ? `<form><input name="verb" type="hidden" value="complete_task"><button aria-label="Concluir tarefa: ${subject}" class="row-action notification-primary-action" type="submit">Concluir tarefa</button></form>`
    : "";
  return `<li class="notification-item" data-status="${status}">`
    + `<div class="notification-item-main"><p class="notification-item-subject">${subject}</p>`
    + `<p class="notification-item-meta"><span class="notification-item-kind">${kind}</span>`
    + `<span class="notification-item-time">4 de nov. de 2026, 14:00</span>`
    + `<span class="notification-status-badge" data-status="${status}">${status === "unread" ? "Não lida" : "Lida"}</span></p></div>`
    + `<div class="notification-item-verbs"><div class="notification-row-actions">${primary}<div class="notification-verb-menu">`
    + `<button aria-haspopup="menu" aria-label="Mais ações para: ${subject}" class="row-action notification-menu-trigger notification-menu-trigger--icon" type="button">${ICON}</button></div>`
    + `<p aria-live="polite" class="notification-row-outcome" role="status"></p></div></div>`
    + `<a aria-label="Abrir: ${kind}" class="notification-open-link" href="#"><span class="notification-open-label">Abrir</span></a>`
    + `</li>`;
}

/** Mirrors `notifications/page.tsx`. `readFolded` is the page's own rule, stated by the caller. */
function notificationsBody(options: { unread: number; read: number; readFolded: boolean }) {
  const unread = Array.from({ length: options.unread }, (_, index) => notificationItem(index, "unread")).join("");
  const read = Array.from({ length: options.read }, (_, index) => notificationItem(index + 1, "read")).join("");
  const bulk = (label: string) => `<form class="notification-bulk-form"><button class="notification-bulk-verb" type="submit">${label}</button></form>`;
  return `<div class="content-page notification-page">`
    + `<nav aria-label="Dados e conta" class="data-ai-tabs"><a class="data-ai-up" href="#">${ICON}Voltar para Ajustes</a><div class="data-ai-lenses"><span aria-current="page" class="data-ai-lens">Notificações</span></div></nav>`
    + `<header class="ui-page-header ui-page-header--compact"><div class="ui-page-header__text"><h1 class="ui-page-header__title">Notificações</h1></div></header>`
    + `<section class="notification-history"><h2 class="sr-only">Avisos recebidos</h2>`
    + `<div class="notification-group-head"><p class="notification-unread-summary" role="status">${options.unread ? `${options.unread} avisos não lidos.` : "Nenhum aviso não lido."}</p>${options.unread ? bulk("Marcar todos como lidos") : ""}</div>`
    + `<div aria-label="Todos os avisos" class="notification-bulk-outcome" role="group"><p aria-live="polite" class="notification-bulk-message" role="status"></p></div>`
    + (options.unread ? `<ul class="notification-list">${unread}</ul>` : "")
    + (options.read ? `<details class="notification-read"${options.readFolded ? "" : " open"}><summary class="notification-read-summary"><span>Já lidos</span><span class="notification-read-count">${options.read}</span></summary><ul class="notification-list">${read}</ul>${bulk("Limpar os lidos")}</details>` : "")
    + `<nav class="pagination-links" aria-label="Paginação"><a href="#">Próxima</a></nav>`
    + `<p class="notification-page-foot"><a class="notification-preferences-link" href="#">Ajustar preferências de notificação</a></p></section></div>`;
}

/** Every visible control inside `scope` shorter than a touch target, as "label:height". */
async function shortTargets(page: Page, scope: string) {
  return page.evaluate(({ selector, minimum }) => {
    const root = document.querySelector(selector);
    if (!root) return ["scope not found"];
    return [...root.querySelectorAll<HTMLElement>("a, button, summary, input:not([type=hidden]), select")]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => ({ label: (node.textContent ?? "").trim().slice(0, 24) || node.tagName, height: Math.round(node.getBoundingClientRect().height) }))
      .filter((entry) => entry.height < minimum)
      .map((entry) => `${entry.label}:${entry.height}`);
  }, { selector: scope, minimum: TOUCH_TARGET });
}

async function sidewaysOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("Avisos on a phone (Life Brain A.5, Editorial calmo)", () => {
  test("fifty notices fit in 3,500px at 390px — seventeen unread, the read ones folded", async ({ page }) => {
    await renderLogbook(page, notificationsBody({ unread: 17, read: 33, readFolded: true }), 390, 844);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThanOrEqual(3500);
  });

  test("fifty read notices, standing open, still fit in 3,500px at 390px", async ({ page }) => {
    await renderLogbook(page, notificationsBody({ unread: 0, read: 50, readFolded: false }), 390, 844);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThanOrEqual(3500);
  });

  test("a read row is two lines high: subject and caption, the “⋯” beside them, the row as its link", async ({ page }) => {
    await renderLogbook(page, notificationsBody({ unread: 0, read: 6, readFolded: false }), 390, 844);
    const rows = await page.locator(".notification-item").evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
    for (const height of rows) expect(height).toBeLessThanOrEqual(70);
    const first = page.locator(".notification-item").first();
    const subject = (await first.locator(".notification-item-subject").boundingBox())!;
    const trigger = (await first.locator(".notification-menu-trigger").boundingBox())!;
    expect(trigger.x).toBeGreaterThan(subject.x + subject.width - 1);
    expect(trigger.y).toBeLessThan(subject.y + subject.height);
    // One caption line: the kind and the time fit beside the "⋯" at 390.
    expect((await first.locator(".notification-item-meta").boundingBox())!.height).toBeLessThanOrEqual(24);
    // No "Abrir" is drawn on a read row; the subject is where the link is pressed.
    expect((await first.locator(".notification-open-label").boundingBox())!.width).toBeLessThanOrEqual(1);
    const pressed = await first.locator(".notification-item-subject").evaluate((node) => {
      const box = node.getBoundingClientRect();
      return document.elementFromPoint(box.x + 20, box.y + box.height / 2)?.closest("a")?.className ?? "";
    });
    expect(pressed).toContain("notification-open-link");
  });

  test("an unread row is its subject, its caption, then one line of verb, “⋯” and “Abrir”", async ({ page }) => {
    await renderLogbook(page, notificationsBody({ unread: 3, read: 0, readFolded: false }), 390, 844);
    const row = page.locator(".notification-item").nth(1);
    const caption = (await row.locator(".notification-item-meta").boundingBox())!;
    const verb = (await row.locator(".notification-primary-action").boundingBox())!;
    const trigger = (await row.locator(".notification-menu-trigger").boundingBox())!;
    const open = (await row.locator(".notification-open-link").boundingBox())!;
    // Under the caption, never beside the subject.
    expect(verb.y).toBeGreaterThanOrEqual(caption.y + caption.height - 1);
    // One line: the three share a vertical centre.
    const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(centre(verb) - centre(trigger))).toBeLessThanOrEqual(2);
    expect(Math.abs(centre(verb) - centre(open))).toBeLessThanOrEqual(2);
    // Left to right in the order the document reads.
    expect(trigger.x).toBeGreaterThan(verb.x);
    expect(open.x).toBeGreaterThan(trigger.x);
    // The caption is one line at 390.
    expect(caption.height).toBeLessThanOrEqual(24);
  });

  test("the row is the link, and a verb is never under it", async ({ page }) => {
    await renderLogbook(page, notificationsBody({ unread: 2, read: 0, readFolded: false }), 390, 844);
    const row = page.locator(".notification-item").first();
    const hit = (selector: string) => row.locator(selector).evaluate((node) => {
      const box = node.getBoundingClientRect();
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return top?.closest("a, button")?.className ?? "";
    });
    expect(await hit(".notification-item-subject")).toContain("notification-open-link");
    expect(await hit(".notification-item-meta")).toContain("notification-open-link");
    expect(await hit(".notification-primary-action")).toContain("notification-primary-action");
    expect(await hit(".notification-menu-trigger")).toContain("notification-menu-trigger");
  });

  test("the unread line carries its bulk verb, and no bar stands above the list", async ({ page }) => {
    await renderLogbook(page, notificationsBody({ unread: 3, read: 5, readFolded: true }), 390, 844);
    const summary = (await page.locator(".notification-unread-summary").boundingBox())!;
    const verb = (await page.locator(".notification-group-head .notification-bulk-verb").boundingBox())!;
    expect(verb.y).toBeLessThan(summary.y + summary.height);
    expect(verb.x).toBeGreaterThan(summary.x + summary.width - 1);
    // At rest the outcome region is in the tree and takes no height.
    const outcome = (await page.locator(".notification-bulk-outcome").boundingBox())!;
    expect(outcome.height).toBeLessThanOrEqual(1);
    // Folded: the read rows are not drawn, and their heading is one target tall.
    await expect(page.locator(".notification-read .notification-item").first()).toBeHidden();
    expect((await page.locator(".notification-read-summary").boundingBox())!.height).toBeLessThanOrEqual(48);
  });

  for (const width of [390, 320]) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px`, async ({ page }) => {
      await renderLogbook(page, notificationsBody({ unread: 6, read: 6, readFolded: false }), width, 800);
      expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(1);
      expect(await shortTargets(page, ".notification-history")).toEqual([]);
    });
  }

  test("the fixture still mirrors the markup the components emit", () => {
    const row = readFileSync(join(ROOT, "src", "features", "notifications", "notification-history-row.tsx"), "utf8");
    for (const name of ["notification-item", "notification-item-main", "notification-item-subject",
      "notification-item-meta", "notification-item-kind", "notification-item-time", "notification-status-badge",
      "notification-item-verbs", "notification-open-link", "notification-open-label"]) {
      expect(row, `the row lost ${name}`).toContain(`className="${name}"`);
    }
    // Verbs before the link, in the document as on the screen.
    expect(row.indexOf('className="notification-item-verbs"')).toBeLessThan(row.indexOf('className="notification-open-link"'));
    const actions = readFileSync(join(ROOT, "src", "features", "notifications", "notification-row-actions.tsx"), "utf8");
    expect(actions).toContain("notification-menu-trigger notification-menu-trigger--icon");
    expect(actions).toContain('className="notification-row-outcome"');
    const bulk = readFileSync(join(ROOT, "src", "features", "notifications", "notification-bulk-bar.tsx"), "utf8");
    for (const name of ["notification-bulk-form", "notification-bulk-verb", "notification-bulk-outcome", "notification-bulk-message"]) {
      expect(bulk, `the bulk verbs lost ${name}`).toContain(`className="${name}"`);
    }
    const route = readFileSync(join(ROOT, "src", "app", "[locale]", "app", "notifications", "page.tsx"), "utf8");
    for (const name of ["content-page notification-page", "notification-history", "notification-group-head",
      "notification-unread-summary", "notification-list", "notification-read", "notification-read-summary",
      "notification-read-count", "notification-page-foot", "notification-preferences-link"]) {
      expect(route, `the page lost ${name}`).toContain(`className="${name}"`);
    }
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Histórico, as a logbook (Editorial calmo, ADR-180). Days are headings over a
 * rule; an event is one row — its sentence and one caption — and the row is the
 * link. The filters are one closed line at every width.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const HISTORY_CSS = readFileSync(join(ROOT, "src", "app", "history.css"), "utf8");

const LONG_SENTENCE = `Você alterou a tarefa “${LONG_TITLE}”`;

/** Mirrors one `<li>` of `HistoryList`. */
function logbookEvent(options: { sentence: string; kind: string; time: string; linked?: boolean; actor?: string; changes?: boolean; gone?: boolean }) {
  const changes = options.changes
    ? `<dl class="history-changes">`
      + `<div class="history-change"><dt>Situação</dt><dd><span class="history-change-from">A fazer</span><span aria-hidden="true"> → </span><span class="history-change-to">Em andamento</span></dd></div>`
      + `<div class="history-change"><dt>Prazo</dt><dd><span class="history-change-from">20 de nov. de 2026</span><span aria-hidden="true"> → </span><span class="history-change-to">19 de nov. de 2026</span></dd></div>`
      + `</dl>`
    : "";
  const body = `<span class="history-sentence">${options.sentence}</span>${changes}`
    + `<span class="history-meta"><span class="history-kind">${options.kind}</span><time datetime="2026-11-18T14:12:00.000Z">${options.time}</time>`
    + `${options.gone ? "<span>Este item não está mais disponível.</span>" : ""}</span>`;
  return `<li class="history-event" data-actor="${options.actor ?? "user"}">`
    + (options.linked === false ? `<div class="history-event-body">${body}</div>` : `<a class="history-event-link" href="#">${body}</a>`)
    + `</li>`;
}

function logbookDay(label: string, events: string[]) {
  return `<section aria-label="${label}" class="history-day"><h2 class="history-day-title">${label}</h2><ol class="history-list">${events.join("")}</ol></section>`;
}

/** Mirrors `history/page.tsx` with `DataAiTabs`, `HistoryFilterControls` and `HistoryList`. */
function logbookBody(options: { filtered?: boolean; filtersOpen?: boolean } = {}) {
  const field = (id: string, label: string, control: string) => `<div class="history-filter-field"><label for="${id}">${label}</label>${control}</div>`;
  const select = (id: string, any: string) => `<select id="${id}" name="${id}"><option value="">${any}</option><option value="x">Opção</option></select>`;
  const filters = `<section class="history-filters" aria-label="Filtrar histórico">`
    + `<details class="history-filters-disclosure"${options.filtersOpen ? " open" : ""}><summary class="history-filters-summary">Filtros</summary>`
    + `<form class="history-filters-form" method="get" action="#">`
    + field("history-from", "De", `<input id="history-from" name="from" type="date">`)
    + field("history-to", "Até", `<input id="history-to" name="to" type="date">`)
    + field("history-actor", "Quem", select("history-actor", "Qualquer pessoa"))
    + field("history-entity", "Tipo de item", select("history-entity", "Qualquer item"))
    + field("history-category", "Tipo de ação", select("history-category", "Qualquer ação"))
    + `<div class="history-filter-actions"><button class="ui-button ui-button--secondary ui-button--md" type="submit">Aplicar filtros</button></div>`
    + `</form></details>`
    + (options.filtered
      ? `<div class="history-active"><ul class="history-active-filters" aria-label="Filtros ativos"><li>Quem: Você</li><li>Tipo de item: tarefa</li><li>Tipo de ação: Alteração de situação</li></ul><a class="history-filters-clear" href="#">Limpar filtros</a></div>`
      : "")
    + `</section>`;
  return `<div class="content-page history-page">`
    + `<nav aria-label="Dados e IA" class="data-ai-tabs"><a class="data-ai-up" href="#">${ICON}Ajustes</a><div class="data-ai-lenses">`
    + `<a class="data-ai-lens" aria-current="page" href="#">Atividade</a><a class="data-ai-lens" href="#">Custos</a><a class="data-ai-lens" href="#">Processamento</a></div></nav>`
    + `<header class="ui-page-header ui-page-header--compact"><div class="ui-page-header__text"><h1 class="ui-page-header__title">Histórico de alterações</h1></div></header>`
    + filters
    + `<div class="history-days">`
    + logbookDay("quarta-feira, 18 de novembro de 2026", [
      logbookEvent({ sentence: LONG_SENTENCE, kind: "tarefa", time: "11:12", changes: true }),
      logbookEvent({ sentence: "O Michael interpretou o registro “Revisão do carro na sexta às 9h”", kind: "registro", time: "10:40", actor: "agent" }),
      logbookEvent({ sentence: "Você marcou todos os avisos como lidos", kind: "avisos", time: "09:02", linked: false }),
    ])
    + logbookDay("terça-feira, 17 de novembro de 2026", [
      logbookEvent({ sentence: "Você desfez uma alteração", kind: "tarefa", time: "09:10", linked: false, gone: true }),
      logbookEvent({ sentence: "O sistema devolveu um processamento à fila", kind: "processamento", time: "10:02", linked: false, actor: "system" }),
      logbookEvent({ sentence: `Você criou a memória “${"semfim".repeat(30)}”`, kind: "memória", time: "16:30" }),
    ])
    + `</div>`
    + `<nav class="pagination-links" aria-label="Paginação"><a href="#">Próxima</a></nav></div>`;
}

/** `render`, plus the stylesheet that draws the Dados e IA strip both pages open with. */
async function renderLogbook(page: Page, body: string, width: number, height: number) {
  await render(page, body, width, height);
  await page.addStyleTag({ content: HISTORY_CSS });
  await page.waitForTimeout(40);
}

test.describe("Histórico as a logbook (Editorial calmo)", () => {
  for (const width of [390, 320]) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px, filters closed and open`, async ({ page }) => {
      for (const filtersOpen of [false, true]) {
        await renderLogbook(page, logbookBody({ filtered: true, filtersOpen }), width, 800);
        expect(await sidewaysOverflow(page), `filters ${filtersOpen ? "open" : "closed"}`).toBeLessThanOrEqual(1);
        expect(await shortTargets(page, ".history-page"), `filters ${filtersOpen ? "open" : "closed"}`).toEqual([]);
      }
    });
  }

  test("the filters are one line at rest, on a phone and on a desktop", async ({ page }) => {
    for (const [width, height] of [[390, 844], [1280, 900]] as const) {
      await renderLogbook(page, logbookBody(), width, height);
      const filters = (await page.locator(".history-filters").boundingBox())!;
      expect(filters.height, `at ${width}`).toBeLessThanOrEqual(48);
      await expect(page.locator(".history-filters-form")).toBeHidden();
    }
  });

  test("an active filter is said in words beside the way to clear it, with the form still closed", async ({ page }) => {
    await renderLogbook(page, logbookBody({ filtered: true }), 390, 844);
    await expect(page.locator(".history-filters-form")).toBeHidden();
    await expect(page.locator(".history-active-filters")).toBeVisible();
    await expect(page.getByRole("link", { name: "Limpar filtros" })).toBeVisible();
  });

  test("a day is a heading over a rule, and its rows hang from it", async ({ page }) => {
    await renderLogbook(page, logbookBody(), 390, 844);
    const day = page.locator(".history-day").first();
    const title = day.locator(".history-day-title");
    expect(await title.evaluate((node) => getComputedStyle(node).borderBottomWidth)).toBe("1px");
    const heading = (await title.boundingBox())!;
    const firstRow = (await day.locator(".history-event").first().boundingBox())!;
    expect(firstRow.y).toBeGreaterThanOrEqual(heading.y + heading.height - 1);
    // Rows are separated by hairlines, never boxed.
    const row = day.locator(".history-event").first();
    expect(await row.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.borderTopWidth, style.borderLeftWidth, style.borderRightWidth, style.borderBottomWidth].join(" ");
    })).toBe("0px 0px 0px 1px");
  });

  test("the row is the link: the anchor is as wide and as tall as its row", async ({ page }) => {
    await renderLogbook(page, logbookBody(), 390, 844);
    const row = page.locator(".history-event").first();
    const box = (await row.boundingBox())!;
    const link = (await row.locator(".history-event-link").boundingBox())!;
    expect(Math.abs(link.width - box.width)).toBeLessThanOrEqual(1);
    expect(link.height).toBeGreaterThanOrEqual(box.height - 2);
    expect(await row.locator("a").count()).toBe(1);
  });

  test("the sentence is in the reading face and the caption is one quiet line", async ({ page }) => {
    await renderLogbook(page, logbookBody(), 390, 844);
    const row = page.locator(".history-event").nth(1);
    const sentence = row.locator(".history-sentence");
    const caption = row.locator(".history-meta");
    expect(await sentence.evaluate((node) => getComputedStyle(node).fontFamily)).toContain("Georgia");
    expect(await caption.evaluate((node) => getComputedStyle(node).fontFamily)).not.toContain("Georgia");
    expect((await caption.boundingBox())!.height).toBeLessThanOrEqual(24);
    expect(await sentence.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)))
      .toBeGreaterThan(await caption.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)));
  });

  test("the fixture still mirrors the markup the components emit", () => {
    const list = readFileSync(join(ROOT, "src", "features", "history", "history-list.tsx"), "utf8");
    for (const name of ["history-days", "history-day", "history-day-title", "history-list", "history-event",
      "history-event-link", "history-event-body", "history-sentence", "history-changes", "history-change",
      "history-change-from", "history-change-to", "history-meta", "history-kind"]) {
      expect(list, `the list lost ${name}`).toContain(`className="${name}"`);
    }
    const filters = readFileSync(join(ROOT, "src", "features", "history", "history-filters.tsx"), "utf8");
    for (const name of ["history-filters", "history-filters-disclosure", "history-filters-summary", "history-filters-form",
      "history-filter-field", "history-filter-actions", "history-active", "history-active-filters", "history-filters-clear"]) {
      expect(filters, `the filters lost ${name}`).toContain(`className="${name}"`);
    }
    expect(filters, "the disclosure must not be opened by an active filter").not.toMatch(/<details[^>]*\bopen\b/);
    const route = readFileSync(join(ROOT, "src", "app", "[locale]", "app", "history", "page.tsx"), "utf8");
    expect(route).toContain('className="content-page history-page"');
    expect(route.indexOf("<DataAiTabs")).toBeLessThan(route.indexOf("<PageHeader"));
    expect(route.indexOf("<PageHeader")).toBeLessThan(route.indexOf("<HistoryFilterControls"));
  });
});

/**
 * The Agenda and Planejar, recomposed (Editorial calmo, ADR-180).
 *
 * `calendar.spec.ts` and `daily-surfaces.spec.ts` mirror these two pages part
 * by part. What is held here is the page as a whole, inside the app frame, on
 * the two phone widths this file measures everything at: nothing scrolls
 * sideways and no control is shorter than a touch target — in each form the
 * page takes (a day, a week, a month, the plan), closed and with its
 * disclosures open.
 */
const AGENDA_CSS = readFileSync(join(ROOT, "src", "app", "calendar.css"), "utf8");

function agendaMasthead(options: { lens: "calendar" | "plan"; period: string; caption: string; away?: boolean; navClass: string }) {
  const lens = (key: string, label: string) =>
    `<a class="ui-segmented__option" href="#"${key === options.lens ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<header class="agenda-masthead"><div class="agenda-masthead-top"><h1 class="agenda-masthead-title"><span>Agenda</span></h1>`
    + `<nav aria-label="Lentes da agenda" class="ui-segmented agenda-lenses">${lens("calendar", "Calendário")}${lens("plan", "Planejar")}${lens("reminders", "Lembretes")}</nav></div>`
    + `<nav aria-label="Navegar pelas datas" class="agenda-stepper ${options.navClass}">`
    + `<details class="agenda-date-picker calendar-range"><summary aria-label="${options.period}. Escolher uma data" class="agenda-stepper-range agenda-date-trigger"><span>${options.period}</span>${ICON}</summary>`
    + `<div aria-label="Escolher uma data" class="agenda-date-panel" role="group"></div></details>`
    + `<span aria-live="polite" class="sr-only">${options.period}</span>`
    + `<div class="agenda-stepper-caption">${options.caption}</div>`
    + `<a aria-label="Período anterior" class="ui-button ui-button--ghost ui-button--sm ui-icon-button" href="#" rel="prev"><span aria-hidden="true" class="ui-button__icon">${ICON}</span></a>`
    + `<a aria-label="Próximo período" class="ui-button ui-button--ghost ui-button--sm ui-icon-button" href="#" rel="next"><span aria-hidden="true" class="ui-button__icon">${ICON}</span></a>`
    + (options.away ? `<a class="ui-button ui-button--ghost ui-button--sm agenda-stepper-today" href="#"><span class="ui-button__label">Hoje</span></a>` : "")
    + `</nav></header>`;
}

function agendaRow(options: { time: string; title: string; kind: string; extra?: string[]; dates?: boolean; open?: boolean; elapsed?: boolean }) {
  const caption = [`<span class="calendar-item-lane">${options.kind}<span class="sr-only calendar-item-commitment">, Compromisso</span></span>`,
    ...(options.elapsed ? [`<span class="calendar-item-elapsed">Já passou</span>`] : []),
    ...(options.extra ?? []).map((text) => `<span class="calendar-item-repeats">${text}</span>`)].join("");
  const dates = options.dates
    ? `<details class="calendar-reschedule"${options.open ? " open" : ""}><summary class="calendar-reschedule-summary">Datas</summary>`
      + `<p class="quiet-state calendar-reschedule-hint">Altere o prazo ou o dia que você pretende trabalhar nisso. Nada muda até você confirmar.</p>`
      + `<div class="task-detail-controls task-detail-controls-inline"><ul class="task-control-list">`
      + `<li class="task-control"><form><label for="agenda-due">Prazo</label><input id="agenda-due" name="value" type="date" /><button class="row-action" type="submit">Aplicar</button><span class="task-control-name">Reagendar prazo</span></form></li>`
      + `<li class="task-control"><form><button class="row-action" type="submit">Remover prazo</button></form></li></ul></div></details>`
    : "";
  return `<li class="calendar-item" data-lane="deadline" data-commitment="committed" data-elapsed="${options.elapsed ? "true" : "false"}">`
    + `<time class="calendar-item-time" datetime="2026-11-18T21:00:00.000Z">${options.time}</time>`
    + `<span class="calendar-item-main"><span class="calendar-item-body"><a class="calendar-item-link" href="#">${options.title}</a></span>`
    + `<span class="calendar-item-meta">${caption}</span></span>${dates}</li>`;
}

function agendaDay(label: string, rows: string[], options: { today?: boolean; quiet?: boolean; heading?: "h2" | "h3" } = {}) {
  const tag = options.heading ?? "h2";
  return `<li class="calendar-day"${rows.length === 0 ? ' data-empty="true"' : ""}${options.today ? ' data-today="true"' : ""}>`
    + `<${tag} class="calendar-day-heading${options.quiet ? " sr-only" : ""}"><span class="calendar-day-name">${label}</span>${options.today ? '<span class="calendar-today">Hoje</span>' : ""}</${tag}>`
    + (rows.length === 0
      ? `<p class="ux-state-line calendar-empty" data-ux-state="empty"><span class="ux-state-line-text">Nada marcado</span></p>`
      : `<ul class="calendar-day-items">${rows.join("")}</ul>`)
    + `</li>`;
}

const AGENDA_UNBREAKABLE = "Enviar_o_relatorio_semanal_de_participacao_do_app_por_navio_e_por_canal_de_venda_2026";

function agendaDays(options: { datesOpen?: boolean } = {}) {
  return [
    agendaDay("segunda-feira, 16 de novembro", [
      agendaRow({ time: "08:00", title: "Tomar o remédio da pressão", kind: "Lembrete", extra: ["Toda última sexta-feira do mês"], elapsed: true }),
      agendaRow({ time: "14:00", title: LONG_TITLE, kind: "Prazo", extra: ["Lembrete às 13:00"], dates: true, open: options.datesOpen, elapsed: true }),
    ]),
    agendaDay("terça-feira, 17 de novembro", []),
    agendaDay("quarta-feira, 18 de novembro", [
      agendaRow({ time: "Dia todo", title: "Viagem a Recife", kind: "Evento" }),
      agendaRow({ time: "18:00", title: AGENDA_UNBREAKABLE, kind: "Prazo", dates: true }),
    ], { today: true }),
  ];
}

function agendaToolbar(orientation: string, filtersOpen: boolean) {
  const option = (value: string, label: string) =>
    `<a class="ui-segmented__option" href="#"${value === orientation ? ' aria-current="page"' : ""}>${label}</a>`;
  const lane = (label: string, shown: boolean) => `<li><a data-shown="${shown}" href="#">${label}<span class="sr-only">${shown ? ", mostrando" : ", oculto"}</span></a></li>`;
  return `<div class="calendar-toolbar"><nav aria-label="Formato" class="ui-segmented ui-segmented--sm calendar-orientation">${option("day", "Dia")}${option("week", "Semana")}${option("month", "Mês")}${option("agenda", "Lista")}</nav>`
    + `<details class="calendar-filters"${filtersOpen ? " open" : ""}><summary class="ui-button ui-button--ghost ui-button--sm">${ICON}<span class="ui-button__label">O que mostrar</span></summary>`
    + `<nav aria-label="O que mostrar" class="calendar-lanes"><ul>${lane("Prazos", true)}${lane("Intenções", true)}${lane("Lembretes", false)}${lane("Eventos", true)}${lane("Revisões", true)}${lane("Datas sugeridas", false)}</ul></nav></details></div>`;
}

function agendaBody(orientation: "day" | "week" | "month" | "agenda", options: { datesOpen?: boolean; filtersOpen?: boolean } = {}) {
  const days = agendaDays(options);
  const period = orientation === "day" ? "qua., 18 de novembro" : orientation === "month" ? "novembro de 2026" : "30 de novembro – 6 de dezembro";
  const caption = `<div class="calendar-status">${orientation === "day" ? '<span class="calendar-today">Hoje</span>' : ""}<p aria-live="polite" class="calendar-summary">14 itens neste período</p></div>`;
  const stream = `<ol class="calendar-days">${days.join("")}</ol>`;
  const strip = `<ol aria-label="Dias desta semana" class="calendar-week-strip">${["seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."].map((weekday, index) =>
    `<li${index === 2 ? ' data-today="true"' : ""}><a aria-label="dia ${16 + index}" class="calendar-week-strip-day" data-has-items="${index !== 1}" href="#"><span class="calendar-week-strip-weekday">${weekday}</span><span class="calendar-week-strip-number">${16 + index}</span></a></li>`).join("")}</ol>`;
  const body = orientation === "week"
    ? `<div class="calendar-week-scroll"><table class="calendar-week"><caption class="sr-only">semana</caption><thead><tr>${[...Array(7)].map((_unused, index) => `<th scope="col"><a class="calendar-week-head" href="#"><span class="calendar-week-weekday">seg.</span><span class="calendar-week-day">${16 + index}</span></a></th>`).join("")}</tr></thead><tbody><tr>${"<td></td>".repeat(7)}</tr></tbody></table></div>`
      + `<div class="calendar-week-list">${strip}${stream}</div>`
    : orientation === "month"
      ? `<div class="calendar-month-scroll"><table class="calendar-month"><caption class="sr-only">mês</caption><thead><tr>${'<th scope="col">Seg</th>'.repeat(7)}</tr></thead><tbody><tr>${'<td><a class="calendar-month-daynumber" href="#">1</a></td>'.repeat(7)}</tr></tbody></table></div>`
        + `<div class="calendar-month-list"><h2>Dias com itens neste mês</h2><ol class="calendar-days">${[days[0], days[2]].join("").replace(/<(\/?)h2/g, "<$1h3")}</ol></div>`
      : orientation === "day"
        ? `<ol class="calendar-days">${agendaDay("quarta-feira, 18 de novembro", [
          agendaRow({ time: "08:00", title: "Tomar o remédio da pressão", kind: "Lembrete", extra: ["Todo dia"], elapsed: true }),
          agendaRow({ time: "18:00", title: AGENDA_UNBREAKABLE, kind: "Prazo", extra: ["Lembrete às 17:00"], dates: true, open: options.datesOpen }),
        ], { today: true, quiet: true })}</ol>`
        : stream;
  return `<div class="content-page calendar-page"><section class="calendar" data-orientation="${orientation}">`
    + agendaMasthead({ lens: "calendar", period, caption, away: orientation !== "day", navClass: "calendar-navigation" })
    + agendaToolbar(orientation, options.filtersOpen ?? false)
    + `<p class="calendar-bound" role="status">Este é o fim do período que o calendário cobre.</p>`
    + body + `</section></div>`;
}

function plannerRowBody(options: { title: string; pool: boolean; due?: string; noted?: string }) {
  const caption = options.due || options.noted
    ? `<p class="planner-item-meta">${options.due ? `<span>Prazo: ${options.due}</span>` : ""}${options.noted ? `<span class="planner-item-noted">${options.noted}</span>` : ""}</p>`
    : "";
  return `<li class="planner-item" data-operation="${options.pool ? "set" : "cleared"}">`
    + (options.pool ? `<label class="planner-select-label"><input aria-label="${options.title}" class="planner-select" type="checkbox" /></label>` : "")
    + `<div class="planner-item-head"><span class="planner-item-title"><a class="planner-item-link" href="#">${options.title}</a></span>${caption}</div>`
    + `<div class="planner-item-controls"><div class="task-detail-controls task-detail-controls-inline task-detail-controls-preset"><ul class="task-control-list"><li class="task-control"><form>`
    + `<button class="row-action" type="submit">${options.pool ? "Planejar" : "Tirar"}</button></form></li></ul></div></div></li>`;
}

function plannerBody(options: { aboutOpen?: boolean } = {}) {
  const list = (label: string, rows: string[], foot = "") =>
    `<section aria-label="${label}" class="planner-list"><h2><span>${label}</span><span class="planner-list-count">${rows.length}</span></h2><ul>${rows.join("")}</ul>${foot}</section>`;
  return `<div class="content-page planner-page">`
    + agendaMasthead({
      lens: "plan",
      period: "qua., 18 de novembro",
      caption: `<p class="planner-lede"><span class="calendar-today">Hoje</span><span>Escolha o que você pretende fazer neste dia.</span></p>`,
      away: true,
      navClass: "planner-day-nav",
    })
    + `<p class="planner-overloaded" role="status">Há mais itens do que horas declaradas, contando um item por hora.</p>`
    // The one observation is on its task's row below, so the region is one caption (ADR-180).
    + `<section aria-label="O que vale notar" class="planner-conflicts" data-has-conflicts="true" data-on-rows="true">`
    + `<p class="planner-conflict-count"><span>1 observação</span><span>Nada foi alterado. Você decide o que fazer com cada uma.</span></p></section>`
    + list("Planejado para este dia", [
      plannerRowBody({ title: LONG_TITLE, pool: false, due: "17 de nov. de 2026", noted: "A intenção é para depois do prazo da tarefa." }),
      plannerRowBody({ title: "Pagar o condomínio", pool: false, due: "18 de nov. de 2026" }),
    ])
    + list("Disponível para planejar", [
      plannerRowBody({ title: AGENDA_UNBREAKABLE, pool: true }),
      plannerRowBody({ title: "Renovar o seguro do carro", pool: true, due: "22 de nov. de 2026" }),
      plannerRowBody({ title: LONG_TITLE, pool: true }),
    ], `<div class="work-bulk-select-all planner-select-all"><button class="row-action" type="button">Selecionar as que estão nesta página</button></div>`)
    + `<details class="planner-about"${options.aboutOpen ? " open" : ""}><summary class="planner-about-summary">Como o planejamento funciona</summary><div class="planner-about-body">`
    + `<p class="planner-meaning">Planejar é escolher o dia em que você pretende fazer uma tarefa. Não muda o prazo nem cria lembrete: é só a sua intenção para aquele dia.</p>`
    + `<p class="quiet-state planner-guarantee">Esta tela não cria tarefas. Ela só organiza o que já existe.</p>`
    + `<p class="quiet-state planner-list-hint">Tarefas em aberto que ainda não têm um dia escolhido.</p>`
    + `<section aria-label="Quanto você planejou" class="planner-capacity"><h2>Quanto você planejou</h2><p class="planner-capacity-count">2 itens planejados</p>`
    + `<p>Você não declarou suas horas disponíveis, então não há com o que comparar.</p><p class="quiet-state">Nenhuma tarefa tem duração registrada, então não dá para dizer se cabe no dia.</p></section>`
    + `</div></details></div>`;
}

async function renderAgenda(page: Page, body: string, width: number, height: number) {
  await render(page, body, width, height);
  await page.addStyleTag({ content: AGENDA_CSS });
  await page.waitForTimeout(40);
}

/** Every visible control inside `scope` shorter than a touch target, as "label:height". */
async function agendaShortTargets(page: Page, scope: string) {
  return page.evaluate(({ selector, minimum }) => {
    const root = document.querySelector(selector);
    if (!root) return ["scope not found"];
    return [...root.querySelectorAll<HTMLElement>("a, button, summary, input:not([type=hidden]), select, label:has(input[type=checkbox])")]
      .filter((node) => node.getClientRects().length > 0 && !node.matches("label input"))
      .map((node) => ({ label: (node.textContent ?? "").trim().slice(0, 24) || node.tagName, height: Math.round(node.getBoundingClientRect().height) }))
      .filter((entry) => entry.height < minimum)
      .map((entry) => `${entry.label}:${entry.height}`);
  }, { selector: scope, minimum: 44 });
}

async function agendaOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("the Agenda as a stream of days (Editorial calmo)", () => {
  for (const width of [390, 320]) {
    for (const orientation of ["day", "week", "month", "agenda"] as const) {
      test(`${orientation}: no sideways scroll and no target under 44px at ${width} CSS px, at rest and with every disclosure open`, async ({ page }) => {
        for (const open of [false, true]) {
          await renderAgenda(page, agendaBody(orientation, { datesOpen: open, filtersOpen: open }), width, 800);
          expect(await agendaOverflow(page), `sideways overflow, open=${open}`).toBeLessThanOrEqual(0);
          expect(await agendaShortTargets(page, ".calendar-page"), `short targets, open=${open}`).toEqual([]);
        }
        // The date picker's own panel, opened by its label.
        await page.locator(".agenda-date-trigger").click();
        expect(await agendaOverflow(page), "sideways overflow with the picker open").toBeLessThanOrEqual(0);
      });
    }

    test(`a row keeps its time column, and an unbreakable title breaks inside it, at ${width} CSS px`, async ({ page }) => {
      await renderAgenda(page, agendaBody("agenda"), width, 800);
      const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".calendar-days .calendar-item")].map((row) => {
        const time = row.querySelector(".calendar-item-time")!.getBoundingClientRect();
        const words = row.querySelector(".calendar-item-body")!.getBoundingClientRect();
        const box = row.getBoundingClientRect();
        return { timeLeft: Math.round(time.left - box.left), wordsLeft: Math.round(words.left - box.left), wordsRight: words.right, right: box.right, wordsWidth: words.width };
      }));
      expect(rows.length).toBeGreaterThanOrEqual(4);
      // One column for the time and one edge for the words, down the whole list.
      expect(new Set(rows.map((row) => row.timeLeft)).size).toBe(1);
      expect(new Set(rows.map((row) => row.wordsLeft)).size).toBe(1);
      for (const row of rows) {
        expect(row.wordsRight).toBeLessThanOrEqual(row.right + 1);
        expect(row.wordsWidth, "the words kept a readable width").toBeGreaterThanOrEqual(150);
      }
    });

    test(`the week is its list, and the month is its list, at ${width} CSS px`, async ({ page }) => {
      await renderAgenda(page, agendaBody("week"), width, 800);
      await expect(page.locator(".calendar-week-scroll")).toBeHidden();
      await expect(page.locator(".calendar-week-list")).toBeVisible();
      const strip = await page.locator(".calendar-week-strip-day").evaluateAll((nodes) => nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return box.left >= 0 && box.right <= window.innerWidth + 1 && box.height >= 44;
      }));
      expect(strip).toEqual([true, true, true, true, true, true, true]);
      await renderAgenda(page, agendaBody("month"), width, 800);
      await expect(page.locator(".calendar-month-scroll")).toBeHidden();
      await expect(page.locator(".calendar-month-list")).toBeVisible();
    });
  }

  test("an empty day is one muted line among the days, at 390px", async ({ page }) => {
    await renderAgenda(page, agendaBody("agenda"), 390, 844);
    const empty = page.locator('.calendar-day[data-empty="true"]');
    await expect(empty).toHaveCount(1);
    expect((await empty.boundingBox())!.height).toBeLessThanOrEqual(28);
    const drawn = await empty.evaluate((node) => {
      const heading = getComputedStyle(node.querySelector(".calendar-day-heading")!);
      return { rule: heading.borderBottomWidth, background: getComputedStyle(node).backgroundColor };
    });
    expect(parseFloat(drawn.rule)).toBe(0);
    expect(drawn.background).toBe("rgba(0, 0, 0, 0)");
  });

  test("the day and the list keep a reading measure on a desktop, and the week keeps the width", async ({ page }) => {
    await renderAgenda(page, agendaBody("agenda"), 1280, 900);
    const list = (await page.locator(".calendar").boundingBox())!.width;
    expect(list).toBeLessThanOrEqual(700);
    await renderAgenda(page, agendaBody("week"), 1280, 900);
    await expect(page.locator(".calendar-week-scroll")).toBeVisible();
    await expect(page.locator(".calendar-week-list")).toBeHidden();
    expect((await page.locator(".calendar").boundingBox())!.width).toBeGreaterThan(list);
  });

  test("the fixture still mirrors the markup the components emit", () => {
    const view = readFileSync(join(ROOT, "src", "features", "calendar", "calendar-view.tsx"), "utf8");
    for (const name of ["calendar-status", "calendar-summary", "calendar-toolbar", "calendar-orientation", "calendar-filters", "calendar-lanes",
      "calendar-days", "calendar-day", "calendar-day-name", "calendar-day-items", "calendar-week-scroll", "calendar-week-list",
      "calendar-week-strip", "calendar-week-strip-day", "calendar-week-strip-weekday", "calendar-week-strip-number",
      "calendar-month-scroll", "calendar-month-list", "calendar-bound"]) {
      expect(view, `the view lost ${name}`).toContain(name);
    }
    const item = readFileSync(join(ROOT, "src", "features", "calendar", "calendar-item.tsx"), "utf8");
    for (const name of ["calendar-item", "calendar-item-time", "calendar-item-main", "calendar-item-body", "calendar-item-link",
      "calendar-item-meta", "calendar-item-lane", "calendar-item-commitment", "calendar-item-elapsed", "calendar-item-repeats"]) {
      expect(item, `the row lost ${name}`).toContain(name);
    }
    expect(item.indexOf('className="calendar-item-time"', item.indexOf("ADR-180"))).toBeLessThan(item.indexOf('className="calendar-item-main"'));
    const header = readFileSync(join(ROOT, "src", "features", "calendar", "agenda-header.tsx"), "utf8");
    for (const name of ["agenda-masthead", "agenda-masthead-top", "agenda-masthead-title", "agenda-lenses", "agenda-stepper", "agenda-stepper-caption", "agenda-stepper-today"]) {
      expect(header, `the header lost ${name}`).toContain(name);
    }
    // The period comes first in the stepper, then its caption, then the arrows.
    const stepper = header.slice(header.indexOf("export function AgendaStepper"));
    expect(stepper.indexOf("<AgendaDatePicker")).toBeLessThan(stepper.indexOf("agenda-stepper-caption"));
    expect(stepper.indexOf("agenda-stepper-caption")).toBeLessThan(stepper.indexOf('rel="prev"'));
    expect(stepper.indexOf('rel="prev"')).toBeLessThan(stepper.indexOf('rel="next"'));
  });
});

test.describe("Planejar as two lists of rows (Editorial calmo)", () => {
  for (const width of [390, 320]) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px, the account closed and open`, async ({ page }) => {
      for (const aboutOpen of [false, true]) {
        await renderAgenda(page, plannerBody({ aboutOpen }), width, 800);
        expect(await agendaOverflow(page), `sideways overflow, open=${aboutOpen}`).toBeLessThanOrEqual(0);
        expect(await agendaShortTargets(page, ".planner-page"), `short targets, open=${aboutOpen}`).toEqual([]);
      }
    });

    test(`every row ends in its verb and the titles share one edge per list, at ${width} CSS px`, async ({ page }) => {
      await renderAgenda(page, plannerBody(), width, 800);
      const lists = await page.evaluate(() => [...document.querySelectorAll(".planner-list")].map((list) =>
        [...list.querySelectorAll<HTMLElement>(".planner-item")].map((row) => {
          const box = row.getBoundingClientRect();
          const title = row.querySelector(".planner-item-title")!.getBoundingClientRect();
          const verb = row.querySelector("button.row-action")!.getBoundingClientRect();
          return { titleLeft: Math.round(title.left - box.left), titleWidth: title.width, verbAfter: verb.left >= title.right - 1, verbInside: verb.right <= box.right + 1 };
        })));
      expect(lists).toHaveLength(2);
      for (const rows of lists) {
        expect(new Set(rows.map((row) => row.titleLeft)).size).toBe(1);
        for (const row of rows) {
          expect(row.verbAfter).toBe(true);
          expect(row.verbInside).toBe(true);
          expect(row.titleWidth, "the title kept a readable width").toBeGreaterThanOrEqual(140);
        }
      }
    });
  }

  test("what the page asks is on the first screen, above the first task, at 390px", async ({ page }) => {
    await renderAgenda(page, plannerBody(), 390, 844);
    const [lede, first, about] = await Promise.all([
      page.locator(".planner-lede").boundingBox(),
      page.locator(".planner-item").first().boundingBox(),
      page.locator(".planner-about").boundingBox(),
    ]);
    expect(lede!.y).toBeLessThan(first!.y);
    expect(first!.y, "the first task is on the first screen").toBeLessThan(844);
    expect(about!.y).toBeGreaterThan(first!.y);
    await expect(page.locator(".planner-meaning")).toBeHidden();
  });

  test("the fixture still mirrors the markup the planner emits", () => {
    const view = readFileSync(join(ROOT, "src", "features", "planning", "planner-view.tsx"), "utf8");
    for (const name of ["planner-page", "planner-lede", "planner-overloaded", "planner-conflicts", "planner-conflict-count", "planner-conflict-list",
      "planner-list", "planner-list-count", "planner-item", "planner-select-label", "planner-select", "planner-item-head", "planner-item-title",
      "planner-item-link", "planner-item-meta", "planner-item-noted", "planner-item-controls", "planner-select-all", "planner-about",
      "planner-about-summary", "planner-about-body", "planner-meaning", "planner-guarantee", "planner-list-hint", "planner-capacity", "planner-capacity-count"]) {
      expect(view, `the planner lost ${name}`).toContain(name);
    }
    // The account of the page comes after both lists, and is closed unless the day is overloaded.
    expect(view.lastIndexOf("</section>", view.indexOf('className="planner-about"'))).toBeGreaterThan(view.indexOf("<BulkBar"));
    expect(view).toContain('<details className="planner-about" open={projection.capacity.overloaded}>');
  });
});

/*
 * Conversar as correspondence (Editorial calmo, ADR-180).
 *
 * Mirrors `src/app/[locale]/app/chat/page.tsx`, `chat/[conversationId]/page.tsx`,
 * `src/features/chat/chat-frame.tsx`, `chat-stream-context.tsx`,
 * `src/features/capture/chat-composer.tsx`, `conversation-sources/source-list.tsx`
 * and `conversation-cards/suggestion-row.tsx`. What is under test is geometry
 * jsdom cannot see: nothing wider than the screen with a title that cannot
 * break, no target under 44px, the field clear of the bottom bar, the
 * question on the right and the answer on the left, and the sources the answer
 * cites drawn as cards (the owner's direction of 18 November 2026).
 */
const CHAT_CSS = ["conversation-cards.css", "assistant.css", "memories.css"]
  .map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n");

const CHAT_UNBREAKABLE = "dev_digital_bi.test_schema.nc_booking_population_2026_11_18_final";

function chatSources(options: { open: boolean; sources: number; explained?: boolean }) {
  const open = options.open ? " open" : "";
  const card = (index: number) => `<li data-support="direct_record"><a class="conversation-source-card" data-card-type="entry" href="#">`
    + `<span aria-hidden="true" class="conversation-source-icon">${ICON}</span><span class="conversation-source-text">`
    + `<span class="conversation-source-title">${index === 0 ? `Confirmar o valor em ${CHAT_UNBREAKABLE} com o Daniel antes de sexta, como combinado na reunião de orçamento` : `Registro número ${index}`}</span>`
    + `<span class="conversation-source-caption"><span class="conversation-source-support sr-only">Você escreveu isto: </span><span class="conversation-source-type">Registro</span>`
    + `<span class="conversation-source-freshness"> · <span class="sr-only">De </span><time datetime="2026-11-1${index}T12:00:00Z">1${index} de nov. de 2026</time></span></span></span>`
    + `${ICON.replace("<svg", '<svg class="conversation-source-chevron"')}</a></li>`;
  const unavailable = `<li data-support="product_state"><span class="conversation-source-chip" data-unavailable="">`
    + `<span class="conversation-source-support sr-only">O que eu guardo como verdadeiro: </span>`
    + `<span class="conversation-source-type">Memória · Isto não está mais disponível para você</span></span></li>`;
  const items = [...Array.from({ length: options.sources }, (_unused, index) => card(index)), ...(options.sources === 0 ? [] : [unavailable])];
  const list = (rows: string[]) => `<ul class="conversation-sources-list">${rows.join("")}</ul>`;
  const used = items.length === 0 ? "" : `<p class="conversation-sources-title sr-only">O que eu usei</p>${list(items.slice(0, 3))}`
    + (items.length > 3 ? `<details class="conversation-sources-more"${open}><summary>Mais ${items.length - 3} fontes</summary>${list(items.slice(3))}</details>` : "");
  const insufficient = options.sources === 0
    ? `<p class="conversation-sources-insufficient">Não encontrei nada seu sobre isso. O que respondi acima não vem dos seus registros, memórias, tarefas nem lembretes.</p>`
    : "";
  const where = `<details class="conversation-sources-where"${open}><summary>Onde procurei</summary>`
    + `<p class="conversation-sources-reach">Procurei nos seus registros e memórias, e nos títulos das suas tarefas e lembretes.</p>`
    + `<p class="chat-message-model">Modelo: gpt-5-mini</p></details>`;
  const explanation = options.explained
    ? `<details class="conversation-explanation"${open}><summary>Como cheguei aqui</summary><div class="conversation-explanation-body">`
      + `<ul><li>Encontrei outras coisas suas, mas nenhuma perto o bastante do que você perguntou.</li></ul>`
      + `<p class="conversation-explanation-correct-title">Se algo aqui está errado</p><p>Abra a fonte acima e corrija ou arquive lá.</p></div></details>`
    : "";
  return `<div class="message-sources"><div class="conversation-sources" data-evidence="${options.sources === 0 ? "insufficient" : "evidenced"}">`
    + `${insufficient}${used}${where}${explanation}</div></div>`;
}

function chatTurn(role: "user" | "assistant", id: string, body: string, extra = "") {
  const stamp = `<time datetime="2026-11-18T13:02:00.000Z">10:02</time>`;
  return `<article class="chat-message ${role}" data-role="${role}" id="${id}">`
    + (role === "user"
      ? `<p class="chat-message-meta"><span class="chat-message-speaker">Você</span></p><div class="chat-message-body">${body}</div><p class="chat-message-when">${stamp}</p>`
      : `<p class="chat-message-meta"><span class="chat-message-speaker"><span aria-hidden="true" class="brand-mark">B</span>Brain</span>${stamp}</p><div class="chat-message-body">${body}</div>`)
    + `${extra}</article>`;
}

function chatComposer() {
  return `<div class="chat-dock"><section class="assistant-composer"><div class="sr-only" role="status"></div>`
    + `<form class="assistant-composer-form"><label class="sr-only" for="chat-field">O que você quer dizer ao Brain?</label>`
    + `<div class="assistant-composer-row"><textarea id="chat-field" name="composerText" placeholder="Pergunte ou registre algo…" rows="1"></textarea>`
    + `<div class="voice-control"><button type="button" class="composer-mic">${ICON}<span class="sr-only">Gravar áudio</span></button></div>`
    + `<button aria-label="Enviar" class="ui-button ui-button--primary ui-button--md ui-icon-button" type="submit"><span aria-hidden="true" class="ui-button__icon">${ICON}</span></button>`
    + `</div><p class="assistant-composer-hint">Enter envia · Shift+Enter quebra a linha</p></form></section></div>`;
}

function chatMenu() {
  const row = (title: string, when: string, current = false) => `<li class="chat-menu-row"><a href="#"${current ? ' aria-current="page"' : ""}>${title}</a>`
    + `<time class="chat-menu-when" datetime="2026-11-18T13:00:00Z">${when}</time></li>`;
  const group = (label: string, rows: string[]) => `<section class="chat-menu-group"><h2 class="chat-menu-group-title">${label}</h2><ul>${rows.join("")}</ul></section>`;
  return `<nav aria-label="Conversas" class="chat-menu" id="chat-menu"><div class="chat-menu-head">`
    + `<a class="chat-menu-new" href="#">${ICON}Nova conversa</a><button aria-label="Fechar conversas" class="chat-menu-close" type="button">${ICON}</button></div>`
    + `<div class="chat-menu-search">${ICON}<label class="sr-only" for="chat-search">Buscar conversas</label><input id="chat-search" placeholder="Buscar conversas" type="search"></div>`
    + `<div class="chat-menu-groups">`
    + group("Hoje", [row("Contrato da Aurora", "11:40", true), row("O que tenho essa semana?", "08:12")])
    + group("Últimos 7 dias", [
      row("Viagem a Recife com a família em novembro e o que ainda falta reservar", "15 de nov. de 2026"),
      row(CHAT_UNBREAKABLE, "14 de nov. de 2026"),
      `<li class="chat-menu-row"><a href="#">Uma conversa encontrada pela busca, sem data</a></li>`,
    ])
    + `</div></nav><div aria-hidden="true" class="chat-menu-scrim"></div>`;
}

function chatSurface(stage: string, options: { menu?: boolean; title?: string } = {}) {
  return `<div class="chat-surface" data-chat-surface="" data-menu="${options.menu ? "open" : "closed"}">${options.menu ? chatMenu() : ""}`
    + `<div class="chat-column"><header class="chat-header">`
    + `<button aria-controls="chat-menu" aria-expanded="${options.menu ? "true" : "false"}" aria-label="Mostrar conversas" class="chat-header-button" type="button">${ICON}</button>`
    + `<h1 class="chat-header-title">${options.title ?? "Contrato da Aurora"}</h1>`
    + `<a aria-label="Nova conversa" class="chat-header-button" href="#">${ICON}</a></header>`
    + `<div class="chat-stage">${stage}</div>${chatComposer()}</div></div>`;
}

function chatThread(open: boolean) {
  const answer = `<p>Pelo que está nos seus registros, faltam três coisas antes da assinatura:</p>`
    + `<ol><li>Revisar a cláusula de rescisão com o texto que a Marina enviou na terça.</li>`
    + `<li>Confirmar o valor em ${CHAT_UNBREAKABLE}.</li><li>Enviar a versão final até sexta-feira.</li></ol>`
    + `<p>A tarefa está planejada para hoje e ainda não foi concluída.</p>`;
  return `<div class="message-stream">`
    + `<p class="chat-day"><time datetime="2026-11-18T13:02:00.000Z">18 de nov. de 2026</time></p>`
    + chatTurn("user", "message-1", `<p>O que falta eu fazer antes de assinar ${CHAT_UNBREAKABLE}?</p>`)
    + chatTurn("assistant", "message-2", answer, chatSources({ open, sources: 4, explained: true }))
    + chatTurn("user", "message-3", `<p>Tem algo sobre o seguro do carro nesse contrato?</p>`)
    + chatTurn("assistant", "message-4", `<p>Não há nada nos seus registros que ligue o seguro do carro ao contrato.</p>`, chatSources({ open, sources: 0 }))
    + `<div class="chat-draft" data-chat-draft=""><article class="chat-message" data-draft-role="user"><p class="chat-message-meta"><span class="chat-message-speaker">Você</span></p>`
    + `<div class="chat-message-body"><p>E o Daniel?</p></div></article><article aria-busy="true" class="chat-message" data-draft-role="assistant">`
    + `<p class="chat-message-meta"><span class="chat-message-speaker"><span aria-hidden="true" class="brand-mark">B</span>Brain</span></p><p class="chat-message-waiting" role="status">${ICON} Brain está pensando…</p></article></div>`
    + `<div class="chat-outcome" data-chat-outcome=""></div></div>`;
}

function chatOutcome() {
  return `<div class="message-stream">${chatTurn("user", "message-1", "<p>Oi</p>")}<div class="chat-outcome" data-chat-outcome="">`
    + `<div aria-label="Resposta do Brain" class="assistant-composer-notice" data-route="memory_intent" role="region" tabindex="-1">`
    + `<p class="assistant-composer-echo"><span>Você escreveu</span><q>Lembre que a Marina prefere receber contratos em PDF ${CHAT_UNBREAKABLE}</q></p>`
    + `<h3>Quer que eu guarde isso?</h3><p>Nada foi salvo ainda. Confira o texto e confirme.</p>`
    + `<form class="memory-proposal"><article class="conversation-card" data-card-type="memory" data-state="requires_confirmation"><header class="conversation-card-head">`
    + `<span class="conversation-card-type">Memória</span><span class="conversation-card-state">Preciso da sua confirmação</span></header></article>`
    + `<label for="proposal-content">Memória<textarea id="proposal-content" name="content" rows="3">A Marina prefere receber contratos em PDF.</textarea></label>`
    + `<label for="proposal-kind">Tipo<select id="proposal-kind" name="kind"><option>Preferência</option></select></label>`
    + `<div class="memory-proposal-actions"><button class="memory-proposal-confirm" type="submit">${ICON}Guardar memória</button>`
    + `<button class="memory-proposal-discard" type="button">${ICON}Descartar</button></div></form></div></div></div>`;
}

function chatNew(options: { starters?: boolean } = {}) {
  const chip = (question: string) => `<li><button aria-label="Escrever no campo: ${question}" class="ui-button ui-button--secondary ui-button--sm" data-seed-chip="fill" type="button">`
    + `<span class="ui-button__label">${question}</span></button></li>`;
  const questions = options.starters
    ? ["Quando fui ao médico pela última vez?", "O que tenho essa semana?", "O que falei sobre a viagem?", "Quais exames estão pendentes?"]
    : ["O prazo de Pagar a escola já passou. O que eu faço?", `O que ficou pendente com ${CHAT_UNBREAKABLE}?`, "Como está Aurora Participações?"];
  return `<div class="chat-intro"><div class="chat-hello"><h2>O que você quer saber?</h2></div>`
    + `<section class="conversational-questions conversational-questions-quiet" aria-label="Perguntas para responder agora" data-compact="">${ICON}`
    + `<a href="#" class="conversational-questions-quiet-link">Você tem 2 perguntas pendentes · Ver perguntas</a></section>`
    + `<div class="conversation-suggestions"><p class="conversation-suggestions-label">${options.starters ? "Experimente" : "Você pode me perguntar"}</p>`
    + `<ul class="conversation-suggestions-list">${questions.map(chip).join("")}</ul></div></div>`
    + `<div class="message-stream"><div class="chat-outcome" data-chat-outcome=""></div></div>`;
}

async function renderChat(page: Page, body: string, width: number, height: number) {
  await render(page, body, width, height);
  // The sheets arrive after first paint here, so a control's own transition
  // would be measured mid-flight; in the product they are there from the start.
  await page.addStyleTag({ content: `${CHAT_CSS}\n*{transition:none!important}` });
  await page.waitForTimeout(40);
}

/** Every visible control of the surface narrower or shorter than a touch target, as "label:width×height". */
async function chatShortTargets(page: Page) {
  return page.evaluate((minimum) => {
    const root = document.querySelector("[data-chat-surface]");
    if (!root) return ["surface not found"];
    return [...root.querySelectorAll<HTMLElement>("a, button, summary, textarea, select, input:not([type=hidden])")]
      .filter((node) => node.getClientRects().length > 0 && node.checkVisibility({ visibilityProperty: true }))
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { label: (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 24) || node.tagName, width: Math.round(box.width), height: Math.round(box.height) };
      })
      .filter((entry) => entry.height < minimum || entry.width < minimum)
      .map((entry) => `${entry.label}:${entry.width}×${entry.height}`);
  }, 44);
}

async function chatOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("Conversar as correspondence (Editorial calmo)", () => {
  for (const width of [390, 320]) {
    test(`a conversation: no sideways scroll and no target under 44px at ${width} CSS px, with every disclosure closed and open`, async ({ page }) => {
      for (const open of [false, true]) {
        await renderChat(page, chatSurface(chatThread(open)), width, 800);
        expect(await chatOverflow(page), `sideways overflow, open=${open}`).toBeLessThanOrEqual(0);
        expect(await chatShortTargets(page), `short targets, open=${open}`).toEqual([]);
      }
    });

    test(`a new conversation: no sideways scroll and no target under 44px at ${width} CSS px`, async ({ page }) => {
      for (const starters of [false, true]) {
        await renderChat(page, chatSurface(chatNew({ starters }), { title: "Brain" }), width, 800);
        expect(await chatOverflow(page), `sideways overflow, starters=${starters}`).toBeLessThanOrEqual(0);
        expect(await chatShortTargets(page), `short targets, starters=${starters}`).toEqual([]);
      }
    });

    test(`the conversations menu and a proposed memory: no sideways scroll and no target under 44px at ${width} CSS px`, async ({ page }) => {
      await renderChat(page, chatSurface(chatThread(false), { menu: true }), width, 800);
      expect(await chatOverflow(page), "sideways overflow, menu").toBeLessThanOrEqual(0);
      expect(await chatShortTargets(page), "short targets, menu").toEqual([]);
      await renderChat(page, chatSurface(chatOutcome()), width, 800);
      expect(await chatOverflow(page), "sideways overflow, proposal").toBeLessThanOrEqual(0);
      expect(await chatShortTargets(page), "short targets, proposal").toEqual([]);
    });
  }

  test("the question sits on the right in a filled shape with its hour; the answer on the left, named, with nothing around it", async ({ page }) => {
    await renderChat(page, chatSurface(chatThread(false)), 390, 800);
    const turns = await page.evaluate(() => {
      const stream = document.querySelector(".message-stream")!.getBoundingClientRect();
      const user = document.querySelector<HTMLElement>('.chat-message[data-role="user"]')!;
      const assistant = document.querySelector<HTMLElement>('.chat-message[data-role="assistant"]')!;
      const shape = user.querySelector<HTMLElement>(".chat-message-body")!;
      const prose = assistant.querySelector<HTMLElement>(".chat-message-body")!;
      return {
        stream: { left: stream.left, right: stream.right, width: stream.width },
        shape: { bottom: shape.getBoundingClientRect().bottom, left: shape.getBoundingClientRect().left, right: shape.getBoundingClientRect().right, width: shape.getBoundingClientRect().width, background: getComputedStyle(shape).backgroundColor, family: getComputedStyle(shape).fontFamily },
        when: user.querySelector<HTMLElement>(".chat-message-when")!.getBoundingClientRect(),
        userMeta: user.querySelector<HTMLElement>(".chat-message-meta")!.getBoundingClientRect().height,
        userEdge: parseFloat(getComputedStyle(user).borderInlineStartWidth),
        prose: { left: prose.getBoundingClientRect().left, background: getComputedStyle(prose).backgroundColor, family: getComputedStyle(prose).fontFamily, size: parseFloat(getComputedStyle(prose).fontSize) },
        answer: { background: getComputedStyle(assistant).backgroundColor, edge: parseFloat(getComputedStyle(assistant).borderInlineStartWidth) },
        speaker: assistant.querySelector<HTMLElement>(".chat-message-speaker")!.getBoundingClientRect(),
        mark: assistant.querySelector<HTMLElement>(".chat-message-speaker > .brand-mark")!.getBoundingClientRect(),
        answerTime: assistant.querySelector<HTMLElement>(".chat-message-meta > time")!.getBoundingClientRect().width,
      };
    });
    // The question: its right edge is the column's, it does not run the full width, and it is filled.
    expect(Math.abs(turns.shape.right - turns.stream.right)).toBeLessThanOrEqual(1);
    expect(turns.shape.left).toBeGreaterThan(turns.stream.left + 1);
    expect(turns.shape.width).toBeLessThanOrEqual(turns.stream.width * 0.83);
    expect(turns.shape.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(turns.userEdge).toBe(0);
    // Its hour under it, at the same right edge; "Você" is not drawn.
    expect(turns.when.top).toBeGreaterThanOrEqual(turns.shape.bottom - 1);
    expect(Math.abs(turns.when.right - turns.stream.right)).toBeLessThanOrEqual(1);
    expect(turns.userMeta).toBeLessThanOrEqual(1);
    // The answer: at the column's left edge, no shape, no rule, in the reading face and larger than the question.
    expect(Math.abs(turns.prose.left - turns.stream.left)).toBeLessThanOrEqual(1);
    expect(turns.prose.background).toBe("rgba(0, 0, 0, 0)");
    expect(turns.answer.background).toBe("rgba(0, 0, 0, 0)");
    expect(turns.answer.edge).toBe(0);
    expect(turns.prose.family).not.toBe(turns.shape.family);
    expect(turns.prose.size).toBeGreaterThanOrEqual(19);
    // Named, beside the product's mark; its hour stays in the document only.
    expect(turns.speaker.height).toBeGreaterThan(10);
    expect(turns.mark.width).toBeGreaterThan(10);
    expect(Math.abs(turns.speaker.left - turns.stream.left)).toBeLessThanOrEqual(1);
    expect(turns.answerTime).toBeLessThanOrEqual(1);
  });

  test("under an answer its sources are cards in sight; the rest, where it looked and how it got here are closed lines", async ({ page }) => {
    await renderChat(page, chatSurface(chatThread(false)), 390, 800);
    const block = page.locator(".chat-message.assistant").first().locator(".conversation-sources");
    // Three drawn, the fourth and the unavailable one behind "Mais 2 fontes".
    await expect(block.locator("> .conversation-sources-list > li")).toHaveCount(3);
    await expect(block.locator("> .conversation-sources-list .conversation-source-card").first()).toBeVisible();
    await expect(block.locator("> .conversation-sources-more > summary")).toHaveText("Mais 2 fontes");
    await expect(block.locator("> .conversation-sources-more .conversation-sources-list")).toBeHidden();
    const tops = await block.locator("> details:not(.conversation-sources-more) > summary").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
    expect(tops).toHaveLength(2);
    expect(new Set(tops).size, "where it looked and how it got here share one line").toBe(1);
    await expect(block.locator(".conversation-sources-reach")).toBeHidden();
    await expect(block.locator(".chat-message-model")).toBeHidden();

    await block.locator("> .conversation-sources-more > summary").click();
    const unavailable = block.locator(".conversation-source-chip[data-unavailable]");
    await expect(unavailable).toBeVisible();
    // An unavailable source is one quiet line, not a card, and not a link.
    expect(await unavailable.evaluate((node) => node.closest("a") === null && node.closest(".conversation-source-card") === null)).toBe(true);
    // The honest "I found nothing" is in the open on the answer that has it.
    await expect(page.locator(".conversation-sources-insufficient")).toBeVisible();
  });

  test("the field is one line, clear of the bottom bar, and the shell's top bar steps aside", async ({ page }) => {
    await renderChat(page, chatSurface(chatThread(false)), 390, 800);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(40);
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const lastTurn = [...document.querySelectorAll(".chat-message")].at(-1)!.getBoundingClientRect();
      return {
        form: box(".assistant-composer-form"),
        field: box(".assistant-composer-row > textarea"),
        nav: box(".bottom-nav"),
        topBar: getComputedStyle(document.querySelector(".top-bar")!).display,
        lastTurnBottom: lastTurn.bottom,
        viewport: innerHeight,
      };
    });
    expect(geometry.topBar).toBe("none");
    expect(geometry.form.bottom).toBeLessThanOrEqual(geometry.nav.top);
    expect(geometry.form.top).toBeGreaterThan(geometry.viewport / 2);
    expect(geometry.field.height).toBeLessThanOrEqual(48);
    expect(geometry.form.height).toBeLessThanOrEqual(60);
    // At the end of the thread the last turn is above the field, not under it.
    expect(geometry.lastTurnBottom).toBeLessThanOrEqual(geometry.form.top);
  });

  test("a conversation in the menu is a row whose link is the whole row, with its caption inside", async ({ page }) => {
    await renderChat(page, chatSurface(chatThread(false), { menu: true }), 390, 800);
    const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".chat-menu-row")].map((row) => {
      const box = row.getBoundingClientRect();
      const link = row.querySelector("a")!.getBoundingClientRect();
      const when = row.querySelector(".chat-menu-when")?.getBoundingClientRect() ?? null;
      const title = document.createRange();
      title.selectNodeContents(row.querySelector("a")!);
      return {
        linkCoversRow: Math.abs(link.width - box.width) <= 1 && Math.abs(link.height - box.height) <= 2,
        height: box.height,
        captionInside: when === null ? null : when.top >= link.top && when.bottom <= link.bottom,
        captionBelowTitle: when === null ? null : when.top >= title.getBoundingClientRect().bottom - 1,
        right: box.right,
        background: getComputedStyle(row.querySelector("a")!).backgroundColor,
      };
    }));
    const menu = (await page.locator(".chat-menu").boundingBox())!;
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.linkCoversRow).toBe(true);
      expect(row.height).toBeGreaterThanOrEqual(44);
      expect(row.right).toBeLessThanOrEqual(menu.x + menu.width);
      // Where you are is weight and a rule, never a fill.
      expect(row.background).toBe("rgba(0, 0, 0, 0)");
      if (row.captionInside !== null) {
        expect(row.captionInside).toBe(true);
        expect(row.captionBelowTitle).toBe(true);
      }
    }
  });

  for (const width of [390, 320]) {
    test(`two sides and source cards at ${width} CSS px: the question's right edge is the column's, every card at least 64px and the whole card the link, nothing wider than the screen`, async ({ page }) => {
      for (const open of [false, true]) {
        await renderChat(page, chatSurface(chatThread(open)), width, 800);
        expect(await chatOverflow(page), `sideways overflow, open=${open}`).toBeLessThanOrEqual(0);
        expect(await chatShortTargets(page), `short targets, open=${open}`).toEqual([]);
        const geometry = await page.evaluate(() => {
          const stream = document.querySelector(".message-stream")!.getBoundingClientRect();
          const questions = [...document.querySelectorAll<HTMLElement>('.chat-message[data-role="user"] > .chat-message-body')].map((node) => node.getBoundingClientRect());
          const cards = [...document.querySelectorAll<HTMLElement>(".conversation-source-card")]
            .filter((node) => node.getClientRects().length > 0)
            .map((node) => {
              const box = node.getBoundingClientRect();
              const item = node.parentElement!.getBoundingClientRect();
              const title = node.querySelector<HTMLElement>(".conversation-source-title")!;
              const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
              return {
                height: box.height,
                coversItem: Math.abs(box.width - item.width) <= 1,
                right: box.right,
                titleLines: Math.round(title.getBoundingClientRect().height / lineHeight),
                controls: node.querySelectorAll("button, form, input, select, textarea, a").length,
              };
            });
          return { streamRight: stream.right, streamLeft: stream.left, questions, cards, viewport: innerWidth };
        });
        expect(geometry.questions.length).toBeGreaterThan(0);
        for (const question of geometry.questions) {
          expect(Math.abs(question.right - geometry.streamRight), "the question's right edge").toBeLessThanOrEqual(1);
        }
        expect(geometry.cards.length).toBeGreaterThanOrEqual(3);
        for (const card of geometry.cards) {
          expect(card.height).toBeGreaterThanOrEqual(64);
          expect(card.coversItem).toBe(true);
          expect(card.right).toBeLessThanOrEqual(geometry.viewport);
          // Two lines at most, however long the source is.
          expect(card.titleLines).toBeLessThanOrEqual(2);
          // No control inside the card: the card itself is the one link.
          expect(card.controls).toBe(0);
        }
      }
    });
  }

  test("a short conversation starts at the top of the screen, under the header, not on the field", async ({ page }) => {
    const short = `<div class="message-stream"><p class="chat-day"><time datetime="2026-11-18T13:02:00.000Z">18 de nov. de 2026</time></p>`
      + chatTurn("user", "message-1", "<p>Oi</p>") + chatTurn("assistant", "message-2", "<p>Olá.</p>") + `</div>`;
    for (const [width, height] of [[390, 844], [1280, 900]]) {
      await renderChat(page, chatSurface(short).replace('<div class="chat-stage">', '<div class="chat-stage" data-thread="">'), width, height);
      const gap = await page.evaluate(() => document.querySelector(".chat-day")!.getBoundingClientRect().top - document.querySelector(".chat-header")!.getBoundingClientRect().bottom);
      expect(gap, `at ${width}`).toBeLessThanOrEqual(48);
    }
  });

  test("a suggestion is a row between hairlines, not a tinted box", async ({ page }) => {
    await renderChat(page, chatSurface(chatNew(), { title: "Brain" }), 390, 800);
    const chips = await page.locator(".conversation-suggestions-list > li > .ui-button").evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      const row = node.parentElement!.getBoundingClientRect();
      return { background: style.backgroundColor, border: parseFloat(style.borderTopWidth), width: node.getBoundingClientRect().width, row: row.width, rule: parseFloat(getComputedStyle(node.parentElement!).borderBottomWidth) };
    }));
    expect(chips).toHaveLength(3);
    for (const chip of chips) {
      expect(chip.background).toBe("rgba(0, 0, 0, 0)");
      expect(chip.border).toBe(0);
      expect(chip.rule).toBeGreaterThan(0);
      expect(Math.abs(chip.width - chip.row)).toBeLessThanOrEqual(1);
    }
    // The introduction steps aside once a turn is drawn in this screen.
    await page.evaluate(() => { document.querySelector(".chat-outcome")!.innerHTML = '<div class="assistant-composer-notice"><h3>Resposta</h3></div>'; });
    await expect(page.locator(".chat-intro")).toBeHidden();
  });
});

/**
 * Ajustes, recomposed (Editorial calmo, ADR-180).
 *
 * One fixture holding every kind of row the six groups are made of: the list
 * of groups, a row whose control is its value (a text field, a select with a
 * long value, a time, a number, a switch, a segmented choice), a row that is a
 * link, a row with one verb, and the row that opens its editor in place
 * (`.setting-fact`) around each of the editors that exist — the key form, a
 * category's policy, the push preferences, the census. Measured on the two
 * phone widths this file measures everything at, with the rows closed and
 * with every one of them open.
 */
const SETTINGS_LONG = "Horário_de_Brasília_São_Paulo_e_Rio_de_Janeiro_(UTC−03:00)_sem_espaços";

function settingsFact(options: { label: string; value: string; editor: string; className?: string; open: boolean; group?: string; heading?: "h2" | "h3" }) {
  const tag = options.heading ?? "span";
  return `<details class="setting-fact${options.className ? ` ${options.className}` : ""}"${options.group ? ` name="${options.group}"` : ""}${options.open ? " open" : ""}>
    <summary class="setting-fact-summary"><${tag} class="setting-fact-label">${options.label}</${tag}><span class="setting-fact-value">${options.value}</span>
      <span class="setting-fact-verb" data-when="closed">Alterar</span><span class="setting-fact-verb" data-when="open">Fechar</span></summary>
    <div class="setting-fact-editor">${options.editor}</div></details>`;
}

function settingsRow(label: string, control: string, hint = "") {
  return `<div class="settings-row"><span class="settings-row-copy"><label>${label}</label>${hint ? `<small>${hint}</small>` : ""}</span><span class="settings-row-control">${control}</span></div>`;
}

function settingsNav(active: string) {
  const groups = [["general", "Você e o assistente", `Michael · ${SETTINGS_LONG} · Português`], ["day", "Seu dia e avisos", "Silêncio das 22:00 às 07:00 · até 5 por dia"],
    ["autonomy", "O que ele faz sozinho", "Só sugere, em tudo"], ["ai", "IA e custos", "Chave funcionando · Qualidade máxima"], ["appearance", "Aparência", "Tema e instalar como app"]];
  const item = ([key, name, summary]: string[]) => `<li><a class="settings-nav-link${key === active ? " active" : ""}" data-section="${key}" href="#">
    <span class="settings-nav-copy"><span class="settings-nav-name">${name}</span><span class="settings-nav-summary">${summary}</span></span>${ICON.replace("<svg", '<svg class="settings-nav-chevron"')}</a></li>`;
  return `<nav aria-label="Grupos dos ajustes" class="settings-nav"><ul class="settings-nav-list">${groups.map(item).join("")}</ul>
    <ul class="settings-nav-list settings-nav-list-apart">${item(["privacy", "Privacidade e conta", "Baixar uma cópia, sessões, apagar a conta"])}</ul></nav>`;
}

function settingsBody(options: { root: boolean; open: boolean }) {
  const { open } = options;
  const form = `<form class="settings-form">
    <section class="settings-group"><h2 class="settings-group-title">O assistente</h2><div class="settings-rows">
      ${settingsRow("Nome do assistente", '<input type="text" value="Michael" />', "Como ele se chama nas telas e nas respostas.")}
      ${settingsRow("Fuso horário", `<select><option>${SETTINGS_LONG}</option></select>`, "Define o que “hoje” e “amanhã” significam.")}
      ${settingsRow("Período silencioso começa", '<input type="time" value="22:00" />')}
      ${settingsRow("Máximo de acompanhamentos por dia", '<input type="number" value="5" />')}
      <div class="settings-row"><span class="settings-row-copy"><label for="settings-fixture-switch">Permitir lembretes importantes durante o silêncio</label></span><span class="settings-row-control"><input class="settings-switch" id="settings-fixture-switch" role="switch" type="checkbox" checked /></span></div>
      <div class="settings-row"><span class="settings-row-copy"><span class="settings-row-label">Idioma</span><small>Também no menu da conta.</small></span><span class="settings-row-control"><span class="settings-segmented" role="group"><a class="settings-segment active" href="#">Português</a><a class="settings-segment" href="#">English</a></span></span></div>
    </div></section>
    <section class="settings-group"><h2 class="settings-group-title">Qualidade e custo</h2><div class="settings-rows">
      <fieldset class="ai-profile-fieldset settings-row settings-row-stack"><legend class="settings-row-legend">Perfil de custo e qualidade</legend>
        <div class="settings-segmented">${["Qualidade máxima", "Equilibrado", "Econômico", "Personalizado"].map((name, index) => `<label class="settings-segment${index === 0 ? " active" : ""}"><input type="radio" name="aiProfile" /><span>${name}</span></label>`).join("")}</div>
        <small class="settings-row-hint">Recomendado. Terra no chat e nas revisões; Luna na captura e nos arquivos.</small></fieldset>
      <a class="settings-row settings-row-link" href="#"><span class="settings-row-copy"><strong>Custos de IA</strong><small>Quanto cada função gastou.</small></span>${ICON}</a>
    </div></section>
    <div aria-live="polite" class="settings-feedback-region"><p class="settings-receipt" data-state="saved" role="status">${ICON}<span>Salvo</span><button class="settings-receipt-undo" type="button">Desfazer</button></p></div>
  </form>`;
  const onboarding = `<section class="onboarding-restore"><form class="settings-row"><span class="settings-row-copy"><h2 class="settings-row-label">Guia de primeiros passos</h2><small>O guia está dispensado neste navegador.</small></span>
    <button type="submit" class="setting-verb onboarding-restore-action">Mostrar o guia de novo</button></form></section>`;
  const key = `<section class="byok-panel"><h2 class="settings-group-title">Sua chave da OpenAI</h2><p class="settings-group-note">O uso é cobrado diretamente na sua conta da OpenAI.</p><div class="settings-rows byok-body">
    <div class="byok-pending"><div class="byok-pending-copy"><h3>Registros aguardando interpretação</h3><p class="byok-pending-count">3</p><p>Nada é interpretado automaticamente.</p></div>
      <form><button class="setting-verb byok-pending-submit" type="submit">Interpretar registros pendentes</button></form></div>
    ${settingsFact({ label: "Chave", className: "byok-key", open, value: `<span class="byok-state"><span class="byok-badge" data-status="active"><strong>Configurada</strong></span><span class="byok-identifier"><code>sk-proj:${SETTINGS_LONG}</code></span><span class="byok-validated">Validada em 2 de nov. de 2026</span></span>`,
      editor: '<form class="byok-form"><label for="settings-fixture-key">Chave da API</label><input id="settings-fixture-key" type="password" placeholder="sk-…" /><p class="field-hint byok-hint">Cole a chave.</p><button class="byok-submit" type="submit">Substituir chave</button></form>' })}
    <p role="status" data-state="success" class="byok-feedback">Chave substituída e validada.</p>
    <div class="byok-danger"><form class="byok-remove"><button type="submit" class="danger byok-destructive">Remover chave</button></form></div>
  </div><p class="byok-honesty">A chave é guardada criptografada.</p><p class="byok-costs-note">Os custos são estimativas.</p></section>`;
  const automation = `<section class="automation-section"><h2>Automação por categoria</h2><p class="automation-posture">Hoje nenhuma categoria age sozinha.</p>
    <details class="settings-how"${open ? " open" : ""}><summary>Como ele decide</summary><p class="automation-intro">Só onde você autorizar.</p><p class="automation-thresholds">Os mínimos estão assinados.</p></details>
    <ul class="automation-list"><li class="automation-row">${settingsFact({ label: "Tarefas", heading: "h3", group: "automation-category", open,
      value: `<span class="automation-state" data-reason="insufficient_calibration">Ainda não há exemplos revisados suficientes para confiar nesta categoria ${SETTINGS_LONG}.</span>`,
      editor: '<p class="automation-risk">Reversível.</p><div class="automation-evidence"><p class="automation-evidence-label">Evidência revisada por você</p><dl class="automation-counts"><div><dt>revisados</dt><dd>34</dd></div><div><dt>aceitos</dt><dd>29</dd></div><div><dt>corrigidos</dt><dd>3</dd></div><div><dt>rejeitados</dt><dd>2</dd></div><div><dt>desfeitos</dt><dd>0</dd></div><div><dt>acerto</dt><dd>85,3%</dd></div></dl></div><form class="automation-form"><label>Política</label><select><option>Automática quando elegível</option></select><p class="automation-state-help">Armar não é autorizar.</p><button type="submit" class="automation-save">Salvar política</button></form>' })}</li></ul>
    <details class="settings-how automation-history" open><summary class="automation-history-label">Cada mudança de política fica registrada e pode ser desfeita.</summary><ul class="automation-history-list"><li><span>Tarefas: de Apenas sugerir → Automática quando elegível</span><form><button type="submit" class="automation-undo">Desfazer</button></form></li></ul></details></section>`;
  const push = `<section class="notification-settings"><div class="notification-panel"><h2>Notificações no aparelho</h2><p class="notification-benefit">O Brain pode avisar no aparelho.</p><p class="notification-promise">O aviso mostra só o título.</p></div>
    <div class="notification-panel"><h3>Situação atual</h3><p class="notification-state-line" data-consent-state="granted" role="status">Você autorizou os avisos neste aparelho.</p></div>
    <div class="notification-panel"><p class="quiet-state notification-no-prompt">Nada será perguntado.</p><div class="push-controls"><button class="push-action push-action-off" type="button">Desativar avisos neste aparelho</button>
    ${settingsFact({ label: "O que avisa e quando", className: "push-preferences-fact", open, value: "Lembretes, Coisas para acompanhar, Revisões prontas · Assim que acontecer · silêncio das 22:00 às 07:00 · até 5 por dia",
      editor: '<div class="push-preferences"><fieldset class="push-card"><legend>O que pode avisar</legend><div class="push-options"><label class="push-option"><input type="checkbox" checked />Lembretes</label><label class="push-option"><input type="checkbox" />Resumos</label></div></fieldset><fieldset class="push-card"><legend>Período silencioso</legend><div class="push-times"><label class="push-time">Começa às<input type="time" value="22:00" /></label><label class="push-time">Termina às<input type="time" value="07:00" /></label></div></fieldset><div class="push-card"><label class="push-cap">Máximo de avisos por dia<input type="number" value="5" /></label></div><div class="push-save"><button class="push-submit" type="button">Salvar preferências</button></div><p class="push-notice" role="status">Preferências salvas.</p></div>' })}
    </div></div><p class="notification-inapp-note">Os detalhes completos continuam nesta página.</p></section>`;
  const appearance = `<section class="appearance-section"><h2>Aparência</h2><p class="appearance-intro">Escolha como o produto é desenhado.</p><fieldset class="appearance-fieldset"><legend>Tema</legend><div class="appearance-options">
    ${["Seguir o aparelho", "Claro", "Escuro"].map((name, index) => `<div class="appearance-option${index === 0 ? " active" : ""}"><input id="settings-fixture-theme-${index}" name="appearance" type="radio" /><span class="appearance-option-copy"><label for="settings-fixture-theme-${index}">${name}</label><small>Descrição.</small></span></div>`).join("")}
    </div></fieldset><p class="appearance-scope">Fica guardado neste navegador.</p></section>
    <section class="install-section">${settingsFact({ label: "Instalar como app", heading: "h2", open, value: "Na tela de início, como um aplicativo", editor: '<div class="install-body"><p class="install-intro">O My Brain pode ficar na tela de início.</p><dl class="install-steps"><div class="install-step"><dt>iPhone e iPad (Safari)</dt><dd>Toque no botão Compartilhar.</dd></div></dl><p class="install-caveat quiet-state">Instalar não ativa avisos.</p></div>' })}</section>`;
  const privacy = `<section class="data-ai-section privacy-section"><h2>Privacidade e dados</h2><div class="settings-rows">
    <div class="settings-row privacy-row"><div class="settings-row-copy"><h3 class="settings-row-label">Levar seus dados</h3><small>Um arquivo com tudo o que a exportação alcança.</small></div><div class="privacy-export"><form><button type="submit">Gerar exportação</button></form></div></div>
    ${settingsFact({ label: "O que está guardado sobre você", heading: "h3", open, value: "8000 registros em 12 categorias", editor: `<p class="data-ai-intro">Contagens, nunca conteúdo.</p><ul class="privacy-census"><li><strong>Registros e interpretações ${SETTINGS_LONG}</strong><span>412 registros</span><a href="#">Ver</a></li><li><strong>Eventos de uso do produto</strong><span>5120 registros</span><span class="privacy-census-nosurface">sem página própria; aparece na exportação</span></li></ul>` })}
    <div class="settings-row privacy-row"><div class="settings-row-copy"><h3 class="settings-row-label">Sessões</h3><span class="privacy-signed-in">Você está conectado como fabio.com.um.endereco.muito.longo@example-de-dominio-comprido.com.br.</span><small>Encerrar em todos os dispositivos revoga todas as sessões.</small></div><form class="privacy-sessions"><button type="submit">Sair de todos os dispositivos</button></form></div>
    </div><details class="settings-how privacy-details"${open ? " open" : ""}><summary>Ver tudo por categoria e por quanto tempo guardamos</summary><ul class="privacy-withheld"><li><code>account_deletion_attempts</code> — contador de proteção contra abuso</li></ul></details></section>
    <section class="data-ai-section"><h2>O que você aceitou</h2><p class="data-ai-intro">A versão aceita e a data.</p><ul class="privacy-consent"><li><strong>Termos de uso</strong><span>Versão 2026-08-01, aceita em 3 de agosto de 2026.</span><span>Em dia.</span><a href="#">Ler o documento</a></li></ul>
      <div class="settings-rows"><div class="settings-row privacy-row"><div class="settings-row-copy"><h3 class="settings-row-label">Consentimentos opcionais</h3><small>Notificações são o único consentimento opcional hoje.</small></div><div class="privacy-revocation"><div><button type="button">Revogar notificações</button></div></div></div></div></section>
    <section class="data-ai-section"><h2>Conta e dados</h2><p class="data-ai-intro">Cada item abre a própria página.</p><ul class="data-ai-doors"><li><a class="data-ai-door" href="#"><strong>Notificações</strong><span>O que o produto já enviou.</span></a></li><li><a class="data-ai-door" href="/pt-BR/account/delete"><strong>Apagar a conta</strong><span>Pede confirmação e sua senha.</span></a></li></ul></section>`;
  return `<div class="settings-page"><header class="ui-page-header"><h1>Ajustes</h1></header><div class="settings-layout">${settingsNav("general")}
    <section aria-label="Você e o assistente" class="settings-panel"${options.root ? ' data-root=""' : ""} id="settings-panel" tabindex="-1">
      <a class="settings-back" href="#">${ICON}Ajustes</a><p aria-hidden="true" class="settings-panel-title">Você e o assistente</p><p class="settings-panel-summary">Como ele se chama, como responde, e o seu fuso horário.</p>
      ${form}${onboarding}${key}${automation}${push}${appearance}${privacy}
    </section></div></div>`;
}

/** Targets a thumb must hit; a checkbox, radio or switch is measured by the label that carries its hit area. */
async function settingsShortTargets(page: Page) {
  return page.evaluate((minimum) => {
    const root = document.querySelector(".settings-page");
    if (!root) return ["scope not found"];
    const targets = [...root.querySelectorAll<HTMLElement>("a, button, summary, select, input:not([type=hidden])")].map((node) => {
      if (node instanceof HTMLInputElement && ["checkbox", "radio"].includes(node.type)) {
        return node.closest<HTMLElement>("label, .appearance-option") ?? (node.id ? root.querySelector<HTMLElement>(`label[for="${node.id}"]`) : null) ?? node;
      }
      return node;
    });
    return targets.filter((node) => node.getClientRects().length > 0)
      .map((node) => ({ label: (node.textContent ?? "").trim().slice(0, 24) || node.tagName, height: Math.round(node.getBoundingClientRect().height) }))
      .filter((entry) => entry.height < minimum)
      .map((entry) => `${entry.label}:${entry.height}`);
  }, TOUCH_TARGET);
}

test.describe("Ajustes as rows of facts (Editorial calmo)", () => {
  for (const width of [390, 320]) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px — the list, a group closed, a group with every row open`, async ({ page }) => {
      for (const [name, body] of [
        ["the list of groups", settingsBody({ root: true, open: false })],
        ["a group, rows closed", settingsBody({ root: false, open: false })],
        ["a group, every row open", settingsBody({ root: false, open: true })],
      ] as const) {
        await render(page, body, width, 800);
        expect(await sidewaysOverflow(page), name).toBeLessThanOrEqual(1);
        expect(await settingsShortTargets(page), name).toEqual([]);
      }
    });
  }

  test("on a phone the list of groups is rows between hairlines, each saying what it is set to", async ({ page }) => {
    await render(page, settingsBody({ root: true, open: false }), 390, 800);
    await expect(page.locator(".settings-panel")).toBeHidden();
    const row = page.locator('.settings-nav-link[data-section="ai"]');
    await expect(row.locator(".settings-nav-summary")).toBeVisible();
    const drawn = await row.evaluate((node) => {
      const style = getComputedStyle(node);
      const item = getComputedStyle(node.parentElement!);
      return { radius: style.borderTopLeftRadius, background: style.backgroundColor, rule: item.borderBottomWidth };
    });
    expect(drawn.radius).toBe("0px");
    expect(drawn.background).toBe("rgba(0, 0, 0, 0)");
    expect(drawn.rule).toBe("1px");
  });

  test("a setting's control sits on its row, at the row's right edge — not under its label", async ({ page }) => {
    await render(page, settingsBody({ root: false, open: false }), 390, 800);
    const rows = page.locator(".settings-form .settings-rows > .settings-row:not(.settings-row-stack):not(.settings-row-link)");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let index = 0; index < count; index += 1) {
      const geometry = await rows.nth(index).evaluate((row) => {
        const copy = row.querySelector(".settings-row-copy")!.getBoundingClientRect();
        const control = row.querySelector(".settings-row-control")!.getBoundingClientRect();
        const box = row.getBoundingClientRect();
        return { beside: control.left >= copy.right - 1, flush: Math.abs(box.right - control.right) <= 1, card: getComputedStyle(row.parentElement!).borderTopWidth };
      });
      expect(geometry, `row ${index}`).toEqual({ beside: true, flush: true, card: "0px" });
    }
  });

  test("a row opens its editor underneath itself, and a closed row's editor takes no room", async ({ page }) => {
    await render(page, settingsBody({ root: false, open: false }), 390, 800);
    const row = page.locator(".byok-key");
    await expect(row.locator(".setting-fact-editor")).toBeHidden();
    await expect(row.locator('.setting-fact-verb[data-when="closed"]')).toBeVisible();
    await expect(row.locator('.setting-fact-verb[data-when="open"]')).toBeHidden();
    const closed = (await row.boundingBox())!.height;
    await row.locator("summary").click();
    await expect(row.locator('.setting-fact-verb[data-when="open"]')).toBeVisible();
    await expect(row.locator('.setting-fact-verb[data-when="closed"]')).toBeHidden();
    const summary = (await row.locator("summary").boundingBox())!;
    const editor = (await row.locator(".setting-fact-editor").boundingBox())!;
    expect(editor.y).toBeGreaterThanOrEqual(summary.y + summary.height - 1);
    expect((await row.boundingBox())!.height).toBeGreaterThan(closed);
    // 16px, so iOS does not zoom the page when the field takes focus.
    expect(await row.locator("input").evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  });

  test("the way out is the last row of the page, in the risk tone", async ({ page }) => {
    await render(page, settingsBody({ root: false, open: false }), 390, 800);
    const colours = await page.evaluate(() => {
      const doors = [...document.querySelectorAll(".settings-panel .data-ai-door strong")];
      return doors.map((node) => getComputedStyle(node).color);
    });
    expect(colours.at(-1)).not.toBe(colours[0]);
    const last = await page.evaluate(() => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>(".settings-panel a")];
      return links.at(-1)?.getAttribute("href");
    });
    expect(last).toBe("/pt-BR/account/delete");
  });

  test("the fixture still mirrors the markup the components emit", () => {
    const read = (...path: string[]) => readFileSync(join(ROOT, "src", ...path), "utf8");
    const fact = read("features", "settings", "setting-fact.tsx");
    for (const name of ["setting-fact-summary", "setting-fact-label", "setting-fact-value", "setting-fact-verb", "setting-fact-editor"]) {
      expect(fact, `the row lost ${name}`).toContain(`className="${name}"`);
    }
    expect(fact).toContain("<details");
    const form = read("features", "profile", "settings-form.tsx");
    for (const name of ["settings-group", "settings-group-title", "settings-rows", "settings-row", "settings-row-copy", "settings-row-control", "settings-feedback-region", "settings-receipt-undo"]) {
      expect(form, `the form lost ${name}`).toContain(`className="${name}"`);
    }
    const nav = read("features", "settings", "settings-section-nav.tsx");
    for (const name of ["settings-nav-copy", "settings-nav-name", "settings-nav-summary", "settings-nav-chevron"]) expect(nav).toContain(`className="${name}"`);
    expect(nav, "the coloured icon tiles are back").not.toContain("settings-nav-icon");
    for (const [file, uses] of [
      [read("features", "byok", "credential-panel.tsx"), 'className="byok-key"'],
      [read("features", "agent", "automation-section.tsx"), 'group="automation-category"'],
      [read("features", "notifications", "push-controls.tsx"), 'className="push-preferences-fact"'],
      [read("features", "pwa", "install-section.tsx"), "<SettingFact"],
      [read("features", "privacy", "privacy-section.tsx"), "<SettingFact"],
    ] as const) {
      expect(file).toContain("<SettingFact");
      expect(file).toContain(uses);
    }
    // One door to deletion: the group's last section, not also the privacy section.
    expect(read("features", "privacy", "privacy-section.tsx")).not.toContain("/account/delete`");
    const content = read("features", "settings", "settings-section-content.tsx");
    expect(content.lastIndexOf("<AccountDataSection")).toBeGreaterThan(content.lastIndexOf("<DataAiSection"));
  });
});

/*
 * ============================================================================
 * The signed-out pages (Editorial calmo, ADR-180): the five under `/auth` and
 * the public entry page.
 *
 * They are not inside the app shell, so they are composed on their own
 * document here — the frame `src/app/[locale]/auth/layout.tsx` emits, with
 * `entry.css`, the sheet that draws them, after the shared ones. The markup
 * mirrors the pages; the last test fails when the two stop agreeing.
 * ============================================================================
 */

// `history.css` draws the "Voltar para Ajustes" strip the deletion page wears.
const signedOutCss = [css, ...["history.css", "entry.css"].map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))].join("\n");

const signedOutHeader = `<header class="auth-top"><a href="/" class="auth-brand" aria-label="My Brain"><span class="brand-mark">B</span><span class="brand-name">My Brain</span></a><a class="auth-language" href="/en/auth/login" aria-label="Mudar para English" hreflang="en"><span lang="en">English</span></a></header>`;

const signedOutField = (label: string, name: string, type: string, extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" required${extra}></label>`;

const signedOutLinks = (labels: readonly string[]) =>
  `<nav aria-label="Outros caminhos" class="auth-links">${labels.map((label) => `<a href="#">${label}</a>`).join("")}</nav>`;

const SIGNED_OUT_SUBMIT = (label: string) =>
  `<button type="submit">${label}</button><p aria-atomic="true" aria-live="polite" class="sr-only" role="status"></p>`;

/** The longest sentences these pages can say, so the worst case is what is measured. */
const SIGNED_OUT_ALERT = `<p class="form-alert" role="alert">Este ambiente ainda não está configurado para enviar e-mails de autenticação. Avise o responsável pelo produto.</p>`;
const SIGNED_OUT_SUCCESS = `<p class="form-success" role="status">Se a conta existir, o link de recuperação chegará em instantes.</p>`;
const SIGNED_OUT_HINT = `<p aria-live="polite" class="auth-hint" data-state="missing" id="hint">Ainda falta: 12 caracteres, uma maiúscula, uma minúscula, um número e um símbolo.</p>`;

const SIGNED_OUT_PAGES: Readonly<Record<string, string>> = {
  login: `<h1>Entre no seu Brain.</h1><form class="auth-form">${signedOutField("E-mail", "email", "email")}${signedOutField("Senha", "password", "password")}${SIGNED_OUT_SUBMIT("Entrar")}</form>${signedOutLinks(["Esqueci minha senha", "Criar conta", "Reenviar confirmação"])}`,
  "login, refused": `<h1>Entre no seu Brain.</h1>${SIGNED_OUT_ALERT}<form class="auth-form">${signedOutField("E-mail", "email", "email")}${signedOutField("Senha", "password", "password")}${SIGNED_OUT_SUBMIT("Entrar")}</form>${signedOutLinks(["Esqueci minha senha", "Criar conta", "Reenviar confirmação"])}`,
  "login, link sent": `<h1>Entre no seu Brain.</h1>${SIGNED_OUT_SUCCESS}<form class="auth-form">${signedOutField("E-mail", "email", "email")}${signedOutField("Senha", "password", "password")}${SIGNED_OUT_SUBMIT("Entrar")}</form>${signedOutLinks(["Esqueci minha senha", "Criar conta", "Reenviar confirmação"])}`,
  "register, door shut, refused": `<h1>Cadastro fechado.</h1><p class="form-alert" role="status">O cadastro está fechado no momento. Esta página não recolhe e-mails e não existe lista de espera.</p>${SIGNED_OUT_ALERT}<form class="auth-form">${signedOutField("Nome", "displayName", "text")}${signedOutField("E-mail", "email", "email")}${signedOutField("Senha", "password", "password", ' aria-describedby="hint"')}${SIGNED_OUT_HINT}${signedOutField("Confirme a senha", "passwordConfirmation", "password")}<label class="auth-consent"><input name="acceptedPolicies" required type="checkbox" value="on"><span>Li e aceito os <a href="#">Termos de Uso</a> e a <a href="#">Política de Privacidade</a>.</span></label><div class="cf-turnstile" style="height:65px"></div>${SIGNED_OUT_SUBMIT("Criar conta")}</form>${signedOutLinks(["Já tenho conta", "O que é o My Brain"])}`,
  recover: `<h1>Recupere sua senha.</h1><p class="auth-caption">Enviaremos um link seguro para seu e-mail.</p><form class="auth-form">${signedOutField("E-mail", "email", "email")}${SIGNED_OUT_SUBMIT("Enviar link")}</form>${signedOutLinks(["Voltar ao login"])}`,
  resend: `<h1>Reenvie a confirmação.</h1><p class="auth-caption">Se houver uma conta aguardando confirmação para este e-mail, enviaremos um novo link.</p><form class="auth-form">${signedOutField("E-mail", "email", "email")}${SIGNED_OUT_SUBMIT("Reenviar link")}</form>${signedOutLinks(["Voltar ao login"])}`,
  reset: `<h1>Defina uma nova senha.</h1><form class="auth-form">${signedOutField("Nova senha", "password", "password", ' aria-describedby="hint"')}${SIGNED_OUT_HINT}${signedOutField("Confirme a nova senha", "passwordConfirmation", "password")}${SIGNED_OUT_SUBMIT("Atualizar senha")}</form>${signedOutLinks(["Solicitar outro link"])}`,
};

const signedOutAuth = (page: string) =>
  `<div class="auth-shell" lang="pt-BR">${signedOutHeader}<main class="auth-main"><div class="auth-column">${SIGNED_OUT_PAGES[page]}</div></main></div>`;

const SIGNED_OUT_ENTRY = `<div class="entry-page" lang="pt-BR">${signedOutHeader}<header class="entry-header"><h1>Um lugar para escrever o que você precisa lembrar, e recuperar depois com contexto.</h1><a class="entry-sign-in" href="#">Já tenho conta</a><p class="entry-closed">O cadastro está fechado no momento. Esta página não recolhe e-mails e não existe lista de espera.</p></header><section class="entry-claims" aria-labelledby="c"><h2 id="c">O que este produto faz</h2><ul>${["Você escreve em texto livre. O produto lê, separa tarefas, pessoas, datas e o que é só para lembrar, e pergunta quando não tem certeza.", "Suas palavras são gravadas antes de qualquer modelo rodar.", "A IA usa uma credencial sua, que você fornece e pode remover.", "A política de privacidade e os termos de uso ficam abaixo."].map((claim) => `<li>${claim}</li>`).join("")}</ul></section><section class="entry-documents" aria-label="Documentos"><a href="#">Termos de Uso</a><a href="#">Política de Privacidade</a></section></div>`;

/*
 * The three gates an account is sent to instead of the product — consent,
 * account-state and account deletion — in the same frame and column. Mirrors
 * `consent-surface.tsx`, `account-state-surface.tsx`, `deletion-surface.tsx`
 * and the strip `account/delete/page.tsx` mounts above the last.
 */
const GATE_BUTTON = (label: string) =>
  `<form><input type="hidden" name="locale" value="pt-BR"><button type="submit" class="ui-button ui-button--primary ui-button--md ui-button--full auth-primary-action"><span class="ui-button__label">${label}</span></button></form>`;

const SIGNED_OUT_GATES: Readonly<Record<string, string>> = {
  "consent, sign-out refused": `<div class="auth-column"><h1>Antes de continuar</h1><p class="auth-caption">Os documentos mudaram desde o seu último aceite. Leia a versão atual e aceite para continuar; o acesso ao produto volta assim que o novo aceite é registrado.</p><div class="auth-section"><p class="auth-section-title">Leia antes de aceitar:</p><ul class="auth-facts"><li><a href="#">Termos de Uso</a></li><li><a href="#">Política de Privacidade</a></li></ul></div>${GATE_BUTTON("Aceitar e continuar")}<p class="form-alert" role="alert">Não foi possível registrar o aceite agora. Tente novamente.</p><section aria-labelledby="d" class="auth-aside"><h2 id="d">Se você não quiser aceitar</h2><p>Aceitar não é obrigatório. Você pode encerrar a sessão e voltar depois, ou excluir a conta — a exclusão apaga o seu conteúdo e é irreversível.</p><div class="auth-links"><form><input type="hidden" name="locale" value="pt-BR"><button class="auth-link-button" type="submit">Sair da conta</button></form><a class="auth-risk-link" href="#">Excluir a conta</a></div><p class="form-alert" role="alert">Não foi possível sair agora. Tente novamente.</p></section></div>`,
  "account-state, suspended": `<div class="auth-column"><h1>Conta suspensa</h1><p class="auth-caption">Sua conta está suspensa e o produto está indisponível por enquanto. Seus dados permanecem guardados e intactos.</p><ul class="auth-facts"><li>Motivo: a conta está em análise.</li><li>Lembretes que vencerem durante a suspensão não serão enviados depois; eles continuam na sua lista de lembretes.</li></ul><p>Se você acredita que isso é um engano, entre em contato com o operador do serviço.</p>${GATE_BUTTON("Sair da conta")}</div>`,
  "account deletion, refused": `<nav aria-label="Conta e dados" class="data-ai-tabs"><a class="data-ai-up" href="#">${ICON}Voltar para Ajustes</a><div class="data-ai-lenses"><span aria-current="page" class="data-ai-lens">Apagar a conta</span></div></nav><div class="auth-column"><h1>Excluir a conta</h1><p class="auth-warning">A exclusão é definitiva. Depois que ela começa, não há como desfazer nem recuperar o que foi apagado.</p><ul class="auth-facts"><li>Serão apagados todos os seus registros, interpretações, tarefas, pessoas, projetos, lembretes, conversas, memórias, arquivos enviados e o histórico de uso da sua conta.</li><li>Fica guardado apenas um registro sem identificação da própria exclusão.</li><li>A exclusão começa assim que você confirma e costuma terminar em alguns instantes.</li></ul><form class="auth-form"><input type="hidden" name="locale" value="pt-BR"><label>Para confirmar, digite EXCLUIR<input autocomplete="off" maxlength="64" name="confirmation" required></label><label>Confirme sua senha<input autocomplete="current-password" maxlength="256" name="password" required type="password"></label><div class="cf-turnstile" style="height:65px"></div><button class="auth-danger-action" type="submit">Excluir minha conta definitivamente</button></form><p class="form-alert" role="alert">A verificação de segurança não foi aceita. Recarregue a página e tente de novo.</p><p class="form-hint">Recarregue a página antes de tentar novamente: a verificação de segurança só vale uma vez.</p></div>`,
};

const signedOutGate = (page: string) =>
  `<div class="auth-shell" lang="pt-BR">${signedOutHeader}<main class="auth-main">${SIGNED_OUT_GATES[page]}</main></div>`;

async function renderSignedOut(page: Page, body: string, width: number, height: number, theme?: "dark") {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html lang="pt-BR"${theme ? ` data-theme="${theme}"` : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}
${signedOutCss}
</style></head><body>${body}</body></html>`);
  await page.waitForTimeout(60);
}

/**
 * Every control under 44px. A checkbox is measured by the label that carries
 * it, which is its target; nothing else is excused — the two documents inside
 * the consent sentence included.
 */
async function signedOutShortTargets(page: Page) {
  return page.evaluate((minimum) => {
    const targets = [...document.querySelectorAll<HTMLElement>("a, button, input:not([type=hidden])")].map((node) =>
      node instanceof HTMLInputElement && node.type === "checkbox" ? node.closest<HTMLElement>("label") ?? node : node,
    );
    return targets.filter((node) => node.getClientRects().length > 0)
      .map((node) => ({ label: (node.textContent ?? "").trim().slice(0, 24) || node.getAttribute("name") || node.tagName, height: Math.round(node.getBoundingClientRect().height) }))
      .filter((entry) => entry.height < minimum)
      .map((entry) => `${entry.label}:${entry.height}`);
  }, TOUCH_TARGET);
}

test.describe("the signed-out pages as one calm column (Editorial calmo)", () => {
  for (const [width, height] of [[390, 844], [320, 568]] as const) {
    test(`no sideways scroll, no target under 44px and no field under 16px at ${width} CSS px`, async ({ page }) => {
      const bodies = [
        ...Object.keys(SIGNED_OUT_PAGES).map((name) => [name, signedOutAuth(name)] as const),
        ...Object.keys(SIGNED_OUT_GATES).map((name) => [name, signedOutGate(name)] as const),
        ["the entry page", SIGNED_OUT_ENTRY] as const,
      ];
      for (const [name, body] of bodies) {
        await renderSignedOut(page, body, width, height);
        expect(await sidewaysOverflow(page), name).toBeLessThanOrEqual(1);
        expect(await signedOutShortTargets(page), name).toEqual([]);
        const fields = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLInputElement>("input:not([type=hidden]):not([type=checkbox])")]
            .map((field) => parseFloat(getComputedStyle(field).fontSize)));
        // 16px, so iOS does not zoom the page when a field takes focus.
        for (const size of fields) expect(size, name).toBeGreaterThanOrEqual(16);
        if (name in SIGNED_OUT_PAGES || name.startsWith("account deletion")) expect(fields.length, name).toBeGreaterThan(0);
      }
    });
  }

  test("the sentence starts at the same place on every page, and the one action is the column's width", async ({ page }) => {
    const tops = new Set<number>();
    for (const name of Object.keys(SIGNED_OUT_PAGES)) {
      await renderSignedOut(page, signedOutAuth(name), 390, 844);
      const measured = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const column = box(".auth-column");
        const button = box(".auth-form button");
        return {
          heading: Math.round(box("h1").top),
          brandLeft: Math.round(box(".auth-brand").left),
          columnLeft: Math.round(column.left),
          full: Math.abs(button.left - column.left) <= 1 && Math.abs(button.right - column.right) <= 1,
          buttons: document.querySelectorAll(".auth-shell button").length,
        };
      });
      tops.add(measured.heading);
      // The mark, the sentence and the fields share one left edge.
      expect(measured.brandLeft, name).toBe(measured.columnLeft);
      expect(measured.full, name).toBe(true);
      expect(measured.buttons, name).toBe(1);
    }
    expect([...tops]).toHaveLength(1);
  });

  test("on a phone, sign-in fits one screen with its button in the lower half", async ({ page }) => {
    await renderSignedOut(page, signedOutAuth("login"), 390, 844);
    const measured = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      button: document.querySelector(".auth-form button")!.getBoundingClientRect(),
    }));
    expect(measured.scroll).toBeLessThanOrEqual(844);
    expect(measured.button.top + measured.button.height / 2).toBeGreaterThan(844 / 2);
  });

  test("there is no card: the column has no border, no fill and no shadow, in light and in dark", async ({ page }) => {
    for (const theme of [undefined, "dark"] as const) {
      await renderSignedOut(page, signedOutAuth("login, refused"), 390, 844, theme);
      const drawn = await page.evaluate(() => {
        const column = getComputedStyle(document.querySelector(".auth-column")!);
        const alert = getComputedStyle(document.querySelector(".form-alert")!);
        return {
          border: column.borderTopWidth, shadow: column.boxShadow, fill: column.backgroundColor,
          alertFill: alert.backgroundColor, alertRule: alert.borderLeftWidth, alertTop: alert.borderTopWidth,
          page: getComputedStyle(document.querySelector(".auth-shell")!).backgroundImage,
        };
      });
      expect(drawn, theme ?? "light").toEqual({
        border: "0px", shadow: "none", fill: "rgba(0, 0, 0, 0)",
        alertFill: "rgba(0, 0, 0, 0)", alertRule: "2px", alertTop: "0px", page: "none",
      });
    }
  });

  test("the consent box sits on the line of its sentence, not above it", async ({ page }) => {
    await renderSignedOut(page, signedOutAuth("register, door shut, refused"), 390, 844);
    const measured = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>(".auth-consent input")!.getBoundingClientRect();
      const text = document.querySelector<HTMLElement>(".auth-consent span")!.getBoundingClientRect();
      return { size: Math.round(box.width), beside: box.right <= text.left, overlap: box.top < text.bottom && box.bottom > text.top };
    });
    // The control itself is the 44px target (2O-MOBILE-002 measures the input,
    // not its label); the face drawn inside it is 20px.
    expect(measured).toEqual({ size: 44, beside: true, overlap: true });
  });

  test("on desktop the column stays a reading measure, centred, and is not stretched to fill", async ({ page }) => {
    await renderSignedOut(page, signedOutAuth("login"), 1280, 900);
    const column = (await page.locator(".auth-column").boundingBox())!;
    expect(column.width).toBeLessThanOrEqual(400);
    expect(Math.abs(column.x + column.width / 2 - 640)).toBeLessThanOrEqual(1);
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("the entry page offers its one way in before its claims, and the claims are rows", async ({ page }) => {
    await renderSignedOut(page, SIGNED_OUT_ENTRY, 390, 844);
    const measured = await page.evaluate(() => {
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
      const claim = getComputedStyle(document.querySelector(".entry-claims li")!);
      return {
        order: top("h1") < top(".entry-sign-in") && top(".entry-sign-in") < top(".entry-claims"),
        firstScreen: document.querySelector(".entry-sign-in")!.getBoundingClientRect().bottom <= 844,
        box: claim.borderTopWidth, radius: claim.borderTopLeftRadius, rule: claim.borderBottomWidth, fill: claim.backgroundColor,
      };
    });
    expect(measured).toEqual({ order: true, firstScreen: true, box: "0px", radius: "0px", rule: "1px", fill: "rgba(0, 0, 0, 0)" });
  });

  test("the three gates are the same column: no card, their facts as rows, the way to say no under a rule", async ({ page }) => {
    for (const name of Object.keys(SIGNED_OUT_GATES)) {
      await renderSignedOut(page, signedOutGate(name), 390, 844);
      const drawn = await page.evaluate(() => {
        const column = document.querySelector(".auth-column")!;
        const style = getComputedStyle(column);
        const fact = getComputedStyle(document.querySelector(".auth-facts > li")!);
        const shell = document.querySelector(".auth-shell")!;
        return {
          border: style.borderTopWidth, shadow: style.boxShadow, fill: style.backgroundColor,
          wash: getComputedStyle(shell).backgroundImage,
          factBox: fact.borderTopWidth, factRule: fact.borderBottomWidth, factFill: fact.backgroundColor,
          sameEdge: Math.round(column.getBoundingClientRect().left) === Math.round(document.querySelector(".auth-brand")!.getBoundingClientRect().left),
          primary: document.querySelectorAll(".auth-primary-action, .auth-form button").length,
        };
      });
      expect(drawn, name).toEqual({
        border: "0px", shadow: "none", fill: "rgba(0, 0, 0, 0)", wash: "none",
        factBox: "0px", factRule: "1px", factFill: "rgba(0, 0, 0, 0)", sameEdge: true, primary: 1,
      });
    }

    await renderSignedOut(page, signedOutGate("consent, sign-out refused"), 390, 844);
    const consent = await page.evaluate(() => {
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
      const out = document.querySelector<HTMLElement>(".auth-link-button")!;
      const link = document.querySelector<HTMLElement>(".auth-risk-link")!;
      return {
        order: top(".auth-facts") < top(".auth-primary-action") && top(".auth-primary-action") < top(".auth-aside"),
        rule: getComputedStyle(document.querySelector(".auth-aside")!).borderTopWidth,
        // Sign-out is a form and "Excluir a conta" a link; they are drawn as one line of words.
        oneLine: Math.abs(out.getBoundingClientRect().top - link.getBoundingClientRect().top) <= 1,
        quiet: getComputedStyle(out).backgroundColor,
        rowIsLink: Math.round(document.querySelector(".auth-facts a")!.getBoundingClientRect().width) === Math.round(document.querySelector(".auth-facts li")!.getBoundingClientRect().width),
      };
    });
    expect(consent).toEqual({ order: true, rule: "1px", oneLine: true, quiet: "rgba(0, 0, 0, 0)", rowIsLink: true });
  });

  test("deleting the account: every consequence is above the first field, and the action is the one filled risk button", async ({ page }) => {
    for (const theme of [undefined, "dark"] as const) {
      await renderSignedOut(page, signedOutGate("account deletion, refused"), 390, 844, theme);
      const drawn = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const colour = (selector: string, property: "backgroundColor" | "color" | "borderLeftColor") =>
          getComputedStyle(document.querySelector(selector)!)[property];
        return {
          before: box(".auth-warning").bottom <= box(".auth-facts").top && box(".auth-facts").bottom <= box(".auth-form input:not([type=hidden])").top,
          facts: document.querySelectorAll(".auth-facts > li").length,
          warningRule: getComputedStyle(document.querySelector(".auth-warning")!).borderLeftWidth,
          // The button is filled with the tone the warning's rule and the refusal's words are in.
          filled: colour(".auth-danger-action", "backgroundColor") === colour(".auth-warning", "borderLeftColor")
            && colour(".auth-danger-action", "backgroundColor") === colour(".form-alert", "color"),
          notInk: colour(".auth-danger-action", "backgroundColor") !== colour(".auth-column > h1", "color"),
          full: Math.abs(box(".auth-danger-action").width - box(".auth-column").width) <= 1,
          captchaInside: document.querySelector("form.auth-form .cf-turnstile") !== null,
          stripAbove: box(".data-ai-tabs").bottom <= box("h1").top,
        };
      });
      expect(drawn, theme ?? "light").toEqual({
        before: true, facts: 3, warningRule: "2px", filled: true, notInk: true, full: true, captchaInside: true, stripAbove: true,
      });
    }
  });

  test("the fixture still mirrors the markup the pages emit", () => {
    const read = (...path: string[]) => readFileSync(join(ROOT, "src", ...path), "utf8");
    const frame = read("features", "auth", "signed-out-frame.tsx");
    for (const name of ["auth-shell", "auth-main"]) expect(frame).toContain(`className="${name}"`);
    expect(read("app", "[locale]", "auth", "layout.tsx")).toContain("<SignedOutFrame");
    for (const route of [["consent"], ["account-state"], ["account", "delete"]]) {
      const source = read("app", "[locale]", ...route, "page.tsx");
      expect(source, `${route.join("/")} left the frame`).toContain("<SignedOutFrame");
      expect(source, `${route.join("/")} is on the old stage`).not.toContain("auth-stage");
    }
    const consent = read("features", "legal", "consent-surface.tsx");
    for (const name of ["auth-column", "auth-caption", "auth-section", "auth-section-title", "auth-facts", "auth-aside", "auth-links", "auth-link-button", "auth-risk-link"]) {
      expect(consent, `consent lost ${name}`).toContain(`className="${name}"`);
    }
    const state = read("features", "shell", "account-state-surface.tsx");
    for (const name of ["auth-column", "auth-caption", "auth-facts"]) expect(state, `account-state lost ${name}`).toContain(`className="${name}"`);
    const deletion = read("features", "account", "deletion-surface.tsx");
    for (const name of ["auth-column", "auth-warning", "auth-facts", "auth-form", "auth-danger-action", "form-alert", "form-hint"]) {
      expect(deletion, `deletion lost ${name}`).toContain(`className="${name}"`);
    }
    for (const source of [consent, state, deletion]) expect(source).not.toContain("auth-card");
    // The drawing itself is gone, not just unused.
    const globals = read("app", "globals.css");
    for (const rule of [".auth-stage{", ".auth-card{", ".secondary-button{"]) expect(globals).not.toContain(rule);
    const header = read("features", "auth", "signed-out-header.tsx");
    for (const name of ["auth-top", "auth-brand", "brand-mark", "brand-name", "auth-language"]) {
      expect(header, `the header lost ${name}`).toContain(`className="${name}"`);
    }
    for (const route of ["login", "register", "recover", "resend", "reset"]) {
      const source = read("app", "[locale]", "auth", route, "page.tsx");
      for (const uses of ['className="auth-column"', 'className="auth-form"', 'className="auth-links"', 'className="form-alert" role="alert"']) {
        expect(source, `${route} lost ${uses}`).toContain(uses);
      }
      expect(source, `${route} is a card again`).not.toContain("auth-card");
    }
    expect(read("app", "[locale]", "auth", "register", "page.tsx")).toContain('className="auth-consent"');
    expect(read("features", "auth", "password-hint.tsx")).toContain('className="auth-hint"');
    const entry = read("features", "entry", "entry-page.tsx");
    for (const name of ["entry-page", "entry-header", "entry-sign-in", "entry-closed", "entry-claims", "entry-documents"]) {
      expect(entry, `the entry page lost ${name}`).toContain(`className="${name}"`);
    }
    expect(entry.indexOf('className="entry-sign-in"')).toBeLessThan(entry.indexOf('className="entry-claims"'));
  });
});

/* -------------------------------------------------------------------------- */
/* Custos, Processamento and Busca, recomposed (Editorial calmo, ADR-180).     */
/* -------------------------------------------------------------------------- */

const DADOS_UNBREAKABLE = "extraction_failed:worker_lease_7c1e44aa_pdf_encrypted_after_three_attempts_no_retry_left";

const dadosStrip = (current: string) =>
  `<nav aria-label="Dados e IA" class="data-ai-tabs"><a class="data-ai-up" href="#">${ICON}Ajustes</a><div class="data-ai-lenses">`
  + ["Atividade", "Custos", "Processamento"].map((lens) => `<a class="data-ai-lens"${lens === current ? ' aria-current="page"' : ""} href="#">${lens}</a>`).join("")
  + `</div></nav>`;

const dadosHeader = (title: string) =>
  `<header class="ui-page-header ui-page-header--compact"><div class="ui-page-header__text"><h1 class="ui-page-header__title">${title}</h1></div></header>`;

const costRow = (label: string, caption: string, amount: string, width?: number) =>
  `<li class="cost-row"><span class="cost-row-main"><span class="cost-row-label">${label}</span><span class="cost-row-caption">${caption}</span></span>`
  + `<span class="cost-row-amount">${amount}</span>`
  + (width === undefined ? "" : `<span aria-hidden="true" class="cost-row-rule"><span style="width:${width}%"></span></span>`)
  + `</li>`;

/** Mirrors `costs/page.tsx` with `CostsView` and `QuotaSection`. */
function custosBody(options: { open?: boolean } = {}) {
  const open = options.open ? " open" : "";
  const quota = (title: string, window: string, figure: string) =>
    `<li class="quota-item"><span class="quota-item-copy"><strong>${title}</strong><small class="quota-window">${window}</small></span><span class="quota-figure">${figure}</span></li>`;
  return `<div class="content-page cost-page">${dadosStrip("Custos")}${dadosHeader("Custos de IA")}`
    + `<section aria-label="Resumo de custos" class="cost-figure"><p class="cost-figure-period">Este mês</p><p class="cost-figure-value">US$ 1.284.312,84</p>`
    + `<dl class="cost-figure-others"><div><dt>Hoje</dt><dd>US$ 0,42</dd></div><div><dt>Desde o início</dt><dd>US$ 3.812.940,17</dd></div></dl>`
    + `<p class="cost-zone">Estimativa pelos tokens da API; a fatura da OpenAI é a referência. Períodos no fuso da sua conta (America/Argentina/ComodRivadavia).</p>`
    + `<p class="cost-warning">2 chamadas sem preço: o modelo ainda não está no catálogo, e o total não as inclui.</p></section>`
    + `<section aria-labelledby="cost-by-operation" class="cost-section"><h2 class="cost-section-title" id="cost-by-operation"><span>Por função</span><small>desde o início</small></h2><ul class="cost-rows">`
    + costRow("Chat principal", "52% · 640 chamadas", "US$ 1.984.019,75", 52)
    + costRow(DADOS_UNBREAKABLE, "24% · 1.980 chamadas", "US$ 9,31", 24)
    + costRow("Busca semântica", "<1% · 220 chamadas", "< US$ 0,0001", 1)
    + `</ul></section>`
    + `<section class="quota-section" aria-labelledby="quota-heading"><h2 class="quota-title" id="quota-heading">Limites da conta</h2><ul class="quota-list" aria-label="Limites e uso">`
    + quota("Registros por dia", "Zera à meia-noite UTC", "14 de 300")
    + quota("Espaço de arquivos", "Libera quando você remove arquivos", "131 MiB de 500 MiB")
    + `<li class="quota-item"><span class="quota-item-copy"><strong>Arquivos guardados</strong><small class="quota-window">Libera quando você remove arquivos</small></span><span class="quota-figure unreadable">Não foi possível ler este número agora.</span></li>`
    + `</ul><p class="quota-intro">Os mesmos números que aparecem quando uma ação é recusada. As janelas diárias viram à meia-noite UTC, e não no seu fuso.</p></section>`
    + `<details class="cost-fold"${open}><summary class="cost-fold-summary"><span>Por modelo</span><small>2</small></summary><ul class="cost-rows">`
    + costRow("GPT-5.6 Terra", "73% · 1.310 chamadas · 14.200.000 tokens de entrada, 1.950.000 de saída", "US$ 27,90", 73)
    + costRow("text-embedding-3-small-with-a-very-long-unbroken-model-identifier-2026-11-18", "27% · 220 chamadas · 2.300.000 tokens de entrada, 0 de saída", "US$ 10,27", 27)
    + `</ul></details>`
    + `<details class="cost-fold recent-costs"${open}><summary class="cost-fold-summary"><span>Últimas chamadas</span><small>2</small></summary><ul class="cost-rows">`
    + costRow("Captura e organização", "18/11/2026, 11:12 · GPT-5.6 Terra · 4.510 tokens · 2.048 em cache", "US$ 0,0123")
    + costRow("Revisões e resumos", "18/11/2026, 10:25 · GPT-5.6 Luna · 5.470 tokens", "Sem preço")
    + `</ul></details>`
    + `<details class="cost-fold pricing-catalog"${open}><summary class="cost-fold-summary"><span>Preços aplicados</span><small>openai-2026-10-01</small></summary>`
    + `<p class="cost-fold-note">O custo é calculado com os tokens retornados pela API e o preço padrão congelado em cada chamada.</p><p class="cost-fold-note">Por 1 milhão de tokens</p>`
    + `<ul class="cost-rows"><li class="cost-row"><a class="cost-row-link" href="#" rel="noreferrer" target="_blank"><span class="cost-row-main"><span class="cost-row-label">GPT-5.6 Terra</span><span class="cost-row-caption">entrada $2.5 · cache $0.25 · saída $15</span></span>${ICON}</a></li></ul></details>`
    + `<a class="cost-profile" href="#"><span class="cost-row-label">Perfil de IA</span><span class="cost-profile-value">Qualidade máxima</span>${ICON}</a></div>`;
}

function jobRow(options: { title: string; status: string; word: string; attempt?: string; error?: string; files?: boolean }) {
  return `<li class="jobs-row" data-status="${options.status}"><span class="jobs-row-main"><span class="jobs-row-title">${options.title}</span><time class="jobs-row-caption" datetime="2026-11-18T14:12:00.000Z">18 de nov. de 2026, 11:12</time></span>`
    + `<span class="jobs-row-state"><span class="jobs-row-status">${options.word}</span>${options.attempt ? `<span class="jobs-row-caption">${options.attempt}</span>` : ""}</span>`
    + (options.error || options.files
      ? `<span class="jobs-row-more">`
        + (options.error ? `<details class="jobs-row-detail"${options.error.startsWith("open:") ? " open" : ""}><summary class="jobs-row-detail-summary">Detalhe técnico</summary><p class="jobs-row-error">${options.error.replace(/^open:/, "")}</p><p class="jobs-row-id">Identificador: 0b6f1c2e-7a41-4c5d-9e01-3f2a9d1c5e71</p></details>` : "")
        + (options.files ? `<a class="jobs-row-verb" href="#">Ver em Arquivos</a>` : "")
        + `</span>`
      : "")
    + `</li>`;
}

/** Mirrors `jobs/page.tsx` with `ProcessingView`. */
function processamentoBody(options: { open?: boolean } = {}) {
  const error = `${options.open ? "open:" : ""}${DADOS_UNBREAKABLE}`;
  return `<div class="content-page jobs-page">${dadosStrip("Processamento")}${dadosHeader("Processamento")}`
    + `<div class="jobs-lead"><p class="jobs-lead-sentence" role="status">2 itens em processamento, 2 com falha.</p><p class="jobs-lead-caption">Entre os 50 mais recentes.</p></div>`
    + `<section aria-labelledby="jobs-failed" class="jobs-section"><h2 class="jobs-section-title" id="jobs-failed"><span>Com falha</span><small>2</small></h2><ul class="jobs-rows">`
    + jobRow({ title: "Processar arquivo", status: "failed", word: "Falhou", attempt: "tentativa 3 de 3", error, files: true })
    + jobRow({ title: "Interpretar registro", status: "failed", word: "Falhou", attempt: "tentativa 3 de 3", error })
    + `</ul></section>`
    + `<section aria-labelledby="jobs-active" class="jobs-section"><h2 class="jobs-section-title" id="jobs-active"><span>Em andamento</span><small>2</small></h2><ul class="jobs-rows">`
    + jobRow({ title: "reindex_embeddings_for_every_record_of_the_account_2026", status: "running", word: "Em execução", attempt: "tentativa 1 de 3" })
    + jobRow({ title: "Processar arquivo", status: "pending", word: "Na fila" })
    + `</ul></section>`
    + `<details class="jobs-fold"${options.open ? " open" : ""}><summary class="jobs-fold-summary"><span>Finalizados</span><small>2</small></summary><ul class="jobs-rows">`
    + jobRow({ title: "Interpretar registro", status: "completed", word: "Concluído", attempt: "tentativa 1 de 3" })
    + jobRow({ title: "Interpretar registro", status: "archived", word: "Situação desconhecida" })
    + `</ul></details>`
    + `<nav class="pagination-links" aria-label="Paginação"><a href="#">Próxima</a></nav></div>`;
}

function searchRow(title: string, date: string, snippet: string) {
  return `<li class="search-result"><a class="search-row" href="#"><span class="search-row-title">${title}</span>`
    + (date || snippet ? `<span class="search-row-caption">${date ? `<span class="search-row-date">${date}</span>` : ""}${snippet ? `<span class="search-row-snippet">${snippet}</span>` : ""}</span>` : "")
    + `</a></li>`;
}

const searchGroup = (label: string, rows: string[]) =>
  `<section aria-labelledby="g-${label}" class="search-group"><h2 class="search-group-title" id="g-${label}"><span>${label}</span><small>${rows.length}</small></h2><ul class="search-results">${rows.join("")}</ul></section>`;

/** Mirrors `search/page.tsx` with `SearchSurface`. */
function buscaBody(options: { state: "idle" | "results"; filtersOpen?: boolean }) {
  const form = `<form class="search-form" role="search"><label class="sr-only" for="busca-q">Buscar em tudo que é seu</label>`
    + `<div class="search-field"><input id="busca-q" class="search-input" type="search" placeholder="Buscar em tudo que é seu" autocomplete="off" value="${options.state === "results" ? "carro" : ""}"><button type="submit" class="search-submit">Buscar</button></div>`
    + `<details class="search-filters-disclosure"${options.filtersOpen ? " open" : ""}><summary class="search-filters-summary"><span>Filtros</span><span class="search-filters-active">Organização · Últimos 12 meses</span></summary>`
    + `<div class="search-filters"><label for="busca-type"><span>Tipo</span><select id="busca-type"><option>Todos os tipos</option></select></label><label for="busca-period"><span>Período</span><select id="busca-period"><option>Qualquer data</option></select></label></div></details></form>`;
  const results = `<p class="search-count" role="status" aria-live="polite">4 resultados</p>`
    + `<p class="search-partial tone-attention" role="status">Não consegui buscar em: Organização. Os outros resultados estão completos.</p>`
    + searchGroup("Tarefas", [
      searchRow(`Renovar o seguro do <mark>carro</mark>`, "17 de nov. de 2026", `…a apólice vence dia 30; pedir cotação do seguro do <mark>carro</mark> com a corretora antes de renovar, e comparar com a proposta do ano passado…`),
      searchRow(`Ligar para a oficina sobre a revisão do <mark>carro</mark>`, "", ""),
    ])
    + searchGroup("Arquivos", [
      searchRow(`apolice_seguro_<mark>carro</mark>_2026_porto_renovacao_final_assinada_versao_definitiva_3.pdf`, "14 de jun. de 2026", `…${"SEGURO_AUTO_".repeat(12)}…`),
      searchRow(`Zé (Oficina do Zé)`, "", `Mecânico de confiança do <mark>carro</mark> desde 2021.`),
    ])
    + `<p class="search-bounded">Mostrando os primeiros resultados. Refine a busca para ver menos e melhores.</p>`;
  return `<div class="page-shell"><section class="search-surface">`
    + `<header class="ui-page-header ui-page-header--compact search-header"><div class="ui-page-header__text"><h1 class="ui-page-header__title">Buscar</h1></div></header>`
    + form
    + (options.state === "idle" ? `<p class="search-hint">Tarefas, registros, memórias, pessoas, projetos, organizações e arquivos.</p>` : results)
    + `</section></div>`;
}

test.describe("Custos as a figure over rows (Editorial calmo)", () => {
  for (const width of [390, 320]) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px, folds closed and open`, async ({ page }) => {
      for (const open of [false, true]) {
        await renderLogbook(page, custosBody({ open }), width, 800);
        expect(await sidewaysOverflow(page), `folds ${open ? "open" : "closed"}`).toBeLessThanOrEqual(1);
        expect(await shortTargets(page, ".cost-page"), `folds ${open ? "open" : "closed"}`).toEqual([]);
        // Nothing scrolls sideways inside the page either: the old table did.
        const inner = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".cost-page *")]
          .filter((node) => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== "visible" && !node.closest(".data-ai-lenses"))
          .map((node) => node.className));
        expect(inner, `folds ${open ? "open" : "closed"}`).toEqual([]);
      }
    });
  }

  test("the month's figure is the largest thing on the page and comes before every row", async ({ page }) => {
    await renderLogbook(page, custosBody(), 390, 844);
    const measured = await page.evaluate(() => {
      const size = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
      return {
        largest: size(".cost-figure-value") > size(".ui-page-header__title") && size(".cost-figure-value") > size(".cost-row-amount"),
        first: top(".cost-figure-value") < top(".cost-row"),
        firstScreen: document.querySelector(".cost-figure-value")!.getBoundingClientRect().bottom <= 420,
      };
    });
    expect(measured).toEqual({ largest: true, first: true, firstScreen: true });
  });

  test("a row is a line between hairlines, its amount on the right and its rule as long as its share", async ({ page }) => {
    await renderLogbook(page, custosBody(), 390, 844);
    const row = page.locator(".cost-section .cost-row").first();
    expect(await row.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.borderTopWidth, style.borderLeftWidth, style.borderBottomWidth, style.borderTopLeftRadius, style.backgroundColor];
    })).toEqual(["0px", "0px", "1px", "0px", "rgba(0, 0, 0, 0)"]);
    const box = (await row.boundingBox())!;
    const amount = (await row.locator(".cost-row-amount").boundingBox())!;
    expect(Math.abs(amount.x + amount.width - (box.x + box.width))).toBeLessThanOrEqual(1);
    const track = (await row.locator(".cost-row-rule").boundingBox())!;
    const rule = (await row.locator(".cost-row-rule > span").boundingBox())!;
    expect(rule.width / track.width).toBeCloseTo(0.52, 1);
  });

  test("what is consulted is three closed lines, on a phone and on a desktop", async ({ page }) => {
    for (const [width, height] of [[390, 844], [1280, 900]] as const) {
      await renderLogbook(page, custosBody(), width, height);
      for (const fold of await page.locator(".cost-fold").all()) {
        expect((await fold.boundingBox())!.height, `at ${width}`).toBeLessThanOrEqual(48);
      }
      await expect(page.locator(".cost-fold .cost-row").first()).toBeHidden();
      await expect(page.locator(".cost-page table")).toHaveCount(0);
    }
  });

  test("the fixture still mirrors the markup the page emits", () => {
    const read = (...path: string[]) => readFileSync(join(ROOT, "src", ...path), "utf8");
    const view = read("features", "costs", "cost-view.tsx");
    for (const name of ["cost-figure", "cost-figure-period", "cost-figure-value", "cost-figure-others", "cost-zone", "cost-warning", "cost-section", "cost-section-title", "cost-rows", "cost-row", "cost-row-main", "cost-row-label", "cost-row-caption", "cost-row-amount", "cost-row-rule", "cost-fold-summary", "cost-fold-note", "cost-row-link", "cost-profile", "cost-profile-value"]) {
      expect(view, `the view lost ${name}`).toContain(`"${name}"`);
    }
    for (const name of ["cost-fold", "cost-fold recent-costs", "cost-fold pricing-catalog"]) expect(view).toContain(`className="${name}"`);
    expect(view).not.toContain("<table");
    const quota = read("features", "quotas", "quota-section.tsx");
    for (const name of ["quota-section", "quota-title", "quota-list", "quota-item", "quota-item-copy", "quota-window", "quota-figure", "quota-intro"]) {
      expect(quota, `the limits lost ${name}`).toContain(`"${name}`);
    }
    expect(read("app", "[locale]", "app", "costs", "page.tsx")).toContain('className="content-page cost-page"');
  });
});

test.describe("Processamento as an answer over rows (Editorial calmo)", () => {
  for (const width of [390, 320]) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px, folds closed and open`, async ({ page }) => {
      for (const open of [false, true]) {
        await renderLogbook(page, processamentoBody({ open }), width, 800);
        expect(await sidewaysOverflow(page), `folds ${open ? "open" : "closed"}`).toBeLessThanOrEqual(1);
        expect(await shortTargets(page, ".jobs-page"), `folds ${open ? "open" : "closed"}`).toEqual([]);
      }
    });
  }

  test("the answer comes first, in the reading face, above the first row", async ({ page }) => {
    await renderLogbook(page, processamentoBody(), 390, 844);
    const measured = await page.evaluate(() => {
      const lead = document.querySelector(".jobs-lead-sentence")!;
      const style = getComputedStyle(lead);
      return {
        face: style.fontFamily.includes("Georgia"),
        larger: parseFloat(style.fontSize) > parseFloat(getComputedStyle(document.querySelector(".ui-page-header__title")!).fontSize),
        first: lead.getBoundingClientRect().bottom <= document.querySelector(".jobs-row")!.getBoundingClientRect().top,
      };
    });
    expect(measured).toEqual({ face: true, larger: true, first: true });
  });

  test("failures come before what is in flight, and the finished rows are one closed line", async ({ page }) => {
    await renderLogbook(page, processamentoBody(), 390, 844);
    const failed = (await page.locator("#jobs-failed").boundingBox())!;
    const active = (await page.locator("#jobs-active").boundingBox())!;
    const fold = (await page.locator(".jobs-fold").boundingBox())!;
    expect(failed.y).toBeLessThan(active.y);
    expect(active.y).toBeLessThan(fold.y);
    expect(fold.height).toBeLessThanOrEqual(48);
    await expect(page.locator(".jobs-fold .jobs-row").first()).toBeHidden();
    await expect(page.locator(".jobs-row-error").first()).toBeHidden();
  });

  test("the state is a word, never a pill", async ({ page }) => {
    await renderLogbook(page, processamentoBody(), 390, 844);
    const status = page.locator('.jobs-row[data-status="failed"] .jobs-row-status').first();
    expect(await status.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.borderTopWidth, style.paddingLeft, style.textTransform];
    })).toEqual(["rgba(0, 0, 0, 0)", "0px", "0px", "none"]);
    await expect(status).toHaveText("Falhou");
  });

  test("the fixture still mirrors the markup the page emits", () => {
    const read = (...path: string[]) => readFileSync(join(ROOT, "src", ...path), "utf8");
    const view = read("features", "processing", "processing-view.tsx");
    for (const name of ["jobs-lead", "jobs-lead-sentence", "jobs-lead-caption", "jobs-section", "jobs-section-title", "jobs-rows", "jobs-fold", "jobs-fold-summary", "jobs-row", "jobs-row-main", "jobs-row-title", "jobs-row-caption", "jobs-row-state", "jobs-row-status", "jobs-row-more", "jobs-row-detail", "jobs-row-detail-summary", "jobs-row-error", "jobs-row-id", "jobs-row-verb"]) {
      expect(view, `the view lost ${name}`).toContain(`className="${name}"`);
    }
    expect(view).not.toContain("status-badge");
    expect(read("app", "[locale]", "app", "jobs", "page.tsx")).toContain('className="content-page jobs-page"');
  });
});

test.describe("Busca as a field over rows (Editorial calmo)", () => {
  for (const width of [390, 320]) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px, idle and with results, filters closed and open`, async ({ page }) => {
      for (const state of ["idle", "results"] as const) {
        for (const filtersOpen of [false, true]) {
          await render(page, buscaBody({ state, filtersOpen }), width, 800);
          const label = `${state}, filters ${filtersOpen ? "open" : "closed"}`;
          expect(await sidewaysOverflow(page), label).toBeLessThanOrEqual(1);
          expect(await shortTargets(page, ".search-surface"), label).toEqual([]);
        }
      }
    });
  }

  test("before a search the page is its field: nothing else but one caption", async ({ page }) => {
    await render(page, buscaBody({ state: "idle" }), 390, 844);
    const field = (await page.locator(".search-field").boundingBox())!;
    const surface = (await page.locator(".search-surface").boundingBox())!;
    // The field opens the surface: the page's name is its heading, and is not drawn.
    expect(field.y - surface.y).toBeLessThanOrEqual(40);
    await expect(page.locator(".search-surface h1")).toHaveCount(1);
    expect((await page.locator(".search-header").boundingBox())!.height).toBeLessThanOrEqual(1);
    await expect(page.locator(".search-filters")).toBeHidden();
    await expect(page.locator(".search-group")).toHaveCount(0);
    const hint = (await page.locator(".search-hint").boundingBox())!;
    expect(hint.y + hint.height - field.y).toBeLessThanOrEqual(180);
  });

  test("the field is a line to write in, not a box, and never under 16px", async ({ page }) => {
    await render(page, buscaBody({ state: "idle" }), 390, 844);
    expect(await page.locator(".search-input").evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.borderTopWidth, style.borderBottomWidth, style.backgroundColor, parseFloat(style.fontSize) >= 16];
    })).toEqual(["0px", "0px", "rgba(0, 0, 0, 0)", true]);
    expect(await page.locator(".search-field").evaluate((node) => getComputedStyle(node).borderBottomWidth)).toBe("1px");
  });

  test("a result is a row that is a link, under the heading of its kind", async ({ page }) => {
    await render(page, buscaBody({ state: "results" }), 390, 844);
    const group = page.locator(".search-group").first();
    expect(await group.locator(".search-group-title").evaluate((node) => getComputedStyle(node).borderBottomWidth)).toBe("1px");
    const row = group.locator(".search-row").first();
    expect(await row.evaluate((node) => {
      const style = getComputedStyle(node);
      return [node.tagName, style.borderTopWidth, style.borderTopLeftRadius, style.backgroundColor];
    })).toEqual(["A", "0px", "0px", "rgba(0, 0, 0, 0)"]);
    expect(await row.locator(".search-row-title").evaluate((node) => getComputedStyle(node).fontFamily)).toContain("Georgia");
    // A long snippet is two lines of caption at most.
    const caption = (await row.locator(".search-row-caption").boundingBox())!;
    expect(caption.height).toBeLessThanOrEqual(40);
    // The matched word is marked without a highlighter's colour.
    expect(await row.locator("mark").first().evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  });

  test("the fixture still mirrors the markup the surface emits", () => {
    const surface = readFileSync(join(ROOT, "src", "features", "search", "search-surface.tsx"), "utf8");
    for (const name of ["search-surface", "search-form", "search-field", "search-input", "search-submit", "search-filters-disclosure", "search-filters-summary", "search-filters-active", "search-filters", "search-hint", "search-partial tone-attention", "search-group", "search-group-title", "search-results", "search-result", "search-row", "search-row-title", "search-row-caption", "search-row-date", "search-row-snippet", "search-bounded"]) {
      expect(surface, `the surface lost ${name}`).toContain(`className="${name}"`);
    }
    expect(surface).toContain('"search-count"');
    expect(surface).toContain('className="search-header"');
  });
});
