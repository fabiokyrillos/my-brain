// Deno test suite for the dispatcher's type-routing guard. This file was
// written for `deno test` but could not be executed on this workstation:
// no Deno runtime is installed (see docs/reports/PHASE_2X_SLICE_04_REPORT.md
// for the equivalent verification that was actually run — deployment plus
// the remote smoke). Kept deliberately free of network/database
// dependencies so it stays runnable in CI once a Deno step exists.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSupportedJobType, SUPPORTED_JOB_TYPES } from "./dispatch.ts";

Deno.test("SUPPORTED_JOB_TYPES lists exactly the two job types the worker understands", () => {
  assertEquals(SUPPORTED_JOB_TYPES, ["process_attachment", "interpret_entry"]);
});

Deno.test("isSupportedJobType accepts process_attachment", () => {
  assertEquals(isSupportedJobType("process_attachment"), true);
});

Deno.test("isSupportedJobType accepts interpret_entry", () => {
  assertEquals(isSupportedJobType("interpret_entry"), true);
});

Deno.test("isSupportedJobType rejects an unknown type instead of guessing a processor", () => {
  assertEquals(isSupportedJobType("send_email"), false);
});

Deno.test("isSupportedJobType rejects non-string values", () => {
  assertEquals(isSupportedJobType(null), false);
  assertEquals(isSupportedJobType(undefined), false);
  assertEquals(isSupportedJobType(42), false);
  assertEquals(isSupportedJobType({ type: "interpret_entry" }), false);
});

Deno.test("isSupportedJobType rejects the empty string", () => {
  assertEquals(isSupportedJobType(""), false);
});
