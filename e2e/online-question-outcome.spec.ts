import { expect, test } from "@playwright/test";

/**
 * Slice G1's authenticated acceptance for the question after-state (UX-11).
 *
 * The finding is that the after-state is **fully recorded and never shown**:
 * `pending_questions` has stored `answer`, `answered_at` and `status` since
 * `202607160007`, and answering removed the row from the only list that
 * existed. So the journey proves reachability and partition — not the write,
 * which was already correct.
 *
 * Seeded through the service role rather than through capture, because
 * producing a real pending question needs an AI interpretation and this case is
 * about what happens *after* one exists. The seeded rows are owned by the
 * disposable account and go with it.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const strings = {
  "pt-BR": {
    loginEmail: "E-mail",
    loginPassword: "Senha",
    loginSubmit: "Entrar",
    openTab: "Abertas",
    resolvedTab: "Resolvidas",
    resolvedTitle: "Perguntas resolvidas",
    youAnswered: "Você respondeu",
    answered: "Respondida",
    dismissed: "Descartada",
    openEntry: "Ver o registro",
    emptyOpen: "Nenhuma dúvida aberta",
  },
  en: {
    // Not localized: the login form renders the literal `E-mail` in both locales.
    loginEmail: "E-mail",
    loginPassword: "Password",
    loginSubmit: "Sign in",
    openTab: "Open",
    resolvedTab: "Resolved",
    resolvedTitle: "Resolved questions",
    youAnswered: "You answered",
    answered: "Answered",
    dismissed: "Dismissed",
    openEntry: "Open the record",
    emptyOpen: "No open questions",
  },
} as const;

const ANSWER = "Ela é a responsável pelo contrato.";

test.describe("what happened after the question was answered", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-outcome-${crypto.randomUUID()}@example.com`;
  const password = `Outcome!${crypto.randomUUID()}A7`;
  let userId: string | undefined;
  let entryId: string | undefined;

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

  test.beforeAll(async () => {
    const created = await admin("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Outcome E2E" },
      }),
    });
    expect(created.ok).toBe(true);
    userId = ((await created.json()) as { id: string }).id;

    // One entry, one interpretation, two resolved questions — the minimum that
    // makes "answered" and "dismissed" both renderable.
    const entry = await admin("/rest/v1/entries", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, original_content: "Fechar o contrato com a Marina.", locale: "pt-BR", source: "web" }),
    });
    expect(entry.ok).toBe(true);
    entryId = ((await entry.json()) as Array<{ id: string }>)[0]!.id;

    const interpretation = await admin("/rest/v1/entry_interpretations", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        entry_id: entryId,
        version: 1,
        summary: "Contrato com a Marina",
        confidence: 0.6,
        // Provenance columns are `not null` with no default: an interpretation
        // must always be able to say which model produced it.
        model: "e2e-seed",
        strategy_version: "e2e",
        prompt_version: "e2e",
        // `raw_output` is `not null` too: an interpretation always keeps the
        // model payload it was derived from.
        raw_output: { seeded: true },
      }),
    });
    expect(interpretation.ok).toBe(true);
    const interpretationId = ((await interpretation.json()) as Array<{ id: string }>)[0]!.id;

    const questions = await admin("/rest/v1/pending_questions", {
      method: "POST",
      body: JSON.stringify([
        {
          user_id: userId, entry_id: entryId, interpretation_id: interpretationId, candidate_index: 0,
          question: "Marina é a responsável ou só participa?",
          reason: "A captura cita duas pessoas sem definir papéis.",
          confidence: 0.55, status: "answered", answer: ANSWER, answered_at: new Date().toISOString(),
        },
        {
          user_id: userId, entry_id: entryId, interpretation_id: interpretationId, candidate_index: 1,
          question: "O prazo é o do e-mail anterior?",
          reason: "Duas datas aparecem no mesmo registro.",
          // PostgREST requires every object in a batch insert to carry the
          // same keys (PGRST102), so a dismissal states its nulls explicitly.
          confidence: 0.4, status: "dismissed", answer: null, answered_at: null,
        },
      ]),
    });
    expect(questions.ok).toBe(true);
  });

  // Deleting the account cascades to the entry, the interpretation and both
  // questions, so nothing this journey seeded outlives it.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    expect(deletion.ok).toBe(true);
  });

  for (const locale of ["pt-BR", "en"] as const) {
    test(`a resolved question is reachable and says what it changed — ${locale}`, async ({ page }, testInfo) => {
      const text = strings[locale];

      await page.goto(`/${locale}/auth/login`);
      await page.getByLabel(text.loginEmail).fill(email);
      await page.getByLabel(text.loginPassword).fill(password);
      await page.getByRole("button", { name: text.loginSubmit }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/app$`), { timeout: 30_000 });

      await page.goto(`/${locale}/app/questions`);

      // Both questions are resolved, so the open queue is empty — which is
      // exactly the state UX-11 describes, and it now points somewhere.
      await expect(page.getByText(text.emptyOpen)).toBeVisible();
      const tabs = page.getByRole("navigation", { name: locale === "pt-BR" ? "Estado das perguntas" : "Question state" });
      await expect(tabs.getByRole("link", { name: text.openTab })).toHaveAttribute("aria-current", "page");

      const resolvedTab = tabs.getByRole("link", { name: text.resolvedTab });
      if (testInfo.project.name === "mobile") {
        expect((await resolvedTab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await resolvedTab.click();
      await expect(page.getByRole("heading", { name: text.resolvedTitle, level: 1 })).toBeVisible();

      // The four things the surface never said.
      const answered = page.locator('.question-outcome[data-disposition="answered"]');
      await expect(answered).toHaveCount(1);
      await expect(answered.getByText(text.youAnswered)).toBeVisible();
      await expect(answered.getByText(ANSWER)).toBeVisible();
      await expect(answered.getByRole("link", { name: new RegExp(text.openEntry) }))
        .toHaveAttribute("href", `/${locale}/app/inbox/${entryId}`);

      // A dismissal is a distinct outcome, not an answer with no text.
      const dismissed = page.locator('.question-outcome[data-disposition="dismissed"]');
      await expect(dismissed).toHaveCount(1);
      await expect(dismissed.getByText(text.youAnswered)).toHaveCount(0);

      // The partition, observed rather than asserted in isolation: neither
      // resolved question is in the open tab.
      await tabs.getByRole("link", { name: text.openTab }).click();
      await expect(page.getByText(text.emptyOpen)).toBeVisible();
      await expect(page.locator(".question-outcome")).toHaveCount(0);
    });
  }
});
