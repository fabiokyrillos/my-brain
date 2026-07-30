import { expect, test } from "@playwright/test";

/**
 * Slice F1's authenticated acceptance for the assistant name (UX-06, DEC-2).
 *
 * The finding was not "a setting is ignored" — it was that
 * `agent_preferences.agent_name` had existed since `202607160001`, was accepted
 * by `save_profile_settings`, and had **no input and no consumer**, while
 * "Brain" hardened into a literal across the product for three different
 * referents at once.
 *
 * So this journey proves the separation rather than just the field:
 *
 * 1. the name is settable, and it persists;
 * 2. the **actor** is renamed everywhere it is addressed;
 * 3. the **destination** is not — it is `Conversar` / `Talk`, a place;
 * 4. the **product** is not — it is still `My Brain`.
 *
 * A disposable account created and deleted by the deployment-session harness;
 * no credential appears in source, in a fixture name or in an assertion.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

/** Distinctive and obviously not a product name, so "which referent" is provable. */
const RENAMED = "Ada";

const strings = {
  "pt-BR": {
    loginEmail: "E-mail",
    loginPassword: "Senha",
    loginSubmit: "Entrar",
    nameLabel: "Nome do assistente",
    save: "Salvar preferências",
    saved: "Preferências salvas.",
    destination: "Conversar",
    composerLabelDefault: "O que você quer dizer ao Brain?",
    composerLabelRenamed: `O que você quer dizer ao ${RENAMED}?`,
    captureLine: `O ${RENAMED} organiza sem alterar o original`,
    navigation: "Navegação principal",
    navigationMobile: "Navegação móvel",
  },
  en: {
    // Not localized: the login form renders the literal `E-mail` in both locales.
    loginEmail: "E-mail",
    loginPassword: "Password",
    loginSubmit: "Sign in",
    nameLabel: "Assistant name",
    save: "Save preferences",
    saved: "Preferences saved.",
    destination: "Talk",
    composerLabelDefault: "What do you want to tell Brain?",
    composerLabelRenamed: `What do you want to tell ${RENAMED}?`,
    captureLine: `${RENAMED} organizes without changing the original`,
    navigation: "Main navigation",
    navigationMobile: "Mobile navigation",
  },
} as const;

test.describe("the assistant name", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-identity-${crypto.randomUUID()}@example.com`;
  const password = `Identity!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Identity E2E" },
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

  // Serial: the rename is persisted state, so the two locales must not race for
  // the same row. Each case restores the default before it finishes.
  test.describe.configure({ mode: "serial" });

  for (const locale of ["pt-BR", "en"] as const) {
    test(`is settable, and renames the actor without renaming the place or the product — ${locale}`, async ({ page }, testInfo) => {
      const text = strings[locale];
      const mobile = testInfo.project.name === "mobile";

      await page.goto(`/${locale}/auth/login`);
      await page.getByLabel(text.loginEmail).fill(email);
      await page.getByLabel(text.loginPassword).fill(password);
      await page.getByRole("button", { name: text.loginSubmit }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/app$`), { timeout: 30_000 });

      // The composer addresses the assistant by its default name before anything
      // is changed. This is also the control for the assertion after the rename.
      await page.goto(`/${locale}/app/chat`);
      await expect(page.getByLabel(text.composerLabelDefault)).toBeVisible();

      // The field UX-06 found missing, carrying the stored default.
      await page.goto(`/${locale}/app/settings`);
      const nameField = page.getByLabel(text.nameLabel);
      await expect(nameField).toBeVisible();
      await expect(nameField).toHaveValue("Brain");

      await nameField.fill(RENAMED);
      await page.getByRole("button", { name: text.save }).click();
      await expect(page.getByRole("status")).toContainText(text.saved, { timeout: 30_000 });

      // It persisted: a reload reads it back from the column, not from the form.
      await page.reload();
      await expect(page.getByLabel(text.nameLabel)).toHaveValue(RENAMED);

      // The actor is renamed wherever it is addressed…
      await page.goto(`/${locale}/app/chat`);
      await expect(page.getByLabel(text.composerLabelRenamed)).toBeVisible();
      await expect(page.getByLabel(text.composerLabelDefault)).toHaveCount(0);

      // A second actor surface, to prove the accessor reaches pages that are not
      // the chat. The reassurance line is `display: none` under 760px by design
      // (`.capture-actions span`), so on Pixel 7 the assertion is that the copy
      // was rendered with the new name, not that it is on screen.
      await page.goto(`/${locale}/app/capture`);
      const captureLine = page.getByText(text.captureLine);
      if (mobile) await expect(captureLine).toBeAttached();
      else await expect(captureLine).toBeVisible();

      // …the destination is not. It is a place, and a place does not get renamed
      // when the assistant does (DEC-2). Read from whichever navigation this
      // viewport actually renders: the desktop rail is `display: none` under
      // 760px, and the bottom bar does not exist above it.
      const navigation = page.getByRole("navigation", { name: mobile ? text.navigationMobile : text.navigation });
      await expect(navigation.getByRole("link", { name: text.destination })).toBeVisible();
      await expect(navigation.getByRole("link", { name: RENAMED, exact: true })).toHaveCount(0);

      // …and neither is the product. Asserted from the document title rather
      // than the brand mark, because the brand lives in the rail and so is not
      // on screen at all on a phone — the title is the one place the product
      // name is stated at every viewport.
      await expect(page).toHaveTitle(/My Brain/);

      // Restore, so the next locale starts from the documented default.
      await page.goto(`/${locale}/app/settings`);
      await page.getByLabel(text.nameLabel).fill("Brain");
      await page.getByRole("button", { name: text.save }).click();
      await expect(page.getByRole("status")).toContainText(text.saved, { timeout: 30_000 });
    });
  }
});
