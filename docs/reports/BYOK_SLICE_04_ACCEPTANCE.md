# BYOK.4 — Deno adapter, jobs and capture: acceptance record

**Branch:** `codex/byok-slice-4` · **Base:** `main` at `423625d` ·
**Migrations:** `202608010068`, `202608010069` — head moves from `202608010067`
to `202608010069`, **by exactly two**.

**Requirements delivered:** `BYOK-ADAPTER-003`, `004`, `005`; `BYOK-GUARD-001`
(Deno scope), `003`; `BYOK-JOBS-001`…`008`; `BYOK-CAPTURE-001`…`006`;
`BYOK-SCHEMA-008`.

---

## 1. What the slice actually did

The irreversible line is the first commit. `Deno.env.get("OPENAI_API_KEY")`, its
503 branch, the `openaiKey` parameter threaded through `dispatch.ts` into both
handlers, and the allowlist entry that permitted the read all went in **one
commit** — because `project-key-guard.test.ts` asserted the read was *present*
precisely so that removing it would fail the suite and force the entry to shrink
alongside it. It did, and it has. There is now no Deno path to a process-wide
provider key.

What replaced it:

| Module | What it is |
| --- | --- |
| `_shared/byok-adapter.ts` | resolve → decrypt → `Secret`. Takes a **job id and nothing else**. |
| `_shared/byok-secret.ts` | The branded secret, Deno half. One declared asymmetry: Deno's inspection hook. |
| `_shared/job-failure.ts` | The closed failure vocabulary, the retry policy, and the only way a handler may record a failure. |

And two migrations: the `awaiting_ai_configuration` lifecycle, and the
credential-aware drain.

---

## 2. Acceptance gates

| Gate | Status | Evidence |
| --- | --- | --- |
| **D1** — no deployed Deno path reads a process-wide key | **Executed** | `project-key-guard.test.ts` walks every file under `supabase/functions/` and asserts no `OPENAI_API_KEY` and no `Deno.env.get` of any `API_KEY`/`PROVIDER_KEY` name; positively, every `Bearer ${…}` in both handlers is an exposed `Secret`. Allowlist is three entries, compared in both directions. |
| **D2** — async matrix cases against the deployed function | **NOT CLAIMED** | See §4. No BYOK migration has been applied to any shared environment, so there is no deployed function to run them against. |
| **D3** — removal blocks queued async work, no provider call | **Executed (local)** | `ownership.test.ts` replaces `fetch` with a recorder that fails the test if called; both handlers assert `attempts === []`. pgTAP §6 proves a removed credential makes future claims ineligible, against a positive control claimed one statement earlier. |
| **D4** — the drain skips uncredentialed owners, non-vacuously | **Executed (local)** | pgTAP §5. B's jobs are deliberately **older** than A's, so a drain missing its predicate returns B's first and the first assertion fails. Three of B's jobs remain pending, in-budget and due while the drain returns null — the queue is ineligible, not empty. The skip is then proven recoverable. |
| **D5** — configuration failures consume no retry; transient ones do | **Executed (local)** | `job-failure.test.ts` routes every terminal code to `fail_job_terminal` (whose signature has no delay parameter) and every retryable one to `fail_job` with its backoff. pgTAP §7 executes the terminal path end to end. **Narrowed:** see §5. |
| **D6** — `jobs.error` carries only declared safe codes | **Executed (local)**, with a recorded scope limit | `job-failure.test.ts` asserts `p_error` over the **whole** vocabulary, not a sample. pgTAP §7 proves the database itself refuses a provider message. Scope limit in §6. |
| **D7** — capture without a key: stored, awaiting, no job | **Executed (local)** | pgTAP §3: entry stored, content preserved byte for byte, status `awaiting_ai_configuration`, **zero** job rows, an audit row that says what happened. §4 is the positive control — a credentialed capture still enqueues exactly one job. |
| **D8** — nothing bulk-processes on activation; the bounded action works | **Executed (local)** | `worker-guard.test.ts` asserts `saveAiCredential`'s body reaches for no enqueue path, and that exactly one module in `src/` mentions both `awaiting_ai_configuration` and `enqueue_entry_reprocessing`. The action's ceiling is a declared constant used in a `.limit()`, and its result reports the count. |
| **D9** — the parity lock fails on a deliberate divergence | **Executed (local)** | `adapter-parity.test.ts` feeds the comparison four mutations — a renamed code, a dropped code, a `Secret` missing `Symbol.toPrimitive`, a `byteaToBase64` that stopped agreeing — and asserts each is caught. |
| **D10** — parity moves by two; deployed bundle matches local | **Partially executed** | The head moves by exactly two, pinned in `egc-invariants.test.ts` and in `SECURITY.md`. The **deployed bundle** half is not claimed: nothing is deployed. |
| **D11** — the heartbeat remains AI-free | **Executed (local)** | `worker-guard.test.ts`: no provider host, no `OPENAI`, no resolver, no credential table, no `BYOK_MASTER_KEY`, and no `fetch` at all — plus a positive assertion that it still calls `run_all_heartbeats`, so the negatives are not vacuous. |
| **D12** — attachments use the same credential boundary | **Executed (local)** | `ownership.test.ts` runs the attachment handler through the same forbidden-`fetch` harness: no provider call, `fail_job_terminal` with `credential_required`, and the attachment is never marked `processing` for an account that cannot process it. |
| **D13** — lint 0, typecheck 0, build 0, both suites green | **Executed**, with the known local exception | See §3. |
| **D14** — any live shared-environment test reported honestly | **Executed as "unavailable"** | §4. |

---

## 3. Gate D13, measured

| Command | Result |
| --- | --- |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | 0 errors |
| `npm run build` | exit 0 |
| `deno check` (both entrypoints) | 0 errors |
| `deno test` (all `supabase/functions/*` directories, no `--allow-*`) | **87 passed, 0 failed** |
| `npm test` | **3507 passed, 2 failed** |

**The two failures are the known Windows-only baseline**, and they are reported
as failures rather than folded into a green claim.
`src/features/task-commands/sql-reachability.test.ts` fails its two CRLF-sensitive
assertions on this branch **and identically on `main`** — verified this session by
stashing the whole branch and re-running the file, which produced the same
`2 failed | 44 passed`. Both pass in Linux CI.

One transient is recorded rather than omitted: an early full-suite run also
reported `src/lib/byok/guards.test.ts` failing its crypto-locality assertion. It
did not reproduce in isolation or in any subsequent full run, and the file was
being written at that moment. It is noted here as an observed flake with a
plausible cause rather than claimed as understood.

---

## 4. What is NOT claimed, and why

**One shared blocker, three consequences.** No BYOK migration —
`202608010065` through `202608010069` — has been applied to any shared
environment, and `OPENAI_API_KEY` is still the deployed Edge Function's secret
because BYOK.5 is what removes it. There is therefore no deployed worker that
can decrypt a credential, and nothing to run a live case against.

| Not claimed | Why |
| --- | --- |
| **D2** — matrix cases 7, 8, 9, 13, 14, 15 against the deployed function | No deployed function carries the BYOK schema or the master key. Each case is executed against a local double or in pgTAP; none is claimed as executed *in a shared environment*. |
| **D10's second half** — deployed bundle matches local | Nothing is deployed. |
| Concurrent-rotation and cross-user isolation at runtime | Inherited from BYOK.3's deferral, unchanged. BYOK.6 owns them. |

This is the same shared blocker BYOK.3 recorded, and it moves in BYOK.5 (owner
cutover) and BYOK.6 (convergence), not here.

**A deviation from a requirement's letter, recorded rather than papered over.**
`BYOK-GUARD-003` asks for *a Deno test* asserting that every handler resolves
from the claimed row's owner before any provider call. The worker suite runs with
**no `--allow-*` flags at all**, by design, so it cannot read a source file and a
source-scan guard is not expressible there. The requirement's substance is split:
the **behaviour** is executed in Deno (`ownership.test.ts`, against a `fetch` that
fails the test if called), and the **absence** is asserted in Node
(`worker-guard.test.ts`). The split is written into both files' headers. It is
stronger than the single test described; it is still not the test described.

---

## 5. "Consumes no retry", stated narrowly

`jobs.attempts` is incremented by the **claim**, not by the failure. By the time
any handler runs, the attempt is already spent and no failure path can give it
back.

What `fail_job_terminal` guarantees is the part still in reach and the part that
costs something: **no further attempt is scheduled**. `status` goes straight to
`exhausted`, `next_attempt_at` is not moved, and the remaining budget is left for
a failure a retry could fix. The migration header and `ADR-071` say this in those
words, so the requirement is not read as a promise the implementation cannot
keep. pgTAP §7 asserts `attempts = 1` after a terminal credential failure on a
job whose `max_attempts` is higher — the claim's single attempt stands, and
nothing further is consumed.

---

## 6. Residual risks

| # | Risk | Status |
| --- | --- | --- |
| R1 | `fail_job` still accepts free text at the database level. Safe today only because `_shared/job-failure.ts` is its sole caller and passes a declared code. | **Open.** Constraining it would change an existing function's contract for callers outside this slice. Recorded in `ADR-071`. |
| R2 | `reap_expired_jobs` writes the fixed literal `'Worker lease expired'` into `jobs.error`. It carries no secret and no provider text, but it is not a member of the vocabulary. Predates BYOK. | **Open, accepted.** D6's claim is therefore about the *worker's* writes, not about every row in the column. |
| R3 | `attachments.processing_error` is Portuguese-only, including the new configuration message. A pre-existing gap — `attachment.ts` has never had access to a locale, unlike `entry.ts`. | **Open.** BYOK.4 matched the existing shape rather than widening the gap; moving all three strings behind the i18n contract is in `TODO.md`. |
| R4 | The needs-attention queue cannot show `configure_ai_credential`, because `list_needs_attention` is an RPC this slice does not change and the analytics event validates against a five-member enum **inside Postgres**. | **Closed by design, not by omission.** The awaiting state reaches the user through the Inbox and the entry detail, which read `entries.status` directly. `TrackedAttentionReason` makes the boundary a compile error rather than a runtime `22023`. |
| R5 | No shared environment has the BYOK schema or the three BYOK secrets, so nothing here has run against a real deployment. | **Open.** BYOK.5's stop condition. |

---

## 7. Defects found and fixed inside this slice

Recorded because a review that finds nothing is a review that was not run.

1. **The reprocessing entry the awaiting mark refuses.**
   `mark_entry_awaiting_ai_configuration` deliberately refuses an entry that
   already carries an interpretation. The worker's first draft treated the mark
   as unconditional and skipped the ordinary failure path for every configuration
   code — so a **reprocessing** job whose credential vanished mid-flight left its
   entry in `reprocessing` with the lease never released: "organizing" forever,
   nothing running, nothing left to expire it. Fixed by honouring the RPC's
   answer; both directions pinned by tests, including that an *accepted* mark does
   not also run the error path.

2. **`BYOK-MASTER-005` had no guard.** The startup check existed; nothing asserted
   it stayed at module scope. A check moved inside the handler would let the
   function boot, accept traffic, and fail every job with an error reading like a
   credential problem rather than a deployment one. Now asserted, along with the
   absence of the deleted `missing_openai_key` branch under any name.

3. **`loadPendingEntryCount` claimed its ceiling bounded the query.** It does not —
   `count: "exact"` computes the real total regardless. The comment now says what
   is true: it bounds the label. It also used `requireSupabaseData` on a `head`
   request, which asserts on a `null` that is null by definition.

4. **Two test defects of my own making**, fixed before commit: a recording double
   whose `result.data ?? default` silently replaced an *explicitly null*
   lost-lease fixture with a success, and a D9 mutation assertion that searched
   the raw source for `Symbol.toPrimitive` — which both `Secret` files *document*
   in their headers, so it would have passed while the method was gone.

---

## 8. The adversarial pass, item by item

| Attack | Outcome |
| --- | --- |
| Wrong credential after a forged job id | Refused. The resolver reads `jobs.user_id`; the adapter reads it again, independently, for the AAD. Executed in `byok-adapter.test.ts` with a double whose two sources answer separately. |
| Invocation user substituted for job owner | Structurally impossible: `resolveJobCredential` takes a job id and has no owner parameter. Asserted on the signature. |
| Credential resolved before claim and reused across jobs | Refused. Resolution is inside each handler, after the claim, per job. The drain calls the handler per job. |
| Plaintext crossing module boundaries | Only as `Secret`. Two `.expose()` call sites, both at a `Bearer` header, both asserted by the guard. |
| Secret serialization into `jobs.error` | `failJob` accepts only a `JobFailureCode`; the terminal RPC is constrained by the database. |
| Provider error leakage | Classified by status and shape, never by message. The 429 body is read only to split quota from rate limit, and nothing read is returned or stored. |
| Removed credential usable by queued work | Refused twice: the drain predicate, and execution-time resolution. |
| Rotation retaining old ciphertext | Nothing is pinned to a job. Rotation updates one row. |
| Drain starvation by uncredentialed jobs | The predicate is inside the `select`, so `for update skip locked` never locks a skipped row. pgTAP asserts `attempts = 0` and `locked_by is null` on a skipped job. |
| Capture marked processing while no job exists | The awaiting branch sits **above** every job-derived branch, so an exhausted job left by a credential failure cannot override it. Pinned by four lifecycle tests. |
| Automatic reprocessing on activation | No hook exists; asserted as an absence over the save action's body and over `src/`. |
| Stale Deno guard allowlist | Impossible: the read and the entry were deleted in the same commit, because the guard asserted the read's presence. |
| Node/Deno AAD drift | `parity.test.ts` (envelope) plus `adapter-parity.test.ts` (adapter and `Secret`), with D9's four mutations. |
| Edge Function booting without `BYOK_MASTER_KEY` | Module-scope validation; every request refused with a declared code. Now guarded. |
| Attachment path bypassing the adapter | Refused; executed. |
| Heartbeat gaining an AI dependency | Guarded, including "no `fetch` at all". |
| Retrying permanent credential failures | Refused by the vocabulary, asserted exhaustively. |
| Retry budget consumed before credential resolution | Narrowed and stated honestly — see §5. |
