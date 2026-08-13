import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2N.0's authenticated acceptance — the browser half of the foundations.
 *
 * The unit tests prove the derivation; this proves the **rendering**, which is
 * the only place the promise is actually kept. Handoff §57 recorded two Phase 2M
 * surfaces that shipped green and had never been rendered at all, so every
 * assertion below is made against a real page after a real read.
 *
 * Two rules shape how the assertions are written:
 *
 * - **Absence is never asserted alone.** A `not.toContainText` passes just as
 *   happily on a page that failed to render, so every absence is paired with a
 *   marker that proves the page is there — usually the person's own name, which
 *   ADR-110 Decision 2 requires to stay visible anyway.
 * - **Every masked item has a control.** A masked row and a missing row look the
 *   same in a text assertion; the reveal proves the content was withheld rather
 *   than dropped, which is `2N-PRIVACY-005`'s whole distinction.
 *
 * A disposable account created and deleted by the harness. No credential appears
 * in source, and the content is synthetic.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

/** The strings the journey looks for. Distinctive so a match cannot be incidental. */
const SECRET_MEMORY = "Diagnostico confidencial 4f2a9c";
const ORDINARY_MEMORY = "Prefere reunioes curtas 7b1e";
const SECRET_ENTRY = "Conversa delicada sobre 9d4c1a";
const PRIVATE_NOTE = "Nota reservada sobre esta pessoa e3f77b";
const PERSON_NAME = "Marina Teste 2N";
const ALIAS_IN_FORCE = "Mari2N";
const ALIAS_EXPIRED = "Antigo2N";

test.describe("2N.0 — the contextual surfaces become governed, bounded and identifiable", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2n0-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;
  let personId: string | undefined;
  let secretMemoryId: string | undefined;

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
    const response = await rest(table, { method: "POST", body: JSON.stringify(rows) });
    expect(response.ok, `${table} insert failed: ${await response.clone().text()}`).toBe(true);
    return (await response.json()) as T[];
  }

  test.beforeAll(async () => {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password: `Foundations!${crypto.randomUUID()}A7`,
        email_confirm: true,
        user_metadata: { display_name: "2N.0 E2E" },
      }),
    });
    expect(created.ok).toBe(true);
    userId = ((await created.json()) as { id: string }).id;

    const [person] = await insert<{ id: string }>("people", {
      user_id: userId,
      name: PERSON_NAME,
      notes: PRIVATE_NOTE,
    });
    personId = person.id;

    const [entry] = await insert<{ id: string }>("entries", {
      user_id: userId,
      original_content: SECRET_ENTRY,
      sensitivity: "highly_sensitive",
    });

    // One classified and one ordinary, on the same person and the same page.
    // The ordinary one is the control: if it were masked too, the assertions on
    // the classified one would pass for the wrong reason.
    //
    // `source_entry_id: null` is spelled out rather than omitted. PostgREST
    // refuses a bulk insert whose rows carry different key sets — `PGRST102,
    // "All object keys must match"` — because it builds one statement with one
    // column list for the whole array. The explicit null is also the honest
    // value: this memory genuinely has no source entry.
    const memories = await insert<{ id: string }>("memories", [
      {
        user_id: userId,
        content: SECRET_MEMORY,
        sensitivity: "highly_sensitive",
        person_id: person.id,
        source_entry_id: entry.id,
      },
      {
        user_id: userId,
        content: ORDINARY_MEMORY,
        sensitivity: "normal",
        person_id: person.id,
        source_entry_id: null,
      },
    ]);
    secretMemoryId = memories[0].id;

    // `2N-IDENTITY-009`: one alias in force, one whose window has closed. The
    // expired one is what proves the window is applied rather than declared.
    //
    // `valid_to: null` for the same PostgREST reason as above, and it is what
    // "in force" means here: an open-ended window, which `aliasIsInForce` reads
    // as vacuously true.
    await insert("entity_aliases", [
      {
        user_id: userId,
        entity_type: "person",
        entity_id: person.id,
        alias: ALIAS_IN_FORCE,
        valid_to: null,
      },
      {
        user_id: userId,
        entity_type: "person",
        entity_id: person.id,
        alias: ALIAS_EXPIRED,
        valid_to: "2020-01-01T00:00:00.000Z",
      },
    ]);
  });

  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  const signIn = (page: Page, locale: "pt-BR" | "en" = "pt-BR") =>
    signInOnline(page, { email, locale });

  for (const locale of ["pt-BR", "en"] as const) {
    test(`the person page withholds classified content and keeps identity visible (${locale})`, async ({
      page,
    }, testInfo) => {
      await signIn(page, locale);
      await page.goto(`/${locale}/app/people/${personId}`);

      // The fixture marker: the page rendered, so the absences below mean
      // something. ADR-110 Decision 2 — the name stays visible.
      await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();

      // `2N-PRIVACY-009` — the note is withheld, and its own text is nowhere in
      // the rendered page.
      await expect(page.locator("body")).not.toContainText(PRIVATE_NOTE);
      // `2N-PRIVACY-002` — so is the classified memory.
      await expect(page.locator("body")).not.toContainText(SECRET_MEMORY);
      // The control: an ordinary memory on the same page is untouched, which is
      // what makes the two assertions above evidence of a rule rather than of a
      // blank section.
      await expect(page.locator("body")).toContainText(ORDINARY_MEMORY);

      // `2N-PRIVACY-005` — masked in position, not dropped. The row is present
      // and carries a control.
      const masked = page.locator('[data-masked="true"]');
      expect(await masked.count()).toBeGreaterThanOrEqual(2);

      // `2N-ACCESS-003` — the reveal is reachable and announced, not merely
      // styled: it is a real button with an accessible name.
      const reveals = page.locator('[data-masked="true"] button');
      const first = reveals.first();
      await expect(first).toBeVisible();
      expect((await first.textContent())?.trim().length ?? 0).toBeGreaterThan(0);
      if (testInfo.project.name === "mobile") {
        expect((await first.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
      }

      // The reveal is local: revealing one item does not reveal the other.
      const before = await masked.count();
      await first.click();
      await expect(masked).toHaveCount(before - 1);

      // `2N-IDENTITY-004`/`-009` — the alias in force is shown; the expired one
      // is not, which is the window being applied rather than described.
      await expect(page.locator("body")).toContainText(ALIAS_IN_FORCE);
      await expect(page.locator("body")).not.toContainText(ALIAS_EXPIRED);
    });

    test(`the loading state is declared in the reader's own language (${locale})`, async ({ page }) => {
      await signIn(page, locale);
      await page.goto(`/${locale}/app/people/${personId}`);
      await expect(page.getByRole("heading", { level: 1, name: PERSON_NAME })).toBeVisible();

      // The durable half: the document declares the language it is actually in.
      // Before this slice `<html lang>` said `pt-BR` for every locale and the
      // authenticated frame said nothing at all.
      await expect(page.locator(".app-frame")).toHaveAttribute("lang", locale);

      /*
       * The transient half, measured against the REAL stylesheet.
       *
       * The route loading fallback is a streaming artefact that is gone before an
       * assertion can reach it, so this mounts its exact markup inside the live
       * page and asks the browser which announcement it would actually show. The
       * stylesheet, the `lang` inherited from `.app-frame` and the cascade are
       * all the product's; only the timing is the probe's.
       */
      const visible = await page.evaluate((tag) => {
        const frame = document.querySelector(".app-frame");
        if (!frame) return null;
        const probe = document.createElement("div");
        probe.className = "route-loading";
        probe.innerHTML = ["pt-BR", "en"]
          .map((code) => `<span data-route-loading-locale="${code}">${code}</span>`)
          .join("");
        frame.appendChild(probe);
        const shown = [...probe.querySelectorAll("[data-route-loading-locale]")]
          .filter((node) => getComputedStyle(node).display !== "none")
          .map((node) => node.getAttribute("data-route-loading-locale"));
        probe.remove();
        return { shown, tag };
      }, locale);

      // Exactly one, and it is this reader's.
      expect(visible?.shown).toEqual([locale]);
    });
  }

  test("the memory listing and its detail withhold the same content", async ({ page }) => {
    // `2N-PRIVACY-001`'s convergence, proved where it can actually diverge: two
    // surfaces, two queries, one contract.
    await signIn(page);

    await page.goto("/pt-BR/app/memories");
    await expect(page.locator("body")).toContainText(ORDINARY_MEMORY);
    await expect(page.locator("body")).not.toContainText(SECRET_MEMORY);
    const listMasked = await page.locator('[data-masked="true"]').count();
    expect(listMasked).toBeGreaterThanOrEqual(1);

    await page.goto(`/pt-BR/app/memories/${secretMemoryId}`);
    // The detail page rendered — the source-entry section is the marker.
    await expect(page.locator(".memory-facts")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(SECRET_MEMORY);
    // And the classified source entry it came from is withheld too.
    await expect(page.locator("body")).not.toContainText(SECRET_ENTRY);
    await expect(page.locator('[data-masked="true"]').first()).toBeVisible();

    // Revealing on the detail page shows it, so the content was withheld rather
    // than absent — the distinction a text assertion alone cannot make.
    await page.locator('[data-masked="true"] button').first().click();
    await expect(page.locator("body")).toContainText(SECRET_MEMORY);
  });

  test("notes leave the searchable people domain while the person stays findable", async ({
    page,
  }) => {
    // ADR-110 Decisions 5 and 10, and `2N-IDENTITY-004`'s search half.
    await signIn(page);
    await page.goto("/pt-BR/app/search");

    const box = page.getByRole("searchbox").or(page.getByRole("textbox")).first();

    // The person is findable by name — the marker that search works at all.
    await box.fill(PERSON_NAME);
    await page.keyboard.press("Enter");
    await expect(page.locator("body")).toContainText(PERSON_NAME, { timeout: 30_000 });

    // Searching a distinctive fragment of the note finds nothing, and the note's
    // text never appears as a snippet.
    await box.fill("e3f77b");
    await page.keyboard.press("Enter");
    await expect(page.locator("body")).not.toContainText(PRIVATE_NOTE, { timeout: 30_000 });

    // The nickname resolves to the person it names.
    await box.fill(ALIAS_IN_FORCE);
    await page.keyboard.press("Enter");
    await expect(page.locator("body")).toContainText(PERSON_NAME, { timeout: 30_000 });
  });
});
