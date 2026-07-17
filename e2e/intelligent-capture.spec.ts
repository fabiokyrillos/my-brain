import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("intelligent capture", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.setTimeout(180_000);

  const email = `codex-capture-${crypto.randomUUID()}@example.com`;
  const password = `Capture!${crypto.randomUUID()}a7`;
  const original = "Hoje conversei com Marina sobre o projeto Atlas. Crie uma tarefa para enviar a proposta amanhã às 15h.";
  let userId: string | undefined;
  let accessToken: string | undefined;
  let storagePath: string | undefined;

  test.beforeAll(async () => {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: "Capture E2E" } }),
    });
    expect(userResponse.ok).toBe(true);
    userId = ((await userResponse.json()) as { id: string }).id;

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey!, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(authResponse.ok).toBe(true);
    accessToken = ((await authResponse.json()) as { access_token: string }).access_token;
  });

  test.afterAll(async () => {
    if (!userId) return;
    if (storagePath) {
      const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
      await fetch(`${supabaseUrl}/storage/v1/object/user-files/${encodedPath}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
    }
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
  });

  test("preserves, interprets, confirms, audits, and undoes", async ({ page }) => {
    await page.goto("/pt-BR/auth/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app$/);

    await page.getByRole("textbox", { name: "Nova entrada" }).fill(original);
    await page.getByRole("button", { name: "Registrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/inbox\/[0-9a-f-]+$/, { timeout: 120_000 });
    await expect(page.getByRole("heading", { name: /enviar a proposta/i })).toBeVisible();
    await page.getByText("Ver registro original").click();
    await expect(page.getByText(original)).toBeVisible();
    await expect(page.getByText("Marina", { exact: true })).toBeVisible();

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
    await expect(page.getByText(/v2 · Correção do usuário/)).toBeVisible();
    await page.getByRole("button", { name: "Cancelar correção" }).click();
    await page.getByRole("button", { name: "Desfazer última correção" }).click();
    await expect(page.getByText(/v3 · Correção do usuário/)).toBeVisible();

    await page.goto(page.url().replace("/pt-BR/", "/en/"));
    await expect(page.getByRole("button", { name: "Correct interpretation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Immutable history" })).toBeVisible();
    await page.goto(page.url().replace("/en/", "/pt-BR/"));

    const createButton = page.getByRole("button", { name: /Criar \d+ tarefas?/ });
    await expect(createButton).toBeVisible();
    await createButton.click();
    await expect(page.getByRole("button", { name: "Desfazer criação" })).toBeVisible();

    const entryResponse = await fetch(`${supabaseUrl}/rest/v1/entries?select=id,original_content,status&user_id=eq.${userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
    });
    const entries = (await entryResponse.json()) as Array<{ id: string; original_content: string; status: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ original_content: original, status: "awaiting_review" });

    const auditResponse = await fetch(`${supabaseUrl}/rest/v1/audit_logs?select=action_type&user_id=eq.${userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
    });
    const audit = (await auditResponse.json()) as Array<{ action_type: string }>;
    expect(audit.map((item) => item.action_type)).toEqual(expect.arrayContaining([
      "entry_interpreted",
      "entry_interpretation_corrected",
      "entry_interpretation_correction_undone",
      "tasks_confirmed",
    ]));

    await page.goto("/pt-BR/app/chat");
    await page.getByRole("textbox", { name: "Pergunte ao Brain" }).fill("Com quem conversei sobre o projeto Atlas?");
    await page.getByRole("button", { name: "Enviar pergunta" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/chat\/[0-9a-f-]+$/, { timeout: 120_000 });
    await expect(page.locator(".chat-message.assistant")).toContainText("Marina");
    await expect(page.getByRole("link", { name: /Marina.*Atlas/i })).toBeVisible();

    await page.goto("/pt-BR/app/reviews");
    await page.getByRole("button", { name: "Resumo do dia" }).click();
    await expect(page.getByRole("status")).toHaveText("Revisão gerada.", { timeout: 120_000 });
    await page.reload();
    await expect(page.locator(".review-card")).toHaveCount(1);

    await page.goto("/pt-BR/app/files");
    await page.locator('input[type="file"]').setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("Documento de teste do fluxo privado.") });
    await page.getByRole("button", { name: "Enviar arquivo" }).click();
    await expect(page.getByRole("status")).toContainText("Arquivo privado enviado", { timeout: 120_000 });
    const attachmentResponse = await fetch(`${supabaseUrl}/rest/v1/attachments?select=storage_path,status&user_id=eq.${userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
    });
    const attachments = (await attachmentResponse.json()) as Array<{ storage_path: string; status: string }>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].status).toBe("ready");
    storagePath = attachments[0].storage_path;

    const usageResponse = await fetch(`${supabaseUrl}/rest/v1/ai_usage_events?select=operation,model,cost_status,cost_usd,input_tokens,output_tokens&user_id=eq.${userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
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

    await page.goto("/pt-BR/app/settings");
    await page.getByRole("radio", { name: /Econômico/ }).click();
    await expect(page.getByLabel("Chat principal")).toHaveValue("gpt-5-mini");
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await expect(page.getByRole("status")).toHaveText("Preferências salvas.");
    const preferencesResponse = await fetch(`${supabaseUrl}/rest/v1/agent_preferences?select=ai_profile,chat_model,reasoning_model,review_model&user_id=eq.${userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
    });
    const savedPreferences = (await preferencesResponse.json()) as Array<{ ai_profile: string; chat_model: string; reasoning_model: string; review_model: string }>;
    expect(savedPreferences[0]).toMatchObject({ ai_profile: "economy", chat_model: "gpt-5-mini", reasoning_model: "gpt-5.6-luna", review_model: "gpt-5-mini" });

    const quietStartHour = (new Date().getUTCHours() + 6) % 24;
    const quietEndHour = (quietStartHour + 1) % 24;
    const formatHour = (hour: number) => `${hour.toString().padStart(2, "0")}:00:00`;
    const [profileHeartbeatResponse, preferencesHeartbeatResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ timezone: "UTC", locale: "pt-BR" }),
      }),
      fetch(`${supabaseUrl}/rest/v1/agent_preferences?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ quiet_start: formatHour(quietStartHour), quiet_end: formatHour(quietEndHour) }),
      }),
    ]);
    expect(profileHeartbeatResponse.ok).toBe(true);
    expect(preferencesHeartbeatResponse.ok).toBe(true);

    const overdueTaskResponse = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
      method: "POST",
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, title: "Tarefa atrasada E2E", status: "todo", due_at: new Date(Date.now() - 86_400_000).toISOString(), confidence: 1, created_by: "user" }),
    });
    expect(overdueTaskResponse.ok).toBe(true);
    const heartbeatResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/request_heartbeat`, {
      method: "POST",
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(heartbeatResponse.ok).toBe(true);
    expect(await heartbeatResponse.json()).toMatchObject({
      silent: false,
      notifications_created: expect.any(Number),
    });
    const notificationResponse = await fetch(`${supabaseUrl}/rest/v1/notifications?select=type,body&user_id=eq.${userId}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
    });
    const notifications = (await notificationResponse.json()) as Array<{ type: string; body: string }>;
    expect(notifications).toEqual(expect.arrayContaining([expect.objectContaining({ type: "task_overdue", body: "Tarefa atrasada E2E" })]));

    await page.goto(`/pt-BR/app/inbox/${entries[0].id}`);
    await page.getByRole("button", { name: "Desfazer criação" }).click();
    await expect(page.getByText("Criação desfeita.")).toBeVisible();

    const taskResponse = await fetch(`${supabaseUrl}/rest/v1/tasks?select=status&user_id=eq.${userId}&source_entry_id=eq.${entries[0].id}`, {
      headers: { apikey: publishableKey!, authorization: `Bearer ${accessToken}` },
    });
    const tasks = (await taskResponse.json()) as Array<{ status: string }>;
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.status === "cancelled")).toBe(true);
  });
});
