# Phase 2H — Slice 2H.3 acceptance: distributed rate limiting

**Slice:** 2H.3 — distributed rate limiting
**Requirements:** `2H-RATE-001` … `2H-RATE-006`
**Migration:** `202608070081_phase_2h_rate_limiting.sql` — the slice's whole
allocation. Phase budget after this slice: **5 allocated · 3 spent · 2
remaining**, per-slice and non-transferable (ADR-085,
`PHASE_2H_IMPLEMENTATION_PLAN.md` §1).
**Branch:** `codex/phase-2h-slice-3`
**Signed values consumed:** PRD §14.2 V-1 … V-6, signed 2026-08-06.

---

## 1. What was built

A per-owner, cross-process, database-backed rolling-window limiter with two
buckets, and no second design.

`private.consume_rate_limit_slot` reuses **SH.5's proven arrangement verbatim**
(`202608040075`'s `claim_auth_event_slot`) rather than inventing a second
limiter: a transaction-scoped advisory lock keyed on `(bucket, owner)`, the
count taken inside it, and the slot **reserved by inserting** in the same locked
transaction — so by the time the lock releases, the row exists and the next
caller counts it. The key includes the bucket, so an upload never serialises
against an AI operation and two owners never contend.

Three doors reach it, and no fourth exists:

| Door | Grant | Identity | Used by |
| --- | --- | --- | --- |
| `public.claim_rate_limit_slot(bucket, ceiling, window)` | `authenticated` only | `auth.uid()`, never an argument | every user-initiated Server Action |
| `public.claim_rate_limit_slot_for_user(user, bucket, ceiling, window)` | `service_role` only | the argument, caller checked | background provider work |
| `private.consume_rate_limit_slot(...)` | **no role at all** | the argument | the two above, and the drain claim |

## 2. Requirement by requirement

### `2H-RATE-001` — per owner, cross process, database backed, rolling window

`public.rate_limit_events` holds one row per admission decision: owner, bucket,
outcome, time. Forced RLS, an explicit deny-all policy for `anon` and
`authenticated`, and **no table privilege for any role including
`service_role`** — a role that could `DELETE` here could mint itself slots, which
is not a weakened ceiling but an absent one.

The window is rolling: `consumed_at > pg_catalog.now() - p_window`. PRD §14.2
V-3 forbids the clock-hour counter, which admits twice the ceiling across its
boundary.

**Evidence:** `supabase/tests/phase_2h_rate_limiting.sql` sections 1, 3, 4 (10 +
12 + 7 assertions).

### `2H-RATE-002` — declared ceilings, never silent defaults

The numbers live in three places and are one number:

* PRD §14.2 — the signature;
* `src/lib/rate-limits.ts` — what the application passes as a **required**
  argument on every call;
* `private.rate_limit_parameters` — signed runtime rows, read by the drain claim
  path because `claim_entry_interpretation_job`'s argument list **cannot be
  extended** (ADR-057, the defect 2E-COMMAND-012 recorded).

`src/lib/rate-limits-parity.test.ts` compares all three **in both directions** and
additionally asserts that no `default` appears in any of the three claim
signatures. `private.rate_limit_parameter` raises `RATE_LIMIT_PARAMETER_MISSING`
on an absent key — a limiter that admits when its ceiling is missing is a limiter
nobody agreed to, which is `QUOTA_CEILING_MISSING`'s reasoning applied here.

**Evidence:** pgTAP section 2 (9 assertions), `rate-limits-parity.test.ts`.

### `2H-RATE-003` — a refusal is a named, recorded outcome

Two records, because there are two different facts.

**The ledger.** Every decision writes a row, `admitted` or `refused`. Refused
rows do **not** count toward the ceiling — counting them would mean a refusal
storm extends a lockout past the point the real usage expired, which is a limiter
that punishes the client for having been refused.

**The funnel.** A ceiling refusal emits `rate_limit_refused` with
`failureKind: 'rate_limited'`. The literal is in the migration's validator and in
`contracts.ts`, and `src/features/rate-limits/telemetry-parity.test.ts` proves
**both directions** plus a discriminating control (a parser that accepted
everything would otherwise pass). This is ADR-084's discipline: SH.6 shipped a
producer whose value every validator rejected, silently, for weeks.

The verdict travels **as data, not as an exception**, and that is a correctness
requirement rather than a style choice: PostgREST runs one RPC in one
transaction, so a refusal that raised would roll back the `refused` row that
recorded it.

`RATE_LIMIT_STATE_UNAVAILABLE` deliberately does **not** emit
`rate_limit_refused`. It is a fault, not a ceiling; filing it as `rate_limited`
would put a limit that was never reached into the funnel. It goes to 2H.2's error
sink instead, which gives that sink its first application-side producer outside
its own tests.

**Vocabulary distinctness**, asserted rather than asserted-in-prose: pgTAP
section 8 proves `'quota'` (SH.6) is *refused* by this event's validator, and the
parity test proves `rate_limited` shares no literal with the auth throttle, the
lifecycle refusals, CAPTCHA, storage or provider failures.

**Evidence:** pgTAP sections 3 and 8, `telemetry-parity.test.ts`.

### `2H-RATE-004` — genuine concurrency, not a serial loop

`scripts/phase-2h-rate-limit-race.mjs`, run by the CI `database` job.

| Lane | Door | Racers (N) | Ceiling (M) | Required |
| --- | --- | --- | --- | --- |
| AI | `claim_rate_limit_slot_for_user`, 80 separate service clients | 80 | 60 | exactly 60 admitted, 20 refused by name |
| Upload | `claim_rate_limit_slot`, 30 separate authenticated clients | 30 | 20 | exactly 20 admitted, 10 refused by name |

Both doors are raced, not one: they share `consume_rate_limit_slot` but have
different caller checks, and racing only one would leave the other unexercised.

The **stored** admitted count is read over the direct owner connection
(`LOCAL_DB_URL`), not inferred from the replies: a reply proves what the limiter
*said*, and the requirement is about what it *stored*. `rate_limit_events` is
readable by no API role, which is why the read goes through the connection CI
already provides for the re-grant rehearsal.

**Controls carried in the same run**, so a limiter that had simply broken cannot
pass:

* one further claim after the race is **refused** — a ceiling that stops applying
  once reached is not a ceiling;
* a different owner below the ceiling is **admitted** — the limiter is not
  refusing everybody;
* every refusal names its bucket, and a single `RATE_LIMIT_STATE_UNAVAILABLE`
  fails the run, because a refusal caused by a broken limiter proves nothing
  about the ceiling;
* admitted slot ids are distinct — two callers handed one reservation is the same
  defect wearing a different hat.

The verdict function is **mutation-proved**: nine mutations of valid evidence
(over-admission, store/answer disagreement, unrecorded refusals, lost verdicts, a
broken-limiter refusal, duplicate slot ids, a ceiling that stopped applying, a
refuse-everything limiter, and a race with no more racers than the ceiling) are
each required to be rejected. That self-test runs without a database and is
green: `rate-limit race validator self-test passed (9 mutations rejected)`.

Cleanup: four disposable accounts, deleted, with the limiter rows verified gone
by cascade over the same connection.

### `2H-RATE-005` — fail-closed

Fail-closed is a property of the whole path, so it is asserted on both halves.

**Database.** pgTAP section 5 injects a real fault — it renames the column the
count reads, which invalidates the cached plan so the `SELECT` genuinely fails —
and requires `RATE_LIMIT_STATE_UNAVAILABLE`, `admitted = false`, and no recorded
row. **The control runs first**, at the identical ceiling, and is admitted; the
fault is then undone by a forward `alter` rather than a savepoint rollback,
because pgTAP keeps its test counter in a temporary table and rolling back would
renumber the remaining assertions.

**Application.** `src/features/rate-limits/admission.test.ts` runs the claim
against stub clients and requires a refusal for: a transport error, a null
payload, an empty row set, a non-object row, a row with no verdict, `admitted:
"true"`, `admitted: 1`, an unknown refusal string, and a client that throws
instead of answering. The discriminating control — that a well-formed admission
still admits — is in the same file.

### `2H-RATE-006` — not a second spend control

`rate_limit_events` has five columns: id, owner, bucket, outcome, time. There is
no cost, price, USD, spend or token column, and the **migration itself refuses to
apply** if one appears — a test can be deleted, a migration that already ran
cannot be un-run. `rate-limits-parity.test.ts` asserts the same shape from the
other side.

Under BYOK the user is the payer, ADR-083 §5 withdrew the per-user USD ceiling,
and SH.6 owns the infrastructure quotas. This bounds request rate.

## 3. The admission semantics, and where each one lives

PRD §14.2 V-4 and V-5 are the two hardest lines in the value sheet, and they
resolve to a single rule: **admission happens once, at the first claim.**

| Situation | Consumes? | Where |
| --- | --- | --- |
| A user-initiated provider call (chat, review) | yes | the Server Action, after the BYOK gate, before any provider call |
| A user-initiated retry (`retryAttachmentJob`) | yes | the Server Action, before the worker is invoked |
| Background interpretation, first claim | yes | `claim_entry_interpretation_job`, `attempts = 0` |
| Background interpretation, automatic retry | **no** | the same test, `attempts > 0` |
| A reprocess the user asked for | yes | it enqueues a **new** job, whose first claim has `attempts = 0` |
| An accepted upload request | yes | the upload action, **before the storage write** |
| An attachment job claim | no | already admitted at the request boundary |
| A best-effort embedding on a non-AI operation | yes, but degrades | refusal skips the embedding and **keeps the record** |

`attempts = 0` is what makes V-4 implementable without a "was this a human" flag
the queue does not carry. A user-initiated reprocess enqueues a new job; an
automatic retry re-claims an existing one.

**Two degradation decisions worth stating, because both could have been wrong:**

*A refused drain claim returns `null` and burns no attempt.* `null` is what the
function already returns for "nothing claimable", the deployed worker already
handles it as an empty drain, and raising would roll back the `refused` row.
An owner at their ceiling loses no retries to it, and the job stays `pending`.

*A refused best-effort embedding does not fail its operation.* `embedMemory` and
`createRecord`'s embedding are already best-effort — the row is saved either way,
and a missing credential already degrades this exact way. An hourly pace ceiling
must not be able to stop somebody writing something down.

**Upload admission sits after every acceptance check and before the bytes move.**
A request refused for size, type, session, lifecycle or a SH.6 storage ceiling
never reaches the limiter and spends nothing — which is what "20 **accepted**
upload requests" means. A request refused *by* the limiter leaves no Storage
object and no `attachments` row, because neither has been written yet.

## 4. What this slice deliberately did not do

* **No spend control, no USD, no tokens** (`2H-RATE-006`).
* **No exemption path**, including for the owner (V-6). The decision function
  contains no account identifier and no exemption vocabulary, asserted from the
  catalog (`prosrc`) and from the file.
* **No second admission at the provider boundary** for work the drain admitted
  (V-5, second clause).
* **No scheduling of anything.** The migration creates no `cron.job` row and no
  sweep (ADR-082).
* **No new grant to `service_role` on any table.**

## 5. The one thing this slice changed that it did not have to

`claim_next_entry_interpretation_job` and `claim_attachment_job` are re-declared
**byte-identical** to `202608050076`'s bodies, although neither needed to change.

SH-WORKER-003 is the rule that the lifecycle and fairness predicates are
identical on every claim path, and the mechanism that makes it *checkable* is
that all three live in one file — `signup-hardening-invariants.test.ts` resolves
the three names and fails if they land in different migrations. Replacing only
one would have left the invariant true today and unenforceable tomorrow. The
guard caught this, which is the guard working.

## 6. Chain guards a new table had to join

A table is not finished when it exists. `rate_limit_events` joins:

* `signup_hardening_cascade_drill.sql` — a populated row, so the drill proves it
  cascades with `auth.users` and takes nothing of a bystander's;
* `signup_hardening_grant_census.sql` — the RPC-only ledger list (now ten) and the
  `authenticated` matrix (`rate_limit_events -> (none)`);
* `verify-phase-2f-cleanup.mjs` — `DELIBERATELY_NOT_SCANNED`, with the reason;
* `deletion-capability-guard.test.ts` — the race script's teardown allowlisted;
* `account_owned_row_counts` — **unasked**, because it enumerates the catalog at
  run time (SH-DELETE-007/T-32), so the zero-residue check covers this table
  without an edit.

`ON DELETE CASCADE` with **no** append-only trigger, deliberately. 2H.2's cascade
defect was an append-only trigger on a table whose rows cascade: the cascade *is*
a delete, so the trigger refused it and no account could be deleted at all. This
table is expiring state, not evidence, so the cascade is the whole cleanup story.

## 7. Local gate results

| Gate | Result |
| --- | --- |
| `npm run lint` | clean |
| `npx tsc --noEmit` | clean |
| `npm test` | **4167 passed, 0 failed**; 3 files fail to *load* on the Windows baseline (a vite parse error on the `#!` shebang of the `.mjs` scripts they import) — `hosted-auth-parity`, `signup-hardening-admin-boundary`, `storage-orphan-scanner`. This is the recorded local baseline and those three are green in CI. |
| race validator self-test | 9 mutations rejected |
| pgTAP, `supabase db lint`, race against a real database | **CI only** — no local Docker |

## 8. Post-merge — hosted deployment

*Filled in after exact merge-SHA CI green ×3 and the migration is applied.*
