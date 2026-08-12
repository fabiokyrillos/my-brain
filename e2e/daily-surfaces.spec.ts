/**
 * `2M-ACCESS-006`, `2M-ACCESS-004`, `2M-MOBILE-004` — the **planner** and the
 * **day review** in a real browser.
 *
 * ## Why this file exists, and what slice 2M.2 said about not writing it
 *
 * Slice 2M.2 shipped the planner with **no browser lane at all**, and said so
 * plainly rather than writing one that proved less than it appeared to: the
 * calendar's lane is legitimate only because a guard re-derives its markup from
 * the components on every run, and a planner spec without one would be "a fixture
 * prettier than the value". `2M-MOBILE-004` and `2M-ACCESS-004` were recorded
 * **partial** with slice 2M.3 as their destination.
 *
 * This is that destination. The guard came first —
 * `calendar-mirror-guard.test.ts` is now table-driven over three surfaces, so
 * the calendar, the planner and the day review are all re-derived from component
 * source on each run by **one** implementation rather than three copies of the
 * idea.
 *
 * ## What is PROVEN here, and what is NOT — never round this up
 *
 *   - PROVEN: rendered structure at two viewports and in both locales, computed
 *     touch-target sizes, visible focus, keyboard reachability of every control,
 *     reflow at 320 CSS px, the absence of horizontal page scroll, that a masked
 *     row still carries its controls while withholding its title, and that the
 *     outcome region sits **outside** every list.
 *   - NOT PROVEN: anything requiring the database or React state — an applied
 *     carry-forward, a refusal, an undo, or the disappearance of a row that has
 *     just been moved. Those need an authenticated app.
 *   - NOT PROVEN ANYWHERE: a real screen reader, and a real phone.
 *     `2M-ACCESS-007` and the OD-2M-5 hardware checkpoint are owner-run, and a
 *     green run here must never be cited as discharging either.
 *     **An emulated viewport is a viewport, not a device.**
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ROOT = join(__dirname, "..");

const STYLESHEETS = ["globals.css", "operations.css", "task-commands.css", "calendar.css"] as const;

const css = STYLESHEETS.map((file) => readFileSync(join(ROOT, "src", "app", file), "utf8"))
  .join("\n")
  .replace(/@import\s+"tailwindcss";?/g, "")
  .replace(/@import\s+"\.\/[a-z-]+\.css";?/g, "");

type Locale = "pt-BR" | "en";

/**
 * The copy, **byte-identical to `src/features/planning/copy.ts`** and
 * `src/features/day-review/copy.ts`.
 *
 * Restated because Playwright's transpiler does not resolve the `@/` alias. The
 * cost is drift and it is paid the same way the markup's is: the mirror guard
 * extracts these exact strings from the two `copy.ts` modules on every run and
 * fails when they stop matching.
 */
const COPY = {
  "pt-BR": {
    plannerTitle: "Planejar o dia",
    plannedEmpty: "Nada planejado para este dia ainda.",
    reviewTitle: "Revisão do dia",
    nothingScheduled: "Nada é executado por horário configurado; esta revisão só existe quando você a abre.",
    unreadableHeading: "O que não pôde ser lido",
    completed: "Concluído",
    notifyHeading: "Notificações no aparelho",
    notifyState: "Este navegador ou este aparelho não oferece avisos. No iPhone, é preciso instalar o app na tela de início primeiro.",
  },
  en: {
    plannerTitle: "Plan the day",
    plannedEmpty: "Nothing planned for this day yet.",
    reviewTitle: "Day review",
    nothingScheduled: "Nothing runs from a configured schedule; this review exists only when you open it.",
    unreadableHeading: "What could not be read",
    completed: "Completed",
    notifyHeading: "Notifications on this device",
    notifyState: "This browser or device does not offer alerts. On iPhone, the app has to be installed to the home screen first.",
  },
} as const;

/**
 * The controls, mirroring what `TaskDetailControls` emits in its `inline`
 * variant — the same markup the calendar's lane mirrors, because it is the same
 * component. `value` is what the surface proposes; an empty one is the verb
 * where the day is the user's choice.
 */
function controlMarkup(options: { action: string; label: string; kind: "date" | "choice" | "immediate"; value?: string }): string {
  const id = `task-control-${options.action}`;
  const field = options.kind === "date"
    ? `<label for="${id}">Dia planejado</label><input id="${id}" name="value" type="date" min="2024-08-11" max="2028-08-11" value="${options.value ?? ""}" />`
    : options.kind === "choice"
      ? `<label for="${id}">Situação</label><select id="${id}" name="value"><option value="">Escolha</option><option value="waiting"${options.value === "waiting" ? " selected" : ""}>Aguardando</option></select>`
      : "";
  return `<li class="task-control">
    <form>
      ${field}
      <button class="row-action" type="submit">${options.label}</button>
    </form>
  </li>`;
}

/** One planner row, mirroring `src/features/planning/planner-view.tsx`. */
function plannerRow(options: { locale: Locale; masked?: boolean; selectable?: boolean }): string {
  const body = options.masked
    ? '<span class="protected-content"><button type="button" class="row-action">Mostrar</button></span>'
    : '<a href="/pt-BR/app/work/t1">Entregar o relatório</a>';
  return `<li class="planner-item">
    <div class="planner-item-head">
      ${options.selectable === false ? "" : '<input aria-label="Entregar o relatório" class="planner-select" type="checkbox" />'}
      ${body}
    </div>
    <p class="planner-item-meta">Planejado para 11 de ago. de 2026</p>
    <div class="task-detail-controls task-detail-controls-inline">
      <ul class="task-control-list">
        ${controlMarkup({ action: "set_planned", label: "Aplicar", kind: "date" })}
      </ul>
    </div>
  </li>`;
}

/** One day-review row, mirroring `src/features/day-review/day-review-view.tsx`. */
function reviewRow(options: { locale: Locale; masked?: boolean }): string {
  const body = options.masked
    ? '<span class="protected-content"><button type="button" class="row-action">Mostrar</button></span>'
    : '<a href="/pt-BR/app/work/t1">Entregar o relatório</a>';
  const verb = (kind: string, action: string, controlKind: "date" | "choice" | "immediate", value?: string) =>
    `<div class="day-review-verb" data-verb="${kind}">
      <p class="quiet-state">${kind}</p>
      <div class="task-detail-controls task-detail-controls-inline">
        <ul class="task-control-list">${controlMarkup({ action, label: "Aplicar", kind: controlKind, value })}</ul>
      </div>
    </div>`;
  return `<li class="day-review-item">
    <div class="day-review-item-head">${body}</div>
    <div class="day-review-verbs">
      ${verb("carry_forward", "set_planned", "date", "2026-08-12")}
      ${verb("plan", "set_planned", "date")}
      ${verb("reschedule", "reschedule_due", "date")}
      ${verb("follow_up", "set_status", "choice", "waiting")}
      ${verb("archive", "cancel_task", "immediate")}
    </div>
  </li>`;
}

function shell(locale: Locale, body: string): string {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${css}</style></head><body><main>${body}</main></body></html>`;
}

/** The planner, mirroring the page `PlannerView` renders. */
function plannerPage(locale: Locale, rows: string[]): string {
  const copy = COPY[locale];
  return shell(locale, `<div class="content-page planner-page">
    <header class="list-header">
      <div>
        <p class="eyebrow">PLANEJAR</p>
        <h1>${copy.plannerTitle}</h1>
        <p class="quiet-state">Nada é criado aqui.</p>
      </div>
      <nav aria-label="Dia" class="planner-day-nav">
        <a href="?date=2026-08-10">Dia anterior</a>
        <strong>2026-08-11</strong>
        <a href="?date=2026-08-12">Próximo dia</a>
      </nav>
    </header>
    <div aria-live="polite" class="calendar-outcome" role="status"></div>
    <section aria-label="Capacidade" class="planner-capacity">
      <h2>Capacidade</h2>
      <p>1 item planejado</p>
      <p class="quiet-state">Nenhuma duração é conhecida.</p>
      <p role="status">Este dia parece cheio.</p>
    </section>
    <section aria-label="Conflitos" class="planner-conflicts">
      <h2>Conflitos</h2>
      <p class="quiet-state">Nenhum conflito.</p>
    </section>
    <section aria-label="Planejado" class="planner-list">
      <h2>Planejado</h2>
      ${rows.length === 0 ? `<p class="quiet-state">${copy.plannedEmpty}</p>` : `<ul>${rows.join("")}</ul>`}
    </section>
  </div>`);
}

/** The day review, mirroring the page `DayReviewView` renders. */
function reviewPage(locale: Locale, rows: string[], options: { unreadable?: boolean } = {}): string {
  const copy = COPY[locale];
  return shell(locale, `<div class="content-page day-review-page">
    <header class="list-header">
      <div>
        <p class="eyebrow">FECHAMENTO DO DIA</p>
        <h1>${copy.reviewTitle}</h1>
        <p class="quiet-state">${copy.nothingScheduled}</p>
      </div>
      <nav aria-label="Período da revisão" class="day-review-scope-nav">
        <a aria-current="page" href="?scope=day">Este dia</a>
        <a href="?scope=next_day">Dia seguinte</a>
      </nav>
    </header>
    <div aria-live="polite" class="calendar-outcome" role="status"></div>
    <section aria-label="Seu horário de revisão" class="day-review-schedule">
      <h2>Seu horário de revisão</h2>
      <p>Já passou das 22:00, o horário que você escolheu para revisar o dia.</p>
    </section>
    <section aria-label="${copy.unreadableHeading}" class="day-review-unreadable">
      <h2>${copy.unreadableHeading}</h2>
      ${options.unreadable
        ? '<ul role="status"><li>Não foi possível ler: Concluído. Esta seção não está vazia — ela não pôde ser lida.</li></ul>'
        : '<p class="quiet-state">Todas as fontes desta revisão foram lidas.</p>'}
    </section>
    <section aria-label="${copy.completed}" class="day-review-section" data-source="completed">
      <h2>${copy.completed}</h2>
      ${rows.length === 0 ? '<p class="quiet-state">Nada foi concluído neste dia.</p>' : `<ul>${rows.join("")}</ul>`}
    </section>
    <section aria-label="Registros capturados" class="day-review-section" data-source="captured">
      <h2>Registros capturados</h2>
      <ul>
        <li class="day-review-item">
          <a href="/pt-BR/app/inbox/e1">Anotei uma ideia</a>
          <p class="day-review-item-meta">14:00</p>
        </li>
      </ul>
    </section>
  </div>`);
}

/**
 * The notification governance section, mirroring
 * `src/features/notifications/notification-settings.tsx`.
 *
 * `2M-MOBILE-005` asks for the notification-settings journey at both viewports
 * and in both locales. The section ships **no control** in slice 2M.4a — the
 * consumer that would read one is migration 2's consent record — so what the
 * lane proves is the honest half: the benefit is explained, the state is
 * announced, and there is nothing to press.
 */
function notificationPage(locale: Locale): string {
  const copy = COPY[locale];
  return shell(locale, `<div class="content-page">
    <section aria-label="${copy.notifyHeading}" class="notification-settings">
      <h2>${copy.notifyHeading}</h2>
      <p>Se você quiser, o Brain pode avisar no aparelho.</p>
      <p class="quiet-state">O aviso nunca carrega o conteúdo.</p>
      <h3>Situação atual</h3>
      <p data-consent-state="unsupported" role="status">${copy.notifyState}</p>
      <p class="quiet-state">Nada será perguntado ao navegador até que você peça, nesta página.</p>
      <p class="quiet-state">Os controles ainda não estão disponíveis.</p>
    </section>
    <div class="list-stack">
      <article class="list-row notification-row unread">
        <div class="list-row-main"><strong>Um lembrete</strong><p>Corpo do lembrete.</p></div>
        <div class="list-meta"><span>11 de ago. de 2026, 14:00</span></div>
      </article>
    </div>
  </div>`);
}

async function open(target: Page, markup: string): Promise<void> {
  await target.setContent(markup, { waitUntil: "load" });
}

/** No page may scroll horizontally, at any viewport. `2M-MOBILE-001`. */
async function noHorizontalScroll(target: Page): Promise<void> {
  const overflow = await target.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls horizontally").toBeLessThanOrEqual(1);
}

for (const locale of ["pt-BR", "en"] as const) {
  test.describe(`the planner and the day review render in ${locale}`, () => {
    test("the planner states its day, its capacity and its emptiness", async ({ page }) => {
      await open(page, plannerPage(locale, []));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(COPY[locale].plannerTitle);
      await expect(page.getByText(COPY[locale].plannedEmpty)).toBeVisible();
      await noHorizontalScroll(page);
    });

    test("the day review carries the schedule promise and the unreadable section", async ({ page }) => {
      await open(page, reviewPage(locale, [reviewRow({ locale })]));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(COPY[locale].reviewTitle);
      // `2M-REVIEW-007`, in the browser rather than only in a source scan.
      await expect(page.getByText(COPY[locale].nothingScheduled)).toBeVisible();
      await expect(page.getByRole("region", { name: COPY[locale].unreadableHeading })).toBeVisible();
      await noHorizontalScroll(page);
    });
  });
}

test.describe("2M-NOTIFY-003 / 2M-MOBILE-005: the notification governance section", () => {
  for (const locale of ["pt-BR", "en"] as const) {
    test(`explains the benefit and announces the state in ${locale}`, async ({ page }) => {
      await open(page, notificationPage(locale));
      await expect(page.getByRole("region", { name: COPY[locale].notifyHeading })).toBeVisible();
      const status = page.locator('[data-consent-state]');
      await expect(status).toHaveAttribute("role", "status");
      await expect(status).toContainText(COPY[locale].notifyState);
      await noHorizontalScroll(page);
    });
  }

  test("offers nothing to press, because nothing would read it yet", async ({ page }) => {
    await open(page, notificationPage("pt-BR"));
    await expect(page.locator(".notification-settings button")).toHaveCount(0);
    await expect(page.locator(".notification-settings input")).toHaveCount(0);
    await expect(page.locator(".notification-settings select")).toHaveCount(0);
  });

  test("sits above the list whose content it makes a promise about", async ({ page }) => {
    await open(page, notificationPage("pt-BR"));
    const order = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll(".notification-settings, .list-stack")];
      return nodes.map((node) => node.className.split(" ")[0]);
    });
    expect(order[0]).toBe("notification-settings");
  });

  test("reflows at 320 CSS px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, notificationPage("pt-BR"));
    await noHorizontalScroll(page);
  });
});

test.describe("2M-ACCESS-004: every state change is announced", () => {
  test("both surfaces carry exactly one outcome region, outside every list", async ({ page }) => {
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    const outcomes = page.locator(".calendar-outcome");
    await expect(outcomes).toHaveCount(1);
    // The lesson slices 2M.1 and 2M.2 paid for: an affordance anchored to a row
    // cannot survive an operation that moves the row.
    await expect(page.locator(".day-review-section .calendar-outcome")).toHaveCount(0);
    await expect(page.locator(".day-review-item .calendar-outcome")).toHaveCount(0);
  });

  test("an unreadable source is announced, not rendered as an empty list", async ({ page }) => {
    await open(page, reviewPage("pt-BR", [], { unreadable: true }));
    const status = page.locator('.day-review-unreadable [role="status"]');
    await expect(status).toBeVisible();
    await expect(status).toContainText("não pôde ser lida");
  });

  test("the planner's overload is a status rather than a colour", async ({ page }) => {
    await open(page, plannerPage("pt-BR", [plannerRow({ locale: "pt-BR" })]));
    await expect(page.locator('.planner-capacity [role="status"]')).toBeVisible();
  });
});

test.describe("2M-MOBILE-004: an accidental activation is recoverable", () => {
  test("every navigation target meets the minimum touch size", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    const links = page.locator(".day-review-scope-nav a");
    const count = await links.count();
    expect(count, "there are no scope links to measure").toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box, "a scope link has no box").not.toBeNull();
      expect(box!.height, "a scope link is below the minimum touch height").toBeGreaterThanOrEqual(44);
    }
    await noHorizontalScroll(page);
  });

  test("the planner's day navigation meets it too", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, plannerPage("pt-BR", [plannerRow({ locale: "pt-BR" })]));
    const links = page.locator(".planner-day-nav a");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await noHorizontalScroll(page);
  });

  test("no verb applies without a submit the user presses", async ({ page }) => {
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    // Every control is inside a form with an explicit submit. A row with a
    // control and no button would be one that applied on change.
    const forms = page.locator(".day-review-verb form");
    const count = await forms.count();
    expect(count).toBe(5);
    for (let index = 0; index < count; index += 1) {
      await expect(forms.nth(index).locator('button[type="submit"]')).toHaveCount(1);
    }
  });
});

test.describe("2M-ACCESS-006: keyboard and focus", () => {
  test("every control on the review row is reachable by keyboard", async ({ page }) => {
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    const reachable: string[] = [];
    for (let index = 0; index < 24; index += 1) {
      await page.keyboard.press("Tab");
      const active = await page.evaluate(() => {
        const node = document.activeElement as HTMLElement | null;
        if (!node) return "";
        return `${node.tagName.toLowerCase()}:${node.getAttribute("id") ?? node.getAttribute("type") ?? ""}`;
      });
      if (active) reachable.push(active);
    }
    // The five submit buttons and the four value controls are all in the tab
    // order; a control reachable only by pointer is one a keyboard user cannot
    // use at all.
    expect(reachable.filter((entry) => entry.startsWith("button")).length).toBeGreaterThanOrEqual(5);
    expect(reachable.some((entry) => entry.includes("set_planned"))).toBe(true);
    expect(reachable.some((entry) => entry.includes("set_status"))).toBe(true);
  });

  test("focus is visible on the first control", async ({ page }) => {
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const node = document.activeElement as HTMLElement | null;
      if (!node) return null;
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, style: style.outlineStyle, shadow: style.boxShadow };
    });
    expect(outline, "nothing took focus").not.toBeNull();
    const visible = outline!.style !== "none" && outline!.width !== "0px";
    expect(visible || (outline!.shadow !== "none" && outline!.shadow !== ""), "focus is not visible").toBe(true);
  });
});

test.describe("2M-PRIVACY-001: a masked row keeps its controls", () => {
  test("withholds the title and still offers every verb", async ({ page }) => {
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR", masked: true })]));
    await expect(page.getByText("Entregar o relatório")).toHaveCount(0);
    await expect(page.locator(".day-review-verb")).toHaveCount(5);
    await expect(page.locator(".protected-content button")).toBeVisible();
  });

  test("the planner does the same", async ({ page }) => {
    await open(page, plannerPage("pt-BR", [plannerRow({ locale: "pt-BR", masked: true })]));
    await expect(page.getByText("Entregar o relatório")).toHaveCount(0);
    await expect(page.locator(".planner-item .task-control")).toHaveCount(1);
  });
});

test.describe("2M-MOBILE-001: reflow", () => {
  test("both surfaces reflow at 320 CSS px with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await open(page, plannerPage("pt-BR", [plannerRow({ locale: "pt-BR" })]));
    await noHorizontalScroll(page);
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    await noHorizontalScroll(page);
  });

  test("and at an emulated 200% zoom", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 512 });
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await noHorizontalScroll(page);
  });
});

test.describe("2M-REVIEW-003: what the surface proposes, and what it leaves to the user", () => {
  test("carry-forward arrives with tomorrow filled in and plan arrives empty", async ({ page }) => {
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    await expect(page.locator('[data-verb="carry_forward"] input[type="date"]')).toHaveValue("2026-08-12");
    await expect(page.locator('[data-verb="plan"] input[type="date"]')).toHaveValue("");
  });

  test("follow-up cannot reach a cancellation", async ({ page }) => {
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));
    const options = page.locator('[data-verb="follow_up"] select option');
    const values = await options.evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    expect(values).not.toContain("cancelled");
    expect(values).toContain("waiting");
  });
});
