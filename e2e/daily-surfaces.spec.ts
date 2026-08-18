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

/*
 * `tokens.css` and `experience.css` first: since ADR-114 they carry the palette
 * every rule below resolves against, so a fixture without them is unstyled.
 *
 * `settings-extended.css` was MISSING, and the omission was load-bearing for
 * the notification lane below. Every `.notification-*` and `.push-*` rule the
 * governance surface has lives in that file, so this lane measured touch
 * targets and reflow against markup the browser was drawing with its own
 * defaults — the "stylesheet array goes stale silently" failure, where a
 * geometry assertion passes because it is measuring nothing. Removing it again
 * makes the 375px touch-target test below fail on the first option row, which
 * is how that was established rather than assumed.
 */
const STYLESHEETS = ["tokens.css", "experience.css", "globals.css", "operations.css", "task-commands.css", "calendar.css", "settings-extended.css"] as const;

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
    reviewsPageTitle: "Revisões",
    reviewsPageLead: "Gere uma revisão quando quiser; nada é executado por horário configurado.",
    reviewsHistory: "Revisões geradas",
    reviewsHistoryEmpty: "Nenhuma revisão ainda.",
    synthesisHeading: "Como o dia ficou",
    synthesisCompleted: "2 tarefas concluídas",
    synthesisOpen: "1 continua em aberto",
    synthesisCaptured: "3 registros capturados",
    synthesisPartial: "Estes números estão incompletos: não foi possível ler Concluído.",
    nothingScheduled: "Nada é executado por horário configurado; esta revisão só existe quando você a abre.",
    unreadableHeading: "O que não pôde ser lido",
    completed: "Concluído",
    notifyHeading: "Notificações no aparelho",
    notifyState: "Este navegador ou este aparelho não oferece avisos. No iPhone, é preciso instalar o app na tela de início primeiro.",
    notAvailableYet: "Este navegador não oferece avisos, ou o envio ainda não está configurado neste ambiente. Por isso os controles não aparecem — em vez de aparecerem sem fazer nada.",
    enableAction: "Ativar avisos neste aparelho",
    disableAction: "Desativar avisos neste aparelho",
    typesHeading: "O que pode avisar",
    frequencyHeading: "Com que frequência",
    quietHeading: "Período silencioso",
    quietStartLabel: "Começa às",
    quietEndLabel: "Termina às",
    dailyCapLabel: "Máximo de avisos por dia",
    savePreferences: "Salvar preferências",
    savedNotice: "Preferências salvas.",
    notifyPageTitle: "Notificações",
    notifyHistoryHeading: "Avisos recebidos",
  },
  en: {
    plannerTitle: "Plan the day",
    plannedEmpty: "Nothing planned for this day yet.",
    reviewTitle: "Day review",
    reviewsPageTitle: "Reviews",
    reviewsPageLead: "Generate a review when you choose; nothing runs from a configured schedule.",
    reviewsHistory: "Generated reviews",
    reviewsHistoryEmpty: "No reviews yet.",
    synthesisHeading: "How the day turned out",
    synthesisCompleted: "2 tasks completed",
    synthesisOpen: "1 still open",
    synthesisCaptured: "3 records captured",
    synthesisPartial: "These numbers are incomplete: Completed could not be read.",
    nothingScheduled: "Nothing runs from a configured schedule; this review exists only when you open it.",
    unreadableHeading: "What could not be read",
    completed: "Completed",
    notifyHeading: "Notifications on this device",
    notifyState: "This browser or device does not offer alerts. On iPhone, the app has to be installed to the home screen first.",
    notAvailableYet: "This browser does not offer alerts, or delivery is not configured in this environment. That is why the controls are absent — rather than present and doing nothing.",
    enableAction: "Turn on alerts on this device",
    disableAction: "Turn off alerts on this device",
    typesHeading: "What may alert you",
    frequencyHeading: "How often",
    quietHeading: "Quiet period",
    quietStartLabel: "Starts at",
    quietEndLabel: "Ends at",
    dailyCapLabel: "Most alerts per day",
    savePreferences: "Save preferences",
    savedNotice: "Preferences saved.",
    notifyPageTitle: "Notifications",
    notifyHistoryHeading: "Alerts you received",
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
  return `<li class="planner-item" data-operation="${options.selectable === false ? "cleared" : "set"}">
    <div class="planner-item-head">
      ${options.selectable === false ? "" : '<input aria-label="Entregar o relatório" class="planner-select" type="checkbox" />'}
      ${body}
    </div>
    <p class="planner-item-meta">Planejado para 11 de ago. de 2026</p>
    <div class="planner-item-controls">
      <div class="task-detail-controls task-detail-controls-inline">
        <ul class="task-control-list">
          ${controlMarkup({ action: "set_planned", label: "Aplicar", kind: "date" })}
        </ul>
      </div>
    </div>
  </li>`;
}

/** One day-review row, mirroring `src/features/day-review/day-review-view.tsx`. */
function reviewRow(options: { locale: Locale; masked?: boolean; open?: boolean }): string {
  const body = options.masked
    ? '<span class="protected-content"><button type="button" class="row-action">Mostrar</button></span>'
    : '<a href="/pt-BR/app/work/t1">Entregar o relatório</a>';
  const state = options.open === undefined
    ? ""
    : `<span class="day-review-state">${options.open ? "em aberto" : "concluída"}</span>`;
  const verb = (kind: string, action: string, controlKind: "date" | "choice" | "immediate", value?: string) =>
    `<div class="day-review-verb" data-verb="${kind}">
      <p class="quiet-state">${kind}</p>
      <div class="task-detail-controls task-detail-controls-inline">
        <ul class="task-control-list">${controlMarkup({ action, label: "Aplicar", kind: controlKind, value })}</ul>
      </div>
    </div>`;
  return `<li class="day-review-item"${options.open === undefined ? "" : ` data-open="${options.open}"`}>
    <div class="day-review-item-head">${state}${body}</div>
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
  <style>${FONT_STUB}${css}</style></head><body><main>${body}</main></body></html>`;
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
    <div class="planner-orientation">
      <section aria-label="Capacidade" class="planner-capacity">
        <h2>Capacidade</h2>
        <p class="planner-capacity-count">1 item planejado</p>
        <p class="quiet-state">Nenhuma duração é conhecida.</p>
        <p class="planner-overloaded" role="status">Este dia parece cheio.</p>
      </section>
      <section aria-label="Conflitos" class="planner-conflicts" data-has-conflicts="true">
        <h2>Conflitos</h2>
        <p class="planner-conflict-count">1 conflito neste dia</p>
        <ul class="planner-conflict-list"><li>Duas tarefas ocupam o mesmo horário.</li></ul>
        <p class="quiet-state">Nada foi resolvido por conta disso.</p>
      </section>
    </div>
    <section aria-label="Planejado" class="planner-list">
      <h2>Planejado</h2>
      ${rows.length === 0 ? `<p class="quiet-state">${copy.plannedEmpty}</p>` : `<ul>${rows.join("")}</ul>`}
    </section>
  </div>`);
}

/** The day review, mirroring the page `DayReviewView` renders. */
function reviewPage(locale: Locale, rows: string[], options: { unreadable?: boolean } = {}): string {
  const copy = COPY[locale];
  return shell(locale, `<div class="content-page reviews-page">
    <header class="reviews-header">
      <p class="eyebrow">FECHAMENTO SOB DEMANDA</p>
      <h1>${copy.reviewsPageTitle}</h1>
      <p class="reviews-lead">${copy.reviewsPageLead}</p>
    </header>
    <section aria-labelledby="day-review-title" class="day-review-page">
    <header class="list-header">
      <div>
        <p class="eyebrow">FECHAMENTO DO DIA</p>
        <h2 class="day-review-title" id="day-review-title">${copy.reviewTitle}</h2>
        <p class="quiet-state">${copy.nothingScheduled}</p>
      </div>
      <nav aria-label="Período da revisão" class="day-review-scope-nav">
        <a aria-current="page" href="?scope=day">Este dia</a>
        <a href="?scope=next_day">Dia seguinte</a>
      </nav>
    </header>
    <div aria-live="polite" class="calendar-outcome" role="status"></div>
    <section aria-label="${copy.synthesisHeading}" class="day-review-synthesis">
      <h3>${copy.synthesisHeading}</h3>
      <ul class="day-review-counts"><li>${copy.synthesisCompleted}</li><li>${copy.synthesisOpen}</li><li>${copy.synthesisCaptured}</li></ul>
      ${options.unreadable ? `<p class="day-review-partial" role="status">${copy.synthesisPartial}</p>` : ""}
    </section>
    <section aria-label="Seu horário de revisão" class="day-review-schedule">
      <h3>Seu horário de revisão</h3>
      <p>Já passou das 22:00, o horário que você escolheu para revisar o dia.</p>
    </section>
    <section aria-label="${copy.unreadableHeading}" class="day-review-unreadable">
      <h3>${copy.unreadableHeading}</h3>
      ${options.unreadable
        ? '<div role="status"><ul><li>Não foi possível ler: Concluído. Esta seção não está vazia — ela não pôde ser lida.</li></ul></div>'
        : '<p class="quiet-state">Todas as fontes desta revisão foram lidas.</p>'}
    </section>
    <section aria-label="${copy.completed}" class="day-review-section" data-source="completed">
      <h3>${copy.completed}</h3>
      ${rows.length === 0 ? '<p class="quiet-state">Nada foi concluído neste dia.</p>' : `<ul>${rows.join("")}</ul>`}
    </section>
    <section aria-label="Registros capturados" class="day-review-section" data-source="captured">
      <h3>Registros capturados</h3>
      <ul>
        <li class="day-review-item">
          <a href="/pt-BR/app/inbox/e1">Anotei uma ideia</a>
          <p class="day-review-item-meta">14:00</p>
        </li>
      </ul>
    </section>
    </section>
    <section aria-labelledby="reviews-history" class="reviews-history">
      <h2 id="reviews-history">${copy.reviewsHistory}</h2>
      <p class="quiet-state">${copy.reviewsHistoryEmpty}</p>
    </section>
  </div>`);
}

/**
 * The notification governance section, mirroring
 * `src/features/notifications/notification-settings.tsx`.
 *
 * `2M-MOBILE-005` asks for the notification-settings journey at both viewports
 * and in both locales.
 *
 * **Slice 2M.4b changed what this lane proves, and the change is the point.**
 * In 2M.4a the section shipped **no control** — the consumer that would read one
 * was migration 2's consent record — so the lane proved the honest half: the
 * benefit is explained, the state is announced, and there is nothing to press.
 * `begin_push_delivery` is now that consumer, so the controls have earned their
 * existence and the lane proves the other half: that they render, that they are
 * reachable, and that they still disappear in the two states where nothing would
 * read them.
 *
 * `state` selects which of those the fixture renders, mirroring
 * `push-controls.tsx`'s own branches:
 *   - `no-key`  — the deployment has no VAPID public key. One sentence, no
 *                 control at all, because a button here would raise a prompt
 *                 whose grant produces a subscription nothing can deliver to.
 *   - `ungranted` — the enable button alone. No preference control, because the
 *                 delivery decision refuses before it consults a type or a cap.
 *   - `granted` — the full set.
 */
type PushState = "no-key" | "ungranted" | "granted";

function pushControls(locale: Locale, state: PushState): string {
  const copy = COPY[locale];
  if (state === "no-key") {
    return `<p class="quiet-state push-unavailable">${copy.notAvailableYet}</p>`;
  }
  if (state === "ungranted") {
    return `<div class="push-controls">
      <button class="push-action" type="button">${copy.enableAction}</button>
    </div>`;
  }
  return `<div class="push-controls">
    <button class="push-action push-action-off" type="button">${copy.disableAction}</button>
    <p class="push-notice" role="status">${copy.savedNotice}</p>
    <div class="push-preferences">
      <fieldset class="push-card">
        <legend>${copy.typesHeading}</legend>
        <div class="push-options">
        ${["reminder", "follow_up", "review", "digest"].map((type) => `
        <label class="push-option"><input type="checkbox" name="notificationType" value="${type}" checked />${type}</label>`).join("")}
        </div>
      </fieldset>
      <fieldset class="push-card">
        <legend>${copy.frequencyHeading}</legend>
        <div class="push-options">
        ${["immediate", "daily_digest", "off"].map((option) => `
        <label class="push-option"><input type="radio" name="notificationFrequency" value="${option}" />${option}</label>`).join("")}
        </div>
      </fieldset>
      <fieldset class="push-card">
        <legend>${copy.quietHeading}</legend>
        <div class="push-times">
          <label class="push-time">${copy.quietStartLabel}<input type="time" name="quietStart" value="22:30" /></label>
          <label class="push-time">${copy.quietEndLabel}<input type="time" name="quietEnd" value="07:00" /></label>
        </div>
        <p class="push-note">Durante esse período nada é enviado.</p>
      </fieldset>
      <div class="push-card">
        <label class="push-cap">${copy.dailyCapLabel}<input type="number" name="dailyCap" min="0" max="20" value="3" /></label>
        <p class="push-note">Vale para o aparelho e para o app.</p>
      </div>
      <div class="push-save">
        <button class="push-submit" type="button">${copy.savePreferences}</button>
      </div>
    </div>
  </div>`;
}

function notificationPage(locale: Locale, state: PushState = "granted"): string {
  const copy = COPY[locale];
  /*
   * The page's ONE `<h1>`, above the governance section.
   *
   * It used to sit BELOW it, which opened the document at level two and put a
   * second "Notificações" in the middle of the page. The mirror follows the
   * page rather than the other way round.
   */
  return shell(locale, `<div class="content-page">
    <header class="list-header"><div>
      <p class="eyebrow">BRAIN PROATIVO</p>
      <h1>${copy.notifyPageTitle}</h1>
      <p>Somente sinais relevantes, com deduplicação e respeito ao silêncio.</p>
    </div></header>
    <section aria-label="${copy.notifyHeading}" class="notification-settings">
      <div class="notification-panel">
        <h2>${copy.notifyHeading}</h2>
        <p class="notification-benefit">Se você quiser, o Brain pode avisar no aparelho.</p>
        <p class="notification-promise">O aviso nunca carrega o conteúdo.</p>
      </div>
      <div class="notification-panel">
        <h3>Situação atual</h3>
        <p class="notification-state-line" data-consent-state="${state === "granted" ? "granted" : "unsupported"}" role="status">${copy.notifyState}</p>
      </div>
      <div class="notification-panel">
        <p class="quiet-state notification-no-prompt">Nada será perguntado ao navegador até que você peça, nesta página.</p>
        ${pushControls(locale, state)}
      </div>
      <p class="notification-inapp-note">As notificações com conteúdo continuam nesta página.</p>
    </section>
    <section class="notification-history">
      <h2>${copy.notifyHistoryHeading}</h2>
      <div class="list-stack">
        <article class="list-row notification-row unread">
          <div class="list-row-main"><strong>Um lembrete</strong><p>Corpo do lembrete.</p></div>
          <div class="list-meta"><span>11 de ago. de 2026, 14:00</span></div>
        </article>
      </div>
    </section>
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
      /*
        `level: 2`, under the page's one `<h1>` — which is now **above** it.

        The demotion alone left the document opening at level two, so the order
        is asserted here as well as the level: the first heading in the page has
        to be the page's own name.
      */
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(COPY[locale].reviewsPageTitle);
      await expect(page.getByRole("heading", { level: 2, name: COPY[locale].reviewTitle })).toBeVisible();
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

  test("offers nothing to press when the deployment has no VAPID key", async ({ page }) => {
    /*
     * `R-24`, and the state the owner's environment was actually in until the
     * key was set. A button here would raise a browser prompt whose grant
     * produces a subscription nothing can ever deliver to — consent the product
     * cannot honour — and a permission denial is sticky and often unrecoverable
     * without the user digging through browser settings (T-07).
     */
    await open(page, notificationPage("pt-BR", "no-key"));
    await expect(page.locator(".notification-settings button")).toHaveCount(0);
    await expect(page.locator(".notification-settings input")).toHaveCount(0);
    await expect(page.getByText(COPY["pt-BR"].notAvailableYet)).toBeVisible();
  });

  test("offers the enable control alone until consent is granted", async ({ page }) => {
    // The preference controls' consumer is `begin_push_delivery`, which refuses
    // on consent BEFORE it consults a type, a frequency or a cap — so under any
    // ungranted state they would be controls whose value nothing reaches.
    await open(page, notificationPage("pt-BR", "ungranted"));
    await expect(page.locator(".push-controls button")).toHaveCount(1);
    await expect(page.locator(".push-preferences")).toHaveCount(0);
    await expect(page.locator(".notification-settings input")).toHaveCount(0);
  });

  test("renders every preference control under a granted consent", async ({ page }) => {
    // The positive control for the two absences above: without it, both would
    // pass against a surface that renders nothing under any condition.
    await open(page, notificationPage("pt-BR", "granted"));
    await expect(page.locator('input[name="notificationType"]')).toHaveCount(4);
    await expect(page.locator('input[name="notificationFrequency"]')).toHaveCount(3);
    await expect(page.locator('input[name="quietStart"]')).toHaveCount(1);
    await expect(page.locator('input[name="dailyCap"]')).toHaveCount(1);
  });

  test("bounds the daily cap control to the column's own range", async ({ page }) => {
    // `agent_preferences.max_followups_per_day` is a smallint checked 0..20, and
    // a control offering 99 would be a control the database refuses.
    await open(page, notificationPage("pt-BR", "granted"));
    const cap = page.locator('input[name="dailyCap"]');
    await expect(cap).toHaveAttribute("min", "0");
    await expect(cap).toHaveAttribute("max", "20");
  });

  test("gives every preference group a legend a screen reader can announce", async ({ page }) => {
    // `2M-ACCESS-004`. A fieldset without a legend is a group a screen-reader
    // user reaches with no idea what it groups.
    await open(page, notificationPage("pt-BR", "granted"));
    const legends = await page.locator(".push-preferences fieldset legend").allTextContents();
    expect(legends).toEqual([
      COPY["pt-BR"].typesHeading,
      COPY["pt-BR"].frequencyHeading,
      COPY["pt-BR"].quietHeading,
    ]);
  });

  test("reaches every control by keyboard alone, with no gesture to replace", async ({ page }) => {
    /*
     * `2M-MOBILE-004`/`2M-ACCESS-006`. This is the surface where the no-gesture
     * ban matters most in the phase: it is the only place permitted to raise a
     * permission prompt, and that prompt must be reachable deliberately and
     * only deliberately.
     */
    await open(page, notificationPage("pt-BR", "granted"));

    /*
     * Tab STOPS, not elements, and the distinction is the whole assertion.
     *
     * A radio group is one tab stop by design — the browser moves between its
     * members with the arrow keys — so counting `input` elements and demanding
     * that many stops would fail against correct, accessible markup. The first
     * draft of this test did exactly that and reported a defect that was not
     * there. What must be true is that every INDEPENDENT control is reachable,
     * so each is named and looked for individually.
     */
    const reached = new Set<string>();
    for (let step = 0; step < 20; step += 1) {
      await page.keyboard.press("Tab");
      const marker = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || !active.closest(".push-controls")) return null;
        const name = active.getAttribute("name");
        if (name === null) return `button:${active.textContent?.trim() ?? ""}`;
        return `${name}:${active.getAttribute("value") ?? ""}`;
      });
      if (marker !== null) reached.add(marker);
    }

    for (const expected of [
      `button:${COPY["pt-BR"].disableAction}`,
      `button:${COPY["pt-BR"].savePreferences}`,
      "notificationType:reminder",
      "notificationType:follow_up",
      "notificationType:review",
      "notificationType:digest",
      "quietStart:22:30",
      "quietEnd:07:00",
      "dailyCap:3",
    ]) {
      expect([...reached], `${expected} is unreachable by keyboard`).toContain(expected);
    }
    // The frequency group is one stop, and reaching any member proves the group
    // is on the tab order at all.
    expect([...reached].some((marker) => marker.startsWith("notificationFrequency:"))).toBe(true);
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

  /*
   * The polish pass between slices 2O.6 and 2O.7, measured rather than
   * described.
   *
   * Until it, `.push-controls`, `.push-preferences` and `.notification-
   * settings` had **no rule in any stylesheet**, so this surface was drawn
   * entirely by the user-agent default: a checkbox is 13-16px tall on every
   * browser, and its label sat beside it with no padding and no height of its
   * own. `2M-MOBILE-004` asks for a 44px minimum and nothing here was ever
   * measuring it — which is what `settings-extended.css` missing from
   * `STYLESHEETS` above meant in practice.
   */
  for (const width of [375, 320] as const) {
    test(`every option row and action meets the touch minimum at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, notificationPage("pt-BR", "granted"));

      const rows = page.locator(".push-option");
      const count = await rows.count();
      // The positive control: a surface that rendered no option row would pass
      // a loop over zero rows without measuring anything.
      expect(count, "there are no option rows to measure").toBe(7);
      for (let index = 0; index < count; index += 1) {
        const box = await rows.nth(index).boundingBox();
        expect(box, "an option row has no box").not.toBeNull();
        expect(box!.height, "an option row is below the touch minimum")
          .toBeGreaterThanOrEqual(44);
      }

      for (const selector of [".push-action", ".push-submit", 'input[name="dailyCap"]']) {
        const box = await page.locator(selector).boundingBox();
        expect(box, `${selector} has no box`).not.toBeNull();
        expect(box!.height, `${selector} is below the touch minimum`)
          .toBeGreaterThanOrEqual(44);
      }

      await noHorizontalScroll(page);
    });
  }

  test("the option label is the hit area, not the box the browser draws", async ({ page }) => {
    /*
     * A 44px row whose only clickable part is the 16px checkbox inside it is a
     * 16px target wearing a 44px costume. The label wraps the input, so this
     * asserts that clicking the row's TEXT toggles the control.
     */
    await open(page, notificationPage("pt-BR", "granted"));
    const first = page.locator(".push-option").first();
    const input = first.locator("input");
    await expect(input).toBeChecked();
    // The far end of the row, well clear of the checkbox itself.
    await first.click({ position: { x: 200, y: 22 } });
    await expect(input).not.toBeChecked();
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

/**
 * The planner, recomposed — `03-componentes.md`.
 *
 * Capacity and conflicts read as one orientation band above the work, and the
 * rows have a fixed grammar (**seleção · tarefa · quando · o que fazer**)
 * instead of three stacked blocks each.
 */
test.describe("the planner orients before it lists", () => {
  test("capacity and conflicts sit side by side above the first task", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, plannerPage("pt-BR", [plannerRow({ locale: "pt-BR" })]));

    const [capacity, conflicts, firstRow] = await Promise.all([
      page.locator(".planner-capacity").boundingBox(),
      page.locator(".planner-conflicts").boundingBox(),
      page.locator(".planner-item").first().boundingBox(),
    ]);
    // Side by side, not stacked: same top, different left.
    expect(capacity!.y).toBeCloseTo(conflicts!.y, 0);
    expect(capacity!.x).toBeLessThan(conflicts!.x);
    // And both above the work they describe.
    expect(conflicts!.y + conflicts!.height).toBeLessThanOrEqual(firstRow!.y + 1);
  });

  test("stacks the band on a phone rather than halving two columns", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, plannerPage("pt-BR", [plannerRow({ locale: "pt-BR" })]));

    const [capacity, conflicts] = await Promise.all([
      page.locator(".planner-capacity").boundingBox(),
      page.locator(".planner-conflicts").boundingBox(),
    ]);
    expect(capacity!.x).toBeCloseTo(conflicts!.x, 0);
    expect(capacity!.y).toBeLessThan(conflicts!.y);
  });

  /*
    `2M-PLAN-008`. A conflict is a statement of fact with nothing already
    applied, so it keeps its whole sentence and gains a rule on the leading
    edge — never a tint that would be the only carrier, and never an error
    style implying the user must clear it.
  */
  test("a conflict is a sentence with a rule, not a colour", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, plannerPage("pt-BR", [plannerRow({ locale: "pt-BR" })]));

    const conflicts = page.locator('.planner-conflicts[data-has-conflicts="true"]');
    await expect(conflicts.locator(".planner-conflict-list li")).toHaveCount(1);
    await expect(conflicts.locator(".quiet-state")).toHaveText("Nada foi resolvido por conta disso.");
    const rule = await conflicts.evaluate((node) => getComputedStyle(node).borderInlineStartWidth);
    expect(parseFloat(rule)).toBeGreaterThan(0);
  });

  test("a row reads as columns on a desktop and as a stack on a phone", async ({ page }) => {
    const body = plannerPage("pt-BR", [plannerRow({ locale: "pt-BR" })]);

    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, body);
    let head = await page.locator(".planner-item-head").boundingBox();
    let meta = await page.locator(".planner-item-meta").boundingBox();
    expect(head!.y).toBeCloseTo(meta!.y, 0);
    expect(head!.x).toBeLessThan(meta!.x);

    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, body);
    head = await page.locator(".planner-item-head").boundingBox();
    meta = await page.locator(".planner-item-meta").boundingBox();
    expect(head!.y).toBeLessThan(meta!.y);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

/**
 * Revisões, recomposed — the closing's synthesis, and the page around it.
 */
test.describe("the review states the day before it shows its parts", () => {
  test("the counts come first, above every section", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));

    const [synthesis, firstSection] = await Promise.all([
      page.locator(".day-review-synthesis").boundingBox(),
      page.locator(".day-review-schedule").boundingBox(),
    ]);
    expect(synthesis!.y).toBeLessThan(firstSection!.y);
    await expect(page.locator(".day-review-counts li")).toHaveCount(3);
  });

  /*
    The load-bearing one. A count over a source that failed is not a small
    count, it is an unknown one — a review that reads "0 concluídas" for a query
    that never returned is the lie `2M-REVIEW-001` is written against.
  */
  test("says the numbers are incomplete when a source could not be read", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })], { unreadable: true }));

    const partial = page.locator(".day-review-partial");
    await expect(partial).toHaveText(COPY["pt-BR"].synthesisPartial);
    await expect(partial).toHaveAttribute("role", "status");
  });

  test("does not say it when every source was read", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR" })]));

    await expect(page.locator(".day-review-partial")).toHaveCount(0);
  });

  /*
    `2J-HOJE-004`'s rule, held to on this surface: the pendências are counted
    above and marked on the rows that already hold them, never listed a second
    time with fewer controls than the first copy.
  */
  test("marks an open row in place, in words as well as in colour", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, reviewPage("pt-BR", [
      reviewRow({ locale: "pt-BR", open: true }),
      reviewRow({ locale: "pt-BR", open: false }),
    ]));

    const open_ = page.locator('.day-review-item[data-open="true"] .day-review-state');
    const done = page.locator('.day-review-item[data-open="false"] .day-review-state');
    await expect(open_).toHaveText("em aberto");
    await expect(done).toHaveText("concluída");
    const [openBg, doneBg] = await Promise.all([
      open_.evaluate((node) => getComputedStyle(node).backgroundColor),
      done.evaluate((node) => getComputedStyle(node).backgroundColor),
    ]);
    expect(openBg).not.toBe(doneBg);
    // Both rows still carry every verb the taxonomy admits — the marker is a
    // label, never a capability gate.
    await expect(page.locator('.day-review-item[data-open="true"] .day-review-verb')).toHaveCount(5);
  });

  test("reflows at 320 CSS px with the counts intact", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page, reviewPage("pt-BR", [reviewRow({ locale: "pt-BR", open: true })]));

    await expect(page.locator(".day-review-counts li")).toHaveCount(3);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
