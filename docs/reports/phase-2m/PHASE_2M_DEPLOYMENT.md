# Phase 2M — deployment record

**Authorization:** ADR-105, extended by **ADR-106** to **`3 allocated ·
NON-TRANSFERABLE`**. A **fourth** is a stop condition.

This file records each migration's application to the **hosted** project, the
parity reading that followed, and the hosted proof. Everything below was
**executed**; nothing is inferred.

**All three are now spent and deployed.** The budget closes at **3 allocated · 3
spent**, and hosted parity is **`202608120092`** across **92 migrations**.

---

## Migration 1 — `202608110090_phase_2m_daily_cycle_telemetry.sql`

**Slice 2M.1, part 1.** The daily-cycle telemetry vocabulary and the `calendar`
surface, spent **before any producer exists** (`2M-METRICS-001`).

### 1. Provenance

| | |
|---|---|
| Pull request | **#168**, merged |
| Implementation SHA | `a5ed76b529402eedff54ccb56d646b26f741a131` |
| **Merge SHA** | **`6ca03142fa3bd4ef09f973b97f830ef7907a67c1`** |
| CI on the implementation SHA | run `31497188527` — **success**, all three jobs |
| **CI on the exact merge SHA** | run `31497762173` — **success**, all three jobs |
| Working tree at deployment | clean; the migration file **byte-identical** to the merge SHA (`sha256 6cdc61fd2e2a36862a8c8d11dbebd9e010d58f96ddf86e2a41e535951d7ed9ce`, compared against `git cat-file -p 6ca0314:…`) |

The `database` CI job is the one that matters most here: it applies **the whole
migration chain from an empty database**, runs `supabase db lint`, and executes
the full pgTAP suite — including the 39-assertion
`post_2j_product_event_write_path.sql`. It passed on both SHAs.

### 2. The dry run — exactly one pending migration

```
$ npx supabase db push --dry-run --linked
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 202608110090_phase_2m_daily_cycle_telemetry.sql
```

Read **before** the push, and it is the check that would have caught an
unexpected second file riding along.

### 3. Application

```
$ npx supabase db push --linked
Applying migration 202608110090_phase_2m_daily_cycle_telemetry.sql...
Finished supabase db push.
```

Applied **2026-08-11**. The migration's own verification blocks ran inside that
apply and would have aborted it: the event-name CHECK was widened without losing
a pre-existing name; the validator knows all six new names and lost none; the
CHECK and the validator agree **name-by-name**, refusing to run vacuously below
36 names; the surface CHECK admits `calendar` and lost nothing; the writer
carries **no** vocabulary copy, checked name-by-name from the catalog; and RLS,
forced RLS, the policy set, `service_role`'s absence of SELECT and DELETE, the
append-only posture and the writer's `security definer` / empty `search_path`
are all unchanged.

### 4. Parity — read live, read-only

```
$ npx supabase migration list --linked
   …
   202608090088 | 202608090088 | 202608090088
   202608090089 | 202608090089 | 202608090089
   202608110090 | 202608110090 | 202608110090
```

| | |
|---|---|
| Reading taken | **2026-08-11** |
| Hosted parity **before** | `202608090089` (89 migrations) |
| Hosted parity **after** | **`202608110090`** (**90** migrations) |
| Local = remote | **yes**, every row, no gap and no orphan |
| Migration budget | **`2 allocated · 1 spent`** |

### 5. The hosted proof — every event and every surface, through the real writer

Two harnesses were run against the deployed project. Both create disposable
owners through the admin API (signup is closed and stays closed), write only
`is_synthetic = true` rows, and delete their owners in a `finally`.

#### 5.1 `npm run test:remote:product-events`

```
Remote product-events smoke passed: {
  taxonomyEvents: 39,
  ownerVisibleRows: 42,
  conversion: { captureStarted: 2, captureSaved: 1, processingCompleted: 2 },
  latencySamplesMs: [ 4, 5, 6, 7, 1 ],
  controls: [ 'allowlist', 'privacy', 'idempotency', 'distinct-interactions',
              'subject-ownership', 'RLS', 'service-role', 'bounded-response',
              'synthetic-cleanup' ]
}
```

Every one of the **39** declared event names was written through the real
**authenticated** writer `public.record_product_event` on the deployed project,
each on the surface it will carry — including all six Phase 2M events, four of
them on the `calendar` surface.

**Two defects had to be repaired before this could run at all, and they are the
finding of this deployment:**

1. **The smoke had been unrunnable since `202608070081`.** Its first assertion
   compares its hand-written event matrix to `productEventNames` by **exact
   ordered equality**, and the matrix stopped at Phase 2E's four names. Phase 2H
   added one, Phase 2J three and Phase 2K three, and each time the gap widened
   in silence — because a manual script that is never run reports nothing at all.
   `2E-ANALYTICS-006`'s vocabulary reader stopped the smoke from *drifting*;
   nothing stopped it from being *abandoned*. Thirteen names were added, and the
   assertion is meaningful again.
2. **It signed in with `grant_type=password`**, which Turnstile has refused since
   Signup Hardening SH.5. It now mints a session through
   `admin/generate_link` + `verifyOtp`, the CAPTCHA-free path
   `sh5-password-policy-probe.mjs` established.

#### 5.2 `npm run measure:2m:proof`

The producer → writer → **consumer** proof, reading through the consumer's own
code path rather than a query invented for the occasion:

```
Q1  Calendar opened: 4       day 1 · week 2 · agenda 1
Q2  Planning actions: 3      set 2 · cleared 1 · in bulk 2 · items touched 10
Q3  Reviews opened: 4        day 2 → acted 2 (100%) · next_day 2 → acted 0 (0%)
                             carry_forward 1 · reschedule 1
Q4  Notifications silenced: 3  quiet_hours 2 · daily_cap 1
    Consent transitions: 2     granted 1 · revoked 1
```

Every aggregate matched the corpus exactly. Six controls, all **non-vacuous**:

| Control | Result |
|---|---|
| An undeclared event name (`calendar_day_viewed`) | refused `22023` |
| An undeclared surface (`planner`) | refused `22023` |
| **A user-chosen date** (`plannedDate`) on a valid event **and** a valid surface | refused `22023` |
| An out-of-enum `orientation` on the `calendar` surface | refused `22023` |
| A replayed idempotency key | recorded **once**, same `event_id` |
| RLS bound, tested against a **row that exists** and belongs to somebody else | not read |

The last one is the shape that matters: the consumer's isolation is proved
against a foreign row that was really written, never against an empty database.

**A third defect was found here and corrected in both places it appeared.** The
reader selected, filtered and ordered by `product_events.occurred_at`, and that
**column does not exist** — the ledger's only timestamp is `created_at`
(`202607170024:51`). PostgREST answered *"column product_events.occurred_at does
not exist"* on the first run. `scripts/phase-2k-conversation-funnel-reader.mjs`
carried the identical defect **and** the identical CAPTCHA defect, so Phase 2K's
declared consumer could never have executed either; both are corrected in the
same change, and `phase-2m-telemetry-guard.test.ts` now derives the ledger's real
column list from `202607170024` and fails any consumer that reads a column the
table does not have.

### 6. Zero residue, proved owner-scoped

```
zero residue: no disposable owner survives, so none of their rows can.
total auth users: 2
residual phase-2x-events fixtures: 0
```

`product_events` is **unreadable to `service_role`** — no SELECT and no DELETE —
so a global row count could not prove anything here even if someone tried. The
honest evidence is that **no owner of those rows survives**: every disposable
account was deleted, and `auth.users` was enumerated afterwards to confirm none
with either fixture prefix remained. The rows are gone by cascade.

### 7. What this deployment does **not** prove

Stated rather than smoothed, because a harness is not a producer and recording
one as the other is how `R-09` gets violated with a green run:

- **The producer half is not proved**, because at this commit **there is no
  producer** — which is `2M-METRICS-001`'s whole point, and the reason this
  migration was merged and deployed before the calendar exists. The corpus in
  §5.2 was written by a harness standing in for the calendar, the planner, the
  day review and the notification sender.
- Those producers arrive in **slice 2M.1 part 2** (`calendar_viewed`), **2M.2**
  (`day_planned`), **2M.3** (`day_review_opened`, `day_review_action_applied`),
  **2M.4a** (`notification_consent_changed`) and **2M.4b**
  (`notification_suppressed`). Each slice's acceptance record carries its own
  producer evidence, and `2M-METRICS-003` closes only when every one of the six
  has a real producer **and** the reader that already reads it.

### 8. What this deployment did not touch

No RLS change, no grant, no policy, no Auth or GoTrue setting, no `config.toml`
push, no Edge Function deploy, no schedule, no cron job, no retention sweep, no
secret, no signup change, no rollout execution, no provider call, no BYOK use.
The migration asserts the unchanged posture rather than assuming it, and those
assertions ran during the apply.

---

## Migrations 2 and 3 — `202608110091_phase_2m_clear_planned.sql` and `202608120092_phase_2m_push_delivery.sql`

Applied together on **2026-08-12**, in chain order, after the merge and with CI
green on the exact merge SHA.

### 1. Provenance

| | |
|---|---|
| PR | #183, merged 2026-08-12T12:51:14Z |
| Merge SHA | `5a202048ee82643d7528117b2c92affa46614840` |
| CI on the exact merge SHA | **green 3/3** — `application`, `database and journey`, `edge worker` — verified **before** anything was pushed |
| Working tree at deployment | clean; both migration files **byte-identical** to the merge SHA |
| `202608110091` sha256 | `bf295ee83a14baab7c64f543fc4dc2a706092dc5e707ef2386c51d63dadb6b69` |
| `202608120092` sha256 | `554755641cc457831b13d7d4f890ee3d594d1cc3dcd3a5f5a72d96056f31ccf5` |

Both hashes were taken from the working tree and compared against
`git cat-file -p 5a20204:<path>`, not against a remembered value.

### 2. The dry run — exactly two pending migrations, in this order

```
Would push these migrations:
 - 202608110091_phase_2m_clear_planned.sql
 - 202608120092_phase_2m_push_delivery.sql
```

**No third migration appeared.** A third would have been the stop condition, and
the dry run is where it would have shown up.

### 3. Application

Both applied cleanly, `202608110091` first and `202608120092` second — the order
the CLI takes from the chain and the order required.

The push migration's self-checks ran **inside its own apply**: no
content-bearing column on any of the three tables, forced RLS on all three, no
write policy for `authenticated`, and the notification telemetry vocabulary
already deployed by migration 1 — a producer that predates its vocabulary is
`R-11`, and this migration refuses to install ahead of it.

### 4. Parity — read live, read-only

`npx supabase migration list --linked`, parsed row by row:

```
rows=92 mismatched=0
head=202608120092
LOCAL = REMOTE ON EVERY ROW
```

**Hosted parity moves from `202608110090` to `202608120092`; 92 migrations.**

### 5. The Edge Function

`npx supabase functions deploy send-push --use-api --no-verify-jwt`. `--use-api`
because there is no local Docker; `--no-verify-jwt` explicitly as well as
declared in `config.toml`, so the deployed state is unambiguous regardless of
which the CLI honours.

`npm run verify:edge-parity` afterwards:

```
send-push    2026-08-12T12:57   2026-08-12T11:30   ok
every deployed function is at or ahead of its source
```

**No `config push` was run.** That command is all-or-nothing and would open
signup as a side effect; the `[functions.send-push]` block is read locally by
`functions deploy`.

### 6. The secrets, confirmed by name and digest and never by value

| environment | secret | state |
|---|---|---|
| Edge Functions | `VAPID_PRIVATE_KEY` | present, updated 2026-08-12T10:16Z |
| Edge Functions | `VAPID_PUBLIC_KEY` | present, updated 2026-08-12T10:16Z |
| Edge Functions | `WORKER_DISPATCH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | present |
| Vercel (Preview + Production) | `VAPID_PUBLIC_KEY` | present, `Sensitive` |
| Vercel | `VAPID_PRIVATE_KEY` | **absent, and that is the requirement** |

No value was read, printed, logged or written anywhere.

### 7. The application

Vercel deployed production from the merge commit automatically, four seconds
after the merge (`Ready`, created 2026-08-12T12:51:18Z). The `VAPID_PUBLIC_KEY`
variable was already configured for Production before that build, so the settings
surface reads it rather than rendering the "not available" sentence.

### 8. The deployed sender answers, and its refusals are its own

| request | result |
|---|---|
| `POST` with no `x-dispatch-secret` | **401** `{"error":"Unauthorized"}` |
| `POST` with a wrong secret | **401** `{"error":"Unauthorized"}` |
| `GET` | **405** `{"error":"Method not allowed"}` |

Two things are proved here that a green deploy alone would not show.

**The gateway is forwarding.** These bodies are the function's own, not a
platform JWT error — so `verify_jwt = false` took effect. Under the platform
default the gateway would have answered 401 **before the function ran**, and the
symptom would have been "nothing is ever sent" with nothing in the function's own
logs.

**Every environment variable is visible to the deployed function.** The POST path
checks configuration *before* the secret and returns `503 vapid_not_configured`
when either VAPID half is missing. It returned **401, not 503** — so both halves,
the dispatch secret and the service credentials are all present in the running
function. Established without reading any of them.

### 9. The hosted proof — `npm run prove:2m:push`

**47 of 47 claims passed** against the deployed project, through real PostgREST,
under real roles, with RLS actually enforced rather than emulated by
`set local role`:

- consent granted from a real subscription, and **absence refusing** with no row
  required to say so;
- a refusal leaving **no partial write**;
- non-https, loopback, private-range and `user:pass@`-smuggled endpoints refused;
- a client unable to claim `granted`;
- **T-01** — owner B sees zero of A's subscriptions *from B's own session*, and
  registering the **same endpoint** succeeds rather than erroring, because an
  error would be an existence oracle;
- all six controls, each naming itself: `type_muted`, `quiet_hours`, `duplicate`,
  `cooldown`, `daily_cap`, `not_consented`;
- quiet hours and the cap read back from **`agent_preferences`**, proving the
  reuse rather than a second copy;
- **both retry ceilings** — the third delivery failure retires the delivery, the
  third device strike retires the device, and the consent expires with the last
  device;
- a **gone** subscription retired at once with no strikes;
- a finished delivery never re-finished by a stale worker;
- **T-09** — revocation in one step, idempotent, nothing deliverable after;
- the audit exposing **no content-bearing column**, every `dedupe_hash` a digest,
  every suppression reason one of the declared six, and no delivered row carrying
  one;
- an authenticated caller unable to drive the sender (`42501`) or insert its own
  consent (`42501`);
- three non-vacuous negative controls: an undeclared type, a record identifier
  where a digest belongs, and a cap beyond the column's bound.

One claim is deliberately stated weaker than it looks: the retention sweep check
proves only that `private.prune_notification_deliveries` is unreachable **through
the data API**, because PostgREST does not expose the `private` schema at all.
The privilege itself — no role, not even `service_role` — is proved in pgTAP.
Recording the weaker claim as the stronger one is the probe-side defect this
repository has paid for repeatedly.

### 10. Cleanup and zero residue

Both disposable owners deleted in a `finally`. Residue proved **owner-scoped**,
per table and per owner — six reads, all zero — then confirmed globally:

```
push-proof fixture accounts remaining: 0
total project accounts: 2
notification_consents      total rows on project = 0
push_subscriptions         total rows on project = 0
notification_deliveries    total rows on project = 0
```

### 11. What this deployment does **not** prove

**No push has been delivered to any device.** No push service was contacted, and
the VAPID private key was never read by anything in this run. The sender's
cryptography is proved correct against RFC 8291 section 5's published vector
**byte for byte**, which is a strong claim about the bytes and says nothing about
a phone. Real delivery on iOS and Android is the **owner's hardware checkpoint**
(OD-2M-5), it blocks closeout, and nothing here discharges it.

**No screen reader has read the surface.** `2M-ACCESS-007` is owner-run.

**Nothing calls the sender automatically.** There is no producer, no schedule and
no cron entry: wiring the heartbeat to enqueue a push would need a claim RPC and
therefore a fourth migration, which is the stop condition. The sender is invoked
explicitly, and that remainder is stated rather than implied.

### 12. What this deployment did not touch

No Auth or GoTrue setting, no `config.toml` push, no schedule, no cron job, no
retention sweep armed, no signup change, no rollout execution, no provider call,
no BYOK use, and no change to any pre-existing table's RLS, grants or policies.

---

## Sender redeploy — content-free failure diagnostics (2026-08-12)

Triggered by a **hardware failure**, not by a schema change. No migration, no
parity movement: hosted parity stays `202608120092` at 92 migrations.

### 1. Why

An iPhone with the PWA installed and permission granted reported
`ok=true status=sent delivered=0 retired=0 failed=1`, and nothing arrived. The
function's logs held **only boot and shutdown**: both of the sender's failure
paths appended to `failed` and said nothing, so an Apple rejection, a bad VAPID
signature, a transport error and a malformed subscription were one
indistinguishable observation.

That was an observability defect in the sender. It is recorded as such rather
than as a platform problem.

### 2. Provenance

| | |
|---|---|
| PR | #185, merged as `609ee5b72ba81dd6e1d6f5ba3fbcad00a600ea64` |
| CI on the exact merge SHA | **green 3/3** |
| Deployed | 2026-08-12T14:11, `--use-api --no-verify-jwt` |
| `verify:edge-parity` | `send-push … ok`, every function at or ahead of its source |

### 3. Byte-identity, stated precisely rather than loosely

The five uploaded files were compared against the merge SHA's blobs and are
**byte-identical**. Getting there required a step worth recording: on a Windows
checkout the working tree holds **CRLF** while the blob holds **LF**, because
`.gitattributes` pins `*.sql text eol=lf` and says nothing about `*.ts`. A naive
comparison therefore reported four mismatches whose content was identical.

The files were normalised to LF before the upload, proved byte-identical, and the
working tree restored afterwards. **The earlier migration deployment's
byte-identity claim is unaffected and remains exact**, because `*.sql` is pinned.

**Remainder, not closed here:** `.gitattributes` does not pin `*.ts`, so this
normalisation is manual on every Windows deploy of an Edge Function. Pinning it
would renormalise a large number of files and belongs in its own change.

### 4. What the sender now reports

A **closed twelve-value category** per failed attempt, plus the **HTTP status**
when the push service actually answered — `gone`, `unauthorized`, `bad_request`,
`payload_too_large`, `rate_limited`, `server_error`, `unexpected_status`,
`host_not_allowed`, `subscription_malformed`, `vapid_key_malformed`,
`network_error`, `unknown_error`.

**Nothing else travels**: no endpoint, no subscription id, no owner, no key, no
payload, and no text from the push service's response. A thrown value is matched
by exact equality against the closed set this repository's own crypto module
throws; everything else collapses to `network_error` or a deliberately opaque
`unknown_error`. A test plants markers in all seven of those and asserts none
reaches the outcome or the console.

**Retirement is unchanged: still exactly 404/410**, asserted across
`404, 410, 403, 500, 429, 400`. A `401` now has a name so it can be seen, and
still must not retire a device — a rejected signature is our configuration being
wrong, not the browser having discarded anything.

### 5. The hypothesis under test, and what is already known about it

The cryptography is **not** the suspect and was not touched: it is structurally
equivalent to a known-working deployment and is additionally proved against
**RFC 8291 section 5's published vector, byte for byte**.

The difference is the VAPID `sub`. RFC 8292 defines it as an address the push
service operator can be contacted at, and Apple is documented as strict. This
deployment's default is `mailto:ops@my-brain.invalid`; `.invalid` is RFC 2606
reserved and can never resolve.

**Read on the deployed project: `VAPID_SUBJECT` is NOT configured**, so the
running function is using that default, and the sender will therefore report
`subject: "reserved"`. The half of the diagnostic that needed no hardware is
already answered; **the push service's status code is the part only a device can
supply.**

### 6. Live confirmation of the redeploy

`POST` without the dispatch secret still answers **401 and not 503**, which is
again the proof that every environment variable is visible to the running
function — and the body is the function's own, so `verify_jwt = false` still
holds after the redeploy.

### 7. What is NOT changed, deliberately

`Urgency: normal` and the TTL value differ from the reference deployment and were
**left alone**. Changing them in the same redeploy would make the next hardware
run ambiguous about which change mattered. They are candidate follow-ups, each to
be proved on its own.
