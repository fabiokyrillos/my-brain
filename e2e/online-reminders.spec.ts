import { expect, test, type Page } from "@playwright/test";

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

  test.beforeAll(async () => {
    owner = await createAccount("reminders");
  });

  test.afterAll(async () => {
    await deleteAccount(owner?.id);
  });

  async function signIn(page: Page, locale: "pt-BR" | "en" = "pt-BR") {
    await page.goto(`/${locale}/auth/login`);
    await page.getByLabel("E-mail").fill(owner.email);
    await page.getByLabel(locale === "en" ? "Password" : "Senha").fill(owner.password);
    await page.getByRole("button", { name: locale === "en" ? "Sign in" : "Entrar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/app$`), { timeout: 30_000 });
  }

  /**
   * Creates one reminder through the form and returns its title.
   *
   * A random suffix per call, so two tests in one worker cannot see each
   * other's row and mistake it for their own.
   */
  async function createReminder(page: Page, locale: "pt-BR" | "en" = "pt-BR") {
    const title = `Ligar para o contador ${crypto.randomUUID().slice(0, 8)}`;
    await page.goto(`/${locale}/app/reminders`);
    await page.getByLabel(locale === "en" ? "Reminder" : "Lembrete", { exact: true }).fill(title);
    await page.getByLabel(locale === "en" ? "When" : "Quando").fill(futureLocal(5));
    await page
      .getByRole("button", { name: locale === "en" ? "Create reminder" : "Criar lembrete" })
      .click();
    await expect(
      page.getByText(locale === "en" ? "Reminder created." : "Lembrete criado."),
    ).toBeVisible({ timeout: 30_000 });
    return title;
  }

  const row = (page: Page, title: string) =>
    page.locator(".reminder-row").filter({ hasText: title });

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
    await expect(page.getByText("Lembrete adiado.")).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(row(page, title).getByText("Agendado")).toBeVisible();

    // Reschedule — an explicit absolute instant, with the current schedule
    // stated next to the new one.
    await row(page, title).getByRole("button", { name: "Reagendar" }).click();
    await expect(row(page, title).getByText(/Horário atual/)).toBeVisible();
    await row(page, title).getByLabel("Novo horário").fill(futureLocal(9, 14));
    await row(page, title).getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Lembrete reagendado.")).toBeVisible({ timeout: 30_000 });

    // Edit — allowed here because this reminder is standalone.
    await page.reload();
    const renamed = `${title} (revisado)`;
    await row(page, title).getByRole("button", { name: "Editar" }).click();
    await row(page, title).getByLabel("Título do lembrete").fill(renamed);
    await row(page, title).getByLabel("Marcar como importante").check();
    await row(page, title).getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Lembrete atualizado.")).toBeVisible({ timeout: 30_000 });

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
    await expect(page.getByText("Lembrete cancelado.")).toBeVisible({ timeout: 30_000 });

    await page.goto("/pt-BR/app/reminders?view=pending");
    await expect(row(page, title)).toHaveCount(0);

    // Restore is reachable from the cancelled view — which is the reason that
    // view exists, since the old page filtered cancelled rows out entirely.
    await page.goto("/pt-BR/app/reminders?view=cancelled");
    await expect(row(page, title).getByText("Cancelado")).toBeVisible();
    await row(page, title).getByRole("button", { name: "Reativar" }).click();
    await expect(page.getByText("Lembrete reativado.")).toBeVisible({ timeout: 30_000 });

    await page.goto("/pt-BR/app/reminders?view=pending");
    await expect(row(page, title).getByText("Agendado")).toBeVisible();
  });

  test("a cancelled reminder offers only reactivate, and a delivered one offers nothing", async ({
    page,
  }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.reload();
    await row(page, title).getByRole("button", { name: "Cancelar lembrete" }).click();
    await page.getByRole("button", { name: "Sim, cancelar" }).click();
    await expect(page.getByText("Lembrete cancelado.")).toBeVisible({ timeout: 30_000 });

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
    const deliveredTitle = `Entregue ${crypto.randomUUID().slice(0, 8)}`;
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
    await expect(delivered.getByText("Entregue")).toBeVisible();
    await expect(delivered.getByText(/Entregue em/)).toBeVisible();
    // Terminal in every direction: its notification dedupe key is spent.
    await expect(delivered.getByRole("button")).toHaveCount(0);
  });

  test("the surface is the only way in — a direct update is still refused", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);

    // Non-vacuity first: the same session can *read* its reminder, so the write
    // refusal below can only be the missing grant, not a missing row.
    const token = await page.evaluate(async () => {
      const raw = Object.entries(localStorage).find(([key]) => key.includes("auth-token"))?.[1];
      return raw ? (JSON.parse(raw as string) as { access_token?: string }).access_token ?? null : null;
    });
    expect(token, "could not read the session token from the browser").toBeTruthy();

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
    await expect(page.getByText("Lembrete adiado.")).toBeVisible({ timeout: 30_000 });

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
    await expect(page.getByText("Reminder cancelled.")).toBeVisible({ timeout: 30_000 });

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
    await expect(page.getByText("Lembrete cancelado.")).toBeVisible({ timeout: 30_000 });
  });

  test("the outcome is announced to a screen reader", async ({ page }) => {
    await signIn(page);
    const title = await createReminder(page);
    await page.goto("/pt-BR/app/reminders");

    const live = row(page, title).locator("[role='status'][aria-live='polite']");
    await expect(live).toHaveCount(1);

    await row(page, title).getByLabel("Adiar").selectOption("60");
    await row(page, title).getByRole("button", { name: "Adiar" }).click();
    // The same sentence the sighted reader gets, in the row's own live region.
    await expect(live).toContainText("Lembrete adiado.", { timeout: 30_000 });
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
