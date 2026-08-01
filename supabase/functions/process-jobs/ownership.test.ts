import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { processEntryJob } from "./entry.ts";
import { processAttachmentJob } from "./attachment.ts";

/**
 * `BYOK-GUARD-003`, `BYOK-JOBS-001`/`003`/`006`, and gates D3, D5, D6, D7.
 *
 * Executed against both handlers, with `fetch` replaced by a recorder that
 * **fails the test if it is called at all**. That inversion is the point: the
 * requirement is not "the provider returns an error when there is no key", it is
 * *"the provider is never contacted"*, and only a fetch that cannot succeed can
 * prove the difference.
 *
 * ## Why these cases and not the decrypt path
 *
 * `deno test` runs with no `--allow-env` (CI, by design — the suite must never
 * be able to reach a real endpoint or read a real secret). `resolveJobCredential`
 * only touches `Deno.env` when it has an envelope to open, and returns
 * `credential_required` / `credential_unavailable` **before** that. So the
 * no-credential paths — which are exactly the ones this slice exists to get
 * right — are fully exercisable here, and the decrypt path is covered by
 * `_shared/byok-adapter.test.ts`, which injects a key of its own.
 */

const OWNER: string = "11111111-1111-4111-8111-111111111111";
const OTHER: string = "22222222-2222-4222-8222-222222222222";
const ENTRY: string = "44444444-4444-4444-8444-444444444444";
const ATTACHMENT: string = "55555555-5555-4555-8555-555555555555";

type RpcCall = { name: string; args: Record<string, unknown> };

type Fixture = {
  /** Rows `resolve_job_ai_credential` answers with. Empty means "no key". */
  credentialRows?: unknown[];
  entryOwner?: string;
  attachmentOwner?: string;
};

function workerDouble(fixture: Fixture) {
  const rpcCalls: RpcCall[] = [];
  const tableReads: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

  function builder(table: string) {
    const read = { table, filters: {} as Record<string, unknown> };
    tableReads.push(read);
    const chain = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      neq: () => chain,
      eq(column: string, value: unknown) {
        read.filters[column] = value;
        return chain;
      },
      update(values: Record<string, unknown>) {
        updates.push({ table, values });
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: rowFor(table, read.filters), error: null }),
      single: () => Promise.resolve({ data: rowFor(table, read.filters), error: null }),
      then: undefined,
    };
    return chain;
  }

  function rowFor(table: string, filters: Record<string, unknown>) {
    if (table === "jobs") return { user_id: OWNER };
    if (table === "entries") {
      // The handler filters on (id, user_id). A double that ignored the owner
      // filter would let a foreign-owner bug pass, so it is honoured here.
      if (filters.user_id !== (fixture.entryOwner ?? OWNER)) return null;
      return { id: ENTRY, original_content: "uma anotação", locale: "pt-BR", status: "saved" };
    }
    if (table === "attachments") {
      if (filters.user_id !== (fixture.attachmentOwner ?? OWNER)) return null;
      return {
        id: ATTACHMENT,
        storage_path: "user/file.png",
        mime_type: "image/png",
        status: "uploaded",
      };
    }
    if (table === "attachment_interpretations") return null;
    if (table === "agent_preferences") return null;
    return null;
  }

  const service = {
    from: builder,
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === "resolve_job_ai_credential") {
        return Promise.resolve({ data: fixture.credentialRows ?? [], error: null });
      }
      if (name === "fail_job_terminal") return Promise.resolve({ data: { status: "exhausted" }, error: null });
      if (name === "fail_job") return Promise.resolve({ data: { status: "failed" }, error: null });
      if (name === "mark_entry_awaiting_ai_configuration") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    storage: {
      from: () => ({
        createSignedUrl: () =>
          Promise.resolve({ data: { signedUrl: "https://example.invalid/x" }, error: null }),
      }),
    },
    // deno-lint-ignore no-explicit-any
  } as any;

  return { service, rpcCalls, tableReads, updates };
}

/** Replaces `fetch` with something that cannot succeed, and reports if it ran. */
function forbidProviderCalls() {
  const original = globalThis.fetch;
  const attempts: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    attempts.push(String(input));
    return Promise.reject(new Error("the provider must not be contacted"));
  }) as typeof fetch;
  return {
    attempts,
    restore() {
      globalThis.fetch = original;
    },
  };
}

// ---------------------------------------------------------------------------
// Entries.
// ---------------------------------------------------------------------------

Deno.test("an entry job with no active credential contacts no provider", async () => {
  const provider = forbidProviderCalls();
  try {
    const { service, rpcCalls } = workerDouble({ credentialRows: [] });
    const response = await processEntryJob(
      service,
      { id: "job-1", user_id: OWNER, attempts: 1, payload: { entry_id: ENTRY, mode: "initial" } },
      "worker-1",
    );

    // Gate D3, in its strongest form.
    assertEquals(provider.attempts, [], "no provider request may be made");

    // Gate D5: terminal, and through the RPC that schedules nothing.
    const failure = rpcCalls.find((call) => call.name.startsWith("fail_job"));
    assert(failure, "the job must be failed");
    assertStrictEquals(failure.name, "fail_job_terminal");
    // Gate D6: a declared code, and nothing else.
    assertStrictEquals(failure.args.p_error, "credential_required");
    assert(!rpcCalls.some((call) => call.name === "fail_job"), "no retry may be scheduled");

    assertStrictEquals(response.status, 500);
    assertEquals(await response.json(), { error: "Processing failed", code: "job_exhausted" });
  } finally {
    provider.restore();
  }
});

Deno.test("the entry is returned to the awaiting state, under the job's own owner", async () => {
  const provider = forbidProviderCalls();
  try {
    const { service, rpcCalls } = workerDouble({ credentialRows: [] });
    await processEntryJob(
      service,
      { id: "job-1", user_id: OWNER, attempts: 1, payload: { entry_id: ENTRY, mode: "initial" } },
      "worker-1",
    );

    const marked = rpcCalls.find((call) => call.name === "mark_entry_awaiting_ai_configuration");
    assert(marked, "a credential failure must return the entry to the awaiting state");
    assertStrictEquals(marked.args.p_entry_id, ENTRY);
    // The owner is the job's, never a caller's.
    assertStrictEquals(marked.args.p_service_user_id, OWNER);
    assert(marked.args.p_service_user_id !== OTHER);

    // And emphatically **not** the error path that offers a retry.
    assert(
      !rpcCalls.some((call) => call.name === "fail_entry_interpretation"),
      "a missing key is not an interpretation failure the user can retry",
    );
  } finally {
    provider.restore();
  }
});

Deno.test("the credential is resolved before the entry is moved into interpreting", async () => {
  // Order, not merely presence. If `begin_entry_interpretation` ran first, an
  // entry would sit in `interpreting` for an account that cannot interpret —
  // which is the dishonesty `BYOK-CAPTURE-002` exists to remove.
  const provider = forbidProviderCalls();
  try {
    const { service, rpcCalls } = workerDouble({ credentialRows: [] });
    await processEntryJob(
      service,
      { id: "job-1", user_id: OWNER, attempts: 1, payload: { entry_id: ENTRY, mode: "initial" } },
      "worker-1",
    );

    const resolved = rpcCalls.findIndex((call) => call.name === "resolve_job_ai_credential");
    const began = rpcCalls.findIndex((call) => call.name === "begin_entry_interpretation");
    assert(resolved >= 0, "the handler must resolve a credential");
    assert(began === -1, "nothing may be begun when there is no credential");

    // Nothing was recorded against the usage ledger either.
    assert(!rpcCalls.some((call) => call.name === "record_ai_usage"));
  } finally {
    provider.restore();
  }
});

Deno.test("the entry is loaded by both id and the job's owner", async () => {
  const provider = forbidProviderCalls();
  try {
    const { service, tableReads } = workerDouble({ credentialRows: [] });
    await processEntryJob(
      service,
      { id: "job-1", user_id: OWNER, attempts: 1, payload: { entry_id: ENTRY, mode: "initial" } },
      "worker-1",
    );

    const entryRead = tableReads.find((read) => read.table === "entries");
    assert(entryRead, "the handler must reload the entry");
    assertStrictEquals(entryRead.filters.id, ENTRY);
    assertStrictEquals(entryRead.filters.user_id, OWNER);
  } finally {
    provider.restore();
  }
});

Deno.test("an invalid payload is terminal and carries only a declared code", async () => {
  const provider = forbidProviderCalls();
  try {
    const { service, rpcCalls } = workerDouble({ credentialRows: [] });
    await processEntryJob(
      service,
      { id: "job-1", user_id: OWNER, attempts: 1, payload: { entry_id: "not-a-uuid", mode: "initial" } },
      "worker-1",
    );

    assertEquals(provider.attempts, []);
    const failure = rpcCalls.find((call) => call.name.startsWith("fail_job"));
    assertStrictEquals(failure?.name, "fail_job_terminal");
    assertStrictEquals(failure?.args.p_error, "invalid_payload");
    // The payload is immutable, so retrying re-reads the same invalid JSON.
    assert(!rpcCalls.some((call) => call.name === "fail_job"));
  } finally {
    provider.restore();
  }
});

// ---------------------------------------------------------------------------
// Attachments — `BYOK-JOBS-007`, gate D12.
// ---------------------------------------------------------------------------

Deno.test("an attachment job with no active credential contacts no provider either", async () => {
  const provider = forbidProviderCalls();
  try {
    const { service, rpcCalls, updates } = workerDouble({ credentialRows: [] });
    await processAttachmentJob(
      service,
      { id: "job-2", user_id: OWNER, attempts: 1, payload: { attachment_id: ATTACHMENT } },
      "worker-2",
    );

    assertEquals(provider.attempts, [], "no provider request may be made");

    const failure = rpcCalls.find((call) => call.name.startsWith("fail_job"));
    assertStrictEquals(failure?.name, "fail_job_terminal");
    assertStrictEquals(failure?.args.p_error, "credential_required");

    // And the attachment is never shown as processing for an account that
    // cannot process it.
    assert(
      !updates.some(
        (update) => update.table === "attachments" && update.values.status === "processing",
      ),
      "the attachment must not be marked processing before a credential resolves",
    );
  } finally {
    provider.restore();
  }
});

Deno.test("the attachment failure message names Settings rather than offering a retry", async () => {
  const provider = forbidProviderCalls();
  try {
    const { service, updates } = workerDouble({ credentialRows: [] });
    await processAttachmentJob(
      service,
      { id: "job-2", user_id: OWNER, attempts: 1, payload: { attachment_id: ATTACHMENT } },
      "worker-2",
    );

    const failed = updates.find(
      (update) => update.table === "attachments" && update.values.status === "failed",
    );
    assert(failed, "the attachment must record its failure");
    const message = String(failed.values.processing_error);
    assert(message.includes("Configurações"), `the message must point at Settings: ${message}`);
    assert(
      !message.includes("tentada novamente"),
      "a missing key must not be reported as something to try again",
    );
  } finally {
    provider.restore();
  }
});

Deno.test("the attachment is loaded by both id and the job's owner", async () => {
  const provider = forbidProviderCalls();
  try {
    const { service, tableReads } = workerDouble({ credentialRows: [] });
    await processAttachmentJob(
      service,
      { id: "job-2", user_id: OWNER, attempts: 1, payload: { attachment_id: ATTACHMENT } },
      "worker-2",
    );

    const read = tableReads.find((entry) => entry.table === "attachments");
    assert(read);
    assertStrictEquals(read.filters.id, ATTACHMENT);
    assertStrictEquals(read.filters.user_id, OWNER);
  } finally {
    provider.restore();
  }
});
