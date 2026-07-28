# Phase 2E Gate 1 — Pre-Phase-2E hardening cutover to the linked project

## 1. Purpose and verdict

Phase 2E must not build on a linked environment that lacks the accepted hardening contract. This report records the cutover of the Pre-Phase-2E Foundation Hardening (PR #17, merge `2e2acfd`) to the linked Supabase project, the defect the cutover exposed, and the evidence that the contract now holds.

**Verdict: READY.** The linked project matches merged `main` for migrations and worker behaviour, and every hardening contract asserted below was verified against a specific SQLSTATE rather than against "an error happened".

One production-blocking defect in merged `main` was found by this gate and fixed on the Phase 2E branch (§4). Two pre-existing test-infrastructure defects were found and fixed (§5). One pre-existing flake was found, characterised, and deliberately not fixed (§6).

## 2. Repository and environment state

| | Value |
|---|---|
| Repository | `github.com/fabiokyrillos/my-brain` |
| Base commit | `2e2acfd` (PR #17 merge) |
| Branch | `codex/phase-2e-natural-language-task-updates` |
| Linked project | `ulvwzqlpsjyrnqzfxmck` (`my-brain`, `us-west-2`, `ACTIVE_HEALTHY`, Postgres 17.6.1.147) |
| CI on `2e2acfd` | `verify` — success |
| Working tree at Gate 0 | clean; `main...origin/main` = `0 0`; no parallel Phase 2E branch or PR |

### 2.1 Gate 0 findings

Migrations `202607250052`, `053` and `054` existed locally but the remote column of `supabase migration list --linked` was **empty** for all three. The hardening was merged but never deployed. The deployment authorized by the phase brief was therefore required, not optional.

`.env.local` carries only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `OPENAI_API_KEY`. This does not block remote verification: `scripts/linked-supabase.mjs` derives the service-role and publishable keys from the authenticated Supabase CLI at run time. Docker is unavailable in this environment, so the local Supabase stack and pgTAP were not run here — CI runs both on every push (ADR-038).

## 3. Cutover

The mandated order is worker first, then migrations. Reversing it would let a worker without the new validation path submit output to the new SQL bounds trigger and burn a job's retry budget on a `P0001` that retrying cannot fix.

### 3.1 Rollback bundle, captured before any change

| Function | Version | sha256 (prefix) | Last updated |
|---|---|---|---|
| `process-jobs` | 13 | `e49daf342580` | 2026-07-19T15:06:50Z |
| `heartbeat` | 4 | `7e7e7a0635f4` | 2026-07-16T20:49:28Z |

Deployed `process-jobs` v13 corresponds exactly to worker source at commit `daca148` — the newest worker-touching commit at or before its deploy timestamp, confirmed by `git log -- supabase/functions`. The only functional delta from `daca148` to `2e2acfd` is the new `_shared/extraction-validation.ts` plus 42 changed lines in `process-jobs/entry.ts`.

**Rollback procedure:** `git checkout daca148 -- supabase/functions && npx supabase functions deploy process-jobs --project-ref ulvwzqlpsjyrnqzfxmck --use-api`, then restore the working tree. `heartbeat` has no source drift since its deploy and was not redeployed.

### 3.2 Worker validation before deploy

- `deno check --config supabase/functions/process-jobs/deno.json --node-modules-dir=none --no-lock supabase/functions/process-jobs/index.ts` → exit 0
- same for `heartbeat/index.ts` → exit 0
- `deno test` across `_shared/`, `process-jobs/`, `heartbeat/` → `ok | 28 passed | 0 failed`

### 3.3 Deployment sequence

1. `process-jobs` deployed → **v13 → v14**.
2. Worker health probed directly against the deployed endpoint, confirming the module graph loads rather than returning a boot error:
   - `GET` → `405 {"error":"Method not allowed"}`
   - `POST` no bearer → `401 {"error":"Unauthorized","code":"missing_bearer"}`
   - `POST` anon bearer → `401 {"error":"Unauthorized","code":"invalid_access_token"}`
   - `POST {"mode":"dispatch"}` without the secret → `401 {"error":"Unauthorized"}`
3. `supabase db push --linked` applied `202607250052`, `053`, `054` in order, exit 0.
4. Migration parity re-checked: local and remote columns now agree through `202607250054`.
5. `process-jobs` redeployed after the §4 fix → **v14 → v15** (`245d9753f552`).

## 4. The defect this gate existed to catch

### 4.1 Symptom

With v14 deployed, `npm run test:remote:entry-processing` failed at the first direct worker invocation. Raw probing of the endpoint — `functions.invoke` collapses every non-2xx into one opaque message — returned:

```
HTTP 500 {"error":"Processing failed","code":"job_retry_scheduled"}
jobs.error = Entry extraction output failed validation (taskCandidates.0.dueAt:expected_iso_instant)
jobs.status = failed          entries.status = recoverable_error
```

### 4.2 Root cause

The hardening added strict validation of model output without changing what the model is asked for. The response schema handed to the provider declares `dueAt: { type: ["string","null"] }` — a bare string — and OpenAI Structured Outputs does not enforce JSON Schema `format`. Nothing at the provider boundary made a timezone designator mandatory, while `isIsoInstant` began requiring one. `git diff daca148 d1a129b -- supabase/functions/process-jobs/entry.ts` confirms the commit added validation only; the prompt and schema are untouched.

Sampling the production model with the production prompt over six fixtures:

| Entry | `dueAt` returned | Accepted |
|---|---|---|
| "buy milk tomorrow and follow up with Alice" | `2026-07-26T23:59:59-03:00` | yes |
| "pagar o boleto da internet até sexta-feira" | `2026-07-31T23:59:59-03:00` | yes |
| "Send the quarterly report to Maria by next Monday" | `2026-07-27` | **no** |
| "ligar para o João amanhã de manhã" | `2026-07-26` | **no** |
| "Renew the domain before it expires at the end of the month" | `2026-07-31` | **no** |

Three of five non-null deadlines were rejected. `occurredAt` never failed (6/6 full instants) because the prompt anchors it to a `currentTime` that is already an instant — which is precisely why only the unanchored field drifted. A deterministic prompt reproduces the same output, so every retry spent the job's budget on an error retrying cannot fix.

This was latent in merged `main`: under worker v13 the bare date was cast without validation and silently coerced by PostgreSQL to midnight UTC — wrong for a `America/Sao_Paulo` user, but not an outage. Deploying the validated worker converted a silent wrong-timezone bug into a hard failure of the capture pipeline.

### 4.3 Fix

Commit `739e3b9`, two layers because either alone still fails:

- The prompt now states the required format with an example, and `EXTRACTION_PROMPT_VERSION` moves `2026-07-16.1` → `2026-07-25.1` in **both** runtimes, so the change is attributable in `entry_interpretations.prompt_version`.
- `supabase/functions/_shared/extraction-normalization.ts` widens the two shapes a known timezone makes unambiguous — a bare local date, and a local date-time with no designator — between parse and validation. A deadline written as a day becomes the end of that day, matching the convention the model itself uses when it does comply. The zone is the entry's own, the same one the prompt was given. The offset is resolved for that date, so DST zones stay correct across the year. A wall time that does not exist in the zone, a non-calendar date, an unknown zone and free text are all returned untouched for validation to reject.

`src/lib/ai/extraction-contract.test.ts` closes the half of review finding H4 the hardening left open: prompt text and both version constants existed twice, kept in sync by comment. The suite pins them across runtimes and pins the worker's parse → normalize → validate order. Its first run failed on a deliberate one-sided prompt edit, which is the drift it exists to catch.

### 4.4 Evidence the fix works

- 18 new Deno tests, including a reproduction that asserts `validateExtraction` rejects the exact production payload and accepts it after normalization.
- Deno suite `28 → 46 passed, 0 failed`.
- `npm run test:remote:entry-processing` reproduced the failure before the fix and passes after it.

## 5. Test-infrastructure defects found and fixed

### 5.1 Credential resolution failed on a CLI telemetry flake — commit `7192054`

Every remote smoke resolves credentials through `getLinkedSupabaseCredentials`, which shells out to `supabase projects api-keys`. The CLI flushes telemetry after writing its result, so a failed flush ("Timeout while shutting down PostHog") exits non-zero with the complete, valid JSON already on stdout. `execFileSync` throws on any non-zero exit — observed failing **two of three consecutive runs**, which makes every remote gate non-deterministic and would have been inherited by the Phase 2E aggregate smoke.

The failure is now tolerated only when it is provably not a failure: stdout is parsed and the run proceeds if it yields a service-role/publishable pair; anything else still throws. The re-raise is also no longer the CLI's own error object — its `stdout` property holds the key list, and an uncaught throw prints an error's properties, which put a live service-role key on the terminal. Six tests pin the tolerance boundary, including that no key material survives into the raised error. Three consecutive `test:remote:2d` runs pass where two of three failed before.

### 5.2 The dispatch-drain assertion raced the worker — commit `79347f2`

`remote-entry-processing-smoke.mjs` read `jobs.status` synchronously as soon as the entry reached a terminal status. Those are not the same moment: `processEntryJob` persists the interpretation, then makes an OpenAI embedding round-trip, and only then calls `complete_job`. The assertion failed whenever the embedding outlasted the slack in the 1s polling interval — once in four runs. It now waits for the job, like every other asynchronous assertion in the file. The production ordering it was racing is correct and unchanged: completing a job before its embedding would make a mid-embedding crash unretryable.

## 6. Pre-existing flake found, characterised, not fixed

`test:remote:2d` failed once in three runs with `plain interpretation job was not claimed`. Four smoke scripts (`remote-editable-candidate-confirmation`, `remote-question-preview`, `remote-question-reinterpretation`, `remote-question-resolution`) create an entry and then claim its `interpret_entry` job themselves as a simulated worker, while the unattended `pg_cron` drain claims eligible jobs **across all owners** every minute. When the drain wins, `claim_entry_interpretation_job` returns null.

This is a genuine race introduced with the Slice 2X.5 drain, but it is pre-existing, confined to Phase 2C/2D test scripts, does not make any Phase 2E slice unsafe, and spans four files. Per the phase brief's rule on absorbing discovered work, it is recorded in `docs/TODO.md` rather than fixed here, and Phase 2E's own smokes are required by `2E-OPERATIONS-004` to be immune by construction.

## 7. Hardening contract verification

Each probe asserts a specific SQLSTATE. An earlier run of this verification produced four vacuous passes — `PGRST202` ("function not found in schema cache") from guessed parameter names looks identical to a revocation, and `22003` from a `numeric(4,3)` overflow looks identical to a bounds rejection. Signatures were taken from `src/lib/supabase/database.types.ts` and the probes re-run.

| Contract | Probe | Result |
|---|---|---|
| `054` retired RPC is unreachable | `confirm_entry_tasks` as `authenticated` | `42501 permission denied for function confirm_entry_tasks` |
| `054` did not take the live path with it | `confirm_entry_task_candidates_v6` as `authenticated` | `22023 Candidate resolutions exceed the allowed bounds` — the body ran |
| `052` undo router reaches the registry | `undo_operation` with an unknown id | `P0002 Undo operation not found` |
| `053` bounds refuse out-of-range confidence | `entry_interpretations` insert, `confidence = 1.5`, as `service_role` | `23514 entry_interpretations_confidence_check` |
| bounds do not block valid writes | same insert, `confidence = 0.75` | accepted |
| queue health | all jobs, all owners | 4 jobs, 0 expired leases, 0 pending > 10 min, 0 failed |
| no residual test data | disposable `*@example.test` users | none |

Note on scope: the `053` rejection above came from the base column CHECK, which is at least as strict for this field. Migration `053`'s own trigger bounds the *task-candidate* fields inside a persisted interpretation, and that path is exercised end to end by the entry-processing smoke, which persists real interpretations through it.

## 8. Remote gate results

| Gate | Result |
|---|---|
| `npm run test:remote` | passed — auth, atomic settings, RLS, ownership, heartbeat, AI ledger, aggregation, deployed file worker |
| `npm run test:remote:jobs` | passed — exclusive lease, stale-worker denial, recovery, exhaustion, sanitization, metrics, RLS |
| `npm run test:remote:entry-processing` | passed after §4 and §5.2 |
| `npm run test:remote:interpretations` | passed — including a bounded-time `55P03` conflict in 329 ms with no gateway hang |
| `npm run test:remote:product-events` | passed — allowlist, privacy, idempotency, subject-ownership, RLS, service-role, bounded response, cleanup |
| `npm run test:remote:daily-cycle` | passed |
| `npm run test:remote:2c` | passed — including residual-data cleanup |
| `npm run test:remote:2d` | passed (2 of 3 runs before §5.1; 3 of 3 after, with one unrelated §6 flake observed) |

## 9. Post-cutover state

| | Before | After |
|---|---|---|
| `process-jobs` | v13 (`e49daf342580`) | v15 (`245d9753f552`) |
| `heartbeat` | v4 (`7e7e7a0635f4`) | v4, unchanged |
| Migrations | through `202607230051` | through `202607250054`, full parity |
| `EXTRACTION_PROMPT_VERSION` | `2026-07-16.1` | `2026-07-25.1` |

## 10. Local gates after the fixes

- `npx eslint .` → exit 0
- `npx tsc --noEmit` → exit 0
- `npx vitest run` → **95 files, 1027 tests, all passing**
- `deno check` both entrypoints → exit 0
- `deno test` all function directories → **46 passed, 0 failed**

## 11. Deferred to `docs/TODO.md`

1. The Phase 2C/2D smoke-versus-drain race of §6, across four scripts.
2. Write-path consolidation: migrate `applyWorkItemAction`/`createRecord` onto a validated RPC and revoke direct `insert/update/delete` on `public.tasks` from `authenticated`.
3. `scripts/remote-product-events-smoke.mjs` hard-codes the event taxonomy instead of importing `contracts.ts`, so TypeScript drift does not red it.
4. Stale permanent documentation corrected in the Phase 2E PRD §3.4 but not yet in the source documents.
