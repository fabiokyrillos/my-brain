/**
 * Layout contracts for the surfaces Editorial calmo (ADR-180) reached last:
 * Lembretes (the list and the reminder's own page), the guided path on Hoje,
 * and a command's result in the Conversar thread.
 *
 * In the style of `layout-contracts.spec.ts`, and for its reason: these need a
 * real layout engine. jsdom cannot see a grid track starving a title, a target
 * 23px tall, or a flex basis that became a 200px blank band in a column — and
 * each of those shipped under a green unit suite. The pages are composed from
 * the repository's real stylesheets and the markup the components emit; each
 * `describe` checks, against the component source, that the classes its
 * fixture uses are still the ones emitted.
 *
 * Every surface is measured at 390 and 320 CSS px: nothing scrolls sideways
 * with a title that cannot break, and no target is under 44px — at rest and
 * with each editor open.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { UNBREAKABLE, reminderDetailBody, remindersBody } from "./support/reminder-fixtures";

const ROOT = join(__dirname, "..");
// Token sheets first (ADR-114): the palette every other rule resolves against.
const STYLESHEETS = [
  "tokens.css", "experience.css", "ui.css", "globals.css", "operations.css", "chat.css", "assistant.css",
  "task-commands.css", "calendar.css", "reminders.css", "onboarding.css",
] as const;
const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");
// The `next/font` variables, stubbed: an undeclared `var()` voids every `--type-*` token.
const FONT_STUB = ":root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}";

const source = (...parts: string[]) => readFileSync(join(ROOT, "src", ...parts), "utf8");

async function render(page: Page, body: string, width: number, theme?: "dark") {
  await page.setViewportSize({ width, height: 844 });
  await page.setContent(`<!doctype html><html lang="pt-BR"${theme ? ` data-theme="${theme}"` : ""}><head><meta charset="utf-8" /><title>My Brain</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" /><style>${FONT_STUB}${css}</style></head><body><main>${body}</main></body></html>`, { waitUntil: "load" });
  await page.waitForTimeout(40);
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Every visible control shorter than a touch target, as "label:height". */
async function shortTargets(page: Page) {
  return page.evaluate((minimum) =>
    [...document.querySelectorAll<HTMLElement>("main a, main button, main summary, main select, main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main label:has(input[type=checkbox]), main label:has(input[type=radio])")]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => ({ label: (node.textContent ?? "").trim().slice(0, 24) || node.tagName, height: Math.round(node.getBoundingClientRect().height) }))
      .filter((entry) => entry.height < minimum)
      .map((entry) => `${entry.label}:${entry.height}`), 44);
}

/** Elements under `scope` that draw a box: a fill, a radius, or a border on all four sides. */
async function boxes(page: Page, scope: string, selector: string) {
  return page.evaluate(({ scope: root, selector: inner }) =>
    [...document.querySelectorAll<HTMLElement>(`${root} ${inner}`)].filter((node) => {
      const style = getComputedStyle(node);
      const filled = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
      const ringed = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].every((side) => parseFloat(side) > 0);
      return filled || ringed;
    }).map((node) => node.className), { scope, selector });
}

const WIDTHS = [390, 320] as const;

// `axe-core` is a declared devDependency (see `accessibility.spec.ts`).
const AXE_PATH = createRequire(__filename).resolve("axe-core");

/** axe violations at `serious` or above — the classes that do not depend on page chrome. */
async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    // @ts-expect-error injected by addScriptTag
    const results = await window.axe.run(document, { resultTypes: ["violations"], rules: { region: { enabled: false } } });
    return (results.violations as Array<{ id: string; impact: string | null; nodes: unknown[] }>)
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({ id: violation.id, impact: violation.impact, count: violation.nodes.length }));
  });
}

test.describe("Lembretes as sections of rows (Editorial calmo)", () => {
  for (const width of WIDTHS) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px, full and empty`, async ({ page }) => {
      for (const empty of [false, true]) {
        await render(page, remindersBody({ empty }), width);
        expect(await overflow(page), `sideways overflow, empty=${empty}`).toBeLessThanOrEqual(0);
        expect(await shortTargets(page), `short targets, empty=${empty}`).toEqual([]);
      }
    });

    test(`a row is when · what · one verb, and the verb ends inside the row, at ${width} CSS px`, async ({ page }) => {
      await render(page, remindersBody(), width);
      const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".reminder-row")].map((row) => {
        const box = row.getBoundingClientRect();
        const when = row.querySelector(".reminder-row-when")!.getBoundingClientRect();
        const title = row.querySelector(".reminder-row-title")!.getBoundingClientRect();
        const verb = row.querySelector(".reminder-row-verb")?.getBoundingClientRect() ?? null;
        return {
          group: row.closest("section")!.getAttribute("data-group"),
          whenLeft: Math.round(when.left - box.left),
          titleAfterWhen: title.left >= when.right - 1,
          titleWidth: title.width,
          verbAfter: verb === null || verb.left >= title.right - 1,
          verbInside: verb === null || verb.right <= box.right + 1,
          controls: row.querySelectorAll("a, button").length,
        };
      }));
      expect(rows.length).toBeGreaterThanOrEqual(8);
      for (const row of rows) {
        expect(row.whenLeft, "the hour starts the row").toBe(0);
        expect(row.titleAfterWhen).toBe(true);
        expect(row.verbAfter).toBe(true);
        expect(row.verbInside).toBe(true);
        expect(row.controls, "the link and at most one verb").toBeLessThanOrEqual(2);
        expect(row.titleWidth, `the title kept a readable width in ${row.group}`).toBeGreaterThanOrEqual(width === 390 ? 170 : 110);
      }
    });
  }

  test("the title's link covers the whole row, and the verb stays its own target above it", async ({ page }) => {
    await render(page, remindersBody(), 390);
    const row = page.locator(".reminder-row").first();
    const box = (await row.boundingBox())!;
    // A tap on the hour, far from the title's text, lands on the title's link.
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("a, button")?.className ?? "",
      { x: box.x + 10, y: box.y + box.height / 2 });
    expect(hit).toBe("reminder-row-title");
    const verb = (await row.locator(".reminder-verb").boundingBox())!;
    const onVerb = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("a, button")?.className ?? "",
      { x: verb.x + verb.width / 2, y: verb.y + verb.height / 2 });
    expect(onVerb).toBe("reminder-verb");
  });

  test("rows are separated by hairlines and nothing in the list is a box", async ({ page }) => {
    await render(page, remindersBody(), 390);
    expect(await boxes(page, ".reminder-groups", "*")).toEqual([]);
    const row = await page.locator(".reminder-row").first().evaluate((node) => {
      const style = getComputedStyle(node);
      return { bottom: style.borderBottomWidth, radius: style.borderTopLeftRadius };
    });
    expect(row).toEqual({ bottom: "1px", radius: "0px" });
  });

  test("the live regions take no room until they have something to say, at 390px", async ({ page }) => {
    // `.reminder-series-live` had `flex: 1 1 200px`; in the phone's column
    // layout that basis is a height, and it opened a blank 200px band above
    // the list.
    await render(page, remindersBody(), 390);
    const gap = await page.evaluate(() => {
      const head = document.querySelector(".agenda-masthead")!.getBoundingClientRect();
      const list = document.querySelector(".reminder-groups")!.getBoundingClientRect();
      return Math.round(list.top - head.bottom);
    });
    expect(gap).toBeLessThanOrEqual(40);
  });

  test("the subject is the page's largest text and the one action shares the caption's line", async ({ page }) => {
    await render(page, remindersBody(), 390);
    const sizes = await page.evaluate(() => {
      const size = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
      const caption = document.querySelector(".reminders-subject-caption")!.getBoundingClientRect();
      const action = document.querySelector(".reminder-compose-open")!.getBoundingClientRect();
      return {
        subject: size(".reminders-subject-title"), destination: size(".agenda-masthead-title"), rowTitle: size(".reminder-row-title"),
        sameLine: Math.abs((caption.top + caption.height / 2) - (action.top + action.height / 2)) <= 2,
      };
    });
    expect(sizes.subject).toBeGreaterThan(sizes.rowTitle);
    expect(sizes.subject).toBeGreaterThan(sizes.destination);
    expect(sizes.sameLine).toBe(true);
  });

  test("the fixture still mirrors the markup the list emits", () => {
    const list = source("features", "reminders", "reminder-list.tsx");
    for (const name of ["reminder-groups", "reminder-group", "reminder-group-heading", "reminder-group-count", "reminder-group-note", "reminder-rows",
      "reminder-row", "reminder-row-when", "reminder-row-day", "reminder-row-time", "reminder-row-main", "reminder-row-title", "reminder-row-caption",
      "reminder-important", "reminder-row-repeats", "reminder-row-subject", "reminder-views", "reminder-views-label", "reminder-view", "reminder-empty"]) {
      expect(list, `the list lost ${name}`).toContain(name);
    }
    const actions = source("features", "reminders", "reminder-actions.tsx");
    expect(actions).toContain('className="reminder-row-verb"');
    expect(actions).toContain('"reminder-verb"');
    const route = source("app", "[locale]", "app", "reminders", "page.tsx");
    for (const name of ["reminders-subject", "reminders-subject-title", "reminders-subject-caption"]) expect(route).toContain(name);
    // The masthead comes first, then the list, then the other views.
    expect(route.indexOf("<AgendaHeader")).toBeLessThan(route.indexOf("<ReminderList"));
    expect(route.indexOf("<ReminderList")).toBeLessThan(route.indexOf("<ReminderViewNav"));
  });
});

test.describe("One reminder as a page of facts (Editorial calmo)", () => {
  const STATES = [undefined, "reschedule", "edit", "series", "end", "cancel"] as const;

  for (const width of WIDTHS) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px, at rest and with each editor open`, async ({ page }) => {
      for (const open of STATES) {
        await render(page, reminderDetailBody({ open }), width);
        expect(await overflow(page), `sideways overflow, open=${open}`).toBeLessThanOrEqual(0);
        expect(await shortTargets(page), `short targets, open=${open}`).toEqual([]);
      }
    });

    test(`fields are 16px so a phone does not zoom to focus one, at ${width} CSS px`, async ({ page }) => {
      for (const open of ["reschedule", "edit", "series"] as const) {
        await render(page, reminderDetailBody({ open }), width);
        const sizes = await page.locator(".reminder-detail input:not([type=hidden]):not([type=checkbox]):not([type=radio]), .reminder-detail select")
          .evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)));
        expect(sizes.length).toBeGreaterThan(0);
        expect(Math.min(...sizes), `open=${open}`).toBeGreaterThanOrEqual(16);
      }
    });
  }

  test("the reminder's text is the page's one h1 and its largest text", async ({ page }) => {
    await render(page, reminderDetailBody({ title: "Ligar para a mãe" }), 390);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("Ligar para a mãe");
    const sizes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".reminder-detail *")]
      .filter((node) => node.children.length === 0 && (node.textContent ?? "").trim() !== "")
      .map((node) => parseFloat(getComputedStyle(node).fontSize)));
    const title = await page.locator("h1").evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(title).toBe(Math.max(...sizes));
  });

  test("an editor opens inside the fact it changes, under the value, and is set off by a rule rather than a box", async ({ page }) => {
    for (const [open, label] of [["reschedule", "Próximo aviso"], ["series", "Repetição"]] as const) {
      await render(page, reminderDetailBody({ open }), 390);
      const fact = page.locator(".reminder-fact", { has: page.locator("dt", { hasText: label }) });
      const editor = fact.locator(".reminder-fact-editor");
      await expect(editor).toHaveCount(1);
      const [value, panel, row] = await Promise.all([
        fact.locator("dd > .reminder-fact-value, dd .reminder-series-facts").first().boundingBox(),
        editor.boundingBox(),
        fact.boundingBox(),
      ]);
      expect(panel!.y).toBeGreaterThanOrEqual(value!.y + value!.height - 1);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
      const style = await editor.evaluate((node) => {
        const computed = getComputedStyle(node);
        return { left: computed.borderLeftWidth, top: computed.borderTopWidth, background: computed.backgroundColor };
      });
      expect(style).toEqual({ left: "2px", top: "0px", background: "rgba(0, 0, 0, 0)" });
    }
  });

  test("a fact's label sits above its value on a phone and beside it with room", async ({ page }) => {
    for (const [width, beside] of [[390, false], [1024, true]] as const) {
      await render(page, reminderDetailBody(), width);
      const fact = page.locator(".reminder-fact").first();
      const [label, value] = await Promise.all([fact.locator("dt").boundingBox(), fact.locator(".reminder-fact-value").boundingBox()]);
      expect(value!.x >= label!.x + label!.width - 1, `label beside value at ${width}`).toBe(beside);
    }
  });

  test("what ends something comes last, in the risk tone, below the facts and the history", async ({ page }) => {
    await render(page, reminderDetailBody(), 390);
    const facts = (await page.locator(".reminder-facts").boundingBox())!;
    const history = (await page.locator(".reminder-history-link").boundingBox())!;
    const risky = await page.locator(".reminder-risk-verb").evaluateAll((nodes) =>
      nodes.map((node) => ({ top: node.getBoundingClientRect().top, color: getComputedStyle(node).color })));
    const riskTone = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--tone-risk-fg)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(risky).toHaveLength(2);
    for (const verb of risky) {
      expect(verb.top).toBeGreaterThan(facts.y + facts.height);
      expect(verb.top).toBeGreaterThan(history.y);
      expect(verb.color).toBe(riskTone);
    }
  });

  test("reads in the dark theme through the same tokens", async ({ page }) => {
    await render(page, reminderDetailBody({ open: "cancel" }), 390, "dark");
    const colors = await page.evaluate(() => ({
      page: getComputedStyle(document.body).backgroundColor,
      title: getComputedStyle(document.querySelector(".reminder-detail-title")!).color,
    }));
    expect(colors.page).not.toBe(colors.title);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await shortTargets(page)).toEqual([]);
  });

  test("the fixture still mirrors the markup the page emits", () => {
    const detail = source("features", "reminders", "reminder-detail.tsx");
    for (const name of ["reminder-detail", "reminder-detail-head", "reminder-detail-back", "reminder-detail-title", "reminder-detail-state", "reminder-state",
      "reminder-important", "reminder-detail-note", "reminder-detail-verbs", "reminder-fact-verb", "reminder-fact-editor", "reminder-panel",
      "reminder-detail-section", "reminder-group-heading", "reminder-facts", "reminder-fact", "reminder-fact-value", "reminder-fact-link", "reminder-snooze",
      "reminder-inline-label", "reminder-select", "reminder-detail-foot", "reminder-history-link", "reminder-risk-verb", "reminder-panel-actions"]) {
      expect(detail, `the page lost ${name}`).toContain(name);
    }
    const series = source("features", "reminders", "series-controls.tsx");
    for (const name of ["reminder-series", "data-part", "reminder-series-facts", "reminder-series-badge", "reminder-series-rule", "reminder-series-hint",
      "reminder-scope", "reminder-fact-verb", "reminder-risk-verb"]) {
      expect(series, `the rule's controls lost ${name}`).toContain(name);
    }
    // The facts come before what ends something.
    expect(detail.indexOf('className="reminder-facts"')).toBeLessThan(detail.indexOf('className="reminder-detail-foot"'));
    expect(source("app", "[locale]", "app", "reminders", "[reminderId]", "page.tsx")).toContain("<ReminderDetail");
  });
});

/*
 * The guided path on Hoje. Mirrors `onboarding-panel.tsx`, mounted by
 * `home-view.tsx` after the composer and the destinations.
 */
function onboardingStep(options: { key: string; title: string; state: "satisfied" | "unsatisfied" | "blocked" | "unreadable"; next?: boolean; body?: string; action?: string }) {
  const words = { satisfied: "Feito", unsatisfied: "Pendente", blocked: "Precisa da chave de IA", unreadable: "Não foi possível verificar" }[options.state];
  const caption = options.state === "blocked" || options.state === "unreadable";
  const offers = options.state === "unsatisfied" || options.state === "unreadable";
  return `<li class="onboarding-step" data-step="${options.key}" data-state="${options.state}"${options.next ? ' aria-current="step"' : ""}>`
    + `<span aria-hidden="true" class="onboarding-step-mark">${options.state === "satisfied" ? '<svg width="14" height="14" viewBox="0 0 24 24"></svg>' : ""}</span>`
    + `<div class="onboarding-step-main"><h3 class="onboarding-step-title">${offers && !options.next ? `<a class="onboarding-step-link" href="#">${options.title}</a>` : options.title}</h3>`
    + (options.next ? `<p class="onboarding-step-body">${options.body}</p>` : "")
    + `<span class="onboarding-step-state${caption ? "" : " sr-only"}" data-state="${options.state}">${words}</span></div>`
    + (offers && options.next ? `<a class="onboarding-step-action" href="#">${options.action}</a>` : "")
    + `</li>`;
}

function onboardingBody(options: { recovery?: boolean } = {}) {
  const steps = [
    onboardingStep({ key: "locale_and_timezone", title: "Idioma e fuso horário", state: "satisfied" }),
    onboardingStep({ key: "assistant_identity", title: "Nome e jeito do assistente", state: "unsatisfied", next: true,
      body: `Escolha como o assistente se chama e o tom que ele usa ${UNBREAKABLE}. Você pode mudar quando quiser.`, action: "Dar um nome" }),
    onboardingStep({ key: "ai_credential", title: "Sua chave de IA", state: options.recovery ? "unsatisfied" : "satisfied" }),
    onboardingStep({ key: "entry_captured", title: "A primeira captura", state: "unreadable" }),
    onboardingStep({ key: "interpretation_reviewed", title: "Revisar a primeira leitura do Brain", state: options.recovery ? "blocked" : "unsatisfied" }),
    onboardingStep({ key: "task_confirmed", title: "A primeira tarefa", state: "unsatisfied" }),
    onboardingStep({ key: "memory_created", title: "A primeira memória", state: "unsatisfied" }),
  ];
  return `<div class="dashboard home-dashboard today-page"><header class="hero today-hero"><p class="eyebrow">QUARTA-FEIRA, 18 DE NOVEMBRO</p><h1>Boa tarde.</h1></header>`
    + `<section class="onboarding" aria-labelledby="onboarding-title" data-onboarding="offered">`
    + `<header class="onboarding-head"><h2 id="onboarding-title">Um caminho até o primeiro resultado</h2><p class="onboarding-progress" data-done="2" data-total="7">2 de 7 passos</p></header>`
    + `<p class="onboarding-notice" data-notice="unreadable">Não foi possível verificar todos os passos agora. O que aparece como não verificado pode já estar feito.</p>`
    + (options.recovery
      ? `<div class="onboarding-recovery" data-recovery="credential"><div class="onboarding-recovery-text"><h3>Configure a chave para seguir</h3><p>Sem uma chave de IA ativa, o Brain não organiza nada. O que você capturar fica guardado e aguardando — nada se perde.</p></div>`
        + `<a class="onboarding-recovery-action" href="#">Ir para a configuração</a></div>`
      : "")
    + `<ol class="onboarding-steps">${steps.join("")}</ol>`
    + `<form class="onboarding-dismiss"><input type="hidden" name="locale" value="pt-BR" /><button type="submit" class="onboarding-dismiss-action">Dispensar este guia</button>`
    + `<p class="onboarding-dismiss-hint">Você pode trazê-lo de volta em Ajustes.</p></form></section>`
    + `<div class="today-columns"><div class="today-main"><section class="home-section" aria-label="Precisa de você"><header><div class="home-section-title"><h2>Precisa de você</h2></div></header></section></div></div></div>`;
}

test.describe("The guided path on Hoje as one section of rows (Editorial calmo)", () => {
  for (const width of WIDTHS) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px, with and without the recovery`, async ({ page }) => {
      for (const recovery of [false, true]) {
        await render(page, onboardingBody({ recovery }), width);
        expect(await overflow(page), `sideways overflow, recovery=${recovery}`).toBeLessThanOrEqual(0);
        expect(await shortTargets(page), `short targets, recovery=${recovery}`).toEqual([]);
      }
    });
  }

  test("the section has no box of its own and none inside it: a heading over a hairline, rows between hairlines", async ({ page }) => {
    await render(page, onboardingBody({ recovery: true }), 390);
    // The mark is a 12px ring or dot, the one shape the section draws; nothing else is a box.
    expect(await boxes(page, ".onboarding", "*:not(.onboarding-step-mark)")).toEqual([]);
    const section = await page.locator(".onboarding").evaluate((node) => {
      const style = getComputedStyle(node);
      return { border: style.borderTopWidth, background: style.backgroundColor, padding: style.paddingLeft };
    });
    expect(section).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)", padding: "0px" });
    expect(await page.locator(".onboarding-head").evaluate((node) => getComputedStyle(node).borderBottomWidth)).toBe("1px");
    expect(await page.locator(".onboarding-step").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).borderBottomWidth)))
      .toEqual(Array(7).fill("1px"));
  });

  test("its heading is drawn like its neighbour's on Hoje", async ({ page }) => {
    await render(page, onboardingBody(), 390);
    const fonts = await page.evaluate(() => {
      const font = (selector: string) => {
        const style = getComputedStyle(document.querySelector(selector)!);
        return `${style.fontSize}/${style.fontWeight}/${style.fontFamily}`;
      };
      return { path: font(".onboarding-head > h2"), neighbour: font(".home-section h2") };
    });
    expect(fonts.path).toBe(fonts.neighbour);
  });

  test("the progress is words on the heading's line; every step is a row; only the next has a sentence and a verb", async ({ page }) => {
    await render(page, onboardingBody(), 390);
    const [heading, progress] = await Promise.all([
      page.locator(".onboarding-head > h2").boundingBox(),
      page.locator(".onboarding-progress").boundingBox(),
    ]);
    expect(Math.abs((heading!.y + heading!.height) - (progress!.y + progress!.height))).toBeLessThanOrEqual(6);
    await expect(page.locator(".onboarding-progress")).toHaveText("2 de 7 passos");
    await expect(page.locator(".onboarding-step")).toHaveCount(7);
    await expect(page.locator(".onboarding details")).toHaveCount(0);
    await expect(page.locator(".onboarding-step-body")).toHaveCount(1);
    await expect(page.locator(".onboarding-step-action")).toHaveCount(1);
    await expect(page.locator('.onboarding-step[aria-current="step"] .onboarding-step-action')).toHaveText("Dar um nome");
    const lefts = await page.locator(".onboarding-step-title").evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
    expect(new Set(lefts).size, "the titles share one edge").toBe(1);
  });

  test("the next step is the one in ink; a done step is quieter and carries a check", async ({ page }) => {
    await render(page, onboardingBody(), 390);
    const weight = (selector: string) => page.locator(selector).first().evaluate((node) => Number(getComputedStyle(node).fontWeight));
    expect(await weight('.onboarding-step[aria-current="step"] .onboarding-step-title'))
      .toBeGreaterThan(await weight('.onboarding-step[data-state="satisfied"] .onboarding-step-title'));
    await expect(page.locator('.onboarding-step[data-state="satisfied"] .onboarding-step-mark svg')).toHaveCount(2);
    // No `opacity` de-emphasis (slice 2O.7): it took the text below 4.5:1 once.
    expect(await page.locator(".onboarding-step").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).opacity)))
      .toEqual(Array(7).fill("1"));
  });

  test("a later step's row is its link", async ({ page }) => {
    await render(page, onboardingBody(), 390);
    const row = page.locator('.onboarding-step[data-step="memory_created"]');
    const box = (await row.boundingBox())!;
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.className ?? "",
      { x: box.x + box.width - 8, y: box.y + box.height / 2 });
    expect(hit).toBe("onboarding-step-link");
  });

  test("the fixture still mirrors the markup the panel emits", () => {
    const panel = source("features", "onboarding", "onboarding-panel.tsx");
    for (const name of ["onboarding-head", "onboarding-progress", "onboarding-notice", "onboarding-recovery", "onboarding-recovery-text",
      "onboarding-recovery-action", "onboarding-steps", "onboarding-step", "onboarding-step-mark", "onboarding-step-main", "onboarding-step-title",
      "onboarding-step-link", "onboarding-step-body", "onboarding-step-state", "onboarding-step-action", "onboarding-dismiss", "onboarding-dismiss-action",
      "onboarding-dismiss-hint"]) {
      expect(panel, `the panel lost ${name}`).toContain(name);
    }
    expect(panel).not.toContain("<details");
    expect(panel).not.toContain('variant="primary"');
  });
});

/*
 * A command's result in the Conversar thread. Mirrors `TaskCommandResult`
 * (`command-console.tsx`), which `chat-composer.tsx` portals into
 * `.chat-outcome` (`chat-stream-context.tsx`) — outside `.assistant-composer`.
 */
function commandOutcome() {
  const delta = (label: string, before: string, after: string, changed: boolean) =>
    `<div class="task-command-delta" data-changed="${changed}"><dt>${label}</dt><dd><span class="task-command-delta-before">${before}</span> → <span class="task-command-delta-after">${after}</span></dd></div>`;
  return `<section class="chat-page"><div class="chat-outcome" data-chat-outcome="">`
    + `<div aria-label="Resposta do Brain" class="assistant-composer-notice" data-route="task_command" role="region" tabindex="-1">`
    + `<p class="assistant-composer-echo"><span>Você escreveu</span><q>concluir o relatório ${UNBREAKABLE}</q></p></div>`
    + `<div aria-label="Resultado do comando" class="task-command-result" role="region" tabindex="-1"><h3>Concluir esta tarefa?</h3><p>Isto é o que aconteceria.</p>`
    + `<div class="task-command-preview"><p class="task-command-notice">Nada foi aplicado ainda. Isto é só uma prévia.</p>`
    + `<p class="task-command-task-title">Enviar o relatório ${UNBREAKABLE}</p>`
    + `<dl class="task-command-deltas" aria-label="O que muda">${delta("Estado", "A fazer", "Concluída", true)}${delta("Prazo", "20 de nov. de 2026", "20 de nov. de 2026", false)}</dl>`
    + `<ul class="task-command-effects"><li>Os lembretes agendados desta tarefa serão cancelados.</li></ul>`
    + `<p class="task-command-reversibility">Pode ser desfeito.</p><p class="task-command-window">Você pode desfazer por 24 horas.</p></div>`
    + `<form><button class="task-command-primary" name="intent" type="submit" value="apply">Aplicar</button></form>`
    + `<form class="task-command-edit"><label for="task-command-edit-value">Corrigir antes de confirmar</label><input id="task-command-edit-value" name="value" type="text" />`
    + `<button class="task-command-secondary" name="intent" type="submit" value="edit">Corrigir</button></form>`
    + `<form class="task-command-discard"><button class="task-command-secondary" name="intent" type="submit" value="discard">Descartar</button></form>`
    + `</div></div></section>`;
}

test.describe("A command's result in the thread (Editorial calmo)", () => {
  for (const width of WIDTHS) {
    test(`no sideways scroll and no target under 44px at ${width} CSS px`, async ({ page }) => {
      // "Aplicar" was 23px here: `.assistant-composer button` sizes the
      // console's buttons, and the portal takes this result out of the composer.
      await render(page, commandOutcome(), width);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await shortTargets(page)).toEqual([]);
    });
  }

  test("it is the agent's turn, not a card: no fill, no radius, the preview set off by one rule", async ({ page }) => {
    await render(page, commandOutcome(), 390);
    const preview = await page.locator(".task-command-preview").evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, radius: style.borderTopLeftRadius, top: style.borderTopWidth, start: style.borderLeftWidth };
    });
    expect(preview).toEqual({ background: "rgba(0, 0, 0, 0)", radius: "0px", top: "0px", start: "2px" });
    expect(await page.locator(".task-command-result").evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("0px");
    // The question is in the reading face, as the agent's other turns are.
    const faces = await page.evaluate(() => ({
      heading: getComputedStyle(document.querySelector(".task-command-result > h3")!).fontFamily,
      echo: getComputedStyle(document.querySelector(".assistant-composer-echo > q")!).fontFamily,
    }));
    expect(faces.heading).toBe(faces.echo);
  });

  test("one filled verb; the way out is words beside it", async ({ page }) => {
    await render(page, commandOutcome(), 390);
    const [apply, discard] = await Promise.all([
      page.locator(".task-command-primary").boundingBox(),
      page.locator(".task-command-discard button").boundingBox(),
    ]);
    const discardStyle = await page.locator(".task-command-discard button").evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderTopWidth };
    });
    expect(discardStyle).toEqual({ background: "rgba(0, 0, 0, 0)", border: "0px" });
    expect(discard!.width, "the way out is not a full-width bar").toBeLessThan(200);
    expect(apply!.height).toBeGreaterThanOrEqual(44);
  });

  test("the fixture still mirrors the markup the result emits, and where it is mounted", () => {
    const view = source("features", "task-commands", "command-console.tsx");
    for (const name of ["task-command-result", "task-command-preview", "task-command-notice", "task-command-task-title", "task-command-deltas",
      "task-command-delta", "task-command-delta-before", "task-command-delta-after", "task-command-effects", "task-command-reversibility",
      "task-command-window", "task-command-primary", "task-command-secondary", "task-command-edit", "task-command-discard"]) {
      expect(view, `the result lost ${name}`).toContain(name);
    }
    expect(source("features", "chat", "chat-stream-context.tsx")).toContain('className="chat-outcome"');
    expect(source("features", "capture", "chat-composer.tsx")).toContain("createPortal(outcome, outcomeTarget)");
  });
});

test.describe("axe is clean on every surface, in both themes (Editorial calmo)", () => {
  const SURFACES: ReadonlyArray<readonly [string, () => string]> = [
    ["the reminders list", () => remindersBody()],
    ["the empty reminders list", () => remindersBody({ empty: true })],
    ["a reminder's page at rest", () => reminderDetailBody()],
    ["a reminder's page, rescheduling", () => reminderDetailBody({ open: "reschedule" })],
    ["a reminder's page, changing the rule", () => reminderDetailBody({ open: "series" })],
    ["a reminder's page, cancelling", () => reminderDetailBody({ open: "cancel" })],
    ["the guided path", () => onboardingBody({ recovery: true })],
    ["a command's result in the thread", () => commandOutcome()],
  ];
  for (const theme of [undefined, "dark"] as const) {
    for (const [name, body] of SURFACES) {
      test(`${name}, ${theme ?? "light"}`, async ({ page }) => {
        await render(page, body(), 390, theme);
        expect(await axeViolations(page)).toEqual([]);
      });
    }
  }
});
