import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

type Locale = "pt-BR" | "en";

type DisposableFixture = {
  accessToken: string;
  contextId: string;
  email: string;
  entryId: string;
  interpretationId: string;
  password: string;
  personA: string;
  personB: string;
  prefix: string;
  projectId: string;
  userId: string;
};

const localized = {
  "pt-BR": {
    password: "Senha",
    signIn: "Entrar",
    candidate: (title: string) => `Sugestão: ${title}`,
    edit: (title: string) => `Editar sugestão: ${title}`,
    title: "Título",
    dueDate: "Data limite (America/New_York)",
    plannedDate: "Data planejada (America/New_York)",
    priority: "Prioridade",
    projects: "Projetos",
    contexts: "Contextos",
    people: "Pessoas",
    waitingOn: "Aguardando por",
    decision: (title: string) => `Decisão para: ${title}`,
    dispositions: ["Criar tarefa", "Rejeitar sugestão", "Manter como registro", "Dispensar sugestão"],
    submit: "Resolver 4 sugestões",
    success: "4 sugestões resolvidas. 1 tarefa criada.",
    history: "Decisões anteriores",
    outcomes: ["Tarefa criada", "Sugestão rejeitada", "Mantida como registro", "Sugestão dispensada"],
    undo: "Desfazer decisões",
    undone: "Alteração desfeita.",
    needsYou: "Precisa de você",
    nothingNeedsYou: "Nada precisa de você agora",
    work: "Trabalho",
    allWork: "Todas",
  },
  en: {
    password: "Password",
    signIn: "Sign in",
    candidate: (title: string) => `Suggestion: ${title}`,
    edit: (title: string) => `Edit suggestion: ${title}`,
    title: "Title",
    dueDate: "Due date (America/New_York)",
    plannedDate: "Planned date (America/New_York)",
    priority: "Priority",
    projects: "Projects",
    contexts: "Contexts",
    people: "People",
    waitingOn: "Waiting on",
    decision: (title: string) => `Decision for: ${title}`,
    dispositions: ["Create task", "Reject suggestion", "Keep as record", "Dismiss suggestion"],
    submit: "Resolve 4 suggestions",
    success: "4 suggestions resolved. 1 task created.",
    history: "Previous decisions",
    outcomes: ["Task created", "Suggestion rejected", "Kept as record", "Suggestion dismissed"],
    undo: "Undo decisions",
    undone: "Change undone.",
    needsYou: "Needs you",
    nothingNeedsYou: "Nothing needs you right now",
    work: "Work",
    allWork: "All",
  },
} as const;

function extraction(prefix: string, locale: Locale) {
  return {
    language: locale,
    summary: `Candidate disposition UI smoke (${locale})`,
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
        title: `${prefix} confirmed candidate`,
        description: "Original confirmed description",
        dueAt: "2026-08-01T15:00:00Z",
        waitingOn: null,
        parentIndex: null,
        confidence: 0.9,
        explicit: true,
      },
      {
        title: `${prefix} rejected candidate`,
        description: "Original rejected description",
        dueAt: null,
        waitingOn: null,
        parentIndex: null,
        confidence: 0.85,
        explicit: true,
      },
      {
        title: `${prefix} retained candidate`,
        description: "Original retained description",
        dueAt: null,
        waitingOn: null,
        parentIndex: null,
        confidence: 0.8,
        explicit: true,
      },
      {
        title: `${prefix} dismissed candidate`,
        description: "Original dismissed description",
        dueAt: null,
        waitingOn: null,
        parentIndex: null,
        confidence: 0.75,
        explicit: true,
      },
    ],
    pendingQuestions: [],
  };
}

async function createFixture(
  admin: SupabaseClient,
  owner: SupabaseClient,
  locale: Locale,
  onUserCreated: (userId: string) => void,
): Promise<DisposableFixture> {
  const prefix = `phase-2c-ui-${locale.toLowerCase()}-${crypto.randomUUID()}`;
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
    .update({ timezone: "America/New_York", locale })
    .eq("user_id", created.user.id);
  expect(profileError).toBeNull();

  const { data: entry, error: entryError } = await owner
    .from("entries")
    .insert({
      user_id: created.user.id,
      original_content: `Phase 2C UI smoke: ${prefix}`,
      source: "web",
      locale,
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
      p_extraction: extraction(prefix, locale),
      p_model: "gpt-test",
      p_strategy_version: "phase-2c-ui-smoke",
      p_prompt_version: "phase-2c-ui-smoke",
      p_input_tokens: 10,
      p_output_tokens: 10,
    },
  );
  expect(interpretationError).toBeNull();
  expect(typeof interpretationId).toBe("string");
  const { error: completedError } = await admin
    .from("entries")
    .update({ status: "completed" })
    .eq("id", entry.id)
    .eq("user_id", created.user.id);
  expect(completedError).toBeNull();

  const { data: project, error: projectError } = await owner
    .from("projects")
    .insert({ user_id: created.user.id, name: `${prefix} project` })
    .select("id")
    .single();
  expect(projectError).toBeNull();
  const { data: context, error: contextError } = await owner
    .from("contexts")
    .insert({ user_id: created.user.id, name: `${prefix} context` })
    .select("id")
    .single();
  expect(contextError).toBeNull();
  const { data: personA, error: personAError } = await owner
    .from("people")
    .insert({ user_id: created.user.id, name: `${prefix} person A` })
    .select("id")
    .single();
  expect(personAError).toBeNull();
  const { data: personB, error: personBError } = await owner
    .from("people")
    .insert({ user_id: created.user.id, name: `${prefix} person B` })
    .select("id")
    .single();
  expect(personBError).toBeNull();
  if (!project || !context || !personA || !personB) {
    throw new Error("Disposable owned relation fixtures were not created.");
  }

  return {
    accessToken: signedIn.session.access_token,
    contextId: context.id as string,
    email,
    entryId: entry.id,
    interpretationId: interpretationId as string,
    password,
    personA: personA.id as string,
    personB: personB.id as string,
    prefix,
    projectId: project.id as string,
    userId: created.user.id,
  };
}

async function login(page: Page, fixture: DisposableFixture, locale: Locale) {
  const text = localized[locale];
  await page.goto(`/${locale}/auth/login`);
  await page.getByLabel("E-mail").fill(fixture.email);
  await page.getByLabel(text.password).fill(fixture.password);
  await page.getByRole("button", { name: text.signIn }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/app$`), { timeout: 30_000 });
}

async function assertNeedsAttention(
  page: Page,
  fixture: DisposableFixture,
  locale: Locale,
  expected: boolean,
) {
  const text = localized[locale];
  await page.goto(`/${locale}/app/inbox?view=needs-you`);
  await expect(page.getByRole("link", { name: text.needsYou, exact: true })).toHaveAttribute("aria-current", "page");
  const row = page.locator(`a.needs-attention-row[href="/${locale}/app/inbox/${fixture.entryId}"]`);
  await expect.poll(async () => {
    await page.reload();
    return row.count();
  }, { timeout: 30_000 }).toBe(expected ? 1 : 0);
  if (expected) {
    await expect(row).toBeVisible();
  } else {
    await expect(page.getByText(text.nothingNeedsYou, { exact: true })).toBeVisible();
  }
}

async function cleanupFixture(admin: SupabaseClient, userId: string, accessToken: string) {
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  expect(deleteError).toBeNull();
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  expect(usersError).toBeNull();
  expect(users.users.some((user) => user.id === userId)).toBe(false);
  const [eventResponse, { count: resolutionCount, error: resolutionError }] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/product_events?select=id&user_id=eq.${userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
    }),
    admin.from("entry_task_candidate_resolutions").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  expect(eventResponse.ok).toBe(true);
  expect(resolutionError).toBeNull();
  expect(await eventResponse.json()).toEqual([]);
  expect(resolutionCount).toBe(0);
}

async function runDispositionJourney(
  page: Page,
  owner: SupabaseClient,
  fixture: DisposableFixture,
  locale: Locale,
) {
  const text = localized[locale];
  const candidates = extraction(fixture.prefix, locale).taskCandidates;
  const candidateTitles = candidates.map((candidate) => candidate.title);
  const editedTitle = `${fixture.prefix} edited confirmed title`;

  await assertNeedsAttention(page, fixture, locale, true);
  await page.goto(`/${locale}/app/inbox/${fixture.entryId}`);
  await expect(page.locator('input[name="candidateIndex"]')).toHaveCount(4);

  const confirmedEditor = page.getByRole("group", { name: text.candidate(candidateTitles[0]) });
  await expect(confirmedEditor).toBeVisible();
  await confirmedEditor.getByRole("button", { name: text.edit(candidateTitles[0]) }).click();
  await confirmedEditor.getByLabel(text.title).fill(editedTitle);
  await confirmedEditor.getByLabel(text.dueDate).fill("2026-08-02T10:30");
  await confirmedEditor.getByLabel(text.plannedDate).fill("2026-07-30T09:00");
  await confirmedEditor.getByLabel(text.priority).selectOption("urgent");
  await confirmedEditor.getByRole("listbox", { name: text.projects }).selectOption({ label: `${fixture.prefix} project` });
  await confirmedEditor.getByRole("listbox", { name: text.contexts }).selectOption({ label: `${fixture.prefix} context` });
  await confirmedEditor.getByRole("listbox", { name: text.people }).selectOption({ label: `${fixture.prefix} person A` });
  await confirmedEditor.getByRole("listbox", { name: text.waitingOn }).selectOption({ label: `${fixture.prefix} person B` });

  for (let index = 0; index < candidateTitles.length; index += 1) {
    const decision = page.getByRole("group", { name: text.decision(candidateTitles[index]) });
    await expect(decision).toBeVisible();
    await decision.getByRole("radio", { name: text.dispositions[index] }).check();
  }

  await page.getByRole("button", { name: text.submit }).click();
  await expect(page.getByText(text.success, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: text.undo })).toBeVisible();

  const { data: tasks, error: tasksError } = await owner
    .from("tasks")
    .select("id,candidate_index,title,status,due_at,planned_at,manual_priority")
    .eq("source_entry_id", fixture.entryId)
    .neq("status", "cancelled");
  expect(tasksError).toBeNull();
  expect(tasks).toHaveLength(1);
  expect(tasks?.[0]).toMatchObject({
    candidate_index: 0,
    title: editedTitle,
    status: "inbox",
    manual_priority: "urgent",
  });
  expect(new Date(tasks?.[0]?.due_at ?? "").getTime()).toBe(new Date("2026-08-02T10:30:00-04:00").getTime());
  expect(new Date(tasks?.[0]?.planned_at ?? "").getTime()).toBe(new Date("2026-07-30T09:00:00-04:00").getTime());

  const taskId = tasks?.[0]?.id;
  const [{ data: projects }, { data: contexts }, { data: people }] = await Promise.all([
    owner.from("task_projects").select("project_id").eq("task_id", taskId),
    owner.from("task_contexts").select("context_id").eq("task_id", taskId),
    owner.from("task_people").select("person_id,role").eq("task_id", taskId).order("role", { ascending: true }),
  ]);
  expect(projects).toEqual([{ project_id: fixture.projectId }]);
  expect(contexts).toEqual([{ context_id: fixture.contextId }]);
  expect(people).toEqual([
    { person_id: fixture.personA, role: "involved" },
    { person_id: fixture.personB, role: "waiting_on" },
  ]);

  const { data: resolutions, error: resolutionError } = await owner
    .from("entry_task_candidate_resolutions")
    .select("candidate_index,disposition,task_id")
    .eq("entry_id", fixture.entryId)
    .eq("interpretation_id", fixture.interpretationId)
    .order("candidate_index", { ascending: true });
  expect(resolutionError).toBeNull();
  expect(resolutions).toEqual([
    { candidate_index: 0, disposition: "confirmed", task_id: taskId },
    { candidate_index: 1, disposition: "rejected", task_id: null },
    { candidate_index: 2, disposition: "retained", task_id: null },
    { candidate_index: 3, disposition: "dismissed", task_id: null },
  ]);

  const { data: operation, error: operationError } = await owner
    .from("undo_operations")
    .select("operation_key,request_fingerprint")
    .eq("source_entry_id", fixture.entryId)
    .eq("action_type", "confirm_entry_task_candidates_v6")
    .single();
  expect(operationError).toBeNull();
  expect(operation?.operation_key).toMatch(/^confirm-v6:[0-9a-f-]{36}$/);
  expect(operation?.request_fingerprint).toMatch(/^[0-9a-f]{64}$/);

  const { data: interpretation, error: immutableError } = await owner
    .from("entry_interpretations")
    .select("task_candidates")
    .eq("id", fixture.interpretationId)
    .single();
  expect(immutableError).toBeNull();
  expect(interpretation?.task_candidates).toEqual(candidates);

  const { data: audit, error: auditError } = await owner
    .from("audit_logs")
    .select("action_type,after_state")
    .eq("source_entry_id", fixture.entryId)
    .eq("action_type", "confirm_entry_task_candidates_v6")
    .single();
  expect(auditError).toBeNull();
  expect(audit?.after_state).toMatchObject({
    candidate_indexes: [0, 1, 2, 3],
    edited_fields: ["title", "dueAt", "plannedAt", "manualPriority", "projectIds", "contextIds", "personIds", "waitingOnPersonIds"],
  });
  expect(JSON.stringify(audit)).not.toContain("Original confirmed description");
  expect(JSON.stringify(audit)).not.toContain(fixture.projectId);
  expect(JSON.stringify(audit)).not.toContain(`${fixture.prefix} project`);

  await expect.poll(async () => {
    const { data, error } = await owner.from("product_events").select("event_name").eq("user_id", fixture.userId);
    if (error) throw error;
    return data.map((event) => event.event_name);
  }).toEqual(expect.arrayContaining(["task_candidates_confirmed"]));

  await assertNeedsAttention(page, fixture, locale, false);
  await page.goto(`/${locale}/app/inbox/${fixture.entryId}`);
  await page.reload();
  await expect(page.getByRole("heading", { name: text.history })).toBeVisible();
  for (const title of candidateTitles) await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  for (const outcome of text.outcomes) await expect(page.getByText(outcome, { exact: true })).toBeVisible();

  await page.goto(`/${locale}/app/work?view=all`);
  await expect(page.getByRole("heading", { name: text.work })).toBeVisible();
  await expect(page.getByRole("link", { name: text.allWork, exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(editedTitle, { exact: true })).toBeVisible();
  for (const title of candidateTitles.slice(1)) await expect(page.getByText(title, { exact: true })).toHaveCount(0);

  await page.goto(`/${locale}/app/inbox/${fixture.entryId}`);
  await page.reload();
  await page.getByRole("button", { name: text.undo }).click();
  await expect(page.getByText(text.undone, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('input[name="candidateIndex"]')).toHaveCount(4);
  for (const title of candidateTitles) {
    await expect(page.getByRole("group", { name: text.decision(title) })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: text.history })).toHaveCount(0);

  const { data: remainingResolutions, error: remainingResolutionError } = await owner
    .from("entry_task_candidate_resolutions")
    .select("id")
    .eq("entry_id", fixture.entryId);
  expect(remainingResolutionError).toBeNull();
  expect(remainingResolutions).toEqual([]);
  const { data: undoneTasks, error: undoneError } = await owner
    .from("tasks")
    .select("status")
    .eq("source_entry_id", fixture.entryId);
  expect(undoneError).toBeNull();
  expect(undoneTasks?.length).toBeGreaterThan(0);
  expect(undoneTasks?.every((task) => task.status === "cancelled")).toBe(true);

  await assertNeedsAttention(page, fixture, locale, true);
  await page.goto(`/${locale}/app/work?view=all`);
  await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0);
}

test.describe("candidate dispositions through the production confirmation Server Action", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.setTimeout(180_000);

  for (const locale of ["pt-BR", "en"] as const) {
    test(`resolves, reloads, and undoes all four outcomes in ${locale}`, async ({ page }) => {
      const admin = createClient(supabaseUrl!, serviceRoleKey!, clientOptions);
      const owner = createClient(supabaseUrl!, publishableKey!, clientOptions);
      let disposableUserId: string | undefined;
      let disposableAccessToken: string | undefined;
      try {
        const fixture = await createFixture(admin, owner, locale, (userId) => {
          disposableUserId = userId;
        });
        disposableAccessToken = fixture.accessToken;
        await login(page, fixture, locale);
        await runDispositionJourney(page, owner, fixture, locale);
      } finally {
        if (disposableUserId && disposableAccessToken) {
          await cleanupFixture(admin, disposableUserId, disposableAccessToken);
        } else if (disposableUserId) {
          const { error } = await admin.auth.admin.deleteUser(disposableUserId);
          expect(error).toBeNull();
        }
      }
    });
  }
});
