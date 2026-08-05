# BYOK — Implementation Plan

**Revision 1** · 2026-07-31 · Governs [`BYOK_PRD.md`](./BYOK_PRD.md) Revision 1.

**Status — APPROVED 2026-08-01. BYOK.1 and BYOK.2 are CLOSED; BYOK.3 is authorized to
begin.** Revision 1's body is unchanged; §0 carries append-only **Amendment A-1** (the
owner's gate decomposition, `ADR-069`) and **Amendment A-2** (G-0.4 satisfied, and BYOK.3's
migration allocation raised from 0 to 1, `ADR-070`).

Six slices in order. **Separate branches, separate commits, separate PRs from Entity Graph
Completion — no shared branch at any point.** Each slice ends in a merged PR with a green
merge-SHA CI run on all three jobs.

---

## 0. Pre-code gates

**No slice may start until every artifact below is in the repository.** The rule is
`PHASE_2F_PROPOSAL.md` §15: no migration is written before its gate's artifact exists.

| Gate | Produces | Why it must precede code |
| --- | --- | --- |
| **G-0.1 — provider call-site census, re-executed** | A committed inventory of every module reaching a provider, re-measured against `main` rather than inherited from the definition study | The study's §2 matrix is a snapshot. BYOK-GUARD-001's allowlist is derived from a **current** measurement, and a stale inventory silently permits a path |
| **G-0.2 — crypto interop proof** | An executed demonstration that a payload encrypted in Node 22 decrypts in Deno and vice versa, with identical AAD composition | BYOK-ADAPTER-004's parity lock asserts sameness; this proves the format works across runtimes *before* it is depended upon. A format mismatch discovered in Slice 4 would be expensive |
| **G-0.3 — master-key generation and distribution procedure** | The written procedure, and four distinct keys provisioned (production, preview, test, local), none in the repository | BYOK-MASTER-001…005. Code that reads a key nobody has provisioned cannot be tested honestly |
| **G-0.4 — validation-call cost control** | The dedicated low-limit OpenAI key for the opt-in validation lane, its spend limit, and where it is held | The one live provider call this initiative needs (`ADR-059`'s opt-in-lane precedent) |
| **G-0.5 — hosted signup closed, verified** | A recorded re-read of the GoTrue settings endpoint showing `disable_signup: true` | Independent of BYOK, and a **hard gate** on this initiative starting. Building a credential system over an open signup is building on the hole |

---

### Amendment A-1 — owner-approved gate decomposition

**Date: 2026-08-01. Status: accepted, owner decision. Append-only — the table above and
the sentence "No slice may start until every artifact below is in the repository" are
reproduced unchanged and are not rewritten.** Recorded as `ADR-069`.

The original rule is written as a single absolute over all five gates and all six slices.
Executing G-0.1, G-0.2 and G-0.3 showed that this is stronger than the property the rule
protects: **G-0.4's artifact — a dedicated low-limit OpenAI key — is consumed by exactly
one lane, BYOK.3's live credential validation.** Read absolutely, an artifact that only
BYOK.3 can consume blocks BYOK.1's schema and BYOK.2's resolvers, which do not reach a
provider at all.

The owner therefore amends the rule to a **dependency-specific** one. This is an
owner-authorized correction to an overly broad pre-code rule; it is **not** an implementer
weakening a gate, and no gate is removed, deferred without a successor, or relaxed in the
direction of shipping something unexercised.

| Gate | What it gates, as amended |
| --- | --- |
| **G-0.1** | **All** BYOK implementation. Unchanged. |
| **G-0.2** | **All** BYOK implementation. Unchanged. |
| **G-0.3 — written procedure** | **BYOK.1.** The procedure must exist before code reads a key. |
| **G-0.3 — local/test provisioning** | **Execution of crypto integration tests that require persistent environment secrets.** Tests that generate ephemeral keys are unaffected. |
| **G-0.3 — preview/production provisioning** | **Deployment to those environments.** Not local implementation of BYOK.1 or BYOK.2. |
| **G-0.4** | **BYOK.3's live credential-validation lane, and BYOK.3 closeout.** BYOK.3 may not be accepted or merged without it. |
| **G-0.5** | **All** BYOK implementation. Unchanged, and already satisfied. |

#### A-1.1 — Local and test secret provisioning (authorized)

Four values — a `BYOK_MASTER_KEY` and a `BYOK_FINGERPRINT_PEPPER` for `local`, and the
same pair for `test` — are authorized for generation by the implementer: cryptographically
secure 32 random bytes, base64, **all four pairwise distinct**, written to `.env.local` and
`.env.test.local` respectively. Preview and production values are **not** authorized here.

The values are never displayed, committed, logged, printed to CI, or recorded as hashes or
prefixes in any repository artifact. What may be recorded is only: presence, valid base64,
decoded length of 32 bytes, and pairwise distinctness. Evidence:
[`BYOK_G03_MASTER_KEY_PROCEDURE.md`](../../reports/byok/BYOK_G03_MASTER_KEY_PROCEDURE.md) §7.

#### A-1.2 — Preview and production provisioning (deferred to point of use)

Deferred to the point at which each environment is actually used, with a required ordering:

1. preview secrets exist **before the first BYOK preview deployment**;
2. production secrets exist **before BYOK.5's owner cutover or any production deployment
   using per-user credentials**;
3. **both** the Next.js runtime and the Supabase Edge Function runtime receive the same
   environment-specific pair;
4. preview and production values differ from each other and from local and test.

When provisioning becomes the next required action, the implementer **stops** and states
the exact owner-facing commands and verification steps. It does not attempt to reach
hosting or Supabase administrative credentials.

#### A-1.3 — G-0.4's validation lane (still required, not weakened)

G-0.4 remains required before BYOK.3 can be accepted or merged. **The live validation lane
may not ship marked "passed" while unexercised.** The key the owner will provision carries
these constraints, which BYOK.3 must honour in code and record in its acceptance report:

- a **dedicated OpenAI project**, not the owner's normal project, and a dedicated API key;
- permissions restricted to only the endpoints and models validation requires;
- a monthly project budget alert of **USD 2** — and the report must state plainly that an
  OpenAI project budget is a **soft alert, not a hard spending cap**;
- the lowest practical model rate limits;
- used **only** in an opt-in test lane, never in normal product runtime;
- `maxRetries: 0` and a short timeout;
- a **hard application-side daily validation-attempt ceiling**;
- revoked after the acceptance lane unless continuously needed.

---

### Amendment A-2 — G-0.4 satisfied, and BYOK.3 gains a migration

**Date: 2026-08-01. Status: accepted, owner decision. Append-only — Amendment A-1 and §0
above are reproduced unchanged.** Recorded as `ADR-070`; the PRD carries the matching
Amendment P-1.

#### A-2.1 — G-0.4 is satisfied

The owner has provisioned a dedicated OpenAI project and API key for the opt-in validation
lane, held as **`BYOK_VALIDATION_OPENAI_API_KEY`**, with a USD 2 monthly budget, restricted
model access, the lowest practical rate limits, a dedicated key, and use confined to the
acceptance lane. Every constraint A-1.3 named is met. **G-0.4's decision is made and its
artifact exists**, so BYOK.3 is authorized to begin.

**One thing repository truth cannot yet confirm, recorded rather than assumed.** Measured
at `0b62a5b`: no repository Actions secret of that name exists, and the name is absent from
`.env.local` and `.env.test.local`. `ADR-059` runs the opt-in lane **locally**, deliberately
"without putting credentials in CI", so the value must be readable by a local run. Until it
is, the lane can be **written but not executed** — and A-1.3 forbids BYOK.3 closing with it
unexercised. **This gates BYOK.3's closeout, not its start.** The one-line resolution is in
`AUTONOMOUS_LOOP_HANDOFF.md` §7.

#### A-2.2 — BYOK.3's migration allocation moves from 0 to 1

Task 3.8 requires a throttle "per user **and per IP**" over
`credential_validation_attempts`, whose declared shape has no column that can carry an IP.
BYOK.1 raised the conflict and invented nothing. The owner's resolution:
`credential_validation_attempts` gains **one** column, `ip_hash`, in a BYOK.3 migration, and
the initiative budget rises from four to five.

The full requirement set is `BYOK-SCHEMA-010…015` in PRD Amendment P-1. In summary: never
the raw IP; `HMAC-SHA256` over a canonicalized value; under a **third independent secret**,
`BYOK_RATE_LIMIT_PEPPER`, which is never the master key and never the fingerprint pepper;
distinct local and test values now, preview and production before deployment to those
environments (the A-1.2 ordering, unchanged); never displayed, logged or persisted; used
only for throttling and abuse control; a bounded retention period; and indexing that
supports concurrency-safe daily ceilings per user and per IP and nothing more.

#### A-2.3 — Task 3.8, restated

> 3.8 — Throttle per user **and per IP** with a daily ceiling, over
> `credential_validation_attempts`, using `ip_hash` (`BYOK-SCHEMA-010…015`). The ceiling
> check and the attempt insert must be **concurrency-safe**: two simultaneous attempts must
> not both observe a count below the limit.

---

## Slice BYOK.1 — Credential store and crypto core

**Delivers:** BYOK-SCHEMA-001…007, BYOK-CRYPTO-001…007, BYOK-MASTER-001…012,
BYOK-FINGERPRINT-001…005, BYOK-GUARD-005.

**Migration: 1** — `user_ai_credentials`, `credential_validation_attempts`, RLS, policies,
grants. **No resolver yet, no product surface, no provider change.** Contract only, in the
Slice 2E.1 shape.

### Tasks

| # | Task |
| --- | --- |
| 1.1 | Migration: both tables, forced RLS, own-row `select`/`update` policies, `grant select, insert, update to authenticated`, **no `delete` grant or policy**, `revoke all from anon`, plus the `status`-consistency table CHECK of BYOK-SCHEMA-003 |
| 1.2 | Regenerate `src/lib/supabase/database.types.ts`; content-identical diff review |
| 1.3 | Node crypto module: AES-256-GCM encrypt/decrypt, 12-byte random IV, 128-bit tag, AAD = `user_id ‖ key_version ‖ provider` |
| 1.4 | Deno crypto module under `supabase/functions/_shared/`, byte-compatible with 1.3 |
| 1.5 | Fingerprint module: HMAC-SHA256 under `BYOK_FINGERPRINT_PEPPER`, truncated, with the closed prefix allowlist |
| 1.6 | Startup validation in both runtimes: absent or malformed `BYOK_MASTER_KEY`/`BYOK_FINGERPRINT_PEPPER` **fails to start**, never falls back |
| 1.7 | BYOK-GUARD-005: crypto and secret locality |
| 1.8 | CI chain-scan asserting no master key or pepper value appears in any migration, function body or repository file |
| 1.9 | `.env.example` gains both names with empty values |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| A1 | pgTAP: forced RLS; own-row policies; **no `delete` grant to any client role**, asserted in both directions; `anon` denied after a privileged positive control |
| A2 | The `status`-consistency CHECK rejects `active` without ciphertext and `removed` with ciphertext — executed, both directions |
| A3 | Encrypt→decrypt round-trips in Node and in Deno, and **cross-runtime** (G-0.2 re-executed in CI) |
| A4 | **AAD binding proven:** a ciphertext decrypted under another `user_id` **fails**; the failure is `credential_unreadable` with no byte echo |
| A5 | Two encryptions of the same plaintext produce different IVs and different ciphertexts |
| A6 | Startup fails with an absent key and with a malformed key, in both runtimes |
| A7 | Chain scan finds no key material anywhere |
| A8 | Migration parity moves by exactly one; `db lint` shows only the two pre-existing `run_user_heartbeat` warnings |
| A9 | Lint 0, typecheck 0, Vitest green, build exit 0 |

---

## Slice BYOK.2 — Resolvers

**Delivers:** BYOK-RESOLVER-001…008.

**Migration: 1** — both resolver RPCs. **No consumer yet.**

### Tasks

| # | Task |
| --- | --- |
| 2.1 | `public.resolve_own_ai_credential()` — `SECURITY DEFINER`, `search_path = ''`, owner from `auth.uid()`, `42501` on null identity, granted to `authenticated` only |
| 2.2 | `public.resolve_job_ai_credential(p_job_id uuid)` — owner from `jobs.user_id`, granted to `service_role` only, `P0002` identical for foreign and non-existent |
| 2.3 | Both return ciphertext/iv/key_version/status/provider; **neither decrypts and neither returns plaintext** |
| 2.4 | Both return a row only when `status = 'active'` (BYOK-RESOLVER-005) |
| 2.5 | pgTAP asserting **no `user_id` argument exists**, against `pg_proc.proargnames` |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| B1 | The no-`user_id`-argument assertion fails when a parameter is added — proven by executing the mutation, not by reading the test |
| B2 | Matrix cases 4, 5, 8, 9, 10, 11 (PRD §20) executed |
| B3 | Cross-owner denial **non-vacuous**: the owner's positive row asserted before the stranger's absence |
| B4 | A foreign job id and a non-existent job id produce byte-identical errors |
| B5 | `authenticated` denied on the job resolver; `service_role` denied on nothing it needs; `anon` denied on both after a positive control |
| B6 | `invalid`, `removed` and absent are indistinguishable to the caller |
| B7 | Parity moves by one; lint/typecheck/tests/build green |

---

## Slice BYOK.3 — Node adapter, Settings and validation

**Delivers:** BYOK-ADAPTER-001/002/006/007 (Node), BYOK-LIFECYCLE-001…009,
BYOK-VALIDATE-001…007, BYOK-ROTATE-001…004, BYOK-GUARD-001/002/004 (Node scope),
BYOK-COPY-001…007, BYOK-QUOTA-003 (Node paths).

**Migration: 1** — `credential_validation_attempts.ip_hash`, its index and the retention
mechanism. *Amendment A-2.2 raised this from 0; the original allocation is preserved in the
budget table's note.*

> **This is the slice that removes the Node environment fallback.** From its merge, the
> seven Node provider paths require a resolved credential. Settings must therefore ship in
> the *same* slice — a fallback removed before the surface that configures a replacement
> would leave the product AI-less.

### Tasks

| # | Task |
| --- | --- |
| 3.1 | Node credential adapter: resolve → decrypt → construct provider; declared `credential_required` / `credential_unavailable` / `credential_unreadable` outcomes |
| 3.2 | Branded `Secret` type with throwing `toJSON`/`toString`/`inspect` and an explicit `.expose()` |
| 3.3 | **Delete** `options?.apiKey ?? process.env.OPENAI_API_KEY` (`openai-provider.ts:59`); `apiKey: string` becomes required; `getAIProvider`'s signature changes |
| 3.4 | Route all seven Node call sites (chat embed, chat answer, review generation, task-command parse, memory embed, memory-create embed, composer delegations) through the adapter |
| 3.5 | `max_output_tokens` on every operation (BYOK-QUOTA-003) |
| 3.6 | Settings surface: save, test, rotate, remove; metadata only; password input, never prefilled, cleared on submit and unmount; **no reveal control anywhere** |
| 3.7 | Validation: shape → live call with `maxRetries: 0` → closed-vocabulary mapping; provider error never re-thrown or logged whole |
| 3.8 | Throttle per user **and** per IP with a daily ceiling, over `credential_validation_attempts`, using `ip_hash` — **restated by Amendment A-2.3**, which adds the concurrency-safety requirement and the column that makes the per-IP half possible at all |
| 3.9 | Atomic rotation: validate first, single-transaction in-place overwrite, row lock, metadata-only return, `audit_logs` row with no key material |
| 3.10 | Removal: `status = 'removed'` with `ciphertext`/`iv` nulled in one statement |
| 3.11 | Gated states on every AI surface, both locales, typed copy modules |
| 3.12 | BYOK-GUARD-001 (Node scope), 002, 004 |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| C1 | **No Node path can reach the project key** — guard green, and a deliberately reintroduced fallback reds the build |
| C2 | Matrix cases 1, 2, 3, 12 executed |
| C3 | A failed rotation leaves the old credential active — executed |
| C4 | A successful rotation stops the old key being used — executed |
| C5 | Removal blocks synchronous AI immediately |
| C6 | An invalid key never becomes `active` |
| C7 | The browser never receives plaintext: every action result and rendered prop asserted; a Settings DOM snapshot contains no key |
| C8 | Logs and errors contain no key, asserted by a scan over captured output |
| C9 | Throttle refuses past the ceiling, per user **and** per IP. **Amendment A-2** adds: the raw IP appears nowhere — not in the column, not in a log, not in a result; the pepper is a third independent secret; two simultaneous attempts cannot both pass a ceiling check; and the retention window is enforced rather than described |
| C13 | **Amendment A-2**: parity moves by exactly one, and `db lint` shows only the two pre-existing `run_user_heartbeat` warnings |
| C10 | Concurrent rotation: one wins, one gets a declared conflict, no partial write |
| C11 | Desktop + Pixel 7 Settings, both locales |
| C12 | Locale-ternary count ≤ baseline; lint/typecheck/tests/build green |

---

## Slice BYOK.4 — Deno adapter, jobs and capture

**Delivers:** BYOK-ADAPTER-003/004/005, BYOK-GUARD-001 (Deno scope), 003,
BYOK-JOBS-001…008, BYOK-CAPTURE-001…006, BYOK-SCHEMA-008.

**Migration: 2** — the `entries.status` literal, and the `claim_next_entry_interpretation_job`
`create or replace` with the credential predicate.

### Tasks

| # | Task |
| --- | --- |
| 4.1 | Deno credential adapter mirroring 3.1; parity lock (BYOK-ADAPTER-004) |
| 4.2 | **Delete** `Deno.env.get("OPENAI_API_KEY")` and its 503 branch (`process-jobs/index.ts:11`); the threaded key parameter becomes a per-job resolved credential |
| 4.3 | `dispatch.ts`, `entry.ts`, `attachment.ts` resolve per job through `resolve_job_ai_credential(jobId)` |
| 4.4 | Failure classification (BYOK-JOBS-004): terminal-no-retry vs retry-with-backoff, declared codes only |
| 4.5 | `jobs.error` receives **closed-vocabulary codes only** — never a provider message |
| 4.6 | Migration: `entries.status` gains the awaiting-configuration literal (`drop constraint` / `add constraint`, the `202607170020` precedent) |
| 4.7 | Migration: `claim_next_entry_interpretation_job` `create or replace` with the `not exists` active-credential predicate; signature, grants and lease semantics unchanged |
| 4.8 | `capture_entry_async`: with no active credential, write the entry in the awaiting state and **enqueue no job**, in one transaction |
| 4.9 | Inbox, Home and entry detail render the awaiting state honestly with a link to Settings |
| 4.10 | Bounded, explicit "interpret pending entries" action through `enqueue_entry_reprocessing`, reporting the count enqueued |
| 4.11 | Assert the heartbeat performs no AI, so a future addition cannot bypass this contract |
| 4.12 | BYOK-GUARD-001 (Deno), BYOK-GUARD-003 |
| 4.13 | Deploy `process-jobs` and prove local/remote bundle parity, the Slice 2X.18 procedure |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| D1 | **No Deno path can reach a process-wide key** — guard green; the env read is gone, proven by grep and by test |
| D2 | Matrix cases 7, 8, 9, 13, 14, 15 executed against the deployed function |
| D3 | Removal blocks **asynchronous** work: enqueue → remove → run → no provider call |
| D4 | The drain does not select jobs whose owner has no active credential — executed with two owners, one credentialed |
| D5 | A configuration failure consumes **no** retry; a rate-limit failure does — both executed |
| D6 | `jobs.error` contains no provider message and no key, over every failure class |
| D7 | Capture without a key: entry stored, awaiting state rendered, **no job row created** — asserted directly |
| D8 | Nothing is bulk-processed on key activation; the pending action enqueues only on an explicit act and reports its count |
| D9 | Node/Deno parity lock fails on a deliberate divergence |
| D10 | Parity moves by two; deployed bundle matches local |

---

## Slice BYOK.5 — Owner cutover

**Delivers:** BYOK-DEC-2's final clause — the project key serves no deployed user path,
including the owner's.

**Migration: 0.**

### Tasks

| # | Task |
| --- | --- |
| 5.1 | The owner configures their own key through the same Settings flow and storage contract |
| 5.2 | `OPENAI_API_KEY` is **removed from the deployed Edge Function secrets** and from the application runtime environment |
| 5.3 | BYOK-GUARD-006: the allowlist is pinned to the three classified exceptions — local development, mocked/opt-in tests, `scripts/remote-*.mjs` — and an ADR is required to add one |
| 5.4 | `scripts/remote-*.mjs` are confirmed still working under their own classified use, unchanged |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| E1 | Every AI capability works for the owner on the owner's own configured credential |
| E2 | `OPENAI_API_KEY` is **absent** from the deployed function's secrets — verified against the deployment, not the repository |
| E3 | Removing the owner's credential blocks the owner's AI exactly as it would any user's |
| E4 | The allowlist contains exactly three entries, compared in both directions |
| E5 | The full remote suite exits 0 |

---

## Slice BYOK.6 — Convergence and closeout

**Delivers:** BYOK-USAGE-001…005, BYOK-DELETE-001…006, BYOK-QUOTA-001/002/004,
BYOK-OPERATIONS-001…006.

**Migration: 0.**

### Tasks

| # | Task |
| --- | --- |
| 6.1 | Costs surface: "estimated" labelling, the pointer to the user's own OpenAI dashboard, no fingerprint and no `key_version` in `ai_usage_events` |
| 6.2 | Zero-secret residue verifier: after a disposable user is deleted, no credential row, no ciphertext, no validation rows, no jobs |
| 6.3 | The **complete** isolation matrix (PRD §20), executed end to end and transcribed |
| 6.4 | **Incident and rotation runbook**: master-key rotation, loss, compromise, pepper rotation, the bounded window and its expiry rule |
| 6.5 | **Master-key loss recovery, executed against a disposable project** (BYOK-MASTER-007) — the procedure is proven before it is needed, not written and trusted |
| 6.6 | Traceability generator + matrix, fail-closed on PRD drift |
| 6.7 | `SECURITY.md`: the new boundary, the operator-decryption reality, the guard inventory, the classified exceptions; line 59 moves from *required* to *delivered* with its evidence |
| 6.8 | Convergence audit — one adapter per runtime, one crypto module per runtime, one resolver per path, one copy module. **File what it finds; smooth nothing** |
| 6.9 | `docs/reports/byok/BYOK_REPORT.md` |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| F1 | Isolation matrix: all 18 cases executed and passing |
| F2 | Residue verifier exits 0 with zero survivors |
| F3 | The loss-recovery procedure **has been executed** against a disposable project, with a transcript |
| F4 | Traceability regenerates content-identically twice |
| F5 | Costs surface says "estimated" in both locales and names the authoritative source |
| F6 | Merge-SHA CI green on all three jobs |
| F7 | Parity unchanged from Slice BYOK.4 |

---

## 1. Migration budget

**Five migrations total** — raised from four by owner decision on 2026-08-01
(`ADR-070`, Amendment A-2). No slice may exceed its allocation without an owner decision,
and the rule that produced this change is the rule working: BYOK.1 **raised** the conflict
that forced it rather than quietly spending a migration it was not allocated.

| Slice | Migrations | Content |
| --- | --- | --- |
| BYOK.1 | 1 | `user_ai_credentials`, `credential_validation_attempts` |
| BYOK.2 | 1 | the two resolver RPCs |
| BYOK.3 | **1** | `credential_validation_attempts.ip_hash`, its index, and the retention mechanism (`BYOK-SCHEMA-010…015`) |
| BYOK.4 | 2 | `entries.status` literal; `claim_next_entry_interpretation_job` replacement |
| BYOK.5–6 | 0 | — |

*The original allocation is preserved for the record: four total, with BYOK.3 at zero.*

## 2. What this plan explicitly does not do

- **No infrastructure quotas** — signup, entries, queued-job counts, concurrency, uploads,
  storage, suspension. BYOK-QUOTA-001 hands these to signup hardening.
- **No account-deletion path.** BYOK-DELETE-002 names it as a prerequisite for the first
  invited user and delivers only the cascade and the residue verifier.
- **No signup change.** Closing hosted signup is immediate, independent, and a pre-code gate
  (G-0.5) — not a deliverable of this plan.
- **No CAPTCHA, terms, privacy policy or admin suspension.**
- **No Entity Graph Completion work.** Separate branches, separate commits, separate PRs.
- **No Phase 2G requirement, artifact or code.**
- **No public signup.** It remains a gate proven by a checklist, never a scheduled step.

## 3. Branch and PR discipline

- One branch per slice: `codex/byok-slice-1` … `-6`.
- Never on a branch that also carries Entity Graph work.
- Small thematic commits; no mixing of cleanup, formatting or dependencies with feature work.
- **No key material in any commit, PR body, screenshot, CI log or slice report** —
  BYOK-MASTER-003 applies to the artifacts this plan produces, not only to source.
- Merge-SHA CI green on the merge commit, not only the branch head.
