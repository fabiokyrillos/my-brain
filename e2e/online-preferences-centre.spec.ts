import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2O.3's authenticated acceptance — `2O-PREF-001` … `-015`.
 *
 * ## What only a browser can answer here
 *
 * Three things, and the first two have burned this repository before.
 *
 *  1. **The RSC boundary.** Ajustes now mounts two more sections and the root
 *     layout gained an inline script. Both compiled and both are unit-tested;
 *     neither fact means the page renders in production, which is the failure
 *     recorded as *"the RSC boundary is only tested in production"*.
 *  2. **`prefers-color-scheme`.** `2O-PREF-015` says an explicit choice beats
 *     the machine **in both directions**, and no unit test can express that:
 *     jsdom resolves no media queries and applies no stylesheet. Playwright can
 *     emulate a dark machine and read the computed token back.
 *  3. **The pre-paint script.** Whether the choice survives a reload without a
 *     flash is a statement about HTML parsing order, and it can only be made
 *     against a real navigation.
 *
 * ## The account is disposable and its cascade cleans up
 *
 * The same fixture shape slice 2O.2 used. The preferences written here are rows
 * on `agent_preferences`, which the account's deletion takes with it.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

/** `--background-canvas` in each theme, from `tokens.css`. */
const LIGHT_CANVAS = "#f7f6f3";
const DARK_CANVAS = "#141311";

test.describe("one preferences centre, and a theme the reader owns", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-preferences-${crypto.randomUUID()}@example.com`;
  const password = `Prefer!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Preferences E2E" },
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

  test("2O-PREF-001/-002: Ajustes reaches every preference, and no route ended", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/account");

    // The page renders at all, which is the RSC assertion.
    await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();

    const accountSection = page.locator(".data-ai-section", { hasText: "Conta e dados" });
    await expect(accountSection).toBeVisible();
    for (const door of ["Notificações", "Termos de uso", "Política de privacidade", "Apagar a conta"]) {
      await expect(accountSection.getByRole("link", { name: door })).toBeVisible();
    }

    /*
      Dados e IA is still there — in Privacidade e dados since slice 2P.5, which
      is a section away rather than a scroll away. The claim is unchanged: this
      slice added a reaching section rather than replacing one, and BOTH still
      exist. A single-page assertion would now be asserting the old layout.
    */
    await page.goto("/pt-BR/app/settings/privacy");
    await expect(page.locator(".data-ai-section", { hasText: "Dados e IA" })).toBeVisible();
    await page.goto("/pt-BR/app/settings/account");

    /*
     * `2O-PREF-002`'s hardest half: the reached route **keeps its own URL and
     * its deep link**. A tab of Ajustes would have taken the `?page` parameter
     * with it, which is exactly why this is a link and not a tab.
     */
    await accountSection.getByRole("link", { name: "Notificações" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/notifications$/);
    await expect(page.getByRole("heading", { name: "Notificações" })).toBeVisible();

    // And it wears the way back, which is what stops consolidation being a
    // claim Ajustes makes and this page contradicts.
    await page.getByRole("link", { name: "Voltar para Ajustes" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/app\/settings$/);

    // The deletion route, still outside `app/`, still asking properly.
    await page.goto("/pt-BR/app/settings/account");
    await page.locator(".data-ai-section", { hasText: "Conta e dados" })
      .getByRole("link", { name: "Apagar a conta" }).click();
    await expect(page).toHaveURL(/\/pt-BR\/account\/delete$/);
    await expect(page.getByRole("link", { name: "Voltar para Ajustes" })).toBeVisible();
  });

  test("2O-PREF-004/-005/-009/-010: the review controls save, and say what changed", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    /*
      Two sections since slice 2P.5: the advanced routing disclosure is IA and
      the review controls are Planejamento. Both assertions are unchanged.
    */
    await page.goto("/pt-BR/app/settings/ai");

    // `2O-PREF-009`: advanced is disclosed, and it is not the default view.
    const advanced = page.locator("details.settings-advanced");
    await expect(advanced).not.toHaveAttribute("open", "");

    await page.goto("/pt-BR/app/settings/planning");

    // `2O-PREF-005`: the promise `/app/reviews` makes, repeated where a reader
    // could otherwise conclude the opposite.
    await expect(page.getByText(/Nada é executado por horário configurado/)).toBeVisible();

    const daily = page.getByLabel("Fechamento do dia a partir de");
    await expect(daily).toHaveValue("22:00");
    await daily.fill("07:15");
    await page.getByLabel("Dia do fechamento da semana").selectOption("2");
    await page.getByRole("button", { name: "Salvar preferências" }).click();

    /*
     * `2O-PREF-010`. Not "Preferências salvas." alone — the sentence names what
     * will now behave differently, in the registry's own words. Asserting the
     * consequence rather than the field is the requirement's own emphasis.
     */
    const feedback = page.getByRole("status");
    await expect(feedback).toContainText("Preferências salvas.");
    await expect(feedback).toContainText("página de revisões oferece fechar o dia");

    // `2O-PREF-004`: it is a real write, not a round trip. The reload proves the
    // column moved rather than the form remembering.
    await page.reload();
    await expect(page.getByLabel("Fechamento do dia a partir de")).toHaveValue("07:15");
    await expect(page.getByLabel("Dia do fechamento da semana")).toHaveValue("2");

    // And a save that changes nothing says so instead of claiming an effect.
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await expect(page.getByRole("status")).toContainText("Nada mudou");
  });

  test("2O-PREF-013/-014/-015: an explicit choice beats the machine, in both directions", async ({
    page,
  }) => {
    const canvas = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--background-canvas").trim(),
      );

    /*
     * **A dark machine.** This is the direction that cannot be faked: the CSS
     * that resolves it lives inside `@media (prefers-color-scheme: dark)`, and
     * the qualifier `:root:not([data-theme="light"])` is what lets an explicit
     * light choice win. Without it the page would stay dark and only a real
     * browser would ever notice.
     */
    await page.emulateMedia({ colorScheme: "dark" });
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/appearance");

    // Follow-the-machine is where a reader who has chosen nothing starts.
    await expect(page.getByRole("radio", { name: "Seguir o aparelho" })).toBeChecked();
    expect(await canvas()).toBe(DARK_CANVAS);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);

    // Light, on a dark machine.
    await page.getByRole("radio", { name: "Claro" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await canvas()).toBe(LIGHT_CANVAS);

    /*
     * **The pre-paint script, across a real navigation.** The server sends no
     * `data-theme`, so if the script did not run during parsing the page would
     * arrive dark and correct itself. The attribute being present immediately
     * after load is that script having run before anything was painted.
     */
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await canvas()).toBe(LIGHT_CANVAS);
    await expect(page.getByRole("radio", { name: "Claro" })).toBeChecked();

    // The other direction: dark, on a light machine.
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    expect(await canvas()).toBe(LIGHT_CANVAS);
    await page.getByRole("radio", { name: "Escuro" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await canvas()).toBe(DARK_CANVAS);

    // Back to the machine, which removes the attribute rather than setting a
    // third value.
    await page.getByRole("radio", { name: "Seguir o aparelho" }).check();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await canvas()).toBe(LIGHT_CANVAS);
  });

  test("2O-PREF-014/-015: the choice is this browser's, not the account's", async ({ browser }) => {
    /*
     * `ADR-116` Decision 8's stated cost, proved rather than asserted: the same
     * account in a second browser context has never chosen anything, because
     * `localStorage` is per-origin-per-browser and nothing was written to any
     * column. `OD-2O-2` **A** signed exactly this in exchange for spending no
     * migration.
     */
    const first = await browser.newContext();
    const firstPage = await first.newPage();
    await signInOnline(firstPage, { email, locale: "pt-BR" });
    await firstPage.goto("/pt-BR/app/settings/appearance");
    await firstPage.getByRole("radio", { name: "Escuro" }).check();
    await expect(firstPage.locator("html")).toHaveAttribute("data-theme", "dark");

    const second = await browser.newContext();
    const secondPage = await second.newPage();
    await signInOnline(secondPage, { email, locale: "pt-BR" });
    await secondPage.goto("/pt-BR/app/settings/appearance");
    await expect(secondPage.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    await expect(secondPage.getByRole("radio", { name: "Seguir o aparelho" })).toBeChecked();
    // And the surface says so, rather than leaving it to be discovered.
    await expect(
      secondPage.getByText(/Fica guardado neste navegador/),
    ).toBeVisible();

    await first.close();
    await second.close();
  });

  test("2O-PREF-013: the whole centre works in English too", async ({ page }) => {
    await signInOnline(page, { email, locale: "en" });
    /*
      "The whole centre" is three sections now rather than one page, and walking
      all three is a stronger version of the same claim: each renders in English
      on its own route, so a locale that only worked on the surface a reader
      happened to land on would fail here.
    */
    await page.goto("/en/app/settings/appearance");

    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Follow the device" })).toBeChecked();
    await expect(page.getByText(/does not follow your account to other devices/)).toBeVisible();

    await page.goto("/en/app/settings/planning");
    await expect(page.getByLabel("Offer to close the day from")).toBeVisible();
    await expect(page.getByText(/Nothing runs from a configured schedule/)).toBeVisible();

    await page.goto("/en/app/settings/account");
    const accountSection = page.locator(".data-ai-section", { hasText: "Account and data" });
    await expect(accountSection.getByRole("link", { name: "Terms of use" })).toBeVisible();
    await expect(accountSection.getByRole("link", { name: "Delete the account" })).toBeVisible();
  });
});
