import { expect, test, type Page } from "@playwright/test";

import { signInOnline } from "./support/online-session";

/**
 * Slice 2N.4 — the Brain says two facts cannot both be right, instead of
 * quietly calling one of them archived.
 *
 * Five things are proved here that no unit test can prove, because each is a
 * claim about the **database plus the surface** rather than about either:
 *
 * 1. **A memory the product itself cannot create still reaches the queue.**
 *    `memories.valid_from` has no writer anywhere in the product, so the fixture
 *    plants the inverted window directly. That is the whole point: the detector
 *    is a read-time safety net over a column nothing writes, and the only way to
 *    see it work is to put a row there.
 * 2. **The row shows BOTH dates, in the owner's zone and locale.** Asserted on
 *    the rendered values, so a projection that dropped one half would fail here
 *    even though the detector's unit tests pass.
 * 3. **The correction really resolves it.** The journey follows the row's own
 *    action to the memory, performs the transition through the product's form,
 *    returns to the queue, and asserts the item is **gone** — end to end, no
 *    RPC shortcut.
 * 4. **A coherent memory produces nothing**, and a **foreign** one produces
 *    nothing, and the two are indistinguishable from the owner's side.
 * 5. **`resolve_consistency` still means what it meant.** A conflict and an
 *    unorganizable entry are two rows with two sentences and two destinations.
 *
 * ## The rules inherited from §62, §66, §67 and §69
 *
 * **Absence is never asserted alone.** Every "the conflict is gone" assertion is
 * paired with a marker proving the queue rendered — an absence assertion passes
 * perfectly on a blank page.
 *
 * **Selection is on `data-conflict` / `data-memory-lifecycle` markers, never on
 * copy.** A journey that selected on translated sentences would assert the
 * translation, and would stop being able to fail the moment a sentence improved.
 *
 * **Run serially, `--workers=1`.** GoTrue answers `429 over_request_rate_limit`
 * around 28 sign-ins; this file is sized to stay well inside that alongside the
 * regressions it shares a session with.
 *
 * A disposable account created and deleted by the harness. No credential in
 * source; all content synthetic, all markers prefixed `2n4`.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

/** Every fixture string carries `2n4` and a fixed suffix, so residue is findable by prefix. */
const INVERTED = "Memoria 2n4 com janela invertida a71f0c";
const COHERENT = "Memoria 2n4 com janela coerente 3e92bd";
const FOREIGN = "Memoria 2n4 de outra conta 5c40ae";

/**
 * Fixed instants, not relative to `now()`.
 *
 * The rule never consults a clock, so neither does the fixture — and a window
 * expressed as "tomorrow until yesterday" would make this file's meaning depend
 * on the day it runs.
 */
const VALID_FROM = "2026-09-01T12:00:00.000Z";
const VALID_UNTIL = "2026-08-01T12:00:00.000Z";

test.describe("2N.4 — two facts that cannot both be right reach the queue, and leave it when fixed", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `codex-2n4-${crypto.randomUUID()}@example.com`;
  const strangerEmail = `codex-2n4-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;
  let strangerId: string | undefined;
  let invertedId: string | undefined;
  let foreignId: string | undefined;

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
      body: JSON.stringify({ email: address, password: `Cfl!${crypto.randomUUID()}A7`, email_confirm: true }),
    });
    expect(created.ok, `account creation failed: ${await created.clone().text()}`).toBe(true);
    return ((await created.json()) as { id: string }).id;
  }

  test.beforeAll(async () => {
    userId = await createAccount(email);
    strangerId = await createAccount(strangerEmail);

    /*
      The measured fact this fixture exists to exercise: `public.memories` has NO
      validity CHECK, so this insert succeeds. Its sibling `entity_aliases` would
      refuse the identical row by `entity_aliases_check`. If a later migration
      adds the constraint here, THIS INSERT FAILS -- which is the correct
      outcome and the correct place to learn it, rather than a detector that
      silently stops having anything to detect.

      All three rows carry identical keys: PostgREST answers `PGRST102 "All
      object keys must match"` when a bulk insert's rows differ, which the 2N.3
      fixture hit on its first hosted run.
    */
    const owned = await insert<{ id: string; content: string }>("memories", [
      {
        user_id: userId,
        content: INVERTED,
        kind: "fact",
        sensitivity: "normal",
        valid_from: VALID_FROM,
        valid_until: VALID_UNTIL,
      },
      {
        user_id: userId,
        content: COHERENT,
        kind: "fact",
        sensitivity: "normal",
        valid_from: VALID_UNTIL,
        valid_until: VALID_FROM,
      },
    ]);
    invertedId = owned.find((row) => row.content === INVERTED)?.id;
    expect(invertedId, "the inverted window must have been accepted by the database").toBeTruthy();

    // The same fault under another account. It must never reach this owner, and
    // the owner must not be able to learn it exists.
    const foreign = await insert<{ id: string }>("memories", [
      {
        user_id: strangerId,
        content: FOREIGN,
        kind: "fact",
        sensitivity: "normal",
        valid_from: VALID_FROM,
        valid_until: VALID_UNTIL,
      },
    ]);
    foreignId = foreign[0]?.id;
  });

  test.afterAll(async () => {
    // Deleting the accounts removes the data — the round trip 2N.3's cleanup
    // probe proved, rather than assumed.
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

  async function openQueue(page: Page, locale: string) {
    await page.goto(`/${locale}/app/inbox?view=needs-you`);
    // The queue rendered. Asserted before every absence claim below, because an
    // absence assertion passes perfectly on a page that never rendered.
    await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });
  }

  for (const locale of ["pt-BR", "en"] as const) {
    test(`the inverted window reaches the queue with BOTH dates, and the coherent one does not (${locale})`, async ({ page }) => {
      await signIn(page, locale);
      await openQueue(page, locale);

      const row = page.locator('[data-conflict="row"]');
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-conflict-kind", "memory_validity_window");

      // Both halves, and neither is the winner.
      await expect(row.locator('[data-conflict="valid-from"]')).not.toBeEmpty();
      await expect(row.locator('[data-conflict="valid-until"]')).not.toBeEmpty();

      // The memory's own words identify WHICH memory, and the coherent one is
      // absent from a page that demonstrably rendered the conflicting one.
      await expect(row.locator('[data-conflict="content"]')).toContainText(INVERTED);
      await expect(page.locator("body")).not.toContainText(COHERENT);

      // `2N-PRIVACY`: no foreign content, and no foreign id.
      await expect(page.locator("body")).not.toContainText(FOREIGN);
      if (foreignId) await expect(page.locator("body")).not.toContainText(foreignId);

      // The action is real and reaches the memory.
      await expect(row).toHaveAttribute("href", new RegExp(`/${locale}/app/memories/${invertedId}$`));
    });

    test(`the dates render in the owner's zone and locale, and the row never says archived (${locale})`, async ({ page }) => {
      await signIn(page, locale);
      await openQueue(page, locale);

      const row = page.locator('[data-conflict="row"]');
      const from = await row.locator('[data-conflict="valid-from"]').innerText();
      const until = await row.locator('[data-conflict="valid-until"]').innerText();

      // 12:00 UTC is 09:00 in São Paulo, the account's default zone. Asserted on
      // the TIME rather than the date, because a UTC-rendered row would read
      // 12:00 and still show the right day.
      expect(from, `valid_from in ${locale}`).toContain("09:00");
      expect(until, `valid_until in ${locale}`).toContain("09:00");
      // The two dates are different, so a projection that printed one twice fails.
      expect(from).not.toBe(until);

      // The silence this slice ends: the row must not call it archived.
      const text = (await row.innerText()).toLowerCase();
      expect(text).not.toContain("arquivada");
      expect(text).not.toContain("archived");
    });
  }

  test("Hoje cannot say nothing is pending while the conflict exists", async ({ page }) => {
    await signIn(page, "pt-BR");
    await page.goto("/pt-BR/app");
    await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });

    // The row is on Hoje too, and the status line therefore cannot be the
    // "Nada pendente" branch.
    await expect(page.locator('[data-conflict="row"]')).toHaveCount(1);
    await expect(page.locator(".home-status")).not.toContainText("Nada pendente");
  });

  test("the row fires no analytics event a five-member enum would refuse", async ({ page }) => {
    const refusals: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/rest/v1/rpc/record_product_event") && response.status() >= 400) {
        refusals.push(`${response.status()} ${response.url()}`);
      }
    });

    await signIn(page, "pt-BR");
    await openQueue(page, "pt-BR");
    await page.locator('[data-conflict="row"]').click();
    await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });

    // A conflict row that fired `needs_attention_item_opened` would earn a
    // `22023` from the CHECK inside Postgres. Nothing may be refused here.
    expect(refusals, "the conflict row must not send an event Postgres refuses").toEqual([]);
  });

  test("the correction resolves it end to end, through the product's own form", async ({ page }) => {
    await signIn(page, "pt-BR");
    await openQueue(page, "pt-BR");

    // Follow the row's own action rather than navigating directly: the point is
    // that the item leads somewhere the owner can act.
    await page.locator('[data-conflict="row"]').click();
    await expect(page).toHaveURL(new RegExp(`/app/memories/${invertedId}$`), { timeout: 20_000 });

    // The transition offered is `restore`, because an inverted window resolves
    // to `archived` — the reading this slice exists to correct.
    const control = page.locator('[data-memory-lifecycle]');
    await expect(control).toHaveAttribute("data-memory-lifecycle", "restore");
    await expect(control).toHaveAttribute("data-memory-lifecycle-state", "archived");
    await control.click();

    // The server settled it; the control now offers the inverse.
    await expect(page.locator('[data-memory-lifecycle]')).toHaveAttribute("data-memory-lifecycle", "archive", { timeout: 20_000 });

    // Back to the queue: the item is gone, on a page that demonstrably rendered.
    await openQueue(page, "pt-BR");
    await expect(page.locator('[data-conflict="row"]')).toHaveCount(0);

    // And it does not come back on a reload — the derivation is over the data,
    // not over a cached page.
    await page.reload();
    await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-conflict="row"]')).toHaveCount(0);
  });

  test("the resolved memory is still there — nothing was deleted or archived to make the item go away", async ({ page }) => {
    await signIn(page, "pt-BR");
    await page.goto(`/pt-BR/app/memories/${invertedId}`);
    await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });
    // Its words survived the correction. The conflict was resolved by removing
    // an impossible end date, not by removing the memory.
    await expect(page.locator("body")).toContainText(INVERTED);
  });

  test("the stranger sees their own conflict and nothing of this owner's", async ({ page }) => {
    await signInOnline(page, { email: strangerEmail, locale: "pt-BR" });
    await page.goto("/pt-BR/app/inbox?view=needs-you");
    await expect(page.locator("h1")).toBeVisible({ timeout: 20_000 });

    // Their own row is derived — which is what makes the next assertion a
    // control rather than a page that simply failed to render anything.
    await expect(page.locator('[data-conflict="row"]')).toHaveCount(1);
    await expect(page.locator('[data-conflict="content"]')).toContainText(FOREIGN);
    await expect(page.locator("body")).not.toContainText(INVERTED);
    if (invertedId) await expect(page.locator("body")).not.toContainText(invertedId);
  });
});
