// 2H-DEADMAN-001 / 2H-SINK-005. The dispatch drain reports its own run, and the
// three outcomes it can report are genuinely different.
//
// The defect these exist against is one this repository has already paid for
// twice: a health signal whose failure case and whose healthy case produce the
// same record. If a claim error and an empty queue both reported
// `success_empty`, the dead-man switch would file its most reassuring answer
// for the one state it was built to catch.
//
// No network and no database: the client is a stub that records what was asked
// of it, which is the only thing under test here.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ENTRY_DISPATCH_JOB_NAME,
  reportDispatchRun,
  runEntryDispatchDrain,
} from "./dispatch.ts";

type RpcCall = { name: string; args: Record<string, unknown> };

function stubClient(
  rpcHandler: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown },
): { client: SupabaseClient; calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const result = rpcHandler(name, args);
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

Deno.test("an empty queue is a successful drain that did no work", async () => {
  const { client } = stubClient(() => ({ data: null }));
  const summary = await runEntryDispatchDrain(client);

  assertEquals(summary.processed, 0);
  assertEquals(summary.claimFailed, false);
});

Deno.test("a claim error is recorded as claimFailed, not as an empty queue", async () => {
  const { client } = stubClient(() => ({ error: { code: "42501" } }));
  const summary = await runEntryDispatchDrain(client);

  // Identical to the empty-queue case in every other field. `claimFailed` is
  // the only thing that distinguishes "found nothing" from "could not look".
  assertEquals(summary.processed, 0);
  assertEquals(summary.claimFailed, true);
});

Deno.test("an idle tick reports a successful run with no useful work", async () => {
  const { client, calls } = stubClient(() => ({ data: null }));
  await reportDispatchRun(client, { processed: 0, claimFailed: false });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "record_scheduled_job_run");
  assertEquals(calls[0].args, { p_job_name: ENTRY_DISPATCH_JOB_NAME, p_did_work: false });
});

Deno.test("a tick that drained jobs reports useful work", async () => {
  const { client, calls } = stubClient(() => ({ data: null }));
  await reportDispatchRun(client, { processed: 3, claimFailed: false });

  assertEquals(calls[0].name, "record_scheduled_job_run");
  assertEquals(calls[0].args, { p_job_name: ENTRY_DISPATCH_JOB_NAME, p_did_work: true });
});

Deno.test("a failed claim reports a FAILED run and never a successful one", async () => {
  const { client, calls } = stubClient(() => ({ data: null }));
  await reportDispatchRun(client, { processed: 0, claimFailed: true });

  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "record_scheduled_job_failure");
  assertEquals(calls[0].args, { p_job_name: ENTRY_DISPATCH_JOB_NAME });
  // The negative half, stated rather than implied: nothing advanced the success
  // clock on the way through.
  assertEquals(calls.some((call) => call.name === "record_scheduled_job_run"), false);
});

Deno.test("a report that itself fails does not throw, so the drain's work still returns", async () => {
  const { client } = stubClient(() => ({ error: { code: "PGRST202" } }));
  await reportDispatchRun(client, { processed: 2, claimFailed: false });
});

Deno.test("the reported job name is the scheduled job's name", () => {
  assertEquals(ENTRY_DISPATCH_JOB_NAME, "my-brain-entry-dispatch");
});
