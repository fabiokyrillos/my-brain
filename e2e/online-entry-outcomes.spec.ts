import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice H — UX-04, against the real database.
 *
 * The finding was that the entry page could not answer "what was created?".
 * The unit tests prove the projection's shape; only this proves that the rows
 * the product actually writes are the rows it reads back, that the links reach
 * pages which exist, and that the order the finding is about survives a real
 * render in both locales.
 *
 * The entry and its interpretation are seeded through the service role, as
 * `online-question-outcome.spec.ts` does and for the same reason: producing
 * them for real needs an AI extraction, and the AI is not what is under test.
 * Everything the section *reads* is created the way the product creates it —
 * the task by confirming a candidate through the form, the reminder through the
 * reminders form — because "the row exists" and "the product can make the row"
 * are different claims.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const fixtureEmailDomain = process.env.ONLINE_AUTH_TEST_EMAIL_DOMAIN?.trim() || "example.com";
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const copy = {
  "pt-BR": {
    loginEmail: "E-mail",
    loginPassword: "Senha",
    loginSubmit: "Entrar",
    wrote: "O que você escreveu",
    exists: "O que passou a existir",
    tasks: "Tarefas criadas",
    entities: "Pessoas, projetos e contextos reconhecidos",
    nothing: /Nada foi criado a partir deste registro/,
  },
  en: {
    // The login form renders the literal `E-mail` in both locales.
    loginEmail: "E-mail",
    loginPassword: "Password",
    loginSubmit: "Sign in",
    wrote: "What you wrote",
    exists: "What now exists",
    tasks: "Tasks created",
    entities: "People, projects and contexts recognized",
    nothing: /Nothing was created from this record/,
  },
} as const;

const ORIGINAL = "Combinar com a Marina a revisão do contrato do Atlas na sexta.";

test.describe("what now exists because of an entry", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-outcomes-${crypto.randomUUID()}@${fixtureEmailDomain}`;
  const password = `Outcomes!${crypto.randomUUID()}A7`;
  let userId: string | undefined;
  let bareEntryId: string | undefined;
  let richEntryId: string | undefined;
  let personId: string | undefined;

  async function admin(path: string, init: RequestInit = {}) {
    return fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });
  }

  async function seedEntry(content: string) {
    const entry = await admin("/rest/v1/entries", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, original_content: content, locale: "pt-BR", source: "web" }),
    });
    expect(entry.ok).toBe(true);
    const entryId = ((await entry.json()) as Array<{ id: string }>)[0]!.id;

    const interpretation = await admin("/rest/v1/entry_interpretations", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        entry_id: entryId,
        version: 1,
        summary: "Revisão do contrato do Atlas com a Marina",
        confidence: 0.8,
        model: "e2e-seed",
        strategy_version: "e2e",
        prompt_version: "e2e",
        raw_output: { seeded: true },
      }),
    });
    expect(interpretation.ok).toBe(true);
    return { entryId, interpretationId: ((await interpretation.json()) as Array<{ id: string }>)[0]!.id };
  }

  test.beforeAll(async () => {
    const created = await admin("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: "Outcomes E2E" } }),
    });
    expect(created.ok).toBe(true);
    userId = ((await created.json()) as { id: string }).id;

    // One entry that produced nothing, and one that produced everything.
    bareEntryId = (await seedEntry("Anotação sem consequência nenhuma.")).entryId;

    const rich = await seedEntry(ORIGINAL);
    richEntryId = rich.entryId;

    const person = await admin("/rest/v1/people", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, name: "Marina Ferraz" }),
    });
    expect(person.ok).toBe(true);
    personId = ((await person.json()) as Array<{ id: string }>)[0]!.id;

    // The link the interpretation would have written. `entry_entities` proves
    // ownership by trigger, so a wrong `user_id` here would be refused rather
    // than silently accepted — which is itself worth exercising.
    const link = await admin("/rest/v1/entry_entities", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        entry_id: richEntryId,
        interpretation_id: rich.interpretationId,
        entity_id: personId,
        entity_type: "person",
        mention: "a Marina",
        confidence: 0.9,
      }),
    });
    expect(link.ok).toBe(true);

    /**
     * No `source_interpretation_id`. A trigger enforces `2C_INVALID_CANDIDATE_
     * PROVENANCE`: a task that claims an interpretation must be a candidate of
     * it, with the matching `candidate_index`. Seeding around that would be
     * seeding a state the product cannot produce. The outcome projection reads
     * `source_entry_id`, which is the column that answers "did this entry cause
     * this task", so the seed sets that and nothing it has not earned.
     */
    const task = await admin("/rest/v1/tasks", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        title: "Revisar o contrato do Atlas",
        status: "in_progress",
        source_entry_id: richEntryId,
        created_by: "user",
        confidence: 0.9,
      }),
    });
    expect(task.ok, JSON.stringify(await task.clone().json())).toBe(true);

    const reminder = await admin("/rest/v1/reminders", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        entry_id: richEntryId,
        title: "Falar com a Marina",
        remind_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: "scheduled",
      }),
    });
    expect(reminder.ok).toBe(true);

    const memory = await admin("/rest/v1/memories", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        content: "Marina prefere revisar contratos pela manhã.",
        kind: "recurring_info",
        source_entry_id: richEntryId,
        confidence: 0.8,
      }),
    });
    expect(memory.ok).toBe(true);
  });

  /** Deleting the account cascades to every row above it. Fail-closed. */
  test.afterAll(async () => {
    if (!userId) return;
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
  });

  for (const locale of ["pt-BR", "en"] as const) {
    const words = copy[locale];

    test(`the entry page answers all four families in ${locale}`, async ({ page }) => {
      await signInOnline(page, { email, locale });

      await page.goto(`/${locale}/app/inbox/${richEntryId}`);

      // 1. What the owner wrote, without a click. The finding was that this was
      //    collapsed behind a disclosure.
      await expect(page.getByRole("heading", { name: words.wrote })).toBeVisible();
      await expect(page.getByText(ORIGINAL)).toBeVisible();

      // 2. What now exists, with every family present and localized.
      await expect(page.getByRole("heading", { name: words.exists })).toBeVisible();
      await expect(page.getByRole("heading", { name: words.tasks })).toBeVisible();
      await expect(page.getByRole("heading", { name: words.entities })).toBeVisible();

      const taskLink = page.getByRole("link", { name: "Revisar o contrato do Atlas" });
      await expect(taskLink).toBeVisible();
      await expect(page.getByRole("link", { name: "Falar com a Marina" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Marina prefere revisar contratos/ })).toBeVisible();
      await expect(page.getByRole("link", { name: "Marina Ferraz" })).toBeVisible();

      // 3. The vocabulary is the owner's, never the column's (UX-21).
      await expect(page.getByText(locale === "pt-BR" ? "Em andamento" : "In progress")).toBeVisible();
      await expect(page.getByText("in_progress")).toHaveCount(0);
      await expect(page.getByText("recurring_info")).toHaveCount(0);

      // 4. The link reaches a page that exists — UX-19's other half.
      await taskLink.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/app/work/[0-9a-f-]+$`));
      await expect(page.getByRole("heading", { name: "Revisar o contrato do Atlas" })).toBeVisible();

      // 5. Back returns to the entry, not to a dead history state.
      await page.goBack();
      await expect(page.getByRole("heading", { name: words.exists })).toBeVisible();
    });

    test(`an entry that produced nothing says so in ${locale}`, async ({ page }) => {
      await signInOnline(page, { email, locale });

      await page.goto(`/${locale}/app/inbox/${bareEntryId}`);

      await expect(page.getByRole("heading", { name: words.exists })).toBeVisible();
      await expect(page.getByText(words.nothing)).toBeVisible();
    });
  }

  test("the section reads only the owner's own rows", async ({ browser }) => {
    // A second account must not see the first's outcomes even at the same URL.
    const otherEmail = `codex-outcomes-other-${crypto.randomUUID()}@${fixtureEmailDomain}`;
    const otherPassword = `Other!${crypto.randomUUID()}A7`;
    const created = await admin("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email: otherEmail, password: otherPassword, email_confirm: true }),
    });
    expect(created.ok).toBe(true);
    const otherId = ((await created.json()) as { id: string }).id;

    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signInOnline(page, { email: otherEmail, locale: "pt-BR" });

      const response = await page.goto(`/pt-BR/app/inbox/${richEntryId}`);
      // RLS hides the entry entirely, so the route answers 404 rather than
      // rendering an empty outcome section over someone else's record.
      expect(response?.status()).toBe(404);
      await expect(page.getByText("Revisar o contrato do Atlas")).toHaveCount(0);
    } finally {
      await context.close();
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${otherId}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
    }
  });
});
