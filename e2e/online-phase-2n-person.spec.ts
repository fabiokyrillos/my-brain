import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2N.1's authenticated acceptance — the person page's provenance,
 * bounds, mobile and accessibility contracts, proved rendering.
 *
 * The unit tests prove the derivation; this proves what a reader actually
 * receives. Handoff §63 recorded a loading state that was correct in every unit
 * test and silent in a real browser, so the rules from §62 apply here too:
 *
 * - **Absence is never asserted alone.** Every `not.toContainText` is paired
 *   with a marker proving the page rendered — usually the person's own name,
 *   which ADR-110 Decision 2 keeps visible anyway.
 * - **Every claim about masking has a control.** A masked row and a missing row
 *   look identical to a text assertion.
 *
 * The fixture builds the four provenance cases deliberately, including the one
 * that only exists because `source_entry_id` is `on delete set null`: a memory
 * whose source entry is deleted after the memory is created, which leaves a NULL
 * that must NOT read as "informed by you".
 *
 * A disposable account created and deleted by the harness. No credential in
 * source; all content synthetic.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const PERSON_NAME = "Renata Teste 2N1";
const SOURCED_MEMORY = "Prefere revisao quinzenal a71b3c";
const ORPHANED_MEMORY = "Combinado antigo sem registro c5d9e2";
const SOURCE_ENTRY = "Conversa sobre cadencia de revisao 8f2d40";
const DOOMED_ENTRY = "Registro que sera apagado 6b1a77";

const COPY = {
  "pt-BR": { ownerAuthored: "Informado por você", sourced: "De um registro seu", unsourced: "Origem não registrada", persisted: "Você mantém esta seção", derived: "Derivado dos seus registros", back: "Voltar para onde você estava" },
  en: { ownerAuthored: "Informed by you", sourced: "From an entry of yours", unsourced: "No source recorded", persisted: "You maintain this section", derived: "Derived from your records", back: "Back to where you were" },
} as const;

test.describe("2N.1 — the person page states where each claim came from", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2n1-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;
  let personId: string | undefined;
  let sourceEntryId: string | undefined;

  const rest = async (path: string, init: RequestInit = {}) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });

  async function insert<T>(table: string, rows: unknown): Promise<T[]> {
    // Every row of a bulk insert carries the SAME keys — PostgREST answers
    // `PGRST102 "All object keys must match"` otherwise, which is what made
    // 2N.0's journey un-runnable until it was actually executed.
    const response = await rest(table, { method: "POST", body: JSON.stringify(rows) });
    expect(response.ok, `${table} insert failed: ${await response.clone().text()}`).toBe(true);
    return (await response.json()) as T[];
  }

  test.beforeAll(async () => {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: `Person!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    expect(created.ok).toBe(true);
    userId = ((await created.json()) as { id: string }).id;

    const [person] = await insert<{ id: string }>("people", { user_id: userId, name: PERSON_NAME, notes: null });
    personId = person.id;

    const entries = await insert<{ id: string }>("entries", [
      { user_id: userId, original_content: SOURCE_ENTRY, sensitivity: "normal" },
      { user_id: userId, original_content: DOOMED_ENTRY, sensitivity: "normal" },
    ]);
    sourceEntryId = entries[0].id;

    await insert("memories", [
      // Case 1: a real, resolvable source → openable.
      { user_id: userId, content: SOURCED_MEMORY, sensitivity: "normal", person_id: person.id, source_entry_id: entries[0].id },
      // Case 2: a source that is about to be deleted. `on delete set null` will
      // turn this into a NULL, which must render `unsourced` and never
      // "informed by you".
      { user_id: userId, content: ORPHANED_MEMORY, sensitivity: "normal", person_id: person.id, source_entry_id: entries[1].id },
    ]);

    // The deletion that creates the ambiguous NULL. This is the whole reason the
    // contract refuses to call a null source owner-authored.
    const deleted = await rest(`entries?id=eq.${entries[1].id}`, { method: "DELETE" });
    expect(deleted.ok, `could not delete the doomed entry: ${await deleted.clone().text()}`).toBe(true);

    // An owner-authored relation: the table carries no source column at all.
    await insert("person_relationships", {
      user_id: userId,
      person_id: person.id,
      relationship_type: "colleague",
      description: null,
      valid_from: "2024-01-01T00:00:00.000Z",
      valid_until: null,
    });
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  const signIn = (page: Page, locale: "pt-BR" | "en" = "pt-BR") => signInOnline(page, { email, locale });

  for (const locale of ["pt-BR", "en"] as const) {
    const copy = COPY[locale];

    test(`states origin without inventing one (${locale})`, async ({ page }) => {
      await signIn(page, locale);
      await page.goto(`/${locale}/app/people/${personId}`);

      // The fixture marker: the page rendered, so what follows means something.
      await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();

      // `2N-PROV-001` — the memory with a resolvable source is openable.
      const sourced = page.locator('[data-provenance="sourced"]');
      await expect(sourced.first()).toBeVisible();
      await expect(page.locator("body")).toContainText(copy.sourced);

      // `2N-PROV-004` — the memory whose entry was DELETED reads as unsourced,
      // and nowhere on the page is it called owner-authored. This is the case
      // that only exists because the column is `on delete set null`.
      await expect(page.locator('[data-provenance="unsourced"]').first()).toBeVisible();
      await expect(page.locator("body")).toContainText(copy.unsourced);
      await expect(page.locator("body")).toContainText(ORPHANED_MEMORY);

      // `2N-RELATION-008` — the relation IS owner-authored, and says so.
      await expect(page.locator('[data-provenance="owner-authored"]').first()).toBeVisible();
      await expect(page.locator("body")).toContainText(copy.ownerAuthored);

      // The control that makes the two above evidence rather than coincidence:
      // an unsourced claim must not borrow the owner-authored wording. If the
      // contract regressed to calling a null source owner-authored, the
      // unsourced line would disappear entirely.
      const unsourcedText = await page.locator('[data-provenance="unsourced"]').first().innerText();
      expect(unsourcedText).not.toContain(copy.ownerAuthored);

      // `2N-PERSON-004` — sections say whether the owner maintains them.
      await expect(page.locator('[data-section-origin="persisted"]').first()).toBeVisible();
      await expect(page.locator('[data-section-origin="derived"]').first()).toBeVisible();
      await expect(page.locator("body")).toContainText(copy.persisted);
      await expect(page.locator("body")).toContainText(copy.derived);
    });

    test(`opening a source returns the reader to their place (${locale})`, async ({ page }) => {
      // `2N-PERSON-006`, `2N-PROV-003`.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/people/${personId}`);
      await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();

      await page.locator('[data-provenance="sourced"] a').first().click();

      // We are on the source, and it is the right one.
      await expect(page).toHaveURL(new RegExp(`/app/inbox/${sourceEntryId}`));
      await expect(page.locator("body")).toContainText(SOURCE_ENTRY);

      // The way back exists, is labelled, and lands on the anchor rather than
      // merely on the page.
      const back = page.locator('[data-return-to-source="true"]');
      await expect(back).toBeVisible();
      await expect(back).toHaveText(copy.back);
      await back.click();

      await expect(page).toHaveURL(/#memory-/);
      await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();
    });

    test(`is operable by keyboard and leaks nothing through attributes (${locale})`, async ({ page }) => {
      // `2N-ACCESS-001`, `2N-ACCESS-003`, `2N-PRIVACY-002`.
      await signIn(page, locale);
      await page.goto(`/${locale}/app/people/${personId}`);
      await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();

      // The source link is reachable by keyboard and shows a focus ring.
      const link = page.locator('[data-provenance="sourced"] a').first();
      await link.focus();
      await expect(link).toBeFocused();
      const outline = await link.evaluate((node) => getComputedStyle(node).outlineStyle);
      expect(outline, "focus must be visible, not merely present").not.toBe("none");

      // No provenance line anywhere carries a `title`: unreachable by keyboard,
      // invisible to touch, and a second copy of text in an attribute.
      expect(await page.locator(".provenance-note [title]").count()).toBe(0);

      // `2N-ACCESS-002` — the section origin is text, not position.
      const originText = await page.locator('[data-section-origin]').first().innerText();
      expect(originText.trim().length).toBeGreaterThan(0);
    });
  }

  test("renders no probe row and no horizontal overflow on a narrow viewport", async ({ page }, testInfo) => {
    // `2N-MOBILE-001`, `2N-PERSON-003`.
    await signIn(page);
    await page.goto(`/pt-BR/app/people/${personId}`);
    await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the page scrolls horizontally on ${testInfo.project.name}`).toBeLessThanOrEqual(1);

    // The lists are small here, so no bound is hit and no notice may appear —
    // the control for `bounded-notice.tsx` rendering nothing when complete.
    expect(await page.locator('[data-bounded="true"]').count()).toBe(0);
  });
});
