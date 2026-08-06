import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice F2's authenticated acceptance for Projects and People (UX-08, UX-09).
 *
 * Before this slice, `createRecord` inserted `{user_id, name}` and **nothing on
 * either detail page could be changed** — `projects.description`,
 * `projects.status`, `people.notes` and both `organization_id` columns existed
 * in the schema and were unreachable from the UI.
 *
 * So the journey proves the write, not just the form: every assertion after a
 * save re-reads the page, so a value that rendered from React state rather than
 * from the database would fail here.
 *
 * A disposable account created and deleted by the deployment-session harness;
 * no credential appears in source, in a fixture name or in an assertion.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("editing a project and a person", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-entities-${crypto.randomUUID()}@example.com`;
  const password = `Entities!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Entities E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Deleting the account cascades to its projects, people and audit rows, so
  // nothing this journey created outlives it.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  test("a project's description, status and company become editable", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    const projectName = `Atlas ${crypto.randomUUID().slice(0, 8)}`;

    await signInOnline(page, { email, locale: "pt-BR" });

    await page.goto("/pt-BR/app/projects");
    await page.getByRole("textbox", { name: "Nome do projeto" }).fill(projectName);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByRole("link", { name: new RegExp(projectName) })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: new RegExp(projectName) }).click();
    await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();

    // A newly created project has no description and no company, which is
    // exactly the state UX-08 found unreachable.
    const edit = page.getByRole("button", { name: "Editar" });
    await expect(edit).toBeVisible();
    if (mobile) expect((await edit.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await edit.click();

    // No organization exists for a fresh account, so the selector explains
    // itself instead of offering an empty control.
    await expect(page.getByLabel("Empresa")).toBeEnabled();
    await expect(page.getByText("Nenhuma empresa registrada ainda.")).toBeVisible();

    await page.getByLabel("Descrição").fill("Migração do faturamento");
    await page.getByLabel("Situação").selectOption("paused");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator(".entity-edit-feedback.success")).toHaveText("Alterações salvas.", { timeout: 30_000 });

    // Re-read from the database rather than trusting what the form left behind.
    await page.reload();
    await expect(page.getByText("Migração do faturamento")).toBeVisible();
    await expect(page.locator(".entity-hero .eyebrow")).toHaveText("PAUSADO");
    await expect(page.locator(".entity-relation-line strong")).toHaveText("Sem empresa");

    // The status is localized on the way out, not shown as its raw enum.
    await page.goto("/en/app/projects");
    await page.getByRole("link", { name: new RegExp(projectName) }).click();
    await expect(page.locator(".entity-hero .eyebrow")).toHaveText("PAUSED");
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  test("renaming onto an existing name is refused as a duplicate, not as an outage", async ({ page }) => {
    const first = `Alpha ${crypto.randomUUID().slice(0, 8)}`;
    const second = `Beta ${crypto.randomUUID().slice(0, 8)}`;

    await signInOnline(page, { email, locale: "pt-BR" });

    await page.goto("/pt-BR/app/projects");
    for (const name of [first, second]) {
      await page.getByRole("textbox", { name: "Nome do projeto" }).fill(name);
      await page.getByRole("button", { name: "Adicionar" }).click();
      await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible({ timeout: 30_000 });
    }

    await page.getByRole("link", { name: new RegExp(second) }).click();
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome").fill(first);
    await page.getByRole("button", { name: "Salvar" }).click();

    // The distinction that matters: a name collision is a user mistake with an
    // obvious next step, and the form stays open holding what they typed.
    await expect(page.locator(".entity-edit-feedback.error")).toHaveText("Esse nome já existe.", { timeout: 30_000 });
    await expect(page.getByLabel("Nome")).toHaveValue(first);

    // And it is escapable — an error must not hold the form open against a
    // Cancel click.
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByLabel("Nome")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: second, level: 1 })).toBeVisible();
  });

  test("a person's notes become editable, and their modelled relations are shown", async ({ page }) => {
    const personName = `Marina ${crypto.randomUUID().slice(0, 8)}`;

    await signInOnline(page, { email, locale: "en" });

    await page.goto("/en/app/people");
    await page.getByRole("textbox", { name: "Person name" }).fill(personName);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("link", { name: new RegExp(personName) })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: new RegExp(personName) }).click();

    // The two relation blocks UX-09 found modelled and never rendered. Empty
    // for a fresh person, but present and named — which is the difference
    // between "nothing recorded" and "this product has no idea".
    await expect(page.getByRole("heading", { name: "Relationship to you" })).toBeVisible();
    await expect(page.getByText("No relationship recorded.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contexts" })).toBeVisible();
    await expect(page.getByText("No context recorded.")).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    // A person has notes and no status; a project has status and no notes.
    await expect(page.getByLabel("Notes")).toBeVisible();
    await expect(page.getByLabel("Status")).toHaveCount(0);

    await page.getByLabel("Notes").fill("Prefers email before 10am");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".entity-edit-feedback.success")).toHaveText("Changes saved.", { timeout: 30_000 });

    await page.reload();
    await expect(page.getByText("Prefers email before 10am")).toBeVisible();
  });
});
