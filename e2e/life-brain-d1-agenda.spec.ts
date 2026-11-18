import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { reminderDetailBody, reminderGroup, reminderRow } from "./support/reminder-fixtures";

/**
 * Life Brain D.1 — the Agenda with content in it, in a real browser.
 *
 * The test account on the linked project has no reminders and nothing on this
 * week's calendar, so the signed-in screenshots show the redesigned **empty**
 * surfaces. This lane renders the two shapes that only show with content — the
 * reminder and the week grid with lines in it — with the product's own
 * stylesheets, and asserts what the owner complained about (T2) as geometry.
 *
 * The reminder was a card with three controls and a "Mais" menu when D.1
 * shipped. Since ADR-180 it is a **row** (the link and one verb) and the rest
 * of its controls are on its own page, so D.1's requirement — at most three
 * visible controls, everything else one tap away — is asserted on those two
 * shapes. The markup is `support/reminder-fixtures.ts` (mirroring
 * `reminder-list.tsx`, `reminder-detail.tsx` and `series-controls.tsx`) and
 * `calendar-view.tsx`'s week. With `LIFE_BRAIN_EVIDENCE` set it also writes the
 * screenshots that go into `docs/reports/life-brain/evidence/slice-d1/after/`.
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

/** The busiest reminder the owner can have: scheduled, linked, repeating, every action. */
function reminderCard(): string {
  return `<div class="reminder-groups">${reminderGroup("later", "Mais adiante", [
    reminderRow({ id: "r1", time: "09:00", day: "05/06/2027", title: "Aniversário de Ana", caption: ["Todo ano em 5 de junho", "Tarefa: Comprar o presente da Ana"] }),
  ])}</div>`;
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
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".reminder-row a[href], .reminder-row button, .reminder-row select, .reminder-row summary")]
    .filter((node) => {
      const closed = node.closest("details:not([open])");
      return closed === null || (node.tagName === "SUMMARY" && node.parentElement === closed);
    })
    .filter((node) => node.getBoundingClientRect().width > 0)
    .map((node) => (node.textContent ?? "").trim()));
}

test.describe("Life Brain D.1: the reminder", () => {
  for (const viewport of VIEWPORTS) {
    test(`shows the link and one verb, and fits the row at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(shell(reminderCard()), { waitUntil: "load" });
      const shown = await visibleControls(page);
      expect(shown.length, "D.1: at most three visible controls").toBeLessThanOrEqual(3);
      expect(shown).toEqual(["Aniversário de Ana", "Adiar 1h"]);

      // The verb ends the row, on the title's line, and its label does not wrap.
      const [row, title, verb] = await Promise.all([
        page.locator(".reminder-row").boundingBox(),
        page.locator(".reminder-row-title").boundingBox(),
        page.locator(".reminder-verb").boundingBox(),
      ]);
      expect(verb!.x).toBeGreaterThanOrEqual(title!.x + title!.width - 1);
      expect(verb!.x + verb!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
      expect(verb!.height, "the verb's label wrapped").toBeLessThanOrEqual(46);
      expect(verb!.height).toBeGreaterThanOrEqual(44);
      expect(title!.height).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`keeps the rest one tap away, on the reminder's page, inside the viewport at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const open of [undefined, "reschedule", "series"] as const) {
        await page.setContent(shell(reminderDetailBody({ open, title: "Aniversário de Ana" })), { waitUntil: "load" });
        const controls = await page.locator(".reminder-detail a, .reminder-detail button, .reminder-detail select, .reminder-detail input:not([type=hidden]):not([type=radio]):not([type=checkbox])")
          .evaluateAll((nodes) => nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { label: (node.textContent ?? "").trim(), left: box.left, right: box.right, height: box.height };
          }));
        for (const name of ["Reagendar", "Editar", "Alterar repetição", "Encerrar repetição", "Cancelar lembrete", "Ver no histórico"]) {
          expect(controls.map((control) => control.label), `open=${open}`).toContain(name);
        }
        for (const control of controls) {
          expect(control.left, `${control.label} starts off screen`).toBeGreaterThanOrEqual(0);
          expect(control.right, `${control.label} ends off screen`).toBeLessThanOrEqual(viewport.width + 1);
          expect(control.height, `${control.label} is a short target`).toBeGreaterThanOrEqual(44);
        }
      }
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
        await page.locator(".reminder-row").screenshot({ path: `${EVIDENCE}/fixture-reminder-card-${viewport.name}${suffix}.png` });
        await page.setContent(shell(reminderDetailBody({ open: "reschedule", title: "Aniversário de Ana" })), { waitUntil: "load" });
        await page.screenshot({ path: `${EVIDENCE}/fixture-reminder-card-menu-${viewport.name}${suffix}.png` });

        await page.setContent(shell(week()), { waitUntil: "load" });
        await page.locator(".calendar-week-scroll").screenshot({ path: `${EVIDENCE}/fixture-week-${viewport.name}${suffix}.png` });
      });
    }
  }
});
