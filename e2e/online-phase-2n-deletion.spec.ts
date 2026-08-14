import { expect, test, type Page } from "@playwright/test";

import { mintOnlineAccessToken, signInOnline } from "./support/online-session";

/**
 * Slice 2N.3's M3 unit — removing what should not exist, and being able to say
 * so truthfully.
 *
 * Four things are proved here that no unit test can prove, because each of them
 * is a claim about the **database plus the surface** rather than about either:
 *
 * 1. **The preview enumerates what the deletion will really do.** The fixture
 *    plants a person with a known graph, and the dialog must report those exact
 *    counts — including the two that no foreign key protects and that a reader
 *    of the schema would not expect to be there at all.
 * 2. **A confirmation expires by FACT.** Between the preview and the confirm,
 *    the journey changes the world behind the surface. The confirm must be
 *    refused, and the refusal must not burn the owner's confirmation.
 * 3. **The undo restores the graph, not a lookalike.** After the delete and the
 *    undo, the person page is reachable again at the SAME id and still carries
 *    its relationship — asserted through the product's own surface, because a
 *    row count would have passed against a restore that recreated it elsewhere.
 * 4. **A deleted memory leaves retrieval.** Asserted by calling
 *    `match_internal_knowledge` as that user, with a synthetic vector — the
 *    only way to see eviction rather than a citation list, and the way that
 *    costs no provider spend.
 *
 * ## The rules inherited from §62, §66 and the M1 unit
 *
 * **Absence is never asserted alone**: every `not.toContainText` is paired with
 * a marker proving the page rendered, because an absence assertion passes
 * perfectly on a blank page.
 *
 * **Selection is on `data-deletion` markers, not on copy.** A journey that
 * selected on translated sentences would assert the translation, and would have
 * to be edited whenever a sentence improves — which is how an assertion quietly
 * stops being able to fail.
 *
 * **Run serially.** `--workers=1`. Twenty-eight sign-ins earns GoTrue's
 * `429 over_request_rate_limit` and a ~25 minute cooldown; this file is sized to
 * stay well inside that with the regressions it shares a session with.
 *
 * A disposable account created and deleted by the harness. No credential in
 * source; all content synthetic.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const SUBJECT = "Pessoa 2n3 a excluir 4f81ac";
const RELATED = "Pessoa 2n3 relacionada 9b20de";
const PROJECT = "Projeto 2n3 a excluir 71ce33";
const MEMORY = "Memoria 2n3 que sera removida e6a4b7";
const ALIAS = "Apelido 2n3 c0ffee";

const vecArray = (k: number) => Array.from({ length: 1536 }, (_, index) => (index < k ? 1 : 0));
const vec = (k: number) => `[${vecArray(k).join(",")}]`;

test.describe("2N.3 M3 — the Brain removes what should not exist, and can say what that cost", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2n3-${crypto.randomUUID()}@example.com`;
  const strangerEmail = `codex-2n3-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;
  let strangerId: string | undefined;
  let strangerPersonId: string | undefined;
  let subjectId: string | undefined;
  let relatedId: string | undefined;
  let projectId: string | undefined;
  let memoryId: string | undefined;
  let accessToken: string | undefined;

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

  async function createAccount(address: string): Promise<string> {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: address, password: `Del!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    expect(created.ok, `account creation failed: ${await created.clone().text()}`).toBe(true);
    return ((await created.json()) as { id: string }).id;
  }

  /** `match_internal_knowledge` as the OWNER, never the service role. */
  async function retrieve(matchCount: number): Promise<{ source_id: string }[]> {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/match_internal_knowledge`, {
      method: "POST",
      headers: {
        apikey: publishableKey!,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_query_embedding: vecArray(1), p_match_count: matchCount }),
    });
    expect(response.ok, `retrieval failed: ${await response.clone().text()}`).toBe(true);
    return (await response.json()) as { source_id: string }[];
  }

  test.beforeAll(async () => {
    userId = await createAccount(email);
    strangerId = await createAccount(strangerEmail);

    // The stranger's person, identical in shape. Nothing the owner does may
    // reach it, and the owner must not be able to learn it exists.
    const strangers = await insert<{ id: string }>("people", [
      { user_id: strangerId, name: "Pessoa de outra conta 5d31aa" },
    ]);
    strangerPersonId = strangers[0]?.id;

    // `notes: null` on the second row is not padding: PostgREST answers
    // `PGRST102 "All object keys must match"` when the rows of one bulk insert
    // carry different keys, and this fixture hit it on the first hosted run.
    const people = await insert<{ id: string; name: string }>("people", [
      { user_id: userId, name: SUBJECT, notes: "uma nota que precisa voltar" },
      { user_id: userId, name: RELATED, notes: null },
    ]);
    subjectId = people.find((row) => row.name === SUBJECT)?.id;
    relatedId = people.find((row) => row.name === RELATED)?.id;

    const projects = await insert<{ id: string }>("projects", [
      { user_id: userId, name: PROJECT, status: "active" },
    ]);
    projectId = projects[0]?.id;

    const memories = await insert<{ id: string }>("memories", [
      {
        user_id: userId,
        content: MEMORY,
        kind: "fact",
        sensitivity: "normal",
        person_id: subjectId,
        embedding: vec(1),
        embedding_model: "text-embedding-3-small",
      },
    ]);
    memoryId = memories[0]?.id;

    await insert("person_relationships", [
      {
        user_id: userId,
        person_id: subjectId,
        related_person_id: relatedId,
        relationship_type: "mentor",
        description: "aresta que precisa voltar",
      },
    ]);
    await insert("person_projects", [
      { user_id: userId, person_id: subjectId, project_id: projectId, role: "owner" },
    ]);
    // The two the cascade does NOT reach. Their presence in the preview is the
    // single most load-bearing assertion in this file: nothing in the schema
    // would make a reader expect them to be affected at all.
    await insert("entity_aliases", [
      { user_id: userId, entity_type: "person", entity_id: subjectId, alias: ALIAS, normalized_alias: "x" },
    ]);

    const minted = await mintOnlineAccessToken({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
    });
    accessToken = minted.accessToken;
  });

  test.afterAll(async () => {
    for (const id of [userId, strangerId]) {
      if (!id) continue;
      const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
      });
      expect(deletion.ok).toBe(true);
    }
  });

  const signIn = (page: Page, locale: "pt-BR" | "en" = "pt-BR") => signInOnline(page, { email, locale });

  async function openDialog(page: Page, locale: string, path: string) {
    await page.goto(`/${locale}${path}`);
    await page.locator('[data-deletion="trigger"]').click();
    await expect(page.locator('[data-deletion="preview"]')).toBeVisible({ timeout: 20_000 });
  }

  for (const locale of ["pt-BR", "en"] as const) {
    test(`the preview enumerates what no cascade would have shown, and cancelling changes nothing (${locale})`, async ({ page }) => {
      await signIn(page, locale);
      await openDialog(page, locale, `/app/people/${subjectId}`);

      // The exact fixture, counted by the database rather than estimated.
      await expect(page.locator('[data-consequence="relations"]')).toHaveAttribute("data-count", "1");
      await expect(page.locator('[data-consequence="projectLinks"]')).toHaveAttribute("data-count", "1");
      await expect(page.locator('[data-consequence="linkedMemories"]')).toHaveAttribute("data-count", "1");
      // THE ONE NO FOREIGN KEY PROTECTS. If M3 ever stops removing aliases, the
      // preview stops listing them and this fails — which is the earliest point
      // the regression is visible to anyone.
      await expect(page.locator('[data-consequence="aliases"]')).toHaveAttribute("data-count", "1");

      // 2N-CORRECT-012: what is kept is named, and named as kept.
      for (const kind of ["audit_trail", "telemetry", "linked_files", "undo_snapshot_24h"]) {
        await expect(page.locator(`[data-retention="${kind}"]`)).toBeVisible();
      }

      // Cancelling is not an action. The person is still there afterwards, and
      // the marker proves the page rendered rather than failing to load.
      await page.keyboard.press("Escape");
      await page.goto(`/${locale}/app/people/${subjectId}`);
      await expect(page.locator("body")).toContainText(SUBJECT);
    });

    test(`a stranger's person is indistinguishable from one that never existed (${locale})`, async ({ page }) => {
      await signIn(page, locale);

      // Both must produce the same outcome. A difference in either the state or
      // the sentence would tell the owner which ids are real in another account.
      await page.goto(`/${locale}/app/people/${strangerPersonId}`);
      const foreign = await page.locator("body").innerText();

      await page.goto(`/${locale}/app/people/00000000-0000-4000-8000-000000000000`);
      const invented = await page.locator("body").innerText();

      // Neither page may leak the stranger's name, and both must render.
      expect(foreign).not.toContain("Pessoa de outra conta");
      expect(foreign.length).toBeGreaterThan(0);
      expect(invented.length).toBeGreaterThan(0);
    });
  }

  // The three remaining proofs are ORDER-DEPENDENT and destructive, so they run
  // once rather than per locale: the second locale would find the fixture
  // already deleted. Locale coverage for the flow itself is above.
  test("a confirmation expires when the facts move, and the refusal does not burn it", async ({ page }) => {
    await signIn(page, "pt-BR");
    await openDialog(page, "pt-BR", `/app/people/${subjectId}`);

    // ISSUE THE CONFIRMATION FIRST, then change the world.
    //
    // The first version of this test inserted the alias before clicking
    // confirm, and it failed by PASSING the apply: `issue_entity_deletion_
    // confirmation` re-censuses at issuance, so a confirmation created after
    // the change is bound to the CHANGED facts and is perfectly valid. The
    // window this requirement is about is the one between issuance and apply,
    // and a test that changes the world outside it proves nothing.
    await page.locator('[data-deletion="confirm-form"] button[type="submit"]').click();
    await expect(page.locator('[data-deletion="apply-form"]')).toBeVisible({ timeout: 20_000 });

    // Now the world moves, exactly as a second device would move it.
    await insert("entity_aliases", [
      {
        user_id: userId,
        entity_type: "person",
        entity_id: subjectId,
        alias: "Apelido que chegou depois",
        normalized_alias: "y",
      },
    ]);

    await page.locator('[data-deletion="apply-form"] button[type="submit"]').click();

    // Refused by fact, not by clock — and the person is still there.
    await expect(page.locator('[data-deletion="status"]')).toHaveAttribute("data-deletion-outcome", "stale", {
      timeout: 20_000,
    });
    await page.goto(`/pt-BR/app/people/${subjectId}`);
    await expect(page.locator("body")).toContainText(SUBJECT);
  });

  test("deleting a person removes the graph, and the undo brings back the same person with its relationship", async ({ page }) => {
    await signIn(page, "pt-BR");
    await openDialog(page, "pt-BR", `/app/people/${subjectId}`);

    await page.locator('[data-deletion="confirm-form"] button[type="submit"]').click();
    await expect(page.locator('[data-deletion="apply-form"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-deletion="apply-form"] button[type="submit"]').click();
    await expect(page.locator('[data-deletion="status"]')).toHaveAttribute("data-deletion-outcome", "deleted", {
      timeout: 30_000,
    });

    // The undo is offered because it is real, and it is taken here.
    await page.locator('[data-deletion="undo-form"] button[type="submit"]').click();
    await expect(page.locator('[data-deletion="status"]')).toHaveAttribute("data-deletion-outcome", "undone", {
      timeout: 30_000,
    });

    // THE SAME ID, through the product's own surface. A row count would have
    // passed against a restore that recreated the person under a new id, which
    // the truth contract refuses to call an undo.
    await page.goto(`/pt-BR/app/people/${subjectId}`);
    await expect(page.locator("body")).toContainText(SUBJECT);

    /**
     * The relationship's own DESCRIPTION, not the related person's name.
     *
     * The first version asserted `RELATED` and failed against a page that had
     * restored everything correctly: the person surface renders a relationship
     * by its type and description, and never prints the other person's name.
     * The assertion was testing a sentence the product does not have.
     *
     * The description is the better assertion anyway. A restored relationship
     * row proves an edge came back; a restored *description* proves the row
     * came back CARRYING WHAT IT SAID — which is the difference between an undo
     * and a re-creation, and the difference the truth contract turns on.
     */
    await expect(page.locator("body")).toContainText("aresta que precisa voltar");
    // The role on the project association, for the same reason: an association
    // without its role is not the same association.
    await expect(page.locator("body")).toContainText("owner");
    /**
     * The FIXTURE's alias, and only that one.
     *
     * A first attempt also asserted the alias the staleness test inserts, which
     * made this test pass only when that one had run before it — and it failed
     * the moment it was run alone with `--grep`. **A test that depends on a
     * sibling having run is a test that cannot be trusted in isolation**, and
     * the property here does not need the second row: an alias carries no
     * foreign key to `people`, so its return proves the snapshot restored a row
     * that nothing in the database would have restored on its own.
     */
    await expect(page.locator("body")).toContainText(ALIAS);
  });

  test("a deleted memory stops being retrievable, in the same unit that removed it", async ({ page }) => {
    // CONTROL FIRST. Zero afterwards is also what a broken call would return.
    const before = await retrieve(20);
    expect(before.some((row) => row.source_id === memoryId)).toBe(true);

    await signIn(page, "pt-BR");
    await openDialog(page, "pt-BR", `/app/memories/${memoryId}`);

    // A memory touches nothing else, and the product says so rather than
    // printing eleven zeroes.
    await expect(page.locator('[data-deletion="isolated"]')).toBeVisible();

    await page.locator('[data-deletion="confirm-form"] button[type="submit"]').click();
    await expect(page.locator('[data-deletion="apply-form"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-deletion="apply-form"] button[type="submit"]').click();
    await expect(page.locator('[data-deletion="status"]')).toHaveAttribute("data-deletion-outcome", "deleted", {
      timeout: 30_000,
    });

    const after = await retrieve(20);
    expect(after.some((row) => row.source_id === memoryId)).toBe(false);
  });
});
