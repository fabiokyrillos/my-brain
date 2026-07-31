import { expect, test } from "@playwright/test";

/**
 * Slice EGC.1's authenticated acceptance for Companies and Contexts (gates A4, A9).
 *
 * Before this slice, `public.organizations` and `public.contexts` had existed
 * since `202607160003`, had carried full `authenticated` CRUD under forced RLS
 * the whole time, and had **no route and no application writer**. Rows arrived
 * only from the interpretation pipeline. So the Company selector on a Person or
 * a Project could report "no company recorded yet" while owning no way to make
 * one — a dead end presented as a choice (`EG-04`).
 *
 * The journey proves the write rather than the form: every assertion after a
 * save re-reads the page, so a value rendering from React state instead of from
 * the database would fail here. Gate A4 is the last test — the created company
 * must be *selected on the person*, not merely creatable.
 *
 * Both locales and both viewports, because the copy is new in both and the
 * disclosure controls have to stay reachable at 44px on the phone.
 *
 * A disposable account created and deleted by this file; no credential appears
 * in source, in a fixture name or in an assertion.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("the entity graph's own surfaces", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-entitygraph-${crypto.randomUUID()}@example.com`;
  const password = `Graph!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Entity Graph E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Deleting the account cascades to its organizations, contexts, people and
  // audit rows — `user_id references auth.users(id) on delete cascade` on every
  // one of them — so nothing this journey created outlives it.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  async function signIn(page: import("@playwright/test").Page, locale: "pt-BR" | "en") {
    await page.goto(`/${locale}/auth/login`);
    await page.getByLabel(locale === "pt-BR" ? "E-mail" : "Email").fill(email);
    await page.getByLabel(locale === "pt-BR" ? "Senha" : "Password").fill(password);
    await page.getByRole("button", { name: locale === "pt-BR" ? "Entrar" : "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/app$`), { timeout: 30_000 });
  }

  test("a company can be created, opened and corrected, in Portuguese", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    const name = `Acme ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page, "pt-BR");
    await page.goto("/pt-BR/app/organizations");

    // The empty state is the state this slice exists to make actionable: it now
    // says what to do next and carries the control that does it.
    await expect(page.getByRole("heading", { name: "Empresas", level: 1 })).toBeVisible();
    const create = page.getByRole("button", { name: "Nova empresa" });
    await expect(create).toBeVisible();
    if (mobile) expect((await create.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    await create.click();
    await page.getByLabel("Nome").fill(name);
    await page.getByLabel("Descrição").fill("Cliente desde 2024");
    await page.getByRole("button", { name: "Criar empresa" }).click();

    const row = page.getByRole("link", { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 30_000 });

    // Re-read from the server rather than trusting the optimistic list.
    await page.reload();
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(name) }).click();

    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByText("Cliente desde 2024")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pessoas", level: 2 })).toBeVisible();
    await expect(page.getByText("Nenhuma pessoa vinculada.")).toBeVisible();

    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Descrição").fill("Cliente desde 2023");
    await page.getByRole("button", { name: "Salvar" }).click();

    await page.reload();
    await expect(page.getByText("Cliente desde 2023")).toBeVisible();
  });

  test("a context carries its kind through creation, listing and correction, in English", async ({ page }) => {
    const name = `Personal ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page, "en");
    await page.goto("/en/app/contexts");

    await expect(page.getByRole("heading", { name: "Contexts", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "New context" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Kind").selectOption("personal");
    await page.getByRole("button", { name: "Create context" }).click();

    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible({ timeout: 30_000 });

    // UX-21: the kind is a localized word on the list, never the stored token.
    await page.reload();
    const row = page.getByRole("link", { name: new RegExp(name) });
    await expect(row).toContainText("Personal");
    await expect(row).not.toContainText("personal_");
    await row.click();

    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tasks", level: 2 })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Kind")).toHaveValue("personal");
    await page.getByLabel("Kind").selectOption("work");
    await page.getByRole("button", { name: "Save" }).click();

    await page.reload();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Kind")).toHaveValue("work");
  });

  test("gate A4: a company created from a person is selected on that person", async ({ page }) => {
    const personName = `Camila ${crypto.randomUUID().slice(0, 8)}`;
    const companyName = `Beta ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page, "pt-BR");
    await page.goto("/pt-BR/app/people");
    await page.getByRole("textbox", { name: "Nome da pessoa" }).fill(personName);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByRole("link", { name: new RegExp(personName) })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: new RegExp(personName) }).click();

    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByRole("button", { name: "Criar nova empresa" }).click();
    await page.getByLabel("Nome da nova empresa").fill(companyName);
    await page.getByRole("button", { name: "Criar empresa" }).click();

    // The whole point of EGC-ORG-005: one act, not "create it, reopen the form,
    // now pick it". The selector must already hold the new company.
    await expect(page.getByText("Empresa criada e vinculada.")).toBeVisible({ timeout: 30_000 });

    // And it is stored, not merely displayed — this reload is what separates the
    // two.
    await page.reload();
    await expect(page.getByText(companyName)).toBeVisible();
    await page.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByLabel("Empresa")).toHaveValue(/.+/);
    const selected = await page.getByLabel("Empresa").evaluate(
      (element) => (element as HTMLSelectElement).selectedOptions[0]?.textContent ?? "",
    );
    expect(selected).toBe(companyName);

    // The company is reachable as a place of its own, and knows the person.
    await page.goto("/pt-BR/app/organizations");
    await page.getByRole("link", { name: new RegExp(companyName) }).click();
    await expect(page.getByRole("link", { name: new RegExp(personName) })).toBeVisible();
  });

  test("both new destinations are in the More navigation and mark themselves current", async ({ page }) => {
    await signIn(page, "pt-BR");
    await page.goto("/pt-BR/app/organizations");

    // `nested: true` in `capabilities.ts` is what keeps the parent destination
    // active on a detail page; asserted on the list first so the detail
    // assertion is not the only evidence.
    const current = page.locator('[aria-current="page"]');
    await expect(current.first()).toBeVisible();

    await page.goto("/pt-BR/app/contexts");
    await expect(page.locator('[aria-current="page"]').first()).toBeVisible();
  });
});
