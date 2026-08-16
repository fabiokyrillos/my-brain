import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2O.4's authenticated acceptance — `2O-AICONFIG-001` … `-009`,
 * `2O-COST-001` … `-007`.
 *
 * ## What only a browser can answer here
 *
 *  1. **The RSC boundary.** Ajustes mounts a new Server Component and Custos
 *     mounts another. Both compile and both are unit-tested, and neither fact
 *     means the page renders in production — the failure this repository
 *     recorded as *"the RSC boundary is only tested in production"*, where two
 *     surfaces shipped green and never rendered.
 *  2. **`2O-AICONFIG-009` in its strongest form.** A unit test asserts the
 *     modules contain no provider call; only a real navigation proves the page
 *     *renders* without one. The network is read directly, so a call that
 *     reached OpenAI would be caught even if it came from somewhere the source
 *     scan does not look.
 *  3. **`2O-COST-002` against a real account.** The ceilings come from
 *     constants, but the usage comes from the reader's own rows under RLS, and
 *     a fresh account is the one state a unit test cannot construct honestly.
 *
 * ## The account is disposable and its cascade cleans it up
 *
 * The same fixture shape slices 2O.2 and 2O.3 used, and this one writes even
 * less: it reads two pages and saves one preference.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

test.describe("the product says what it does with a model, and what it costs", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-aiconfig-${crypto.randomUUID()}@example.com`;
  const password = `AiConf!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "AI Config E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  test("2O-AICONFIG-001/-003/-004/-005: Ajustes states every route and controls only four", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings");

    const section = page.locator(".ai-config-section");
    // The RSC assertion: it rendered at all.
    await expect(page.getByRole("heading", { name: "Onde a IA é usada" })).toBeVisible();

    // `2O-AICONFIG-001`: all seven routes are named, five of them real uses.
    for (const route of [
      "Conversa",
      "Interpretação de registros",
      "Revisões e resumos",
      "Análise de arquivos",
      "Busca semântica",
      "Raciocínio avançado",
      "Rotinas internas",
    ]) {
      await expect(section.getByText(route, { exact: true })).toBeVisible();
    }

    // `2O-AICONFIG-003`: a model is stated for each route that has one.
    await expect(section.locator(".ai-config-route.controlled")).toHaveCount(4);
    await expect(section.locator(".ai-config-route.uncontrolled")).toHaveCount(1);
    await expect(section.locator(".ai-config-route.unconsumed")).toHaveCount(2);

    /*
     * `2O-AICONFIG-004` and `R-2O-13b`, asserted where it matters: the section
     * that **describes** the embedding route offers no way to change it. A
     * planted `<select>` here would fail, and the count above would still pass —
     * which is why both are asserted.
     */
    await expect(section.locator("input, select, textarea, button")).toHaveCount(0);

    // `2O-AICONFIG-005`: the two nothing calls say so rather than being absent.
    const unconsumed = section.locator(".ai-config-route.unconsumed").first();
    await expect(unconsumed).toContainText("Nada no produto lê esta preferência hoje");
    // And they carry no model, because none is routed.
    await expect(unconsumed.locator(".ai-config-route-model")).toHaveCount(0);
  });

  test("2O-AICONFIG-008: an account with no credential is told, with exactly one way out", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings");

    // The fixture account has configured no key, which is the state under test.
    const absent = page.locator(".ai-config-credential.absent");
    await expect(absent).toBeVisible();
    await expect(absent).toContainText("Nenhuma chave configurada");
    await expect(absent.getByRole("link")).toHaveCount(1);

    // The path is real: it lands on the credential panel's own heading.
    await absent.getByRole("link").click();
    await expect(page.getByRole("heading", { name: "Sua chave da OpenAI" })).toBeVisible();
  });

  test("2O-COST-002/-006/-007: Custos states the ceilings, the zone, and never a zero it did not read", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/costs");

    await expect(page.getByRole("heading", { name: "Custos de IA" })).toBeVisible();

    // `2O-COST-002`: the ceilings, from the enforced configuration.
    const quotas = page.locator(".quota-section");
    await expect(quotas.getByRole("heading", { name: "Limites da conta" })).toBeVisible();
    await expect(quotas.locator(".quota-item")).toHaveCount(5);
    // 300 is `QUOTAS.entriesPerDay`. A page stating a different number would be
    // stating a limit the database does not enforce.
    await expect(quotas.locator(".quota-item").first()).toContainText("300");
    // A brand-new account has used none of it, and `0 de 300` is a **read**
    // rather than a failure — the distinction `2O-COST-007` turns on.
    await expect(quotas.locator(".quota-item").first()).toContainText("0 de 300");
    await expect(quotas.locator(".quota-figure.unreadable")).toHaveCount(0);

    /*
     * `2O-COST-006`. Two zones on one page, and both said. The spend periods are
     * the account's zone; the quota windows are UTC, because
     * `private.utc_day_start()` is what the triggers count against. Describing
     * the quota day as "your day" would be the invention.
     */
    await expect(page.locator(".cost-zone")).toContainText("fuso da sua conta");
    await expect(quotas.locator(".quota-intro")).toContainText("meia-noite UTC");
  });

  test("2O-AICONFIG-009 and 2O-COST-005: neither surface calls a model or quotes a price", async ({ page }) => {
    const providerCalls: string[] = [];
    page.on("request", (request) => {
      if (/openai\.com|anthropic\.com/.test(request.url())) providerCalls.push(request.url());
    });

    await signInOnline(page, { email, locale: "pt-BR" });

    for (const route of ["/pt-BR/app/settings", "/pt-BR/app/costs"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
    }

    // `2O-AICONFIG-009` / `R-2O-17`, read off the wire rather than off the
    // source. This is the assertion the unit scan cannot make.
    expect(providerCalls, `a provider was called to render a surface`).toEqual([]);

    /*
     * `2O-COST-005` / `R-2O-18`. The model selects used to render a hardcoded
     * tariff — `$2.50 in · $15 out / 1M` — inside every option, a second copy of
     * `ai_model_pricing` carrying neither version nor source. It is gone, and
     * the catalogue that remains is on Custos, read from the table.
     */
    await page.goto("/pt-BR/app/settings");
    await page.locator("details.settings-advanced").click();
    const options = await page.locator("#chat-model option").allTextContents();
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option, `a model option quotes a price: ${option}`).not.toMatch(/\$|\/\s?1M/);
    }
  });
});
