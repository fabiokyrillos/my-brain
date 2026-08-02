import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The removal, queued-job and capture-lifecycle gates, with a **real** product
 * credential on a disposable account.
 *
 * These were previously exercised with synthetic ciphertext, which proves the
 * fail-closed path and nothing about a working credential. Here the same
 * transitions run with a credential the deployed worker can actually decrypt
 * and authenticate, so "removal blocks work" is measured against a baseline of
 * work that genuinely succeeded.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const keyA = process.env.BYOK_TEST_USER_A_OPENAI_API_KEY;
const keyB = process.env.BYOK_TEST_USER_B_OPENAI_API_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);
const credentialsConfigured = Boolean(keyA && keyB && keyA !== keyB);
const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

/** `PENDING_ENTRY_BATCH_LIMIT` in `src/features/byok/pending-entries.ts`. */
const PENDING_BATCH_LIMIT = 25;

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
  const email = `byok-lifecycle-${label}-${suffix}@example.com`;
  const password = `Byok!${suffix}a7`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `BYOK lifecycle ${label}` },
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

async function signIn(page: Page, user: Disposable) {
  await page.goto("/en/auth/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/app$/, { timeout: 30_000 });
}

function panel(page: Page) {
  return page.locator("section.byok-panel");
}

async function saveCredential(page: Page, key: string) {
  await page.goto("/en/app/settings");
  await panel(page).getByLabel("API key").fill(key);
  await panel(page).getByRole("button", { name: /^(Save key|Replace key)$/ }).click();
  await expect(panel(page).getByRole("status")).toHaveText(/validated\.$/, { timeout: 60_000 });
}

async function removeCredential(page: Page) {
  await page.goto("/en/app/settings");
  page.once("dialog", (dialog) => dialog.accept());
  await panel(page).getByRole("button", { name: "Remove key" }).click();
  await expect(panel(page).getByRole("status")).toHaveText("Key removed.", { timeout: 60_000 });
}

test.describe("BYOK removal, queued jobs and capture lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.skip(
    !credentialsConfigured,
    "The two disposable BYOK product credentials are not configured.",
  );
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Device-independent.");
  });
  test.setTimeout(600_000);

  test("gates synchronous and queued work on the credential, and only that account", async ({
    browser,
    page,
  }) => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, clientOptions);
    const created: string[] = [];

    try {
      const user = await createDisposableUser(admin, "main", (id) => created.push(id));
      const bystander = await createDisposableUser(admin, "bystander", (id) => created.push(id));
      await signIn(page, user);

      const bystanderContext = await browser.newContext();
      const bystanderPage = await bystanderContext.newPage();
      await signIn(bystanderPage, bystander);
      await saveCredential(bystanderPage, keyB!);

      // ---- capture with no credential ---------------------------------
      const captureAs = async (owner: Disposable, content: string) => {
        const { data, error } = await owner.client.rpc("capture_entry_async", {
          p_original_content: content,
          p_locale: "en",
          p_source: "web",
          p_idempotency_key: `byok-lifecycle-${crypto.randomUUID()}`,
        });
        expect(error).toBeNull();
        return data as { entry_id: string; status: string; replayed: boolean };
      };

      const uncredentialed = await captureAs(user, "byok lifecycle: no key yet, buy milk");
      expect(uncredentialed.status).toBe("saved");
      const { data: storedEntry } = await admin
        .from("entries")
        .select("status")
        .eq("id", uncredentialed.entry_id)
        .single();
      expect(storedEntry?.status).toBe("awaiting_ai_configuration");
      const { data: noJobs } = await admin
        .from("jobs")
        .select("id")
        .eq("user_id", user.userId);
      expect(noJobs ?? []).toEqual([]);

      // ---- activating a key must not start anything by itself ---------
      await saveCredential(page, keyA!);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const { data: stillNoJobs } = await admin
        .from("jobs")
        .select("id")
        .eq("user_id", user.userId);
      expect(stillNoJobs ?? []).toEqual([]);
      const { data: stillPending } = await admin
        .from("entries")
        .select("status")
        .eq("id", uncredentialed.entry_id)
        .single();
      expect(stillPending?.status).toBe("awaiting_ai_configuration");

      // ---- explicit bounded processing, with an exact count ------------
      await page.goto("/en/app/settings");
      await expect(panel(page).getByText("Records awaiting interpretation")).toBeVisible();
      await expect(panel(page).locator(".byok-pending-count")).toHaveText("1");
      await panel(page).getByRole("button", { name: "Interpret pending records" }).click();
      await expect(panel(page).getByText("1 record(s) queued for interpretation.")).toBeVisible({
        timeout: 60_000,
      });
      const { data: queued } = await admin
        .from("jobs")
        .select("id,type,status")
        .eq("user_id", user.userId);
      expect(queued).toHaveLength(1);
      expect(queued![0].type).toBe("interpret_entry");

      // Pressing it again must not duplicate the job.
      await page.goto("/en/app/settings");
      if (await panel(page).getByRole("button", { name: "Interpret pending records" }).count()) {
        await panel(page).getByRole("button", { name: "Interpret pending records" }).click();
        await expect(panel(page).getByRole("status")).toBeVisible({ timeout: 60_000 });
      }
      const { data: afterSecondPress } = await admin
        .from("jobs")
        .select("id")
        .eq("user_id", user.userId);
      expect((afterSecondPress ?? []).length).toBeLessThanOrEqual(1);

      // ---- the credentialed job actually completes ---------------------
      const drain = async (jobId: string) => {
        const deadline = Date.now() + 240_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
          const { data } = await admin
            .from("jobs")
            .select("status,attempts,error")
            .eq("id", jobId)
            .maybeSingle();
          if (!data) return null;
          if (data.status === "completed" || data.status === "exhausted") return data;
        }
        return null;
      };
      const completed = await drain(queued![0].id as string);
      expect(completed?.status).toBe("completed");
      expect(completed?.error).toBeNull();

      // ---- queued rotation: execution uses the credential in force -----
      const rotationEntry = await captureAs(user, "byok lifecycle: rotate under me");
      const { data: rotationJob } = await admin
        .from("jobs")
        .select("id,payload")
        .eq("user_id", user.userId)
        .contains("payload", { entry_id: rotationEntry.entry_id })
        .single();
      expect(rotationJob).not.toBeNull();
      // The payload carries an entry id and a mode — never key material.
      expect(Object.keys(rotationJob!.payload as object).sort()).toEqual(["entry_id", "mode"]);
      expect(JSON.stringify(rotationJob!.payload)).not.toContain(keyA!);

      await saveCredential(page, keyB!);
      const { data: rotated } = await admin
        .from("user_ai_credentials")
        .select("ciphertext")
        .eq("user_id", user.userId)
        .single();
      const rotationOutcome = await drain(rotationJob!.id as string);
      expect(rotationOutcome?.status).toBe("completed");
      // The job resolves the row live, so it ran on the rotated credential and
      // never carried a copy of the replaced one.
      const { data: jobRow } = await admin
        .from("jobs")
        .select("*")
        .eq("id", rotationJob!.id as string)
        .maybeSingle();
      expect(JSON.stringify(jobRow ?? {})).not.toContain(String(rotated?.ciphertext));

      // ---- queued work while the credential is removed -----------------
      const strandedEntry = await captureAs(user, "byok lifecycle: removed before I ran");
      const { data: strandedJob } = await admin
        .from("jobs")
        .select("id")
        .eq("user_id", user.userId)
        .contains("payload", { entry_id: strandedEntry.entry_id })
        .single();
      expect(strandedJob).not.toBeNull();

      const ledgerBefore = async (owner: Disposable) => {
        const { count } = await admin
          .from("ai_usage_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", owner.userId);
        return count ?? 0;
      };
      const usageBeforeRemoval = await ledgerBefore(user);

      await removeCredential(page);
      const { data: removedRow } = await admin
        .from("user_ai_credentials")
        .select("status,ciphertext,iv")
        .eq("user_id", user.userId)
        .single();
      expect(removedRow?.status).toBe("removed");
      expect(removedRow?.ciphertext).toBeNull();

      // A full drain window: the job must stay pending, unclaimed and unburned.
      await new Promise((resolve) => setTimeout(resolve, 90_000));
      const { data: stranded } = await admin
        .from("jobs")
        .select("status,attempts,error")
        .eq("id", strandedJob!.id as string)
        .single();
      expect(stranded?.status).toBe("pending");
      expect(stranded?.attempts).toBe(0);
      expect(stranded?.error).toBeNull();
      expect(await ledgerBefore(user)).toBe(usageBeforeRemoval);

      // ---- synchronous work is gated immediately -----------------------
      await page.goto("/en/app/settings");
      await expect(panel(page).getByText("No key configured")).toBeVisible();
      await expect(
        panel(page).getByRole("button", { name: "Interpret pending records" }),
      ).toHaveCount(0);

      // ---- the bystander is untouched throughout -----------------------
      const { data: bystanderRow } = await admin
        .from("user_ai_credentials")
        .select("status,ciphertext")
        .eq("user_id", bystander.userId)
        .single();
      expect(bystanderRow?.status).toBe("active");
      expect(bystanderRow?.ciphertext).not.toBeNull();

      // ---- reconfiguration restores only this account ------------------
      await saveCredential(page, keyA!);
      const recovered = await drain(strandedJob!.id as string);
      expect(recovered?.status).toBe("completed");
      expect(await ledgerBefore(user)).toBeGreaterThan(usageBeforeRemoval);

      await bystanderContext.close();
    } finally {
      for (const userId of created) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        expect(error).toBeNull();
      }
    }
  });

  test("bounds explicit processing at the declared maximum and says so", async ({ page }) => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, clientOptions);
    const created: string[] = [];

    try {
      const user = await createDisposableUser(admin, "bounded", (id) => created.push(id));
      await signIn(page, user);

      // One more than the ceiling, stored directly: this test is about the
      // bound, and driving 26 captures through the UI would measure nothing
      // extra while taking minutes.
      const rows = Array.from({ length: PENDING_BATCH_LIMIT + 1 }, (_, index) => ({
        user_id: user.userId,
        original_content: `byok bounded fixture ${index}`,
        source: "web",
        status: "awaiting_ai_configuration",
        locale: "en",
      }));
      const { error: seedError } = await admin.from("entries").insert(rows);
      expect(seedError).toBeNull();

      await saveCredential(page, keyA!);
      await page.goto("/en/app/settings");
      // The displayed count is the real number, capped by
      // `PENDING_ENTRY_COUNT_CEILING` (500) — a different constant from the
      // per-invocation batch limit. 26 pending shows as 26, not as "25+".
      await expect(panel(page).locator(".byok-pending-count")).toHaveText(
        String(PENDING_BATCH_LIMIT + 1),
      );

      await panel(page).getByRole("button", { name: "Interpret pending records" }).click();
      // The partial message, because "done" after 25 of 26 would be false by
      // omission.
      await expect(
        panel(page).getByText(
          `${PENDING_BATCH_LIMIT} record(s) queued for interpretation. More are still pending`,
          { exact: false },
        ),
      ).toBeVisible({ timeout: 120_000 });

      const { count } = await admin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.userId);
      expect(count).toBe(PENDING_BATCH_LIMIT);
    } finally {
      for (const userId of created) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        expect(error).toBeNull();
      }
    }
  });
});
