import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey);

test.describe("authenticated mobile navigation", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-mobile-${crypto.randomUUID()}@example.com`;
  const password = `Mobile!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Mobile navigation E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
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

  test("reaches every overflow destination", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "This journey exercises the mobile viewport.");

    await page.goto("/pt-BR/auth/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app$/);

    const mobileNavigation = page.getByRole("navigation", { name: "Navegação móvel" });
    await mobileNavigation.getByText("Mais", { exact: true }).click();

    for (const destination of [
      "Aguardando",
      "Projetos",
      "Pessoas",
      "Lembretes",
      "Perguntas pendentes",
      "Chat com o Brain",
      "Memórias",
      "Revisões",
      "Arquivos",
      "Histórico",
      "Custos de IA",
      "Notificações",
      "Configurações",
    ]) {
      await expect(mobileNavigation.getByRole("link", { name: destination })).toBeVisible();
    }
  });
});
