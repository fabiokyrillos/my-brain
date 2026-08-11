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

/**
 * The words this journey looks for, taken from the modules that own them.
 *
 * Two were wrong on the first run and both were wrong the same way — copied
 * from the surface *next door* rather than from the one under test.
 * `resultRegion` was `taskDetailControlsCopy.resultRegionLabel`
 * ("Resultado da alteração"), not the Work list's "Resultado da ação"; `back`
 * is `taskDetailCopy`'s, which names its destination rather than the gesture,
 * so it is never the word "Voltar". *A journey that guesses at copy tests the
 * guess.*
 */
const COPY = {
  "pt-BR": {
    calendar: "Calendário",
    reschedule: "Datas",
    apply: "Aplicar",
    resultRegion: "Resultado da alteração",
    undo: "Desfazer",
    back: "Calendário",
  },
  en: {
    calendar: "Calendar",
    reschedule: "Dates",
    apply: "Apply",
    resultRegion: "Change result",
    undo: "Undo",
    back: "Calendar",
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

/**
 * The item **in a named lane**, because a title is not unique across lanes.
 *
 * Seeding a task with a `due_at` fires `tasks_create_due_reminder`
 * (`202607160007`), which inserts a reminder one hour earlier carrying the same
 * title. That is the product working: the day genuinely holds two commitments,
 * a reminder at 11:00 and the deadline at noon, and the calendar shows both.
 * The first run of this file matched `.calendar-item` by text alone and failed
 * on a strict-mode violation against two correct elements — *a locator that
 * ignores the dimension the surface is organized by will find the surface
 * working and call it broken.*
 */
function laneItem(page: Page, lane: "deadline" | "reminder", title: string) {
  return page.locator(`.calendar-item[data-lane="${lane}"]`, { hasText: title });
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

  /**
   * The zone the **product** decides local days in, read rather than assumed.
   *
   * `calendar-projection.ts` takes it from `profiles.timezone`, so that is where
   * this takes it from too. Hard-coding the runner's zone would make the
   * journey pass or fail on where it happened to be run from, which is the
   * opposite of what a date test should depend on.
   */
  async function accountTimeZone(): Promise<string> {
    const [row] = await admin(`profiles?user_id=eq.${owner.id}&select=timezone`);
    const zone = row?.timezone;
    expect(typeof zone, "the account has no profile time zone to compare against").toBe("string");
    return zone as string;
  }

  /** The stored deadline as the *user* sees its day: `YYYY-MM-DD` in their zone. */
  async function localDayOfDueAt(taskId: string, timeZone: string): Promise<string> {
    const [row] = await admin(`tasks?id=eq.${taskId}&select=due_at`);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(String(row.due_at)));
  }

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

      const item = laneItem(page, "deadline", title);
      await expect(item).toBeVisible();

      await item.locator(".calendar-reschedule-summary").click();
      const form = item.locator(".task-control", { has: page.locator('input[type="date"]') }).first();
      await form.locator('input[type="date"]').fill(to);
      await form.locator("button[type=submit]").click();

      // The outcome is announced in a named region — `2M-ACCESS-004`.
      const result = page.getByRole("region", { name: COPY[locale].resultRegion });
      await expect(result).toBeVisible();

      // The database moved, read back through the service role as an
      // observation rather than as a write — and compared **in the account's
      // own zone**. A bare date resolves to 23:59:59 local (`END_OF_DAY`), which
      // in America/Sao_Paulo is already the next day in UTC, so slicing the
      // stored ISO string reported a correct write as an off-by-one. *A date
      // assertion that ignores the zone is asserting about UTC, whatever it
      // says it is about.*
      const zone = await accountTimeZone();
      expect(await localDayOfDueAt(taskId, zone)).toBe(to);

      // `2M-CAL-010`: an audit row, and an undo offered here.
      /*
       * `audit_logs` is `(action_type, entity_type, entity_id, actor)` —
       * `202607160003:128`. The first version of this query asked for
       * `target_id` and `action`, neither of which has ever existed, and
       * PostgREST answered `42703` rather than an empty list. It is the same
       * defect Phase 2K's funnel reader carried for nine days: *a query written
       * from what the columns are called in one's head fails at the database,
       * not at the assertion.*
       */
      const audit = await admin(
        `audit_logs?entity_id=eq.${taskId}&entity_type=eq.task`
        + "&select=actor,action_type&order=created_at.desc&limit=5",
      );
      expect(audit.length, "the reschedule left no audit row").toBeGreaterThan(0);
      expect(audit.map((entry) => entry.actor)).toContain("user");
      expect(audit.map((entry) => entry.action_type)).toContain("task_command_applied");

      const undo = result.getByRole("button", { name: new RegExp(COPY[locale].undo, "i") });
      await expect(undo).toBeVisible();
      await undo.click();

      await expect
        .poll(async () => localDayOfDueAt(taskId, zone), {
          message: "undo did not put the deadline back",
        })
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

    // The deadline lane, not the reminder the seed's trigger also created: the
    // return position is a property of the item that links into `/app/work`.
    const link = laneItem(page, "deadline", title).locator("a.calendar-item-link");
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href, "the item link carries no return position").toContain("from=");

    await link.click();
    await expect(page).toHaveURL(/\/app\/work\//);

    // `.back-link`, not the label alone: the shell's own navigation carries a
    // "Calendário" link too, and that one goes to the calendar's *default*
    // position — which would pass a weaker assertion while proving nothing
    // about the position travelling in the URL.
    const back = page.locator("a.back-link");
    await expect(back).toHaveText(new RegExp(COPY["pt-BR"].back, "i"));
    await back.click();
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

    const item = laneItem(page, "deadline", title);
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
    // The fixture cancels the derived reminder too, because `apply_task_command`
    // does (`202607260059`, close-and-insert: every `scheduled` reminder of a
    // cancelled task becomes `cancelled`). Without this line the shortcut leaves
    // behind a row the product never would, and the case would read that residue
    // as the calendar failing to drop a cancelled task. *A fixture that takes a
    // shortcut around the product must take the whole shortcut, including the
    // parts of it that were tidying up.*
    await admin(`reminders?task_id=eq.${taskId}&status=eq.scheduled`, {
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
