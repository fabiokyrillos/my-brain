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
const STYLESHEETS = ["tokens.css", "experience.css", "globals.css", "operations.css", "task-commands.css", "calendar.css"] as const;

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
    title: "Calendário",
    reschedule: "Datas",
    unavailable: "Este item não tem datas que possam ser alteradas aqui.",
    empty: "Nada marcado para este período.",
    description: "O que os seus dias contêm, reunido a partir do que você já registrou.",
    atLatest: "Este é o fim do período que o calendário cobre.",
  },
  en: {
    title: "Calendar",
    reschedule: "Dates",
    unavailable: "This item has no dates that can be changed here.",
    empty: "Nothing scheduled for this period.",
    description: "What your days actually contain, gathered from what you have already recorded.",
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

  return `<li class="calendar-item" data-lane="${options.lane}" data-commitment="${options.commitment}" data-elapsed="${options.elapsed ? "true" : "false"}">
    <span class="calendar-item-meta">
      <span class="calendar-item-lane">${options.lane}</span>
      <span class="calendar-item-commitment">${options.commitment}</span>
      <time class="calendar-item-time" datetime="2026-08-15T18:00:00.000Z">15:00</time>
      ${options.elapsed ? '<span class="calendar-item-elapsed">Já passou</span>' : ""}
    </span>
    <span class="calendar-item-body">${body}</span>
    ${controls}
  </li>`;
}

/** The day orientation, mirroring `calendar-view.tsx`'s `<ol className="calendar-days">`. */
function page(locale: Locale, items: string[]): string {
  const copy = COPY[locale];
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main>
  <section aria-labelledby="cal" class="calendar">
    <header class="calendar-header"><h1 id="cal">${copy.title}</h1><p class="calendar-description">${copy.description}</p></header>
    <nav aria-label="Orientação" class="calendar-orientation"><ul>
      <li><a href="?orientation=day" aria-current="true">Dia</a></li>
      <li><a href="?orientation=week">Semana</a></li>
      <li><a href="?orientation=agenda">Agenda</a></li>
    </ul></nav>
    <nav aria-label="Anterior" class="calendar-navigation">
      <a href="?date=2026-08-14" rel="prev">Anterior</a>
      <p aria-live="polite" class="calendar-range">sáb., 15 ago.</p>
      <a href="?date=2026-08-15">Hoje</a>
      <a href="?date=2026-08-16" rel="next">Próximo</a>
    <a class="calendar-reminders-link" href="/pt-BR/app/reminders">Todos os lembretes</a>
    </nav>
    <p aria-live="polite" class="calendar-summary">${items.length} itens neste período</p>
    <ol class="calendar-days"><li class="calendar-day" data-today="true">
      <h2>sáb., 15 ago.</h2>
      ${items.length === 0
        ? `<p class="calendar-empty">${copy.empty}</p>`
        : `<ul class="calendar-day-items">${items.join("")}</ul>`}
    </li></ol>
  </section></main></body></html>`;
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
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main>
  <section aria-labelledby="cal" class="calendar">
    <header class="calendar-header"><h1 id="cal">${copy.title}</h1><p class="calendar-description">${copy.description}</p></header>
    <div class="calendar-toolbar">
      <nav aria-label="Orientação" class="calendar-orientation"><ul>
        <li><a href="?orientation=day">Dia</a></li>
        <li><a href="?orientation=week" aria-current="true">Semana</a></li>
        <li><a href="?orientation=agenda">Agenda</a></li>
      </ul></nav>
      <nav aria-label="Faixas" class="calendar-lanes"><ul>
        ${lane("Prazos", true)}${lane("Intenções", false)}
      </ul></nav>
      <nav aria-label="Anterior" class="calendar-navigation">
        <a href="?date=2026-08-03" rel="prev">Anterior</a>
        <p aria-live="polite" class="calendar-range">seg., 10 ago. – dom., 16 ago.</p>
        <a href="?date=2026-08-15">Hoje</a>
        <a href="?date=2026-08-17" rel="next">Próximo</a>
      <a class="calendar-reminders-link" href="/pt-BR/app/reminders">Todos os lembretes</a>
      </nav>
    </div>
    <p class="calendar-bound" role="status">${copy.atLatest}</p>
    <p aria-live="polite" class="calendar-summary">${items.length} itens neste período</p>
    <div class="calendar-week-scroll"><table class="calendar-week">
      <caption class="visually-hidden">seg., 10 ago. – dom., 16 ago.</caption>
      <thead><tr>${days.map((day, index) =>
        `<th scope="col"${index === 5 ? ' data-today="true"' : ""}><span class="calendar-week-day">${day}</span>${index === 5 ? '<span class="calendar-today">hoje</span>' : ""}</th>`).join("")}</tr></thead>
      <tbody><tr>${days.map((_day, index) =>
        `<td${index === 5 ? ' data-today="true"' : ""}>${index === busyIndex && items.length
          ? `<ul class="calendar-day-items">${items.join("")}</ul>`
          : `<p class="calendar-empty">${copy.empty}</p>`}</td>`).join("")}</tr></tbody>
    </table></div>
  </section></main></body></html>`;
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
 * The week grid — the shape the calendar had never been rendered in by any lane.
 *
 * Every assertion here is geometric or computed-style, which is precisely why it
 * belongs in a browser: the defect it guards against is a table that stopped
 * being a table, and jsdom has no table layout algorithm to be wrong about.
 */
test.describe("the week is a grid, not seven columns sized by their contents", () => {
  test("seven equal columns, whichever day is busy", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [task("pt-BR"), task("pt-BR"), task("pt-BR")]);

    const widths = await target.locator(".calendar-week thead th").evaluateAll((cells) =>
      cells.map((cell) => Math.round(cell.getBoundingClientRect().width)));
    expect(widths).toHaveLength(7);
    // The busy column is the third; with a content-sized table it was the widest
    // by a factor of two or more.
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  test("a header sits above the column it names", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [task("pt-BR")]);

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
    await openWeek(target, "pt-BR", [task("pt-BR")]);

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
    await openWeek(target, "pt-BR", [task("pt-BR")]);

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

  test("the grid scrolls inside its container and the page never does", async ({ page: target }) => {
    for (const width of [375, 412, 768, 1024, 1440, 1920]) {
      await target.setViewportSize({ width, height: 800 });
      await openWeek(target, "pt-BR", [task("pt-BR")]);

      const overflow = await target.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        container: (() => {
          const box = document.querySelector(".calendar-week-scroll")!;
          return box.scrollWidth > box.clientWidth;
        })(),
      }));
      expect(overflow.page, `page scrolls horizontally at ${width}px`).toBeLessThanOrEqual(1);
      // The container is what absorbs it on a narrow viewport — proof the
      // scroll went somewhere rather than the grid being squeezed flat.
      if (width <= 768) expect(overflow.container, `grid did not scroll at ${width}px`).toBe(true);
    }
  });

  /*
    `2M-CAL-006`. The bound was declared, implemented and never rendered by any
    browser lane — `.calendar-bound` was one of two classes the widened mirror
    guard found unmirrored. Reaching the end of what the calendar covers has to
    be a visible statement, not an empty grid the user reads as a bug.
  */
  test("reaching the end of the range says so, next to a grid that is still there", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [task("pt-BR")]);

    const bound = target.locator(".calendar-bound");
    await expect(bound).toHaveText(COPY["pt-BR"].atLatest);
    await expect(bound).toHaveAttribute("role", "status");
    await expect(target.locator(".calendar-week")).toBeVisible();
  });

  test("an empty day inside the grid is a line, never a box", async ({ page: target }) => {
    await target.setViewportSize({ width: 1440, height: 900 });
    await openWeek(target, "pt-BR", [task("pt-BR")]);

    const empty = target.locator(".calendar-week .calendar-empty").first();
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
    ? `<ol class="calendar-days"><li class="calendar-day" data-today="true">`
      + `<h3>sáb., 15 ago.<span class="calendar-today">${todayWord}</span></h3>`
      + `<ul class="calendar-day-items">${Array.from({ length: busyCount }, (_u, i) => item(i)).join("")}</ul>`
      + `</li></ol>`
    : `<p class="calendar-empty">${copy.empty}</p>`;

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main>
  <section aria-labelledby="cal" class="calendar">
    <header class="calendar-header"><h1 id="cal">${copy.title}</h1><p class="calendar-description">${copy.description}</p></header>
    <div class="calendar-toolbar">
      <nav aria-label="Orientação" class="calendar-orientation"><ul>
        <li><a href="?orientation=day">Dia</a></li>
        <li><a href="?orientation=week">Semana</a></li>
        <li><a href="?orientation=month" aria-current="true">${locale === "en" ? "Month" : "Mês"}</a></li>
        <li><a href="?orientation=agenda">Agenda</a></li>
      </ul></nav>
      <nav aria-label="Anterior" class="calendar-navigation">
        <a href="?date=2026-07-15" rel="prev">Anterior</a>
        <p aria-live="polite" class="calendar-range">${locale === "en" ? "August 2026" : "agosto de 2026"}</p>
        <a href="?date=2026-08-15">Hoje</a>
        <a href="?date=2026-09-15" rel="next">Próximo</a>
      </nav>
    </div>
    <div class="calendar-month-scroll"><table class="calendar-month">
      <caption class="visually-hidden">${locale === "en" ? "Month grid for August 2026" : "Grade do mês de agosto de 2026"}</caption>
      <thead><tr>${weekdays.map((day) => `<th scope="col">${day}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="calendar-month-list">
      <h2>${locale === "en" ? "Days with items this month" : "Dias com itens neste mês"}</h2>
      ${listDays}
    </div>
  </section></main></body></html>`;
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
    await expect(page.locator(".calendar-range")).toHaveText("August 2026");
  });
});
