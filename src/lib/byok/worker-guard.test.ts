import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `BYOK-GUARD-003`, `BYOK-JOBS-008` and `BYOK-CAPTURE-005` — the three static
 * properties of BYOK.4 that no behavioural test can prove, because each is an
 * assertion about what the code **does not contain**.
 *
 * ## Why these are Node tests and not Deno tests
 *
 * `BYOK-GUARD-003` says "a Deno test asserts every job handler resolves a
 * credential from the claimed row's owner before any provider call", and this
 * file is a deviation from that letter, recorded here rather than quietly.
 *
 * The reason is the CI contract for the worker suite: `deno test` runs with **no
 * `--allow-*` flags at all**, deliberately, so it can never reach a network or
 * read a secret. That also means it cannot read a source file, so a source-scan
 * guard is not expressible there. The requirement's substance is split instead:
 *
 *   * the **behaviour** — no provider call, terminal failure, the job's own
 *     owner — is executed in Deno by
 *     `supabase/functions/process-jobs/ownership.test.ts`, against a `fetch`
 *     that fails the test if it is called;
 *   * the **absence** — no second resolution path, no handler that calls a
 *     provider without one — is asserted here, where reading files is allowed.
 *
 * Together they are stronger than the single Deno test the requirement
 * described. Recorded in `docs/reports/BYOK_SLICE_04_ACCEPTANCE.md` as a
 * deviation with its reason, not as a satisfied requirement.
 */

const REPO = path.resolve(__dirname, "../../..");

function read(relative: string): string {
  return readFileSync(path.join(REPO, relative), "utf8").replace(/\r\n/g, "\n");
}

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
}

function walk(root: string): string[] {
  const found: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else found.push(path.relative(REPO, full).replace(/\\/g, "/"));
    }
  };
  const absolute = path.join(REPO, root);
  if (statSync(absolute).isDirectory()) visit(absolute);
  return found;
}

const HANDLERS = ["supabase/functions/process-jobs/entry.ts", "supabase/functions/process-jobs/attachment.ts"];

describe("BYOK-GUARD-003: every worker provider call is behind one resolution", () => {
  it("both handlers resolve through the adapter, and nothing else does", () => {
    const denoFiles = walk("supabase/functions").filter((file) => file.endsWith(".ts"));

    for (const file of denoFiles) {
      const source = code(read(file));
      if (!source.includes("resolveJobCredential")) continue;
      // The adapter itself, its test, the two handlers, and the guard's own
      // fixtures. Anything else calling it would be a third resolution path.
      expect(
        [
          "supabase/functions/_shared/byok-adapter.ts",
          "supabase/functions/_shared/byok-adapter.test.ts",
          ...HANDLERS,
        ],
        `${file} reaches for a credential outside the two job handlers`,
      ).toContain(file);
    }

    for (const handler of HANDLERS) {
      expect(code(read(handler)), `${handler} must resolve a credential`).toMatch(
        /await resolveJobCredential\(service, job\.id\)/,
      );
    }
  });

  it("no provider call is reachable without a credential in hand", () => {
    // Not merely "both appear", and deliberately **not** raw source order —
    // `entry.ts` defines `extractEntry` above the handler that calls it, so a
    // file-position comparison would fail on correct code. The property that
    // actually matters is stronger anyway: every function that contacts the
    // provider takes the credential as a required parameter, so it cannot be
    // invoked without one, and the handler resolves before it calls any of them.
    const entry = code(read("supabase/functions/process-jobs/entry.ts"));

    // Both provider-calling helpers require a `Secret`. A `?` here, or a
    // default, would be the hole.
    expect(entry).toMatch(/async function extractEntry\(input: \{[\s\S]{0,120}credential: Secret;/);
    expect(entry).toMatch(/async function persistEmbedding\(input: \{[\s\S]{0,120}credential: Secret;/);

    // And inside the exported handler, resolution precedes both call sites.
    const handler = /export async function processEntryJob\(([\s\S]*)$/.exec(entry)![1];
    const resolved = handler.indexOf("await resolveJobCredential(service, job.id)");
    expect(resolved, "processEntryJob must resolve a credential").toBeGreaterThan(-1);
    for (const call of ["await extractEntry({", "await persistEmbedding({"]) {
      const index = handler.indexOf(call);
      expect(index, `processEntryJob must ${call}`).toBeGreaterThan(-1);
      expect(resolved, `${call} runs before a credential exists`).toBeLessThan(index);
    }

    // `attachment.ts` calls the provider inline, so position inside the handler
    // is call order there.
    const attachment = code(read("supabase/functions/process-jobs/attachment.ts"));
    const attachmentHandler = /export async function processAttachmentJob\(([\s\S]*)$/.exec(
      attachment,
    )![1];
    expect(
      attachmentHandler.indexOf("await resolveJobCredential(service, job.id)"),
    ).toBeLessThan(attachmentHandler.indexOf("https://api.openai.com"));
  });

  it("no handler decrypts, and no handler reads the master key", () => {
    // The adapter is the only module in either function that may do either.
    for (const handler of HANDLERS) {
      const source = code(read(handler));
      expect(source).not.toMatch(/decryptCredential|requireMasterKey|BYOK_MASTER_KEY/);
    }
  });

  it("the only owner a handler acts on is the job row's", () => {
    for (const handler of HANDLERS) {
      const source = code(read(handler));
      // Every domain read is scoped by `job.user_id`. A read filtered only by an
      // id would be a row the worker could be tricked into touching.
      const ownerScopedReads = source.match(/\.eq\("user_id", job\.user_id\)/g) ?? [];
      expect(ownerScopedReads.length, `${handler} must scope its reads by the job's owner`)
        .toBeGreaterThan(0);
      // And no handler may invent an owner from anywhere else.
      expect(source).not.toMatch(/user\.id|invokingUser|callerId/);
    }
  });
});

describe("BYOK-JOBS-008: the heartbeat performs no AI", () => {
  const heartbeat = "supabase/functions/heartbeat/index.ts";

  it("contacts no provider and reads no credential", () => {
    const source = code(read(heartbeat));

    // Deterministic by design (`docs/AI_AGENT.md`), and this is what keeps it
    // that way: an AI call added here would bypass the entire credential
    // contract, because nothing in this function resolves one.
    expect(source).not.toMatch(/api\.openai\.com/);
    expect(source).not.toMatch(/OPENAI/);
    expect(source).not.toMatch(/resolveJobCredential|resolve_job_ai_credential|resolve_own_ai_credential/);
    expect(source).not.toMatch(/user_ai_credentials/);
    expect(source).not.toMatch(/decryptCredential|BYOK_MASTER_KEY/);
  });

  it("makes no outbound request at all", () => {
    const source = code(read(heartbeat));
    // Stronger than "no OpenAI": the heartbeat's whole job is `pg_cron` →
    // `run_all_heartbeats()`, and it has no reason to call anything over HTTP.
    // A `fetch` appearing here is the shape any future AI addition would take.
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it("still does the thing it exists for, so the assertions above are not vacuous", () => {
    expect(code(read(heartbeat))).toMatch(/run_all_heartbeats/);
  });
});

describe("BYOK-CAPTURE-005: activating a key processes nothing by itself", () => {
  it("the save path enqueues no interpretation work", () => {
    const source = code(read("src/features/byok/actions.ts"));

    // The save action's whole reach: validate, seal, write, revalidate. If it
    // could enqueue, pasting a key would spend the user's money on every entry
    // waiting — the failure this requirement names.
    const save = /export async function saveAiCredential\(([\s\S]*?)\n\}/.exec(source);
    expect(save, "saveAiCredential must exist").not.toBeNull();
    expect(save![1]).not.toMatch(/enqueue_entry_reprocessing|capture_entry_async|kickEntry/);
    expect(save![1]).not.toMatch(/interpretPendingEntries/);
  });

  it("nothing outside the explicit action enqueues pending entries", () => {
    const callers = walk("src")
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      // `database.types.ts` names every table, column and RPC in the schema by
      // construction, so it mentions both and means neither. Excluded by path
      // rather than by a cleverer pattern, because the exclusion is a fact about
      // that one generated file.
      .filter((file) => file !== "src/lib/supabase/database.types.ts")
      .filter((file) => code(read(file)).includes("awaiting_ai_configuration"))
      .filter((file) => code(read(file)).includes("enqueue_entry_reprocessing"));

    // Exactly one module may do both: the action the user presses.
    expect(callers).toEqual(["src/features/byok/actions.ts"]);
  });

  it("the action is bounded, and the bound is a declared constant", () => {
    const source = code(read("src/features/byok/actions.ts"));
    const action = /export async function interpretPendingEntries\(([\s\S]*?)\n\}/.exec(source);
    expect(action, "interpretPendingEntries must exist").not.toBeNull();

    // A `.limit()` with the declared ceiling, not an unbounded select.
    expect(action![1]).toMatch(/\.limit\(PENDING_ENTRY_BATCH_LIMIT \+ 1\)/);
    // And it reports what it did rather than claiming success generically.
    expect(action![1]).toMatch(/\{count\}|String\(enqueued\)/);
  });

  it("the credential gate is checked before any entry is read", () => {
    const source = code(read("src/features/byok/actions.ts"));
    const action = /export async function interpretPendingEntries\(([\s\S]*?)\n\}/.exec(source)![1];

    const gated = action.indexOf('credential?.status !== "active"');
    const selected = action.indexOf('.eq("status", "awaiting_ai_configuration")');
    expect(gated).toBeGreaterThan(-1);
    expect(selected).toBeGreaterThan(-1);
    expect(gated, "the credential must be checked before entries are selected").toBeLessThan(selected);
  });
});
