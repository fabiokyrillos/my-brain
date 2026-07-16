import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("online Supabase authentication", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-e2e-${crypto.randomUUID()}@example.com`;
  const password = `E2e!${crypto.randomUUID()}a7`;
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
        user_metadata: { display_name: "Codex E2E" },
      }),
    });

    expect(response.ok).toBe(true);
    const user = (await response.json()) as { id: string };
    userId = user.id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });
  });

  test("signs in and persists profile preferences", async ({ page }) => {
    await page.goto("/pt-BR/auth/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/pt-BR\/app$/);
    await expect(page.getByRole("heading", { name: /boa tarde/i })).toBeVisible();

    await page.goto("/pt-BR/app/settings");
    await expect(page.getByLabel("Nome do agente")).toHaveValue("Brain");
    await page.getByLabel("Seu nome").fill("Codex E2E verificado");
    await page.getByLabel("Nome do agente").fill("Brain Online");
    await page.getByRole("button", { name: "Salvar preferências" }).click();

    await expect(page).toHaveURL(/\/pt-BR\/app\/settings\?saved=1$/);

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey!, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const auth = (await authResponse.json()) as { access_token: string };

    const [profileResponse, preferencesResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?select=display_name&user_id=eq.${userId}`, {
        headers: { apikey: publishableKey!, authorization: `Bearer ${auth.access_token}` },
      }),
      fetch(`${supabaseUrl}/rest/v1/agent_preferences?select=agent_name&user_id=eq.${userId}`, {
        headers: { apikey: publishableKey!, authorization: `Bearer ${auth.access_token}` },
      }),
    ]);

    const profiles = (await profileResponse.json()) as Array<{ display_name: string }>;
    const preferences = (await preferencesResponse.json()) as Array<{ agent_name: string }>;
    expect(profiles).toEqual([{ display_name: "Codex E2E verificado" }]);
    expect(preferences).toEqual([{ agent_name: "Brain Online" }]);
  });
});
