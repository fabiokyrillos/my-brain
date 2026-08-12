import { createClient } from "npm:@supabase/supabase-js@2";

import { DEFAULT_VAPID_SUBJECT, deliverPush, parseDeliveryRequest } from "./deliver.ts";

/**
 * `2M-NOTIFY-011` — the push sender's entrypoint.
 *
 * ## Why this is its own function rather than a `deliver_push` job type
 *
 * The obvious route was a job in `public.jobs` drained by `process-jobs`, and
 * `jobs.type` carries no CHECK so the row itself would need no schema change.
 * The CLAIM does: every existing claim RPC is type-specific
 * (`claim_attachment_job`, `claim_entry_interpretation_job`), there is no
 * generic one, and adding it would be a FOURTH Phase 2M migration — R-13's
 * stop condition.
 *
 * It also turned out to be unnecessary. `begin_push_delivery`'s partial unique
 * index on in-flight rows already IS the lease: two workers racing the same item
 * cannot both hold it, `attempts` bounds the retry, and `finish_push_delivery`
 * refuses a stale worker. The queue's guarantees were already present in the
 * delivery table, so a job row would have been a second lease over the first.
 *
 * ## Authority
 *
 * Secret-authenticated, exactly like `process-jobs`'s unattended dispatch mode:
 * there is no end-user session behind a background send, and `2M-NOTIFY-011`'s
 * prohibition on `service_role` covers PRODUCT paths — the browser-reachable
 * ones — not the leased worker, which has never had a session and is not
 * reachable from a page.
 *
 * A missing secret does not fall back to open. A missing VAPID pair does not
 * fall back to sending unsigned. Both refuse with a named code, because the
 * failure this function must never have is "sent anyway".
 */

const configurationError: string | null = (() => {
  if (!Deno.env.get("VAPID_PUBLIC_KEY") || !Deno.env.get("VAPID_PRIVATE_KEY")) {
    return "vapid_not_configured";
  }
  if (!Deno.env.get("WORKER_DISPATCH_SECRET")) return "dispatch_secret_not_configured";
  if (!Deno.env.get("SUPABASE_URL") || !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return "worker_not_configured";
  }
  return null;
})();

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  if (configurationError !== null) {
    // The code names which variable is missing, which is safe; nothing here
    // echoes a value, and the private key is never read on this path at all.
    console.error("Sender refused to serve", { code: configurationError });
    return Response.json(
      { error: "Server is not configured", code: configurationError },
      { status: 503 },
    );
  }

  const dispatchSecret = Deno.env.get("WORKER_DISPATCH_SECRET")!;
  if (request.headers.get("x-dispatch-secret") !== dispatchSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request", code: "unparseable" }, { status: 400 });
  }

  const parsed = parseDeliveryRequest(body);
  if (parsed === null) {
    return Response.json({ error: "Invalid request", code: "invalid_request" }, { status: 400 });
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const outcome = await deliverPush(parsed, {
    client: service,
    config: {
      vapidPublicKey: Deno.env.get("VAPID_PUBLIC_KEY")!,
      vapidPrivateKey: Deno.env.get("VAPID_PRIVATE_KEY")!,
      vapidSubject: Deno.env.get("VAPID_SUBJECT") ?? DEFAULT_VAPID_SUBJECT,
    },
    fetch,
    nowSeconds: () => Math.floor(Date.now() / 1000),
  });

  // The response says which control decided and how many devices took it. It
  // names no endpoint, no subscription id and no content, so a caller that logs
  // this wholesale still logs nothing about the user.
  return Response.json({ ok: true, ...outcome });
});
