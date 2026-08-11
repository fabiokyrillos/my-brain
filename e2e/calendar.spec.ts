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
const STYLESHEETS = ["globals.css", "operations.css", "task-commands.css", "calendar.css"] as const;

const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");

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
  },
  en: {
    title: "Calendar",
    reschedule: "Dates",
    unavailable: "This item has no dates that can be changed here.",
    empty: "Nothing scheduled for this period.",
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
  <style>${css}</style></head><body><main>
  <section aria-labelledby="cal" class="calendar">
    <header class="calendar-header"><h1 id="cal">${copy.title}</h1></header>
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
