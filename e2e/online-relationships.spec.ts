import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice EGC.2's authenticated acceptance — **the Camila scenario** (gate B1).
 *
 * This is the journey that started the whole initiative. The owner tried to
 * record that Camila is their wife and found that the only field on a Person
 * page which looked like it described her was the company she works at
 * (`EG-01`…`EG-04`). `public.person_relationships` had existed since
 * `202607160009`, been fully writable by `authenticated` under forced RLS the
 * entire time, and **never been written by anything** — not the interpretation
 * RPC, not a trigger, not the application.
 *
 * So the test is the scenario, end to end: create Camila, record the
 * relationship *spouse*, create a personal context and attach her to it,
 * optionally give her a company that is **independent of** the relationship, and
 * attach her to a project with a role. Every assertion after a write re-reads
 * the page, so a value rendering from React state rather than from the database
 * fails here.
 *
 * A disposable account created and deleted by this file; no credential appears
 * in source, in a fixture name or in an assertion.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("relationships and associations", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-relationships-${crypto.randomUUID()}@example.com`;
  const password = `Rel!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Relationships E2E" },
      }),
    });
    expect(response.ok).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // `user_id references auth.users(id) on delete cascade` on all three
  // relationship tables, so nothing this journey created outlives it.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  async function signIn(page: import("@playwright/test").Page, locale: "pt-BR" | "en") {
    await signInOnline(page, { email, locale });
  }

  /** The visible half of an outcome, never the live region. */
  function outcome(page: import("@playwright/test").Page, text: string) {
    return page.locator("p.entity-edit-feedback", { hasText: text });
  }

  /**
   * Association selects are addressed by their form field name, not by label.
   *
   * `getByLabel("Contexto")` matches three nodes on a Person page, and two of
   * them are navigation: `navGroups.context` is `aria-label="Contexto"` on both
   * the desktop rail and the mobile overflow. The third is the select itself,
   * whose computed name is `ContextoPessoal` — the label plus its own selected
   * option — so even an exact match would not reach it. The field name is what
   * the Server Action's strict schema keys on, which makes it both precise and
   * the thing actually worth asserting against.
   */
  function field(page: import("@playwright/test").Page, name: string) {
    return page.locator(`select[name="${name}"], input[name="${name}"]`);
  }

  async function createPerson(page: import("@playwright/test").Page, name: string) {
    await page.goto("/pt-BR/app/people");
    await page.getByRole("textbox", { name: "Nome da pessoa" }).fill(name);
    await page.getByRole("button", { name: "Adicionar" }).click();
    const row = page.getByRole("link", { name: new RegExp(name) });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  }

  test("gate B1: the Camila scenario, end to end", async ({ page }) => {
    /**
     * The longest journey in the suite, and deliberately so: it is the whole
     * scenario rather than a slice of it — four creations, five server round
     * trips and a reload after each, then the same association read back from
     * the other surface. It ran in 28.4s against the 30s default, which is a
     * budget rather than a measurement. Raised so a slow round trip reports as
     * a slow round trip instead of as a missing link on the last assertion.
     */
    test.setTimeout(120_000);

    const camila = `Camila ${crypto.randomUUID().slice(0, 8)}`;
    const context = `Pessoal ${crypto.randomUUID().slice(0, 8)}`;
    const company = `Acme ${crypto.randomUUID().slice(0, 8)}`;
    const project = `Casa ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page, "pt-BR");

    // The two things she will be attached to, made first so the selectors have
    // something to offer. EGC-ASSOC-008: with none, the panel explains itself
    // rather than opening onto an empty dropdown.
    await page.goto("/pt-BR/app/contexts");
    await page.getByRole("button", { name: "Novo contexto" }).click();
    await page.getByLabel("Nome").fill(context);
    await page.getByLabel("Tipo").selectOption("personal");
    await page.getByRole("button", { name: "Criar contexto" }).click();
    await expect(page.getByRole("link", { name: new RegExp(context) })).toBeVisible({ timeout: 30_000 });

    await page.goto("/pt-BR/app/projects");
    await page.getByRole("textbox", { name: "Nome do projeto" }).fill(project);
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByRole("link", { name: new RegExp(project) })).toBeVisible({ timeout: 30_000 });

    await createPerson(page, camila);

    // --- The relationship. This is the thing that was impossible. -----------
    await page.getByRole("button", { name: "Registrar relação" }).click();
    await field(page, "relationshipType").selectOption("spouse");
    await field(page, "description").fill("casamos em 2019");
    await page.getByRole("button", { name: "Salvar relação" }).click();
    await expect(outcome(page, "Relação registrada.")).toBeVisible({ timeout: 30_000 });

    // Re-read from the server. This is what separates "it rendered" from "it
    // was stored".
    await page.reload();
    await expect(page.getByText(/Esposa/)).toBeVisible();
    /*
     * Phase 2N slice 2N.6 changed what this assertion may claim, and the change
     * is deliberate rather than a literal bumped to go green.
     *
     * This used to assert the owner's sentence was simply visible. It is free
     * text about a human being, on a table with no `sensitivity` column and no
     * classifiable source — ADR-110 Decision 4's predicate word for word — and
     * it was printing in the clear one section below `people.notes`, which the
     * same page masks. Two postures for one predicate is a divergence, and
     * `2N-PRIVACY-001` exists to end it.
     *
     * So the storage proof is unchanged and its shape is stronger: the sentence
     * is withheld on a page re-read from the server, and revealing it produces
     * the exact text that was saved. A round trip that lost it would fail here
     * just as it did before.
     */
    await expect(page.getByText("casamos em 2019")).toHaveCount(0);
    await page
      .locator("li.relation-row", { hasText: /Esposa/ })
      .getByRole("button", { name: /mostrar/i })
      .click();
    await expect(page.getByText("casamos em 2019")).toBeVisible();
    // UX-21: the stored token never reaches the screen.
    await expect(page.getByText("spouse", { exact: true })).toHaveCount(0);

    // --- The context. -------------------------------------------------------
    await page.getByRole("button", { name: "Vincular a um contexto" }).click();
    await field(page, "contextId").selectOption({ label: context });
    await page.getByRole("button", { name: "Vincular contexto" }).click();
    await expect(outcome(page, "Vínculo criado.")).toBeVisible({ timeout: 30_000 });

    // The account owns exactly one context and it is now linked, so the create
    // control is correctly gone — replaced by a sentence saying they are all
    // linked, not by advice to create one they already have.
    await expect(
      page.getByText("Todos os seus contextos já estão vinculados a esta pessoa."),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: context })).toBeVisible();

    // --- The company, which is a separate concern from the relationship. ----
    // EGC-REL-009: the page says which is which, so a company can never read as
    // a way to describe what somebody is to you.
    await expect(page.getByText("Onde a pessoa trabalha.")).toBeVisible();
    await expect(page.getByText("Quem essa pessoa é para você.")).toBeVisible();

    await page.getByRole("button", { name: "Editar" }).first().click();
    await page.getByRole("button", { name: "Criar nova empresa" }).click();
    await page.getByLabel("Nome da nova empresa").fill(company);
    await page.getByRole("button", { name: "Criar empresa" }).click();
    await expect(outcome(page, "Empresa criada e vinculada.")).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByText(company)).toBeVisible();
    // The relationship is untouched by the company: two independent facts.
    await expect(page.getByText(/Esposa/)).toBeVisible();

    // --- The project, with a role. ------------------------------------------
    await page.getByRole("button", { name: "Vincular a um projeto" }).click();
    await field(page, "projectId").selectOption({ label: project });
    await field(page, "role").fill("responsável pela obra");
    await page.getByRole("button", { name: "Vincular projeto" }).click();
    await expect(outcome(page, "Vínculo criado.")).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByRole("link", { name: project })).toBeVisible();
    await expect(page.getByText("responsável pela obra")).toBeVisible();

    // --- And the same association read from the project's side (EGC-ASSOC-003).
    await page.goto("/pt-BR/app/projects");
    await page.getByRole("link", { name: new RegExp(project) }).click();
    await expect(page.getByRole("link", { name: camila })).toBeVisible();
    await expect(page.getByText("responsável pela obra")).toBeVisible();
  });

  test("gate B2 and B3: ending hides the relationship and re-adding leaves exactly one", async ({ page }) => {
    const person = `Rita ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page, "pt-BR");
    await createPerson(page, person);

    await page.getByRole("button", { name: "Registrar relação" }).click();
    await field(page, "relationshipType").selectOption("colleague");
    await page.getByRole("button", { name: "Salvar relação" }).click();
    await expect(outcome(page, "Relação registrada.")).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByText("Colega de trabalho")).toBeVisible();

    await page.getByRole("button", { name: "Encerrar relação" }).click();
    await expect(page.getByText("Colega de trabalho")).toHaveCount(0, { timeout: 30_000 });

    // Gate B3 from the surface: the pair is free again, and re-adding leaves one
    // live row rather than two. The row's survival after the end is asserted
    // directly in `egc_relationship_lifecycle.sql`, which is where a UI test
    // cannot reach.
    await page.reload();
    await page.getByRole("button", { name: "Registrar relação" }).click();
    await field(page, "relationshipType").selectOption("colleague");
    await page.getByRole("button", { name: "Salvar relação" }).click();
    await expect(outcome(page, "Relação registrada.")).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByText("Colega de trabalho")).toHaveCount(1);
  });

  test("the whole surface works in English too", async ({ page }) => {
    const person = `Alex ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page, "en");
    await page.goto("/en/app/people");
    await page.getByRole("textbox", { name: "Person name" }).fill(person);
    await page.getByRole("button", { name: "Add" }).click();
    const row = page.getByRole("link", { name: new RegExp(person) });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();

    await expect(page.getByText("Who this person is to you.")).toBeVisible();
    await page.getByRole("button", { name: "Record a relationship" }).click();
    await field(page, "relationshipType").selectOption("mentor");
    await page.getByRole("button", { name: "Save relationship" }).click();
    await expect(outcome(page, "Relationship recorded.")).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByText("Mentor")).toBeVisible();
    await expect(page.getByText("mentor", { exact: true })).toHaveCount(0);
  });

  test("the history reads the new writes as sentences, not as tokens", async ({ page }) => {
    const person = `Dani ${crypto.randomUUID().slice(0, 8)}`;

    await signIn(page, "pt-BR");
    await createPerson(page, person);
    await page.getByRole("button", { name: "Registrar relação" }).click();
    await field(page, "relationshipType").selectOption("friend");
    await page.getByRole("button", { name: "Salvar relação" }).click();
    await expect(outcome(page, "Relação registrada.")).toBeVisible({ timeout: 30_000 });

    await page.goto("/pt-BR/app/history");
    // `.first()`: earlier tests in this file share the account, so the history
    // legitimately holds several of these. What is being asserted is that the
    // sentence renders at all rather than the raw token.
    await expect(
      page.getByText("registrou uma relação com uma pessoa").first(),
    ).toBeVisible({ timeout: 30_000 });
    // The raw action_type must never reach the screen (UX-21).
    await expect(page.getByText("create_person_relationship")).toHaveCount(0);
  });
});
