import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * `2P-CALENDAR-001` and `2P-REMINDER-001` … `-004` — the planning surfaces, in
 * an authenticated browser.
 *
 * ## What only this lane can prove
 *
 * `e2e/calendar.spec.ts` proves the month's structure, its two presentations and
 * the CSS that chooses between them, over a mirrored DOM and the real
 * stylesheets. What it cannot reach is the half that only exists once a real row
 * is on the other side of a real Server Action: that the month renders the
 * owner's own items, that navigation by month lands where it says it does, that
 * creating a reminder writes one row at the instant the owner chose **in their
 * own timezone**, that cancelling writes nothing at all, and that the dialog
 * does not freeze on its own transition — the defect slice 2P.6 found in a
 * browser and nowhere below one.
 *
 * ## Every claim is written through the product
 *
 * The service role appears exactly once, as a fixture: creating and deleting the
 * disposable account. Every reminder this journey asserts on is created by
 * pressing the product's own controls, which is the point — a row inserted by
 * the harness would prove the list renders and nothing about the writer.
 *
 * The account is deleted afterwards, so nothing outlives the run.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

type Locale = "pt-BR" | "en";

/** The words, taken from the modules that own them rather than guessed. */
const COPY = {
  "pt-BR": {
    calendar: "Calendário",
    month: "Mês",
    day: "Dia",
    reminders: "Lembretes",
    open: "Novo lembrete",
    content: "O que lembrar",
    when: "Quando avisar",
    important: "Marcar como importante",
    link: "Vincular a uma tarefa (opcional)",
    save: "Criar lembrete",
    cancel: "Cancelar",
    created: "Lembrete criado.",
    monthList: "Dias com itens neste mês",
  },
  en: {
    calendar: "Calendar",
    month: "Month",
    day: "Day",
    reminders: "Reminders",
    open: "New reminder",
    content: "What to remember",
    when: "When to tell you",
    important: "Mark as important",
    link: "Link to a task (optional)",
    save: "Create reminder",
    cancel: "Cancel",
    created: "Reminder created.",
    monthList: "Days with items this month",
  },
} as const;

async function createAccount(prefix: string) {
  const email = `codex-${prefix}-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  expect(response.ok, await response.clone().text()).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, id };
}

async function deleteAccount(userId: string | undefined) {
  if (!userId) return;
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
  });
}

/** `YYYY-MM-DD` for the first of this month, in the harness's own zone. */
function firstOfThisMonth(): string {
  const at = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-01`;
}

/** A `datetime-local` value a few days out, so it is unambiguously future. */
function futureLocal(days: number): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  at.setHours(9, 30, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
    + `T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

async function openMonth(page: Page, locale: Locale, date = firstOfThisMonth()) {
  await page.goto(`/${locale}/app/calendar?date=${date}&orientation=month`);
  await expect(page.getByRole("heading", { level: 1, name: COPY[locale].calendar })).toBeVisible();
}

test.describe("the calendar has a real month", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };

  test.beforeAll(async () => {
    owner = await createAccount("planning-month");
  });

  test.afterAll(async () => {
    await deleteAccount(owner?.id);
  });

  test("offers Mês beside Dia and Semana, and selecting it changes the URL", async ({ page }) => {
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/calendar");
    // The default is still the narrowest orientation, which `2M-CAL-005`
    // requires and the month must not have quietly widened.
    await expect(page.locator('.calendar-orientation a[aria-current="true"]'))
      .toHaveText(COPY["pt-BR"].day);

    await page.locator(".calendar-orientation").getByRole("link", { name: COPY["pt-BR"].month }).click();

    /*
     * The assertion is that **the month is the selected period**, not that a
     * grid is on screen — and the distinction is the requirement's own.
     *
     * `2P-CALENDAR-001` permits a different presentation on a phone *"while the
     * real month stays the selected period"*, and this spec runs in both the
     * desktop and the Pixel 7 project. Asserting the grid was visible passed on
     * one and failed on the other while the product was behaving exactly as
     * signed; what must hold at every width is the URL, the selected control and
     * the label naming a month.
     */
    await expect(page).toHaveURL(/orientation=month/);
    await expect(page.locator('.calendar-orientation a[aria-current="true"]'))
      .toHaveText(COPY["pt-BR"].month);
    await expect(page.locator(".calendar-range")).not.toHaveText("");
    // Exactly one of the two presentations is live, whichever width this is.
    const grid = await page.locator(".calendar-month-scroll").isVisible();
    const list = await page.locator(".calendar-month-list").isVisible();
    expect(grid !== list, "exactly one month presentation must be live").toBe(true);
  });

  test("renders a whole month of whole weeks, with the neighbours marked", async ({ page }) => {
    // The grid is the wide-viewport presentation, so this states its width
    // rather than inheriting the project's. The phone's presentation is asserted
    // by its own test, which is where that claim belongs.
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await openMonth(page, "pt-BR");

    await expect(page.locator(".calendar-month thead th")).toHaveCount(7);
    const cells = await page.locator(".calendar-month tbody td").count();
    expect(cells % 7).toBe(0);
    expect([28, 35, 42]).toContain(cells);

    // Today is in this month and is marked by a word, not only by a tint.
    const today = page.locator('.calendar-month td[data-today="true"]');
    await expect(today).toHaveCount(1);
    await expect(today.locator(".calendar-today")).toBeVisible();
  });

  test("steps by whole months, and the label names the month rather than two edges", async ({ page }) => {
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await openMonth(page, "pt-BR");
    const before = await page.locator(".calendar-range").textContent();

    await page.locator('.calendar-navigation a[rel="next"]').click();
    await expect(page.locator(".calendar-range")).not.toHaveText(before ?? "");
    // A month label is one month's name, so it carries no en dash between two
    // dates the way every other orientation's does.
    expect(await page.locator(".calendar-range").textContent()).not.toContain("–");
  });

  test("opens a day from its number, keeping the lanes that were selected", async ({ page }) => {
    // The day number is a cell control, so it exists only where the grid does.
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await page.goto(`/pt-BR/app/calendar?date=${firstOfThisMonth()}&orientation=month&lanes=deadline,reminder`);
    await page.locator(".calendar-month-daynumber").first().click();

    await expect(page).toHaveURL(/lanes=deadline%2Creminder/);
    // The day view is the declared default, so it is omitted rather than spelled.
    await expect(page).not.toHaveURL(/orientation=/);
  });

  test("emits no calendar_viewed for the month, because the deployed enum admits three", async ({ page }) => {
    /*
     * `2P-CALENDAR-MONTH-TELEMETRY`. Asserted at the network boundary rather
     * than in the database, because `product_events` is not readable by the
     * service role and a global count would prove nothing about one owner.
     *
     * The control is the other half: the same page in `week` DOES emit, so a
     * run where telemetry was broken entirely would fail here rather than pass
     * by silence.
     */
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });

    const events: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        const body = request.postData() ?? "";
        if (body.includes("calendar_viewed")) events.push(body);
      }
      await route.continue();
    });

    await openMonth(page, "pt-BR");
    await page.waitForTimeout(2_000);
    expect(events, "the month must not emit an event the deployed validator refuses").toHaveLength(0);

    await page.goto(`/pt-BR/app/calendar?date=${firstOfThisMonth()}&orientation=week`);
    await expect(page.locator(".calendar-week")).toBeVisible();
    await expect.poll(() => events.length, { timeout: 15_000 }).toBeGreaterThan(0);
  });
});

test.describe("a reminder is created through a dialog", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };

  test.beforeAll(async () => {
    owner = await createAccount("planning-reminder");
  });

  test.afterAll(async () => {
    await deleteAccount(owner?.id);
  });

  test("the header offers one action, and the page carries no inline form", async ({ page }) => {
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");
    await expect(page.getByRole("heading", { level: 1, name: COPY["pt-BR"].reminders })).toBeVisible();

    await expect(page.getByRole("button", { name: COPY["pt-BR"].open })).toBeVisible();
    // `2P-REMINDER-001`: no creation field is on the page until it is asked for.
    await expect(page.getByLabel(COPY["pt-BR"].content)).toHaveCount(0);
    await expect(page.locator(".stacked-create")).toHaveCount(0);
  });

  test("cancelling writes nothing and puts focus back", async ({ page }) => {
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const opener = page.getByRole("button", { name: COPY["pt-BR"].open });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(COPY["pt-BR"].content).fill("Não deve ser salvo");
    await dialog.getByRole("button", { name: COPY["pt-BR"].cancel }).click();

    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    // Nothing was written: the list is still empty and no result was announced.
    await expect(page.getByText("Não deve ser salvo")).toHaveCount(0);
    await expect(page.getByText(COPY["pt-BR"].created)).toHaveCount(0);
  });

  test("Escape closes it too, and still writes nothing", async ({ page }) => {
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");
    const opener = page.getByRole("button", { name: COPY["pt-BR"].open });
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.getByText(COPY["pt-BR"].created)).toHaveCount(0);
  });

  test("keeps focus inside the dialog while it is open", async ({ page }) => {
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");
    await page.getByRole("button", { name: COPY["pt-BR"].open }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Initial focus is inside, and twelve tabs cannot escape it.
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    for (let press = 0; press < 12; press += 1) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  });

  test("saves one reminder at the chosen instant, then closes without freezing", async ({ page }) => {
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const title = `Ligar para a clínica ${crypto.randomUUID().slice(0, 8)}`;
    await page.getByRole("button", { name: COPY["pt-BR"].open }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(COPY["pt-BR"].content).fill(title);
    const when = futureLocal(3);
    await dialog.getByLabel(COPY["pt-BR"].when).fill(when);
    await dialog.getByRole("button", { name: COPY["pt-BR"].save }).click();

    /*
     * The 2P.6 defect, asserted where it lives: a dialog closed from an effect
     * while its own transition is still applying never lowers `pending` and
     * freezes on the saving word. This passes only if the dialog actually goes
     * away — a frozen one stays visible forever.
     */
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await expect(page.getByText(COPY["pt-BR"].created)).toBeVisible();

    const row = page.locator(".reminder-row").filter({ hasText: title });
    await expect(row).toHaveCount(1);

    /*
     * The instant, read back from the row and compared against the wall clock
     * that was typed. This is the assertion the old writer would have failed:
     * it resolved the value in the host's zone, so a 09:30 reminder was stored
     * three hours early and rendered as 06:30 to its owner.
     */
    const schedule = await row.locator(".reminder-schedule").textContent();
    expect(schedule).toContain("09:30");
  });

  test("shows the same month and dialog on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });

    // The month: the readable list is what a phone gets, and the grid is gone
    // from the page rather than scrolled off it.
    await openMonth(page, "pt-BR");
    await expect(page.getByText(COPY["pt-BR"].monthList)).toBeVisible();
    await expect(page.locator(".calendar-month-scroll")).toBeHidden();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // The dialog: reachable, operable and dismissible at 375px.
    await page.goto("/pt-BR/app/reminders");
    const opener = page.getByRole("button", { name: COPY["pt-BR"].open });
    const box = await opener.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(COPY["pt-BR"].content)).toBeVisible();
    await expect(dialog.getByLabel(COPY["pt-BR"].link)).toBeVisible();
    await dialog.getByRole("button", { name: COPY["pt-BR"].cancel }).click();
    await expect(dialog).toBeHidden();
  });

  /**
   * Another owner's task is not offered, and is refused if submitted anyway.
   *
   * Two halves, because they fail differently. The **picker** is owner-scoped in
   * its own query, so a foreign task never becomes an option — that is the half
   * a reader can see. The **action** re-checks the submitted id against the
   * caller's own rows, which is the half that matters: a `<select>`'s value is
   * caller-supplied data whatever rendered the form, and the foreign key alone
   * would happily accept a task that exists and belongs to somebody else.
   *
   * The refusal is a localized sentence rather than a silent unlinked reminder,
   * so the owner is told the link did not happen instead of discovering it
   * later.
   */
  test("does not offer another owner's task, and refuses one that is submitted anyway", async ({ page }) => {
    const stranger = await createAccount("planning-stranger");
    // The one service-role write in this file beyond account creation: a task
    // for the OTHER account, which the product under test must never surface.
    const seeded = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: stranger.id,
        title: "Tarefa de outra pessoa",
        status: "todo",
      }),
    });
    expect(seeded.ok, await seeded.clone().text()).toBe(true);
    const [foreign] = (await seeded.json()) as { id: string }[];

    try {
      await signInOnline(page, { email: owner.email, locale: "pt-BR" });
      await page.goto("/pt-BR/app/reminders");
      await page.getByRole("button", { name: COPY["pt-BR"].open }).click();
      const dialog = page.getByRole("dialog");
      const select = dialog.getByLabel(COPY["pt-BR"].link);

      // Not offered, and not merely masked: the title is absent from the page
      // and so is the id.
      await expect(select.getByRole("option", { name: /Tarefa de outra pessoa/ })).toHaveCount(0);
      expect(await select.innerHTML()).not.toContain(foreign.id);
      await expect(page.getByText("Tarefa de outra pessoa")).toHaveCount(0);

      // Submitted anyway, by planting the option the product refused to render.
      await select.evaluate((node, id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = "planted";
        (node as HTMLSelectElement).append(option);
        (node as HTMLSelectElement).value = id;
      }, foreign.id);
      await dialog.getByLabel(COPY["pt-BR"].content).fill("Deve ser recusado");
      await dialog.getByLabel(COPY["pt-BR"].when).fill(futureLocal(2));
      await dialog.getByRole("button", { name: COPY["pt-BR"].save }).click();

      // Refused, said so, and nothing written.
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/Essa tarefa não está disponível/)).toBeVisible();
      await dialog.getByRole("button", { name: COPY["pt-BR"].cancel }).click();
      await expect(page.locator(".reminder-row").filter({ hasText: "Deve ser recusado" }))
        .toHaveCount(0);
    } finally {
      await deleteAccount(stranger.id);
    }
  });

  test("renders the dialog in English too", async ({ page }) => {
    await signInOnline(page, { email: owner.email, locale: "en" });
    await page.goto("/en/app/reminders");
    await page.getByRole("button", { name: COPY.en.open }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(COPY.en.content)).toBeVisible();
    await expect(dialog.getByLabel(COPY.en.when)).toBeVisible();
    await expect(dialog.getByLabel(COPY.en.important)).toBeVisible();
    await expect(dialog.getByLabel(COPY.en.link)).toBeVisible();
    await expect(dialog.getByRole("button", { name: COPY.en.save })).toBeVisible();
  });
});
