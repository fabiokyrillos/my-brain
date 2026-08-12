import { expect, test, type Page } from "@playwright/test";

import { onlineEnvironment, signInOnline } from "./support/online-session";

/**
 * `2M-REVIEW-003` … `-005` — the day review's **applied** case, which no
 * offline lane can reach.
 *
 * ## Why this file exists
 *
 * Slice 2M.3 shipped the day review and said plainly what it had not proved:
 * *"the applied review case in a browser — a successful carry-forward, the row
 * leaving the list, and the undo — which needs an authenticated app, as
 * `online-calendar.spec.ts` needed one for the calendar."* `e2e/daily-surfaces.spec.ts`
 * composes the surface with `setContent`, so it can prove structure, focus,
 * target size and reflow and can prove **nothing** about a command reaching
 * `apply_task_command`, about the row leaving the day it was carried out of, or
 * about the undo putting the intention back.
 *
 * That gap is exactly the shape of the two defects `online-calendar.spec.ts`
 * found on its own first run: an outcome region that unmounts with the item that
 * produced it, and an undo button that had never rendered on any surface. Both
 * were invisible to every component test in the repository and both were found
 * the first time a real command ran in a real browser.
 *
 * ## What is a fixture and what is a claim
 *
 * The service role appears twice, both times as a fixture: creating the
 * disposable account, and seeding the task the review is supposed to show — a
 * task the product would create through capture, which is a provider call this
 * phase neither authorizes nor needs in order to test a review. **Every claim
 * this file makes is made through the product**, and every read-back is an
 * observation rather than a write.
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
 * `resultRegion` is `detail-controls-copy.ts`'s, because `CalendarOutcome` —
 * which the day review reuses — labels its region from `getTaskDetailControlsCopy`.
 * `copy.ts`'s `resultRegionLabel` is a *different* string ("Resultado do
 * comando") belonging to a different surface, and reaching for it would be the
 * same defect `online-calendar.spec.ts` recorded: **a journey that guesses at
 * copy tests the guess.**
 */
const COPY = {
  "pt-BR": {
    planned: "Intenções do dia",
    carryForward: "Levar para amanhã",
    resultRegion: "Resultado da alteração",
    undo: "Desfazer",
  },
  en: {
    planned: "Intentions for the day",
    carryForward: "Carry to tomorrow",
    resultRegion: "Change result",
    undo: "Undo",
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

/** `YYYY-MM-DD` for an instant, in a named zone. Never the runner's own. */
function localDayIn(zone: string, iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

test.describe("the day review carries an intention forward through the command path", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; id: string };
  let zone: string;

  test.beforeAll(async () => {
    owner = await createAccount("day-review");
    /*
     * The zone the **product** decides local days in, read rather than assumed.
     * `day-review-projection.ts` takes it from `profiles.timezone` through
     * `requireProfileTimeZone`, so this takes it from the same place. Hard-coding
     * the runner's zone would make the journey pass or fail on where it happened
     * to run from, which is the opposite of what a date test may depend on.
     */
    const [row] = await admin(`profiles?user_id=eq.${owner.id}&select=timezone`);
    expect(typeof row?.timezone, "the account has no profile time zone").toBe("string");
    zone = row.timezone as string;
  });

  test.afterAll(async () => {
    await deleteAccount(owner?.id);
  });

  /**
   * An instant that is genuinely inside a given local day **in the account's
   * zone**, asserted rather than hoped for.
   *
   * Noon UTC lands on the same calendar date for every zone from -11 to +11, and
   * the assertion below is what makes that a checked property of this run rather
   * than a fact somebody remembered. A seed that silently landed on the wrong
   * day would make the review look broken.
   */
  function noonUtcOn(day: string): string {
    const iso = `${day}T12:00:00.000Z`;
    expect(localDayIn(zone, iso), `${iso} is not inside ${day} in ${zone}`).toBe(day);
    return iso;
  }

  /** Today and tomorrow as the **user** sees them. */
  function days(): { today: string; tomorrow: string } {
    const today = localDayIn(zone, new Date().toISOString());
    const at = new Date(`${today}T12:00:00.000Z`);
    at.setUTCDate(at.getUTCDate() + 1);
    return { today, tomorrow: localDayIn(zone, at.toISOString()) };
  }

  /** A task the user intends to work on today. A fixture, never a product claim. */
  async function seedIntention(title: string, day: string) {
    const [row] = await admin("tasks", {
      method: "POST",
      body: JSON.stringify({
        user_id: owner.id,
        title,
        status: "todo",
        planned_at: noonUtcOn(day),
      }),
    });
    return row.id as string;
  }

  async function plannedDayOf(taskId: string): Promise<string | null> {
    const [row] = await admin(`tasks?id=eq.${taskId}&select=planned_at`);
    return row?.planned_at === null || row?.planned_at === undefined
      ? null
      : localDayIn(zone, String(row.planned_at));
  }

  function plannedSection(page: Page) {
    return page.locator('.day-review-section[data-source="planned"]');
  }

  for (const locale of ["pt-BR", "en"] as const) {
    test(`${locale}: carry-forward applies, the row leaves the day, and the undo puts it back`, async ({ page }) => {
      /*
       * The whole of the remainder slice 2M.3 named, in one journey, because
       * splitting it would let a half pass on its own: the apply must reach
       * `apply_task_command`, the intention must actually move, the row must
       * leave the day it was carried out of, an audit row must exist, and the
       * undo must be offered **outside the row that disappears** and must work.
       */
      const { today, tomorrow } = days();
      const title = `Intencao ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedIntention(title, today);
      expect(await plannedDayOf(taskId), "the fixture did not land on today").toBe(today);

      await signInOnline(page, { email: owner.email, locale, next: `/${locale}/app/reviews` });

      const section = plannedSection(page);
      await expect(section.getByText(title)).toBeVisible();

      // The verb is addressed by its DATA ATTRIBUTE, not by its prose. The hint
      // beside it contains the label too, so a text locator would match two
      // nodes and fail in strict mode against a surface that is working.
      const verb = section.locator('.day-review-item .day-review-verb[data-verb="carry_forward"]').first();
      await expect(verb).toBeVisible();
      await verb.locator("button[type=submit]").click();

      // `2M-ACCESS-004`: the outcome is announced in a named region — and it is
      // rendered by `CalendarOutcome`, ABOVE the lists, so it survives the row
      // that produced it disappearing. That ordering is the fix Phase 2M made
      // after a successful reschedule unmounted its own outcome on the calendar.
      const result = page.getByRole("region", { name: COPY[locale].resultRegion });
      await expect(result).toBeVisible();
      // `2M-ACCESS-003`'s remainder: focus **restoration** after a settled round.
      // The control that produced the outcome is about to be removed from the
      // document by the server's re-query, so focus has to have been moved
      // somewhere deliberate — a browser's default is `body`, which strands a
      // keyboard user at the top of the page with no announcement.
      await expect(result).toBeFocused();

      // The intention really moved, read back through the service role as an
      // observation, and compared **in the account's own zone**.
      await expect
        .poll(async () => plannedDayOf(taskId), { message: "the intention did not move to the next day" })
        .toBe(tomorrow);

      // And the row left the day it was carried out of. This is the half no
      // component test can reach: the disappearance is the server re-running
      // its query, not a state update.
      await expect
        .poll(async () => section.getByText(title).count(), {
          message: "the carried item is still listed under today's intentions",
        })
        .toBe(0);

      /*
       * `audit_logs` is `(action_type, entity_type, entity_id, actor)` —
       * `202607160003:128`. Asked by the columns that exist rather than by the
       * ones a query would like to exist; `entity_id`/`action` do not, and
       * PostgREST answers `42703` rather than an empty list.
       */
      const audit = await admin(
        `audit_logs?entity_id=eq.${taskId}&entity_type=eq.task`
        + "&select=actor,action_type&order=created_at.desc&limit=5",
      );
      expect(audit.length, "the carry-forward left no audit row").toBeGreaterThan(0);
      expect(audit.map((entry) => entry.actor)).toContain("user");
      expect(audit.map((entry) => entry.action_type)).toContain("task_command_applied");

      const undo = result.getByRole("button", { name: new RegExp(COPY[locale].undo, "i") });
      await expect(undo).toBeVisible();
      await undo.click();

      await expect
        .poll(async () => plannedDayOf(taskId), { message: "undo did not put the intention back" })
        .toBe(today);

      // And the other half of the same remainder: after the undo settles, focus
      // is still inside the region that is describing what just happened, rather
      // than back on `body` because the button the user pressed disappeared.
      await expect(result).toBeVisible();
      await expect(page.locator(":focus")).toHaveCount(1);
    });
  }

  test("a day with no intentions says so, rather than saying nothing", async ({ page }) => {
    /*
     * The negative control for everything above. Without it, every assertion in
     * this file would also pass against a review that rendered an empty section
     * for a day that genuinely had an item on it — "nothing happened" and "I
     * could not read this" are different claims, and `2M-REVIEW-001` is the
     * requirement that they never collapse.
     *
     * **Its own account**, because `fullyParallel` is on and the cases above
     * leave an intention on today after undoing. A control whose verdict depends
     * on which test happened to finish first is not a control.
     */
    const empty = await createAccount("day-review-empty");
    try {
      await signInOnline(page, { email: empty.email, locale: "pt-BR", next: "/pt-BR/app/reviews" });
      const section = plannedSection(page);
      await expect(section.locator(".quiet-state")).toBeVisible();
      // The unreadable-source wording must be ABSENT: an empty day reporting
      // itself as unreadable is the defect this control exists to catch.
      await expect(section.getByText(/não pôde ser lida/i)).toHaveCount(0);
    } finally {
      await deleteAccount(empty.id);
    }
  });
});
