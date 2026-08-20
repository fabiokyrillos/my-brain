import { expect, test, type Page } from "@playwright/test";

import { mintOnlineAccessToken, signInOnline } from "./support/online-session";

/**
 * Slice G5's authenticated acceptance for the reminder lifecycle
 * (UX-12, DEC-6 option A, DEC-7 option a).
 *
 * Before this slice the page offered creation and nothing else: rows were inert
 * `<article>`s printing the raw `status` enum, and `authenticated` held no
 * `update` on `public.reminders` at all — so there was no way to ship the
 * lifecycle without a decision about the grant. DEC-6 chose a narrow
 * `SECURITY DEFINER` boundary; this journey proves the boundary is reachable
 * from the product, not merely present in the database.
 *
 * Everything here goes through the real UI against the real RPC. The one
 * exception is the delivered reminder in the terminal-state case: only the
 * hourly heartbeat can produce a `sent` row, so the harness seeds it with the
 * service role — which is a *fixture*, not a product write, and is called out
 * where it happens.
 *
 * A disposable account created and deleted by the harness; deleting it cascades
 * to its reminders and audit rows, so nothing this journey creates outlives it.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

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
  const password = `Reminder!${crypto.randomUUID()}A7`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  expect(response.ok).toBe(true);
  const { id } = (await response.json()) as { id: string };
  return { email, password, id };
}

async function deleteAccount(userId: string | undefined) {
  if (!userId) return;
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
  });
}

/** A local wall-clock the `datetime-local` input accepts, N days out. */
function futureLocal(days: number, hour = 9): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(hour)}:00`;
}

test.describe("the reminder lifecycle is reachable, confirmed, audited and localized", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; password: string; id: string };
  /** A second tenant, so "a foreign reminder is refused" is not satisfiable by an empty table. */
  let stranger: { email: string; password: string; id: string };
  let strangerReminderId: string;

  test.beforeAll(async () => {
    owner = await createAccount("reminders");
    stranger = await createAccount("reminders-stranger");
    const [row] = await admin("reminders", {
      method: "POST",
      body: JSON.stringify({
        user_id: stranger.id,
        title: `Stranger ${crypto.randomUUID().slice(0, 8)}`,
        remind_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: "scheduled",
      }),
    });
    strangerReminderId = row.id as string;
  });

  // Deleting each account cascades to its reminders, tasks and audit rows.
  // Fail-closed: both deletions run even if one throws, and the residue check
  // below is what proves they worked rather than that they were attempted.
  test.afterAll(async () => {
    const results = await Promise.allSettled([
      deleteAccount(owner?.id),
      deleteAccount(stranger?.id),
    ]);
    const failed = results.filter((result) => result.status === "rejected");
    expect(failed, `fixture teardown failed: ${JSON.stringify(failed)}`).toHaveLength(0);
  });

  async function signIn(page: Page, locale: "pt-BR" | "en" = "pt-BR") {
    await signInOnline(page, { email: owner.email, locale });
  }

  /**
   * Creates one reminder and returns its title.
   *
   * A random suffix per call, so two tests in one worker cannot see each
   * other's row and mistake it for their own.
   *
   * Slice 2P.7 moved creation out of the page header and into a dialog
   * (`2P-REMINDER-001`), so this opens it first. The labels changed with it —
   * they now name what the field is for rather than repeating the noun.
   */
  async function createReminder(page: Page, locale: "pt-BR" | "en" = "pt-BR") {
    const title = `Ligar para o contador ${crypto.randomUUID().slice(0, 8)}`;
    await page.goto(`/${locale}/app/reminders`);
    await page
      .getByRole("button", { name: locale === "en" ? "New reminder" : "Novo lembrete" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel(locale === "en" ? "What to remember" : "O que lembrar")
      .fill(title);
    await dialog
      .getByLabel(locale === "en" ? "When to tell you" : "Quando avisar")
      .fill(futureLocal(5));
    await dialog
      .getByRole("button", { name: locale === "en" ? "Create reminder" : "Criar lembrete" })
      .click();
    // The dialog closes on success, and the result is left on the page behind
    // it — so waiting for the sentence also proves the dialog did not freeze.
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(
      page.getByText(locale === "en" ? "Reminder created." : "Lembrete criado."),
    ).toBeVisible({ timeout: 30_000 });
    return title;
  }

  const row = (page: Page, title: string) =>
    page.locator(".reminder-row").filter({ hasText: title });

  /**
   * The page-level outcome region.
   *
   * A completed transition is announced in up to three places: the row's own
   * live region, the row's visible sentence, and this one. `page.getByText`
   * therefore matches several elements and fails Playwright's strict mode — and
   * the two row-scoped ones vanish for `cancel` and `restore`, which move the
   * reminder out of the current view. This region outlives the row, so it is
   * the only locator that is both unambiguous and always present.
   */
  const outcome = (page: Page) => page.locator(".reminder-page-feedback .reminder-feedback");

  /**
   * An access token for the owner, minted the same way the app's own sign-in
   * does.
   *
   * Not read out of the browser: `@supabase/ssr` keeps the session in **cookies**
   * for a server-rendered app, chunked and base64-prefixed, so scraping
   * `localStorage` finds nothing at all. Exchanging the same credentials the UI
   * signs in with produces a real session for the same user, which is what these
   * assertions are actually about — and it does not depend on a storage layout
   * the library is free to change.
   */
  async function sessionToken(): Promise<string> {
    // Not the password grant: hosted CAPTCHA refuses it for every client
    // (`400 captcha_failed`), so the exchange is the admin link one.
    const { accessToken } = await mintOnlineAccessToken({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email: owner.email,
    });
    return accessToken;
  }

  /**
   * Calls the command boundary with the owner's real session.
   *
   * The refusal cases below go through this rather than through the UI on
   * purpose: the surface deliberately does not render a control the state
   * cannot accept, so "the RPC refuses a stale write" is not reachable by
   * clicking. Driving the deployed contract with the owner's own token is the
   * live evidence — the alternative is asserting it only in pgTAP, which runs
   * against a fresh local database and not against this project.
   */
  async function callCommand(
    token: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_reminder_command_v1`, {
      method: "POST",
      headers: {
        apikey: publishableKey!,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      payload: text ? JSON.parse(text) : {},
    };
  }

  /** The four scalars the RPC compares, read back through the owner's session. */
  async function currentState(token: string, reminderId: string) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/reminders?select=status,remind_at,title,important&id=eq.${reminderId}`,
      { headers: { apikey: publishableKey!, authorization: `Bearer ${token}` } },
    );
    expect(response.ok).toBe(true);
    const [reminder] = (await response.json()) as {
      status: string;
      remind_at: string;
      title: string;
      important: boolean;
    }[];
    return {
      status: reminder.status,
      remindAt: reminder.remind_at,
      title: reminder.title,
      important: reminder.important,
    };
  }

  async function ownReminderId(token: string, title: string): Promise<string> {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/reminders?select=id&title=eq.${encodeURIComponent(title)}`,
      { headers: { apikey: publishableKey!, authorization: `Bearer ${token}` } },
    );
    const rows = (await response.json()) as { id: string }[];
    expect(rows).toHaveLength(1);
    return rows[0].id;
  }

  test("a scheduled reminder can be snoozed, rescheduled and edited", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.reload();

    // UX-21: the localized label, never the raw `scheduled` enum.
    await expect(row(page, title).getByText("Agendado")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("scheduled");

    // Snooze — a bounded relative preset. The row stays scheduled (DEC-7): the
    // schedule moves, the dormant `snoozed` status is never written.
    await row(page, title).getByLabel("Adiar").selectOption("60");
    await row(page, title).getByRole("button", { name: "Adiar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete adiado.", { timeout: 30_000 });
    await page.reload();
    await expect(row(page, title).getByText("Agendado")).toBeVisible();

    // Reschedule — an explicit absolute instant, with the current schedule
    // stated next to the new one.
    await row(page, title).getByRole("button", { name: "Reagendar" }).click();
    await expect(row(page, title).getByText(/Horário atual/)).toBeVisible();
    await row(page, title).getByLabel("Novo horário").fill(futureLocal(9, 14));
    await row(page, title).getByRole("button", { name: "Salvar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete reagendado.", { timeout: 30_000 });

    // Edit — allowed here because this reminder is standalone.
    await page.reload();
    const renamed = `${title} (revisado)`;
    await row(page, title).getByRole("button", { name: "Editar" }).click();
    await row(page, title).getByLabel("Título do lembrete").fill(renamed);
    await row(page, title).getByLabel("Marcar como importante").check();
    await row(page, title).getByRole("button", { name: "Salvar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete atualizado.", { timeout: 30_000 });

    await page.reload();
    await expect(row(page, renamed).getByText("importante")).toBeVisible();
  });

  test("cancellation asks first, and the cancelled reminder can be reactivated", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.reload();

    // The confirmation is a step, not a styling choice: clicking Cancel must
    // not cancel anything on its own.
    await row(page, title).getByRole("button", { name: "Cancelar lembrete" }).click();
    await expect(page.getByText("Cancelar este lembrete?")).toBeVisible();
    await expect(page.getByText(/pode ser reativado depois/)).toBeVisible();

    // Dismissing leaves it scheduled.
    await page.getByRole("button", { name: "Manter agendado" }).click();
    await page.reload();
    await expect(row(page, title).getByText("Agendado")).toBeVisible();

    // Confirming cancels it, and it leaves the pending view.
    await row(page, title).getByRole("button", { name: "Cancelar lembrete" }).click();
    await page.getByRole("button", { name: "Sim, cancelar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete cancelado.", { timeout: 30_000 });

    await page.goto("/pt-BR/app/reminders?view=pending");
    await expect(row(page, title)).toHaveCount(0);

    // Restore is reachable from the cancelled view — which is the reason that
    // view exists, since the old page filtered cancelled rows out entirely.
    await page.goto("/pt-BR/app/reminders?view=cancelled");
    await expect(row(page, title).getByText("Cancelado")).toBeVisible();
    await row(page, title).getByRole("button", { name: "Reativar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete reativado.", { timeout: 30_000 });

    await page.goto("/pt-BR/app/reminders?view=pending");
    await expect(row(page, title).getByText("Agendado")).toBeVisible();
  });

  /**
   * `2P-REMINDER-REVALIDATE-HANG`, second half — the list must reflect the write.
   *
   * ## What every other test in this file quietly worked around
   *
   * Read the three journeys above: **every** assertion about the list following
   * a write is preceded by `page.reload()` or `page.goto()`. That was not
   * caution. `applyReminderCommand` revalidated `/${locale}/app/reminders` — a
   * **resolved** path, which matches nothing under a dynamic `[locale]`
   * segment — so snooze, reschedule, edit, cancel and restore all wrote their
   * row and **no action on this page ever re-rendered it**. The journeys passed
   * because they navigated, and a reader would have concluded the surface
   * updates itself.
   *
   * ## Why this test names five causes instead of asserting one outcome
   *
   * "The interface did not update" has five candidate explanations here, and
   * the owner's authorization requires telling them apart rather than picking
   * the likely one. So each is measured on its own:
   *
   * | # | Claim | How this test settles it |
   * |---|---|---|
   * | 1 | the Server Action answered | the page outcome region carries its sentence |
   * | 2 | `pending` ended | the control that was disabled is enabled again |
   * | 3 | the write happened | a later reload shows the same value this test read in place |
   * | 4 | the transition is not stuck | 1 and 2 both hold, and no dialog is involved |
   * | 5 | **the list re-rendered** | the row changes with **no reload between** |
   *
   * Against `main` `f52755c` rows 1–4 pass and row 5 fails, which is the exact
   * shape of *"an action can write and leave the interface not reflecting the
   * result"*. It is **not** the freeze half — that one is `pending` stuck true,
   * and row 2 rules it out.
   *
   * ## Both row fates, and the undo
   *
   * Snooze keeps the row in view, so it proves an **in-place update**; cancel
   * moves it out, so it proves an **in-place removal**; restore is cancel's undo
   * and proves the reverse. A test that only covered one would pass on a fix
   * that only handled that one.
   */
  test("a lifecycle action reflects in the list with no manual reload", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);
    // The one navigation this test is allowed: it establishes the starting
    // list. Every assertion after it must hold without another.
    await page.reload();

    const schedule = () => row(page, title).locator(".reminder-schedule");
    const before = await schedule().innerText();

    // ---- the row stays in view: the update must be visible in place ----
    await row(page, title).getByLabel("Adiar").selectOption("60");
    await row(page, title).getByRole("button", { name: "Adiar" }).click();

    // 1 — the response arrived.
    await expect(outcome(page)).toHaveText("Lembrete adiado.", { timeout: 30_000 });
    // 2 — `pending` ended: the shared action re-enables every control it
    //     disabled. A stuck transition would leave this button disabled
    //     forever, which is the freeze half and is not what is happening.
    await expect(row(page, title).getByRole("button", { name: "Adiar" })).toBeEnabled({
      timeout: 30_000,
    });
    // 5 — the defect. Snoozing by an hour moves a reminder five days out to
    //     roughly now, so the rendered instant cannot coincidentally match.
    await expect(schedule()).not.toHaveText(before, { timeout: 30_000 });

    // 3 — and what was rendered in place is what the database actually holds,
    //     so this is a real re-render rather than an optimistic guess.
    const inPlace = await schedule().innerText();
    await page.reload();
    expect(await schedule().innerText()).toBe(inPlace);

    // ---- the row leaves the view: the removal must be visible in place ----
    await row(page, title).getByRole("button", { name: "Cancelar lembrete" }).click();
    await page.getByRole("button", { name: "Sim, cancelar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete cancelado.", { timeout: 30_000 });
    await expect(row(page, title)).toHaveCount(0, { timeout: 30_000 });

    // ---- undo: restore leaves the cancelled view, also in place ----
    await page.goto("/pt-BR/app/reminders?view=cancelled");
    await expect(row(page, title).getByText("Cancelado")).toBeVisible();
    await row(page, title).getByRole("button", { name: "Reativar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete reativado.", { timeout: 30_000 });
    await expect(row(page, title)).toHaveCount(0, { timeout: 30_000 });

    // And the undo really landed: it is back in the pending view.
    await page.goto("/pt-BR/app/reminders?view=pending");
    await expect(row(page, title).getByText("Agendado")).toBeVisible();
  });

  /**
   * `2P-REMINDER-REVALIDATE-HANG`, the failure side — a refused write must read
   * as a refusal.
   *
   * The test above proves the surface reflects a write that **succeeded**. The
   * dangerous inverse is a surface that reflects one that did not: the owner's
   * authorization names *"never turn a timeout into a success"* and *"show a
   * true error when the response fails"*, and neither had a proof at the
   * surface. The RPC's own refusal is proved further down this file, but a
   * database that says no and a page that says nothing is exactly the shape
   * this repository has paid for before.
   *
   * The race is made with **two pages in one browser context**, both driven
   * through the product — no harness write, no injected state. Page B moves the
   * reminder; page A is now holding a pre-state that no longer matches, and
   * pressing its control is the same collision the hourly heartbeat produces.
   */
  test("a stale second view replays rather than duplicating, and is refused when it diverges", async ({
    page,
    context,
  }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.goto("/pt-BR/app/reminders");
    await expect(row(page, title).getByText("Agendado")).toBeVisible();

    // A second view of the same list, holding the same pre-state. Both tabs
    // therefore derive the SAME operation key, which is the whole point.
    const stale = await context.newPage();
    await stale.goto("/pt-BR/app/reminders");
    await expect(row(stale, title).getByText("Agendado")).toBeVisible();

    const preState = (target: Page) =>
      row(target, title).locator("input[name='expectedState']").first().inputValue();
    expect(await preState(stale)).toBe(await preState(page));

    // ---- 1. the same action twice: a replay, not a second write ----
    await row(page, title).getByLabel("Adiar").selectOption("60");
    await row(page, title).getByRole("button", { name: "Adiar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete adiado.", { timeout: 30_000 });
    const applied = await preState(page);

    await row(stale, title).getByLabel("Adiar").selectOption("60");
    await row(stale, title).getByRole("button", { name: "Adiar" }).click();
    await expect(outcome(stale)).toHaveText("Lembrete adiado.", { timeout: 30_000 });

    /*
      The replay must report what the FIRST operation produced, and the row must
      still carry exactly one snooze.

      The pre-state input is what makes this decidable: it carries the instant
      at microsecond precision, so two snoozes issued seconds apart are
      distinguishable in a way the rendered minute is not. Equal here means one
      write, which is `2P-REMINDER`'s "not duplicated" clause proved through the
      surface rather than at the RPC.
    */
    await stale.reload();
    expect(await preState(stale)).toBe(applied);

    // ---- 2. a diverging action on a stale pre-state: a true refusal ----
    // Back to the stale view by reloading nothing — this tab now holds the
    // CURRENT state, so the stale one is `page`'s original. Re-establish it by
    // acting from a view that has not seen the snooze.
    const diverging = await context.newPage();
    await diverging.goto("/pt-BR/app/reminders");
    await expect(row(diverging, title).getByText("Agendado")).toBeVisible();

    // Move it again from the first tab, so `diverging` is now behind.
    await page.reload();
    await row(page, title).getByLabel("Adiar").selectOption("180");
    await row(page, title).getByRole("button", { name: "Adiar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete adiado.", { timeout: 30_000 });

    // `diverging` attempts a DIFFERENT action, so its operation key is not the
    // replay of anything — the pre-state comparison is what answers.
    await row(diverging, title).getByRole("button", { name: "Cancelar lembrete" }).click();
    await diverging.getByRole("button", { name: "Sim, cancelar" }).click();

    await expect(outcome(diverging)).toHaveText(
      "O lembrete mudou enquanto esta página estava aberta. Recarregue e tente de novo.",
      { timeout: 30_000 },
    );
    await expect(outcome(diverging)).toHaveClass(/error/);

    // `pending` still ends on the failure path: a refused write must not leave
    // the surface disabled with no way forward.
    await expect(
      row(diverging, title).getByRole("button", { name: "Cancelar lembrete" }),
    ).toBeEnabled({ timeout: 30_000 });

    // And the refusal really refused: it is still scheduled, not cancelled.
    await page.reload();
    await expect(row(page, title).getByText("Agendado")).toBeVisible();

    await stale.close();
    await diverging.close();
  });

  test("a cancelled reminder offers only reactivate, and a delivered one offers nothing", async ({
    page,
  }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.reload();
    await row(page, title).getByRole("button", { name: "Cancelar lembrete" }).click();
    await page.getByRole("button", { name: "Sim, cancelar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete cancelado.", { timeout: 30_000 });

    await page.goto("/pt-BR/app/reminders?view=cancelled");
    const cancelled = row(page, title);
    await expect(cancelled.getByRole("button", { name: "Reativar" })).toBeVisible();
    // Absent, not disabled: a disabled control advertises a capability that does
    // not exist.
    await expect(cancelled.getByRole("button", { name: "Adiar" })).toHaveCount(0);
    await expect(cancelled.getByRole("button", { name: "Reagendar" })).toHaveCount(0);
    await expect(cancelled.getByRole("button", { name: "Cancelar lembrete" })).toHaveCount(0);

    // Only the hourly heartbeat can produce a `sent` row, so this one is
    // seeded — a fixture, explicitly, not a product write.
    const deliveredTitle = `Aviso antigo ${crypto.randomUUID().slice(0, 8)}`;
    await admin("reminders", {
      method: "POST",
      body: JSON.stringify({
        user_id: owner.id,
        title: deliveredTitle,
        remind_at: new Date(Date.now() - 3_600_000).toISOString(),
        status: "sent",
        sent_at: new Date(Date.now() - 3_500_000).toISOString(),
      }),
    });

    await page.goto("/pt-BR/app/reminders?view=delivered");
    const delivered = row(page, deliveredTitle);
    await expect(delivered.locator(".status-badge.reminder-sent")).toHaveText("Entregue");
    await expect(delivered.getByText(/Entregue em/)).toBeVisible();
    // Terminal in every direction: its notification dedupe key is spent.
    await expect(delivered.getByRole("button")).toHaveCount(0);
  });

  test("the surface is the only way in — a direct update is still refused", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);

    // Non-vacuity first: the same session can *read* its reminder, so the write
    // refusal below can only be the missing grant, not a missing row.
    const token = await sessionToken();

    const headers = {
      apikey: publishableKey!,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const read = await fetch(
      `${supabaseUrl}/rest/v1/reminders?select=id&title=eq.${encodeURIComponent(title)}`,
      { headers },
    );
    expect(read.ok).toBe(true);
    const rows = (await read.json()) as { id: string }[];
    expect(rows).toHaveLength(1);

    // Phase 2F's revocation, still standing after Slice G5.
    const write = await fetch(`${supabaseUrl}/rest/v1/reminders?id=eq.${rows[0].id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "cancelled" }),
    });
    expect(write.ok, "authenticated regained UPDATE on public.reminders").toBe(false);

    const remove = await fetch(`${supabaseUrl}/rest/v1/reminders?id=eq.${rows[0].id}`, {
      method: "DELETE",
      headers,
    });
    expect(remove.ok, "authenticated regained DELETE on public.reminders").toBe(false);

    // And the row is untouched by either attempt.
    await page.reload();
    await expect(row(page, title).getByText("Agendado")).toBeVisible();
  });

  test("every transition writes an audit row the History surface can read", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.reload();
    await row(page, title).getByLabel("Adiar").selectOption("15");
    await row(page, title).getByRole("button", { name: "Adiar" }).click();
    await expect(outcome(page)).toHaveText("Lembrete adiado.", { timeout: 30_000 });

    // The per-reminder audit trail — UX-12's "history where practical", reached
    // through the filter surface Slice G4 already shipped.
    await page.goto("/pt-BR/app/reminders");
    await row(page, title).getByRole("link", { name: "Ver no histórico" }).click();
    await expect(page).toHaveURL(/\/app\/history\?entity=reminder&subject=/);

    // UX-21/UX-28: a localized sentence, not `reminder_snoozed`, and not the
    // English prose the migration stores in `reason`.
    await expect(page.getByText(new RegExp(`adiou o lembrete “${title}`))).toBeVisible({
      timeout: 30_000,
    });
    const body = page.locator("body");
    await expect(body).not.toContainText("reminder_snoozed");
    await expect(body).not.toContainText("Owner postponed");
  });

  test("the same journey reads in English", async ({ page }) => {
    await signIn(page, "en");
    const title = await createReminder(page, "en");
    await page.goto("/en/app/reminders");

    await expect(row(page, title).getByText("Scheduled")).toBeVisible();
    await expect(row(page, title).getByText(/Next reminder/)).toBeVisible();
    await expect(row(page, title).getByText("Standalone reminder")).toBeVisible();

    await row(page, title).getByRole("button", { name: "Cancel reminder" }).click();
    await expect(page.getByText("Cancel this reminder?")).toBeVisible();
    await page.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(outcome(page)).toHaveText("Reminder cancelled.", { timeout: 30_000 });

    await page.goto("/en/app/reminders?view=cancelled");
    await expect(row(page, title).getByRole("button", { name: "Reactivate" })).toBeVisible();
  });

  test("the lifecycle is operable by keyboard alone", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.goto("/pt-BR/app/reminders");

    // Reach the cancel control by tabbing, open the confirmation with the
    // keyboard, and confirm the same way. No pointer is used at any point.
    const cancel = row(page, title).getByRole("button", { name: "Cancelar lembrete" });
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await expect(cancel).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(cancel).toHaveAttribute("aria-expanded", "true");

    const confirm = page.getByRole("button", { name: "Sim, cancelar" });
    await confirm.focus();
    await page.keyboard.press("Enter");
    await expect(outcome(page)).toHaveText("Lembrete cancelado.", { timeout: 30_000 });
  });

  test("the outcome is announced to a screen reader", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.goto("/pt-BR/app/reminders");

    // Exactly one live region on the page, above the list. A second one inside
    // the row would double every announcement, and would be torn down mid-
    // announcement whenever a transition moves the row out of the view.
    const live = page.locator(".reminder-page-feedback[role='status'][aria-live='polite']");
    await expect(live).toHaveCount(1);
    await expect(row(page, title).locator("[aria-live]")).toHaveCount(0);

    await row(page, title).getByLabel("Adiar").selectOption("60");
    await row(page, title).getByRole("button", { name: "Adiar" }).click();
    // The same sentence the sighted reader gets, in the row's own live region.
    await expect(live).toContainText("Lembrete adiado.", { timeout: 30_000 });
  });

  test("the deployed contract refuses a stale write, and replays an exact retry", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);
    const token = await sessionToken();
    const reminderId = await ownReminderId(token, title);
    const state = await currentState(token, reminderId);

    // Stale pre-state: the row really is scheduled at that time; the caller
    // claims it saw a different one. This is the hourly-heartbeat race.
    const stale = await callCommand(token, {
      p_reminder_id: reminderId,
      p_command: { kind: "cancel" },
      p_expected_state: { ...state, remindAt: "2020-01-01T00:00:00.000000+00" },
      p_operation_key: `live-stale-${crypto.randomUUID()}`,
    });
    expect(stale.ok, "a stale write was accepted").toBe(false);
    expect(JSON.stringify(stale.payload)).toContain("G5_REMINDER_STALE_STATE");

    // Idempotent replay: the same key with the same payload must not apply twice.
    const key = `live-replay-${crypto.randomUUID()}`;
    const first = await callCommand(token, {
      p_reminder_id: reminderId,
      p_command: { kind: "snooze", snoozeMinutes: 60 },
      p_expected_state: state,
      p_operation_key: key,
    });
    expect(first.ok, JSON.stringify(first.payload)).toBe(true);
    expect(first.payload.idempotent).toBe(false);

    const replay = await callCommand(token, {
      p_reminder_id: reminderId,
      p_command: { kind: "snooze", snoozeMinutes: 60 },
      p_expected_state: state,
      p_operation_key: key,
    });
    expect(replay.ok, JSON.stringify(replay.payload)).toBe(true);
    expect(replay.payload.idempotent).toBe(true);
    // The replay reports what the operation produced, not a fresh reading.
    expect(replay.payload.remind_at).toBe(first.payload.remind_at);

    // …and the same key with a different payload is a caller bug, not a replay.
    const mismatch = await callCommand(token, {
      p_reminder_id: reminderId,
      p_command: { kind: "cancel" },
      p_expected_state: state,
      p_operation_key: key,
    });
    expect(mismatch.ok).toBe(false);
    expect(JSON.stringify(mismatch.payload)).toContain("G5_REMINDER_IDEMPOTENCY_MISMATCH");

    // DEC-7, live: snooze is a *relative* movement from `now()`, so it lands
    // about an hour out — not an hour past whatever the row already held. This
    // reminder was created five days ahead, so asserting "later than before"
    // would be asserting the opposite of the decision.
    const after = await currentState(token, reminderId);
    expect(after.status).toBe("scheduled");
    const minutesOut = (Date.parse(after.remindAt) - Date.now()) / 60_000;
    expect(minutesOut).toBeGreaterThan(55);
    expect(minutesOut).toBeLessThan(65);
  });

  test("a foreign reminder and a missing one are indistinguishable", async ({ page }) => {
    await signIn(page);
    const token = await sessionToken();

    // Non-vacuity: the stranger's row provably exists, read with the service
    // role — the owner's session is precisely what must not see it.
    const existing = await admin(`reminders?select=id&id=eq.${strangerReminderId}`);
    expect(existing).toHaveLength(1);

    const probe = {
      p_command: { kind: "cancel" },
      p_expected_state: {
        status: "scheduled",
        remindAt: "2026-12-04T09:00:00.000000+00",
        title: "Stranger",
        important: false,
      },
    };
    const foreign = await callCommand(token, {
      ...probe,
      p_reminder_id: strangerReminderId,
      p_operation_key: `live-foreign-${crypto.randomUUID()}`,
    });
    const missing = await callCommand(token, {
      ...probe,
      p_reminder_id: "00000000-0000-4000-8000-0000000000ff",
      p_operation_key: `live-missing-${crypto.randomUUID()}`,
    });

    expect(foreign.ok).toBe(false);
    expect(missing.ok).toBe(false);
    // Identical answers, so the RPC cannot be used to probe for the existence
    // of another owner's row.
    expect(foreign.status).toBe(missing.status);
    expect(foreign.payload.message).toBe(missing.payload.message);
    expect(String(foreign.payload.message)).toContain("not found");

    // And the stranger's reminder is untouched.
    const [after] = await admin(`reminders?select=status&id=eq.${strangerReminderId}`);
    expect(after.status).toBe("scheduled");
  });

  test("a task-linked reminder refuses an edit, and a delivered one refuses re-arming", async ({
    page,
  }) => {
    await signIn(page);
    const token = await sessionToken();

    // Fixtures, both seeded with the service role and labelled as such: a
    // task-linked reminder needs a task the client can no longer insert (Phase
    // 2F revoked it), and only the hourly heartbeat produces a `sent` row.
    const [task] = await admin("tasks", {
      method: "POST",
      body: JSON.stringify({
        user_id: owner.id,
        title: `Fechar o balanço ${crypto.randomUUID().slice(0, 8)}`,
        status: "todo",
      }),
    });
    const linkedTitle = `Derivado ${crypto.randomUUID().slice(0, 8)}`;
    const [linked] = await admin("reminders", {
      method: "POST",
      body: JSON.stringify({
        user_id: owner.id,
        task_id: task.id,
        title: linkedTitle,
        remind_at: new Date(Date.now() + 172_800_000).toISOString(),
        status: "scheduled",
      }),
    });
    const sentTitle = `Aviso antigo ${crypto.randomUUID().slice(0, 8)}`;
    const [sent] = await admin("reminders", {
      method: "POST",
      body: JSON.stringify({
        user_id: owner.id,
        title: sentTitle,
        remind_at: new Date(Date.now() - 3_600_000).toISOString(),
        status: "sent",
        sent_at: new Date(Date.now() - 3_500_000).toISOString(),
      }),
    });

    // The surface withholds Edit from a task-linked row while keeping the rest.
    await page.goto("/pt-BR/app/reminders");
    const linkedRow = row(page, linkedTitle);
    await expect(linkedRow.getByRole("button", { name: "Reagendar" })).toBeVisible();
    await expect(linkedRow.getByRole("link", { name: /Tarefa vinculada/ })).toBeVisible();
    await expect(linkedRow.getByRole("button", { name: /^Editar/ })).toHaveCount(0);

    // …and the contract refuses it with its own token, not with "wrong state".
    const refusedEdit = await callCommand(token, {
      p_reminder_id: linked.id,
      p_command: { kind: "edit", title: "Título à mão", important: true },
      p_expected_state: await currentState(token, linked.id as string),
      p_operation_key: `live-linked-${crypto.randomUUID()}`,
    });
    expect(refusedEdit.ok).toBe(false);
    expect(JSON.stringify(refusedEdit.payload)).toContain("G5_REMINDER_EDIT_TASK_LINKED");

    // A delivered reminder is terminal in every re-arming direction.
    const sentState = await currentState(token, sent.id as string);
    for (const command of [
      { kind: "restore" },
      { kind: "snooze", snoozeMinutes: 60 },
      { kind: "reschedule", remindAt: "2026-12-24T09:00:00+00:00" },
    ]) {
      const refused = await callCommand(token, {
        p_reminder_id: sent.id,
        p_command: command,
        p_expected_state: sentState,
        p_operation_key: `live-sent-${crypto.randomUUID()}`,
      });
      expect(refused.ok, `a delivered reminder accepted ${command.kind}`).toBe(false);
      expect(JSON.stringify(refused.payload)).toContain("G5_REMINDER_TRANSITION_NOT_ALLOWED");
    }
  });

  test("the row is usable at 375 and 412 px without horizontal scroll", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);

    for (const width of [375, 412]) {
      await page.setViewportSize({ width, height: width === 375 ? 667 : 915 });
      await page.goto("/pt-BR/app/reminders");

      await expect(row(page, title).getByRole("button", { name: "Reagendar" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `the page scrolls horizontally at ${width}px`).toBe(false);
    }
  });
});
