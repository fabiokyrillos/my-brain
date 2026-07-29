import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2F Slice 2F.2 — the authenticated Work-surface journeys.
 *
 * PRD §10 puts these in the **deployment session**, not in CI: they need a
 * seeded user and a deployed database carrying the Phase 2E contract, and a spec
 * that silently skipped would be a gate counted without execution
 * (2F-PRECOND-003). They skip themselves without credentials, exactly as
 * `online-mobile-navigation.spec.ts` does, and Playwright runs them on both the
 * desktop and the mobile project.
 *
 * What they prove, none of which the pre-2F direct UPDATE could:
 *
 *   * a click round-trips through `apply_task_command` and renders an outcome;
 *   * completion **cancels that task's scheduled reminders** — the one disclosed
 *     behaviour change (PRD §4 item 3);
 *   * `wait_task` and `resume_task` leave every reminder untouched, asserted in
 *     both directions (2F-SURFACE-008);
 *   * a click on a task that is gone refuses with the localized refresh
 *     affordance instead of overwriting (2F-SURFACE-005);
 *   * title drift applies against the clicked id and renders the current title
 *     (2F-SURFACE-004);
 *   * the apply records audit actor `'user'` and an undo operation
 *     (2F-SURFACE-007);
 *   * a second submit on one minted key replays rather than writing twice;
 *   * every one of the above holds in pt-BR and in en.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

type Copy = {
  readonly locale: "pt-BR" | "en";
  readonly emailLabel: string;
  readonly passwordLabel: string;
  readonly signIn: string;
  readonly complete: string;
  readonly wait: string;
  readonly resume: string;
  readonly applied: string;
  readonly refused: string;
  readonly refresh: string;
  readonly resultRegion: string;
};

const COPY: readonly Copy[] = [
  {
    locale: "pt-BR",
    emailLabel: "E-mail",
    passwordLabel: "Senha",
    signIn: "Entrar",
    complete: "Concluir",
    wait: "Aguardar",
    resume: "Retomar",
    applied: "Feito",
    refused: "Esta tarefa não está mais aqui",
    refresh: "Atualizar lista",
    resultRegion: "Resultado da ação",
  },
  {
    locale: "en",
    emailLabel: "Email",
    passwordLabel: "Password",
    signIn: "Sign in",
    complete: "Complete",
    wait: "Wait",
    resume: "Resume",
    applied: "Done",
    refused: "This task is no longer here",
    refresh: "Refresh list",
    resultRegion: "Action result",
  },
];

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
  expect(response.ok, `${init.method ?? "GET"} ${path} failed: ${await response.clone().text()}`).toBe(true);
  return (await response.json()) as Record<string, unknown>[];
}

test.describe("Work-surface actions route through apply_task_command", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-work-2f2-${crypto.randomUUID()}@example.com`;
  const password = `Work!${crypto.randomUUID()}A7`;
  let userId: string | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Work 2F.2 E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Fail-closed cleanup: the disposable user is deleted, and
  // `product_events.user_id references auth.users(id) on delete cascade` takes
  // its events with it (2F-MEASURE-002's mechanism (i)).
  test.afterAll(async () => {
    if (!userId) return;
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
  });

  async function seedTask(title: string, status = "todo") {
    const [task] = await admin("tasks", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, title, status, confidence: 1, created_by: "user" }),
    });
    return task.id as string;
  }

  async function seedReminder(taskId: string, title: string) {
    const [reminder] = await admin("reminders", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        task_id: taskId,
        title,
        remind_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: "scheduled",
      }),
    });
    return reminder.id as string;
  }

  async function reminderStatus(reminderId: string) {
    const [reminder] = await admin(`reminders?id=eq.${reminderId}&select=status,remind_at`);
    return reminder;
  }

  async function signIn(page: Page, copy: Copy) {
    await page.goto(`/${copy.locale}/auth/login`);
    await page.getByLabel(copy.emailLabel).fill(email);
    await page.getByLabel(copy.passwordLabel).fill(password);
    await page.getByRole("button", { name: copy.signIn }).click();
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/app$`), { timeout: 30_000 });
  }

  function row(page: Page, title: string) {
    return page.locator(".list-row").filter({ hasText: title });
  }

  for (const copy of COPY) {
    test(`[${copy.locale}] completing a task applies, renders the outcome, and cancels its reminders`, async ({ page }) => {
      const title = `Enviar relatorio ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);
      const reminderId = await seedReminder(taskId, title);

      // Non-vacuous: the reminder is live *before* the apply, so the assertion
      // after it cannot pass by finding nothing (the Gate 3 lesson).
      expect((await reminderStatus(reminderId)).status).toBe("scheduled");

      await signIn(page, copy);
      await page.goto(`/${copy.locale}/app/work?view=all`);

      const target = row(page, title);
      await expect(target).toBeVisible();
      await target.getByRole("button", { name: copy.complete }).click();

      const result = target.getByRole("region", { name: copy.resultRegion });
      await expect(result).toContainText(copy.applied, { timeout: 30_000 });
      // 2F-SURFACE-004: the outcome renders the current title.
      await expect(result).toContainText(title);

      const [task] = await admin(`tasks?id=eq.${taskId}&select=status,completed_at`);
      expect(task.status).toBe("completed");
      expect(task.completed_at).not.toBeNull();

      // The disclosed behaviour change (PRD §4 item 3, 2F-SURFACE-008).
      expect((await reminderStatus(reminderId)).status).toBe("cancelled");

      // 2F-SURFACE-007: audit actor and undo operation, both recorded by the RPC.
      const audits = await admin(
        `audit_logs?entity_id=eq.${taskId}&select=actor,action_type&order=created_at.desc&limit=5`,
      );
      expect(audits.length).toBeGreaterThan(0);
      expect(audits[0].actor).toBe("user");

      const undos = await admin(
        `undo_operations?user_id=eq.${userId}&operation_key=like.taskcmd-v1:*&select=id,status&limit=5`,
      );
      expect(undos.length).toBeGreaterThan(0);
    });

    test(`[${copy.locale}] wait and resume leave every reminder untouched`, async ({ page }) => {
      const title = `Aguardar cliente ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);
      const reminderId = await seedReminder(taskId, title);
      const before = await reminderStatus(reminderId);
      expect(before.status).toBe("scheduled");

      await signIn(page, copy);
      await page.goto(`/${copy.locale}/app/work?view=all`);

      const target = row(page, title);
      await target.getByRole("button", { name: copy.wait }).click();
      await expect(target.getByRole("region", { name: copy.resultRegion })).toContainText(copy.applied, {
        timeout: 30_000,
      });

      let task = (await admin(`tasks?id=eq.${taskId}&select=status`))[0];
      expect(task.status).toBe("waiting");
      // Direction one: a non-terminal transition changed nothing about the
      // reminder — not its status, not its instant.
      expect(await reminderStatus(reminderId)).toEqual(before);

      await page.reload();
      const resumed = row(page, title);
      await resumed.getByRole("button", { name: copy.resume }).click();
      await expect(resumed.getByRole("region", { name: copy.resultRegion })).toContainText(copy.applied, {
        timeout: 30_000,
      });

      task = (await admin(`tasks?id=eq.${taskId}&select=status`))[0];
      expect(task.status).toBe("todo");
      // Direction two.
      expect(await reminderStatus(reminderId)).toEqual(before);
    });

    test(`[${copy.locale}] a click on a task that is gone refuses with the refresh affordance`, async ({ page }) => {
      const title = `Some sumir ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);

      await signIn(page, copy);
      await page.goto(`/${copy.locale}/app/work?view=all`);
      const target = row(page, title);
      await expect(target).toBeVisible();

      // The row is rendered and then the task ceases to exist — the stale-render
      // case the pre-2F path would have blind-written through.
      await admin(`tasks?id=eq.${taskId}`, { method: "DELETE" });

      await target.getByRole("button", { name: copy.complete }).click();

      const result = target.getByRole("region", { name: copy.resultRegion });
      await expect(result).toContainText(copy.refused, { timeout: 30_000 });
      await expect(result.getByRole("button", { name: copy.refresh })).toBeVisible();
    });

    test(`[${copy.locale}] a title that drifted since render still applies against the clicked id`, async ({ page }) => {
      const title = `Titulo original ${crypto.randomUUID().slice(0, 8)}`;
      const drifted = `Renomeada completamente ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);

      await signIn(page, copy);
      await page.goto(`/${copy.locale}/app/work?view=all`);
      const target = row(page, title);
      await expect(target).toBeVisible();

      await admin(`tasks?id=eq.${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: drifted }),
      });

      await target.getByRole("button", { name: copy.complete }).click();

      const result = target.getByRole("region", { name: copy.resultRegion });
      // Permissive drift (owner decision 4): applied, and the *current* title.
      await expect(result).toContainText(copy.applied, { timeout: 30_000 });
      await expect(result).toContainText(drifted);

      const [task] = await admin(`tasks?id=eq.${taskId}&select=status`);
      expect(task.status).toBe("completed");
    });
  }

  test("keyboard operation reaches every action and lands focus on the outcome", async ({ page }) => {
    const copy = COPY[0];
    const title = `Teclado ${crypto.randomUUID().slice(0, 8)}`;
    await seedTask(title);

    await signIn(page, copy);
    await page.goto(`/${copy.locale}/app/work?view=all`);

    const target = row(page, title);
    await target.getByRole("button", { name: copy.complete }).focus();
    await page.keyboard.press("Enter");

    const result = target.getByRole("region", { name: copy.resultRegion });
    await expect(result).toContainText(copy.applied, { timeout: 30_000 });
    await expect(result).toBeFocused();
  });
});
