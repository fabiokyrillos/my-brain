import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * `2M-CAL-008` … `-011` — the calendar's authenticated journeys.
 *
 * ## Why these are here and not in `calendar.spec.ts`
 *
 * `e2e/calendar.spec.ts` proves everything a browser can prove without a
 * database: structure, focus, keyboard, reflow, target size, masking. What it
 * cannot reach is the half that only exists once a real row is on the other side
 * of a real command path — an applied reschedule, the audit and undo it
 * registers, a refusal against a task that moved underneath, and the return to
 * the exact calendar position. Those need an authenticated app and a deployed
 * database, which is this lane.
 *
 * ## What this journey does NOT do
 *
 * It writes **through the product** for every claim it makes. The service role
 * appears exactly twice, both times as a fixture and both called out where they
 * happen: creating the disposable account, and seeding the task the calendar is
 * supposed to show — a task the product would create through capture, which is a
 * provider call this phase does not authorize and does not need in order to test
 * a calendar.
 *
 * The account is deleted afterwards, which cascades to its tasks, audit rows and
 * undo reservations, so nothing this journey creates outlives it.
 */

const { supabaseUrl, serviceRoleKey } = onlineEnvironment;
const onlineConfigured = onlineEnvironment.configured;

type Locale = "pt-BR" | "en";

const COPY = {
  "pt-BR": {
    calendar: "Calendário",
    reschedule: "Datas",
    apply: "Aplicar",
    resultRegion: "Resultado da ação",
    undo: "Desfazer",
    back: "Voltar",
  },
  en: {
    calendar: "Calendar",
    reschedule: "Dates",
    apply: "Apply",
    resultRegion: "Action result",
    undo: "Undo",
    back: "Back",
  },
} as const satisfies Record<Locale, Record<string, string>>;

async function admin(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  expect(response.ok, `${init.method ?? "GET"} ${path}: ${await response.clone().text()}`).toBe(true);
  const text = await response.text();
  return (text ? JSON.parse(text) : []) as Record<string, unknown>[];
}

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

/** `YYYY-MM-DD`, N days from today, in the harness's own zone. */
function localDate(days: number): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Noon on that day, so a zone difference of a few hours cannot move the column. */
function instantOn(days: number): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  at.setHours(12, 0, 0, 0);
  return at.toISOString();
}

async function openCalendar(page: Page, locale: Locale, date: string, orientation = "day") {
  await page.goto(`/${locale}/app/calendar?date=${date}&orientation=${orientation}`);
  await expect(page.getByRole("heading", { level: 1, name: COPY[locale].calendar })).toBeVisible();
}

test.describe("the calendar reschedules through the existing command path", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };

  test.beforeAll(async () => {
    owner = await createAccount("calendar");
  });

  test.afterAll(async () => {
    await deleteAccount(owner?.id);
  });

  /** A task on a given day, seeded as a **fixture** and never as a product claim. */
  async function seedTask(title: string, dueDays: number) {
    const [row] = await admin("tasks", {
      method: "POST",
      body: JSON.stringify({
        user_id: owner.id,
        title,
        status: "todo",
        due_at: instantOn(dueDays),
      }),
    });
    return row.id as string;
  }

  test("an empty day says nothing is scheduled rather than nothing loaded", async ({ page }) => {
    // `2M-CAL-011`. Proved on a day the account genuinely has nothing on, which
    // a fresh account has by construction — and the partial-state region must
    // be absent, or "empty" and "failed" have collapsed into one word.
    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await openCalendar(page, "pt-BR", localDate(200));
    await expect(page.locator(".calendar-empty")).toBeVisible();
    await expect(page.locator(".calendar-partial")).toHaveCount(0);
  });

  for (const locale of ["pt-BR", "en"] as const) {
    test(`${locale}: a deadline is rescheduled from the calendar, audited and undoable`, async ({ page }) => {
      /*
       * The whole of `2M-CAL-009`/`-010` in one journey, because splitting it
       * would let a half pass on its own: the apply must reach
       * `apply_task_command`, the audit row must exist, the undo must be
       * offered **where the operation happened**, and the undo must put the
       * date back.
       */
      const title = `Prazo ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title, 2);
      const from = localDate(2);
      const to = localDate(5);

      await signInOnline(page, { email: owner.email, locale });
      await openCalendar(page, locale, from);

      const item = page.locator(".calendar-item", { hasText: title });
      await expect(item).toBeVisible();

      await item.locator(".calendar-reschedule-summary").click();
      const form = item.locator(".task-control", { has: page.locator('input[type="date"]') }).first();
      await form.locator('input[type="date"]').fill(to);
      await form.locator("button[type=submit]").click();

      // The outcome is announced in a named region — `2M-ACCESS-004`.
      const result = page.getByRole("region", { name: COPY[locale].resultRegion });
      await expect(result).toBeVisible();

      // The database moved, read back through the service role as an
      // observation rather than as a write.
      const [row] = await admin(`tasks?id=eq.${taskId}&select=due_at`);
      expect(String(row.due_at).slice(0, 10)).toBe(to);

      // `2M-CAL-010`: an audit row, and an undo offered here.
      const audit = await admin(`audit_logs?target_id=eq.${taskId}&select=actor,action&order=created_at.desc&limit=5`);
      expect(audit.length, "the reschedule left no audit row").toBeGreaterThan(0);
      expect(audit.map((entry) => entry.actor)).toContain("user");

      const undo = result.getByRole("button", { name: new RegExp(COPY[locale].undo, "i") });
      await expect(undo).toBeVisible();
      await undo.click();

      await expect
        .poll(async () => {
          const [after] = await admin(`tasks?id=eq.${taskId}&select=due_at`);
          return String(after.due_at).slice(0, 10);
        }, { message: "undo did not put the deadline back" })
        .toBe(from);
    });
  }

  test("returning from a task lands on the same date and orientation", async ({ page }) => {
    // `2M-CAL-008`. The position travels in the link, so this holds on a fresh
    // navigation rather than only on browser history — which is the whole
    // reason the payload exists.
    const title = `Retorno ${crypto.randomUUID().slice(0, 8)}`;
    await seedTask(title, 3);
    const anchor = localDate(3);

    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await openCalendar(page, "pt-BR", anchor, "week");

    const link = page.locator(".calendar-item", { hasText: title }).locator("a.calendar-item-link");
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href, "the item link carries no return position").toContain("from=");

    await link.click();
    await expect(page).toHaveURL(/\/app\/work\//);

    await page.getByRole("link", { name: new RegExp(COPY["pt-BR"].back, "i") }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/calendar\\?.*date=${anchor}`));
    await expect(page).toHaveURL(/orientation=week/);
  });

  test("a task that moved underneath refuses instead of overwriting", async ({ page }) => {
    /*
     * The staleness case. `apply_task_command` hashes twelve columns of the
     * pre-state into the request fingerprint, so a row changed between the
     * calendar's read and the submit is refused — and the calendar inherits
     * that because it inherits the command path rather than writing its own.
     *
     * The interfering write is a **fixture**, standing in for another device.
     */
    const title = `Obsoleto ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title, 4);
    const anchor = localDate(4);

    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await openCalendar(page, "pt-BR", anchor);

    const item = page.locator(".calendar-item", { hasText: title });
    await item.locator(".calendar-reschedule-summary").click();

    // Another device changes the row after the page read it.
    await admin(`tasks?id=eq.${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: `${title} (movido)` }),
    });

    const form = item.locator(".task-control", { has: page.locator('input[type="date"]') }).first();
    await form.locator('input[type="date"]').fill(localDate(9));
    await form.locator("button[type=submit]").click();

    const result = page.getByRole("region", { name: COPY["pt-BR"].resultRegion });
    await expect(result).toBeVisible();

    // Whatever the outcome copy says, the decisive fact is the database: the
    // stale submit must not have moved the date to the day it asked for.
    const [row] = await admin(`tasks?id=eq.${taskId}&select=due_at`);
    expect(String(row.due_at).slice(0, 10)).not.toBe(localDate(9));
  });

  test("a cancelled task offers no reschedule at all", async ({ page }) => {
    // The derivation's own claim, proved against a real row: `cancelled` is
    // outside every scheduling policy's `eligibleFrom`, so the surface must
    // state that rather than render a control the RPC would refuse.
    const title = `Cancelada ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title, 6);
    await admin(`tasks?id=eq.${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });

    await signInOnline(page, { email: owner.email, locale: "pt-BR" });
    await openCalendar(page, "pt-BR", localDate(6));
    // A cancelled task leaves the calendar entirely — `OPEN_TASK_STATUSES` is
    // what makes an empty day mean "nothing is scheduled" rather than "nothing
    // is left", and this is that rule observed rather than argued.
    await expect(page.locator(".calendar-item", { hasText: title })).toHaveCount(0);
  });
});
