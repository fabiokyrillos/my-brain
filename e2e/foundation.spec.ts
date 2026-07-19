import { expect, test } from "@playwright/test";

test("unauthenticated users are sent to an accessible login", async ({ page }) => {
  await page.goto("/pt-BR/app");
  await expect(page).toHaveURL(/\/pt-BR\/auth\/login/);
  await expect(page.getByRole("heading", { name: /entre no seu brain/i })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google" })).toHaveCount(0);
});

test("signup and password reset forms expose the complete validated fields", async ({ page }) => {
  await page.goto("/pt-BR/auth/register");
  await expect(page.getByLabel("Nome")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("minlength", "12");
  await expect(page.getByLabel("Confirme a senha")).toBeVisible();

  await page.goto("/pt-BR/auth/reset");
  await expect(page.getByRole("heading", { name: "Defina uma nova senha" })).toBeVisible();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirme a nova senha")).toBeVisible();
});

test("legacy task routes remain protected in both locales", async ({ request }) => {
  for (const [source, target] of [
    ["/pt-BR/app/today?page=3", "/pt-BR/auth/login"],
    ["/en/app/tasks?page=2", "/en/auth/login"],
    ["/pt-BR/app/waiting?page=4", "/pt-BR/auth/login"],
  ] as const) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers().location;
    expect(location).toBeDefined();
    const redirected = new URL(location!, "http://localhost:3000");
    expect(`${redirected.pathname}${redirected.search}`).toBe(target);
  }
});
