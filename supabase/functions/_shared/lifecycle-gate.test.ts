import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  DEFERRED_JOB_HTTP_STATUS,
  deferJobForInactiveOwner,
  deferredJobResponse,
  OWNER_NOT_ACTIVE_CODE,
  verifyOwnerLifecycle,
} from "./lifecycle-gate.ts";
import { JOB_FAILURE_CODES } from "./job-failure.ts";

/**
 * SH-WORKER-001/002, and the adversarial floor for SH.3's worker half (T-13:
 * suspended work still running).
 *
 * The double is a recording fake in the `executor.test.ts` shape: every call
 * is observable, so the assertions are about **what the gate did to the queue**
 * rather than about what it returned. `deno test` runs with no `--allow-*`
 * flags, so nothing here can reach a network.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";

type FakeOptions = {
  status?: string | null;
  readError?: boolean;
  rpcError?: boolean;
  /**
   * `defer_job_for_inactive_owner` returns SQL NULL when the lease is no longer
   * held. Its own flag rather than `rpcResult: null`, because a nullish default
   * would have swallowed exactly the case this option exists to test.
   */
  rpcReturnsNull?: boolean;
};

function fakeService(options: FakeOptions) {
  const recorder = { rpcCalls: [] as Array<{ name: string; args: unknown }>, reads: 0 };
  const service = {
    from(table: string) {
      assertEquals(table, "account_lifecycle");
      return {
        select() {
          return {
            eq(_column: string, _value: string) {
              return {
                maybeSingle() {
                  recorder.reads += 1;
                  if (options.readError) return { data: null, error: { code: "57014" } };
                  if (options.status === null || options.status === undefined) {
                    return { data: null, error: null };
                  }
                  return { data: { status: options.status }, error: null };
                },
              };
            },
          };
        },
      };
    },
    rpc(name: string, args: unknown) {
      recorder.rpcCalls.push({ name, args });
      if (options.rpcError) return { data: null, error: { code: "42501" } };
      if (options.rpcReturnsNull) return { data: null, error: null };
      return { data: { status: "deferred" }, error: null };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { service: service as any, recorder };
}

Deno.test("an active owner proceeds, and nothing is written", async () => {
  const { service, recorder } = fakeService({ status: "active" });
  const verdict = await verifyOwnerLifecycle(service, OWNER);
  assertEquals(verdict.kind, "active");
  assertEquals(recorder.rpcCalls.length, 0);
});

Deno.test("a suspended owner defers rather than failing -- the job is not destroyed", async () => {
  const { service } = fakeService({ status: "suspended" });
  const verdict = await verifyOwnerLifecycle(service, OWNER);
  assert(verdict.kind === "defer" && verdict.ownerStatus === "suspended");
});

Deno.test("SH-WORKER-002: a deleting owner is terminal, with the existing absent-subject code", async () => {
  const { service } = fakeService({ status: "deleting" });
  const verdict = await verifyOwnerLifecycle(service, OWNER);
  assert(verdict.kind === "terminal" && verdict.code === "subject_not_found");
});

Deno.test("SH-WORKER-002: an owner with no lifecycle row at all is terminal too", async () => {
  const { service } = fakeService({ status: null });
  const verdict = await verifyOwnerLifecycle(service, OWNER);
  assert(verdict.kind === "terminal" && verdict.code === "subject_not_found");
});

Deno.test("an unreadable lifecycle defers -- fail-closed, and destroys nothing", async () => {
  // The distinction that matters: a read error must not become
  // `subject_not_found`, which is terminal and would burn a job over a
  // transient database hiccup.
  const { service } = fakeService({ readError: true });
  const verdict = await verifyOwnerLifecycle(service, OWNER);
  assert(verdict.kind === "defer" && verdict.ownerStatus === "unknown");
});

Deno.test("the deferral calls exactly the declared RPC with the job's own identifiers", async () => {
  const { service, recorder } = fakeService({ status: "suspended" });
  const deferred = await deferJobForInactiveOwner(service, {
    jobId: "job-1",
    workerId: "worker-1",
  });
  assertEquals(deferred, true);
  assertEquals(recorder.rpcCalls.length, 1);
  assertEquals(recorder.rpcCalls[0].name, "defer_job_for_inactive_owner");
  assertEquals(recorder.rpcCalls[0].args, { p_job_id: "job-1", p_worker_id: "worker-1" });
});

Deno.test("a lost lease reports false, the same signal failJob gives", async () => {
  const { service } = fakeService({ status: "suspended", rpcReturnsNull: true });
  assertEquals(
    await deferJobForInactiveOwner(service, { jobId: "job-1", workerId: "worker-1" }),
    false,
  );
});

Deno.test("a refused deferral reports false rather than claiming the job moved", async () => {
  const { service } = fakeService({ status: "suspended", rpcError: true });
  assertEquals(
    await deferJobForInactiveOwner(service, { jobId: "job-1", workerId: "worker-1" }),
    false,
  );
});

Deno.test("the deferral response is 202 and carries the declared code, not a failure", async () => {
  const response = deferredJobResponse("suspended");
  assertEquals(response.status, DEFERRED_JOB_HTTP_STATUS);
  assertEquals(response.status, 202);
  const body = await response.json();
  assertEquals(body, { deferred: true, code: OWNER_NOT_ACTIVE_CODE, ownerStatus: "suspended" });
});

Deno.test("SH-SUSPEND-009: the deferral code is not a job failure code", () => {
  // The three vocabularies share nothing. If `owner_not_active` were a member
  // of the failure set, it could reach `jobs.error` -- which the Jobs page
  // renders verbatim -- and a suspension would read to the user as a broken job.
  assertEquals((JOB_FAILURE_CODES as readonly string[]).includes(OWNER_NOT_ACTIVE_CODE), false);
});
