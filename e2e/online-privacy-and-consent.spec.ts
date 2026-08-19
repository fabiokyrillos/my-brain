import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2O.5's authenticated acceptance — `2O-PRIVACY-001` … `-010`,
 * `2O-CONSENT-001` … `-005`.
 *
 * ## What only a browser can answer here
 *
 *  1. **The RSC boundary.** Ajustes gains two new Server Components mounting
 *     three Client Components between them. Both compile and both are
 *     unit-tested, and neither fact means the page renders in production — the
 *     failure this repository recorded as *"the RSC boundary is only tested in
 *     production"*, where two surfaces shipped green and never rendered.
 *  2. **The census under real RLS.** The unit suite proves the reader's shape
 *     against a fake client. Only a signed-in browser proves `authenticated`
 *     may actually count those forty-seven tables — which is the claim the
 *     owner's resolution of `2O-PRIVACY-002` rests on. A category rendering
 *     *"não foi possível ler"* here would mean the resolution is wrong, and the
 *     assertion is written so that outcome fails rather than passes quietly.
 *  3. **The export end to end**, through a real Server Action against a real
 *     account, including that a refusal is never accompanied by a download.
 *  4. **`2O-CONSENT-001` read off the wire.** The fixture accepts both policies
 *     through the product's own interposition, so the record has real rows at
 *     the current version with real dates — a state a unit fixture can imitate
 *     but not prove.
 *
 * ## The account is disposable and its cascade cleans it up
 *
 * The same fixture shape slices 2O.2 … 2O.4 used. This one **writes nothing**
 * except the acceptance rows the sign-in itself records: every assertion below
 * is a read.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

test.describe("the account can see what is stored, take it, and read what it agreed to", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-privacy-${crypto.randomUUID()}@example.com`;
  const password = `Privy!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Privacy E2E" },
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

  test("2O-PRIVACY-001/-003: every category is counted, and nothing is previewed", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/privacy");

    // The RSC assertion: the new Server Component rendered at all.
    await expect(page.getByRole("heading", { name: "Privacidade e dados" })).toBeVisible();

    const census = page.locator(".privacy-census");
    await expect(census).toBeVisible();
    for (const label of [
      "Registros e interpretações",
      "Tarefas e compromissos",
      "Pessoas, projetos e contextos",
      "Memórias e resumos",
      "Conversas",
      "Arquivos e análises",
      "Lembretes e notificações",
      "Perguntas pendentes",
      "Uso de IA e credencial",
      "Processamento e auditoria",
      "Conta e preferências",
      "Eventos de uso do produto",
    ]) {
      await expect(census.getByText(label, { exact: true })).toBeVisible();
    }

    /*
     * The assertion this whole journey exists for. If `authenticated` could not
     * read one of the forty-seven tables, that category would render
     * "não foi possível ler" — the honest outcome, and also the proof that the
     * owner's resolution of `2O-PRIVACY-002` does not hold. Every category
     * counts, and this account is fresh, so every count is a real read
     * returning zero rather than a refusal dressed as one.
     */
    await expect(census.getByText("não foi possível ler")).toHaveCount(0);

    /*
     * **Every category produced a count**, expressed as the property rather
     * than as a total.
     *
     * The first version of this assertion said "eleven zeros and one non-zero",
     * and it was wrong against the hosted project: signing in and accepting the
     * policies writes rows in more than one category, and how many is not this
     * slice's business. A number that has to be re-tuned whenever an unrelated
     * write path changes is a test people learn to edit without reading — the
     * shape `audit-log-writers.test.ts` documents refusing.
     *
     * What matters is that twelve categories each produced a number, and that
     * at least one is non-zero — the control that stops "every category counts"
     * from also passing against a reader that returns a constant.
     */
    await expect(census.locator("li")).toHaveCount(12);
    await expect(census.getByText(/^\d+ registros?$/)).toHaveCount(12);
    await expect(census.getByText(/^[1-9]\d* registros?$/).first()).toBeVisible();
  });

  test("2O-PRIVACY-002: the three withheld tables are named with their reason", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/privacy");

    const withheld = page.locator(".privacy-withheld");
    await expect(withheld).toBeVisible();
    for (const table of ["account_deletion_attempts", "error_events", "rate_limit_events"]) {
      await expect(withheld.getByText(table, { exact: true })).toBeVisible();
    }
    await expect(withheld).toContainText("contador de proteção contra abuso");
  });

  test("2O-PRIVACY-004/-006: the export completes or refuses, and never offers both", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/privacy");

    const control = page.locator(".privacy-export");
    await control.getByRole("button", { name: "Gerar exportação" }).click();

    const ready = control.getByText(/Pronto: \d+ registros/);
    const refused = control.getByText(/Recusada:/);
    await expect(ready.or(refused)).toBeVisible({ timeout: 60_000 });

    // `R-2O-19` in the browser: a refusal never comes with a download.
    if (await refused.isVisible()) {
      await expect(control.getByRole("button", { name: "Baixar arquivo" })).toHaveCount(0);
      return;
    }
    await expect(control.getByRole("button", { name: "Baixar arquivo" })).toBeVisible();
  });

  test("2O-PRIVACY-007/-008/-009: retention, sessions and deletion are reachable", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/privacy");

    // `2O-PRIVACY-007`, generated from `RETENTION_SCHEDULE` and honesty-gated.
    await expect(page.getByRole("heading", { name: "Por quanto tempo guardamos" })).toBeVisible();
    await expect(page.locator(".privacy-retention")).toContainText("90 dias");
    await expect(page.locator(".privacy-unenforced")).toBeVisible();

    // `2O-PRIVACY-009` — the account is told it is signed in, by address.
    await expect(page.getByText(`Você está conectado como ${email}.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sair de todos os dispositivos" })).toBeVisible();

    // `2O-PRIVACY-008` — deletion is reached, never performed here.
    await expect(page.getByRole("link", { name: "Ir para a exclusão da conta" })).toHaveAttribute(
      "href",
      "/pt-BR/account/delete",
    );
  });

  test("2O-CONSENT-001/-002/-003/-004: the record shows version, date, document and revocability", async ({
    page,
  }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/privacy");

    await expect(page.getByRole("heading", { name: "O que você aceitou" })).toBeVisible();

    const record = page.locator(".privacy-consent");
    // Both documents were accepted through the product's own interposition, so
    // both carry a real version and a real date. "Sem aceite registrado" is the
    // value a broken reader would show, and it must not be here.
    await expect(record.getByText(/Versão 2026-08-04, aceita em/)).toHaveCount(2);
    await expect(record.getByText("Sem aceite registrado.")).toHaveCount(0);
    await expect(record.getByText("Em dia.")).toHaveCount(2);

    await expect(record.getByRole("link", { name: "Ler o documento" }).first()).toHaveAttribute(
      "href",
      "/pt-BR/legal/terms",
    );

    // `2O-CONSENT-004`: a fresh account has granted no notifications, so the
    // surface says so instead of offering a control that would change nothing.
    await expect(page.getByText("Notificações não estão ativas nesta conta.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revogar notificações" })).toHaveCount(0);
  });

  test("2O-CONSENT-003: the whole surface reads in English too", async ({ page }) => {
    await signInOnline(page, { email, locale: "en" });
    await page.goto("/en/app/settings/privacy");

    await expect(page.getByRole("heading", { name: "Privacy and data" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you have accepted" })).toBeVisible();
    await expect(page.locator(".privacy-consent").getByText(/Version 2026-08-04, accepted on/)).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Read the document" }).first()).toHaveAttribute(
      "href",
      "/en/legal/terms",
    );
  });
});
