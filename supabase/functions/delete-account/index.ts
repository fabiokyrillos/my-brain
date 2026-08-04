/**
 * The account-deletion executor's HTTP entrypoint (ADR-074, SH-DELETE-004).
 *
 * The state machine itself is `executor.ts`, imported here. The split is not
 * cosmetic: `Deno.serve` binds a port at module scope, so a test importing
 * this file would need `--allow-net` — and the worker suite runs with **no**
 * `--allow-*` flags by design, precisely so it can never reach a real
 * endpoint. Keeping the machine in a module the tests can import is what lets
 * every branch of it be executed under that restriction.
 *
 * ## Self-only, structurally
 *
 * The request body carries **no target account**. The owner is derived from
 * the Bearer token this request presents, validated server-side, and the
 * machine is called with that id and nothing else. There is no parameter an
 * attacker could point at somebody else's account (T-01): the over-broad
 * admin endpoint the threat model calls out cannot be built here by accident,
 * because the shape of the input does not admit it.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { executeDeletion } from "./executor.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(url, serviceRole, { auth: { persistSession: false } });

  // The ONLY source of the account being deleted. No body parameter is read
  // for identity — there is nothing to point elsewhere.
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized", code: "missing_bearer" }, { status: 401 });
  }
  const { data: { user }, error: userError } = await service.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (!user) {
    console.error("Access token validation failed", { status: userError?.status });
    return Response.json({ error: "Unauthorized", code: "invalid_access_token" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requesterSessionHash =
    typeof body.requesterSessionHash === "string" && /^[0-9a-f]{64}$/.test(body.requesterSessionHash)
      ? body.requesterSessionHash
      : null;
  const requestedAt =
    typeof body.requestedAt === "string" ? body.requestedAt : new Date().toISOString();

  const result = await executeDeletion(service, user.id, requestedAt, requesterSessionHash);

  // The response carries counts and a declared code, never a path, an
  // identifier or an internal message (SH-DELETE-010).
  if (result.outcome === "stopped") {
    return Response.json(
      { outcome: "stopped", code: result.stopReason, objectsRemoved: result.objectsRemoved },
      { status: 409 },
    );
  }
  return Response.json({
    outcome: "completed",
    objectsRemoved: result.objectsRemoved,
    bytesRemoved: result.bytesRemoved,
  });
});
