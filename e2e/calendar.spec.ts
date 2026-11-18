/**
 * `2M-MOBILE-005` / `2M-ACCESS-001…006` — the calendar in a real browser.
 *
 * ## What this lane is, and the precedent it follows
 *
 * The app's routes are behind `src/proxy.ts` and need a Supabase session, which
 * CI does not have. `layout-contracts.spec.ts` settled this repository's answer
 * and `accessibility.spec.ts` adopted it: compose the page from the **real
 * stylesheets** and the **exact DOM the components emit**, and make every
 * builder cite the source it mirrors. This file follows that precedent rather
 * than inventing a third one.
 *
 * It inherits the one real cost — **the markup is a mirror and can drift** —
 * and pays it the same way: `calendar-mirror-guard.test.ts` re-derives every
 * load-bearing class and attribute from the component sources on each run, so a
 * component that renames `.calendar-reschedule` or drops `data-commitment`
 * breaks the guard instead of silently invalidating this file.
 *
 * ## What is PROVEN here, and what is NOT — never round this up
 *
 *   - PROVEN: rendered structure at two viewports and in both locales, computed
 *     touch-target sizes, visible focus, keyboard operation of the disclosure,
 *     reflow at 320 CSS px and at an emulated 200% zoom, the absence of
 *     horizontal page scroll, and that a masked item still carries its date
 *     controls while withholding its title.
 *   - NOT PROVEN: anything requiring the database or React state — an applied
 *     reschedule, a refusal, a staleness outcome, an undo, or the return to a
 *     calendar position. Those need an authenticated app and live in
 *     `online-calendar.spec.ts`, which runs against the deployment.
 *   - NOT PROVEN ANYWHERE: a real screen reader, and a real phone.
 *     `2M-ACCESS-007` and the OD-2M-5 hardware checkpoint are owner-run, and a
 *     green run here must never be cited as discharging either.
 *     **An emulated viewport is a viewport, not a device.**
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ROOT = join(__dirname, "..");

/** Every stylesheet the calendar's markup depends on, read from source. */
// `tokens.css` and `experience.css` first: since ADR-114 they carry the palette
// every rule below resolves against, so a fixture without them is unstyled.
const STYLESHEETS = ["tokens.css", "experience.css", "ui.css", "globals.css", "operations.css", "task-commands.css", "calendar.css"] as const;

const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");

/*
 * The three `next/font` variables, stubbed.
 *
 * `tokens.css` declares `--font-reading: var(--font-newsreader), Georgia,
 * serif`, and a `var()` with no declaration and no fallback makes the custom
 * property containing it invalid — which poisons every `--type-*` token that
 * reads it, which voids every `font: var(--type-*)` declaration including the
 * one on `body`. Without this the whole fixture renders at the UA default and
 * every geometric assertion below measures text that is not the product's.
 */
const FONT_STUB = ":root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}";

type Locale = "pt-BR" | "en";

/**
 * The copy, **byte-identical to `src/features/calendar/copy.ts`**.
 *
 * Restated rather than imported because this file runs under Playwright's own
 * transpiler and the alias resolution a `@/features/...` import needs is not
 * part of that lane. The cost of restating is drift, and it is paid the same way
 * the markup's is: `calendar-mirror-guard.test.ts` extracts these exact strings
 * from `copy.ts` on every run and fails when they stop matching.
 */
const COPY = {
  "pt-BR": {
    title: "Agenda",
    reschedule: "Datas",
    unavailable: "Este item não tem datas que possam ser alteradas aqui.",
    empty: "Nada marcado para este período.",
    atLatest: "Este é o fim do período que o calendário cobre.",
  },
  en: {
    title: "Agenda",
    reschedule: "Dates",
    unavailable: "This item has no dates that can be changed here.",
    empty: "Nothing scheduled for this period.",
    atLatest: "This is the end of the period the calendar covers.",
  },
} as const;

/**
 * One item, mirroring `src/features/calendar/calendar-item.tsx`.
 *
 * `masked` mirrors what `ProtectedContent` emits for a `highly_sensitive`
 * derivation: the title is **absent from the DOM**, replaced by a reveal
 * control. That is the property `2M-PRIVACY-001` is about — not a `display:none`
 * a reader could defeat with devtools.
 */
function itemMarkup(options: {
  readonly lane: string;
  readonly commitment: string;
  readonly title: string | null;
  readonly masked?: boolean;
  readonly reschedulable?: boolean;
  readonly elapsed?: boolean;
  /** Slice 2R.3: the rule in words, for a recurring occurrence. */
  readonly repeats?: string;
  readonly locale: Locale;
}): string {
  const copy = COPY[options.locale];
  const body = options.title === null
    ? '<span>Um lembrete</span>'
    : options.masked
      ? '<span class="protected-content"><button type="button" class="row-action">Mostrar</button></span>'
      : `<a class="calendar-item-link" href="/${options.locale}/app/work/t1?from=eyJ2IjoiMjAyNi0wOC0xMS4xIn0">${options.title}</a>`;

  const controls = options.reschedulable === false
    ? `<p class="calendar-reschedule-unavailable">${copy.unavailable}</p>`
    : `<details class="calendar-reschedule">
         <summary class="calendar-reschedule-summary">${copy.reschedule}</summary>
         <p class="quiet-state calendar-reschedule-hint">Altere o prazo.</p>
         <div class="task-detail-controls task-detail-controls-inline">
           <ul class="task-control-list">
             <li class="task-control">
               <form>
                 <label for="task-control-reschedule_due">Prazo</label>
                 <input id="task-control-reschedule_due" name="value" type="date" min="2024-08-11" max="2028-08-11" />
                 <button class="row-action" type="submit">Aplicar</button>
                 <span class="task-control-name">Reagendar prazo</span>
               </form>
             </li>
             <li class="task-control">
               <form>
                 <button class="row-action" type="submit">Remover prazo</button>
               </form>
             </li>
           </ul>
         </div>
       </details>`;

  // ADR-180 — the row: when · what · one caption · one verb.
  return `<li class="calendar-item" data-lane="${options.lane}" data-commitment="${options.commitment}" data-elapsed="${options.elapsed ? "true" : "false"}">
    <time class="calendar-item-time" datetime="2026-08-15T18:00:00.000Z">15:00</time>
    <span class="calendar-item-main">
      <span class="calendar-item-body">${body}</span>
      <span class="calendar-item-meta">
        <span class="calendar-item-lane">${options.lane}<span class="sr-only calendar-item-commitment">, ${options.commitment}</span></span>
        ${options.elapsed ? '<span class="calendar-item-elapsed">Já passou</span>' : ""}
        ${options.repeats ? `<span class="calendar-item-repeats">${options.repeats}</span>` : ""}
      </span>
    </span>
    ${controls}
  </li>`;
}

/**
 * Life Brain D.1 — the date picker's panel, mirroring `agenda-date-picker.tsx`:
 * August 2026 opens on a Saturday, so five blank cells lead.
 */
function datePanel(): string {
  const cells: string[] = [...Array(5)].map(() => "<td></td>");
  for (let day = 1; day <= 31; day += 1) {
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    cells.push(`<td${day === 15 ? ' data-today="true"' : ""}><a ${day === 15 ? 'aria-current="date" ' : ""}aria-label="${day} de agosto de 2026" class="agenda-date-day" href="?date=${date}">${day}</a></td>`);
  }
  while (cells.length % 7 !== 0) cells.push("<td></td>");
  const rows = [...Array(cells.length / 7)].map((_unused, index) => `<tr>${cells.slice(index * 7, index * 7 + 7).join("")}</tr>`).join("");
  return `<div aria-label="Escolher uma data" class="agenda-date-panel" role="group">
    <div class="agenda-date-panel-head">
      <button aria-label="Mês anterior" class="ui-button ui-button--ghost ui-button--sm ui-icon-button" type="button"><span aria-hidden="true" class="ui-button__icon">‹</span></button>
      <span aria-hidden="true" class="agenda-date-month">agosto de 2026</span>
      <button aria-label="Próximo mês" class="ui-button ui-button--ghost ui-button--sm ui-icon-button" type="button"><span aria-hidden="true" class="ui-button__icon">›</span></button>
    </div>
    <table class="agenda-date-grid"><caption class="sr-only">agosto de 2026</caption>
      <thead><tr>${["S", "T", "Q", "Q", "S", "S", "D"].map((d) => `<th aria-hidden="true" scope="col">${d}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * The Agenda's masthead and control line, mirroring `AgendaHeader` +
 * `AgendaStepper` and `calendar-view.tsx`'s toolbar (ADR-180): the
 * destination's name as a small line beside the three lenses; the period as the
 * page's subject, first in the stepper, with its caption and the arrows; then
 * the orientation `SegmentedControl` and the lanes behind one ghost button.
 */
function agendaHead(
  copy: { readonly title: string },
  range: string,
  orientation: "day" | "week" | "month" | "agenda",
  lanes: string = "",
  narrowed = false,
  status: { readonly count?: number; readonly today?: boolean; readonly away?: boolean } = {},
): string {
  const option = (value: string, label: string) =>
    `<a class="ui-segmented__option" href="?orientation=${value}"${value === orientation ? ' aria-current="page"' : ""}>${label}</a>`;
  return `
    <header class="agenda-masthead">
      <div class="agenda-masthead-top">
        <h1 class="agenda-masthead-title"><span id="cal">${copy.title}</span></h1>
        <nav aria-label="Lentes da agenda" class="ui-segmented agenda-lenses">
          <a aria-current="page" class="ui-segmented__option" href="/pt-BR/app/calendar">Calendário</a>
          <a class="ui-segmented__option" href="/pt-BR/app/calendar/plan">Planejar</a>
          <a class="ui-segmented__option" href="/pt-BR/app/reminders">Lembretes</a>
        </nav>
      </div>
      <nav aria-label="Navegar pelas datas" class="agenda-stepper calendar-navigation">
        <details class="agenda-date-picker calendar-range">
          <summary aria-label="${range}. Escolher uma data" class="agenda-stepper-range agenda-date-trigger"><span>${range}</span></summary>
          ${datePanel()}
        </details>
        <span aria-live="polite" class="sr-only">${range}</span>
        <div class="agenda-stepper-caption"><div class="calendar-status">
          ${status.today ? '<span class="calendar-today">Hoje</span>' : ""}
          <p aria-live="polite" class="calendar-summary">${status.count ?? 0} itens neste período</p>
        </div></div>
        <a aria-label="Período anterior" class="ui-button ui-button--ghost ui-button--sm ui-icon-button" href="?date=prev" rel="prev"><span aria-hidden="true" class="ui-button__icon">‹</span></a>
        <a aria-label="Próximo período" class="ui-button ui-button--ghost ui-button--sm ui-icon-button" href="?date=next" rel="next"><span aria-hidden="true" class="ui-button__icon">›</span></a>
        ${status.away ? '<a class="ui-button ui-button--ghost ui-button--sm agenda-stepper-today" href="?date=today"><span class="ui-button__label">Hoje</span></a>' : ""}
      </nav>
    </header>
    <div class="calendar-toolbar">
      <nav aria-label="Formato" class="ui-segmented ui-segmented--sm calendar-orientation">
        ${option("day", "Dia")}${option("week", "Semana")}${option("month", "Mês")}${option("agenda", "Lista")}
      </nav>
      <details class="calendar-filters"${narrowed ? " open" : ""}>
        <summary class="ui-button ui-button--ghost ui-button--sm"><span class="ui-button__label">O que mostrar</span></summary>
        <nav aria-label="O que mostrar" class="calendar-lanes"><ul>${lanes}</ul></nav>
      </details>
    </div>`;
}

/**
 * One day of the stream, mirroring `dayStream` in `calendar-view.tsx`: a
 * heading over its rows, or — with nothing on it — one muted line.
 */
function dayMarkup(options: { label: string; today?: boolean; items: string[]; heading?: "h2" | "h3"; quiet?: boolean }): string {
  const tag = options.heading ?? "h2";
  const empty = options.items.length === 0;
  return `<li class="calendar-day"${empty ? ' data-empty="true"' : ""}${options.today ? ' data-today="true"' : ""}>
    <${tag} class="calendar-day-heading${options.quiet ? " sr-only" : ""}"><span class="calendar-day-name">${options.label}</span>${options.today ? '<span class="calendar-today">Hoje</span>' : ""}</${tag}>
    ${empty
      ? '<p class="ux-state-line calendar-empty" data-ux-state="empty"><span class="ux-state-line-text">Nada marcado</span></p>'
      : `<ul class="calendar-day-items">${options.items.join("")}</ul>`}
  </li>`;
}

/**
 * The day orientation, mirroring `calendar-view.tsx`: the day is the page's
 * subject, so its own heading is kept for structure and not drawn again; a day
 * with nothing on it is the period's one empty line.
 */
function page(locale: Locale, items: string[]): string {
  const copy = COPY[locale];
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main>
  <div class="content-page calendar-page">
  <section aria-labelledby="cal" class="calendar" data-orientation="day">
    ${agendaHead(copy, "sáb., 15 de agosto", "day", "", false, { count: items.length, today: true })}
    ${items.length === 0
      ? `<p class="calendar-empty">${copy.empty}</p>`
      : `<ol class="calendar-days">${dayMarkup({ label: "sábado, 15 de agosto", today: true, items, quiet: true })}</ol>`}
  </section></div></main></body></html>`;
}

async function open(target: Page, locale: Locale, items: string[]): Promise<void> {
  await target.setContent(page(locale, items), { waitUntil: "load" });
}

/**
 * The **week** orientation, mirroring `calendar-view.tsx`'s `<table>` and the
 * scroll wrapper around it.
 *
 * This lane had never rendered the week at all — only the day's `<ol>` — so the
 * grid's geometry, its lane chips and its control band were measured by nothing.
 * The recomposition needed a place to be wrong, and this is it.
 *
 * `busyIndex` puts every item in one column, which is the case that exposed the
 * old layout: with `display:block` on the `<table>`, `table-layout: fixed` never
 * applied and that one column took the width of six.
 */
function weekPage(locale: Locale, items: string[], busyIndex = 2): string {
  const copy = COPY[locale];
  const days = ["seg., 10 ago.", "ter., 11 ago.", "qua., 12 ago.", "qui., 13 ago.", "sex., 14 ago.", "sáb., 15 ago.", "dom., 16 ago."];
  const lane = (name: string, shown: boolean) =>
    `<li><a data-lane="deadline" data-shown="${shown}" href="?lanes=x">${name}<span class="sr-only">${shown ? "mostrando" : "oculto"}</span></a></li>`;
  /*
    ADR-180 — the phone's week: the seven days on one line, then the days as
    the stream. In the stream the busy day holds a full row (the list is where
    a row keeps its caption and its dates) and the others are one muted line.
  */
  const fullDays = ["segunda-feira, 10 de agosto", "terça-feira, 11 de agosto", "quarta-feira, 12 de agosto", "quinta-feira, 13 de agosto", "sexta-feira, 14 de agosto", "sábado, 15 de agosto", "domingo, 16 de agosto"];
  const strip = days.map((day, index) => {
    const busy = index === busyIndex && items.length > 0;
    return `<li${index === 5 ? ' data-today="true"' : ""}><a${index === 5 ? ' aria-current="date"' : ""} aria-label="${fullDays[index]}, ${busy ? `${items.length} itens` : "nada marcado"}" class="calendar-week-strip-day" data-has-items="${busy}" href="?date=2026-08-${10 + index}"><span class="calendar-week-strip-weekday">${day.split(",")[0]}</span><span class="calendar-week-strip-number">${10 + index}</span></a></li>`;
  }).join("");
  const stream = items.length === 0 ? "" : `<ol class="calendar-days">${fullDays.map((label, index) =>
    dayMarkup({ label, today: index === 5, items: index === busyIndex ? items.map(() => task(locale)) : [] })).join("")}</ol>`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main>
  <div class="content-page calendar-page">
  <section aria-labelledby="cal" class="calendar" data-orientation="week">
    ${agendaHead(copy, "10 – 16 de agosto", "week", `${lane("Prazos", true)}${lane("Intenções", false)}`, true, { count: items.length })}
    <p class="calendar-bound" role="status">${copy.atLatest}</p>
    ${items.length === 0 ? `<p class="calendar-empty">${copy.empty}</p>` : ""}
    <div class="calendar-week-scroll"><table class="calendar-week">
      <caption class="sr-only">seg., 10 ago. – dom., 16 ago.</caption>
      <thead><tr>${days.map((day, index) =>
        `<th scope="col"${index === 5 ? ' data-today="true"' : ""}><a aria-label="${day}" class="calendar-week-head" href="?date=2026-08-${10 + index}"><span class="calendar-week-weekday">${day.split(",")[0]}</span><span class="calendar-week-day">${10 + index}</span></a>${index === 5 ? '<span class="calendar-today">hoje</span>' : ""}</th>`).join("")}</tr></thead>
      <tbody><tr>${days.map((_day, index) =>
        `<td${index === 5 ? ' data-today="true"' : ""}>${index === busyIndex && items.length
          ? `<ul class="calendar-day-items">${items.join("")}</ul>`
          : ""}</td>`).join("")}</tr></tbody>
    </table></div>
    <div class="calendar-week-list">
      <ol aria-label="Dias desta semana" class="calendar-week-strip">${strip}</ol>
      ${stream}
    </div>
  </section></div></main></body></html>`;
}

async function openWeek(target: Page, locale: Locale, items: string[]): Promise<void> {
  await target.setContent(weekPage(locale, items), { waitUntil: "load" });
}

const task = (locale: Locale) => itemMarkup({
  lane: "Prazo", commitment: "Compromisso", title: "Entregar o relatório", locale,
});
const reminder = (locale: Locale) => itemMarkup({
  lane: "Lembrete", commitment: "Compromisso", title: null, locale, reschedulable: false,
});
/**
 * Life Brain D.1 — the week's compact line, mirroring `CalendarItem`'s
 * `density="compact"`: time, lane word, title; the commitment in `sr-only`.
 */
const compact = (title = "Entregar o relatório antes da reunião de quinta com a diretoria") =>
  `<li class="calendar-item" data-density="compact" data-lane="deadline" data-commitment="committed" data-elapsed="false">
    <span class="calendar-item-meta">
      <time class="calendar-item-time" datetime="2026-08-12T18:00:00.000Z">15:00</time>
      <span class="calendar-item-lane">Prazos</span>
      <span class="sr-only">Compromisso</span>
    </span>
    <span class="calendar-item-body"><a class="calendar-item-link" href="/pt-BR/app/work/t1">${title}</a></span>
  </li>`;
const masked = (locale: Locale) => itemMarkup({
  lane: "Prazo", commitment: "Compromisso", title: "Segredo", masked: true, locale,
});
/**
 * `2M-CAL-003`'s elapsed state, mirrored so the guard can see it.
 *
 * An item whose instant has passed is still reschedulable — that is the whole
 * point of showing it — so the lane asserts the marker and the controls
 * together rather than treating "elapsed" as a read-only state.
 */
const elapsed = (locale: Locale) => itemMarkup({
  lane: "Prazo", commitment: "Compromisso", title: "Atrasado", elapsed: true, locale,
});

for (const locale of ["pt-BR", "en"] as const) {
  test.describe(`calendar — ${locale}`, () => {
    test("an empty day says so, and is distinguishable from a day that failed", async ({ page: target }) => {
      // `2M-CAL-011`. The empty sentence is present and the partial-state
      // region is absent — two different facts that a single "nothing here"
      // would collapse.
      await open(target, locale, []);
      await expect(target.locator(".calendar-empty")).toHaveText(COPY[locale].empty);
      await expect(target.locator(".calendar-partial")).toHaveCount(0);
    });

    test("a day with tasks and reminders carries lane and commitment in text", async ({ page: target }) => {
      // `2M-ACCESS-005`: colour is never the only carrier. Asserted on text
      // content, which is what a colour-vision difference leaves intact.
      await open(target, locale, [task(locale), reminder(locale)]);
      const items = target.locator(".calendar-item");
      await expect(items).toHaveCount(2);
      for (const child of [".calendar-item-lane", ".calendar-item-commitment"]) {
        await expect(items.first().locator(child)).not.toHaveText("");
      }
      await expect(items.first()).toHaveAttribute("data-commitment", "Compromisso");
    });

    test("a reminder offers no task reschedule, and says why rather than showing nothing", async ({ page: target }) => {
      await open(target, locale, [reminder(locale)]);
      await expect(target.locator(".calendar-reschedule")).toHaveCount(0);
      await expect(target.locator(".calendar-reschedule-unavailable"))
        .toHaveText(COPY[locale].unavailable);
    });

    test("an elapsed item is marked in text and is still reschedulable", async ({ page: target }) => {
      // `2M-CAL-003`. The strike-through on the time is decoration; the words
      // are what a colour-vision difference and a screen reader both get.
      await open(target, locale, [elapsed(locale)]);
      await expect(target.locator(".calendar-item")).toHaveAttribute("data-elapsed", "true");
      await expect(target.locator(".calendar-item-elapsed")).toBeVisible();
      await expect(target.locator("details.calendar-reschedule")).toHaveCount(1);
    });

    test("a recurring occurrence says how it repeats, in text and with contrast", async ({ page: target }) => {
      /*
        `2R-SURFACE-003` and `2R-ACCESS-004`, slice 2R.3.

        Text rather than an icon, for the same reason the elapsed marker above
        is text: a mark whose meaning is only its shape is a mark half the
        readers do not get. Measured on the RENDERED page with the real
        stylesheet, because a fixture lane that inlines CSS by hand measures
        something the product does not do -- which is how Phase 2Q's signed
        premise turned out to be false.
      */
      await open(target, locale, [
        itemMarkup({
          lane: "reminder",
          commitment: "committed",
          title: "Tomar o remédio",
          repeats: locale === "pt-BR" ? "Todo dia" : "Every day",
          locale,
        }),
      ]);
      const badge = target.locator(".calendar-item-repeats");
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText(locale === "pt-BR" ? "Todo dia" : "Every day");
      /*
        ADR-180: it is words in the row's caption now, not a tinted chip — a
        section is hairlines and text. Still drawn by a rule rather than by the
        user-agent default (a class matching nothing renders, passes and looks
        finished in a diff): it is told it may break, because the rule can be a
        sentence, and it reads as the caption it is part of.
      */
      const drawn = await badge.evaluate((node) => {
        const style = getComputedStyle(node);
        const kind = getComputedStyle(node.parentElement!.querySelector(".calendar-item-lane")!);
        return { wrap: style.overflowWrap, size: style.fontSize, kindSize: kind.fontSize, border: style.borderTopWidth };
      });
      expect(drawn.wrap).toBe("anywhere");
      expect(drawn.size).toBe(drawn.kindSize);
      expect(drawn.border).toBe("0px");
      // And it is set apart from the kind before it by a point, not by a box.
      const point = await target.locator(".calendar-item-lane").evaluate((node) => getComputedStyle(node, "::after").content);
      expect(point).toContain("·");
    });

    test("a highly sensitive item withholds its title and keeps its date controls", async ({ page: target }) => {
      // `2M-PRIVACY-001` with `2M-CAL-009`: masking withholds the words, not the
      // ability to move the date. The title is absent from the DOM, not hidden.
      await open(target, locale, [masked(locale)]);
      await expect(target.locator("body")).not.toContainText("Segredo");
      await expect(target.locator(".calendar-reschedule")).toHaveCount(1);
    });

    test("the disclosure opens and closes by keyboard alone, with visible focus", async ({ page: target }) => {
      // `2M-ACCESS-001`/`-003`. `<details>` is what makes this free — and free
      // is the argument for it over a hand-built button with `aria-expanded`.
      await open(target, locale, [task(locale)]);
      const summary = target.locator(".calendar-reschedule-summary");
      const details = target.locator("details.calendar-reschedule");

      await expect(details).not.toHaveAttribute("open", /.*/);
      await summary.focus();
      await expect(summary).toBeFocused();

      const outline = await summary.evaluate((node) =>
        getComputedStyle(node, ":focus-visible").outlineWidth);
      expect(outline, "the summary has no visible focus ring").not.toBe("0px");

      await target.keyboard.press("Enter");
      await expect(details).toHaveAttribute("open", /.*/);
      await target.keyboard.press("Enter");
      await expect(details).not.toHaveAttribute("open", /.*/);
    });

    test("every control inside the disclosure is reachable by Tab, in order", async ({ page: target }) => {
      await open(target, locale, [task(locale)]);
      await target.locator(".calendar-reschedule-summary").focus();
      await target.keyboard.press("Enter");

      /*
       * Eight steps rather than three: the exact number of stops depends on how
       * many controls the disclosure renders, and a fixed count would encode
       * today's taxonomy into a browser journey. What is asserted is the
       * property — the date picker and a submit are both reached, in that order,
       * and focus never lands on the document body on the way.
       */
      const reached: string[] = [];
      for (let step = 0; step < 8; step += 1) {
        await target.keyboard.press("Tab");
        reached.push(await target.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active || active === document.body) return "body";
          return `${active.tagName.toLowerCase()}:${active.getAttribute("type") ?? ""}`;
        }));
      }
      const trail = reached.join(" -> ");
      expect(reached, trail).toContain("input:date");
      expect(reached.some((entry) => entry.startsWith("button")), trail).toBe(true);
      // The picker comes before the submit that sends it: a tab order that
      // reached Apply first would let a keyboard user send an empty value.
      expect(reached.indexOf("input:date"), trail)
        .toBeLessThan(reached.findIndex((entry) => entry.startsWith("button")));
      // `2M-ACCESS-003`'s "never lost to the document body", read at the one
      // place a disclosure could lose it.
      expect(reached[0], trail).not.toBe("body");
    });

    test("no gesture is required and no control is a bare div", async ({ page: target }) => {
      // `2M-MOBILE-003`, OD-2M-6 A, asserted on the rendered page rather than on
      // the source: a control implemented as an unlabelled div would pass the
      // source-level gesture ban and fail the requirement.
      await open(target, locale, [task(locale)]);
      const unlabelled = await target.locator('div[role="button"], span[role="button"]').count();
      expect(unlabelled).toBe(0);
      await expect(target.locator(".calendar-reschedule-summary")).toHaveText(COPY[locale].reschedule);
    });
  });
}

test.describe("mobile reflow and target size", () => {
  /*
   * `2M-MOBILE-001`/`-002`. Run at the two widths the requirement names plus the
   * WCAG reflow width, and at an emulated 200% zoom — which is 320 CSS px in a
   * 640 px viewport, the same arithmetic Phase 2L's lane uses.
   *
   * **An emulated viewport is not a phone.** No touch digitiser, no on-screen
   * keyboard, no real IME. This proves layout, and the acceptance record says
   * exactly that.
   */
  for (const width of [320, 375, 412]) {
    test(`no horizontal page scroll at ${width}px`, async ({ page: target }) => {
      await target.setViewportSize({ width, height: 800 });
      await open(target, "pt-BR", [task("pt-BR"), reminder("pt-BR"), masked("pt-BR")]);
      await target.locator(".calendar-reschedule-summary").first().click();

      const overflow = await target.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `the page scrolls horizontally at this width`).toBeLessThanOrEqual(1);
    });
  }

  test("every control meets the 24px minimum, measured from paint", async ({ page: target }) => {
    await target.setViewportSize({ width: 375, height: 800 });
    await open(target, "pt-BR", [task("pt-BR")]);
    await target.locator(".calendar-reschedule-summary").click();

    const controls = target.locator(".calendar .calendar-reschedule button, .calendar .calendar-reschedule summary, .calendar .calendar-reschedule input");
    const count = await controls.count();
    expect(count, "no control was measured").toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect(box, "a control has no box").not.toBeNull();
      expect(Math.round(box!.height), `control ${index} is ${box!.height}px tall`).toBeGreaterThanOrEqual(24);
    }
  });

  test("reflows at an emulated 200% zoom without clipping the controls", async ({ page: target }) => {
    await target.setViewportSize({ width: 640, height: 800 });
    await open(target, "en", [task("en")]);
    await target.evaluate(() => { document.documentElement.style.zoom = "200%"; });
    await target.locator(".calendar-reschedule-summary").click();

    const overflow = await target.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(target.locator('input[type="date"]')).toBeVisible();
  });
});

/**
 * Life Brain D.1 — the period label opens a month of days
 * (T2: "se eu clicar aqui … deveria aparecer um calendário para mim").
 */
test.describe("Life Brain D.1: the period label opens a date picker", () => {
  test("the label is a control, and its month stays inside the viewport with 40px days", async ({ page: target }) => {
    for (const width of [375, 1440]) {
      await target.setViewportSize({ width, height: 900 });
      await openWeek(target, "pt-BR", [compact()]);
      const trigger = target.locator(".agenda-date-trigger");
      const triggerBox = await trigger.boundingBox();
      expect(triggerBox!.height, `trigger at ${width}`).toBeGreaterThanOrEqual(44);
      await trigger.click();
      const panel = target.locator(".agenda-date-panel");
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      expect(box!.x, `panel left edge at ${width}`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `panel right edge at ${width}`).toBeLessThanOrEqual(width + 1);
      const days = await target.locator(".agenda-date-day").evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height));
      expect(Math.min(...days), `a day under 40px at ${width}`).toBeGreaterThanOrEqual(40);
      const overflow = await target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("the chosen day is marked by more than a colour", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [compact()]);
    await target.locator(".agenda-date-trigger").click();
    const current = target.locator('.agenda-date-day[aria-current="date"]');
    await expect(current).toHaveText("15");
    const style = await current.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { background: computed.backgroundColor, color: computed.color };
    });
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.background).not.toBe(style.color);
  });
});

/**
 * The week grid — the shape the calendar had never been rendered in by any lane.
 *
 * Every assertion here is geometric or computed-style, which is precisely why it
 * belongs in a browser: the defect it guards against is a table that stopped
 * being a table, and jsdom has no table layout algorithm to be wrong about.
 */
/**
 * Life Brain D.3 (ADR-167) — a trip from Tuesday to Thursday is one bar across
 * three columns, mirroring `calendar-view.tsx`'s `SpanLane` above the week's
 * cells.
 */
function weekWithBar(): string {
  const days = ["seg., 10 ago.", "ter., 11 ago.", "qua., 12 ago.", "qui., 13 ago.", "sex., 14 ago.", "sáb., 15 ago.", "dom., 16 ago."];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main>
  <div class="content-page calendar-page"><section class="calendar">
    <div class="calendar-week-scroll"><table class="calendar-week">
      <caption class="sr-only">semana</caption>
      <thead><tr>${days.map((day, index) => `<th scope="col"><a class="calendar-week-head" href="#"><span class="calendar-week-weekday">${day.split(",")[0]}</span><span class="calendar-week-day">${10 + index}</span></a></th>`).join("")}</tr></thead>
      <tbody>
        <tr class="calendar-span-row"><td class="calendar-span-gap" colspan="1"></td><td class="calendar-span-cell" colspan="3" data-continues-after="true"><ul class="calendar-day-items">${compact("Viagem a Recife")}</ul></td><td class="calendar-span-gap" colspan="3"></td></tr>
        <tr>${days.map(() => "<td></td>").join("")}</tr>
      </tbody>
    </table></div>
  </section></div></main></body></html>`;
}

test.describe("Life Brain D.3: a multi-day event is one bar", () => {
  // 768 and up: below it the week is the list of days, and the grid is not drawn.
  for (const width of [768, 1440]) {
    test(`spans three columns and stays one line tall at ${width}px`, async ({ page: target }) => {
      await target.setViewportSize({ width, height: 900 });
      await target.setContent(weekWithBar(), { waitUntil: "load" });
      const [bar, heads] = await Promise.all([
        target.locator(".calendar-span-cell").boundingBox(),
        target.locator(".calendar-week thead th").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect())),
      ]);
      expect(Math.abs(bar!.x - heads[1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs((bar!.x + bar!.width) - (heads[3].x + heads[3].width))).toBeLessThanOrEqual(1);
      // The bar's row is the line's height, not a day cell's 8–10rem.
      expect(bar!.height).toBeLessThan(120);
      const radius = await target.locator(".calendar-span-cell .calendar-item").evaluate((node) => getComputedStyle(node).borderTopRightRadius);
      expect(parseFloat(radius), "a bar that continues keeps a rounded end").toBe(0);
    });
  }
});

test.describe("the week is a grid, not seven columns sized by their contents", () => {
  test("seven equal columns, whichever day is busy", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [compact(), compact(), compact()]);

    const widths = await target.locator(".calendar-week thead th").evaluateAll((cells) =>
      cells.map((cell) => Math.round(cell.getBoundingClientRect().width)));
    expect(widths).toHaveLength(7);
    // The busy column is the third; with a content-sized table it was the widest
    // by a factor of two or more.
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  test("a header sits above the column it names", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [compact()]);

    const aligned = await target.evaluate(() => {
      const heads = [...document.querySelectorAll<HTMLElement>(".calendar-week thead th")];
      const cells = [...document.querySelectorAll<HTMLElement>(".calendar-week tbody td")];
      return heads.every((head, index) =>
        Math.abs(head.getBoundingClientRect().x - cells[index].getBoundingClientRect().x) <= 1);
    });
    expect(aligned).toBe(true);
  });

  test("today is marked by more than a colour", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [compact()]);

    const today = target.locator('.calendar-week th[data-today="true"]');
    // The word, first — `2M-ACCESS-005` forbids colour as the only carrier.
    await expect(today.locator(".calendar-today")).toHaveText("hoje");
    const border = await today.evaluate((node) => getComputedStyle(node).borderTopWidth);
    expect(parseFloat(border)).toBeGreaterThan(1);
  });

  /*
    The regression that removing `aria-pressed` caused. The attribute was
    invalid on an anchor and had to go; the CSS rule keyed on it stayed, so a
    hidden lane became visually identical to a shown one and its state survived
    only in a visually-hidden word.
  */
  test("a hidden lane looks hidden, not only sounds hidden", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [compact()]);

    const shown = target.locator('.calendar-lanes a[data-shown="true"]');
    const hidden = target.locator('.calendar-lanes a[data-shown="false"]');
    const [shownStyle, hiddenStyle] = await Promise.all([
      shown.evaluate((node) => ({ style: getComputedStyle(node).borderTopStyle, opacity: getComputedStyle(node).opacity })),
      hidden.evaluate((node) => ({ style: getComputedStyle(node).borderTopStyle, opacity: getComputedStyle(node).opacity })),
    ]);
    expect(hiddenStyle.style).toBe("dashed");
    expect(shownStyle.style).not.toBe("dashed");
    expect(Number(hiddenStyle.opacity)).toBeLessThan(Number(shownStyle.opacity));
  });

  /*
    Life Brain D.1 (T2: "como se fosse no Google Calendar, que você realmente
    vê a semana"): the whole week is on screen at every width and nothing
    scrolls sideways. From 768px that is the grid's seven columns. Below it
    (ADR-180) it is the seven days on one line — each a link into its day, a
    full target — over the days as a list, because seven columns of 48px turned
    every title into three hyphenated fragments.
  */
  test("the whole week fits the viewport: neither the page nor the grid scrolls sideways", async ({ page: target }) => {
    for (const width of [320, 375, 412, 768, 1024, 1440, 1920]) {
      await target.setViewportSize({ width, height: 800 });
      await openWeek(target, "pt-BR", [compact(), compact("Dentista")]);

      const overflow = await target.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        container: (() => {
          const box = document.querySelector(".calendar-week-scroll")!;
          return box.scrollWidth - box.clientWidth;
        })(),
      }));
      expect(overflow.page, `page scrolls horizontally at ${width}px`).toBeLessThanOrEqual(1);
      expect(overflow.container, `grid scrolls horizontally at ${width}px`).toBeLessThanOrEqual(1);
      const days = width < 768 ? ".calendar-week-strip-day" : ".calendar-week thead th";
      const columns = await target.locator(days).evaluateAll((cells) =>
        cells.map((cell) => {
          const box = cell.getBoundingClientRect();
          return box.width > 0 && box.left >= -1 && box.right <= window.innerWidth + 1;
        }));
      expect(columns, `a day falls off screen at ${width}px`).toEqual([true, true, true, true, true, true, true]);
    }
  });

  test("exactly one form of the week is live at any width", async ({ page: target }) => {
    for (const [width, grid, list] of [[375, "none", "block"], [1440, "block", "none"]] as const) {
      await target.setViewportSize({ width, height: 800 });
      await openWeek(target, "pt-BR", [compact()]);
      // `display: none`, so the other form is out of the accessibility tree too.
      expect(await target.locator(".calendar-week-scroll").evaluate((node) => getComputedStyle(node).display), `grid at ${width}`).toBe(grid);
      expect(await target.locator(".calendar-week-list").evaluate((node) => getComputedStyle(node).display), `list at ${width}`).toBe(list);
    }
  });

  test("on a phone the seven days are full targets, today is marked by more than a colour, and the days follow as rows", async ({ page: target }) => {
    await target.setViewportSize({ width: 375, height: 800 });
    await openWeek(target, "pt-BR", [compact()]);
    const strip = target.locator(".calendar-week-strip-day");
    await expect(strip).toHaveCount(7);
    const heights = await strip.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    const today = target.locator('.calendar-week-strip li[data-today="true"] .calendar-week-strip-day');
    await expect(today).toHaveAttribute("aria-current", "date");
    expect(await today.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");
    // A day with something on it carries a mark; an empty one does not.
    const marks = await strip.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node, "::after").content !== "none"));
    expect(marks).toEqual([false, false, true, false, false, false, false]);
    // The stream under it: today's heading says so in a word, an empty day is one line.
    await expect(target.locator('.calendar-week-list .calendar-day[data-today="true"] .calendar-today')).toHaveText("Hoje");
    const empty = await target.locator('.calendar-week-list .calendar-day[data-empty="true"]').first().boundingBox();
    expect(empty!.height).toBeLessThanOrEqual(32);
    await expect(target.locator(".calendar-week-list .calendar-item")).toHaveCount(1);
  });

  test("a compact line shows its time and at most three lines of title in a narrow column", async ({ page: target }) => {
    await target.setViewportSize({ width: 768, height: 800 });
    await openWeek(target, "pt-BR", [compact()]);
    const line = target.locator(".calendar-week .calendar-item").first();
    await expect(line.locator(".calendar-item-time")).toBeVisible();
    const body = await line.locator(".calendar-item-body").evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(node).lineHeight),
    }));
    expect(body.height).toBeLessThanOrEqual(body.lineHeight * 3 + 1);
  });

  test("a column's day is a 44px link into that day", async ({ page: target }) => {
    await target.setViewportSize({ width: 768, height: 800 });
    await openWeek(target, "pt-BR", [compact()]);
    const heads = target.locator(".calendar-week-head");
    await expect(heads).toHaveCount(7);
    const box = await heads.first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  /*
    `2M-CAL-006`. The bound was declared, implemented and never rendered by any
    browser lane — `.calendar-bound` was one of two classes the widened mirror
    guard found unmirrored. Reaching the end of what the calendar covers has to
    be a visible statement, not an empty grid the user reads as a bug.
  */
  test("reaching the end of the range says so, next to a grid that is still there", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [compact()]);

    const bound = target.locator(".calendar-bound");
    await expect(bound).toHaveText(COPY["pt-BR"].atLatest);
    await expect(bound).toHaveAttribute("role", "status");
    await expect(target.locator(".calendar-week")).toBeVisible();
  });

  test("an empty week is one line above the grid, never a box in every cell", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", []);

    await expect(target.locator(".calendar-week .calendar-empty")).toHaveCount(0);
    const empty = target.locator(".calendar-empty").first();
    await expect(empty).toHaveText(COPY["pt-BR"].empty);
    const box = await empty.evaluate((node) => {
      const style = getComputedStyle(node);
      return { border: style.borderTopWidth, background: style.backgroundColor };
    });
    expect(parseFloat(box.border)).toBe(0);
    expect(box.background).toBe("rgba(0, 0, 0, 0)");
  });
});

/**
 * The month grid, mirroring `src/features/calendar/calendar-view.tsx`.
 *
 * August 2026 starts on a Saturday, so the grid opens on Monday 27 July and
 * closes on Sunday 6 September — six rows, eleven days from the neighbouring
 * months. Those are the cells that carry `data-outside`, and they are the reason
 * this fixture uses a real month rather than a tidy 35-day one.
 */
function monthPage(locale: Locale, busyCount = 0): string {
  const copy = COPY[locale];
  const weekdays = locale === "en"
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const outsideNote = locale === "en" ? "outside this month" : "fora do mês";
  const todayWord = locale === "en" ? "Today" : "Hoje";
  const moreWord = (count: number) =>
    locale === "en" ? `${count} more` : `mais ${count}`;

  // 27 July … 6 September 2026, as [day-of-month, inThisMonth].
  const cells: Array<{ day: number; inMonth: boolean; date: string }> = [];
  for (let offset = 0; offset < 42; offset += 1) {
    const day = new Date(Date.UTC(2026, 6, 27 + offset));
    cells.push({
      day: day.getUTCDate(),
      inMonth: day.getUTCMonth() === 7,
      date: day.toISOString().slice(0, 10),
    });
  }

  const item = (index: number) =>
    `<li class="calendar-item" data-lane="deadline" data-commitment="committed">`
    + `<a class="calendar-item-link" href="/${locale}/app/work/t${index}">Compromisso ${index}</a></li>`;

  const cell = (entry: { day: number; inMonth: boolean; date: string }) => {
    const today = entry.inMonth && entry.day === 15;
    const busy = today ? busyCount : 0;
    const shown = Math.min(busy, 3);
    const overflow = busy - shown;
    return `<td${entry.inMonth ? "" : ' data-outside="true"'}${today ? ' data-today="true"' : ""}>`
      + `<a class="calendar-month-daynumber" href="?date=${entry.date}">${entry.day}`
      + (entry.inMonth ? "" : `<span class="sr-only"> (${outsideNote})</span>`)
      + `</a>`
      + (today ? `<span class="calendar-today">${todayWord}</span>` : "")
      + (shown
        ? `<ul class="calendar-day-items">${Array.from({ length: shown }, (_u, i) => item(i)).join("")}</ul>`
        : "")
      + (overflow > 0
        ? `<a class="calendar-month-more" href="?date=${entry.date}">${moreWord(overflow)}</a>`
        : "")
      + `</td>`;
  };

  const rows = Array.from({ length: 6 }, (_unused, week) =>
    `<tr>${cells.slice(week * 7, week * 7 + 7).map(cell).join("")}</tr>`).join("");

  const listDays = busyCount
    ? `<ol class="calendar-days">${dayMarkup({
      label: locale === "en" ? "Saturday, August 15" : "sábado, 15 de agosto",
      today: true,
      heading: "h3",
      items: Array.from({ length: busyCount }, (_u, i) => item(i)),
    }).replace(">Hoje<", `>${todayWord}<`)}</ol>`
    : `<p class="calendar-empty">${copy.empty}</p>`;

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main>
  <div class="content-page calendar-page">
  <section aria-labelledby="cal" class="calendar" data-orientation="month">
    ${agendaHead(copy, locale === "en" ? "August 2026" : "agosto de 2026", "month")}
    <div class="calendar-month-scroll"><table class="calendar-month">
      <caption class="sr-only">${locale === "en" ? "Month grid for August 2026" : "Grade do mês de agosto de 2026"}</caption>
      <thead><tr>${weekdays.map((day) => `<th scope="col">${day}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="calendar-month-list">
      <h2>${locale === "en" ? "Days with items this month" : "Dias com itens neste mês"}</h2>
      ${listDays}
    </div>
  </section></div></main></body></html>`;
}

/**
 * `2P-CALENDAR-001` — the month in a real engine.
 *
 * The property that cannot be checked anywhere below this lane: the grid and the
 * readable list are **both in the DOM**, and CSS decides which one exists at a
 * given width. jsdom applies no stylesheet, so a unit test can only assert the
 * two subtrees are separately targetable; whether exactly one of them is
 * rendered — and therefore whether a screen reader hears one month or two — is a
 * question only a browser answers.
 */
test.describe("2P-CALENDAR-001: the month is a real grid, and only one of its two forms is live", () => {
  test("shows the grid and removes the list on a wide viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(monthPage("pt-BR"), { waitUntil: "load" });

    await expect(page.locator(".calendar-month-scroll")).toBeVisible();
    await expect(page.locator(".calendar-month-list")).toBeHidden();

    // `display:none` rather than a clip: the subtree is out of the
    // accessibility tree, which is what stops a reader hearing the month twice.
    const display = await page.locator(".calendar-month-list")
      .evaluate((node) => getComputedStyle(node).display);
    expect(display).toBe("none");
  });

  test("shows the readable list and removes the grid on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.setContent(monthPage("pt-BR", 5), { waitUntil: "load" });

    await expect(page.locator(".calendar-month-list")).toBeVisible();
    await expect(page.locator(".calendar-month-scroll")).toBeHidden();
    expect(
      await page.locator(".calendar-month-scroll").evaluate((node) => getComputedStyle(node).display),
    ).toBe("none");

    // And the page does not scroll sideways to achieve it (`2M-MOBILE-001`).
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("lays six weeks of seven days, with the neighbouring days marked", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(monthPage("pt-BR"), { waitUntil: "load" });

    await expect(page.locator(".calendar-month thead th")).toHaveCount(7);
    await expect(page.locator(".calendar-month tbody tr")).toHaveCount(6);
    await expect(page.locator(".calendar-month td")).toHaveCount(42);
    // 27–31 July and 1–6 September.
    await expect(page.locator('.calendar-month td[data-outside="true"]')).toHaveCount(11);
  });

  test("marks today with a word, so the mark survives without colour", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(monthPage("pt-BR"), { waitUntil: "load" });
    const today = page.locator('.calendar-month td[data-today="true"]');
    await expect(today).toHaveCount(1);
    await expect(today.locator(".calendar-today")).toHaveText("Hoje");
  });

  test("bounds a busy cell and keeps its overflow reachable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(monthPage("pt-BR", 7), { waitUntil: "load" });

    const busy = page.locator('.calendar-month td[data-today="true"]');
    await expect(busy.locator(".calendar-item")).toHaveCount(3);
    const more = busy.locator(".calendar-month-more");
    await expect(more).toHaveText("mais 4");
    await expect(more).toHaveAttribute("href", /date=2026-08-15/);

    /*
     * *"Cells do not grow without limit"*, asserted as the property rather than
     * as a pixel number.
     *
     * The first version of this asserted a height ceiling, and it failed —
     * usefully. The CSS it was checking used `max-height` on a `<td>`, which has
     * no effect: table cells treat height as a minimum. The rule claimed a cap it
     * did not impose, and only a real engine could say so.
     *
     * What actually bounds the cell is `MONTH_CELL_ITEM_LIMIT`, so that is what
     * is measured: a day with seven items is exactly as tall as a day with
     * three, and adding more can never make it taller.
     */
    const heightAt = async (count: number) => {
      await page.setContent(monthPage("pt-BR", count), { waitUntil: "load" });
      return page.locator('.calendar-month td[data-today="true"]')
        .evaluate((node) => node.getBoundingClientRect().height);
    };

    /*
     * Compared among cells that all show the overflow link, because the link is
     * itself a line: a cell of exactly three items has no link and is therefore
     * legitimately shorter than one of four. The bound being asserted is that
     * beyond the limit, MORE items add NOTHING.
     */
    const atLimit = await heightAt(7);
    expect(await heightAt(40)).toBe(atLimit);
    expect(await heightAt(400)).toBe(atLimit);
    // Not trivially constant: the measurement does respond to content below the
    // limit, so a cell that always measured the same would fail here.
    expect(await heightAt(1)).toBeLessThan(atLimit);
  });

  test("gives the day number a real target", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.setContent(monthPage("pt-BR", 2), { waitUntil: "load" });
    // Measured in the list, which is the form a phone actually gets.
    const link = page.locator(".calendar-month-list .calendar-item-link").first();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(0);
  });

  test("renders the month in English too, with its own weekday row", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(monthPage("en"), { waitUntil: "load" });
    await expect(page.locator(".calendar-month thead th").first()).toHaveText("Mon");
    // Life Brain D.1: the range is the date picker's trigger.
    await expect(page.locator(".calendar-range > summary")).toHaveText("August 2026");
  });
});

/**
 * ADR-180 — the Agenda in the editorial language, measured.
 *
 * The period is the page's subject; a day is a heading over a hairline; a thing
 * on it is a row between hairlines whose link covers it and whose one verb sits
 * above that cover.
 */
test.describe("ADR-180: the period is the subject and a day is rows between hairlines", () => {
  test("the period is the largest text on the page, in the reading face, and the name is a small line", async ({ page: target }) => {
    for (const width of [375, 1440]) {
      await target.setViewportSize({ width, height: 900 });
      await open(target, "pt-BR", [task("pt-BR"), elapsed("pt-BR")]);
      const sizes = await target.evaluate(() => {
        const size = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
        return {
          period: size(".agenda-stepper-range"),
          name: size(".agenda-masthead-title"),
          largest: Math.max(...[...document.querySelectorAll<HTMLElement>(".calendar-page *")]
            .filter((node) => node.childElementCount === 0 && (node.textContent ?? "").trim() !== "" && node.getClientRects().length > 0)
            .map((node) => parseFloat(getComputedStyle(node).fontSize))),
          family: getComputedStyle(document.querySelector(".agenda-stepper-range")!).fontFamily,
        };
      });
      expect(sizes.period, `period at ${width}`).toBe(sizes.largest);
      expect(sizes.name, `name at ${width}`).toBeLessThan(sizes.period / 1.5);
      expect(sizes.family).toContain("Georgia");
    }
  });

  test("on a phone the period has a line to itself and the arrows end the caption's line", async ({ page: target }) => {
    await target.setViewportSize({ width: 320, height: 800 });
    await open(target, "pt-BR", [task("pt-BR")]);
    const [period, caption, previous, next] = await Promise.all([
      target.locator(".agenda-date-trigger").boundingBox(),
      target.locator(".agenda-stepper-caption").boundingBox(),
      target.locator('.agenda-stepper a[rel="prev"]').boundingBox(),
      target.locator('.agenda-stepper a[rel="next"]').boundingBox(),
    ]);
    expect(previous!.y).toBeGreaterThanOrEqual(period!.y + period!.height - 1);
    expect(previous!.x).toBeGreaterThanOrEqual(caption!.x + caption!.width - 1);
    expect(Math.abs(previous!.y - next!.y)).toBeLessThanOrEqual(1);
    for (const box of [period, previous, next]) expect(box!.height).toBeGreaterThanOrEqual(44);
    // One line at 320: the subject is not broken in two by its own controls.
    expect(period!.height).toBeLessThanOrEqual(56);
  });

  test("with room, the arrows end the period's line and the caption runs under it", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await open(target, "pt-BR", [task("pt-BR")]);
    const [period, caption, previous] = await Promise.all([
      target.locator(".agenda-date-trigger").boundingBox(),
      target.locator(".agenda-stepper-caption").boundingBox(),
      target.locator('.agenda-stepper a[rel="prev"]').boundingBox(),
    ]);
    expect(previous!.y).toBeLessThan(period!.y + period!.height);
    expect(caption!.y).toBeGreaterThanOrEqual(period!.y + period!.height - 1);
  });

  test("a row is time, words, caption and one verb — between hairlines, never a card", async ({ page: target }) => {
    for (const width of [320, 375, 1440]) {
      await target.setViewportSize({ width, height: 900 });
      await open(target, "pt-BR", [task("pt-BR"), elapsed("pt-BR")]);
      const row = target.locator(".calendar-item").first();
      const [time, words, caption, verb, box] = await Promise.all([
        row.locator(".calendar-item-time").boundingBox(),
        row.locator(".calendar-item-body").boundingBox(),
        row.locator(".calendar-item-meta").boundingBox(),
        row.locator(".calendar-reschedule-summary").boundingBox(),
        row.boundingBox(),
      ]);
      expect(time!.x + time!.width, `time before the words at ${width}`).toBeLessThanOrEqual(words!.x + 1);
      expect(caption!.y, `caption under the words at ${width}`).toBeGreaterThanOrEqual(words!.y + words!.height - 1);
      expect(Math.abs(caption!.x - words!.x), `caption on the words' edge at ${width}`).toBeLessThanOrEqual(1);
      expect(verb!.x, `verb after the words at ${width}`).toBeGreaterThanOrEqual(words!.x + words!.width - 1);
      expect(verb!.height, `verb target at ${width}`).toBeGreaterThanOrEqual(44);
      expect(verb!.x + verb!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
      const drawn = await row.evaluate((node) => {
        const style = getComputedStyle(node);
        return { top: style.borderTopWidth, left: style.borderLeftWidth, bottom: style.borderBottomWidth, radius: style.borderTopLeftRadius, background: style.backgroundColor };
      });
      expect(parseFloat(drawn.bottom)).toBeGreaterThan(0);
      expect(parseFloat(drawn.top)).toBe(0);
      expect(parseFloat(drawn.left)).toBe(0);
      expect(parseFloat(drawn.radius)).toBe(0);
      expect(drawn.background).toBe("rgba(0, 0, 0, 0)");
    }
  });

  test("the words are in the reading face, the time in tabular figures, and nothing is monospaced", async ({ page: target }) => {
    await open(target, "pt-BR", [task("pt-BR")]);
    const faces = await target.evaluate(() => ({
      words: getComputedStyle(document.querySelector(".calendar-item-body")!).fontFamily,
      caption: getComputedStyle(document.querySelector(".calendar-item-meta")!).fontFamily,
      figures: getComputedStyle(document.querySelector(".calendar-item-time")!).fontVariantNumeric,
      mono: [...document.querySelectorAll<HTMLElement>(".calendar-days *")]
        .filter((node) => /mono/i.test(getComputedStyle(node).fontFamily)).length,
    }));
    expect(faces.words).toContain("Georgia");
    expect(faces.caption).not.toContain("Georgia");
    expect(faces.figures).toContain("tabular-nums");
    expect(faces.mono).toBe(0);
  });

  test("the row is the link, and its dates stay their own target above it", async ({ page: target }) => {
    await target.setViewportSize({ width: 375, height: 800 });
    await open(target, "pt-BR", [task("pt-BR")]);
    const hit = await target.evaluate(() => {
      const row = document.querySelector(".calendar-item")!;
      const at = (selector: string) => {
        const box = row.querySelector(selector)!.getBoundingClientRect();
        const node = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return node?.closest("a, summary")?.className ?? "nothing";
      };
      return { time: at(".calendar-item-time"), caption: at(".calendar-item-meta"), verb: at(".calendar-reschedule-summary") };
    });
    expect(hit.time).toBe("calendar-item-link");
    expect(hit.caption).toBe("calendar-item-link");
    expect(hit.verb).toBe("calendar-reschedule-summary");
    const link = await target.locator(".calendar-item-link").boundingBox();
    expect(link!.height).toBeGreaterThanOrEqual(44);
  });

  test("open, the dates take the row's width under the words", async ({ page: target }) => {
    await target.setViewportSize({ width: 320, height: 800 });
    await open(target, "pt-BR", [task("pt-BR")]);
    await target.locator(".calendar-reschedule-summary").click();
    const [words, controls, row] = await Promise.all([
      target.locator(".calendar-item-body").boundingBox(),
      target.locator("details.calendar-reschedule").boundingBox(),
      target.locator(".calendar-item").boundingBox(),
    ]);
    expect(controls!.y).toBeGreaterThanOrEqual(words!.y + words!.height - 1);
    expect(Math.abs(controls!.x - words!.x)).toBeLessThanOrEqual(1);
    expect(controls!.x + controls!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
    await expect(target.locator('.calendar-reschedule input[type="date"]')).toBeVisible();
  });

  test("what has passed steps back, and still says so in words", async ({ page: target }) => {
    await open(target, "pt-BR", [task("pt-BR"), elapsed("pt-BR")]);
    const colours = await target.evaluate(() => [...document.querySelectorAll(".calendar-item")].map((row) =>
      getComputedStyle(row.querySelector(".calendar-item-time")!).color));
    expect(colours[0]).not.toBe(colours[1]);
    await expect(target.locator('.calendar-item[data-elapsed="true"] .calendar-item-elapsed')).toHaveText("Já passou");
    expect(await target.locator(".calendar-item-time").nth(1).evaluate((node) => getComputedStyle(node).textDecorationLine)).toBe("none");
  });

  test("today is a word in the caption of a single day, not a boxed chip", async ({ page: target }) => {
    await open(target, "pt-BR", [task("pt-BR")]);
    const chip = target.locator(".calendar-status .calendar-today");
    await expect(chip).toHaveText("Hoje");
    const drawn = await chip.evaluate((node) => {
      const style = getComputedStyle(node);
      return { border: style.borderTopWidth, background: style.backgroundColor };
    });
    expect(drawn.border).toBe("0px");
    expect(drawn.background).toBe("rgba(0, 0, 0, 0)");
    // The day's own heading is in the document and not drawn a second time.
    const heading = await target.locator(".calendar-day-heading").boundingBox();
    expect(heading!.width).toBeLessThanOrEqual(1);
  });

  test("the orientation reads as words over a hairline, each a full target, the current one underlined", async ({ page: target }) => {
    await target.setViewportSize({ width: 320, height: 800 });
    await open(target, "pt-BR", [task("pt-BR")]);
    const options = target.locator(".calendar-orientation .ui-segmented__option");
    const heights = await options.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    const drawn = await target.evaluate(() => {
      const current = getComputedStyle(document.querySelector('.calendar-orientation [aria-current="page"]')!);
      const other = getComputedStyle(document.querySelector('.calendar-orientation a:not([aria-current])')!);
      return { current: current.borderBottomColor, other: other.borderBottomColor, background: current.backgroundColor, shadow: current.boxShadow };
    });
    expect(drawn.current).not.toBe(drawn.other);
    expect(drawn.background).toBe("rgba(0, 0, 0, 0)");
    expect(drawn.shadow).toBe("none");
    // The filter keeps its name for a screen reader when only its icon is drawn.
    await expect(target.locator(".calendar-filters > summary")).toHaveText("O que mostrar");
    const filter = await target.locator(".calendar-filters > summary").boundingBox();
    expect(filter!.height).toBeGreaterThanOrEqual(44);
    const overflow = await target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
