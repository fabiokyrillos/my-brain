import { expect, test, type Page } from "@playwright/test";

import { mintOnlineAccessToken, signInOnline } from "./support/online-session";

/**
 * Slice 2R.2's authenticated acceptance — scope, cancellation and undo.
 *
 * ## Why this is a journey and not more component tests
 *
 * The acceptance record's rule for this slice is explicit: *a passing RPC call
 * is not a delivered feature*. `series-controls.test.tsx` proves the surface
 * asks and defaults correctly in jsdom; `phase_2r_series_scope.sql` proves the
 * database does the right thing. Neither proves the two are wired to each other
 * — that the radio the owner selects reaches
 * `apply_reminder_series_command_v1`, that the sentence they read afterwards is
 * the scope the database applied, and that the row on the page changes. Only a
 * real browser against a real database says that, and only that is `2R-SERIES-*`
 * delivered.
 *
 * ## The one fixture, and why it is not a shortcut
 *
 * The series is created by calling `create_reminder_series_v1` **with the
 * owner's own token** — the product's own validated boundary, not the service
 * role. It is seeded rather than created through the UI because the creation
 * control is slice 2R.3's deliverable and does not exist yet; every other step
 * below goes through the rendered page. `online-reminders.spec.ts` calls out its
 * one seeded row the same way.
 *
 * A disposable account created and deleted by the harness, so nothing this
 * journey creates outlives it.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

type Json = Record<string, unknown>;

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
  return (text ? JSON.parse(text) : []) as Json[];
}

/** The product's own RPC, called as the owner. Never the service role. */
async function asOwner(accessToken: string, fn: string, args: Json) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: publishableKey!,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  expect(response.ok, `${fn}: ${text}`).toBe(true);
  return JSON.parse(text) as Json;
}

async function createAccount() {
  const email = `series-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
  const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password: `Pw-${Date.now()}-aA1!`, email_confirm: true }),
  });
  expect(created.ok, `create user: ${await created.clone().text()}`).toBe(true);
  const user = (await created.json()) as { id: string };
  return { email, userId: user.id };
}

async function deleteAccount(userId: string) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
  });
}

/** Seeds one daily series through the owner's own boundary. Returns its id. */
async function seedSeries(accessToken: string, title: string) {
  const anchor = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const result = await asOwner(accessToken, "create_reminder_series_v1", {
    p_rule: { version: 1, frequency: "daily" },
    p_title: title,
    p_important: false,
    p_task_id: null,
    p_anchor_date: anchor,
    p_anchor_hour: 9,
    p_anchor_minute: 0,
    p_operation_key: `e2e-series-${Date.now()}`,
  });
  return String(result.series_id);
}

const row = (page: Page, title: string) =>
  page.locator("article.reminder-row").filter({ hasText: title });

test.describe("slice 2R.2 — this one, or all of them", () => {
  test.skip(!onlineConfigured, "needs the ONLINE_SUPABASE_* environment");

  let email = "";
  let userId = "";
  let accessToken = "";

  test.beforeEach(async () => {
    const account = await createAccount();
    email = account.email;
    userId = account.userId;
    const minted = await mintOnlineAccessToken({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
    });
    accessToken = minted.accessToken;
  });

  test.afterEach(async () => {
    // Deleting the account cascades to its series, reminders, ledger and audit
    // rows, so nothing this journey wrote outlives it.
    if (userId) await deleteAccount(userId);
  });

  test("asks which scope is meant, defaults to the narrower, and writes nothing until asked", async ({
    page,
  }) => {
    const title = "Tomar o remedio";
    await seedSeries(accessToken, title);
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const reminder = row(page, title);
    await expect(reminder.getByText("Repete")).toBeVisible();

    // `2R-SERIES-001`. The question is not on screen until the owner opens it,
    // and opening it writes nothing.
    await reminder.getByRole("button", { name: "Alterar repetição" }).click();
    const scope = reminder.getByRole("group", { name: "O que você quer alterar?" });
    await expect(scope).toBeVisible();
    await expect(scope.getByRole("radio", { name: "Somente esta ocorrência" })).toBeChecked();
    await expect(scope.getByRole("radio", { name: "Esta e as futuras" })).not.toBeChecked();

    // Nothing has been written: the rule is still what it was.
    const [series] = await admin(`reminder_series?user_id=eq.${userId}&select=rule,status`);
    expect(series.status).toBe("active");
    expect((series.rule as Json).frequency).toBe("daily");
  });

  test("editing only this occurrence detaches it and leaves the rule alone", async ({ page }) => {
    const title = "Regar as plantas";
    const seriesId = await seedSeries(accessToken, title);
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const reminder = row(page, title);
    await reminder.getByRole("button", { name: "Alterar repetição" }).click();
    await reminder.getByRole("radio", { name: "Somente esta ocorrência" }).check();
    await reminder.getByRole("button", { name: "Salvar alteração" }).click();

    // `2R-SERIES-009`: the surface states the scope the DATABASE applied.
    await expect(
      page.getByText("Alterei somente esta ocorrência. A repetição continua igual."),
    ).toBeVisible();

    // `2R-SERIES-002`: the rule did not move.
    const [series] = await admin(`reminder_series?id=eq.${seriesId}&select=rule,status`);
    expect((series.rule as Json).frequency).toBe("daily");
    expect(series.status).toBe("active");

    // `2R-SERIES-004`: the occurrence is out of the rule, and the page says so.
    const detached = await admin(
      `reminders?series_id=eq.${seriesId}&detached_at=not.is.null&select=id`,
    );
    expect(detached).toHaveLength(1);
    await page.reload();
    await expect(page.getByText("Alterada só nesta vez").first()).toBeVisible();
  });

  test("editing this and the future ones moves the rule and keeps the earlier ones", async ({
    page,
  }) => {
    const title = "Revisar o orçamento";
    const seriesId = await seedSeries(accessToken, title);
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const reminder = row(page, title);
    await reminder.getByRole("button", { name: "Alterar repetição" }).click();
    await reminder.getByRole("radio", { name: "Esta e as futuras" }).check();
    await reminder.getByLabel("Novo horário").fill("07:30");
    await reminder.getByRole("button", { name: "Salvar alteração" }).click();

    await expect(
      page.getByText("Alterei esta e as futuras. As anteriores ficaram como estavam."),
    ).toBeVisible();

    // `2R-SERIES-003`: the wall clock moved on the rule itself, resolved in the
    // owner's zone by the database — nothing here computed an instant.
    const [series] = await admin(`reminder_series?id=eq.${seriesId}&select=anchor_hour,anchor_minute`);
    expect(series.anchor_hour).toBe(7);
    expect(series.anchor_minute).toBe(30);
  });

  test("undo restores the previous state, and a second attempt is not offered", async ({ page }) => {
    const title = "Alongar as costas";
    const seriesId = await seedSeries(accessToken, title);
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const reminder = row(page, title);
    await reminder.getByRole("button", { name: "Alterar repetição" }).click();
    await reminder.getByRole("button", { name: "Salvar alteração" }).click();
    await expect(page.getByText("Alterei somente esta ocorrência.", { exact: false })).toBeVisible();

    // `2R-SERIES-007`. The offer exists because the RPC returned a ledger row.
    const undo = page.getByRole("button", { name: "Desfazer" });
    await expect(undo).toBeVisible();
    await undo.click();

    await expect(
      page.getByText("Desfeito. A repetição voltou ao estado anterior."),
    ).toBeVisible();

    // The state really returned: nothing is detached any more.
    const detached = await admin(
      `reminders?series_id=eq.${seriesId}&detached_at=not.is.null&select=id`,
    );
    expect(detached).toHaveLength(0);

    // Trying again: the surface does not offer a second consumption of a row it
    // just spent. The ledger closing is what makes that safe rather than merely
    // hidden — `phase_2r_series_scope.sql` presses it twice and gets the
    // idempotent branch.
    await expect(page.getByRole("button", { name: "Desfazer" })).toHaveCount(0);
  });

  test("ending the series asks first, stops the future, and keeps the history", async ({ page }) => {
    const title = "Pagar o condomínio";
    const seriesId = await seedSeries(accessToken, title);
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const reminder = row(page, title);
    await reminder.getByRole("button", { name: "Encerrar repetição" }).click();

    // The first press asks. Nothing has ended.
    await expect(reminder.getByText("Encerrar esta repetição?")).toBeVisible();
    let [series] = await admin(`reminder_series?id=eq.${seriesId}&select=status`);
    expect(series.status).toBe("active");

    await reminder.getByRole("button", { name: "Sim, encerrar" }).click();
    await expect(page.getByText("Repetição encerrada. O histórico continua aqui.")).toBeVisible();

    // `2R-SERIES-005`: ended, and the past survives.
    [series] = await admin(`reminder_series?id=eq.${seriesId}&select=status`);
    expect(series.status).toBe("ended");
    const occurrences = await admin(`reminders?series_id=eq.${seriesId}&select=id`);
    expect(occurrences.length).toBeGreaterThanOrEqual(1);
  });

  test("cancelling one occurrence names what it does, and does not end the series", async ({
    page,
  }) => {
    const title = "Levar o cachorro";
    const seriesId = await seedSeries(accessToken, title);
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const reminder = row(page, title);
    await expect(
      reminder.getByText("Cancelar esta ocorrência não encerra a repetição."),
    ).toBeVisible();

    await reminder.getByRole("button", { name: "Cancelar lembrete" }).click();
    // `2R-SERIES-008`. The confirmation tells the truth about THIS shape: the
    // replacement takes the live slot, so the cancelled occurrence cannot be
    // reactivated. The standing sentence promises it can.
    await expect(reminder.getByText("não poderá ser reativada", { exact: false })).toBeVisible();
    await reminder.getByRole("button", { name: "Sim, cancelar" }).click();
    await expect(page.getByText("Lembrete cancelado.")).toBeVisible();

    // `2R-SERIES-006`: the rule kept going and materialised the next one.
    const [series] = await admin(`reminder_series?id=eq.${seriesId}&select=status`);
    expect(series.status).toBe("active");
    const live = await admin(
      `reminders?series_id=eq.${seriesId}&status=eq.scheduled&detached_at=is.null&select=id`,
    );
    expect(live).toHaveLength(1);

    // And the surface offers no Reactivate on the cancelled one, because the
    // database would refuse it: `2R-OCCURRENCE-CANCEL-IRREVERSIBLE`.
    await page.goto("/pt-BR/app/reminders?view=cancelled");
    await expect(row(page, title).getByRole("button", { name: /Reativar/ })).toHaveCount(0);
  });

  test("a series belonging to someone else cannot be reached", async ({ page }) => {
    const title = "Serie do estranho";
    const stranger = await createAccount();
    try {
      const strangerToken = await mintOnlineAccessToken({
        supabaseUrl: supabaseUrl!,
        serviceRoleKey: serviceRoleKey!,
        publishableKey: publishableKey!,
        email: stranger.email,
      });
      const strangerSeries = await seedSeries(strangerToken.accessToken, title);

      // The stranger's series provably exists before it is probed — otherwise
      // "cannot be reached" is satisfied by nothing being there.
      const [seeded] = await admin(`reminder_series?id=eq.${strangerSeries}&select=id`);
      expect(seeded.id).toBe(strangerSeries);

      await signInOnline(page, { email, locale: "pt-BR" });
      await page.goto("/pt-BR/app/reminders");
      // It is not on this owner's page at all, and no control on it exists to press.
      await expect(row(page, title)).toHaveCount(0);

      // Nor through the boundary directly, with this owner's own token.
      const refused = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_reminder_series_command_v1`, {
        method: "POST",
        headers: {
          apikey: publishableKey!,
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_series_id: strangerSeries,
          p_command: { kind: "end_series" },
          p_operation_key: `e2e-cross-owner-${Date.now()}`,
        }),
      });
      expect(refused.ok).toBe(false);
      expect(await refused.text()).toContain("Series not found");

      // And it really is untouched.
      const [after] = await admin(`reminder_series?id=eq.${strangerSeries}&select=status`);
      expect(after.status).toBe("active");
    } finally {
      await deleteAccount(stranger.userId);
    }
  });

  test("a reminder with no rule is unchanged", async ({ page }) => {
    // `2R-MODEL-004`. The row that carries no series offers none of this slice's
    // controls and keeps every one of its own.
    const title = "Lembrete avulso e2e";
    await admin("reminders", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        title,
        remind_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        important: false,
        status: "scheduled",
      }),
    });
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/reminders");

    const reminder = row(page, title);
    await expect(reminder).toBeVisible();
    await expect(reminder.getByText("Repete")).toHaveCount(0);
    await expect(reminder.getByRole("button", { name: "Alterar repetição" })).toHaveCount(0);
    await expect(reminder.getByRole("button", { name: "Encerrar repetição" })).toHaveCount(0);
    await expect(reminder.getByRole("button", { name: "Cancelar lembrete" })).toBeVisible();

    // Its confirmation keeps the standing promise, because for this row it is true.
    await reminder.getByRole("button", { name: "Cancelar lembrete" }).click();
    await expect(reminder.getByText("pode ser reativado depois", { exact: false })).toBeVisible();
  });
});
