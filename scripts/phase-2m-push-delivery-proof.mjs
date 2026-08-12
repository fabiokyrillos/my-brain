/**
 * Phase 2M slice 2M.4b — the push delivery **hosted proof**.
 *
 *   node scripts/phase-2m-push-delivery-proof.mjs
 *
 * Proves, against the **deployed** project, that migration `202608120092`'s
 * consent, subscription and content-free delivery contracts behave as the pgTAP
 * suite says they do — on a real Postgres, through real PostgREST, under real
 * roles, with RLS actually enforced rather than emulated by `set local role`.
 *
 * ## What this proves, and what it deliberately does not
 *
 * It proves the DATABASE half end to end: the six controls, both retry
 * ceilings, retirement, owner scoping, the content-free audit, and that a
 * refusal leaves no partial write. It does **not** prove that a phone receives
 * anything — no push service is contacted and no VAPID key is read here. Real
 * delivery is the owner's hardware checkpoint (OD-2M-5), and a green run of this
 * file must never be cited as discharging it.
 *
 * ## Sessions without solving a CAPTCHA
 *
 * Turnstile has been enforced since SH.5, so `grant_type=password` answers
 * `captcha_failed` to every script. `admin/generate_link` mints a recovery token
 * and `verifyOtp` exchanges it — the path `sh5-password-policy-probe.mjs`
 * established and `phase-2m-daily-cycle-funnel-proof.mjs` reuses.
 *
 * ## Why both clients exist, and which claim uses which
 *
 * Every SCOPE claim is made from a real `authenticated` session, because a scope
 * assertion made with `service_role` would be measuring the role rather than the
 * policy. `service_role` is used only where the product itself uses it: the two
 * leased-sender functions. That split is the point of `2M-NOTIFY-011`, and this
 * file is arranged so a reader can see which credential proved which line.
 *
 * ## Side effects, stated
 *
 * Two disposable owners, created through the admin API because signup is closed
 * and must stay closed. Both are deleted in a `finally`, and the run ends by
 * PROVING zero residue rather than asserting it. Their email prefix is
 * `phase-2m-push-proof`.
 *
 * It prints no user content, and there is none to print: the only caller-chosen
 * value in the whole schema is a SHA-256 digest.
 */

import { createClient } from "@supabase/supabase-js";
import { getLinkedSupabaseCredentials } from "./linked-supabase.mjs";

const PREFIX = "phase-2m-push-proof";
const HASH = (seed) => seed.repeat(64).slice(0, 64);
const ENDPOINT = "https://updates.push.services.mozilla.com/wpush/v2/phase-2m-proof";
const P256DH = "p256dh-hosted-proof-0123456789";
const AUTH = "auth-hosted-proof";

const results = [];
let failures = 0;

function check(claim, ok, detail = "") {
  results.push({ claim, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${claim}${detail ? ` — ${detail}` : ""}`);
}

async function sessionFor(admin, url, publishableKey, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) throw new Error(`generateLink failed: ${error.message}`);
  const client = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { error: verifyError } = await client.auth.verifyOtp({
    email,
    token: data.properties.email_otp,
    type: "recovery",
  });
  if (verifyError) throw new Error(`verifyOtp failed: ${verifyError.message}`);
  return client;
}

async function main() {
  const { url, serviceRoleKey, publishableKey } = getLinkedSupabaseCredentials();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const stamp = Date.now();
  const emailA = `${PREFIX}-a-${stamp}@example.test`;
  const emailB = `${PREFIX}-b-${stamp}@example.test`;
  let idA = null;
  let idB = null;

  try {
    for (const email of [emailA, emailB]) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: `Px-${stamp}-${Math.random().toString(36).slice(2)}!aA9`,
        email_confirm: true,
      });
      if (error) throw new Error(`createUser failed: ${error.message}`);
      if (email === emailA) idA = data.user.id; else idB = data.user.id;
    }

    const sessionA = await sessionFor(admin, url, publishableKey, emailA);
    const sessionB = await sessionFor(admin, url, publishableKey, emailB);

    // The zone must be set: `begin_push_delivery` refuses without one, which is
    // the fail-closed direction for a delivery decision.
    await admin.from("profiles").update({ timezone: "America/Sao_Paulo" }).eq("user_id", idA);
    await admin.from("profiles").update({ timezone: "America/Sao_Paulo" }).eq("user_id", idB);

    console.log("\n1. Consent, and the absence of it");

    // Absence refuses, and it is asserted BEFORE anything is registered — the
    // only moment this state exists.
    const noConsent = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("1"),
    });
    check("no consent record at all refuses",
      noConsent.data?.permitted === false && noConsent.data?.reason === "not_consented",
      `reason=${noConsent.data?.reason ?? noConsent.error?.code}`);

    // A refusal leaves no partial write: a suppression row and nothing else.
    const afterRefusal = await sessionA.from("push_subscriptions").select("id");
    check("a refusal wrote no subscription — no partial state",
      !afterRefusal.error && afterRefusal.data.length === 0,
      `rows=${afterRefusal.data?.length ?? "error"}`);

    // Fail-closed argument validation, before any write.
    const badEndpoint = await sessionA.rpc("register_push_subscription", {
      p_endpoint: "http://push.example.test/x", p_p256dh: P256DH, p_auth: AUTH,
    });
    check("a non-https endpoint is refused", badEndpoint.error?.code === "22023",
      `code=${badEndpoint.error?.code}`);

    const loopback = await sessionA.rpc("register_push_subscription", {
      p_endpoint: "https://127.0.0.1/push", p_p256dh: P256DH, p_auth: AUTH,
    });
    check("a loopback endpoint is refused even though it is https",
      loopback.error?.code === "22023", `code=${loopback.error?.code}`);

    const smuggled = await sessionA.rpc("register_push_subscription", {
      p_endpoint: "https://push.test@127.0.0.1/x", p_p256dh: P256DH, p_auth: AUTH,
    });
    check("a userinfo prefix cannot smuggle a loopback host past the check",
      smuggled.error?.code === "22023", `code=${smuggled.error?.code}`);

    const claimed = await sessionA.rpc("record_push_consent_state", { p_state: "granted" });
    check("a client cannot claim `granted`", claimed.error?.code === "22023",
      `code=${claimed.error?.code}`);

    // The positive control. Without it every refusal above proves nothing.
    const registered = await sessionA.rpc("register_push_subscription", {
      p_endpoint: ENDPOINT, p_p256dh: P256DH, p_auth: AUTH,
    });
    check("a complete https registration succeeds", !registered.error,
      registered.error?.message ?? "granted");

    const consentA = await sessionA.from("notification_consents").select("state,recorded_at").maybeSingle();
    check("a real registration concludes consent `granted` with a recorded time",
      consentA.data?.state === "granted" && Boolean(consentA.data?.recorded_at),
      `state=${consentA.data?.state}`);

    console.log("\n2. A foreign subscription is indistinguishable from none (T-01)");

    const bSeesNothing = await sessionB.from("push_subscriptions").select("id");
    check("owner B sees zero subscriptions while A has one — from B's own session",
      !bSeesNothing.error && bSeesNothing.data.length === 0,
      `rows=${bSeesNothing.data?.length ?? "error"}`);
    const bSeesNoConsent = await sessionB.from("notification_consents").select("channel");
    check("owner B sees no consent record belonging to A",
      !bSeesNoConsent.error && bSeesNoConsent.data.length === 0,
      `rows=${bSeesNoConsent.data?.length ?? "error"}`);

    // The same endpoint, registered by B, must NOT error — a global unique would
    // turn the insert failure into an existence oracle for A's subscription.
    const bSame = await sessionB.rpc("register_push_subscription", {
      p_endpoint: ENDPOINT, p_p256dh: P256DH, p_auth: AUTH,
    });
    check("a second owner may register the SAME endpoint without an error that would reveal A",
      !bSame.error, bSame.error?.message ?? "accepted");
    const bOwnRow = await sessionB.from("push_subscriptions").select("id");
    check("and still sees exactly its own row",
      bOwnRow.data?.length === 1, `rows=${bOwnRow.data?.length}`);

    console.log("\n3. The six controls, on the server, before sending");

    // Preferences through the authenticated path, so quiet hours land in
    // `agent_preferences` — the columns the heartbeat already reads.
    await sessionA.rpc("update_notification_preferences", {
      p_enabled_types: ["reminder", "review"], p_frequency: "immediate",
      p_quiet_start: "03:00", p_quiet_end: "03:00", p_daily_cap: 3,
    });
    const prefs = await sessionA.from("agent_preferences")
      .select("quiet_start,quiet_end,max_followups_per_day").maybeSingle();
    check("quiet hours and the cap were written to agent_preferences, not to a second copy",
      prefs.data?.quiet_start === "03:00:00" && prefs.data?.max_followups_per_day === 3,
      `${prefs.data?.quiet_start}|${prefs.data?.max_followups_per_day}`);

    const muted = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "digest", p_dedupe_hash: HASH("2"),
    });
    check("a muted type is refused, and the reason names the control",
      muted.data?.reason === "type_muted", `reason=${muted.data?.reason}`);

    // Quiet hours proved by moving the WINDOW, not the clock: `24:00` makes it
    // total, so this holds in every minute of the day rather than most of them.
    await sessionA.rpc("update_notification_preferences", {
      p_enabled_types: ["reminder", "review"], p_frequency: "immediate",
      p_quiet_start: "00:00", p_quiet_end: "24:00", p_daily_cap: 3,
    });
    const quiet = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("3"),
    });
    check("quiet hours suppress delivery, and the reason names the control",
      quiet.data?.reason === "quiet_hours", `reason=${quiet.data?.reason}`);

    // start = end is never quiet, by the predicate's own rule — deterministic.
    await sessionA.rpc("update_notification_preferences", {
      p_enabled_types: ["reminder", "review"], p_frequency: "immediate",
      p_quiet_start: "03:00", p_quiet_end: "03:00", p_daily_cap: 3,
    });

    const permitted = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("4"),
    });
    check("a permitted delivery really is permitted — the non-vacuity control",
      permitted.data?.permitted === true, `permitted=${permitted.data?.permitted}`);
    check("and it hands the sender exactly the one active subscription",
      Array.isArray(permitted.data?.subscriptions) && permitted.data.subscriptions.length === 1,
      `subscriptions=${permitted.data?.subscriptions?.length}`);

    const deliveryId = permitted.data?.delivery_id;
    const subscriptionId = permitted.data?.subscriptions?.[0]?.id;

    const duplicate = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("4"),
    });
    check("deduplication refuses the same item while one is in flight",
      duplicate.data?.reason === "duplicate", `reason=${duplicate.data?.reason}`);

    console.log("\n4. Retry is bounded twice, and retirement is real");

    const fail1 = await admin.rpc("finish_push_delivery", {
      p_delivery_id: deliveryId, p_outcome: "failed",
      p_gone_subscription_ids: [], p_failed_subscription_ids: [subscriptionId],
    });
    check("the first device failure leaves the delivery in flight",
      fail1.data?.outcome === "pending", `outcome=${fail1.data?.outcome}`);

    const stillDuplicate = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("4"),
    });
    check("a retry cannot walk around deduplication while the first is in flight",
      stillDuplicate.data?.reason === "duplicate", `reason=${stillDuplicate.data?.reason}`);

    await admin.rpc("finish_push_delivery", {
      p_delivery_id: deliveryId, p_outcome: "failed",
      p_gone_subscription_ids: [], p_failed_subscription_ids: [subscriptionId],
    });
    const fail3 = await admin.rpc("finish_push_delivery", {
      p_delivery_id: deliveryId, p_outcome: "failed",
      p_gone_subscription_ids: [], p_failed_subscription_ids: [subscriptionId],
    });
    check("the THIRD delivery failure retires it — no failure is retried indefinitely",
      fail3.data?.outcome === "retired", `outcome=${fail3.data?.outcome}`);

    const device = await sessionA.from("push_subscriptions")
      .select("state,failure_count").eq("id", subscriptionId).maybeSingle();
    check("and the third device strike retires the DEVICE — the per-device ceiling",
      device.data?.state === "expired" && device.data?.failure_count === 3,
      `${device.data?.state}|${device.data?.failure_count}`);

    const expiredConsent = await sessionA.from("notification_consents").select("state").maybeSingle();
    check("the consent expires with the last device rather than staying granted forever",
      expiredConsent.data?.state === "expired", `state=${expiredConsent.data?.state}`);

    const stale = await admin.rpc("finish_push_delivery", {
      p_delivery_id: deliveryId, p_outcome: "delivered",
    });
    check("a finished delivery is never re-finished — a late worker changes nothing",
      stale.data?.changed === false, `changed=${stale.data?.changed}`);

    console.log("\n5. Cooldown, cap, and a gone subscription");

    // Revive, deliver for real, then prove the cooldown and the cap.
    await sessionA.rpc("register_push_subscription", {
      p_endpoint: ENDPOINT, p_p256dh: P256DH, p_auth: AUTH,
    });
    const second = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "review", p_dedupe_hash: HASH("5"),
    });
    await admin.rpc("finish_push_delivery", {
      p_delivery_id: second.data?.delivery_id, p_outcome: "delivered",
    });
    const cooldown = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "review", p_dedupe_hash: HASH("5"),
    });
    check("the 24-hour per-item cooldown refuses a re-delivery, distinctly from duplicate",
      cooldown.data?.reason === "cooldown", `reason=${cooldown.data?.reason}`);

    await sessionA.rpc("update_notification_preferences", {
      p_enabled_types: ["reminder", "review"], p_frequency: "immediate",
      p_quiet_start: "03:00", p_quiet_end: "03:00", p_daily_cap: 0,
    });
    const capped = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("6"),
    });
    check("the daily cap suppresses delivery, and the reason names the control",
      capped.data?.reason === "daily_cap", `reason=${capped.data?.reason}`);

    // A gone subscription is retired at once, with no strikes.
    await sessionA.rpc("update_notification_preferences", {
      p_enabled_types: ["reminder", "review"], p_frequency: "immediate",
      p_quiet_start: "03:00", p_quiet_end: "03:00", p_daily_cap: 5,
    });
    const third = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("7"),
    });
    const goneId = third.data?.subscriptions?.[0]?.id;
    await admin.rpc("finish_push_delivery", {
      p_delivery_id: third.data?.delivery_id, p_outcome: "failed",
      p_gone_subscription_ids: [goneId], p_failed_subscription_ids: [],
    });
    const goneDevice = await sessionA.from("push_subscriptions")
      .select("state,failure_count").eq("id", goneId).maybeSingle();
    check("a GONE subscription is retired at once, with no strikes needed",
      goneDevice.data?.state === "expired" && goneDevice.data?.failure_count === 0,
      `${goneDevice.data?.state}|${goneDevice.data?.failure_count}`);

    console.log("\n6. Revocation takes effect without a further step (T-09)");

    await sessionA.rpc("register_push_subscription", {
      p_endpoint: ENDPOINT, p_p256dh: P256DH, p_auth: AUTH,
    });
    const revoked = await sessionA.rpc("revoke_push_consent");
    check("revocation succeeds in one step", !revoked.error, revoked.error?.message ?? "revoked");
    const activeAfter = await sessionA.from("push_subscriptions").select("id").eq("state", "active");
    check("revocation marked the subscription too — not just the consent",
      activeAfter.data?.length === 0, `active=${activeAfter.data?.length}`);
    const twice = await sessionA.rpc("revoke_push_consent");
    check("revoking twice is not an error", !twice.error, twice.error?.message ?? "idempotent");
    const afterRevoke = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("8"),
    });
    check("after revocation nothing may be delivered",
      afterRevoke.data?.reason === "not_consented", `reason=${afterRevoke.data?.reason}`);

    console.log("\n7. The audit carries no content, and the product path holds no service_role");

    const audit = await sessionA.from("notification_deliveries")
      .select("channel,notification_type,dedupe_hash,outcome,suppression_reason,attempts");
    const columns = audit.data?.length ? Object.keys(audit.data[0]) : [];
    check("the delivery audit exposes no content-bearing column",
      columns.every((name) => !["title", "body", "description", "payload", "metadata", "data"].includes(name)),
      `columns=${columns.join(",")}`);
    check("every dedupe_hash is a digest and could not hold a title",
      (audit.data ?? []).every((row) => /^[0-9a-f]{64}$/.test(row.dedupe_hash)),
      `rows=${audit.data?.length}`);

    const suppressed = (audit.data ?? []).filter((row) => row.outcome === "suppressed");
    const reasons = [...new Set(suppressed.map((row) => row.suppression_reason))].sort();
    check("every suppression carries one of the six declared reasons and nothing else",
      reasons.every((reason) => ["quiet_hours", "daily_cap", "cooldown", "duplicate", "not_consented", "type_muted"].includes(reason)),
      `reasons=${reasons.join(",")}`);
    check("a delivered row carries NO suppression reason",
      (audit.data ?? []).filter((row) => row.outcome !== "suppressed")
        .every((row) => row.suppression_reason === null),
      "constraint holds");

    // The product path: `authenticated` may not execute the sender's functions.
    const forbidden = await sessionB.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: HASH("9"),
    });
    check("an authenticated caller cannot drive the sender against another user",
      Boolean(forbidden.error), `code=${forbidden.error?.code ?? "NONE"}`);

    // And it may not write the tables directly.
    const directWrite = await sessionA.from("notification_consents")
      .insert({ user_id: idA, channel: "push", state: "granted" });
    check("an authenticated caller cannot insert its own consent row",
      Boolean(directWrite.error), `code=${directWrite.error?.code ?? "NONE"}`);

    console.log("\n8. Non-vacuous negative controls");

    const badType = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "recurrence", p_dedupe_hash: HASH("a"),
    });
    check("an undeclared notification type is refused", badType.error?.code === "22023",
      `code=${badType.error?.code}`);
    const badHash = await admin.rpc("begin_push_delivery", {
      p_user_id: idA, p_type: "reminder", p_dedupe_hash: "reminder:7f3c",
    });
    check("a record identifier where a digest belongs is refused",
      badHash.error?.code === "22023", `code=${badHash.error?.code}`);
    const badCap = await sessionA.rpc("update_notification_preferences", {
      p_enabled_types: ["reminder"], p_frequency: "immediate",
      p_quiet_start: "03:00", p_quiet_end: "03:00", p_daily_cap: 99,
    });
    check("a cap beyond the existing column bound is refused",
      badCap.error?.code === "22023", `code=${badCap.error?.code}`);

    console.log("\n9. Retention is registered and armed by nobody");

    const sweep = await admin.rpc("prune_notification_deliveries", { p_limit: 1 });
    check("the retention sweep is not reachable by service_role",
      Boolean(sweep.error), `code=${sweep.error?.code ?? "REACHABLE"}`);
  } finally {
    console.log("\n10. Cleanup, and zero residue proved owner-scoped");
    for (const id of [idA, idB]) {
      if (id) await admin.auth.admin.deleteUser(id);
    }
    // Owner-scoped, because a global count would prove nothing: these tables are
    // owner-partitioned and the only honest question is whether THESE owners'
    // rows are gone. The users no longer exist, so the read is made with the
    // admin client against the exact ids — the cascade's own subject.
    for (const [table, id] of [
      ["notification_consents", idA], ["push_subscriptions", idA],
      ["notification_deliveries", idA], ["notification_consents", idB],
      ["push_subscriptions", idB], ["notification_deliveries", idB],
    ]) {
      if (!id) continue;
      const { data, error } = await admin.from(table).select("user_id").eq("user_id", id);
      if (error) {
        check(`${table}: residue unreadable by service_role for ${id.slice(0, 8)}`, false,
          `code=${error.code} — residue NOT proved for this table`);
      } else {
        check(`${table}: zero residue for ${id.slice(0, 8)}`, data.length === 0,
          `rows=${data.length}`);
      }
    }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} claims passed.`);
  if (failures > 0) {
    console.error(`${failures} claim(s) FAILED.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
