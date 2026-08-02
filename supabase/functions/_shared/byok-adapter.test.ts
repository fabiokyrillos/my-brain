import { assert, assertEquals, assertStrictEquals, assertThrows } from "jsr:@std/assert@1";

import { resolveJobCredential } from "./byok-adapter.ts";
import {
  composeAad,
  encryptCredential,
  fromBase64,
  toBase64,
  type Bytes,
} from "./byok-envelope.ts";
import type { MasterKeyRing } from "./byok-rotation.ts";
import { JobFailure } from "./job-failure.ts";
import { Secret } from "./byok-secret.ts";

/**
 * `BYOK-ADAPTER-003`, `BYOK-GUARD-003`, and the worker ownership invariant —
 * executed against a recording double rather than reasoned about.
 *
 * The attack this file exists for is the one the whole slice is built around:
 * **a foreign job id must resolve the real job owner's credential, never the
 * invoking user's.** The Edge Function's direct path carries an end-user bearer
 * token, so "who asked" and "whose key" are genuinely different questions there,
 * and the adapter is the only place that answers the second one.
 */

const MASTER: Bytes = fromBase64(
  // 32 deterministic bytes. Not a real key, not derived from one, and it opens
  // nothing outside this file.
  toBase64(new Uint8Array(new ArrayBuffer(32)).fill(7)),
);

/**
 * The single-key ring these cases exercise.
 *
 * `resolveJobCredential` takes a ring rather than a key since `BYOK-ROTATION`,
 * because the row's `key_version` selects which key applies. With no window
 * configured a ring is exactly one key at version 1, so every assertion below
 * means what it meant before; the rotation window's own behaviour is covered in
 * `src/lib/byok/rotation.test.ts` and locked across runtimes by
 * `rotation-parity.test.ts`.
 */
const RING: MasterKeyRing = {
  current: MASTER,
  currentVersion: 1,
  previous: null,
  previousVersion: null,
  previousExpiresAt: null,
};

const OWNER: string = "11111111-1111-4111-8111-111111111111";
const INVOKER: string = "22222222-2222-4222-8222-222222222222";
const JOB: string = "33333333-3333-4333-8333-333333333333";
const PLAINTEXT = "sk-proj-fixture-value-not-a-real-key";

function hex(base64: string): string {
  let out = "\\x";
  for (const byte of fromBase64(base64)) out += byte.toString(16).padStart(2, "0");
  return out;
}

async function envelopeRow(
  userId: string,
  options: { keyVersion?: number; provider?: string; master?: Bytes } = {},
) {
  const keyVersion = options.keyVersion ?? 1;
  const provider = options.provider ?? "openai";
  const sealed = await encryptCredential(PLAINTEXT, options.master ?? MASTER, {
    userId,
    keyVersion,
    provider,
  });
  return {
    // PostgREST returns `bytea` as `\x`-prefixed hex, which is the shape the
    // adapter has to convert. Fixtures use the transport shape on purpose.
    ciphertext: hex(sealed.ciphertext),
    iv: hex(sealed.iv),
    key_version: keyVersion,
    status: "active",
    provider,
  };
}

type Recorded = { table?: string; rpc?: string; args?: unknown; filters: Record<string, unknown> };

/**
 * A Supabase double that records what was asked and answers from a fixed map.
 *
 * `jobs` answers with whatever owner the fixture says; the resolver answers with
 * whatever envelope the fixture says. Keeping the two independent is the point:
 * a real bug here would be the adapter composing the AAD from something other
 * than the row it read, and only independent sources can catch that.
 */
function doubleService(fixture: {
  jobOwner?: string | null;
  jobError?: boolean;
  rows?: unknown[];
  rpcError?: boolean;
}) {
  const calls: Recorded[] = [];
  const service = {
    from(table: string) {
      const call: Recorded = { table, filters: {} };
      calls.push(call);
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          call.filters[column] = value;
          return builder;
        },
        maybeSingle() {
          if (fixture.jobError) return Promise.resolve({ data: null, error: { code: "42501" } });
          return Promise.resolve({
            data: fixture.jobOwner === null ? null : { user_id: fixture.jobOwner },
            error: null,
          });
        },
      };
      return builder;
    },
    rpc(rpc: string, args: unknown) {
      calls.push({ rpc, args, filters: {} });
      if (fixture.rpcError) return Promise.resolve({ data: null, error: { code: "42501" } });
      return Promise.resolve({ data: fixture.rows ?? [], error: null });
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  return { service, calls };
}

// ---------------------------------------------------------------------------
// The ownership invariant.
// ---------------------------------------------------------------------------

Deno.test("the owner comes from jobs.user_id, and the resolver is given only the job id", async () => {
  const { service, calls } = doubleService({
    jobOwner: OWNER,
    rows: [await envelopeRow(OWNER)],
  });

  const credential = await resolveJobCredential(service, JOB, RING);

  assertStrictEquals(credential.userId, OWNER);
  assertStrictEquals(credential.secret.expose(), PLAINTEXT);

  const jobRead = calls.find((call) => call.table === "jobs");
  assert(jobRead, "the adapter must read the job row itself");
  assertStrictEquals(jobRead.filters.id, JOB);

  const rpc = calls.find((call) => call.rpc === "resolve_job_ai_credential");
  assert(rpc, "the adapter must go through the resolver");
  // The whole argument list. A `p_user_id` here would be the escape hatch this
  // architecture is built to not have.
  assertEquals(rpc.args, { p_job_id: JOB });
});

Deno.test("a foreign job id resolves the job owner's credential, not the invoker's", async () => {
  // The Edge Function's direct path authorises the *request* with a bearer
  // token and then processes a job that may belong to anybody. This asserts the
  // adapter has no way to be told about the invoker at all: it takes a job id,
  // and the only owner it can reach is the one on the row.
  const { service } = doubleService({
    jobOwner: OWNER,
    rows: [await envelopeRow(OWNER)],
  });

  const credential = await resolveJobCredential(service, JOB, RING);

  assertStrictEquals(credential.userId, OWNER);
  assert(credential.userId !== INVOKER);
  assertStrictEquals(resolveJobCredential.length, 3, "the signature takes no owner");
});

Deno.test("an envelope sealed for another account cannot be opened for this job", async () => {
  // The cryptographic half of the same guarantee. If a resolver ever returned
  // the wrong account's row, the AAD binding makes it unreadable rather than
  // usable — a declared failure, not a cross-user leak.
  const { service } = doubleService({
    jobOwner: OWNER,
    rows: [await envelopeRow(INVOKER)],
  });

  const error = await resolveJobCredential(service, JOB, RING).catch((thrown) => thrown);
  assert(error instanceof JobFailure);
  assertStrictEquals(error.code, "credential_unreadable");
});

Deno.test("the AAD is composed from the row's owner, version and provider", async () => {
  // Positively, so a future adapter that decrypted with a *constant* AAD would
  // fail here rather than pass every other test in this file.
  const row = await envelopeRow(OWNER, { keyVersion: 4, provider: "openai" });
  const { service } = doubleService({ jobOwner: OWNER, rows: [row] });
  // The ring has to cover version 4 for this row to be reachable at all: since
  // `BYOK-ROTATION` a version no key seals is refused before any decryption is
  // attempted. That refusal is asserted separately below; here the point is the
  // AAD, so the ring is set to the version the fixture uses.
  const ringAtFour: MasterKeyRing = { ...RING, currentVersion: 4 };

  const credential = await resolveJobCredential(service, JOB, ringAtFour);
  assertStrictEquals(credential.keyVersion, 4);
  assertStrictEquals(credential.provider, "openai");

  // And the composition itself is the one both runtimes share.
  const aad = composeAad({ userId: OWNER, keyVersion: 4, provider: "openai" });
  assert(aad.length > OWNER.length);
});

// ---------------------------------------------------------------------------
// The declared failure vocabulary.
// ---------------------------------------------------------------------------

Deno.test("a job that does not exist is credential_unavailable, not credential_required", async () => {
  // The distinction matters to the retry policy's honesty: "there is no such
  // job" is not a statement about anybody's configuration. Both are terminal,
  // so nothing is retried either way.
  const { service } = doubleService({ jobOwner: null });
  const error = await resolveJobCredential(service, JOB, RING).catch((thrown) => thrown);
  assert(error instanceof JobFailure);
  assertStrictEquals(error.code, "credential_unavailable");
});

Deno.test("a resolver or job-read failure is credential_unavailable", async () => {
  for (const fixture of [{ jobError: true }, { jobOwner: OWNER, rpcError: true }]) {
    const { service } = doubleService(fixture);
    const error = await resolveJobCredential(service, JOB, RING).catch((thrown) => thrown);
    assert(error instanceof JobFailure);
    assertStrictEquals(error.code, "credential_unavailable");
  }
});

Deno.test("no active row is credential_required", async () => {
  const { service } = doubleService({ jobOwner: OWNER, rows: [] });
  const error = await resolveJobCredential(service, JOB, RING).catch((thrown) => thrown);
  assert(error instanceof JobFailure);
  assertStrictEquals(error.code, "credential_required");
});

Deno.test("a row missing any envelope column is credential_required, not a crash", async () => {
  const complete = await envelopeRow(OWNER);
  for (const missing of ["ciphertext", "iv", "key_version", "provider"] as const) {
    const { service } = doubleService({
      jobOwner: OWNER,
      rows: [{ ...complete, [missing]: null }],
    });
    const error = await resolveJobCredential(service, JOB, RING).catch((thrown) => thrown);
    assert(error instanceof JobFailure, `a null ${missing} must not escape as something else`);
    assertStrictEquals(error.code, "credential_required");
  }
});

Deno.test("a non-active status is credential_required even if the envelope is intact", async () => {
  // `BYOK-RESOLVER-005` means the resolver should never return one of these.
  // Belt and braces: if it ever did, the adapter still refuses.
  for (const status of ["invalid", "removed", "", null]) {
    const { service } = doubleService({
      jobOwner: OWNER,
      rows: [{ ...(await envelopeRow(OWNER)), status }],
    });
    const error = await resolveJobCredential(service, JOB, RING).catch((thrown) => thrown);
    assert(error instanceof JobFailure);
    assertStrictEquals(error.code, "credential_required");
  }
});

Deno.test("a wrong master key is credential_unreadable, never a wrong plaintext", async () => {
  const wrong: Bytes = fromBase64(toBase64(new Uint8Array(new ArrayBuffer(32)).fill(9)));
  const { service } = doubleService({ jobOwner: OWNER, rows: [await envelopeRow(OWNER)] });

  const wrongRing: MasterKeyRing = { ...RING, current: wrong };
  const error = await resolveJobCredential(service, JOB, wrongRing).catch((thrown) => thrown);
  assert(error instanceof JobFailure);
  assertStrictEquals(error.code, "credential_unreadable");
});

Deno.test("a row sealed at a version no key covers is unreadable, and offers no clue", async () => {
  // The anti-oracle case for the rotation window. With no previous key
  // configured, a row at an older version is not tried-and-failed: no key is
  // selected for it at all, and the failure is the *same* word a genuinely
  // corrupt row produces.
  const { service } = doubleService({
    jobOwner: OWNER,
    rows: [{ ...(await envelopeRow(OWNER)), key_version: 7 }],
  });

  const error = await resolveJobCredential(service, JOB, RING).catch((thrown) => thrown);
  assert(error instanceof JobFailure);
  assertStrictEquals(error.code, "credential_unreadable");
});

Deno.test("an open window opens a row sealed by the previous key", async () => {
  const previous: Bytes = fromBase64(toBase64(new Uint8Array(new ArrayBuffer(32)).fill(3)));
  const ring: MasterKeyRing = {
    current: MASTER,
    currentVersion: 2,
    previous,
    previousVersion: 1,
    previousExpiresAt: "2099-01-01T00:00:00.000Z",
  };
  const { service } = doubleService({
    jobOwner: OWNER,
    rows: [await envelopeRow(OWNER, { master: previous, keyVersion: 1 })],
  });

  const credential = await resolveJobCredential(service, JOB, ring);

  assertStrictEquals(credential.keyVersion, 1);
  assert(credential.secret instanceof Secret);
});

// ---------------------------------------------------------------------------
// The secret boundary.
// ---------------------------------------------------------------------------

Deno.test("the resolved credential cannot be serialized, logged or interpolated", async () => {
  const { service } = doubleService({ jobOwner: OWNER, rows: [await envelopeRow(OWNER)] });
  const credential = await resolveJobCredential(service, JOB, RING);

  // The three accidental paths, in the order they actually happen in incidents.
  assertThrows(() => JSON.stringify(credential));
  assertThrows(() => `${credential.secret}`);
  assertThrows(() => String(credential.secret));
  assertThrows(() => credential.secret.toString());

  // Including when it is nested inside something innocuous — a job result, a
  // structured log line, an audit payload assembled with a spread.
  assertThrows(() => JSON.stringify({ jobId: JOB, context: { credential } }));
  assertThrows(() => JSON.stringify([credential.secret]));

  // Deno's inspection hook, which `console.log` reaches for first.
  assert(Deno.inspect(credential.secret).includes("BYOK Secret"));
  assert(!Deno.inspect(credential.secret).includes(PLAINTEXT));

  // And the one way out still works, because otherwise the worker could not
  // call the provider at all.
  assertStrictEquals(credential.secret.expose(), PLAINTEXT);
  assert(credential.secret instanceof Secret);
});
