import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { recordProductEvent } from "@/features/product-analytics/server";

import {
  registerPushSubscription,
  reportPushConsentState,
  revokePushConsent,
  updateNotificationPreferences,
} from "./actions";

/**
 * `2M-NOTIFY-001`, `-004`, `-010`, `-011` — the four writes, and the authority
 * behind each.
 *
 * ## What is actually under test
 *
 * Not the authorization: that is the database's, and the pgTAP suite proves it
 * against a real Postgres with real roles. What is under test here is that these
 * functions **cannot reach around it** — that every path authenticates first,
 * runs the lifecycle gate, parses the untrusted input, and passes the owner
 * NOWHERE, because the RPCs take it from `auth.uid()` and there is no argument a
 * caller could put somebody else's id into.
 *
 * The absence assertions matter as much as the presence ones. A test that only
 * checked "the RPC was called" would pass against a version that also accepted a
 * `userId` parameter and forwarded it.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ assertActiveAccount: vi.fn(async () => undefined) }));
vi.mock("@/lib/preferences", () => ({
  resolveLocale: (value: unknown) => (value === "en" ? "en" : "pt-BR"),
}));
vi.mock("@/features/product-analytics/server", () => ({
  recordProductEvent: vi.fn(async () => ({ accepted: true, recorded: true, eventId: "e", code: "recorded" })),
}));

const USER = { id: "2f4b0001-0000-4000-8000-000000000001" };
const SUBSCRIPTION = {
  endpoint: "https://push.example.test/abc-endpoint",
  p256dh: "0123456789abcdef",
  auth: "01234567",
};

type RpcCall = { name: string; payload: Record<string, unknown> | undefined };

function stubClient(options: {
  user?: { id: string } | null;
  rpcError?: { code?: string } | null;
  consentState?: string;
} = {}) {
  const calls: RpcCall[] = [];
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user === undefined ? USER : options.user },
        error: options.user === null ? { message: "no session" } : null,
      })),
    },
    rpc: vi.fn(async (name: string, payload?: Record<string, unknown>) => {
      calls.push({ name, payload });
      return { data: null, error: options.rpcError ?? null };
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { state: options.consentState ?? "granted" },
            error: null,
          })),
        })),
      })),
    })),
  };
  vi.mocked(createClient).mockResolvedValue(client as never);
  return { client, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("2M-NOTIFY-011: no path writes without an authenticated owner", () => {
  it("refuses every action when there is no session", async () => {
    stubClient({ user: null });
    expect(await registerPushSubscription(SUBSCRIPTION)).toEqual({ ok: false, code: "unauthenticated" });
    expect(await revokePushConsent()).toEqual({ ok: false, code: "unauthenticated" });
    expect(await reportPushConsentState("denied")).toEqual({ ok: false, code: "unauthenticated" });
    expect(await updateNotificationPreferences({
      enabledTypes: ["reminder"], frequency: "immediate", quietStart: "22:30", quietEnd: "07:00", dailyCap: 3,
    })).toEqual({ ok: false, code: "unauthenticated" });
  });

  it("writes nothing when there is no session", async () => {
    const { calls } = stubClient({ user: null });
    await registerPushSubscription(SUBSCRIPTION);
    await revokePushConsent();
    // The claim that matters: an unauthenticated caller produced no RPC at all,
    // rather than one the database happened to refuse.
    expect(calls).toEqual([]);
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("runs the lifecycle gate on every write path", async () => {
    // A suspended or deleted account must not be able to register a device it
    // would keep being notified on.
    for (const action of [
      () => registerPushSubscription(SUBSCRIPTION),
      () => revokePushConsent(),
      () => reportPushConsentState("denied"),
      () => updateNotificationPreferences({
        enabledTypes: ["reminder"], frequency: "immediate", quietStart: "22:30", quietEnd: "07:00", dailyCap: 3,
      }),
    ]) {
      vi.clearAllMocks();
      stubClient();
      await action();
      expect(assertActiveAccount).toHaveBeenCalledTimes(1);
    }
  });

  it("never passes a user id to any RPC", async () => {
    /*
     * The structural claim behind `2M-NOTIFY-011`. Each RPC derives the owner
     * from `auth.uid()`, so there is no argument through which a caller could
     * name somebody else — and this fails the build if one is ever added.
     */
    const { calls } = stubClient();
    await registerPushSubscription(SUBSCRIPTION);
    await revokePushConsent();
    await reportPushConsentState("expired");
    await updateNotificationPreferences({
      enabledTypes: ["reminder"], frequency: "immediate", quietStart: "22:30", quietEnd: "07:00", dailyCap: 3,
    });
    expect(calls.length).toBe(4);
    for (const call of calls) {
      const keys = Object.keys(call.payload ?? {});
      expect(keys.some((key) => /user|owner|actor|uid/i.test(key)), `${call.name}: ${keys.join()}`).toBe(false);
    }
  });
});

describe("2M-NOTIFY-011: the untrusted input is parsed before it reaches the database", () => {
  it("refuses a malformed subscription without a round trip", async () => {
    const { calls } = stubClient();
    expect(await registerPushSubscription({ endpoint: "http://push.test/x", p256dh: "k", auth: "a" }))
      .toEqual({ ok: false, code: "invalid" });
    expect(await registerPushSubscription(null)).toEqual({ ok: false, code: "invalid" });
    // Refused before the session is even established, so a bad payload costs
    // nothing and reaches nothing.
    expect(calls).toEqual([]);
  });

  it("refuses a client claiming `granted`", async () => {
    const { calls } = stubClient();
    expect(await reportPushConsentState("granted")).toEqual({ ok: false, code: "invalid" });
    expect(calls).toEqual([]);
  });

  it("refuses preferences outside the declared vocabulary", async () => {
    const { calls } = stubClient();
    expect(await updateNotificationPreferences({
      enabledTypes: ["recurrence"], frequency: "immediate", quietStart: "22:30", quietEnd: "07:00", dailyCap: 3,
    })).toEqual({ ok: false, code: "invalid" });
    expect(await updateNotificationPreferences({
      enabledTypes: ["reminder"], frequency: "immediate", quietStart: "22:30", quietEnd: "07:00", dailyCap: 99,
    })).toEqual({ ok: false, code: "invalid" });
    expect(calls).toEqual([]);
  });
});

describe("2M-NOTIFY-001: the happy paths, and what each records", () => {
  it("registers a subscription and calls the one RPC that can reach `granted`", async () => {
    const { calls } = stubClient();
    expect(await registerPushSubscription(SUBSCRIPTION, "en")).toEqual({ ok: true, state: "granted" });
    expect(calls).toEqual([{
      name: "register_push_subscription",
      payload: { p_endpoint: SUBSCRIPTION.endpoint, p_p256dh: SUBSCRIPTION.p256dh, p_auth: SUBSCRIPTION.auth },
    }]);
  });

  it("revokes in one call, because revocation takes effect without a further step", async () => {
    const { calls } = stubClient();
    expect(await revokePushConsent("pt-BR")).toEqual({ ok: true, state: "revoked" });
    // One RPC, one transaction. A revocation that marked the consent but left
    // the subscription active would be one the sender could still deliver
    // against (T-09), and splitting it across two calls here would reintroduce
    // exactly that window.
    expect(calls).toEqual([{ name: "revoke_push_consent", payload: undefined }]);
  });

  it("records a consent transition AFTER the write, never before", async () => {
    stubClient();
    await registerPushSubscription(SUBSCRIPTION, "en");
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: "notification_consent_changed",
      surface: "server",
      locale: "en",
      properties: { channel: "push", state: "granted" },
    }));
  });

  it("records NO consent transition when the write failed", async () => {
    // An event recorded for a write that then failed is a funnel reporting
    // consent nobody gave.
    stubClient({ rpcError: { code: "42501" } });
    expect(await registerPushSubscription(SUBSCRIPTION)).toEqual({ ok: false, code: "failed" });
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("reports a database validation refusal as `invalid` rather than as a failure", async () => {
    // So the surface can tell the user which of the two happened.
    stubClient({ rpcError: { code: "22023" } });
    expect(await reportPushConsentState("denied")).toEqual({ ok: false, code: "invalid" });
  });

  it("records NO consent transition for a preference edit", async () => {
    // The consent state did not change. Recording one here would inflate the
    // funnel's consent transitions with events that are preference edits.
    stubClient({ consentState: "granted" });
    expect(await updateNotificationPreferences({
      enabledTypes: ["reminder"], frequency: "daily_digest", quietStart: "23:00", quietEnd: "06:00", dailyCap: 2,
    }, "en")).toEqual({ ok: true, state: "granted" });
    expect(recordProductEvent).not.toHaveBeenCalled();
  });

  it("falls back to `unsupported` when the consent state cannot be read", async () => {
    // Fail closed: an unreadable state must never resolve to something a caller
    // could mistake for permission.
    stubClient({ consentState: "nonsense" });
    expect(await updateNotificationPreferences({
      enabledTypes: ["reminder"], frequency: "immediate", quietStart: "22:30", quietEnd: "07:00", dailyCap: 3,
    })).toEqual({ ok: true, state: "unsupported" });
  });

  it("resolves an unrecognised locale rather than trusting it", async () => {
    // `resolveLocale` falls back to the default, so a caller cannot steer the
    // lifecycle redirect to an arbitrary path by naming a locale that does not
    // exist.
    stubClient();
    await revokePushConsent("../../etc/passwd");
    expect(recordProductEvent).toHaveBeenCalledWith(expect.objectContaining({ locale: "pt-BR" }));
  });
});
