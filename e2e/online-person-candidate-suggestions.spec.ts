import { expect, test } from "@playwright/test";
import { signInOnline } from "./support/online-session";

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.ONLINE_AUTH_TEST_EMAIL_DOMAIN?.trim() || "example.com";
const configured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("confirmable unmatched person suggestions", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!configured, "Online Supabase credentials are not available.");

  const marker = `pwa-person-${crypto.randomUUID()}`;
  const email = `codex-person-candidate-e2e-${crypto.randomUUID()}@${domain}`;
  let userId: string | undefined;
  let entryId: string | undefined;

  async function admin(path: string, init: RequestInit = {}) {
    return fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json", prefer: "return=representation", ...(init.headers ?? {}),
      },
    });
  }

  test.beforeAll(async () => {
    const created = await admin("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password: `PersonCandidate!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    expect(created.ok).toBe(true);
    userId = ((await created.json()) as { id: string }).id;

    const entry = await admin("/rest/v1/entries", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId, original_content: `Enviar o relatório para Giovanna; Jaime está de férias. ${marker}`,
        source: "web", locale: "pt-BR", status: "completed",
      }),
    });
    expect(entry.ok).toBe(true);
    entryId = ((await entry.json()) as Array<{ id: string }>)[0]!.id;

    const existing = await admin("/rest/v1/people", {
      method: "POST", body: JSON.stringify({ user_id: userId, name: `Jaime ${marker}` }),
    });
    expect(existing.ok).toBe(true);
    const jaimeId = ((await existing.json()) as Array<{ id: string }>)[0]!.id;

    const extraction = {
      language: "pt-BR", occurredAt: new Date().toISOString(), isRetroactive: false,
      summary: "Enviar o relatório para Giovanna.", concepts: ["task"], contexts: [], organizations: [], projects: [],
      people: [
        { name: `Jaime ${marker}`, evidence: "Jaime está de férias", confidence: 1, inferred: false },
        { name: `Giovanna ${marker}`, evidence: "para Giovanna", confidence: 1, inferred: false },
      ],
      taskCandidates: [], pendingQuestions: [], confidence: 1,
    };
    const interpretation = await admin("/rest/v1/entry_interpretations", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId, entry_id: entryId, version: 1, summary: extraction.summary, confidence: 1,
        model: "e2e-seed", strategy_version: "person-candidate-e2e", prompt_version: "person-candidate-e2e",
        raw_output: extraction, extracted_people: extraction.people, concepts: extraction.concepts,
      }),
    });
    expect(interpretation.ok, await interpretation.clone().text()).toBe(true);
    const interpretationId = ((await interpretation.json()) as Array<{ id: string }>)[0]!.id;
    const current = await admin(`/rest/v1/entries?id=eq.${entryId}`, {
      method: "PATCH", body: JSON.stringify({ current_interpretation_id: interpretationId }),
    });
    expect(current.ok).toBe(true);
    const link = await admin("/rest/v1/entry_entities", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId, entry_id: entryId, interpretation_id: interpretationId,
        entity_type: "person", entity_id: jaimeId, mention: `Jaime ${marker}`, confidence: 1,
      }),
    });
    expect(link.ok).toBe(true);
  });

  test.afterAll(async () => {
    if (!userId) return;
    await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
  });

  test("creates, ignores nothing automatically, and restores the suggestion on undo at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto(`/pt-BR/app/inbox/${entryId}`);

    const people = page.getByRole("group", { name: "Pessoas mencionadas" });
    await expect(people).toBeVisible();
    await expect(people.getByText(`Giovanna ${marker}`, { exact: true })).toBeVisible();
    await expect(people.getByText(`Jaime ${marker}`, { exact: true })).toHaveCount(0);
    await expect(people.getByRole("radio", { name: "Criar pessoa" })).not.toBeChecked();

    await people.getByRole("radio", { name: "Criar pessoa" }).check();
    const name = people.getByLabel(`Nome para criar: Giovanna ${marker}`);
    await name.fill(`Giovanna Corrigida ${marker}`);
    await people.getByRole("button", { name: "Salvar decisões sobre pessoas" }).click();
    await expect(page.getByRole("status")).toContainText("1 pessoa criada");

    await page.getByRole("button", { name: "Desfazer decisões" }).click();
    await expect(page.getByRole("status")).toContainText("Alteração desfeita");
    await expect(page.getByRole("group", { name: "Pessoas mencionadas" })).toContainText(`Giovanna ${marker}`);
  });
});
