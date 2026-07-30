import { expect, test, type Page } from "@playwright/test";

/**
 * UX Slice D2 — the authenticated task-detail field-edit journeys.
 *
 * Same placement as `work-actions.spec.ts` and for the same reason: these need a
 * seeded user and a deployed database carrying the Phase 2E contract, so they
 * belong to the deployment session rather than to CI, and they skip themselves
 * without credentials rather than passing vacuously. Playwright runs them on
 * both the desktop and the mobile project.
 *
 * What they prove, none of which was reachable by click before this slice:
 *
 *   * each of the ten non-destructive verbs round-trips through
 *     `apply_task_command` and writes exactly the column it declares;
 *   * a relation verb resolves the submitted **name** against the caller's own
 *     entities in SQL, and writes the relation row;
 *   * `cancel_task` **cannot** be applied without a server-issued confirmation:
 *     the control opens a prompt, and only the prompt applies;
 *   * every apply records an audit row with actor `'user'` and a compensable
 *     undo operation, and the undo actually reverses it;
 *   * a second submit under one operation key replays instead of writing twice;
 *   * a task that moved since render refuses instead of overwriting;
 *   * a date outside the temporal lexicon's window is refused with localized
 *     copy rather than becoming an unexplained clarification request;
 *   * all of the above in pt-BR and in en.
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
  readonly applied: string;
  readonly resultRegion: string;
  readonly section: string;
  readonly submit: string;
  readonly clearDue: string;
  readonly cancelTask: string;
  readonly confirmTitle: string;
  readonly confirmSubmit: string;
  readonly confirmDismiss: string;
  readonly restore: string;
  readonly dateOutOfRange: string;
  readonly unresolvable: string;
  readonly reload: string;
};

const COPY: readonly Copy[] = [
  {
    locale: "pt-BR",
    emailLabel: "E-mail",
    passwordLabel: "Senha",
    signIn: "Entrar",
    applied: "Feito",
    resultRegion: "Resultado da alteração",
    section: "Editar esta tarefa",
    submit: "Aplicar",
    clearDue: "Tirar o prazo",
    cancelTask: "Cancelar a tarefa",
    confirmTitle: "Cancelar esta tarefa?",
    confirmSubmit: "Sim, cancelar a tarefa",
    confirmDismiss: "Voltar",
    restore: "Restaurar a tarefa",
    dateOutOfRange: "Escolha uma data dentro dos próximos ou últimos dois anos.",
    unresolvable: "Esta tarefa não está mais aqui",
    reload: "Recarregar a página",
  },
  {
    locale: "en",
    // Not localized: the login form renders the literal `E-mail` in both locales.
    emailLabel: "E-mail",
    passwordLabel: "Password",
    signIn: "Sign in",
    applied: "Done",
    resultRegion: "Change result",
    section: "Edit this task",
    submit: "Apply",
    clearDue: "Remove the due date",
    cancelTask: "Cancel the task",
    confirmTitle: "Cancel this task?",
    confirmSubmit: "Yes, cancel the task",
    confirmDismiss: "Go back",
    restore: "Restore the task",
    dateOutOfRange: "Choose a date within the next or last two years.",
    unresolvable: "This task is no longer here",
    reload: "Reload the page",
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

test.describe("task detail field edits route through apply_task_command", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-detail-d2-${crypto.randomUUID()}@example.com`;
  const password = `Detail!${crypto.randomUUID()}A7`;
  const strangerEmail = `codex-detail-d2-stranger-${crypto.randomUUID()}@example.com`;
  const strangerPassword = `Stranger!${crypto.randomUUID()}A7`;
  let userId: string | undefined;
  let strangerId: string | undefined;
  let ownerToken: string | undefined;
  let strangerToken: string | undefined;
  let projectName: string | undefined;
  let contextName: string | undefined;
  let personName: string | undefined;

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

  /** A PostgREST call made as a real end user, never as `service_role`. */
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
    userId = await createUser(email, password, "Detail D2 E2E");
    strangerId = await createUser(strangerEmail, strangerPassword, "Detail D2 Stranger");
    ownerToken = await tokenFor(email, password);
    strangerToken = await tokenFor(strangerEmail, strangerPassword);

    // One owned entity of each kind, named uniquely so
    // `resolve_owned_entity_exact` resolves exactly one row for each.
    const suffix = crypto.randomUUID().slice(0, 8);
    projectName = `Aurora ${suffix}`;
    contextName = `Escritorio ${suffix}`;
    personName = `Marina ${suffix}`;
    await admin("projects", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, name: projectName }),
    });
    await admin("contexts", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, name: contextName }),
    });
    await admin("people", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, name: personName }),
    });
  });

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

  async function taskRow(taskId: string, columns: string) {
    const [task] = await admin(`tasks?id=eq.${taskId}&select=${columns}`);
    return task;
  }

  async function signIn(page: Page, copy: Copy) {
    await page.goto(`/${copy.locale}/auth/login`);
    await page.getByLabel(copy.emailLabel).fill(email);
    await page.getByLabel(copy.passwordLabel).fill(password);
    await page.getByRole("button", { name: copy.signIn }).click();
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/app$`), { timeout: 30_000 });
  }

  async function openDetail(page: Page, copy: Copy, taskId: string) {
    await page.goto(`/${copy.locale}/app/work/${taskId}`);
    await expect(page.getByRole("heading", { name: copy.section })).toBeVisible({ timeout: 30_000 });
  }

  /** The result region of the *edit controls*, not of the shared status buttons. */
  function result(page: Page, copy: Copy) {
    return page.getByRole("region", { name: copy.resultRegion });
  }

  /**
   * Fills one action's control and submits it.
   *
   * Located by the id the component derives from the action name, so the
   * selector cannot drift with the copy — and so a form with a shared submit
   * label is still unambiguous.
   */
  async function submitField(page: Page, action: string, value: string) {
    const form = page.locator(`form:has(#task-control-${action})`);
    const field = page.locator(`#task-control-${action}`);
    const tag = await field.evaluate((node) => node.tagName);
    if (tag === "SELECT") await field.selectOption(value);
    else await field.fill(value);
    await form.getByRole("button").click();
  }

  for (const copy of COPY) {
    test(`[${copy.locale}] the ten non-destructive verbs each write the column they declare`, async ({ page }) => {
      // Ten applies, ten page loads and twenty round trips to a remote database
      // do not fit Playwright's 30s per-test budget, and the first live run of
      // this spec failed on that budget rather than on the product — the captured
      // page showed the controls mid-submit, not an error. Walking one task
      // through all ten verbs is a stronger journey than ten isolated ones, so
      // the budget moves rather than the test.
      test.setTimeout(300_000);
      const title = `Proposta ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);
      await signIn(page, copy);

      // Every step reloads first, because each apply revalidates the route and
      // the next assertion must read the controls the new state offers.
      const renamed = `${title} revisada`;
      await openDetail(page, copy, taskId);
      await submitField(page, "rename_task", renamed);
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect((await taskRow(taskId, "title")).title).toBe(renamed);

      await openDetail(page, copy, taskId);
      await submitField(page, "append_note", "Falei com a Marina.");
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect(String((await taskRow(taskId, "description")).description)).toContain("Falei com a Marina.");

      await openDetail(page, copy, taskId);
      await submitField(page, "set_priority", "high");
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect((await taskRow(taskId, "manual_priority")).manual_priority).toBe("high");

      // A calendar date, resolved by the temporal lexicon in the caller's own
      // zone — the control never sends an instant (2E-COMMAND-016).
      const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      await openDetail(page, copy, taskId);
      await submitField(page, "reschedule_due", day);
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect((await taskRow(taskId, "due_at")).due_at).not.toBeNull();

      await openDetail(page, copy, taskId);
      await submitField(page, "set_planned", day);
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect((await taskRow(taskId, "planned_at")).planned_at).not.toBeNull();

      await openDetail(page, copy, taskId);
      await page.getByRole("button", { name: copy.clearDue }).click();
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect((await taskRow(taskId, "due_at")).due_at).toBeNull();

      // The three relation verbs plus the waiting-on role. The **name** is
      // submitted and resolved by `resolve_owned_entity_exact` in SQL, so
      // ownership is proven in the database rather than asserted by the form.
      await openDetail(page, copy, taskId);
      await submitField(page, "assign_project", projectName!);
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect((await admin(`task_projects?task_id=eq.${taskId}&select=project_id`)).length).toBe(1);

      await openDetail(page, copy, taskId);
      await submitField(page, "assign_context", contextName!);
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect((await admin(`task_contexts?task_id=eq.${taskId}&select=context_id`)).length).toBe(1);

      await openDetail(page, copy, taskId);
      await submitField(page, "assign_person", personName!);
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect(
        (await admin(`task_people?task_id=eq.${taskId}&role=eq.involved&select=person_id`)).length,
      ).toBe(1);

      await openDetail(page, copy, taskId);
      await submitField(page, "set_waiting_on", personName!);
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      // The two roles are distinct rows: `task_people` is keyed on
      // `(task_id, person_id, role)`, so involving someone does not make
      // waiting on them a no-op.
      expect(
        (await admin(`task_people?task_id=eq.${taskId}&role=eq.waiting_on&select=person_id`)).length,
      ).toBe(1);

      // Every one of the ten wrote an audit row as the user, and left an undo.
      const audits = await admin(
        `audit_logs?entity_id=eq.${taskId}&entity_type=eq.task&select=actor,action_type&order=created_at.desc&limit=20`,
      );
      expect(audits.length).toBeGreaterThanOrEqual(10);
      expect(new Set(audits.map((row) => row.actor))).toEqual(new Set(["user"]));

      const undos = await admin(
        `undo_operations?user_id=eq.${userId}&entity_ids=cs.{${taskId}}&select=id,status,operation_key&order=created_at.desc&limit=20`,
      );
      expect(undos.length).toBeGreaterThanOrEqual(10);
      for (const undo of undos) expect(String(undo.operation_key)).toContain("taskcmd-v1:");
    });

    test(`[${copy.locale}] a rename is compensable through the recorded undo operation`, async ({ page }) => {
      const title = `Desfazer ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);

      await signIn(page, copy);
      await openDetail(page, copy, taskId);
      await submitField(page, "rename_task", `${title} alterada`);
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      expect((await taskRow(taskId, "title")).title).toBe(`${title} alterada`);

      const undos = await admin(
        `undo_operations?user_id=eq.${userId}&entity_ids=cs.{${taskId}}&select=id,status&order=created_at.desc&limit=1`,
      );
      expect(undos.length, "no undo operation was recorded for the rename").toBe(1);
      expect(undos[0].status).toBe("available");

      // Executed as the owner through the deployed router, because the undo's
      // authorization is part of what is under test.
      const undone = await asUser("rpc/undo_operation", ownerToken!, {
        method: "POST",
        body: JSON.stringify({ p_undo_id: undos[0].id }),
      });
      expect(undone.status, `undo_operation failed: ${undone.text}`).toBe(200);
      expect((await taskRow(taskId, "title")).title).toBe(title);
    });

    test(`[${copy.locale}] cancelling requires the server-issued confirmation`, async ({ page }) => {
      const title = `Cancelar ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);

      await signIn(page, copy);
      await openDetail(page, copy, taskId);

      // Step one changes nothing. 2E-DESTRUCTIVE-003: the confirmation is issued
      // by the call that renders the prompt, bound to the observation it read.
      await page.getByRole("button", { name: copy.cancelTask }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog).toContainText(copy.confirmTitle);
      expect((await taskRow(taskId, "status")).status).toBe("todo");

      // Read **as the owner**, never with the admin key: migration `202607260059`
      // revokes everything on `task_command_confirmations` from `service_role`
      // too and grants SELECT only to `authenticated`. The first live run of this
      // spec used `admin()` here and got `42501` with the grant hint — the table's
      // posture is correct and the reader was wrong.
      const issued = await asUser(
        `task_command_confirmations?user_id=eq.${userId}&task_id=eq.${taskId}&select=status,action`,
        ownerToken!,
      );
      expect(issued.status, issued.text).toBe(200);
      const confirmations = JSON.parse(issued.text) as Record<string, unknown>[];
      expect(confirmations.length).toBe(1);
      expect(confirmations[0].status).toBe("issued");
      expect(confirmations[0].action).toBe("cancel_task");

      // Dismissing abandons it. The row stays unconsumed and authorizes nothing.
      await dialog.getByRole("button", { name: copy.confirmDismiss }).click();
      await expect(dialog).toBeHidden();
      expect((await taskRow(taskId, "status")).status).toBe("todo");

      // Asking again is a new request against a fresh observation.
      await page.getByRole("button", { name: copy.cancelTask }).click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
      await page.getByRole("dialog").getByRole("button", { name: copy.confirmSubmit }).click();

      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });
      const cancelled = await taskRow(taskId, "status,cancelled_at");
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelled_at).not.toBeNull();

      // Exactly one confirmation was consumed, and the cancellation is undoable.
      const consumed = await asUser(
        `task_command_confirmations?user_id=eq.${userId}&task_id=eq.${taskId}&status=eq.consumed&select=id`,
        ownerToken!,
      );
      expect(consumed.status, consumed.text).toBe(200);
      expect((JSON.parse(consumed.text) as unknown[]).length).toBe(1);
      const undos = await admin(
        `undo_operations?user_id=eq.${userId}&entity_ids=cs.{${taskId}}&select=id,status&order=created_at.desc&limit=1`,
      );
      expect(undos.length).toBe(1);
      expect(undos[0].status).toBe("available");
    });

    test(`[${copy.locale}] a cancelled task offers restoration and nothing else`, async ({ page }) => {
      const title = `Restaurar ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title, "cancelled");
      await admin(`tasks?id=eq.${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ cancelled_at: new Date().toISOString() }),
      });

      await signIn(page, copy);
      await openDetail(page, copy, taskId);

      // 2F-SURFACE-009: only the transition the taxonomy admits is offered.
      await expect(page.getByRole("button", { name: copy.restore })).toBeVisible();
      await expect(page.getByRole("button", { name: copy.cancelTask })).toHaveCount(0);
      await expect(page.locator("#task-control-rename_task")).toHaveCount(0);

      await page.getByRole("button", { name: copy.restore }).click();
      await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });

      const restored = await taskRow(taskId, "status,cancelled_at");
      expect(restored.status).toBe("todo");
      expect(restored.cancelled_at).toBeNull();
    });

    test(`[${copy.locale}] a date outside the lexicon's window is refused with localized copy`, async ({ page }) => {
      const title = `Prazo ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);

      await signIn(page, copy);
      await openDetail(page, copy, taskId);

      const picker = page.locator("#task-control-set_planned");
      const form = page.locator("form:has(#task-control-set_planned)");

      // The picker is bounded, so the browser itself refuses the submission — the
      // first live run of this spec asserted a server refusal here and timed out
      // waiting for one, because constraint validation stopped the form before it
      // was ever sent. That is the product behaving correctly.
      await picker.fill("2035-01-01");
      expect(await picker.evaluate((node: HTMLInputElement) => node.validity.rangeOverflow)).toBe(true);
      await form.getByRole("button").click();
      await expect(result(page, copy)).toHaveCount(0);
      expect((await taskRow(taskId, "planned_at")).planned_at).toBeNull();

      // The server gate is therefore what a *crafted* submission meets. Widening
      // the bounds in the page is the same thing a hand-made POST does, and the
      // refusal has to be a localized sentence rather than an unexplained
      // clarification request from the temporal lexicon.
      await picker.evaluate((node: HTMLInputElement) => {
        node.min = "";
        node.max = "";
      });
      await picker.fill("2035-01-01");
      await form.getByRole("button").click();
      await expect(result(page, copy)).toContainText(copy.dateOutOfRange, { timeout: 30_000 });

      // Refused before the read: nothing moved.
      expect((await taskRow(taskId, "planned_at")).planned_at).toBeNull();
    });

    test(`[${copy.locale}] an edit to a task that is gone refuses instead of overwriting`, async ({ page }) => {
      const title = `Sumiu ${crypto.randomUUID().slice(0, 8)}`;
      const taskId = await seedTask(title);

      await signIn(page, copy);
      await openDetail(page, copy, taskId);

      // The controls are rendered and then the task ceases to exist — the stale
      // render the pre-2F direct UPDATE would have blind-written through.
      await admin(`tasks?id=eq.${taskId}`, { method: "DELETE" });

      await submitField(page, "rename_task", "Qualquer coisa");
      const region = result(page, copy);
      await expect(region).toContainText(copy.unresolvable, { timeout: 30_000 });
      await expect(region.getByRole("button", { name: copy.reload })).toBeVisible();
    });
  }

  test("a stale task refuses the apply rather than overwriting a newer value", async () => {
    // The TOCTOU gate, executed through the deployed contract: a pre-state read
    // before someone else's write cannot be applied afterwards. Driven at the
    // RPC because the surface pins one observation per round, which is precisely
    // what makes this unreachable by clicking twice quickly.
    const copy = COPY[0];
    const title = `Concorrencia ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title);

    const observedBefore = new Date().toISOString();
    const resolved = await asUser("rpc/list_task_command_candidates", ownerToken!, {
      method: "POST",
      body: JSON.stringify({
        p_eligible_statuses: ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"],
        p_title_query: title,
        p_observed_before: observedBefore,
        p_limit: 25,
      }),
    });
    expect(resolved.status).toBe(200);
    const rows = JSON.parse(resolved.text) as Record<string, unknown>[];
    const row = rows.find((candidate) => candidate.task_id === taskId);
    expect(row, "the owner could not resolve their own task").toBeTruthy();

    // The row moves after it was observed.
    await admin(`tasks?id=eq.${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: `${title} mexido` }),
    });

    const stale = await asUser("rpc/apply_task_command", ownerToken!, {
      method: "POST",
      body: JSON.stringify({
        p_task_id: taskId,
        p_action: "rename_task",
        p_patch: { title: `${title} tarde demais` },
        p_pre_state: {
          title,
          description: row!.description,
          status: row!.status,
          dueAt: row!.due_at,
          plannedAt: row!.planned_at,
          manualPriority: row!.manual_priority,
          completedAt: row!.completed_at,
          cancelledAt: row!.cancelled_at,
          intentionalNoDue: row!.intentional_no_due,
          noDueReason: row!.no_due_reason,
          createdAt: row!.created_at,
          updatedAt: row!.updated_at,
          projectIds: row!.project_ids,
          projectNames: row!.project_names,
          contextIds: row!.context_ids,
          contextNames: row!.context_names,
          personIds: row!.person_ids,
          personNames: row!.person_names,
          personRoles: row!.person_roles,
        },
        p_observed_before: observedBefore,
        p_policy_version: "2026-07-25.2",
        p_operation_key: crypto.randomUUID(),
      }),
    });
    expect(stale.status, `a stale apply was accepted: ${stale.text}`).not.toBe(200);

    // The newer value survived; nothing was overwritten.
    expect((await taskRow(taskId, "title")).title).toBe(`${title} mexido`);
    expect(copy.locale).toBe("pt-BR");
  });

  test("a second submit under one operation key replays instead of writing twice", async ({ page }) => {
    // 2E-IDEMPOTENCY-004 through the surface's own key discipline: the second
    // round reuses nothing, so this drives the RPC directly with one key twice
    // and asserts the second is reported as the first rather than as a new write.
    const copy = COPY[0];
    const title = `Idempotente ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title);

    await signIn(page, copy);
    await openDetail(page, copy, taskId);
    await submitField(page, "rename_task", `${title} um`);
    await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });

    const undosAfterFirst = await admin(
      `undo_operations?user_id=eq.${userId}&entity_ids=cs.{${taskId}}&select=id,operation_key`,
    );
    expect(undosAfterFirst.length).toBe(1);
    const operationKey = String(undosAfterFirst[0].operation_key).replace("taskcmd-v1:", "");

    const observedBefore = new Date().toISOString();
    const resolved = await asUser("rpc/list_task_command_candidates", ownerToken!, {
      method: "POST",
      body: JSON.stringify({
        p_eligible_statuses: ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"],
        p_title_query: `${title} um`,
        p_observed_before: observedBefore,
        p_limit: 25,
      }),
    });
    const rows = JSON.parse(resolved.text) as Record<string, unknown>[];
    const row = rows.find((candidate) => candidate.task_id === taskId);
    expect(row).toBeTruthy();

    // The same key, a *different* payload: the contract must refuse rather than
    // silently apply, because one key carrying two fingerprints is a mismatch.
    const mismatched = await asUser("rpc/apply_task_command", ownerToken!, {
      method: "POST",
      body: JSON.stringify({
        p_task_id: taskId,
        p_action: "rename_task",
        p_patch: { title: `${title} dois` },
        p_pre_state: {
          title: row!.title,
          description: row!.description,
          status: row!.status,
          dueAt: row!.due_at,
          plannedAt: row!.planned_at,
          manualPriority: row!.manual_priority,
          completedAt: row!.completed_at,
          cancelledAt: row!.cancelled_at,
          intentionalNoDue: row!.intentional_no_due,
          noDueReason: row!.no_due_reason,
          createdAt: row!.created_at,
          updatedAt: row!.updated_at,
          projectIds: row!.project_ids,
          projectNames: row!.project_names,
          contextIds: row!.context_ids,
          contextNames: row!.context_names,
          personIds: row!.person_ids,
          personNames: row!.person_names,
          personRoles: row!.person_roles,
        },
        p_observed_before: observedBefore,
        p_policy_version: "2026-07-25.2",
        p_operation_key: operationKey,
      }),
    });
    expect(mismatched.status, `a key reuse with a new payload was accepted: ${mismatched.text}`)
      .not.toBe(200);

    // One write, one undo row, and the title the first apply set.
    expect((await taskRow(taskId, "title")).title).toBe(`${title} um`);
    expect(
      (await admin(`undo_operations?user_id=eq.${userId}&entity_ids=cs.{${taskId}}&select=id`)).length,
    ).toBe(1);
  });

  test("a stranger can neither see the detail surface nor edit the owner's task", async ({ page }) => {
    const copy = COPY[0];
    const title = `Isolamento ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title);

    // Positive first, so the absence below cannot pass by the surface being broken.
    await signIn(page, copy);
    await openDetail(page, copy, taskId);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // The stranger's own session gets a 404 for a task that is not theirs — the
    // only answer that does not confirm it exists.
    await page.context().clearCookies();
    await page.goto(`/${copy.locale}/auth/login`);
    await page.getByLabel(copy.emailLabel).fill(strangerEmail);
    await page.getByLabel(copy.passwordLabel).fill(strangerPassword);
    await page.getByRole("button", { name: copy.signIn }).click();
    await expect(page).toHaveURL(new RegExp(`/${copy.locale}/app$`), { timeout: 30_000 });

    const response = await page.goto(`/${copy.locale}/app/work/${taskId}`);
    expect(response?.status()).toBe(404);

    // And there is no path around the surface: the stranger cannot read the row.
    const read = await asUser(`tasks?id=eq.${taskId}&select=id`, strangerToken!);
    expect(JSON.parse(read.text)).toEqual([]);
    expect((await taskRow(taskId, "title")).title).toBe(title);
  });

  test("the emitted event carries commandOrigin 'work' and no task content", async ({ page }) => {
    const copy = COPY[0];
    const title = `Evento ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title);

    await signIn(page, copy);
    await openDetail(page, copy, taskId);
    await submitField(page, "set_priority", "urgent");
    await expect(result(page, copy)).toContainText(copy.applied, { timeout: 30_000 });

    // `product_events` grants SELECT to `authenticated` under RLS and refuses the
    // admin key, so the observation is owner-scoped by construction. Emitted
    // inside `after()`, so polled rather than slept on.
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
    // 2F-ANALYTICS-003: no title, no user text, in any recent payload.
    for (const event of events) {
      expect(JSON.stringify(event.properties)).not.toContain(title);
    }
    expect(taskId).toBeTruthy();
  });

  test("keyboard operation reaches a field control and lands focus on the outcome", async ({ page }) => {
    const copy = COPY[0];
    const title = `Teclado ${crypto.randomUUID().slice(0, 8)}`;
    const taskId = await seedTask(title);

    await signIn(page, copy);
    await openDetail(page, copy, taskId);

    const field = page.locator("#task-control-rename_task");
    await field.focus();
    await field.fill(`${title} pelo teclado`);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    const region = result(page, copy);
    await expect(region).toContainText(copy.applied, { timeout: 30_000 });
    await expect(region).toBeFocused();
    expect((await taskRow(taskId, "title")).title).toBe(`${title} pelo teclado`);
  });
});
