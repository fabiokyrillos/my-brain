import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Life Brain D.1 — the Agenda with content in it, in a real browser.
 *
 * The test account on the linked project has no reminders and nothing on this
 * week's calendar, so the signed-in screenshots show the redesigned **empty**
 * surfaces. This lane renders the two shapes that only show with content — the
 * reminder card and the week grid with lines in it — with the product's own
 * stylesheets, and asserts what the owner complained about (T2) as geometry.
 *
 * The markup mirrors `reminder-list.tsx` + `reminder-actions.tsx` +
 * `series-controls.tsx` (part `facts` and `controls`) and `calendar-view.tsx`'s
 * week. With `LIFE_BRAIN_EVIDENCE` set it also writes the screenshots that go
 * into `docs/reports/life-brain/evidence/slice-d1/after/`.
 */

const ROOT = join(__dirname, "..");
// Token sheets first (ADR-114): the palette every other rule resolves against.
const STYLESHEETS = ["tokens.css", "experience.css", "ui.css", "globals.css", "operations.css", "task-commands.css", "calendar.css", "reminders.css"] as const;
const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");
// The `next/font` variables, stubbed: an undeclared `var()` voids every `--type-*` token.
const FONT_STUB = ":root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}";
const EVIDENCE = process.env.LIFE_BRAIN_EVIDENCE?.trim() ?? "";

function shell(body: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${FONT_STUB}${css}</style></head><body><main><div class="content-page">${body}</div></main></body></html>`;
}

/** The busiest card the owner can have: scheduled, linked, repeating, every action. */
function reminderCard(): string {
  return `<article class="list-row reminder-row scheduled" id="reminder-r1">
    <div class="list-row-main">
      <strong>Aniversário de Ana</strong>
      <p class="reminder-schedule"><span>Próximo aviso: <strong>5 de jun. de 2027, 09:00</strong></span></p>
      <p class="reminder-subject"><span class="reminder-subject-text"><span class="reminder-subject-kind">Tarefa vinculada</span><span>Comprar o presente da Ana</span></span></p>
      <div class="reminder-series">
        <p class="reminder-series-facts"><span class="status-badge reminder-series-badge">Repete</span><span class="reminder-series-rule">Todo ano em 5 de junho</span></p>
      </div>
      <div class="reminder-actions">
        <div class="reminder-action-row">
          <form class="reminder-snooze-quick"><button class="reminder-button" type="submit">Adiar 1 hora</button></form>
          <button aria-expanded="false" class="reminder-button" type="button">Reagendar</button>
          <details class="reminder-more">
            <summary aria-label="Mais ações deste lembrete" class="reminder-button reminder-more-trigger"><span aria-hidden="true">Mais</span></summary>
            <div class="reminder-more-panel">
              <form class="reminder-snooze">
                <label class="reminder-inline-label" for="snooze">Adiar por</label>
                <select class="reminder-select" id="snooze" name="snoozeMinutes"><option>3 horas</option></select>
                <button class="reminder-button" type="submit">Adiar</button>
              </form>
              <button class="reminder-menu-item" type="button">Editar</button>
              <button class="reminder-menu-item danger" type="button">Cancelar lembrete</button>
              <div class="reminder-series reminder-series-controls">
                <div class="reminder-action-row">
                  <button class="reminder-button" type="button">Alterar repetição</button>
                  <button class="reminder-button danger" type="button">Encerrar repetição</button>
                </div>
                <p class="reminder-series-hint">Cancelar esta ocorrência não encerra a repetição.</p>
              </div>
              <a class="reminder-menu-item reminder-subject-link" href="#">Abrir: Comprar o presente da Ana</a>
              <a class="reminder-menu-item reminder-history-link" href="#">Ver no histórico</a>
            </div>
          </details>
        </div>
      </div>
    </div>
    <div class="list-meta"><span class="status-badge reminder-scheduled">Agendado</span></div>
  </article>`;
}

/** The week with lines in three columns, mirroring `calendar-view.tsx`. */
function week(): string {
  const days = ["seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."];
  const line = (time: string, lane: string, laneName: string, title: string) =>
    `<li class="calendar-item" data-density="compact" data-lane="${lane}" data-commitment="committed" data-elapsed="false">
      <span class="calendar-item-meta"><time class="calendar-item-time">${time}</time><span class="calendar-item-lane">${laneName}</span><span class="sr-only">Compromisso</span></span>
      <span class="calendar-item-body"><a class="calendar-item-link" href="#">${title}</a></span>
    </li>`;
  const cells: Record<number, string[]> = {
    0: [line("09:00", "event", "Eventos", "Consulta no dentista")],
    2: [line("14:00", "deadline", "Prazos", "Entregar o relatório da reunião de quinta"), line("18:30", "reminder", "Lembretes", "Ligar para a mãe")],
    4: [line("Dia todo", "event", "Eventos", "Viagem a Recife")],
  };
  return `<section class="calendar">
    <div class="calendar-week-scroll"><table class="calendar-week"><caption class="sr-only">semana</caption>
      <thead><tr>${days.map((day, index) => `<th scope="col"${index === 3 ? ' data-today="true"' : ""}><a class="calendar-week-head" href="#"><span class="calendar-week-weekday">${day}</span><span class="calendar-week-day">${9 + index}</span></a>${index === 3 ? '<span class="calendar-today">hoje</span>' : ""}</th>`).join("")}</tr></thead>
      <tbody><tr>${days.map((_day, index) => `<td${index === 3 ? ' data-today="true"' : ""}>${cells[index] ? `<ul class="calendar-day-items">${cells[index].join("")}</ul>` : ""}</td>`).join("")}</tr></tbody>
    </table></div>
  </section>`;
}

const VIEWPORTS = [
  { name: "iphone-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

/** Interactive elements a sighted owner sees without opening anything. */
async function visibleControls(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>("article a[href], article button, article select, article summary")]
    .filter((node) => {
      const closed = node.closest("details:not([open])");
      return closed === null || (node.tagName === "SUMMARY" && node.parentElement === closed);
    })
    .filter((node) => node.getBoundingClientRect().width > 0)
    .map((node) => (node.textContent ?? "").trim()));
}

test.describe("Life Brain D.1: the reminder card", () => {
  for (const viewport of VIEWPORTS) {
    test(`shows three controls and fits the row at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(shell(reminderCard()), { waitUntil: "load" });
      expect(await visibleControls(page)).toEqual(["Adiar 1 hora", "Reagendar", "Mais"]);

      // On a phone the three share one row instead of stacking at full width.
      const centres = await page.locator(".reminder-actions > .reminder-action-row > *").evaluateAll((nodes) =>
        nodes.map((node) => { const box = node.getBoundingClientRect(); return box.top + box.height / 2; }));
      expect(centres).toHaveLength(3);
      expect(Math.max(...centres) - Math.min(...centres), "the three controls are not on one row").toBeLessThanOrEqual(2);
      // A closed menu lays nothing out: its panel has no box at all.
      expect(await page.locator(".reminder-more-panel").evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
      // And no label breaks inside its button ("Adiar 1 / hora").
      const lines = await page.locator(".reminder-actions > .reminder-action-row .reminder-button").evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height));
      expect(Math.max(...lines), "a button label wrapped").toBeLessThanOrEqual(46);

      const heights = await page.locator(".reminder-actions > .reminder-action-row > form > button, .reminder-actions > .reminder-action-row > button, .reminder-more-trigger").evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height));
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`opens "Mais" inside the viewport at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(shell(reminderCard()), { waitUntil: "load" });
      await page.locator(".reminder-more-trigger").click();
      const panel = await page.locator(".reminder-more-panel").boundingBox();
      expect(panel!.x).toBeGreaterThanOrEqual(0);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width + 1);
      const items = await page.locator(".reminder-menu-item").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      expect(Math.min(...items)).toBeGreaterThanOrEqual(44);
    });
  }
});

test.describe("Life Brain D.1: evidence with content", () => {
  test.skip(EVIDENCE === "", "LIFE_BRAIN_EVIDENCE is not set; nothing to write");
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of VIEWPORTS) {
      test(`writes the reminder card and the week, ${theme}, ${viewport.name}`, async ({ page }) => {
        mkdirSync(EVIDENCE, { recursive: true });
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const suffix = theme === "dark" ? "-dark" : "";

        await page.setContent(shell(reminderCard()), { waitUntil: "load" });
        await page.locator("article").screenshot({ path: `${EVIDENCE}/fixture-reminder-card-${viewport.name}${suffix}.png` });
        await page.locator(".reminder-more-trigger").click();
        await page.screenshot({ path: `${EVIDENCE}/fixture-reminder-card-menu-${viewport.name}${suffix}.png` });

        await page.setContent(shell(week()), { waitUntil: "load" });
        await page.locator(".calendar-week-scroll").screenshot({ path: `${EVIDENCE}/fixture-week-${viewport.name}${suffix}.png` });
      });
    }
  }
});
