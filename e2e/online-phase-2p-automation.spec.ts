import { expect, test } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2P.4's authenticated acceptance — `2P-AUTONOMY-001`, `-003`, `-009`,
 * `-010`.
 *
 * ## Retargeted by slice 2P.5, and the retarget is itself the proof
 *
 * The section moved from `/app/settings` to `/app/settings/assistant` when
 * `2P-SETTINGS-001` gave Settings eight sections. **Every assertion below is
 * unchanged** — same headings, same six categories, same reasons, same history
 * and undo, same reflow, same English surface — because ADR-123 Decision 7
 * required 2P.5 to reorganize this surface *"without changing its semantics"*.
 * A retarget that had also needed the assertions rewritten would have been the
 * evidence that the semantics moved.
 *
 * ## What only a real authenticated browser can answer
 *
 *  1. **The RSC boundary.** `/app/settings` mounts a new Server Component that
 *     awaits two reads. It compiles, it is unit-tested, and neither fact means
 *     the page renders in production — the failure this repository recorded as
 *     *"the RSC boundary is only tested in production"*, where two surfaces
 *     shipped green and never rendered. CI's foundation journey is
 *     unauthenticated and cannot reach this page at all.
 *  2. **That the refusal is legible to a person.** The whole slice is a
 *     refusal; a unit test proves the string is chosen, and only a navigation
 *     proves it is on the screen a person opens.
 *  3. **The control end to end, against a real database.** Saving a policy,
 *     seeing the history entry appear, and undoing it are three separate
 *     round-trips through a Server Action, an RPC, an audit row and a
 *     registered undo handler. Nothing below the browser exercises that chain.
 *  4. **That `revalidatePath` does not destroy the undo control.** The undo is
 *     rendered from the persisted row precisely so it survives the revalidation
 *     that follows the write — a shape this repository has already paid for.
 *     Only a real navigation can show that it is still there afterwards.
 *
 * ## The account is disposable and its cascade cleans it up
 *
 * The same fixture shape the other online lanes use. This one writes at most
 * one policy row and one undo operation, and both go with the account.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && serviceRoleKey && publishableKey);

/** The six the owner signed, in the order the projection returns them. */
const CATEGORIES_PT = ["Tarefas", "Pessoas", "Projetos", "Empresas", "Memórias", "Relações"];

test.describe("automation by category is visible, refused, and reversible", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-automation-${crypto.randomUUID()}@example.com`;
  const password = `Autom!${crypto.randomUUID()}A7`;
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
        user_metadata: { display_name: "Automation E2E" },
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
    // It must also prove the append-only evidence table does not block the
    // cascade — the defect CI caught, restated where a person would notice it.
    expect(deletion.ok).toBe(true);
  });

  test("2P-AUTONOMY-001/-010: the section renders, and all six categories refuse", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/assistant");

    // The RSC assertion: it rendered at all.
    await expect(page.getByRole("heading", { name: "Automação por categoria" })).toBeVisible();

    const section = page.locator(".automation-section");
    const list = page.getByRole("list", { name: "Categorias e suas políticas" });
    await expect(list.getByRole("listitem")).toHaveCount(6);
    for (const name of CATEGORIES_PT) {
      await expect(list.getByRole("heading", { name })).toBeVisible();
    }

    /*
      Scoped to the section on purpose. The same sentence also appears in the
      capability summary, because slice 2P.4 wrote the honest line in both
      places — so an unscoped matcher is a strict-mode violation against
      CORRECT product behaviour, not a finding.
    */
    await expect(section.getByText(/nenhuma categoria age sozinha/i)).toBeVisible();

    // Every category refuses, and says so with the specific reason.
    await expect(page.getByText("Configurada para apenas sugerir.")).toHaveCount(6);
  });

  test("2P-AUTONOMY-003: `no evidence yet` and `no way to gather it` are different answers", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/assistant");

    // Four categories have no review flow at all; two have one and no rows.
    await expect(page.getByText(/não existe um fluxo de revisão/i)).toHaveCount(4);
    await expect(page.getByText("Nenhum exemplo revisado ainda.")).toHaveCount(2);

    // The threshold is named, so the refusal is measurable rather than opaque.
    await expect(page.getByText(/necessário: 50 revisados/i)).toBeVisible();
  });

  test("2P-AUTONOMY-009: a policy change persists, is listed, and can be undone", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/assistant");

    const memories = page.getByRole("form", { name: "Memórias" });
    await expect(memories.getByLabel("Política")).toHaveValue("suggest_only");

    await memories.getByLabel("Política").selectOption("disabled");
    await memories.getByRole("button", { name: "Salvar política" }).click();

    /*
      THE SELECT'S VALUE IS NOT EVIDENCE, AND THIS IS WHY IT IS NOT ASSERTED.

      It is an uncontrolled `<select>`: `defaultValue` applies on mount, so
      after a click it holds the OWNER'S CHOICE regardless of what the server
      did. The first cut of this test asserted it and passed while the page had
      not re-rendered at all — a green assertion over a stale DOM.

      Everything below is server-rendered and cannot be produced by a click:
      the reason sentence, the history entry, and the undo control.
    */
    await expect(page.getByText("Você desativou esta categoria.")).toBeVisible();
    await expect(page.locator(".automation-history-list li")).toHaveCount(1);

    // `2P-AUTONOMY-009`: the undo is reachable AT THE MOMENT the policy
    // changes, which is exactly when the owner might want it back.
    const undo = page.getByRole("button", { name: "Desfazer" });
    await expect(undo).toBeVisible();

    await undo.click();

    // Undo restores ABSENCE — the computed default — not a stored value, and
    // the reason returns to the one an absent row produces.
    await expect(page.getByText("Você desativou esta categoria.")).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Memórias" }).getByLabel("Política"))
      .toHaveValue("suggest_only");
  });

  test("2P-AUTONOMY-001: the surface survives a reload and a back navigation", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.goto("/pt-BR/app/settings/assistant");
    await expect(page.getByRole("heading", { name: "Automação por categoria" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Automação por categoria" })).toBeVisible();
    await expect(page.locator(".automation-section").getByText(/nenhuma categoria age sozinha/i)).toBeVisible();

    await page.goto("/pt-BR/app");
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Automação por categoria" })).toBeVisible();
  });

  test("2P-MOBILE-005 shape: the section reflows without horizontal page scroll", async ({ page }) => {
    await signInOnline(page, { email, locale: "pt-BR" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/pt-BR/app/settings/assistant");

    await expect(page.getByRole("heading", { name: "Automação por categoria" })).toBeVisible();

    // The page body must not scroll sideways — the property a desktop run
    // cannot observe.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Every control still reaches the 44px target on a phone.
    const save = page.getByRole("form", { name: "Tarefas" }).getByRole("button", { name: "Salvar política" });
    const box = await save.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("the English surface renders with no Portuguese leaking through", async ({ page }) => {
    await signInOnline(page, { email, locale: "en" });
    await page.goto("/en/app/settings/assistant");

    await expect(page.getByRole("heading", { name: "Automation by category" })).toBeVisible();
    await expect(page.locator(".automation-section").getByText(/No category acts on its own today/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Categories and their policies" })).toBeVisible();
    await expect(page.getByText("Tarefas")).toHaveCount(0);
  });
});
