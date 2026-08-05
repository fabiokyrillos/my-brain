# Phase 2F — Slice 2F.1 Report: Guardrails, decisions and preconditions

Branch: `codex/phase-2f-slice-1` (base: `main` at `b54b833`). Governed by `docs/initiatives/phase-2f/PHASE_2F_PRD.md` Revision 4 (approved). Implemented 2026-07-29.

**This slice ships no migration, deploys nothing, and changes no behaviour.** Every artifact is a test, a document, or a preserved pre-code gate artifact. The rollback boundary is the branch/PR itself — a pure revert with no data or deployment consequence.

## 1. Requirement traceability (all 10 requirements owned by 2F.1, plus the cross-cutting gate)

| Requirement | Delivered by | Evidence |
|---|---|---|
| 2F-GUARD-001 | `src/lib/supabase/sql-grammar-guard.test.ts` | Chain scan green (exactly the two allowlisted superseded sites; zero if-case traps); 8 detector-falsifiability cases; **red-first proof in §3** |
| 2F-GUARD-002 | `src/lib/supabase/direct-write-guard.test.ts` | Writer inventory equals the allowlists exactly (tasks: 2 legacy writers; reminders: the Option C exception); **red-first proof in §3** |
| 2F-GUARD-003 | same file, detector suite | The gate extracts call sites from source text; synthetic-source cases prove every DML method detected and reads/other-table/later-chain traffic ignored |
| 2F-DECISION-001 | `docs/DECISIONS.md` ADR-054 | Activity remains a task; reopening condition named |
| 2F-DECISION-002 | ADR-055 | Both tiers with exact thresholds; `no_match` = {`still_unmatched`, `creation_offered`}; five non-authorizing metrics; by-construction exclusion mechanism; 90-day expiry with the dated `TODO.md` entry mechanism |
| 2F-DECISION-003 | ADR-056 + `docs/initiatives/phase-2/PHASE_2_PLAN.md` §Phase 2F + `docs/TODO.md` line 28 | Both stale definitions re-pointed at the PRD; displaced scope preserved as unscheduled future work gated on M11 |
| 2F-DECISION-004 | ADR-057 + `docs/TODO.md` deferral entry | Provenance deferral recorded with the executed-dry-run reopening gate; nothing implemented |
| 2F-PRECOND-001 | This branch tracks all gate artifacts | `phase-2f-writer-inventory.mjs`, `phase-2f-reminder-census.mjs`, `phase-2f-gate3-exact-title-reuse.mjs`, `phase-2f-gate1-record-ai-usage-dry-run.sql` (unrun by design), both gate reports, both reviews, proposal, PRD; `work-surface-reuse.test.ts` matches `vitest.config.ts`'s `src/**/*.test.{ts,tsx}` include and therefore runs in every CI `app` job |
| 2F-PRECOND-002 | `supabase/tests/phase_2f_effective_limit.sql` | 7 assertions pinning the `effective_limit + 1` row laws, the no-phantom-row case, the negative clamp, and the query-scalar property; the clamp bounds already pinned at `phase_2e_task_command_matching.sql:424-443` are cited, not restated. **Execution site: CI `database` job** — Docker is unavailable on this workstation, so no local pgTAP run is claimed |
| 2F-PRECOND-003 | §2 of this report | The executed-gate ledger below names every session |
| 2F-OPERATIONS-002 (cross-cutting) | Draft PR CI | Recorded in §2 when the run completes on the exact head SHA |

## 2. Executed-gate ledger (2F-PRECOND-003)

| Gate | Session | Result |
|---|---|---|
| Guard baseline (both new tests, pre-fixture) | Local, 2026-07-29 01:22 | 15/15 passed |
| **Red-first fixture proof** (both guards) | Local, 2026-07-29 01:23 | **4 failed / 11 passed** — the four chain/inventory assertions, each naming the fixture (§3) |
| Guard re-run after fixture removal | Local, 2026-07-29 01:23 | 15/15 passed |
| `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` | Local, 2026-07-29 (this session) | Recorded below at completion |
| pgTAP (`phase_2f_effective_limit.sql` + full suite) | CI `database` job on the PR head SHA | Recorded on the PR when green |
| Worker job (`deno check` + `deno test`, diff-free) | CI `worker` job | Recorded on the PR |

## 3. The red-first proof (verbatim evidence)

Two deliberately defective fixtures were created, the guards were run, the failures were captured, and the fixtures were deleted — in that order.

**Fixture 1** — `supabase/migrations/zz_2f1_guard_proof_fixture_do_not_apply.sql` (no timestamp, so the migration runner ignores it): a function body containing `pg_catalog.greatest(1, 2)`, `pg_catalog.coalesce(null, 0)`, and `if case when 1 >= 2 then 1 else 0 end = 1 then`.

**Fixture 2** — `src/features/operations/zz-guard-proof-fixture.ts`: a module performing `.from("tasks").delete()` and `.from("reminders").update()`.

Captured failing run (exit code 1, `4 failed | 11 passed`):

```
× finds exactly the allowlisted tasks writers — this list shrinks in 2F.2/2F.3 and is empty at 2F.4
    AssertionError: expected [ { …(3) }, { …(3) }, { …(3) } ] to deeply equal [ { …(3) }, { …(3) } ]
    +     "file": "src/features/operations/zz-guard-proof-fixture.ts",
× finds exactly the documented reminders exception, and nothing else
    +     "file": "src/features/operations/zz-guard-proof-fixture.ts",
× finds exactly the two allowlisted historical pg_catalog lookups, superseded and never to grow
    +     "file": "zz_2f1_guard_proof_fixture_do_not_apply.sql",   (×2 — greatest and coalesce)
× finds no depth-zero case inside any plpgsql if condition
    +     "file": "zz_2f1_guard_proof_fixture_do_not_apply.sql",
```

After deletion: `Test Files 2 passed (2) · Tests 15 passed (15)`. The detection logic that made the fixtures fail is permanently exercised by the inline detector suites (8 grammar cases, 3 inventory cases), so the falsifiability does not depend on the deleted fixtures.

## 4. What this slice deliberately did not do

- No 2F.2–2F.6 work: no Server Action, component, RPC, migration, smoke, or reader was touched. The two legacy task writers and the reminder exception remain in place, byte-identical — they are the guard's allowlist, not this slice's target.
- No provenance work (ADR-057), no reconciliation work, no reminder-contract work.
- The Gate 1 dry-run SQL remains **unrun**, by design; it is tracked, not executed.

## 5. Repository contradictions discovered

No PRD contradiction. Two accuracy notes:

1. The two historical `pg_catalog.greatest(` occurrences (`202607220041:1524`, `202607220044:1506`) live in function bodies later superseded (`202607220045`, `202607250052`) — the chain applies from empty because plpgsql resolves lookups at first execution, not creation. The guard allowlists them by exact equality rather than pretending the append-only chain is clean.
2. **A pre-existing, environment-dependent local test failure exists and is not this slice's.** `src/features/task-commands/sql-reachability.test.ts` fails 2 of 46 cases on this workstation ("the references never reach the scanning or ranking path"; "none of the preview columns appears in either ordering key"). Proven not a 2F.1 effect: `git diff main --name-only -- src/features/task-commands/ supabase/migrations/` is empty — the test and every file it reads are byte-identical to `main` — and the same two failures were observed against `origin/main` from this workstation on 2026-07-28 during the Phase 2E release checks, while CI on `main` is green (run `30391388573`). Vitest isolates test files, so the new suites cannot influence it. CI's `app` job on this PR is the authoritative verdict.

## 6. Verification

**Local (this workstation, 2026-07-29):**

- `npm run lint` — 0 errors, 0 warnings.
- `npm run typecheck` — clean.
- `npm test` — **128 files: 127 passed, 1 failed (2285 tests: 2283 passed, 2 failed)** — the two failures are the pre-existing environment-dependent `sql-reachability.test.ts` cases documented in §5.2, byte-identical to `main`. All 15 new guard assertions and all 10 preserved `work-surface-reuse.test.ts` cases pass.
- `npm run build` — production build green.
- pgTAP — **not executed locally** (no Docker); `phase_2f_effective_limit.sql` executes in CI's `database` job.

**CI (authoritative):** run id and per-job results on the exact head SHA are recorded in the acceptance summary and the PR.
