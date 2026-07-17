import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("online Supabase authentication", () => {
  test.describe.configure({ mode: "serial" });
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

    await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}`, {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey!,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }),
      fetch(`${supabaseUrl}/rest/v1/agent_preferences?user_id=eq.${userId}`, {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey!,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }),
    ]);
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
    await expect(page.getByLabel("Seu nome")).toHaveValue("Codex E2E");
    await expect(page.getByLabel("Nome do agente")).toHaveValue("Brain");
    await expect(page.getByLabel("Fuso horário")).toHaveValue("America/Sao_Paulo");
    await page.getByLabel("Seu nome").fill("Codex E2E verificado");
    await page.getByLabel("Nome do agente").fill("Brain Online");
    await page.getByRole("button", { name: "Salvar preferências" }).click();

    await expect(page.getByRole("status")).toHaveText("Preferências salvas.");

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

  test("creates an account through the validated signup journey", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "Provider email delivery is exercised once; mobile form access is covered by navigation tests.",
    );
    const signupEmail = `codex-signup-${crypto.randomUUID()}@example.com`;
    const signupPassword = `Signup!${crypto.randomUUID()}A7`;

    await page.goto("/pt-BR/auth/register");
    await page.getByLabel("Nome").fill("Signup E2E");
    await page.getByLabel("E-mail").fill(signupEmail);
    await page.getByLabel("Senha", { exact: true }).fill(signupPassword);
    await page.getByLabel("Confirme a senha").fill(signupPassword);
    await page.getByRole("button", { name: "Criar conta" }).click();

    await page.waitForURL((url) => (
      url.pathname === "/pt-BR/auth/login" && url.searchParams.has("message")
    ) || (
      url.pathname === "/pt-BR/auth/register" && url.searchParams.has("error")
    ));
    const resultUrl = new URL(page.url());
    if (resultUrl.searchParams.get("error") === "email-rate-limited") {
      test.skip(
        true,
        "Supabase's hosted email quota is exhausted; retry after the provider window resets.",
      );
    }
    await expect(page).toHaveURL(/\/pt-BR\/auth\/login\?message=check-email/);
    await expect(page.getByText("Confira seu e-mail para confirmar a conta.")).toBeVisible();

    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(error).toBeNull();
    const createdUser = data.users.find((candidate) => candidate.email === signupEmail);
    expect(createdUser).toBeDefined();
    if (createdUser) await admin.auth.admin.deleteUser(createdUser.id);
  });

  test("exchanges a recovery link, updates the password, and signs in again", async ({ page }) => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await page.goto("/pt-BR/auth/recover");
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await page.waitForURL((url) => url.searchParams.has("message") || url.searchParams.has("error"));
    const recoveryRequestUrl = new URL(page.url());
    expect([
      recoveryRequestUrl.searchParams.get("message"),
      recoveryRequestUrl.searchParams.get("error"),
    ]).toEqual(expect.arrayContaining([
      expect.stringMatching(/^(?:recovery-sent|email-rate-limited)$/),
    ]));

    // Admin-generated links cannot reproduce the PKCE verifier cookie created
    // by the production recovery action. Verify the one-time token directly
    // and install the same SSR session shape before exercising the protected
    // reset action end to end.
    const redirectTo = "http://localhost:3000/pt-BR/auth/reset";
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    expect(error).toBeNull();
    expect(data.properties).not.toBeNull();
    if (!data.properties) throw new Error("Supabase did not return a recovery action link.");

    const recoveryClient = createClient(supabaseUrl!, publishableKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verifiedRecovery, error: verificationError } = await recoveryClient.auth.verifyOtp({
      token_hash: data.properties.hashed_token,
      type: "recovery",
    });
    expect(verificationError).toBeNull();
    expect(verifiedRecovery.session).not.toBeNull();
    if (!verifiedRecovery.session) throw new Error("Recovery session is unavailable.");

    const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
    const sessionCookie = `base64-${Buffer.from(
      JSON.stringify(verifiedRecovery.session),
      "utf8",
    ).toString("base64url")}`;
    await page.context().addCookies([{
      name: `sb-${projectRef}-auth-token`,
      value: sessionCookie,
      url: "http://localhost:3000",
      sameSite: "Lax",
    }]);
    await page.goto("/pt-BR/auth/reset");
    await expect(page.getByRole("heading", { name: "Defina uma nova senha" })).toBeVisible();

    const newPassword = `Recovered!${crypto.randomUUID()}A7`;
    await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirme a nova senha").fill(newPassword);
    await page.getByRole("button", { name: "Atualizar senha" }).click();

    await expect(page).toHaveURL(/\/pt-BR\/auth\/login\?message=password-updated/);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(newPassword);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app$/);
  });
});
