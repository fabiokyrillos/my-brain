import { expect, test, type Page } from "@playwright/test";

import { attemptOnlineSession, signInOnline } from "./support/online-session";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

/**
 * SH.3 deployed acceptance — suspension, the operator boundary, and the way
 * back (SH-ADMIN-001..006, SH-WORKER-003/004/005, SH-COPY-002).
 *
 * ## What "suspended" has to mean, to be worth anything
 *
 * Not "the routes redirect". A suspension that only hides the UI is a
 * suspension an attacker with a valid JWT walks straight through, and the
 * threat model says so. So this journey pins four independent surfaces at once:
 * the rendered product, the direct RPC path PostgREST exposes, the job worker,
 * and the heartbeat. Each is checked while suspended and again after
 * reactivation, because a gate that never reopens is an outage, not a control.
 *
 * ## The fixture survives the run on purpose
 *
 * Reactivation has to be provable, so the account is reactivated and its data
 * compared to the pre-suspension census. The last assertion of the journey is
 * that suspension cost the account nothing — SH-ADMIN-004's claim that
 * suspension is reversible and lossless is exactly the kind of claim that is
 * assumed rather than measured.
 *
 * The operator CLI is driven as a subprocess rather than reimplemented: the
 * point is to drill the surface an operator actually uses, including its
 * dry-run-by-default posture.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const LOCALE = "pt-BR";
const COPY = {
  emailLabel: "E-mail",
  passwordLabel: "Senha",
  signIn: "Entrar",
  suspendedTitle: "Conta suspensa",
};

test.describe("SH.3 — suspension and reactivation on the deployed project", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");

  const email = `sh3-journey-${crypto.randomUUID()}@mybrain.com`;
  const password = `Sh3!${crypto.randomUUID()}a7`;
  let userId = "";
  let accessToken = "";
  let jobId = "";
  let censusWhileActive = "";
  let initialAttempts = 0;

  const admin = () =>
    createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  const asUser = () =>
    createClient(supabaseUrl!, publishableKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

  /** The operator CLI, as an operator runs it. */
  function cli(...args: string[]): string {
    return execFileSync(process.execPath, ["scripts/account-lifecycle-admin.mjs", ...args], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
  }

  async function lifecycleRow() {
    const { data } = await admin()
      .from("account_lifecycle")
      .select("status,reason_code,changed_by")
      .eq("user_id", userId)
      .maybeSingle();
    return data as { status: string; reason_code: string; changed_by: string } | null;
  }

  async function jobRow() {
    const { data } = await admin()
      .from("jobs")
      .select("id,status,attempts,error,type")
      .eq("id", jobId)
      .maybeSingle();
    return data as
      | { id: string; status: string; attempts: number; error: string | null; type: string }
      | null;
  }

  async function census() {
    const { data } = await admin().rpc("account_owned_row_counts", { p_user_id: userId });
    return JSON.stringify(data ?? {});
  }

  /** One tick of the deployed worker against this exact job. */
  async function workerTick() {
    const response = await fetch(`${supabaseUrl}/functions/v1/process-jobs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: publishableKey!,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    });
    return { status: response.status, body: await response.text() };
  }

  // Not the login form: hosted CAPTCHA refuses automated password sign-in, and
  // the destination is deliberately not asserted — a suspended account belongs
  // on `/account-state`, which is the whole point of this journey.
  async function signIn(page: Page) {
    await signInOnline(page, { email, locale: LOCALE, assertDestination: false });
  }

  /** The link exchange, aimed at this account. */
  const attempt = () =>
    attemptOnlineSession({
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
    });

  test.beforeAll(async () => {
    const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;

    // `signInWithPassword` is refused by hosted CAPTCHA (`400 captcha_failed`)
    // for every client, so the user token comes from the admin link exchange.
    const opened = await attempt();
    expect(opened.ok, opened.ok ? "" : `session refused at ${opened.stage}: ${opened.body}`).toBe(true);
    accessToken = (opened as { accessToken: string }).accessToken;

    for (const document of ["terms", "privacy"]) {
      const { error } = await asUser().rpc("record_policy_acceptance", {
        p_document: document,
        p_surface: "interposition",
      });
      expect(error).toBeNull();
    }

    // Representative product data.
    const { error: captureError } = await asUser().rpc("capture_entry_async", {
      p_idempotency_key: crypto.randomUUID(),
      p_locale: LOCALE,
      p_original_content: "Reunião com o time de produto na quinta às 15h",
      p_source: "web",
    });
    expect(captureError).toBeNull();

    // A valid pending job, created exactly the way the upload surface creates
    // one: the user's own client, so RLS is the thing that let it through.
    const path = `${userId}/${crypto.randomUUID()}-suspension-fixture.txt`;
    const upload = await asUser()
      .storage.from("user-files")
      .upload(path, new Blob(["suspension journey fixture"], { type: "text/plain" }), {
        contentType: "text/plain",
      });
    expect(upload.error).toBeNull();

    const attachment = await asUser()
      .from("attachments")
      .insert({
        user_id: userId,
        storage_path: path,
        original_name: "suspension-fixture.txt",
        mime_type: "text/plain",
        size_bytes: 26,
        status: "uploaded",
      })
      .select("id")
      .single();
    expect(attachment.error).toBeNull();

    const job = await asUser()
      .from("jobs")
      .insert({
        user_id: userId,
        type: "process_attachment",
        payload: { attachment_id: attachment.data!.id },
        idempotency_key: `attachment:${attachment.data!.id}:process:v1`,
      })
      .select("id")
      .single();
    expect(job.error).toBeNull();
    jobId = job.data!.id;

    censusWhileActive = await census();
  });

  test.afterAll(async () => {
    if (!userId) return;
    // Storage FIRST, then the auth row — the executor's ordering, for the
    // executor's reason: `deleteUser` cascades database rows and leaves object
    // storage untouched. Getting this backwards is exactly how the six
    // historical orphans in SH_DELETE_015_ORPHAN_MANIFEST.md were created, and
    // this spec uploads a fixture object, so a teardown that deleted the user
    // first would manufacture a new orphan on every run.
    const { data: objects } = await admin().storage.from("user-files").list(userId, { limit: 100 });
    if (objects?.length) {
      await admin()
        .storage.from("user-files")
        .remove(objects.map((object) => `${userId}/${object.name}`))
        .catch(() => undefined);
    }
    await admin().auth.admin.deleteUser(userId).catch(() => undefined);
  });

  test("1-3 — the CLI is dry-run by default, and suspension reads back exactly", async () => {
    // The queued job exists and is clean before anything happens.
    const initial = await jobRow();
    expect(initial?.status).toBe("pending");
    expect(initial?.error).toBeNull();
    initialAttempts = initial!.attempts;

    // Dry run first: the posture that makes a typo survivable.
    const dry = cli("--suspend", "--email", email, "--reason", "operator_suspension_abuse");
    expect(dry).toContain("DRY RUN");
    expect(dry).toContain("Re-run with --apply");
    expect((await lifecycleRow())?.status).toBe("active");

    const applied = cli(
      "--suspend",
      "--email",
      email,
      "--reason",
      "operator_suspension_abuse",
      "--apply",
    );
    expect(applied).toContain("after:");
    expect(applied).toContain("suspended");
    // The CLI must not echo the email it was handed back into the transcript.
    expect(applied).not.toContain(email);

    const row = await lifecycleRow();
    expect(row?.status).toBe("suspended");
    expect(row?.reason_code).toBe("operator_suspension_abuse");
    expect(row?.changed_by).toBe("operator");
  });

  test("4-5 — the product shows only the suspended surface, and the direct RPC refuses", async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { name: COPY.suspendedTitle })).toBeVisible({
      timeout: 30_000,
    });

    // Deep links are not a way around it.
    for (const route of ["app", "app/tasks", "app/chat", "app/settings"]) {
      await page.goto(`/${LOCALE}/${route}`);
      await expect(page.getByRole("heading", { name: COPY.suspendedTitle })).toBeVisible({
        timeout: 20_000,
      });
    }

    // The PostgREST path, which no amount of route blocking covers.
    const write = await asUser().rpc("capture_entry_async", {
      p_idempotency_key: crypto.randomUUID(),
      p_locale: LOCALE,
      p_original_content: "escrita durante suspensão",
      p_source: "web",
    });
    expect(write.error).not.toBeNull();
    expect(write.error!.message).toContain("Account lifecycle");
  });

  test("6-8 — the worker skips the job across two ticks and the heartbeat does not run", async () => {
    const heartbeatBefore = await admin()
      .from("heartbeat_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    for (const tick of [1, 2]) {
      const result = await workerTick();
      expect(result.status, `tick ${tick} must not claim the job`).toBe(409);

      const row = await jobRow();
      expect(row?.status, `tick ${tick} leaves the job pending`).toBe("pending");
      // The job is deferred, not failed: a skipped job that recorded an error
      // would burn its retry budget for something the owner did not do.
      expect(row?.error, `tick ${tick} writes no error`).toBeNull();
      expect(row?.attempts, `tick ${tick} spends no attempt`).toBe(initialAttempts);
    }

    // The heartbeat carries the same predicate (SH-WORKER-005).
    const beat = await admin().rpc("run_user_heartbeat", { p_user_id: userId });
    const beatText = JSON.stringify(beat.data ?? beat.error ?? {});
    expect(beatText).not.toContain('"sent":true');

    const heartbeatAfter = await admin()
      .from("heartbeat_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(heartbeatAfter.count ?? 0).toBe(heartbeatBefore.count ?? 0);

    const { count: notificationCount } = await admin()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(notificationCount ?? 0).toBe(0);
  });

  test("9 — the provider-side sign-in ban is applied and reads back", async () => {
    const banned = await admin().auth.admin.updateUserById(userId, { ban_duration: "24h" });
    expect(banned.error).toBeNull();

    const { data } = await admin().auth.admin.getUserById(userId);
    const bannedUntil = (data?.user as { banned_until?: string } | undefined)?.banned_until;
    expect(bannedUntil, "banned_until must be readable back").toBeTruthy();

    // A banned account cannot obtain a fresh session at all — this is the half
    // of suspension the database cannot enforce, and the reason the runbook has
    // a provider-side step.
    //
    // Asserted through the **link exchange**, not `signInWithPassword`. Since
    // SH.5 the password grant answers `400 captcha_failed` for every account,
    // banned or not, so an assertion on "sign-in returns an error" would have
    // been satisfied by the CAPTCHA rather than by the ban — a control that
    // cannot fail. The exchange below is the same path the whole online suite
    // uses to succeed, which is exactly why its refusal here means something.
    const refused = await attempt();
    expect(refused.ok, "a banned account must not be able to open a session").toBe(false);
  });

  test("10-14 — reactivation restores the account, the job, and nothing else", async () => {
    const reactivated = cli(
      "--reactivate",
      "--id",
      userId,
      "--reason",
      "operator_reactivation",
      "--apply",
    );
    expect(reactivated).toContain("active");
    expect((await lifecycleRow())?.status).toBe("active");

    // 11 — the provider-side ban is lifted as its own step.
    const unbanned = await admin().auth.admin.updateUserById(userId, { ban_duration: "none" });
    expect(unbanned.error).toBeNull();

    // The positive half of the same control: with the ban lifted, the exchange
    // that was refused a moment ago succeeds.
    const reopened = await attempt();
    expect(reopened.ok, reopened.ok ? "" : `session still refused at ${reopened.stage}: ${reopened.body}`).toBe(true);
    accessToken = (reopened as { accessToken: string }).accessToken;

    // 12 — the SAME job becomes claimable. No re-enqueue: the id is unchanged
    // and no second job row appeared for this owner.
    const before = await jobRow();
    expect(before?.status).toBe("pending");

    const tick = await workerTick();
    expect(tick.status, "the lifecycle gate no longer refuses the claim").not.toBe(409);

    const after = await jobRow();
    expect(after?.id).toBe(jobId);
    expect(after?.status, "the job left the queue by being claimed").not.toBe("pending");

    const { data: allJobs } = await admin().from("jobs").select("id").eq("user_id", userId);
    expect((allJobs ?? []).length, "no re-enqueue").toBe(1);

    // 13 — reactivation must not replay the quiet period.
    const { count: notificationCount } = await admin()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(notificationCount ?? 0, "no retroactive reminder burst").toBe(0);

    // 14 — suspension cost the account nothing. The job's own row moved, which
    // is the point of step 12, so it is excluded from the comparison.
    const now = JSON.parse(await census()) as Record<string, number>;
    const then = JSON.parse(censusWhileActive) as Record<string, number>;
    for (const table of Object.keys(then)) {
      if (table === "jobs" || table === "audit_logs") continue;
      expect(now[table], `${table} unchanged across suspension`).toBe(then[table]);
    }
  });
});
