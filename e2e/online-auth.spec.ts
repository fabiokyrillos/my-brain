import { expect, test } from "@playwright/test";

import { mintOnlineAccessToken, signInOnline } from "./support/online-session";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const providerEmailDomain = process.env.ONLINE_AUTH_TEST_EMAIL_DOMAIN?.trim();
const fixtureEmailDomain = providerEmailDomain || "example.com";
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("online Supabase authentication", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-e2e-${crypto.randomUUID()}@${fixtureEmailDomain}`;
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

  /**
   * The login *form* is no longer part of this journey, and that is a statement
   * about coverage worth making explicitly rather than by omission.
   *
   * Hosted CAPTCHA declines automated browsers by design (SH-CAPTCHA-002), so
   * nothing automated can drive that form against the deployment. What this
   * case is actually about — that an authenticated session sees its own
   * preferences, that the settings surface writes them, and that the columns
   * SH.0 removed from the form stay absent — is unaffected, so it runs on the
   * session helper. The form's own behaviour is covered locally by
   * `e2e/account-session.spec.ts` against a stack without CAPTCHA.
   */
  test("an authenticated session persists only operational profile preferences", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });

    // The greeting is computed from the account's local time, so pinning one
    // period of the day made this assertion pass only in the afternoon. What it
    // is really asserting is that the shell greeted somebody at all.
    await expect(page.getByRole("heading", { name: /bom dia|boa tarde|boa noite/i })).toBeVisible();

    await page.goto("/pt-BR/app/settings");
    await expect(page.getByLabel("Fuso horário")).toHaveValue("America/Sao_Paulo");
    await expect(page.getByLabel("Seu nome")).toHaveCount(0);
    await expect(page.getByLabel("Nome do agente")).toHaveCount(0);
    await expect(page.getByLabel("Resumo diário")).toHaveCount(0);
    await expect(page.getByLabel("Nível de autonomia")).toHaveCount(0);
    await page.getByLabel("Fuso horário").selectOption("America/Cayenne");
    await page.getByLabel("Detalhe das respostas").selectOption("detailed");
    await page.getByRole("button", { name: "Salvar preferências" }).click();

    await expect(page.getByRole("status")).toHaveText("Preferências salvas.");

    // Read back as the user, through PostgREST, so RLS is what allows it. The
    // password grant is refused by hosted CAPTCHA for every client, so the
    // token comes from the admin link exchange instead.
    const auth = await mintOnlineAccessToken({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
    });

    const [profileResponse, preferencesResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?select=display_name,timezone&user_id=eq.${userId}`, {
        headers: { apikey: publishableKey!, authorization: `Bearer ${auth.accessToken}` },
      }),
      fetch(`${supabaseUrl}/rest/v1/agent_preferences?select=agent_name,response_detail&user_id=eq.${userId}`, {
        headers: { apikey: publishableKey!, authorization: `Bearer ${auth.accessToken}` },
      }),
    ]);

    const profiles = (await profileResponse.json()) as Array<{ display_name: string; timezone: string }>;
    const preferences = (await preferencesResponse.json()) as Array<{ agent_name: string; response_detail: string }>;
    expect(profiles).toEqual([{ display_name: "Codex E2E", timezone: "America/Cayenne" }]);
    expect(preferences).toEqual([{ agent_name: "Brain", response_detail: "detailed" }]);
  });

  test("creates an account through the validated signup journey", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "Provider email delivery is exercised once; mobile form access is covered by navigation tests.",
    );
    const signupEmail = `codex-signup-${crypto.randomUUID()}@${fixtureEmailDomain}`;
    const signupPassword = `Signup!${crypto.randomUUID()}A7`;
    test.skip(
      !providerEmailDomain,
      "No provider-routable test email domain is configured; provider signup delivery remains an explicit external limitation.",
    );

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

  /**
   * The last step — signing in with the new password — is **not** verifiable
   * headlessly, and this says so rather than dropping it quietly.
   *
   * Both ways of checking a password go through a CAPTCHA-guarded surface: the
   * login form, and `/auth/v1/token?grant_type=password`, which answers
   * `400 captcha_failed` for every client since SH.5. There is no third way to
   * ask "is this the password now?", so the assertion is replaced by the two
   * facts that *are* observable — the product's own `password-updated` receipt,
   * and the provider recording a change against the account.
   */
  test("exchanges a recovery link and updates the password", async ({ page }, testInfo) => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (!providerEmailDomain) {
      testInfo.annotations.push({
        type: "provider-limitation",
        description: "No provider-routable test email domain is configured, so provider recovery-email delivery was not retried.",
      });
    } else {
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
    }

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

    // The provider agrees that something changed on this account. Weaker than
    // signing in with the new password, and deliberately labelled as weaker.
    const { data: after } = await admin.auth.admin.getUserById(userId!);
    expect(after.user?.updated_at, "the provider recorded no change to the account").toBeTruthy();
    expect(new Date(after.user!.updated_at!).getTime())
      .toBeGreaterThan(new Date(after.user!.created_at).getTime());

    testInfo.annotations.push({
      type: "captcha-limitation",
      description:
        "Signing in with the new password is not asserted: both the login form and the password "
        + "grant are CAPTCHA-guarded, so no automated caller can verify a password while hosted "
        + "CAPTCHA is enabled. See docs/reports/phase-2g/PHASE_2G_ONLINE_HARNESS_ACCEPTANCE.md.",
    });
  });
});
