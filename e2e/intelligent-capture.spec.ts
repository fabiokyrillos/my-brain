import { expect, test, type Page } from "@playwright/test";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

type DisposableUser = { userId: string; accessToken: string; email: string; password: string };

async function createDisposableUser(namePrefix: string): Promise<DisposableUser> {
  const email = `codex-${namePrefix}-${crypto.randomUUID()}@example.com`;
  const password = `${namePrefix[0]!.toUpperCase()}${namePrefix.slice(1)}!${crypto.randomUUID()}a7`;
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: `${namePrefix} E2E` } }),
  });
  expect(userResponse.ok).toBe(true);
  const userId = ((await userResponse.json()) as { id: string }).id;

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey!, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(authResponse.ok).toBe(true);
  const accessToken = ((await authResponse.json()) as { access_token: string }).access_token;
  return { userId, accessToken, email, password };
}

async function deleteDisposableUser(userId: string | undefined) {
  if (!userId) return;
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
  });
}

async function restRpc(accessToken: string, fn: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.ok, `${fn} failed: ${await response.clone().text()}`).toBe(true);
  return response;
}

// Bypasses capture_entry_async on purpose: no interpret_entry job is created,
// so nothing but this test ever touches the entry — the deployed worker and
// the per-minute dispatch drain have nothing to claim, which is what makes
// the attention-state fixtures below deterministic instead of racing
// production automation.
async function insertBareEntry(accessToken: string, userId: string, content: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/entries`, {
    method: "POST",
    headers: {
      apikey: publishableKey!,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({ user_id: userId, original_content: content }),
  });
  expect(response.ok, `insert entry failed: ${await response.clone().text()}`).toBe(true);
  const [row] = (await response.json()) as Array<{ id: string }>;
  return row.id;
}

function trustDecision(policy: "apply_and_flag" | "request_review") {
  return {
    score: policy === "apply_and_flag" ? 0.835 : 0.4,
    policy,
    signals: {
      modelConfidence: 0.8, candidateMargin: 1, entityExactness: 1, semanticSimilarity: 0,
      dateClarity: 1, contextConsistency: 1, reversibility: 1, autonomyAllowed: 1,
      correctionHistoryAgreement: 0.5,
    },
    overrides: [] as string[],
    evidence: ["deterministic_e2e_fixture"],
  };
}

async function waitForOrganized(page: Page, href: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await page.goto(href);
    const ready = await page.getByText("Ver detalhes técnicos").isVisible().catch(() => false);
    if (ready) return;
    if (Date.now() > deadline) throw new Error("Entry did not finish organizing before the timeout.");
    await page.waitForTimeout(2_000);
  }
}

async function waitForRecovered(page: Page, href: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await page.goto(href);
    const stillBlocked = await page.locator(".entry-status-could_not_organize").isVisible().catch(() => false);
    const stillOrganizing = await page.locator(".entry-status-organizing").isVisible().catch(() => false);
    if (!stillBlocked && !stillOrganizing) return;
    if (Date.now() > deadline) throw new Error("Entry did not recover from retry before the timeout.");
    await page.waitForTimeout(2_000);
  }
}

async function loadProductEventNames(userId: string, accessToken: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/product_events?select=event_name&user_id=eq.${userId}&is_synthetic=eq.false&order=created_at.asc`, {
    headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
  });
  expect(response.ok).toBe(true);
  return ((await response.json()) as Array<{ event_name: string }>).map((event) => event.event_name);
}

// Owner-scoped REST select for the current authenticated user (RLS applies).
async function restSelect(accessToken: string, query: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${query}`, {
    headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as Array<Record<string, unknown>>;
}

test.describe("converged daily journey — capture, review, and confirmation", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.setTimeout(180_000);

  const original = "Hoje conversei com Marina sobre o projeto Atlas. Crie uma tarefa para enviar a proposta amanhã às 15h.";
  let page: Page;
  let user: DisposableUser | undefined;
  let capturedEntryId: string;
  let confirmedTaskTitle: string;
  let storagePath: string | undefined;

  test.beforeAll(async ({ browser }) => {
    user = await createDisposableUser("capture");
    page = await browser.newPage();
    await page.goto("/pt-BR/auth/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app$/, { timeout: 30_000 });
  });

  test.afterAll(async () => {
    if (storagePath) {
      const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
      await fetch(`${supabaseUrl}/storage/v1/object/user-files/${encodedPath}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
    }
    await deleteDisposableUser(user?.userId);
    await page.close();
  });

  test("legacy Today/Tasks/Waiting routes redirect to canonical Work views", async () => {
    for (const [source, target] of [
      ["/pt-BR/app/today?page=3", "/pt-BR/app/work?view=today&page=3"],
      ["/en/app/tasks?page=2", "/en/app/work?view=all&page=2"],
      ["/pt-BR/app/waiting?page=4", "/pt-BR/app/work?view=waiting&page=4"],
    ] as const) {
      await page.goto(source);
      await expect(page).toHaveURL(new RegExp(`${target.replaceAll("?", "\\?")}$`));
    }
  });

  test("capture returns an immediate receipt without waiting for AI", async () => {
    await page.goto("/pt-BR/app/capture");
    const captureField = page.getByRole("textbox", { name: "Nova entrada" });
    await captureField.fill(original);
    await page.getByRole("button", { name: "Registrar" }).click();

    // The Action returns immediately after the durable atomic enqueue: no
    // redirect and no wait for AI. The field is already cleared and
    // refocused for the next capture, proving the UI is interactive before
    // interpretation completes.
    await expect(page).toHaveURL(/\/pt-BR\/app\/capture$/);
    await expect(page.getByRole("status")).toContainText("Salvo. A organização foi solicitada.");
    await expect(captureField).toHaveValue("");
    await expect(captureField).toBeFocused();
    await expect(page.getByRole("button", { name: "Registrar" })).toBeEnabled();

    const viewRecordLink = page.getByRole("link", { name: "Ver registro" });
    await expect(viewRecordLink).toBeVisible();
    const recordHref = await viewRecordLink.getAttribute("href");
    capturedEntryId = recordHref!.split("/").at(-1)!;
  });

  test("organizes into a reviewable interpretation with accessible progressive disclosure", async () => {
    const href = `/pt-BR/app/inbox/${capturedEntryId}`;
    await waitForOrganized(page, href);
    await expect(page.locator(".entry-heading h1")).toBeVisible();

    const technicalSummary = page.getByText("Ver detalhes técnicos");
    await technicalSummary.focus();
    await expect(technicalSummary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Confiança por elemento" })).toBeVisible();

    await page.getByText("Ver registro original").click();
    await expect(page.getByText(original)).toBeVisible();
  });

  test("corrects the interpretation, supports record-only, and can be undone", async () => {
    await expect(page.getByRole("button", { name: "Corrigir interpretação" })).toBeVisible();
    await page.getByRole("button", { name: "Corrigir interpretação" }).click();
    await page.getByRole("textbox", { name: "Resumo" }).fill("Resumo confirmado: conversa com Marina sobre o Atlas");
    await page.getByLabel("Data e hora do acontecimento (ISO)").fill("2026-07-17T14:00:00.000Z");
    await page.getByRole("button", { name: "Adicionar data" }).click();
    await page.getByLabel("Data identificada 2").fill("2026-07-21");
    await page.getByRole("checkbox", { name: "Somente registrar, sem executar ações derivadas" }).check();
    await page.getByRole("textbox", { name: "Motivo da correção" }).fill("Confirmação E2E da interpretação.");
    await page.getByRole("button", { name: "Salvar nova versão" }).click();
    await expect(page.getByRole("status")).toHaveText("Nova versão salva.");
    await expect(page.locator(".revision-timeline").getByText("v2 · Correção do usuário", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar correção" }).click();
    await page.getByRole("button", { name: "Desfazer última correção" }).click();
    await expect(page.locator(".revision-timeline").getByText("v3 · Correção do usuário", { exact: true })).toBeVisible();

    await page.goto(page.url().replace("/pt-BR/", "/en/"));
    await expect(page.getByRole("button", { name: "Correct interpretation" })).toBeVisible();
    await page.getByText("View technical details").click();
    await expect(page.getByRole("heading", { name: "Immutable history" })).toBeVisible();
    await page.goto(page.url().replace("/en/", "/pt-BR/"));
  });

  test("surfaces an unconfirmed candidate as Precisa de você on Home and Caixa", async () => {
    const entryStateResponse = await fetch(`${supabaseUrl}/rest/v1/entries?select=current_interpretation_id&id=eq.${capturedEntryId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    expect(entryStateResponse.ok).toBe(true);
    const [entryState] = (await entryStateResponse.json()) as Array<{ current_interpretation_id: string }>;
    const currentResponse = await fetch(`${supabaseUrl}/rest/v1/entry_interpretations?select=raw_output,model,strategy_version,prompt_version&id=eq.${entryState.current_interpretation_id}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    expect(currentResponse.ok).toBe(true);
    const [currentState] = (await currentResponse.json()) as Array<{
      raw_output: Record<string, unknown> & { taskCandidates?: unknown[] };
      model: string;
      strategy_version: string;
      prompt_version: string;
    }>;
    if (!currentState.raw_output.taskCandidates?.length) {
      const operationKey = crypto.randomUUID();
      await restRpc(user!.accessToken, "begin_entry_reprocessing", { p_entry_id: capturedEntryId, p_operation_key: operationKey, p_lease_seconds: 180 });
      await restRpc(user!.accessToken, "persist_reprocessed_entry_interpretation", {
        p_entry_id: capturedEntryId,
        p_operation_key: operationKey,
        p_extraction: {
          ...currentState.raw_output,
          recordOnly: false,
          taskCandidates: [{ title: "Enviar a proposta", description: null, dueAt: null, waitingOn: null, parentIndex: null, confidence: 1, explicit: true }],
        },
        p_model: currentState.model,
        p_strategy_version: currentState.strategy_version,
        p_prompt_version: currentState.prompt_version,
        p_input_tokens: 0,
        p_output_tokens: 0,
        p_element_trust: {
          summary: trustDecision("apply_and_flag"), concepts: trustDecision("apply_and_flag"), occurredAt: trustDecision("apply_and_flag"),
          extractedDates: trustDecision("apply_and_flag"), entities: trustDecision("apply_and_flag"),
        },
      });
      await page.reload();
    }

    // The entry has an unconfirmed candidate and no open question at this
    // point, so it must appear in the queue on both Home and Caixa before
    // the candidate is confirmed below.
    await page.goto("/pt-BR/app");
    await expect(page.getByRole("heading", { name: "Precisa de você" })).toBeVisible();
    await expect(page.locator(".attention-count")).not.toHaveText("0");
    await page.getByRole("link", { name: "Ver tudo" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/inbox\?view=needs-you$/);
    await expect(page.getByRole("link", { name: "Precisa de você", exact: true })).toHaveAttribute("aria-current", "page");
    const attentionRow = page.locator(`a.needs-attention-row[href="/pt-BR/app/inbox/${capturedEntryId}"]`);
    await expect(attentionRow).toBeVisible();
    await attentionRow.click();
    await expect(page).toHaveURL(new RegExp(`/pt-BR/app/inbox/${capturedEntryId}$`));

    await page.goto(page.url().replace("/pt-BR/", "/en/").replace(`/inbox/${capturedEntryId}`, "/inbox?view=needs-you"));
    await expect(page.getByRole("link", { name: "Needs you", exact: true })).toHaveAttribute("aria-current", "page");
    await page.goto(`/pt-BR/app/inbox/${capturedEntryId}`);
  });

  test("confirms candidates, materializes a task, and reflects it in canonical Work", async () => {
    const createButton = page.getByRole("button", { name: /Criar \d+ tarefas?/ });
    await expect(createButton).toBeVisible();
    await createButton.click();
    await expect(page.getByRole("button", { name: "Desfazer criação" })).toBeVisible();

    const confirmedTasksResponse = await fetch(`${supabaseUrl}/rest/v1/tasks?select=title,status&user_id=eq.${user!.userId}&source_entry_id=eq.${capturedEntryId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    expect(confirmedTasksResponse.ok).toBe(true);
    const confirmedTasks = (await confirmedTasksResponse.json()) as Array<{ title: string; status: string }>;
    const confirmedTask = confirmedTasks.find((task) => task.status !== "cancelled");
    expect(confirmedTask).toBeDefined();
    confirmedTaskTitle = confirmedTask!.title;

    await page.goto("/pt-BR/app/work?view=all");
    await expect(page.getByRole("heading", { name: "Trabalho" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Todas" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(confirmedTaskTitle, { exact: true })).toBeVisible();
  });

  test("keeps the original entry immutable and audits every step so far", async () => {
    const entryResponse = await fetch(`${supabaseUrl}/rest/v1/entries?select=id,original_content,status&user_id=eq.${user!.userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    const entries = (await entryResponse.json()) as Array<{ id: string; original_content: string; status: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0].original_content).toBe(original);
    expect(["awaiting_review", "completed"]).toContain(entries[0].status);

    const auditResponse = await fetch(`${supabaseUrl}/rest/v1/audit_logs?select=action_type&user_id=eq.${user!.userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    const audit = (await auditResponse.json()) as Array<{ action_type: string }>;
    expect(audit.map((item) => item.action_type)).toEqual(expect.arrayContaining([
      "entry_interpreted",
      "entry_interpretation_corrected",
      "entry_interpretation_correction_undone",
      "tasks_confirmed",
    ]));
  });

  test("Brain chat answers grounded in the captured entry", async () => {
    await page.goto("/pt-BR/app/chat");
    await page.getByRole("textbox", { name: "Pergunte ao Brain" }).fill("Com quem conversei sobre o projeto Atlas?");
    await page.getByRole("button", { name: "Enviar pergunta" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/chat\/[0-9a-f-]+$/, { timeout: 120_000 });
    await expect(page.locator(".chat-message.assistant")).toContainText("Marina");
    await expect(page.getByRole("link", { name: /Marina.*Atlas/i })).toBeVisible();
  });

  test("Reviews generates a review manually, on demand", async () => {
    await page.goto("/pt-BR/app/reviews");
    await page.getByRole("button", { name: "Resumo do dia" }).click();
    await expect(page.getByRole("status")).toHaveText("Revisão concluída.", { timeout: 120_000 });
    await page.reload();
    await expect(page.locator(".review-card")).toHaveCount(1);
  });

  test("Files uploads and analyzes a private attachment", async () => {
    await page.goto("/pt-BR/app/files");
    await page.locator('input[type="file"]').setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("Documento de teste do fluxo privado.") });
    await page.getByRole("button", { name: "Enviar arquivo" }).click();
    await expect(page.getByRole("status")).toContainText("Arquivo privado enviado", { timeout: 120_000 });
    const attachmentResponse = await fetch(`${supabaseUrl}/rest/v1/attachments?select=storage_path,status&user_id=eq.${user!.userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    const attachments = (await attachmentResponse.json()) as Array<{ storage_path: string; status: string }>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].status).toBe("ready");
    storagePath = attachments[0].storage_path;
  });

  test("Costs shows AI usage transparency for every real paid call", async () => {
    const usageResponse = await fetch(`${supabaseUrl}/rest/v1/ai_usage_events?select=operation,model,cost_status,cost_usd,input_tokens,output_tokens&user_id=eq.${user!.userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    expect(usageResponse.ok).toBe(true);
    const usage = (await usageResponse.json()) as Array<{ operation: string; model: string; cost_status: string; cost_usd: string | null; input_tokens: number; output_tokens: number }>;
    expect(usage.map((item) => item.operation)).toEqual(expect.arrayContaining(["capture_extraction", "semantic_search", "chat", "review", "file_analysis"]));
    expect(usage.every((item) => item.cost_status === "calculated" && Number(item.cost_usd) > 0)).toBe(true);

    await page.goto("/pt-BR/app/costs");
    await expect(page.getByRole("heading", { name: "Custos de IA" })).toBeVisible();
    await expect(page.getByText("Calculado pelos tokens da API")).toBeVisible();
    await expect(page.locator(".recent-costs tbody tr")).toHaveCount(usage.length);
    await expect(page.locator(".trace-bar span")).not.toHaveCount(0);
  });

  test("Settings persists AI routing preferences under progressive disclosure", async () => {
    await page.goto("/pt-BR/app/settings");
    await page.getByText("IA avançada").click();
    await page.getByRole("radio", { name: /Econômico/ }).click();
    await expect(page.getByLabel("Chat principal")).toHaveValue("gpt-5-mini");
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await expect(page.getByRole("status")).toHaveText("Preferências salvas.");
    const preferencesResponse = await fetch(`${supabaseUrl}/rest/v1/agent_preferences?select=ai_profile,chat_model,reasoning_model,review_model&user_id=eq.${user!.userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    const savedPreferences = (await preferencesResponse.json()) as Array<{ ai_profile: string; chat_model: string; reasoning_model: string; review_model: string }>;
    expect(savedPreferences[0]).toMatchObject({ ai_profile: "economy", chat_model: "gpt-5-mini", reasoning_model: "gpt-5.6-luna", review_model: "gpt-5-mini" });
  });

  test("heartbeat delivers an overdue task notification within quiet-hours/cap rules", async () => {
    const quietStartHour = (new Date().getUTCHours() + 6) % 24;
    const quietEndHour = (quietStartHour + 1) % 24;
    const formatHour = (hour: number) => `${hour.toString().padStart(2, "0")}:00:00`;
    const [profileHeartbeatResponse, preferencesHeartbeatResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${user!.userId}`, {
        method: "PATCH",
        headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ timezone: "UTC", locale: "pt-BR" }),
      }),
      fetch(`${supabaseUrl}/rest/v1/agent_preferences?user_id=eq.${user!.userId}`, {
        method: "PATCH",
        headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ quiet_start: formatHour(quietStartHour), quiet_end: formatHour(quietEndHour) }),
      }),
    ]);
    expect(profileHeartbeatResponse.ok).toBe(true);
    expect(preferencesHeartbeatResponse.ok).toBe(true);

    const overdueTaskResponse = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
      method: "POST",
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ user_id: user!.userId, title: "Tarefa atrasada E2E", status: "todo", due_at: new Date(Date.now() - 86_400_000).toISOString(), confidence: 1, created_by: "user" }),
    });
    expect(overdueTaskResponse.ok).toBe(true);
    const heartbeatResponse = await restRpc(user!.accessToken, "request_heartbeat", {});
    expect(await heartbeatResponse.json()).toMatchObject({ silent: false, notifications_created: expect.any(Number) });
    const notificationResponse = await fetch(`${supabaseUrl}/rest/v1/notifications?select=type,body&user_id=eq.${user!.userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    const notifications = (await notificationResponse.json()) as Array<{ type: string; body: string }>;
    expect(notifications).toEqual(expect.arrayContaining([expect.objectContaining({ type: "task_overdue", body: "Tarefa atrasada E2E" })]));
  });

  test("undoes task creation and reflects cancellation across Work", async () => {
    await page.goto(`/pt-BR/app/inbox/${capturedEntryId}`);
    await page.getByRole("button", { name: "Desfazer criação" }).click();
    await expect(page.getByText("Criação desfeita.")).toBeVisible();

    const taskResponse = await fetch(`${supabaseUrl}/rest/v1/tasks?select=status&user_id=eq.${user!.userId}&source_entry_id=eq.${capturedEntryId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${user!.accessToken}` },
    });
    const tasks = (await taskResponse.json()) as Array<{ status: string }>;
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.status === "cancelled")).toBe(true);

    await page.goto("/pt-BR/app/work?view=all");
    await expect(page.getByText(confirmedTaskTitle, { exact: true })).toHaveCount(0);
  });

  test("records the complete daily-funnel product-event contract", async () => {
    const expectedJourneyEvents = [
      "capture_started",
      "capture_save_succeeded",
      "capture_processing_enqueued",
      "capture_processing_completed",
      "needs_attention_viewed",
      "needs_attention_item_opened",
      "interpretation_review_viewed",
      "interpretation_corrected",
      "technical_details_opened",
      "task_candidates_presented",
      "task_candidates_confirmed",
      "work_view_viewed",
    ];
    await expect.poll(async () => {
      const names = await loadProductEventNames(user!.userId, user!.accessToken);
      return expectedJourneyEvents.every((name) => names.includes(name));
    }, { timeout: 30_000 }).toBe(true);
    const productEventNames = await loadProductEventNames(user!.userId, user!.accessToken);
    const productEventCounts = Object.fromEntries(expectedJourneyEvents.map((name) => [name, productEventNames.filter((eventName) => eventName === name).length]));
    expect(expectedJourneyEvents.every((name) => productEventCounts[name] >= 1)).toBe(true);
    expect(productEventCounts.needs_attention_viewed).toBeGreaterThanOrEqual(2);
  });
});

test.describe("converged daily journey — basic question, recoverable retry, and terminal retry", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.setTimeout(150_000);

  let page: Page;
  let user: DisposableUser | undefined;

  test.beforeAll(async ({ browser }) => {
    user = await createDisposableUser("attention-states");
    page = await browser.newPage();
    await page.goto("/pt-BR/auth/login");
    await page.getByLabel("E-mail").fill(user.email);
    await page.getByLabel("Senha").fill(user.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app$/, { timeout: 30_000 });
  });

  test.afterAll(async () => {
    await deleteDisposableUser(user?.userId);
    await page.close();
  });

  test("surfaces a still-open basic question as needs-attention once the entry is otherwise complete", async ({}, testInfo) => {
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, "Preciso decidir algo, mas falta um detalhe.");
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "pt-BR",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: "Registro com pergunta pendente.",
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [],
        pendingQuestions: [{ question: "Qual é o prazo final?", reason: "Nenhum prazo foi mencionado.", confidence: 0.5 }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    // The initial interpretation's own open question keeps entries.status at
    // partially_processed. A reprocess that resolves with no pendingQuestions
    // of its own moves the entry to completed while the earlier question row
    // is still open (entry-scoped, not interpretation-scoped) — the one real
    // path this product currently has to "completed + an open question".
    const operationKey = crypto.randomUUID();
    await restRpc(user!.accessToken, "begin_entry_reprocessing", { p_entry_id: entryId, p_operation_key: operationKey, p_lease_seconds: 180 });
    await restRpc(user!.accessToken, "persist_reprocessed_entry_interpretation", {
      p_entry_id: entryId,
      p_operation_key: operationKey,
      p_extraction: {
        language: "pt-BR", occurredAt: new Date().toISOString(), isRetroactive: false,
        summary: "Registro reprocessado sem novas pendências.",
        concepts: ["raw_record"], contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [], pendingQuestions: [], confidence: 0.9,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
      p_element_trust: {
        summary: trustDecision("apply_and_flag"), concepts: trustDecision("apply_and_flag"), occurredAt: trustDecision("apply_and_flag"),
        extractedDates: trustDecision("apply_and_flag"), entities: trustDecision("apply_and_flag"),
      },
    });

    await page.goto(`/pt-BR/app/inbox/${entryId}`);
    const attentionRegion = page.getByRole("region", { name: "Precisa de você" });
    await expect(attentionRegion).toBeVisible();
    await expect(attentionRegion).toContainText("Responda uma pergunta");
    await expect(page.getByText("O original está seguro.")).toHaveCount(0);

    await page.goto("/pt-BR/app");
    await expect(page.getByRole("heading", { name: "Precisa de você" })).toBeVisible();
    await page.getByRole("link", { name: "Ver tudo" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/inbox\?view=needs-you$/);
    await expect(page.locator(`a.needs-attention-row[href="/pt-BR/app/inbox/${entryId}"]`)).toBeVisible();

    if (testInfo.project.name === "mobile") {
      const row = page.locator(`a.needs-attention-row[href="/pt-BR/app/inbox/${entryId}"]`);
      const box = await row.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("answers a pending question as an audited, undoable, stale-safe transition", async ({}, testInfo) => {
    // Fixture: an interpretation-backed open question (bare entry, no job, so
    // production automation never races this test).
    const marker = crypto.randomUUID().slice(0, 8);
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, `Pergunta e2e de resolução ${marker}.`);
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "pt-BR",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: "Registro com pergunta para responder.",
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [],
        pendingQuestions: [{ question: `Qual é o prazo final? (${marker})`, reason: "Nenhum prazo foi mencionado.", confidence: 0.5 }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    await page.goto("/pt-BR/app/questions");
    const card = page.locator(".question-card", { hasText: `(${marker})` });
    await expect(card).toBeVisible();
    const input = card.getByRole("textbox", { name: "Resposta" });
    const answerButton = card.getByRole("button", { name: "Responder", exact: true });
    if (testInfo.project.name === "mobile") {
      const inputBox = await input.boundingBox();
      const buttonBox = await answerButton.boundingBox();
      expect(inputBox?.height).toBeGreaterThanOrEqual(44);
      expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
    }

    // Answer, observe the audited success state and the undo control.
    await input.fill("  Sexta-feira às 14h  ");
    await answerButton.click();
    await expect(card.getByRole("status")).toHaveText("Resposta registrada.");
    const undoButton = card.getByRole("button", { name: "Desfazer resposta" });
    await expect(undoButton).toBeVisible();
    if (testInfo.project.name === "mobile") {
      const undoBox = await undoButton.boundingBox();
      expect(undoBox?.height).toBeGreaterThanOrEqual(44);
    }

    // Undo restores the editable open state.
    await undoButton.click();
    await expect(card.getByRole("status")).toHaveText("Resposta desfeita. A pergunta voltou para a fila.");
    await expect(card.getByRole("textbox", { name: "Resposta" })).toBeVisible();

    // Re-answer through the keyboard; the restored question resolves again.
    const restoredInput = card.getByRole("textbox", { name: "Resposta" });
    await restoredInput.fill("Resposta definitiva");
    await restoredInput.press("Enter");
    await expect(card.getByRole("status")).toHaveText("Resposta registrada.");
    await expect(card.getByRole("button", { name: "Desfazer resposta" })).toBeVisible();

    // The content-free outcome event lands fail-open.
    await expect.poll(async () => {
      const names = await loadProductEventNames(user!.userId, user!.accessToken);
      return names.filter((name) => name === "question_answered_basic").length;
    }, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);

    // Stale safety: a second question whose interpretation is superseded
    // rejects the answer with the stale conflict copy and no state change.
    const staleMarker = crypto.randomUUID().slice(0, 8);
    const staleEntryId = await insertBareEntry(user!.accessToken, user!.userId, `Pergunta e2e obsoleta ${staleMarker}.`);
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: staleEntryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: staleEntryId,
      p_extraction: {
        language: "pt-BR",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: "Registro com pergunta que ficará obsoleta.",
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [],
        pendingQuestions: [{ question: `Qual é o contexto? (${staleMarker})`, reason: "Contexto ausente.", confidence: 0.5 }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });
    await page.goto("/pt-BR/app/questions");
    const staleCard = page.locator(".question-card", { hasText: `(${staleMarker})` });
    await expect(staleCard).toBeVisible();
    const staleOperationKey = crypto.randomUUID();
    await restRpc(user!.accessToken, "begin_entry_reprocessing", { p_entry_id: staleEntryId, p_operation_key: staleOperationKey, p_lease_seconds: 180 });
    await restRpc(user!.accessToken, "persist_reprocessed_entry_interpretation", {
      p_entry_id: staleEntryId,
      p_operation_key: staleOperationKey,
      p_extraction: {
        language: "pt-BR", occurredAt: new Date().toISOString(), isRetroactive: false,
        summary: "Registro reprocessado sem pendências.",
        concepts: ["raw_record"], contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [], pendingQuestions: [], confidence: 0.9,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
      p_element_trust: {
        summary: trustDecision("apply_and_flag"), concepts: trustDecision("apply_and_flag"), occurredAt: trustDecision("apply_and_flag"),
        extractedDates: trustDecision("apply_and_flag"), entities: trustDecision("apply_and_flag"),
      },
    });
    await staleCard.getByRole("textbox", { name: "Resposta" }).fill("Resposta tardia");
    await staleCard.getByRole("button", { name: "Responder", exact: true }).click();
    await expect(staleCard.getByRole("alert")).toHaveText("A interpretação desta pergunta mudou. Atualize a página antes de resolver.");
  });

  // Phase 2D Slice 2D.4 — confirmed consequence / reinterpretation.
  test("answers and re-interprets only on explicit confirmation, and undoes the consequence", async ({}, testInfo) => {
    const marker = crypto.randomUUID().slice(0, 8);
    // A completed entry with an open question whose interpretation is current,
    // so the read-only effect preview offers the reinterpretation.
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, `Pergunta e2e com consequência ${marker}.`);
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "pt-BR",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: "Registro que pode ser reinterpretado.",
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [],
        pendingQuestions: [{ question: `Qual é o prazo final? (${marker})`, reason: "Nenhum prazo foi mencionado.", confidence: 0.5 }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    await page.goto("/pt-BR/app/questions");
    const card = page.locator(".question-card", { hasText: `(${marker})` });
    await expect(card).toBeVisible();

    // Opening the consequence panel mutates nothing and states so plainly.
    const openButton = card.getByRole("button", { name: "Responder e reinterpretar" });
    await expect(openButton).toBeVisible();
    await card.getByRole("textbox", { name: "Resposta" }).fill("O prazo é 30 de julho");
    await openButton.click();
    await expect(card.getByText("Nada foi aplicado ainda. Isto só acontece se você confirmar.")).toBeVisible();

    const confirmButton = card.getByRole("button", { name: "Confirmar e reinterpretar" });
    if (testInfo.project.name === "mobile") {
      const box = await confirmButton.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }

    // Skipping returns to the plain answer with no consequence applied.
    await card.getByRole("button", { name: "Pular consequência" }).click();
    await expect(confirmButton).toBeHidden();
    // Re-open and confirm the reinterpretation.
    await openButton.click();
    await confirmButton.click();
    await expect(card.getByRole("status")).toHaveText("Resposta registrada. A reinterpretação deste registro foi enfileirada.");
    await expect(card.getByText("Desfazer também cancela a reinterpretação enfileirada, se ela ainda não tiver começado.")).toBeVisible();

    // The reprocess job was enqueued through the existing owner-scoped path.
    await expect.poll(async () => {
      const jobs = await restSelect(
        user!.accessToken,
        `jobs?type=eq.interpret_entry&payload->>entry_id=eq.${entryId}&payload->>mode=eq.reprocess&select=id,status`,
      );
      return jobs.length;
    }, { timeout: 30_000 }).toBe(1);

    // The content-free reinterpretation event lands fail-open.
    await expect.poll(async () => {
      const names = await loadProductEventNames(user!.userId, user!.accessToken);
      return names.filter((name) => name === "question_reinterpret_applied").length;
    }, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

    // Undo restores the open question and cancels the un-claimed reprocess job.
    await card.getByRole("button", { name: "Desfazer resposta" }).click();
    await expect(card.getByRole("status")).toHaveText("Resposta desfeita. A pergunta voltou para a fila.");
    await expect.poll(async () => {
      const jobs = await restSelect(
        user!.accessToken,
        `jobs?type=eq.interpret_entry&payload->>entry_id=eq.${entryId}&payload->>mode=eq.reprocess&select=id`,
      );
      return jobs.length;
    }, { timeout: 30_000 }).toBe(0);
  });

  // Phase 2D Slice 2D.2 — question dispositions.
  test("defers, dismisses, and marks a pending question not relevant as audited, undoable transitions", async ({}, testInfo) => {
    const seedQuestion = async (label: string) => {
      const marker = crypto.randomUUID().slice(0, 8);
      const entryId = await insertBareEntry(user!.accessToken, user!.userId, `Pergunta e2e ${label} ${marker}.`);
      await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
      await restRpc(user!.accessToken, "persist_entry_interpretation", {
        p_entry_id: entryId,
        p_extraction: {
          language: "pt-BR",
          occurredAt: new Date().toISOString(),
          isRetroactive: false,
          summary: `Registro para ${label}.`,
          concepts: ["pending_question"],
          contexts: [], organizations: [], projects: [], people: [],
          taskCandidates: [],
          pendingQuestions: [{ question: `Qual é o prazo? (${marker})`, reason: "Nenhum prazo foi mencionado.", confidence: 0.5 }],
          confidence: 0.6,
        },
        p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
        p_input_tokens: 0, p_output_tokens: 0,
      });
      return marker;
    };

    const dismissMarker = await seedQuestion("descarte");
    const notRelevantMarker = await seedQuestion("nao-relevante");
    const deferMarker = await seedQuestion("adiamento");

    await page.goto("/pt-BR/app/questions");

    // Dismiss: terminal, audited, undoable.
    const dismissCard = page.locator(".question-card", { hasText: `(${dismissMarker})` });
    await expect(dismissCard).toBeVisible();
    const dismissButton = dismissCard.getByRole("button", { name: "Descartar" });
    if (testInfo.project.name === "mobile") {
      const box = await dismissButton.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await dismissButton.click();
    await expect(dismissCard.getByRole("status")).toHaveText("Pergunta descartada.");
    const undoDismiss = dismissCard.getByRole("button", { name: "Desfazer descarte" });
    await expect(undoDismiss).toBeVisible();
    await undoDismiss.click();
    await expect(dismissCard.getByRole("status")).toHaveText("Resolução desfeita. A pergunta voltou para a fila.");
    await expect(dismissCard.getByRole("button", { name: "Descartar" })).toBeVisible();

    // Not relevant: distinct terminal outcome.
    const notRelevantCard = page.locator(".question-card", { hasText: `(${notRelevantMarker})` });
    await notRelevantCard.getByRole("button", { name: "Não é relevante" }).click();
    await expect(notRelevantCard.getByRole("status")).toHaveText("Pergunta marcada como não relevante.");
    await expect(notRelevantCard.getByRole("button", { name: "Desfazer marcação" })).toBeVisible();

    // Defer: pick a future time and confirm; the question leaves the queue.
    const deferCard = page.locator(".question-card", { hasText: `(${deferMarker})` });
    await deferCard.getByRole("button", { name: "Adiar" }).click();
    const deferInput = deferCard.getByLabel("Adiar até");
    await expect(deferInput).toBeVisible();
    if (testInfo.project.name === "mobile") {
      const box = await deferInput.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const future = new Date(Date.now() + 3 * 86_400_000);
    const wall = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T09:00`;
    await deferInput.fill(wall);
    await deferCard.getByRole("button", { name: "Confirmar adiamento" }).click();
    await expect(deferCard.getByRole("status")).toContainText("Pergunta adiada até");
    await deferCard.getByRole("button", { name: "Desfazer adiamento" }).click();
    await expect(deferCard.getByRole("status")).toHaveText("Resolução desfeita. A pergunta voltou para a fila.");

    // The content-free disposition outcome events land fail-open.
    await expect.poll(async () => {
      const names = await loadProductEventNames(user!.userId, user!.accessToken);
      return names.filter((name) => name === "question_resolved").length;
    }, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  });

  // Phase 2D Slice 2D.3 — deterministic suggestions and read-only previews.
  test("offers deterministic suggestions and read-only source/effect previews without mutating anything", async ({}, testInfo) => {
    const marker = crypto.randomUUID().slice(0, 8);
    const entryId = await insertBareEntry(
      user!.accessToken,
      user!.userId,
      `Fechamos o escopo do Aurora com a Ana Prado e o Bruno Lima. (${marker})`,
    );
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "pt-BR",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: `Escopo do Aurora fechado. (${marker})`,
        concepts: ["pending_question"],
        contexts: [], organizations: [],
        projects: [{ name: "Aurora", confidence: 0.9, evidence: "escopo do Aurora", inferred: false }],
        people: [
          { name: "Ana Prado", confidence: 0.9, evidence: "com a Ana Prado", inferred: false },
          { name: "Bruno Lima", confidence: 0.8, evidence: "e o Bruno Lima", inferred: false },
        ],
        taskCandidates: [],
        pendingQuestions: [{
          question: `Quem ficou responsável pela entrega? (${marker})`,
          reason: "O registro não diz quem assume a entrega.",
          confidence: 0.5,
        }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    await page.goto("/pt-BR/app/questions");
    const card = page.locator(".question-card", { hasText: `(${marker})` });
    await expect(card).toBeVisible();

    // Bounded, deterministic, owner-derived options — never a fabricated set.
    const suggestions = card.getByRole("group", { name: "Respostas sugeridas" });
    await expect(suggestions).toBeVisible();
    const anaChip = suggestions.getByRole("button", { name: "Ana Prado" });
    const brunoChip = suggestions.getByRole("button", { name: "Bruno Lima" });
    await expect(anaChip).toBeVisible();
    await expect(brunoChip).toBeVisible();
    await expect(suggestions.getByRole("button")).toHaveCount(2);
    if (testInfo.project.name === "mobile") {
      const box = await anaChip.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }

    // Keyboard operable; selecting fills the still-editable field and never submits.
    const answerField = card.getByRole("textbox", { name: "Resposta" });
    await anaChip.focus();
    await page.keyboard.press("Enter");
    await expect(answerField).toHaveValue("Ana Prado");
    await expect(answerField).toBeFocused();
    await expect(anaChip).toHaveAttribute("aria-pressed", "true");
    await expect(brunoChip).toHaveAttribute("aria-pressed", "false");
    await expect(card.getByRole("status")).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Desfazer resposta" })).toHaveCount(0);

    // Editing away from the chip clears the selected provenance deterministically.
    await answerField.fill("Ana Prado e o Bruno");
    await expect(anaChip).toHaveAttribute("aria-pressed", "false");
    // Picking another suggestion replaces it.
    await brunoChip.click();
    await expect(answerField).toHaveValue("Bruno Lima");
    await expect(brunoChip).toHaveAttribute("aria-pressed", "true");
    await expect(anaChip).toHaveAttribute("aria-pressed", "false");

    // Read-only disclosures: opening them changes nothing and says so.
    const sourcePanel = card.locator("details.question-preview").first();
    const effectPanel = card.locator("details.question-preview").nth(1);
    await expect(sourcePanel).not.toHaveAttribute("open", "");
    await sourcePanel.getByText("Por que esta pergunta existe").click();
    await expect(sourcePanel.getByText("O registro não diz quem assume a entrega.")).toBeVisible();
    await expect(sourcePanel.getByText("Interpretação atual")).toBeVisible();
    await expect(sourcePanel.getByText(`Fechamos o escopo do Aurora com a Ana Prado e o Bruno Lima. (${marker})`)).toBeVisible();
    await effectPanel.getByText("O que mudaria se você responder").click();
    await expect(effectPanel.getByText("Nada foi aplicado ainda. Esta é apenas uma previsão.")).toBeVisible();

    // No horizontal overflow at either viewport.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // Opening panels and picking chips resolved nothing: the queue still lists it.
    await page.reload();
    await expect(page.locator(".question-card", { hasText: `(${marker})` })).toBeVisible();

    // The disposition controls remain fully available alongside suggestions.
    const reloaded = page.locator(".question-card", { hasText: `(${marker})` });
    await expect(reloaded.getByRole("button", { name: "Adiar" })).toBeVisible();
    await expect(reloaded.getByRole("button", { name: "Descartar" })).toBeVisible();
    await expect(reloaded.getByRole("button", { name: "Não é relevante" })).toBeVisible();

    // Submitting an unchanged suggestion resolves exactly like a typed answer.
    await reloaded.getByRole("group", { name: "Respostas sugeridas" })
      .getByRole("button", { name: "Ana Prado" }).click();
    await reloaded.getByRole("button", { name: "Responder", exact: true }).click();
    await expect(reloaded.getByRole("status")).toHaveText("Resposta registrada.");
    await expect(reloaded.getByRole("button", { name: "Desfazer resposta" })).toBeVisible();

    // The content-free preview and answer events land fail-open.
    await expect.poll(async () => {
      const names = await loadProductEventNames(user!.userId, user!.accessToken);
      return names.filter((name) => name === "question_effect_previewed").length;
    }, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  });

  test("renders the English suggestion and preview chrome", async () => {
    const marker = crypto.randomUUID().slice(0, 8);
    const entryId = await insertBareEntry(
      user!.accessToken,
      user!.userId,
      `We closed the Aurora scope with Ana Prado. (${marker})`,
    );
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "en",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: `Aurora scope closed. (${marker})`,
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [],
        people: [{ name: "Ana Prado", confidence: 0.9, evidence: "with Ana Prado", inferred: false }],
        taskCandidates: [],
        pendingQuestions: [{
          question: `Who owns the delivery? (${marker})`,
          reason: "The record does not say who owns it.",
          confidence: 0.5,
        }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    await page.goto("/en/app/questions");
    const card = page.locator(".question-card", { hasText: `(${marker})` });
    await expect(card).toBeVisible();
    const suggestions = card.getByRole("group", { name: "Suggested answers" });
    await expect(suggestions).toBeVisible();
    await suggestions.getByRole("button", { name: "Ana Prado" }).click();
    await expect(card.getByRole("textbox", { name: "Answer" })).toHaveValue("Ana Prado");

    const effectPanel = card.locator("details.question-preview").nth(1);
    await effectPanel.getByText("What would change if you answer").click();
    await expect(effectPanel.getByText("Nothing has been applied yet. This is only a prediction.")).toBeVisible();
    await expect(card.locator("details.question-preview").first().getByText("Why this question exists")).toBeVisible();
  });

  test("shows no suggestion chips when no truthful deterministic answer exists", async () => {
    const marker = crypto.randomUUID().slice(0, 8);
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, `Registro sem contexto sugerível. (${marker})`);
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "pt-BR",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: `Registro sem pistas. (${marker})`,
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [],
        pendingQuestions: [{
          question: `Quanto isso vai custar? (${marker})`,
          reason: "Nenhum valor foi mencionado.",
          confidence: 0.5,
        }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    await page.goto("/pt-BR/app/questions");
    const card = page.locator(".question-card", { hasText: `(${marker})` });
    await expect(card).toBeVisible();
    await expect(card.getByRole("group", { name: "Respostas sugeridas" })).toHaveCount(0);
    // The ordinary free-text flow is untouched.
    await card.getByRole("textbox", { name: "Resposta" }).fill("Cerca de R$ 2.000");
    await card.getByRole("button", { name: "Responder", exact: true }).click();
    await expect(card.getByRole("status")).toHaveText("Resposta registrada.");
  });

  test("dismisses a pending question with the English disposition copy", async () => {
    const marker = crypto.randomUUID().slice(0, 8);
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, `English e2e disposition question ${marker}.`);
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "en",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: "Entry with a question to dispose of.",
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [],
        pendingQuestions: [{ question: `What is the deadline? (${marker})`, reason: "No deadline was mentioned.", confidence: 0.5 }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    await page.goto("/en/app/questions");
    const card = page.locator(".question-card", { hasText: `(${marker})` });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Not relevant" }).click();
    await expect(card.getByRole("status")).toHaveText("Question marked as not relevant.");
    const undoButton = card.getByRole("button", { name: "Undo mark" });
    await expect(undoButton).toBeVisible();
    await undoButton.click();
    await expect(card.getByRole("status")).toHaveText("Resolution undone. The question returned to the queue.");
  });

  test("answers a pending question with the English resolution copy", async () => {
    const marker = crypto.randomUUID().slice(0, 8);
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, `English e2e resolution question ${marker}.`);
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "en",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: "Entry with a question to answer.",
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [],
        pendingQuestions: [{ question: `What is the deadline? (${marker})`, reason: "No deadline was mentioned.", confidence: 0.5 }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    await page.goto("/en/app/questions");
    const card = page.locator(".question-card", { hasText: `(${marker})` });
    await expect(card).toBeVisible();
    await card.getByRole("textbox", { name: "Answer" }).fill("Friday at 2pm");
    await card.getByRole("button", { name: "Answer", exact: true }).click();
    await expect(card.getByRole("status")).toHaveText("Answer recorded.");
    const undoButton = card.getByRole("button", { name: "Undo answer" });
    await expect(undoButton).toBeVisible();
    await undoButton.click();
    await expect(card.getByRole("status")).toHaveText("Answer undone. The question returned to the queue.");
  });

  test("offers retry after a recoverable processing failure and recovers on retry", async ({}, testInfo) => {
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, "Anotação simples para verificar recuperação de falha.");
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "fail_entry_interpretation", { p_entry_id: entryId, p_error: "Falha simulada e2e recuperável", p_terminal: false });

    const href = `/pt-BR/app/inbox/${entryId}`;
    await page.goto(href);
    await expect(page.locator(".entry-status-could_not_organize")).toBeVisible();
    const attentionRegion = page.getByRole("region", { name: "Precisa de você" });
    await expect(attentionRegion).toContainText("Tente organizar novamente");
    await expect(page.getByText("O original está seguro.")).toBeVisible();

    const retryButton = page.getByRole("button", { name: "Reinterpretar entrada" });
    await expect(retryButton).toBeVisible();
    await retryButton.focus();
    await expect(retryButton).toBeFocused();
    if (testInfo.project.name === "mobile") {
      const box = await retryButton.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    // The success toast is ephemeral client state (useActionState) and races
    // against how fast the real deployed worker picks the new job up: a fast
    // kick can revalidate the page before Playwright observes the toast. The
    // durable, meaningful signal is that the entry actually recovers.
    await retryButton.click();
    await waitForRecovered(page, href);
    await expect(page.locator(".entry-status-could_not_organize")).toHaveCount(0);
  });

  test("offers retry after terminal exhaustion and recovers on retry", async () => {
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, "Anotação simples para verificar recuperação de exaustão terminal.");
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "fail_entry_interpretation", { p_entry_id: entryId, p_error: "Falha simulada e2e terminal", p_terminal: true });

    const href = `/pt-BR/app/inbox/${entryId}`;
    await page.goto(href);
    await expect(page.locator(".entry-status-could_not_organize")).toBeVisible();
    await expect(page.getByRole("region", { name: "Precisa de você" })).toContainText("Tente organizar novamente");

    const retryButton = page.getByRole("button", { name: "Reinterpretar entrada" });
    await expect(retryButton).toBeVisible();
    await retryButton.click();
    await waitForRecovered(page, href);
    await expect(page.locator(".entry-status-could_not_organize")).toHaveCount(0);
  });

  test("resolves the same pending question from Chat and the Needs-you queue through the identical contract", async ({}, testInfo) => {
    // Slice 2D.5: one interpretation-backed open question must render as an
    // interactive element on the conversational surfaces and resolve through
    // the same audited/undoable contract the /questions page uses.
    const marker = crypto.randomUUID().slice(0, 8);
    const entryId = await insertBareEntry(user!.accessToken, user!.userId, `Pergunta conversacional e2e ${marker}.`);
    await restRpc(user!.accessToken, "begin_entry_interpretation", { p_entry_id: entryId });
    await restRpc(user!.accessToken, "persist_entry_interpretation", {
      p_entry_id: entryId,
      p_extraction: {
        language: "pt-BR",
        occurredAt: new Date().toISOString(),
        isRetroactive: false,
        summary: "Registro com pergunta para responder em conversa.",
        concepts: ["pending_question"],
        contexts: [], organizations: [], projects: [], people: [],
        taskCandidates: [],
        pendingQuestions: [{ question: `Onde vai acontecer? (${marker})`, reason: "Local não informado.", confidence: 0.5 }],
        confidence: 0.6,
      },
      p_model: "e2e-fixture", p_strategy_version: "e2e", p_prompt_version: "e2e",
      p_input_tokens: 0, p_output_tokens: 0,
    });

    // The pull surface always shows the question; the panel is a labeled region
    // with the interactive resolution form built from untrusted question text.
    await page.goto("/pt-BR/app/inbox?view=needs-you");
    const queuePanel = page.getByRole("region", { name: "Perguntas pendentes" });
    await expect(queuePanel).toBeVisible();
    const queueCard = queuePanel.locator(".question-card", { hasText: `(${marker})` });
    await expect(queueCard).toBeVisible();
    if (testInfo.project.name === "mobile") {
      expect((await page.locator("body").boundingBox())?.width ?? 0).toBeLessThanOrEqual(page.viewportSize()!.width);
    }

    // The Chat surface renders the same question as an interactive element and
    // resolves it inline. Answering here uses the identical Server Action.
    await page.goto("/pt-BR/app/chat");
    const chatPanel = page.getByRole("region", { name: "Perguntas para responder agora" });
    await expect(chatPanel).toBeVisible();
    const chatCard = chatPanel.locator(".question-card", { hasText: `(${marker})` });
    await expect(chatCard).toBeVisible();
    const input = chatCard.getByRole("textbox", { name: "Resposta" });
    const answerButton = chatCard.getByRole("button", { name: "Responder", exact: true });
    if (testInfo.project.name === "mobile") {
      expect((await input.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((await answerButton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await input.fill("No escritório central");
    await answerButton.click();
    await expect(chatCard.getByRole("status")).toHaveText("Resposta registrada.");
    const undoButton = chatCard.getByRole("button", { name: "Desfazer resposta" });
    await expect(undoButton).toBeVisible();

    // Convergence: after resolving from Chat, the queue and the /questions page
    // agree the question is no longer actionable.
    await page.goto("/pt-BR/app/questions");
    await expect(page.locator(".question-card", { hasText: `(${marker})` })).toHaveCount(0);
    await page.goto("/pt-BR/app/inbox?view=needs-you");
    await expect(page.locator(".question-card", { hasText: `(${marker})` })).toHaveCount(0);
  });
});
