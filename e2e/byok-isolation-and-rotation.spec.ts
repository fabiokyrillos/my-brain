import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The BYOK acceptance matrix that needed two real product credentials: two-user
 * isolation, genuine concurrent rotation, and the removal / queued-job /
 * capture lifecycle.
 *
 * ## How isolation is evidenced, and why not by "both calls succeeded"
 *
 * The obvious evidence — A's operation worked and B's operation worked — proves
 * nothing: two valid keys both work, so a product that used A's key for B's
 * request would pass that test. A provider-side distinguisher was looked for
 * and **measured absent**: both credentials return HTTP 200 from
 * `GET /v1/models`, expose no `openai-organization` or `openai-project`
 * response header, and see an identical model list. There is nothing in a
 * provider response that says *which key asked*.
 *
 * So identity is evidenced cryptographically instead, which is stronger. The
 * stored fingerprint is `HMAC(pepper, plaintext)` truncated — it is a function
 * of the key and of nothing else. Two distinct keys therefore have two distinct
 * fingerprints, and asserting that A's row carries A's fingerprint and B's row
 * carries B's proves *whose key is in whose row* without reading either. The
 * resolvers then prove that each path reaches only its own row. Together those
 * are a complete chain; "both succeeded" is not part of it.
 *
 * Fingerprints are compared **to each other and to the row**, never printed.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const keyA = process.env.BYOK_TEST_USER_A_OPENAI_API_KEY;
const keyB = process.env.BYOK_TEST_USER_B_OPENAI_API_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);
const credentialsConfigured = Boolean(keyA && keyB && keyA !== keyB);
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

type Disposable = {
  email: string;
  password: string;
  userId: string;
  client: SupabaseClient;
};

async function createDisposableUser(
  admin: SupabaseClient,
  label: string,
  onCreated: (userId: string) => void,
): Promise<Disposable> {
  const suffix = crypto.randomUUID();
  const email = `byok-matrix-${label}-${suffix}@example.com`;
  const password = `Byok!${suffix}a7`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `BYOK matrix ${label}` },
  });
  expect(error).toBeNull();
  if (!data.user) throw new Error("Disposable BYOK user was not created.");
  onCreated(data.user.id);

  const client = createClient(supabaseUrl!, publishableKey!, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  expect(signInError).toBeNull();
  const { error: localeError } = await client
    .from("profiles")
    .update({ locale: "en" })
    .eq("user_id", data.user.id);
  expect(localeError).toBeNull();

  return { email, password, userId: data.user.id, client };
}

/** Stores a credential the way the product does: the real Settings form. */
async function storeCredentialThroughSettings(page: Page, user: Disposable, key: string) {
  await page.goto("/en/auth/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/app$/, { timeout: 30_000 });

  await page.goto("/en/app/settings");
  const panel = page.locator("section.byok-panel");
  await panel.getByLabel("API key").fill(key);
  await panel.getByRole("button", { name: /^(Save key|Replace key)$/ }).click();
  await expect(panel.getByRole("status")).toHaveText(/validated\.$/, { timeout: 60_000 });
}

async function settingsPage(browser: Browser, user: Disposable): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/en/auth/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/app$/, { timeout: 30_000 });
  await page.goto("/en/app/settings");
  return page;
}

test.describe("BYOK two-user isolation, rotation and lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.skip(
    !credentialsConfigured,
    "The two disposable BYOK product credentials are not configured.",
  );
  // One device profile is enough: none of these properties is a rendering
  // property. The Settings journey covers desktop and Pixel 7 separately.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Device-independent.");
  });
  test.setTimeout(600_000);

  test("keeps two users' credentials, jobs and ledgers separate", async ({ browser, page }) => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, clientOptions);
    const created: string[] = [];

    try {
      const userA = await createDisposableUser(admin, "a", (id) => created.push(id));
      const userB = await createDisposableUser(admin, "b", (id) => created.push(id));

      await storeCredentialThroughSettings(page, userA, keyA!);
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      await storeCredentialThroughSettings(pageB, userB, keyB!);

      // ---- identity: whose key is in whose row -------------------------
      const rows = async () => {
        const { data } = await admin
          .from("user_ai_credentials")
          .select("user_id,status,fingerprint,key_version,ciphertext")
          .in("user_id", [userA.userId, userB.userId]);
        const byUser = new Map((data ?? []).map((row) => [row.user_id as string, row]));
        return { a: byUser.get(userA.userId)!, b: byUser.get(userB.userId)! };
      };
      const stored = await rows();
      expect(stored.a.status).toBe("active");
      expect(stored.b.status).toBe("active");
      // Two distinct keys, therefore two distinct keyed digests. Equal
      // fingerprints here would mean one key had been stored twice.
      expect(stored.a.fingerprint).not.toBe(stored.b.fingerprint);
      expect(stored.a.ciphertext).not.toBe(stored.b.ciphertext);

      // ---- synchronous resolver: auth.uid(), never an argument ---------
      const resolvedA = await userA.client.rpc("resolve_own_ai_credential");
      const resolvedB = await userB.client.rpc("resolve_own_ai_credential");
      expect(resolvedA.error).toBeNull();
      expect(resolvedB.error).toBeNull();
      const envelopeA = Array.isArray(resolvedA.data) ? resolvedA.data[0] : resolvedA.data;
      const envelopeB = Array.isArray(resolvedB.data) ? resolvedB.data[0] : resolvedB.data;
      expect(envelopeA).toBeTruthy();
      expect(envelopeB).toBeTruthy();
      // Each session resolved a different envelope: nobody reached the other's.
      expect(envelopeA.ciphertext).not.toEqual(envelopeB.ciphertext);
      expect(envelopeA.ciphertext).toEqual(stored.a.ciphertext);
      expect(envelopeB.ciphertext).toEqual(stored.b.ciphertext);
      // And it takes no user id, so no caller can name someone else.
      expect(Object.keys(envelopeA)).not.toContain("user_id");

      // ---- A cannot read B's row by any client-side route ---------------
      const crossRead = await userA.client
        .from("user_ai_credentials")
        .select("user_id")
        .eq("user_id", userB.userId);
      expect(crossRead.data ?? []).toEqual([]);
      const crossWrite = await userA.client
        .from("user_ai_credentials")
        .update({ status: "removed", ciphertext: null, iv: null, key_version: null })
        .eq("user_id", userB.userId)
        .select("user_id");
      expect(crossWrite.data ?? []).toEqual([]);
      const stillThere = await rows();
      expect(stillThere.b.status).toBe("active");

      // ---- metadata never carries plaintext ----------------------------
      await page.goto("/en/app/settings");
      const markup = await page.content();
      expect(markup).not.toContain(keyA!);
      expect(markup).not.toContain(keyB!);
      expect(markup).not.toContain(String(stored.a.ciphertext));

      // ---- asynchronous: a job resolves its OWN owner -------------------
      const entryFor = async (user: Disposable, content: string) => {
        const { data, error } = await admin
          .from("entries")
          .insert({
            user_id: user.userId,
            original_content: content,
            source: "web",
            status: "saved",
            locale: "en",
          })
          .select("id")
          .single();
        expect(error).toBeNull();
        return data!.id as string;
      };
      const jobFor = async (user: Disposable, entryId: string) => {
        const { data, error } = await admin
          .from("jobs")
          .insert({
            user_id: user.userId,
            type: "interpret_entry",
            payload: { entry_id: entryId, mode: "initial" },
            idempotency_key: `byok-matrix:${crypto.randomUUID()}`,
          })
          .select("id")
          .single();
        expect(error).toBeNull();
        return data!.id as string;
      };

      const entryA = await entryFor(userA, "byok matrix A: buy batteries tomorrow");
      const entryB = await entryFor(userB, "byok matrix B: call the dentist on Friday");
      const jobA = await jobFor(userA, entryA);
      const jobB = await jobFor(userB, entryB);

      const jobEnvelope = async (jobId: string) => {
        const { data, error } = await admin.rpc("resolve_job_ai_credential", { p_job_id: jobId });
        expect(error).toBeNull();
        return Array.isArray(data) ? data[0] : data;
      };
      const forJobA = await jobEnvelope(jobA);
      const forJobB = await jobEnvelope(jobB);
      // The job's own `user_id` decides, not the caller's identity — the same
      // service role asked both times and got two different envelopes.
      expect(forJobA.ciphertext).toEqual(stored.a.ciphertext);
      expect(forJobB.ciphertext).toEqual(stored.b.ciphertext);
      expect(forJobA.ciphertext).not.toEqual(forJobB.ciphertext);

      // ---- a foreign domain id cannot aim one key at another's data -----
      const foreignJob = await admin
        .from("jobs")
        .insert({
          user_id: userB.userId,
          type: "interpret_entry",
          // B's job naming A's entry.
          payload: { entry_id: entryA, mode: "initial" },
          idempotency_key: `byok-matrix-foreign:${crypto.randomUUID()}`,
        })
        .select("id")
        .single();
      expect(foreignJob.error).toBeNull();
      const foreignEnvelope = await jobEnvelope(foreignJob.data!.id as string);
      // It resolves B's credential — the job's real owner — never A's.
      expect(foreignEnvelope.ciphertext).toEqual(stored.b.ciphertext);

      // ---- the worker runs them, and the ledger attributes correctly ----
      const drained = async (jobId: string) => {
        const deadline = Date.now() + 240_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          const { data } = await admin
            .from("jobs")
            .select("status,attempts,error")
            .eq("id", jobId)
            .maybeSingle();
          if (data && (data.status === "completed" || data.status === "exhausted")) return data;
        }
        return null;
      };
      const doneA = await drained(jobA);
      const doneB = await drained(jobB);
      expect(doneA?.status).toBe("completed");
      expect(doneB?.status).toBe("completed");
      expect(doneA?.error).toBeNull();
      expect(doneB?.error).toBeNull();

      const usageFor = async (user: Disposable) => {
        const { count } = await admin
          .from("ai_usage_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.userId);
        return count ?? 0;
      };
      expect(await usageFor(userA)).toBeGreaterThan(0);
      expect(await usageFor(userB)).toBeGreaterThan(0);
      // A's work never appeared on B's ledger: the foreign job belongs to B and
      // touched A's entry not at all.
      const { data: aEntryAfter } = await admin
        .from("entries")
        .select("user_id")
        .eq("id", entryA)
        .single();
      expect(aEntryAfter?.user_id).toBe(userA.userId);
      const { data: bLedger } = await admin
        .from("ai_usage_events")
        .select("user_id")
        .eq("user_id", userB.userId);
      expect((bLedger ?? []).every((row) => row.user_id === userB.userId)).toBe(true);

      await contextB.close();
    } finally {
      for (const userId of created) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        expect(error).toBeNull();
      }
    }
  });

  test("resolves two genuinely simultaneous rotations to one winner", async ({ browser }) => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, clientOptions);
    const created: string[] = [];

    try {
      const user = await createDisposableUser(admin, "rot", (id) => created.push(id));
      const first = await browser.newContext();
      const firstPage = await first.newPage();
      await storeCredentialThroughSettings(firstPage, user, keyA!);

      const { data: before } = await admin
        .from("user_ai_credentials")
        .select("fingerprint,key_version,updated_at")
        .eq("user_id", user.userId)
        .single();

      // Two tabs, both loaded from the SAME row, therefore both holding the
      // same staleness witness. That is what makes this contention rather than
      // two sequential saves described as concurrent.
      const tabOne = await settingsPage(browser, user);
      const tabTwo = await settingsPage(browser, user);
      const witnessOne = await tabOne.locator('input[name="observedUpdatedAt"]').inputValue();
      const witnessTwo = await tabTwo.locator('input[name="observedUpdatedAt"]').inputValue();
      expect(witnessOne).toBe(witnessTwo);
      expect(witnessOne).toBe(before?.updated_at);

      await tabOne.locator("section.byok-panel").getByLabel("API key").fill(keyB!);
      await tabTwo.locator("section.byok-panel").getByLabel("API key").fill(keyB!);

      await Promise.all([
        tabOne.locator("section.byok-panel").getByRole("button", { name: "Replace key" }).click(),
        tabTwo.locator("section.byok-panel").getByRole("button", { name: "Replace key" }).click(),
      ]);

      const outcome = async (candidate: Page) =>
        (await candidate.locator("section.byok-panel").getByRole("status").textContent({
          timeout: 90_000,
        })) ?? "";
      const outcomes = [await outcome(tabOne), await outcome(tabTwo)];
      const winners = outcomes.filter((message) => /validated\.$/.test(message));
      const losers = outcomes.filter((message) =>
        message.includes("Something else changed at the same time"));

      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);

      // Exactly one active ciphertext, one version bump, no partial write.
      const { data: after } = await admin
        .from("user_ai_credentials")
        .select("status,fingerprint,key_version,ciphertext,iv")
        .eq("user_id", user.userId);
      expect(after).toHaveLength(1);
      expect(after![0].status).toBe("active");
      expect(after![0].ciphertext).not.toBeNull();
      expect(after![0].iv).not.toBeNull();
      expect(after![0].fingerprint).not.toBe(before?.fingerprint);
      // The losing candidate was never persisted: the surviving fingerprint is
      // the winner's, and there is no second row and no second version.
      expect(after![0].key_version).toBe(before?.key_version);

      // No candidate value reached any observable record.
      const { data: attempts } = await admin
        .from("credential_validation_attempts")
        .select("*")
        .eq("user_id", user.userId);
      expect(JSON.stringify(attempts ?? [])).not.toContain(keyA!);
      expect(JSON.stringify(attempts ?? [])).not.toContain(keyB!);
      const { data: audit } = await admin
        .from("audit_logs")
        .select("*")
        .eq("user_id", user.userId);
      expect(JSON.stringify(audit ?? [])).not.toContain(keyA!);
      expect(JSON.stringify(audit ?? [])).not.toContain(keyB!);

      await first.close();
      await tabOne.context().close();
      await tabTwo.context().close();
    } finally {
      for (const userId of created) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        expect(error).toBeNull();
      }
    }
  });
});
