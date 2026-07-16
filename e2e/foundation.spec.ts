import { expect, test } from "@playwright/test";

test("unauthenticated users are sent to an accessible login", async ({ page }) => {
  await page.goto("/pt-BR/app");
  await expect(page).toHaveURL(/\/pt-BR\/auth\/login/);
  await expect(page.getByRole("heading", { name: /entre no seu brain/i })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
});
