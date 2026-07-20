import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

type DisposableFixture = {
  accessToken: string;
  email: string;
  entryId: string;
  interpretationId: string;
  password: string;
  prefix: string;
  userId: string;
};

function extraction(prefix: string) {
  return {
    language: "pt-BR" as const,
    summary: "Editable candidate UI smoke",
    concepts: ["task"],
    occurredAt: "2026-07-19T12:00:00Z",
    isRetroactive: false,
    contexts: [],
    organizations: [],
    projects: [],
    people: [],
    confidence: 0.9,
    taskCandidates: [
      {
        title: `${prefix} first candidate`,
        description: "Original first description",
        dueAt: "2026-08-01T15:00:00Z",
        waitingOn: null,
        parentIndex: null,
        confidence: 0.9,
        explicit: true,
      },
      {
        title: `${prefix} second candidate`,
        description: "Original second description",
        dueAt: null,
        waitingOn: null,
        parentIndex: null,
        confidence: 0.8,
        explicit: true,
      },
    ],
    pendingQuestions: [],
  };
}

async function createFixture(
  admin: SupabaseClient,
  owner: SupabaseClient,
  onUserCreated: (userId: string) => void,
): Promise<DisposableFixture> {
  const prefix = `phase-2c-ui-${crypto.randomUUID()}`;
  const email = `${prefix}@example.com`;
  const password = `Phase2C!${crypto.randomUUID()}a7`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Phase 2C UI Smoke" },
  });
  expect(createError).toBeNull();
  expect(created.user).not.toBeNull();
  if (!created.user) throw new Error("Disposable UI user was not created.");
  onUserCreated(created.user.id);

  const { data: signedIn, error: signInError } = await owner.auth.signInWithPassword({
    email,
    password,
  });
  expect(signInError).toBeNull();
  expect(signedIn.session).not.toBeNull();
  if (!signedIn.session) throw new Error("Disposable UI session was not created.");

  const { error: profileError } = await owner
    .from("profiles")
    .update({ timezone: "America/New_York", locale: "pt-BR" })
    .eq("user_id", created.user.id);
  expect(profileError).toBeNull();

  const { data: entry, error: entryError } = await owner
    .from("entries")
    .insert({
      user_id: created.user.id,
      original_content: `Phase 2C UI smoke: ${prefix}`,
      source: "web",
      locale: "pt-BR",
    })
    .select("id")
    .single();
  expect(entryError).toBeNull();
  expect(entry).not.toBeNull();
  if (!entry) throw new Error("Disposable UI entry was not created.");

  const { data: interpretationId, error: interpretationError } = await owner.rpc(
    "persist_entry_interpretation",
    {
      p_entry_id: entry.id,
      p_extraction: extraction(prefix),
      p_model: "gpt-test",
      p_strategy_version: "phase-2c-ui-smoke",
      p_prompt_version: "phase-2c-ui-smoke",
      p_input_tokens: 10,
      p_output_tokens: 10,
    },
  );
  expect(interpretationError).toBeNull();
  expect(typeof interpretationId).toBe("string");

  return {
    accessToken: signedIn.session.access_token,
    email,
    entryId: entry.id,
    interpretationId: interpretationId as string,
    password,
    prefix,
    userId: created.user.id,
  };
}

test.describe("editable candidate confirmation through the production Server Action", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.setTimeout(120_000);

  const admin = createClient(supabaseUrl!, serviceRoleKey!, clientOptions);
  const owner = createClient(supabaseUrl!, publishableKey!, clientOptions);
  let disposableUserId: string | undefined;
  let fixture: DisposableFixture | undefined;
  let page: Page | undefined;

  test.beforeAll(async ({ browser }) => {
    fixture = await createFixture(admin, owner, (userId) => {
      disposableUserId = userId;
    });
    page = await browser.newPage();
    await page.goto("/pt-BR/auth/login");
    await page.getByLabel("E-mail").fill(fixture.email);
    await page.getByLabel("Senha").fill(fixture.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app$/, { timeout: 30_000 });
  });

  test.afterAll(async () => {
    await page?.close();
    if (!disposableUserId) return;

    const { error: deleteError } = await admin.auth.admin.deleteUser(disposableUserId);
    expect(deleteError).toBeNull();
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    expect(usersError).toBeNull();
    expect(users.users.some((user) => user.id === disposableUserId)).toBe(false);

    if (!fixture) return;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/product_events?select=id&user_id=eq.${fixture.userId}`,
      {
        headers: {
          apikey: publishableKey!,
          authorization: `Bearer ${fixture.accessToken}`,
        },
      },
    );
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual([]);
  });

  test("edits, confirms, audits, and undoes selected candidates in the real UI", async () => {
    if (!page || !fixture) throw new Error("UI fixture is unavailable.");
    await page.goto(`/pt-BR/app/inbox/${fixture.entryId}`);

    const firstEditor = page.getByRole("group", {
      name: `Sugestão: ${fixture.prefix} first candidate`,
    });
    const secondEditor = page.getByRole("group", {
      name: `Sugestão: ${fixture.prefix} second candidate`,
    });
    await expect(firstEditor).toBeVisible();
    await expect(secondEditor).toBeVisible();
    await expect(firstEditor.getByText("Horário em America/New_York")).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(2);

    await firstEditor
      .getByRole("button", { name: `Editar sugestão: ${fixture.prefix} first candidate` })
      .click();
    await firstEditor.getByLabel("Título").fill(`${fixture.prefix} edited title`);
    await firstEditor.getByLabel("Data limite (America/New_York)").fill("2026-08-02T10:30");

    await secondEditor
      .getByRole("button", { name: `Editar sugestão: ${fixture.prefix} second candidate` })
      .click();
    await secondEditor
      .getByRole("button", { name: `Remover descrição: ${fixture.prefix} second candidate` })
      .click();

    const submit = page.getByRole("button", { name: "Criar 2 tarefas" });
    await submit.click();
    await expect(page.getByText("2 tarefas criadas.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Desfazer criação" })).toBeVisible();

    const { data: tasks, error: tasksError } = await owner
      .from("tasks")
      .select("candidate_index,title,description,due_at,status")
      .eq("source_entry_id", fixture.entryId)
      .order("candidate_index", { ascending: true });
    expect(tasksError).toBeNull();
    expect(tasks).toHaveLength(2);
    expect(tasks?.[0]).toMatchObject({
      candidate_index: 0,
      title: `${fixture.prefix} edited title`,
      status: "inbox",
    });
    expect(new Date(tasks?.[0]?.due_at ?? "").getTime()).toBe(
      new Date("2026-08-02T10:30:00-04:00").getTime(),
    );
    expect(tasks?.[1]).toMatchObject({
      candidate_index: 1,
      description: null,
      status: "inbox",
    });

    const { data: operation, error: operationError } = await owner
      .from("undo_operations")
      .select("operation_key,request_fingerprint")
      .eq("source_entry_id", fixture.entryId)
      .single();
    expect(operationError).toBeNull();
    expect(operation?.operation_key).toMatch(/^confirm-v2:[0-9a-f-]{36}$/);
    expect(operation?.request_fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const { data: interpretation, error: immutableError } = await owner
      .from("entry_interpretations")
      .select("task_candidates")
      .eq("id", fixture.interpretationId)
      .single();
    expect(immutableError).toBeNull();
    expect(interpretation?.task_candidates).toEqual(extraction(fixture.prefix).taskCandidates);

    const { data: audit, error: auditError } = await owner
      .from("audit_logs")
      .select("action_type,after_state")
      .eq("source_entry_id", fixture.entryId)
      .eq("action_type", "tasks_confirmed")
      .single();
    expect(auditError).toBeNull();
    expect(audit?.after_state).toMatchObject({
      edited_fields: ["title", "description", "dueAt"],
      candidate_indexes: [0, 1],
    });
    expect(JSON.stringify(audit)).not.toContain("Original first description");

    await expect.poll(async () => {
      const { data, error } = await owner
        .from("product_events")
        .select("event_name")
        .eq("user_id", fixture!.userId);
      if (error) throw error;
      return data.map((event) => event.event_name);
    }).toEqual(expect.arrayContaining([
      "task_candidates_presented",
      "task_candidates_confirmed",
    ]));

    await page.getByRole("button", { name: "Desfazer criação" }).click();
    await expect(page.getByText("Criação desfeita.")).toBeVisible();
    const { data: undoneTasks, error: undoneError } = await owner
      .from("tasks")
      .select("status")
      .eq("source_entry_id", fixture.entryId);
    expect(undoneError).toBeNull();
    if (!undoneTasks) throw new Error("Undone tasks were not returned.");
    expect(undoneTasks.every((task) => task.status === "cancelled")).toBe(true);
  });
});
