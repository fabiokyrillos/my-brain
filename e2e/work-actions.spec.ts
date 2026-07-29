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
  readonly reopen: string;
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
    reopen: "Reabrir",
    applied: "Feito",
    refused: "Esta tarefa não está mais aqui",
    refresh: "Atualizar lista",
    resultRegion: "Resultado da ação",
  },
  {
    locale: "en",
    // Not localized: the login form renders the literal `E-mail` in both
    // locales (`app/[locale]/auth/login/page.tsx`). An `Email` label here made
    // every English journey time out on sign-in during the first deployment run.
    emailLabel: "E-mail",
    passwordLabel: "Password",
    signIn: "Sign in",
    complete: "Complete",
    wait: "Wait",
    resume: "Resume",
    reopen: "Reopen",
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
  const strangerEmail = `codex-work-2f2-stranger-${crypto.randomUUID()}@example.com`;
  const strangerPassword = `Stranger!${crypto.randomUUID()}A7`;
  let userId: string | undefined;
  let strangerId: string | undefined;
  let ownerToken: string | undefined;
  let strangerToken: string | undefined;

  async function createUser(address: string, secret: string, name: string) {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: address,
        password: secret,
        email_confirm: true,
        user_metadata: { display_name: name },
      }),
    });
    expect(response.ok, `could not create ${address}: ${await response.clone().text()}`).toBe(true);
    return ((await response.json()) as { id: string }).id;
  }

  async function tokenFor(address: string, secret: string) {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey!, "content-type": "application/json" },
      body: JSON.stringify({ email: address, password: secret }),
    });
    expect(response.ok).toBe(true);
    return ((await response.json()) as { access_token: string }).access_token;
  }

  /**
   * A PostgREST call made **as a real end user**, not as `service_role`.
   *
   * The whole tenant boundary of `list_task_command_candidates` and
   * `apply_task_command` is an `auth.uid()` predicate inside a `security definer`
   * body, so an isolation proof that used the admin key would be proving nothing.
   */
  async function asUser(path: string, token: string, init: RequestInit = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: publishableKey!,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    return { status: response.status, text: await response.text() };
  }

  test.beforeAll(async () => {
    userId = await createUser(email, password, "Work 2F.2 E2E");
    strangerId = await createUser(strangerEmail, strangerPassword, "Work 2F.2 Stranger");
    ownerToken = await tokenFor(email, password);
    strangerToken = await tokenFor(strangerEmail, strangerPassword);
  });

  // Fail-closed cleanup: both disposable users are deleted, and
  // `product_events.user_id references auth.users(id) on delete cascade` takes
  // their events with them (2F-MEASURE-002's mechanism (i)).
  test.afterAll(async () => {
    for (const id of [userId, strangerId]) {
      if (!id) continue;
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
    }
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

    test(`[${copy.locale}] a title that drifted but still overlaps applies, and renders the current title`, async ({ page }) => {
      // **Permissive drift (owner decision 4, 2F-SURFACE-004).** The clicked id
      // is authoritative and the mismatch between the rendered title and the
      // stored one is not itself a refusal — so long as the row is *in* the
      // resolution result. A drift that keeps the rendered title's tokens keeps
      // it there, which is the ordinary case: someone edits a task's title
      // elsewhere while this list is open.
      const title = `Titulo original ${crypto.randomUUID().slice(0, 8)}`;
      const drifted = `${title} revisado`;
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
      await expect(result).toContainText(copy.applied, { timeout: 30_000 });
      // The current title from resolution, never the stale rendered one.
      await expect(result).toContainText(drifted);

      const [task] = await admin(`tasks?id=eq.${taskId}&select=status`);
      expect(task.status).toBe("completed");
    });

    test(`[${copy.locale}] a rename beyond token overlap refuses instead of overwriting`, async ({ page }) => {
      // **The other side of the same rule, and PRD §5 names it explicitly:**
      // "clicked id absent (renamed beyond token overlap, status now
      // ineligible, or outside the result window) → localized refresh refusal".
      // A total rename removes the row from an `auth.uid()`-scoped resolution
      // keyed on the stale title, so the clicked id is absent and the surface
      // refuses. That is not a contradiction of permissive drift: permissive
      // drift is about *selection* never rejecting on a title mismatch, and this
      // is about a row that is not in the result to select at all.
      //
      // The first deployment-session run of this spec asserted the opposite and
      // failed here. The product was right; the assertion was wrong.
      const title = `Titulo original ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);

      await signIn(page, copy);
      await page.goto(`/${copy.locale}/app/work?view=all`);
      const target = row(page, title);
      await expect(target).toBeVisible();

      await admin(`tasks?id=eq.${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: `Zzqx ${crypto.randomUUID().slice(0, 8)}` }),
      });

      await target.getByRole("button", { name: copy.complete }).click();

      const result = target.getByRole("region", { name: copy.resultRegion });
      await expect(result).toContainText(copy.refused, { timeout: 30_000 });
      await expect(result.getByRole("button", { name: copy.refresh })).toBeVisible();

      // The refusal wrote nothing: the task is still exactly where it was.
      const [task] = await admin(`tasks?id=eq.${taskId}&select=status,completed_at`);
      expect(task.status).toBe("todo");
      expect(task.completed_at).toBeNull();
    });

    test(`[${copy.locale}] reopen_task routes from completed back to todo`, async ({ page }) => {
      const title = `Reabrir ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title, "completed");
      await admin(`tasks?id=eq.${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      });

      await signIn(page, copy);
      await page.goto(`/${copy.locale}/app/work?view=all`);

      const target = row(page, title);
      await expect(target).toBeVisible();
      // 2F-SURFACE-009: a completed row offers reopen and nothing else.
      await expect(target.getByRole("button", { name: copy.complete })).toHaveCount(0);
      await target.getByRole("button", { name: copy.reopen }).click();

      await expect(target.getByRole("region", { name: copy.resultRegion })).toContainText(copy.applied, {
        timeout: 30_000,
      });

      const [task] = await admin(`tasks?id=eq.${taskId}&select=status,completed_at`);
      expect(task.status).toBe("todo");
      expect(task.completed_at).toBeNull();
    });
  }

  test("the recorded undo operation actually undoes a Work apply", async ({ page }) => {
    // 2F-SURFACE-007's second half, executed rather than inspected: the RPC
    // records an undo operation, and that operation is compensable through the
    // deployed `public.undo_operation` router.
    const copy = COPY[0];
    const title = `Desfazer ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title);

    await signIn(page, copy);
    await page.goto(`/${copy.locale}/app/work?view=all`);
    const target = row(page, title);
    await target.getByRole("button", { name: copy.complete }).click();
    await expect(target.getByRole("region", { name: copy.resultRegion })).toContainText(copy.applied, {
      timeout: 30_000,
    });

    let [task] = await admin(`tasks?id=eq.${taskId}&select=status`);
    expect(task.status).toBe("completed");

    const undos = await admin(
      `undo_operations?user_id=eq.${userId}&entity_ids=cs.{${taskId}}&select=id,status,action_type,operation_key&order=created_at.desc`,
    );
    expect(undos.length, "no undo operation was recorded for the apply").toBeGreaterThan(0);
    expect(undos[0].status).toBe("available");
    expect(String(undos[0].operation_key)).toContain("taskcmd-v1:");

    // Executed as the owner, through the deployed contract — not as
    // `service_role`, because the undo router's authorization is the thing under
    // test.
    const undone = await asUser(`rpc/undo_operation`, ownerToken!, {
      method: "POST",
      body: JSON.stringify({ p_undo_id: undos[0].id }),
    });
    expect(undone.status, `undo_operation failed: ${undone.text}`).toBe(200);

    [task] = await admin(`tasks?id=eq.${taskId}&select=status,completed_at`);
    expect(task.status).toBe("todo");
    expect(task.completed_at).toBeNull();
  });

  test("a stranger can neither resolve nor mutate the owner's task", async ({ page }) => {
    // 2F-OWNERSHIP-001, non-vacuously and through the real entry point: the
    // owner's own resolution is asserted to return the row **first**, so the
    // stranger's empty result cannot pass by the whole mechanism being broken.
    const copy = COPY[0];
    const title = `Isolamento ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title);

    await signIn(page, copy);
    await page.goto(`/${copy.locale}/app/work?view=all`);
    await expect(row(page, title)).toBeVisible();

    const resolveArgs = {
      p_eligible_statuses: ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"],
      p_title_query: title,
      p_observed_before: new Date().toISOString(),
      p_limit: 25,
    };

    // 1. The owner resolves their own task. Positive count before absence.
    const ownerResolution = await asUser("rpc/list_task_command_candidates", ownerToken!, {
      method: "POST",
      body: JSON.stringify(resolveArgs),
    });
    expect(ownerResolution.status).toBe(200);
    const ownerRows = JSON.parse(ownerResolution.text) as { task_id: string }[];
    expect(ownerRows.some((r) => r.task_id === taskId)).toBe(true);

    // 2. The stranger, calling the identical contract with the identical
    //    arguments, resolves nothing. The RPC is `security definer`, so its
    //    `auth.uid()` predicate is the entire tenant boundary.
    const strangerResolution = await asUser("rpc/list_task_command_candidates", strangerToken!, {
      method: "POST",
      body: JSON.stringify(resolveArgs),
    });
    expect(strangerResolution.status).toBe(200);
    const strangerRows = JSON.parse(strangerResolution.text) as { task_id: string }[];
    expect(strangerRows.some((r) => r.task_id === taskId)).toBe(false);

    // 3. No fallback read exists: the stranger cannot even SELECT the row, so
    //    there is no path by which a pre-state could be assembled outside
    //    resolution.
    const strangerRead = await asUser(`tasks?id=eq.${taskId}&select=id,title`, strangerToken!);
    expect(strangerRead.status).toBe(200);
    expect(JSON.parse(strangerRead.text)).toEqual([]);

    // 4. And a direct apply — skipping the surface entirely — is refused.
    const strangerApply = await asUser("rpc/apply_task_command", strangerToken!, {
      method: "POST",
      body: JSON.stringify({
        p_task_id: taskId,
        p_action: "complete_task",
        p_patch: { status: "completed" },
        p_pre_state: {
          title, description: null, status: "todo", dueAt: null, plannedAt: null,
          manualPriority: null, completedAt: null, cancelledAt: null, intentionalNoDue: false,
          noDueReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          projectIds: [], projectNames: [], contextIds: [], contextNames: [],
          personIds: [], personNames: [], personRoles: [],
        },
        p_observed_before: new Date().toISOString(),
        p_policy_version: "2026-07-25.2",
        p_operation_key: crypto.randomUUID(),
      }),
    });
    expect(strangerApply.status).not.toBe(200);

    // 5. The owner's task is untouched by any of it.
    const [task] = await admin(`tasks?id=eq.${taskId}&select=status`);
    expect(task.status).toBe("todo");
  });

  test("the emitted task_command event carries commandOrigin 'work' and no content", async ({ page }) => {
    // 2F-ANALYTICS-002/003 observed live, not asserted on a payload builder.
    const copy = COPY[0];
    const title = `Evento ${crypto.randomUUID().slice(0, 8)}`;
    await seedTask(title);

    await signIn(page, copy);
    await page.goto(`/${copy.locale}/app/work?view=all`);
    const target = row(page, title);
    await target.getByRole("button", { name: copy.complete }).click();
    await expect(target.getByRole("region", { name: copy.resultRegion })).toContainText(copy.applied, {
      timeout: 30_000,
    });

    // **Read as the owner, not as `service_role`.** `public.product_events` is
    // append-only and grants SELECT to `authenticated` under RLS; the admin key
    // is refused with `42501` ("permission denied for table product_events"),
    // which the first deployment-session run confirmed. That posture is the
    // reason 2F-MEASURE-002's exclusion mechanism (iii) works at all, and it is
    // why the observation below is owner-scoped by construction.
    //
    // The event is emitted inside `after()`, so it lands shortly after the
    // response. Polled rather than slept on.
    let events: Record<string, unknown>[] = [];
    await expect
      .poll(async () => {
        const response = await asUser(
          `product_events?event_name=eq.task_command_applied&select=surface,properties,created_at&order=created_at.desc&limit=5`,
          ownerToken!,
        );
        if (response.status !== 200) return 0;
        events = JSON.parse(response.text) as Record<string, unknown>[];
        return events.length;
      }, { timeout: 30_000 })
      .toBeGreaterThan(0);

    const properties = events[0].properties as Record<string, unknown>;
    expect(properties.commandOrigin).toBe("work");
    expect(properties.applyRoute).toBe("direct");
    expect(properties.outcomeCategory).toBe("applied");
    expect(events[0].surface).toBe("task_command");

    // 2F-ANALYTICS-003: no task title, no user text, anywhere in the payload.
    expect(JSON.stringify(properties)).not.toContain(title);
    for (const event of events) {
      expect(JSON.stringify(event.properties)).not.toContain(title);
    }

    // And the status transition continues with its own allowlisted shape.
    const statusResponse = await asUser(
      `product_events?event_name=eq.task_status_changed&select=surface,properties&order=created_at.desc&limit=1`,
      ownerToken!,
    );
    expect(statusResponse.status).toBe(200);
    const statusEvents = JSON.parse(statusResponse.text) as Record<string, unknown>[];
    expect(statusEvents.length).toBeGreaterThan(0);
    expect(statusEvents[0].surface).toBe("work");
    expect(Object.keys(statusEvents[0].properties as object).sort()).toEqual(["fromStatus", "toStatus"]);
  });

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
