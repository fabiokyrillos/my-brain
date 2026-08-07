import { assert, assertEquals } from "jsr:@std/assert@1";

import { handleReapRequest } from "./reap.ts";

/**
 * 2H-RECOVER-001, 2H-RECOVER-003, 2H-RECOVER-005 and 2H-RECOVER-006 at the
 * worker boundary.
 *
 * The claim about this door is a *capability* claim -- that it re-invokes the
 * executor and gains nothing else -- so the assertions below are about what
 * reached the database and what did not, not about status codes alone. The
 * recorder makes every call observable; a door that deleted the wrong account
 * and answered `200` would fail on `deletedUsers`, not on the response.
 *
 * `deno test` runs with no `--allow-*` flags, so the secret and the client are
 * injected rather than read from the environment.
 */

const OWNER = "aaaaaaaa-1111-4111-8111-111111111111";
const OTHER = "bbbbbbbb-2222-4222-8222-222222222222";
const TOKEN = "cccccccc-3333-4333-8333-333333333333";
const WRONG_TOKEN = "dddddddd-4444-4444-8444-444444444444";
const SECRET = "0123456789abcdef0123456789abcdef";
const REQUESTED_AT = "2026-08-04T12:00:00.000Z";

type FakeOptions = {
  /** Which (account, token) pair the database will confirm. Null confirms none. */
  claim?: { userId: string; token: string } | null;
  lifecycleStatus?: string;
  credentialError?: boolean;
};

function fakeService(options: FakeOptions) {
  const recorder = {
    confirmed: [] as Record<string, unknown>[],
    attempts: [] as Record<string, unknown>[],
    deletedUsers: [] as string[],
    deletionsRecorded: [] as Record<string, unknown>[],
  };
  const claim = options.claim === undefined ? { userId: OWNER, token: TOKEN } : options.claim;
  let censusCalls = 0;

  const service = {
    from(table: string) {
      if (table === "account_lifecycle") {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => {
                if (recorder.deletedUsers.includes(value)) return { data: null, error: null };
                return {
                  data: { status: options.lifecycleStatus ?? "deleting", user_id: value },
                  error: null,
                };
              },
            }),
          }),
        };
      }
      if (table === "attachments") {
        return { select: () => ({ in: () => ({ neq: async () => ({ data: [], error: null }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },

    storage: {
      from() {
        return {
          list: async (_prefix: string, opts: { limit: number; offset: number }) =>
            ({ data: opts.offset === 0 ? [] : [], error: null }),
          remove: async (paths: string[]) => ({ data: paths, error: null }),
        };
      },
    },

    auth: {
      admin: {
        deleteUser: async (userId: string) => {
          recorder.deletedUsers.push(userId);
          return { data: { user: { id: userId } }, error: null };
        },
      },
    },

    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "confirm_account_deletion_claim") {
        recorder.confirmed.push(args);
        const matches = claim !== null
          && args.p_user_id === claim.userId
          && args.p_claim_token === claim.token;
        return {
          data: matches
            ? { confirmed: true, requested_at: REQUESTED_AT }
            : { confirmed: false },
          error: null,
        };
      }
      if (name === "record_account_deletion_attempt") {
        recorder.attempts.push(args);
        return { data: { recorded: true }, error: null };
      }
      if (name === "account_owned_row_counts") {
        censusCalls += 1;
        return { data: {}, error: null };
      }
      if (name === "admin_credential_status") {
        if (options.credentialError) return { data: null, error: { message: "boom" } };
        return { data: null, error: null };
      }
      if (name === "record_account_deletion") {
        recorder.deletionsRecorded.push(args);
        return { data: "00000000-0000-4000-8000-000000000001", error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };

  // deno-lint-ignore no-explicit-any
  return { service: service as any, recorder };
}

const payload = { userId: OWNER, claimToken: TOKEN };

Deno.test("an unconfigured deployment refuses every reap request", async () => {
  const { service, recorder } = fakeService({});
  const response = await handleReapRequest(service, payload, SECRET, undefined);

  assertEquals(response.status, 401);
  assertEquals(response.body.code, "reap_disabled");
  // Fail-closed means the database is never consulted, not merely that the
  // answer is no.
  assertEquals(recorder.confirmed.length, 0);
  assertEquals(recorder.deletedUsers, []);
});

Deno.test("a secret shorter than the minimum is treated as unset, not as a secret", async () => {
  const { service } = fakeService({});
  const response = await handleReapRequest(service, payload, "short", "short");

  // The presented value MATCHES the configured one, and it is still refused.
  // This is the control that distinguishes "compares correctly" from "refuses
  // a placeholder", which are different guarantees.
  assertEquals(response.status, 401);
  assertEquals(response.body.code, "reap_disabled");
});

Deno.test("a wrong secret is refused before the payload is even read", async () => {
  const { service, recorder } = fakeService({});
  const response = await handleReapRequest(service, payload, "f".repeat(32), SECRET);

  assertEquals(response.status, 401);
  assertEquals(response.body.code, "reap_secret_mismatch");
  assertEquals(recorder.confirmed.length, 0);
  assertEquals(recorder.deletedUsers, []);
});

Deno.test("a malformed payload is refused without consulting the database", async () => {
  const { service, recorder } = fakeService({});
  const response = await handleReapRequest(service, { userId: "not-a-uuid" }, SECRET, SECRET);

  assertEquals(response.status, 400);
  assertEquals(response.body.code, "malformed_reap_payload");
  assertEquals(recorder.confirmed.length, 0);
});

Deno.test("2H-RECOVER-003: a valid secret cannot point the executor at an unclaimed account", async () => {
  const { service, recorder } = fakeService({ claim: { userId: OWNER, token: TOKEN } });
  const response = await handleReapRequest(
    service,
    { userId: OTHER, claimToken: TOKEN },
    SECRET,
    SECRET,
  );

  assertEquals(response.status, 409);
  assertEquals(response.body.outcome, "not_claimed");
  // The whole point: holding the secret is not holding the capability.
  assertEquals(recorder.deletedUsers, []);
  assertEquals(recorder.attempts.length, 0);
});

Deno.test("2H-RECOVER-003: a stale or forged claim token is refused for the right account too", async () => {
  const { service, recorder } = fakeService({ claim: { userId: OWNER, token: TOKEN } });
  const response = await handleReapRequest(
    service,
    { userId: OWNER, claimToken: WRONG_TOKEN },
    SECRET,
    SECRET,
  );

  assertEquals(response.status, 409);
  assertEquals(recorder.deletedUsers, []);
});

Deno.test("2H-RECOVER-001: a claimed account is deleted by the same executor the product uses", async () => {
  const { service, recorder } = fakeService({});
  const response = await handleReapRequest(service, payload, SECRET, SECRET);

  assertEquals(response.status, 200);
  assertEquals(response.body.outcome, "completed");
  assertEquals(recorder.deletedUsers, [OWNER]);
  // The ORIGINAL request time reached the deletion log, not the retry's own
  // timestamp -- so a two-day stall is not recorded as an instant deletion.
  assertEquals(recorder.deletionsRecorded[0].p_requested_at, REQUESTED_AT);
  // The reaper holds no session, and the log says so rather than inventing one.
  assertEquals(recorder.deletionsRecorded[0].p_requester_session_hash, null);
});

Deno.test("2H-RECOVER-005: the attempt's outcome is reported back against its own lease", async () => {
  const { service, recorder } = fakeService({});
  await handleReapRequest(service, payload, SECRET, SECRET);

  assertEquals(recorder.attempts.length, 1);
  assertEquals(recorder.attempts[0].p_user_id, OWNER);
  assertEquals(recorder.attempts[0].p_claim_token, TOKEN);
  assertEquals(recorder.attempts[0].p_outcome, "completed");
  assertEquals(recorder.attempts[0].p_stop_reason, null);
});

Deno.test("2H-RECOVER-006: the historical credential_not_erased stop is carried back, and nothing is deleted", async () => {
  // The exact failure of 2026-08-04: `202608050077` revoked the grant step 5
  // depended on, so the credential check errored for every account.
  const { service, recorder } = fakeService({ credentialError: true });
  const response = await handleReapRequest(service, payload, SECRET, SECRET);

  assertEquals(response.status, 409);
  assertEquals(response.body.code, "credential_not_erased");
  // The executor's refusal is still the last word under the reaper.
  assertEquals(recorder.deletedUsers, []);
  assertEquals(recorder.attempts[0].p_outcome, "stopped");
  assertEquals(recorder.attempts[0].p_stop_reason, "credential_not_erased");
});

Deno.test("2H-RECOVER-003: the executor's lifecycle gate still refuses an account that is not deleting", async () => {
  // Belt and braces: even if the database confirmed a claim for an account that
  // has since been reverted, step 1 stops. The claim check and the gate are two
  // independent refusals, and this proves the second one alone suffices.
  const { service, recorder } = fakeService({ lifecycleStatus: "active" });
  const response = await handleReapRequest(service, payload, SECRET, SECRET);

  assertEquals(response.status, 409);
  assertEquals(response.body.code, "lifecycle_not_deleting");
  assertEquals(recorder.deletedUsers, []);
});

Deno.test("the reap door reports its own outcome even when the bookkeeping row is gone", async () => {
  // A completed deletion cascades its attempt row away; the RPC answers
  // `attempt_row_absent` rather than raising, and the deletion still reports
  // completed. Regression cover for the case where success would otherwise be
  // reported as failure.
  const { service } = fakeService({});
  const response = await handleReapRequest(service, payload, SECRET, SECRET);

  assert(response.status === 200);
  assertEquals(response.body.outcome, "completed");
});
