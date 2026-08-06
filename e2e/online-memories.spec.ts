import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice G3's authenticated acceptance for Memories (UX-10) and DEC-5.
 *
 * Before this slice a memory was a row of text, a kind and a confidence
 * percentage. `source_entry_id`, `person_id`, `project_id`, `sensitivity`,
 * `valid_from` and `valid_until` existed in the schema and were unreachable
 * from anywhere in the product, and the composer could recognise "lembre disso"
 * but had nowhere to put it.
 *
 * So this journey proves the writes, not the forms: every assertion after a
 * save re-reads the page, so a value that rendered from React state rather than
 * from the database would fail here.
 *
 * A disposable account created and deleted by the harness; no credential
 * appears in source, in a fixture name or in an assertion, and no real memory
 * content is used.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("a memory becomes inspectable, correctable and archivable", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-memories-${crypto.randomUUID()}@example.com`;
  const password = `Memories!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Memories E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Deleting the account cascades to its memories, people and audit rows, so
  // nothing this journey created outlives it.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  async function signIn(page: import("@playwright/test").Page, locale: "pt-BR" | "en" = "pt-BR") {
    await signInOnline(page, { email, locale });
  }

  test("a manually created memory is inspectable, editable and archivable", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    const content = `Uso o mesmo banco desde ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page);

    await page.goto("/pt-BR/app/memories");
    // The mental model is stated before the rows, not implied by them.
    await expect(page.getByText("Uma memória é um fato ou preferência sua")).toBeVisible();

    await page.getByRole("textbox").first().fill(content);
    await page.getByRole("button", { name: "Adicionar" }).click();

    // UX-20: the row is a link now, because there is somewhere to go.
    const row = page.getByRole("link", { name: new RegExp(content) });
    await expect(row).toBeVisible({ timeout: 30_000 });
    if (mobile) expect((await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    // The misleading confidence percentage is gone from the list.
    await expect(page.locator(".list-stack")).not.toContainText("100%");

    await row.click();
    await expect(page.getByRole("heading", { name: new RegExp(content), level: 1 })).toBeVisible();

    // Provenance, relations and validity — every one of them previously
    // unreachable from the product.
    await expect(page.getByText("Criada por você")).toBeVisible();
    await expect(page.locator(".memory-facts")).toContainText("Sem prazo");
    await expect(page.getByText("Em vigor: pode ser usada nas respostas agora.")).toBeVisible();

    // Correcting it: content, kind and importance in one save.
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Memória", { exact: true }).fill(`${content} (corrigida)`);
    await page.getByLabel("Tipo").selectOption("rule");
    await page.getByLabel("Marcar como importante").check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator(".entity-edit-feedback.success")).toHaveText("Alterações salvas.", {
      timeout: 30_000,
    });

    // Re-read from the database rather than trusting what the form left behind.
    await page.reload();
    await expect(page.getByRole("heading", { name: /\(corrigida\)/, level: 1 })).toBeVisible();
    await expect(page.locator(".eyebrow")).toHaveText("REGRA");

    // Archiving ends the validity and never deletes the row: the memory, its
    // provenance and its detail page all survive.
    // Scoped to the visible paragraph: the same sentence is also in the polite
    // live region, which is deliberate and would otherwise be an ambiguous match.
    const lifecycleFeedback = page.locator(".memory-lifecycle .entity-edit-feedback");
    await page.getByRole("button", { name: "Arquivar" }).click();
    await expect(lifecycleFeedback).toHaveText("Memória arquivada.", { timeout: 30_000 });

    await page.reload();
    await expect(page.locator(".memory-state")).toHaveText("Arquivada");
    await expect(page.getByText("Arquivada: não é mais usada nas respostas.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /\(corrigida\)/, level: 1 })).toBeVisible();
    await expect(page.locator(".memory-facts")).not.toContainText("Sem prazo");

    // And it comes back.
    await page.getByRole("button", { name: "Reativar" }).click();
    await expect(lifecycleFeedback).toHaveText("Memória reativada.", { timeout: 30_000 });
    await page.reload();
    await expect(page.locator(".memory-state")).toHaveText("Em vigor");
  });

  test("a memory relates to a person, and the relation is navigable", async ({ page }) => {
    const personName = `Marina ${crypto.randomUUID().slice(0, 8)}`;
    const content = `Prefere e-mail ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page);

    await page.goto("/pt-BR/app/people");
    await page.getByRole("textbox").first().fill(personName);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByRole("link", { name: new RegExp(personName) })).toBeVisible({ timeout: 30_000 });

    await page.goto("/pt-BR/app/memories");
    await page.getByRole("textbox").first().fill(content);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await page.getByRole("link", { name: new RegExp(content) }).click();

    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Pessoa").selectOption({ label: personName });
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator(".entity-edit-feedback.success")).toBeVisible({ timeout: 30_000 });

    await page.reload();
    const personLink = page.locator(".memory-facts").getByRole("link", { name: personName });
    await expect(personLink).toBeVisible();
    await personLink.click();
    await expect(page).toHaveURL(/\/app\/people\//);
  });

  test("the English surface uses English labels, not raw database enums", async ({ page }) => {
    const content = `Office closes at six ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page, "en");

    await page.goto("/en/app/memories");
    await expect(page.getByText("A memory is a fact or preference of yours")).toBeVisible();
    await page.getByRole("textbox").first().fill(content);
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByRole("link", { name: new RegExp(content) }).click();

    // UX-21: this page used to render `recurring_info` spaced out for English
    // readers. Every label is now a sentence in the reader's language.
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Type").selectOption("recurring_info");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".entity-edit-feedback.success")).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.locator(".eyebrow")).toHaveText("RECURRING INFORMATION");
    await expect(page.locator("body")).not.toContainText("recurring_info");
    await expect(page.getByText("In force: can be used in answers now.")).toBeVisible();
  });

  test("the composer proposes a memory and writes only after confirmation (DEC-5)", async ({ page }) => {
    const subject = `reuniões às ${crypto.randomUUID().slice(0, 6)}`;

    await signIn(page);
    await page.goto("/pt-BR/app/chat");

    await page.getByRole("textbox").first().fill(`Lembre disso sempre: prefiro ${subject}`);
    await page.getByRole("button", { name: "Enviar" }).click();

    // The proposal appears with the instruction stripped, and nothing is stored.
    await expect(page.getByRole("heading", { name: "Quer que eu guarde isto?" })).toBeVisible({ timeout: 30_000 });
    const proposed = page.locator(".memory-proposal textarea");
    await expect(proposed).toHaveValue(`prefiro ${subject}`);

    // Proof that the proposal alone persisted nothing.
    await page.goto("/pt-BR/app/memories");
    await expect(page.getByText(subject)).toHaveCount(0);

    // Confirming is what writes.
    await page.goto("/pt-BR/app/chat");
    await page.getByRole("textbox").first().fill(`Lembre disso sempre: prefiro ${subject}`);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("heading", { name: "Quer que eu guarde isto?" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Guardar memória" }).click();
    await expect(page.getByText("Memória guardada.")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: "Ver memória" }).click();
    await expect(page.getByRole("heading", { name: new RegExp(subject), level: 1 })).toBeVisible();
    // The proposed kind was carried through, and provenance is honest: this
    // memory has no originating entry, so it says the owner created it.
    await expect(page.locator(".eyebrow")).toHaveText("PREFERÊNCIA");
    await expect(page.getByText("Criada por você")).toBeVisible();
  });

  test("a repeated confirmation reports the existing memory instead of storing it twice", async ({ page }) => {
    const subject = `café às ${crypto.randomUUID().slice(0, 6)}`;

    await signIn(page);

    async function confirmOnce() {
      await page.goto("/pt-BR/app/chat");
      await page.getByRole("textbox").first().fill(`Lembre disso sempre: prefiro ${subject}`);
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByRole("heading", { name: "Quer que eu guarde isto?" })).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: "Guardar memória" }).click();
    }

    await confirmOnce();
    await expect(page.getByText("Memória guardada.")).toBeVisible({ timeout: 30_000 });

    await confirmOnce();
    // Not a failure — the sentence they asked to keep is kept, and the surface
    // points at the row rather than inviting a retry that must never succeed.
    await expect(page.getByText("Você já tem essa memória.")).toBeVisible({ timeout: 30_000 });

    await page.goto("/pt-BR/app/memories");
    await expect(page.getByRole("link", { name: new RegExp(subject) })).toHaveCount(1);
  });

  test("discarding a proposal writes nothing at all", async ({ page }) => {
    const subject = `chá às ${crypto.randomUUID().slice(0, 6)}`;

    await signIn(page);
    await page.goto("/pt-BR/app/chat");
    await page.getByRole("textbox").first().fill(`Lembre disso sempre: prefiro ${subject}`);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByRole("heading", { name: "Quer que eu guarde isto?" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByText("Nada foi guardado.")).toBeVisible();
    // The confirm control is gone, so a stray second click cannot revive it.
    await expect(page.getByRole("button", { name: "Guardar memória" })).toHaveCount(0);

    await page.goto("/pt-BR/app/memories");
    await expect(page.getByText(subject)).toHaveCount(0);
  });
});
