import { expect, test } from "@playwright/test";

test("unauthenticated users are sent to an accessible login", async ({ page }) => {
  await page.goto("/pt-BR/app");
  await expect(page).toHaveURL(/\/pt-BR\/auth\/login/);
  await expect(page.getByRole("heading", { name: /entre no seu brain/i })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google" })).toHaveCount(0);
});

/**
 * SH-LEGAL-001/012/013. The legal routes are the one part of this initiative
 * that is genuinely public, so they are fully provable without credentials:
 * reachable unauthenticated, exactly one `h1`, the professional-review banner
 * present, and both locales served.
 */
test("the legal routes are public, in both locales, with one h1 and the review banner", async ({
  page,
}) => {
  for (const [path, heading, banner] of [
    ["/pt-BR/legal/terms", "Termos de Uso", /revis[ãa]o jur[ií]dica/i],
    ["/pt-BR/legal/privacy", "Política de Privacidade", /revis[ãa]o jur[ií]dica/i],
    ["/en/legal/terms", "Terms of Service", /legal review/i],
    ["/en/legal/privacy", "Privacy Policy", /legal review/i],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByText(banner)).toBeVisible();
  }
});

test("signup and password reset forms expose the complete validated fields", async ({ page }) => {
  await page.goto("/pt-BR/auth/register");
  await expect(page.getByLabel("Nome")).toBeVisible();
  // SH-LEGAL-007: present, required, and unchecked by default.
  const consent = page.locator('input[name="acceptedPolicies"]');
  await expect(consent).toHaveAttribute("type", "checkbox");
  await expect(consent).not.toBeChecked();
  await expect(consent).toHaveAttribute("required", "");
  await expect(page.getByRole("link", { name: "Termos de Uso" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Política de Privacidade" })).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("minlength", "12");
  await expect(page.getByLabel("Confirme a senha")).toBeVisible();

  await page.goto("/pt-BR/auth/reset");
  await expect(page.getByRole("heading", { name: "Defina uma nova senha" })).toBeVisible();
  await expect(page.getByLabel("Nova senha", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirme a nova senha")).toBeVisible();
});

/**
 * SH-SUSPEND-002/008. The suspended surface itself needs a genuinely suspended
 * account, which needs credentials — so its rendering is unit-proven
 * (`account-menu.test.tsx` family) and its deployed journey is SH-WORKER-004's
 * gate. What IS credential-free, and worth pinning here, is that the route
 * exists and is not a public page: an unauthenticated visitor is sent to login
 * exactly like a product route, so "account-state" can never become a surface
 * that leaks whether an account is suspended to somebody who is not it.
 */
test("the account-state surface is authenticated-only in both locales", async ({ request }) => {
  for (const [source, target] of [
    ["/pt-BR/account-state", "/pt-BR/auth/login"],
    ["/en/account-state", "/en/auth/login"],
  ] as const) {
    const response = await request.get(source, { maxRedirects: 0 });
    // The redirect here is the page's own `redirect()` rather than the proxy's,
    // so the status is asserted as "a redirect" rather than as one exact code.
    expect([307, 308]).toContain(response.status());
    const location = response.headers().location;
    expect(location).toBeDefined();
    expect(new URL(location!, "http://localhost:3000").pathname).toBe(target);
  }
});

test("canonical and legacy daily routes remain protected in both locales", async ({ request }) => {
  for (const [source, target] of [
    ["/pt-BR/app/inbox?view=needs-you", "/pt-BR/auth/login"],
    ["/en/app/inbox/entry-1", "/en/auth/login"],
    ["/pt-BR/app/work?view=waiting&page=2", "/pt-BR/auth/login"],
    ["/en/app/chat/conversation-1", "/en/auth/login"],
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
