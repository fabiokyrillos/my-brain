import { expect, test, type Page } from "@playwright/test";

import { mintOnlineAccessToken, signInOnline } from "./support/online-session";

/**
 * Slice 2N.3's M1 unit — what the Brain knows, and what it stops knowing.
 *
 * Two things are proved here that no unit test can prove:
 *
 * 1. **The surfaces state origin without inventing one.** The detail page used
 *    to print *"Criada por você"* for every null `source_entry_id`, and that
 *    column is `on delete set null` — so the fixture below builds the exact
 *    case: a memory whose source entry is **deleted after the memory is
 *    created**. Its line must not borrow the owner-authored wording.
 * 2. **Archiving genuinely leaves retrieval, at the bound.** This is the
 *    producer-to-consumer chain, end to end: the memory is archived **through
 *    the product's own form**, and then `match_internal_knowledge` is called
 *    **as that same user** and asked for ONE row. Before the archive it returns
 *    the candidate; after it, the live memory. A fixture archived behind the
 *    surface would have proved the database and left the form untested.
 *
 * ## No provider is called, by construction
 *
 * The retrieval assertions pass a **synthetic** query vector straight to the
 * RPC over PostgREST with the user's own token. Nothing here embeds text, so
 * the journey costs no provider spend — and it is also the only way to observe
 * eviction, since the chat surface would report a citation list, which is
 * exactly the weaker signal `2N-CORRECT-003` refuses as proof.
 *
 * ## The rules inherited from §62 and slice 2N.1
 *
 * **Absence is never asserted alone.** Every `not.toContainText` is paired with
 * a marker proving the page rendered. And the eviction assertion carries its
 * own control *inside the test*: the same call, before the archive, returns the
 * candidate — so the "after" cannot pass because the row merely ranked low.
 *
 * A disposable account created and deleted by the harness. No credential in
 * source; all content synthetic.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const SOURCED_MEMORY = "Revisao mensal combinada d41f7a";
const ORPHANED_MEMORY = "Acordo antigo sem registro b93c15";
const SOURCE_ENTRY = "Conversa sobre revisao mensal 7c2e88";
const DOOMED_ENTRY = "Registro 2n3 que sera apagado a05f31";

/**
 * A 1536-vector whose first `k` components are 1 and the rest 0.
 *
 * Against a query of `vec(1)` the cosine similarity is `1/sqrt(k)`, so `k`
 * orders the fixture exactly: 1.0, then 0.7071. `order by similarity desc`
 * carries no tiebreaker, so the two rows that race for the single slot must
 * never tie — which is what makes the expected id deterministic rather than
 * arbitrary.
 */
const vec = (k: number) =>
  `[${Array.from({ length: 1536 }, (_, index) => (index < k ? 1 : 0)).join(",")}]`;

const COPY = {
  "pt-BR": {
    sourced: "De um registro seu",
    unsourced: "Origem não registrada",
    ownerAuthored: "Informado por você",
    recordedAt: "Registrada em",
    validFrom: "Vale desde",
    validFromAlways: "Sem data de início",
    validUntil: "Vale até",
    archive: "Arquivar",
    archived: "Memória arquivada.",
    archivedState: "Arquivada",
    retrievalArchived: "Arquivada: não é mais usada nas respostas.",
  },
  en: {
    sourced: "From an entry of yours",
    unsourced: "No source recorded",
    ownerAuthored: "Informed by you",
    recordedAt: "Recorded on",
    validFrom: "Valid from",
    validFromAlways: "No start date",
    validUntil: "Valid until",
    archive: "Archive",
    archived: "Memory archived.",
    archivedState: "Archived",
    retrievalArchived: "Archived: no longer used in answers.",
  },
} as const;

test.describe("2N.3 M1 — the Brain says where a memory came from, and stops using what is retired", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2n3-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;
  let sourcedMemoryId: string | undefined;
  let orphanedMemoryId: string | undefined;
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
    // Every row of a bulk insert must carry the SAME keys — PostgREST answers
    // `PGRST102 "All object keys must match"` otherwise.
    const response = await rest(table, { method: "POST", body: JSON.stringify(rows) });
    expect(response.ok, `${table} insert failed: ${await response.clone().text()}`).toBe(true);
    return (await response.json()) as T[];
  }

  /**
   * `match_internal_knowledge` called **as the owner**, over PostgREST.
   *
   * The user's own token, never the service role: this must exercise the same
   * `security invoker` path the product uses, and a service-role call would
   * prove something about a role no browser ever holds.
   */
  async function retrieve(matchCount: number): Promise<{ source_id: string; content: string }[]> {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/match_internal_knowledge`, {
      method: "POST",
      headers: {
        apikey: publishableKey!,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_query_embedding: vec(1), p_match_count: matchCount }),
    });
    expect(response.ok, `retrieval failed: ${await response.clone().text()}`).toBe(true);
    return (await response.json()) as { source_id: string; content: string }[];
  }

  test.beforeAll(async () => {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password: `Knows!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    expect(created.ok).toBe(true);
    userId = ((await created.json()) as { id: string }).id;

    const entries = await insert<{ id: string }>("entries", [
      { user_id: userId, original_content: SOURCE_ENTRY, sensitivity: "normal" },
      { user_id: userId, original_content: DOOMED_ENTRY, sensitivity: "normal" },
    ]);

    const memories = await insert<{ id: string; content: string }>("memories", [
      // A real, resolvable source → openable.
      {
        user_id: userId,
        content: SOURCED_MEMORY,
        sensitivity: "normal",
        source_entry_id: entries[0].id,
        valid_from: null,
        valid_until: null,
      },
      // The source is about to be deleted. `on delete set null` turns this into
      // a NULL, and a NULL must read `unsourced` — never "Criada por você".
      {
        user_id: userId,
        content: ORPHANED_MEMORY,
        sensitivity: "normal",
        source_entry_id: entries[1].id,
        valid_from: null,
        valid_until: null,
      },
    ]);
    sourcedMemoryId = memories.find((row) => row.content === SOURCED_MEMORY)?.id;
    orphanedMemoryId = memories.find((row) => row.content === ORPHANED_MEMORY)?.id;
    expect(sourcedMemoryId && orphanedMemoryId, "the fixture memories were not created").toBeTruthy();

    // The deletion that creates the ambiguous NULL. This is the whole reason
    // the contract refuses to call a null source owner-authored.
    const deleted = await rest(`entries?id=eq.${entries[1].id}`, { method: "DELETE" });
    expect(deleted.ok, `could not delete the doomed entry: ${await deleted.clone().text()}`).toBe(true);

    const minted = await mintOnlineAccessToken({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
    });
    accessToken = minted.accessToken;
  });

  test.afterAll(async () => {
    if (!userId) return;
    // Deleting the account cascades every row this journey created: `user_id`
    // is `on delete cascade` on entries and memories alike. Residue is proved
    // separately and owner-scoped by `verify:online-residue`.
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  const signIn = (page: Page, locale: "pt-BR" | "en" = "pt-BR") => signInOnline(page, { email, locale });

  for (const locale of ["pt-BR", "en"] as const) {
    const copy = COPY[locale];

    test(`states origin without inventing one, on both memory surfaces (${locale})`, async ({ page }) => {
      await signIn(page, locale);

      // ---- The list, which showed no source at all before this slice --------
      await page.goto(`/${locale}/app/memories`);
      // Fixture markers: the page rendered, so what follows means something.
      await expect(page.locator("body")).toContainText(SOURCED_MEMORY);
      await expect(page.locator("body")).toContainText(ORPHANED_MEMORY);
      await expect(page.locator('[data-provenance="sourced"]').first()).toBeVisible();
      await expect(page.locator('[data-provenance="unsourced"]').first()).toBeVisible();

      // ---- The detail page of the memory whose entry was DELETED -----------
      await page.goto(`/${locale}/app/memories/${orphanedMemoryId}`);
      await expect(page.locator("body")).toContainText(ORPHANED_MEMORY);
      await expect(page.locator('[data-provenance="unsourced"]')).toBeVisible();
      await expect(page.locator("body")).toContainText(copy.unsourced);
      // The defect this slice repaired: a deleted source must NOT be dressed up
      // as authorship. Paired with the marker above, so a blank page cannot
      // satisfy it.
      await expect(page.locator("body")).not.toContainText(copy.ownerAuthored);
      // And it must not be openable — an unsourced claim offering a link would
      // confirm the entry id exists.
      await expect(page.locator('[data-provenance="sourced"]')).toHaveCount(0);

      // ---- The detail page of the memory whose source resolves -------------
      await page.goto(`/${locale}/app/memories/${sourcedMemoryId}`);
      await expect(page.locator("body")).toContainText(SOURCED_MEMORY);
      await expect(page.locator('[data-provenance="sourced"]')).toBeVisible();
      await expect(page.locator("body")).toContainText(copy.sourced);
    });

    test(`shows three freshness facts, not two (${locale})`, async ({ page }) => {
      await signIn(page, locale);
      await page.goto(`/${locale}/app/memories/${sourcedMemoryId}`);
      await expect(page.locator("body")).toContainText(SOURCED_MEMORY);

      // `2N-KNOWS-004`. The page used to print `valid_from ?? created_at` under
      // "Vale desde", so a memory with no start date read as though it began
      // the day it was typed and the recording time was never shown as itself.
      await expect(page.locator("body")).toContainText(copy.recordedAt);
      await expect(page.locator("body")).toContainText(copy.validFrom);
      await expect(page.locator("body")).toContainText(copy.validUntil);
      // The fixture's `valid_from` is NULL, so the absent boundary says it is
      // absent instead of borrowing `created_at`.
      await expect(page.locator("body")).toContainText(copy.validFromAlways);
    });

    test(`archiving through the form removes the memory from retrieval, at the bound (${locale})`, async ({ page }) => {
      /*
       * The requirement, end to end. Two memories race for a single retrieval
       * slot: the candidate outranks the live one, so before the archive the
       * bound returns the candidate. That "before" is the control — without it
       * the "after" would pass against a candidate that simply ranked low.
       */
      const marker = crypto.randomUUID().slice(0, 8);
      const candidateText = `Memoria 2n3 que sera arquivada ${marker}`;
      const liveText = `Memoria 2n3 que permanece em vigor ${marker}`;

      const [candidate] = await insert<{ id: string }>("memories", {
        user_id: userId,
        content: candidateText,
        sensitivity: "normal",
        embedding: vec(1),
        embedding_model: "text-embedding-3-small",
        valid_from: null,
        valid_until: null,
      });
      const [live] = await insert<{ id: string }>("memories", {
        user_id: userId,
        content: liveText,
        sensitivity: "normal",
        embedding: vec(2),
        embedding_model: "text-embedding-3-small",
        valid_from: null,
        valid_until: null,
      });

      try {
        // CONTROL: with one slot, the candidate wins — it outranks the live one.
        const before = await retrieve(1);
        expect(before, "the candidate did not outrank the live memory").toHaveLength(1);
        expect(before[0].content, "the fixture ranking is not what this test assumes")
          .toBe(candidateText);

        // Archived through the product's own form. A fixture write here would
        // have proved the database and left the writer untested.
        await signIn(page, locale);
        await page.goto(`/${locale}/app/memories/${candidate.id}`);
        await expect(page.locator("body")).toContainText(candidateText);
        await page.getByRole("button", { name: copy.archive }).click();

        // The action's own message first — it comes straight from
        // `useActionState` and does not wait on revalidation. A hosted write
        // was still showing "Saving…" at 45 s during slice 2N.2's parallel run,
        // which is why this bound is generous and why the suite runs serially.
        await expect(page.locator("body")).toContainText(copy.archived, { timeout: 45_000 });
        // Then the re-rendered server component: the badge and the sentence
        // that tells the owner the memory is no longer used in answers.
        await expect(page.locator("body")).toContainText(copy.archivedState);
        await expect(page.locator("body")).toContainText(copy.retrievalArchived);

        // `2N-CORRECT-003`: EVICTION AT THE BOUND. The archived memory does not
        // merely drop out of a citation list — it stops consuming the slot, and
        // the live memory ranked behind it is what comes back.
        const after = await retrieve(1);
        expect(after, "retrieval returned nothing at all after the archive").toHaveLength(1);
        expect(after[0].content, "the archived memory still occupies the single slot")
          .toBe(liveText);

        // And it is gone from the widest bound the function allows, so this is
        // eviction rather than a re-ordering.
        const wide = await retrieve(20);
        expect(wide.map((row) => row.content)).not.toContain(candidateText);
        expect(wide.map((row) => row.content), "the live memory vanished too").toContain(liveText);
      } finally {
        /*
         * Removed by EXPLICIT ID, and in a `finally` so a failed run cleans up
         * too. Not for residue — the account deletion in `afterAll` cascades
         * everything — but for DETERMINISM: this case runs four times (two
         * locales × two devices) against one account, and a surviving `live`
         * memory from an earlier run would tie with this one at 0.7071. The
         * ordering carries no tiebreaker, so the tie would make the
         * single-slot assertion arbitrary.
         */
        await rest(`memories?id=in.(${candidate.id},${live.id})`, { method: "DELETE" });
      }
    });
  }
});
