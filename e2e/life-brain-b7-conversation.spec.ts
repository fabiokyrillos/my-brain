/**
 * Life Brain B.7 — the conversation's chips and the palette's hint, in a real
 * browser, at two viewports and in both locales.
 *
 * ## What is PROVEN here, and what is NOT — never round this up
 *
 *   - PROVEN: that a suggestion is a **control a thumb can hit** rather than a
 *     line of text; that its markup contains no form and no submit, so the
 *     structural half of "preencher, não enviar" holds in the browser too; that
 *     both locales draw their own sentences; that the `Ctrl+K` hint appears
 *     exactly where a keyboard is likely and nowhere else; and that none of it
 *     makes the page scroll sideways at 320 CSS px.
 *   - NOT PROVEN: the fill itself. Clicking a chip and seeing the composer fill
 *     is React state over a real session, so it lives in
 *     `online-phase-2p-composer.spec.ts` and in jsdom
 *     (`composer-seed.test.tsx`), where the DOM rule is asserted directly.
 *   - NOT PROVEN ANYWHERE HERE: a real phone. An emulated viewport is a
 *     viewport, not a device.
 *
 * ## Why the fixture is re-derived rather than trusted
 *
 * A hand-written fixture drifts from the components silently, and a geometry
 * assertion over markup the product no longer renders passes for the wrong
 * reason. So the class names and the sentences this file inlines are read back
 * out of the source on every run, and the lane fails when the product stops
 * using one of them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ROOT = join(__dirname, "..");

const STYLESHEETS = ["tokens.css", "experience.css", "ui.css", "globals.css", "conversation-cards.css", "palette.css"] as const;

const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");

/** The three `next/font` variables, stubbed: see `daily-surfaces.spec.ts`. */
const FONT_STUB = ":root{--font-plex-sans:system-ui,sans-serif;--font-newsreader:Georgia,serif;--font-plex-mono:ui-monospace,monospace}";

const source = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const ROW = source("src/features/conversation-cards/suggestion-row.tsx");
const CHIP = source("src/features/conversation-cards/seed-chip.tsx");
const CARDS_COPY = source("src/features/conversation-cards/copy.ts");
const PALETTE = source("src/features/palette/command-palette.tsx");
const PALETTE_COPY = source("src/features/palette/copy.ts");

/**
 * The copy, restated because Playwright's transpiler does not resolve `@/`.
 *
 * The cost is drift and it is paid the way every other lane pays it: the first
 * test below finds each of these strings in `copy.ts` and fails when one stops
 * being the product's.
 */
const COPY = {
  "pt-BR": {
    label: "Você pode me perguntar",
    overdue: "O prazo de Pagar a escola já passou. O que eu faço?",
    birthday: "Tem algum aniversário próximo?",
    person: "O que ficou pendente com Ana?",
    trigger: "Buscar e agir",
  },
  en: {
    label: "You can ask me",
    overdue: "Pagar a escola is past its date. What do I do?",
    birthday: "Is there a birthday coming up?",
    person: "What is still open with Ana?",
    trigger: "Search and act",
  },
} as const;

type Locale = keyof typeof COPY;

function suggestionRow(locale: Locale): string {
  const copy = COPY[locale];
  const chip = (question: string, category: string) =>
    `<li data-category="${category}">`
    + `<button class="ui-button" data-seed-chip="fill" type="button" aria-label="x">${question}</button>`
    + "</li>";
  return `<div class="conversation-suggestions">
    <p class="conversation-suggestions-label">${copy.label}</p>
    <ul class="conversation-suggestions-list">
      ${chip(copy.overdue, "overdue_task")}
      ${chip(copy.birthday, "birthday_soon")}
      ${chip(copy.person, "person")}
    </ul>
  </div>`;
}

function paletteTrigger(locale: Locale): string {
  return `<button class="palette-trigger" type="button" data-palette-trigger="true">
    <span>${COPY[locale].trigger}</span><kbd aria-hidden="true">Ctrl+K</kbd>
  </button>`;
}

async function open(target: Page, body: string): Promise<void> {
  await target.setContent(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>${FONT_STUB}${css}</style></head>`
    + `<body><div class="content-page chat-page">${body}</div></body></html>`,
    { waitUntil: "load" },
  );
}

/** Whether this project is emulating a device with no keyboard and a finger. */
async function coarsePointer(target: Page): Promise<boolean> {
  return target.evaluate(() => window.matchMedia("(hover: none) and (pointer: coarse)").matches);
}

test.describe("the fixture still describes the product", () => {
  test("every sentence it inlines is the one `copy.ts` renders", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = COPY[locale];
      expect(CARDS_COPY, `${locale} label`).toContain(copy.label);
      expect(CARDS_COPY, `${locale} birthday`).toContain(copy.birthday);
      expect(PALETTE_COPY, `${locale} palette trigger`).toContain(copy.trigger);
      // The two that take a name are templates in the source, so the stable
      // half is asserted rather than the rendered string.
      expect(CARDS_COPY, `${locale} overdue`).toContain(
        locale === "pt-BR" ? "O prazo de ${name} já passou" : "${name} is past its date",
      );
      expect(CARDS_COPY, `${locale} person`).toContain(
        locale === "pt-BR" ? "O que ficou pendente com ${name}?" : "What is still open with ${name}?",
      );
    }
  });

  test("every class it inlines is one the components still render", () => {
    for (const className of ["conversation-suggestions", "conversation-suggestions-label", "conversation-suggestions-list"]) {
      expect(ROW, className).toContain(className);
    }
    expect(CHIP, "the chip is a Button primitive").toMatch(/<Button\b/);
    expect(CHIP, "the chip declares itself a button").toContain('type="button"');
    expect(PALETTE, "the palette still renders its hint in a kbd").toMatch(/<kbd[^>]*>\{text\.triggerHint\}/);
  });
});

for (const locale of ["pt-BR", "en"] as const) {
  test.describe(`the suggestion chips (${locale})`, () => {
    test("are controls a thumb can hit, not lines of text", async ({ page }) => {
      await open(page, suggestionRow(locale));

      const chips = page.locator(".conversation-suggestions-list .ui-button");
      await expect(chips).toHaveCount(3);

      for (let index = 0; index < 3; index += 1) {
        const box = await chips.nth(index).boundingBox();
        expect(box, `chip ${index} has no box`).not.toBeNull();
        // `2P-ACCESS`/UX-07's floor. Before B.7 these were `<li>` text with no
        // target at all, which is what the owner tapped and watched do nothing.
        expect(box!.height, `chip ${index} height`).toBeGreaterThanOrEqual(44);
      }
    });

    test("carry no form and no submit, in the browser as in the source", async ({ page }) => {
      await open(page, suggestionRow(locale));

      await expect(page.locator(".conversation-suggestions form")).toHaveCount(0);
      await expect(page.locator('.conversation-suggestions [type="submit"]')).toHaveCount(0);
      await expect(page.locator('.conversation-suggestions [type="button"]')).toHaveCount(3);
    });

    test("draw this locale's own sentences", async ({ page }) => {
      await open(page, suggestionRow(locale));

      await expect(page.getByText(COPY[locale].label)).toBeVisible();
      await expect(page.getByText(COPY[locale].birthday)).toBeVisible();
      const other = locale === "pt-BR" ? "en" : "pt-BR";
      await expect(page.getByText(COPY[other].birthday)).toHaveCount(0);
    });

    test("do not make the page scroll sideways at 320 CSS px", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await open(page, suggestionRow(locale));

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "the page scrolls horizontally").toBeLessThanOrEqual(1);
    });
  });
}

test.describe("defect 1: the keyboard hint, where there is a keyboard", () => {
  test("shows `Ctrl+K` only on a device that has a Ctrl", async ({ page }) => {
    await open(page, paletteTrigger("pt-BR"));

    const hint = page.locator(".palette-trigger kbd");
    const trigger = page.locator(".palette-trigger");
    // The control itself is never taken away: the palette opens by tap too.
    await expect(trigger).toBeVisible();

    if (await coarsePointer(page)) {
      // The owner read "Ctrl+K" on an iPhone. It has no Ctrl.
      await expect(hint).toBeHidden();
    } else {
      await expect(hint).toBeVisible();
    }
  });

  test("hides it when a coarse pointer is emulated, whatever the viewport", async ({ page }) => {
    // The rule is a device query, not a width: a narrow desktop window still has
    // a keyboard, and a wide tablet still does not.
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, paletteTrigger("en"));

    const hidden = await coarsePointer(page);
    await expect(page.locator(".palette-trigger kbd")).toBeVisible({ visible: !hidden });
  });
});
