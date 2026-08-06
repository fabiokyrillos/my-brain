import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice G4's authenticated acceptance for History (UX-13, UX-21, UX-27, UX-28).
 *
 * Before this slice the page printed `action_type.replaceAll("_", " ")`,
 * `audit_logs.reason` and `actor · entity_type · date` — four raw values, no
 * filters, and no way to reach the object any row was about.
 *
 * The audit rows this journey reads are produced by *doing the real thing*:
 * creating a task through the form, editing a project through its detail page.
 * Nothing inserts into `audit_logs` directly, so what is asserted is what the
 * product actually writes.
 *
 * A disposable account created and deleted by the harness; every subject is a
 * synthetic string with a random suffix, and no real history is used.
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
  const password = `History!${crypto.randomUUID()}A7`;
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

test.describe("history reads as sentences, filters in the database, and links to its subject", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  let owner: { email: string; password: string; id: string };

  test.beforeAll(async () => {
    owner = await createAccount("history");
  });

  // Deleting the account cascades to its tasks, projects and audit rows, so
  // nothing this journey created outlives it.
  test.afterAll(async () => {
    await deleteAccount(owner?.id);
  });

  async function signIn(page: Page, locale: "pt-BR" | "en" = "pt-BR") {
    await signInOnline(page, { email: owner.email, locale });
  }

  /**
   * Produces the audit rows the calling test reads, under names unique to that
   * test. Shared names would accumulate across tests in one worker and make a
   * legitimately distinct pair of rows look like a duplicate.
   */
  async function seedHistory(page: Page) {
    const taskTitle = `Preparar relatório ${crypto.randomUUID().slice(0, 8)}`;
    const projectName = `Atlas ${crypto.randomUUID().slice(0, 8)}`;

    await page.goto("/pt-BR/app/work?view=all");
    const field = page.getByLabel("Nova tarefa", { exact: true });
    await field.fill(taskTitle);
    await page.getByRole("button", { name: "Adicionar nova tarefa" }).click();
    await expect(page.getByText("Adicionado.")).toBeVisible({ timeout: 30_000 });

    await page.goto("/pt-BR/app/projects");
    await page.getByRole("textbox", { name: "Nome do projeto" }).fill(projectName);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByRole("link", { name: new RegExp(projectName) })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: new RegExp(projectName) }).click();
    await page.getByRole("button", { name: "Editar" }).click();
    // One field, so the row renders as a single-sentence change.
    await page.getByLabel("Situação").selectOption("paused");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator(".entity-edit-feedback.success")).toBeVisible({ timeout: 30_000 });

    return { taskTitle, projectName };
  }

  test("every event is a sentence, and the subject opens", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";

    await signIn(page);
    const { taskTitle, projectName } = await seedHistory(page);

    await page.goto("/pt-BR/app/history");

    // UX-13/UX-21: sentences, not `task created` / `user · task`.
    await expect(page.getByText(`Você adicionou a tarefa “${taskTitle}” à lista`)).toBeVisible({
      timeout: 30_000,
    });
    // UX-28: the change is described in the reader's language, from the
    // before/after payload — and the project's own status vocabulary is used,
    // not the task one.
    await expect(
      page.getByText(`Você alterou a situação de “${projectName}” de Ativo para Pausado`),
    ).toBeVisible();

    // No raw database vocabulary anywhere on the page, and no SQL-authored prose.
    const body = page.locator("body");
    await expect(body).not.toContainText("task_created");
    await expect(body).not.toContainText("update_project");
    await expect(body).not.toContainText("Task created");
    await expect(body).not.toContainText("Owner edited the project");

    // UX-27, live: one creation writes a trigger row and an RPC row. Both are
    // shown — an audit trail hides nothing — but they must not be the same
    // sentence twice, which is the duplication the finding reported.
    const creationSentences = await page
      .locator(".history-event")
      .filter({ hasText: taskTitle })
      .locator(".history-sentence")
      .allTextContents();
    expect(creationSentences.length).toBeGreaterThan(0);
    expect(new Set(creationSentences).size).toBe(creationSentences.length);

    // The subject is reachable.
    const event = page.locator(".history-event").filter({ hasText: taskTitle }).first();
    const open = event.getByRole("link", { name: "Abrir" });
    await expect(open).toBeVisible();
    // The one control on a row a finger aims at.
    if (mobile) expect((await open.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await open.click();
    await expect(page).toHaveURL(/\/app\/work\//);
    await expect(page.getByRole("heading", { name: taskTitle, level: 1 })).toBeVisible();

    // The list never scrolls sideways, on either viewport.
    await page.goto("/pt-BR/app/history");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("each filter narrows the list in the database, and combines with the others", async ({
    page,
  }) => {
    // Seeds, then walks nine server-rendered filter combinations; the default
    // per-test budget is sized for one interaction, not a matrix.
    test.setTimeout(180_000);
    await signIn(page);
    const { taskTitle, projectName } = await seedHistory(page);
    await page.goto("/pt-BR/app/history");

    const taskEvent = page.getByText(`Você adicionou a tarefa “${taskTitle}” à lista`);
    const projectEvent = page.getByText(new RegExp(`alterou a situação de “${projectName}”`));

    // Item type, on its own.
    await page.goto("/pt-BR/app/history?entity=task");
    await expect(taskEvent).toBeVisible({ timeout: 30_000 });
    await expect(projectEvent).toHaveCount(0);

    await page.goto("/pt-BR/app/history?entity=project");
    await expect(projectEvent).toBeVisible();
    await expect(taskEvent).toHaveCount(0);

    // Action category, on its own.
    await page.goto("/pt-BR/app/history?category=created");
    await expect(taskEvent).toBeVisible();
    await expect(projectEvent).toHaveCount(0);

    await page.goto("/pt-BR/app/history?category=changed");
    await expect(projectEvent).toBeVisible();

    // Actor, on its own — everything here was done by the owner.
    await page.goto("/pt-BR/app/history?actor=user");
    await expect(taskEvent).toBeVisible();
    await page.goto("/pt-BR/app/history?actor=system");
    await expect(taskEvent).toHaveCount(0);

    // Combined, and the summary says what is applied.
    await page.goto("/pt-BR/app/history?entity=task&category=created&actor=user");
    await expect(taskEvent).toBeVisible();
    const summary = page.getByRole("list", { name: "Filtros ativos" });
    await expect(summary).toContainText("Tipo de item: tarefa");
    await expect(summary).toContainText("Tipo de ação: Criação");
    await expect(summary).toContainText("Quem: Você");

    // A combination that matches nothing says so, and offers the way back.
    await page.goto("/pt-BR/app/history?entity=task&category=failed");
    await expect(page.getByText("Nada encontrado")).toBeVisible();
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL(/\/app\/history$/);
    await expect(taskEvent).toBeVisible();
  });

  test("date boundaries include the whole of the chosen day", async ({ page }) => {
    await signIn(page);
    const { taskTitle } = await seedHistory(page);

    // Resolved in the owner's own timezone, which is what the page filters in.
    const [profile] = await admin(`profiles?user_id=eq.${owner.id}&select=timezone`);
    const timezone = (profile?.timezone as string) || "America/Sao_Paulo";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

    const taskEvent = page.getByText(`Você adicionou a tarefa “${taskTitle}” à lista`);

    // Today, as both ends of the range: an exclusive end that used midnight of
    // the chosen day would show nothing here.
    await page.goto(`/pt-BR/app/history?from=${today}&to=${today}`);
    await expect(taskEvent).toBeVisible({ timeout: 30_000 });

    // A window that ended before any of it happened.
    await page.goto("/pt-BR/app/history?from=2020-01-01&to=2020-01-02");
    await expect(taskEvent).toHaveCount(0);
    await expect(page.getByText("Nada encontrado")).toBeVisible();

    // Reversed input is normalized rather than rejected.
    await page.goto(`/pt-BR/app/history?from=${today}&to=2020-01-01`);
    const summary = page.getByRole("list", { name: "Filtros ativos" });
    await expect(summary).toContainText("De: 2020-01-01");
    await expect(summary).toContainText(`Até: ${today}`);
    await expect(taskEvent).toBeVisible();
  });

  test("a malformed address renders the history and admits what it ignored", async ({ page }) => {
    await signIn(page);
    const { taskTitle } = await seedHistory(page);

    await page.goto(
      "/pt-BR/app/history?from=31/07/2026&actor=root&entity=widget&category=everything&subject=nope&page=abc",
    );

    // Not a 400, not an empty page: the unfiltered history, and an honest note.
    await expect(page.getByText(`Você adicionou a tarefa “${taskTitle}” à lista`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Alguns filtros do endereço não foram reconhecidos e foram ignorados."),
    ).toBeVisible();
    // Nothing was applied, so nothing claims to be.
    await expect(page.getByRole("list", { name: "Filtros ativos" })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("root");
  });

  test("a deleted subject keeps its event, loses its link, and says so", async ({ page }) => {
    await signIn(page);
    const { taskTitle } = await seedHistory(page);

    const [task] = await admin(
      `tasks?user_id=eq.${owner.id}&title=eq.${encodeURIComponent(taskTitle)}&select=id`,
    );
    expect(task).toBeTruthy();

    await page.goto("/pt-BR/app/history");
    await expect(page.getByText(`Você adicionou a tarefa “${taskTitle}” à lista`)).toBeVisible({
      timeout: 30_000,
    });

    // `audit_logs.entity_id` has no foreign key, so the audit row survives the
    // task — which is the whole point of an append-only trail.
    await admin(`tasks?id=eq.${task.id as string}`, { method: "DELETE" });

    await page.reload();
    // The event is still here, without the name it can no longer prove.
    await expect(page.getByText("Você adicionou a tarefa à lista").first()).toBeVisible();
    await expect(page.getByText(taskTitle)).toHaveCount(0);
    await expect(page.getByText("Este item não está mais disponível.").first()).toBeVisible();

    // And no link was left pointing at a page that would 404.
    const gone = page.locator(".history-event").filter({ hasText: "Este item não está mais disponível." }).first();
    await expect(gone.getByRole("link", { name: "Abrir" })).toHaveCount(0);
  });

  test("one reader never sees another's history", async ({ page }) => {
    await signIn(page);
    const { taskTitle, projectName } = await seedHistory(page);

    const stranger = await createAccount("history-stranger");
    try {
      // Become someone else in this same context: the previous session's
      // cookie has to go before another one is installed over it.
      await page.context().clearCookies();
      await signInOnline(page, { email: stranger.email, locale: "pt-BR" });

      await page.goto("/pt-BR/app/history");
      await expect(page.getByText("Nenhuma alteração")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("body")).not.toContainText(taskTitle);
      await expect(page.locator("body")).not.toContainText(projectName);

      // Filtering by the other account's object id returns nothing, rather than
      // confirming that the object exists.
      const [task] = await admin(
        `tasks?user_id=eq.${owner.id}&title=eq.${encodeURIComponent(taskTitle)}&select=id`,
      );
      if (task) {
        await page.goto(`/pt-BR/app/history?subject=${task.id as string}`);
        await expect(page.getByText("Nada encontrado")).toBeVisible();
        await expect(page.locator("body")).not.toContainText(taskTitle);
      }
    } finally {
      await deleteAccount(stranger.id);
    }
  });

  test("the filter controls are named, keyboard-reachable and localized", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";

    await signIn(page);
    await page.goto("/pt-BR/app/history");

    // On a phone the controls start folded so the list keeps the screen; the
    // summary is the disclosure, and it is a real 44 px target.
    if (mobile) {
      const toggle = page.getByText("Filtros", { exact: true });
      await expect(toggle).toBeVisible();
      expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await toggle.click();
    }

    for (const label of ["De", "Até", "Quem", "Tipo de item", "Tipo de ação"]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    // Real date inputs, not free text.
    await expect(page.getByLabel("De", { exact: true })).toHaveAttribute("type", "date");
    if (mobile) {
      expect((await page.getByLabel("Quem", { exact: true }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    // The options are words, not enum values.
    await expect(page.getByLabel("Quem", { exact: true }).getByRole("option", { name: "Você", exact: true })).toHaveCount(1);
    await expect(
      page.getByLabel("Tipo de item", { exact: true }).getByRole("option", { name: "tarefa", exact: true }),
    ).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText("pending_question");

    // Applying by keyboard alone puts the filter in the URL.
    await page.getByLabel("Quem", { exact: true }).selectOption("user");
    await page.getByRole("button", { name: "Aplicar filtros" }).press("Enter");
    await expect(page).toHaveURL(/actor=user/);
  });

  test("the English surface uses English throughout", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    await signIn(page, "en");
    const { taskTitle, projectName } = await seedHistory(page);

    await page.goto("/en/app/history");

    await expect(page.getByRole("heading", { name: "Change history", level: 1 })).toBeVisible();
    await expect(page.getByText(`You added the task “${taskTitle}” to the list`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(`You changed the state of “${projectName}” from Active to Paused`),
    ).toBeVisible();

    // Folded by default on a phone, so the list keeps the screen.
    if (mobile) await page.getByText("Filters", { exact: true }).click();
    for (const label of ["From", "To", "Who", "Item type", "Action type"]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }

    // No Portuguese, and no raw tokens either.
    const body = page.locator("body");
    await expect(body).not.toContainText("Você");
    await expect(body).not.toContainText("tarefa");
    await expect(body).not.toContainText("update_project");
  });
});
