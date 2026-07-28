# Phase 2E — Slice 2E.8 Report (Epic 2E-H: Convergence and Closeout)

## 1. Scope

The final slice. It writes no product behaviour: Slice 2E.7 was the last slice that could, and this one audits what the seven before it built, produces the closeout artifacts Epic 2E-H names, and takes the phase to a coherent completion boundary.

Its mandate was convergence, verification and release readiness — **not** merge, deploy or release, none of which are authorized.

## 2. Entry reconciliation

Repository truth was verified before any work, because `PHASE_2E_PROGRESS.md` has carried a structurally stale HEAD for five consecutive sessions (it is written before the docs commit that carries it).

| Fact | Verified value | Matches the handoff? |
|---|---|---|
| HEAD | `de77eff0958f77a506c0f5809981416adb00da8a` | yes |
| Working tree | clean | yes |
| vs `origin/<branch>` | 0 ahead, 0 behind | yes |
| vs `origin/main` | 58 ahead, **0 behind** | yes |
| PR #18 | OPEN, DRAFT, MERGEABLE, `mergeStateStatus: CLEAN`, 58 commits, head `de77eff` | yes |
| CI on the exact HEAD | run `30371305784`, all three jobs `success` | yes |
| Remote migration parity | `202607250054`; `202607250055`–`202607280061` local only | yes |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — untouched by this phase | yes |
| Tags / releases | `phase-2d-complete` only | yes |

**No drift.** This is the first Phase 2E session whose entry check found none.

## 3. The convergence audit, and what it found

Epic 2E-H's premise is that every Phase 2E contract has exactly one source and one set of consumers. Until Slice 2E.7 shipped a caller, each contract had *zero* consumers, so the audit was genuinely possible for the first time here.

The full contract-by-contract table is in `PHASE_2E_FINAL_REPORT.md` §4. Seven of the eight converged contracts were clean. The eighth produced three findings, all in `src/features/task-commands/vocabulary.ts`, and they are one defect wearing three faces: **the bilingual term tables were outside the versioning regime every other policy module lives inside.**

### 3.1 The finding that mattered

`policy-lock.test.ts` contained a case named *"pins the status and priority vocabularies to the same version"*. It digested `TASK_STATUSES` and `TASK_PRIORITIES` — the **closed database literals**, which `vocabulary.ts` neither owns nor can change.

The 61 bilingual term mappings the module *does* own were digested by nothing. Re-pointing a single entry — `bloqueada` from `blocked` to `deferred` — moves a user's task to a state they never named, and the entire suite would stay green. That is the exact silent-drift class PRD §10.4's versioning rule exists to prevent, sitting at the one layer where a wrong mapping is immediately user-visible in the product's primary language.

Two corroborating findings made the same point:

- **`TASK_VOCABULARY_VERSION` was orphaned.** Its docstring promised it moved with the policy version. Nothing read it, so it had drifted to `2026-07-25.1` while `TASK_COMMAND_POLICY_VERSION` was at `.2` — a stale constant that no gate could notice, which is the observable symptom of the same hole.
- **`vocabularyCoversEveryLiteral()` was exported and never called**, duplicating two assertions already present in that same test file.

### 3.2 The fix

`canonicalVocabularyEntries()` emits the real term tables as sorted `["kind", "term", "literal"]` triples; `policy-lock.test.ts` digests them under `TASK_VOCABULARY_VERSION` and asserts that constant equals `TASK_COMMAND_POLICY_VERSION` (forcing the bump to `.2`); the misnamed case is renamed to what it actually pins; and the dead guard is called so the duplication retires instead of the guard.

**One detail is load-bearing and easy to get wrong.** The sort uses plain code-unit comparison, not `localeCompare`. A digest pinned in a test must not move when the runtime's ICU data does — otherwise the gate this slice just built would itself become a source of false failures on a Node upgrade.

`policy-lock.test.ts` 35/35.

### 3.3 What the audit checked and found clean

No other duplicated logic, orphaned contract, unreachable path or dead code. Specifically: `clarifyTaskCommand` is reachable (bound to the `clarify` intent in the `runTaskCommand` dispatcher and exercised end-to-end in `actions.test.ts` — an unused-export scan flagged it, and the scan was wrong); all eight Server Actions are reached through that dispatcher; the 52 exports referenced only by tests were each resolved to a contract surface or a published type.

## 4. Closeout artifacts built

| Artifact | Responsibility | Executed? |
|---|---|---|
| `scripts/generate-phase-2e-traceability.mjs` | Fail-closed generator over the PRD inventory | **yes** |
| `docs/reports/PHASE_2E_TRACEABILITY_MATRIX.md` | 135 rows: 122 requirements × 16 families, 8 epics, 5 gates | **yes** — generated |
| `scripts/verify-phase-2e-cleanup.mjs` | Residual-data check, 18 owned tables | **yes** — against the live linked project |
| `scripts/remote-phase-2e-smoke.mjs` | Aggregate two-owner remote smoke | **preflight only** — blocked on deployment |
| `docs/reports/PHASE_2E_FINAL_REPORT.md` | Phase report + deployment/rollback/merge/release checklists | n/a |
| npm scripts | `docs:phase-2e:traceability`, `test:remote:2e`, `test:remote:2e:cleanup` | **yes** |

### 4.1 The generator fails closed, and that was tested rather than asserted

Four tamper runs against a restored copy of the PRD — drop a requirement, add one to an existing family, introduce a new family, remove an epic bullet. **All four threw**, and the PRD was byte-identical afterwards.

One inventory detail is worth recording because it would have produced a plausible-looking wrong matrix. Phase 2E is the first phase whose requirement families carry digits — `2E-I18N` and `2E-A11Y`. A `[A-Z]+` family class silently drops seven requirements and still generates a well-formed document. The expected total is **122, not 115**, and the generator's comment says so at the regex.

### 4.2 The cleanup verifier had a real defect, found by running it

It detected an absent table by SQLSTATE `42P01`. PostgREST answers from its schema cache and never reaches Postgres for an unknown relation, so it returns **`PGRST205`** instead. The verifier died on the first Phase 2E table — the exact failure the branch was written to prevent. Fixed, re-run, green: zero disposable users, zero orphaned rows across 17 existing tables, zero remote-smoke storage objects, and `task_command_confirmations` correctly reported as absent-because-undeployed.

**This is the argument for executing closeout tooling instead of shipping it read-only.** A verifier that has never run is a claim, not a gate.

### 4.3 The aggregate smoke is drain-safe by construction

2E-OPERATIONS-004 requires determinism and no competition with the shared queue drain. The smoke **creates no entries at all**, so no `interpret_entry` job is ever enqueued and the per-minute `pg_cron`/`pg_net` tick has nothing to race. It seeds tasks by direct owner-scoped insert — which is possible only because of the residual direct-write grant PRD §16.4 states plainly — while every assertion still goes through a Phase 2E RPC.

Its preflight runs today and exits **2** with `BLOCKED ON DEPLOYMENT`, deliberately distinct from an assertion failure (exit 1) so a future CI wiring can tell "not deployed yet" from "deployed and broken".

## 5. `2E-COMMAND-012` — the decision

Slice 2E.7 left this as Slice 2E.8's to settle: add the column, or record a reclassification in the PRD.

**Decision: reclassified to Phase 2F, recorded as PRD revision 4, and explicitly *not* counted as delivered.**

The requirement asks that a proposal's prompt and strategy versions be recorded on the resulting operation. Its own justification clause — "since `ai_usage_events` has no column for them" — shows it was framed as a workaround for a ledger gap rather than a first-order obligation.

Delivering it requires changing the argument list of `apply_task_command`, `create_task_command`, or `record_ai_usage`. **None can be done by `create or replace`**: in PostgreSQL a different argument list is a different function, so the old overload survives and every existing call becomes ambiguous. Each needs `drop function` plus a complete re-declaration — ~1,460 lines for `apply_task_command`; and `record_ai_usage` is shared by every AI path in the product and pinned by two `::regprocedure` casts and a `has_function` type array across two pgTAP files, hand-written types, and the Deno worker.

That is not a change a closeout slice should make with a four-minute CI round trip as its only SQL evidence. The residual risk — attribution by joining `ai_usage_events.created_at` to the deploy history rather than reading a column — is written into the PRD, the final report, the traceability matrix and `TODO.md`, in the same words.

## 6. The documentation obligation that could not be met

PRD §24 revision 2 promised: *"Nineteen further findings were refuted with evidence and are recorded in the Slice 2E.8 convergence report."*

**They cannot be.** Those findings came from the seven-reviewer PRD round of 2026-07-25 and were never persisted to the repository. Reconstructing nineteen plausible refutations to satisfy the sentence would be fabrication. Revision 4 withdraws the promise and says why; `PHASE_2E_FINAL_REPORT.md` §9 records it as an unmet obligation rather than a discharged one.

The refutations that *were* written down when they happened — the candidate-slot collision withdrawn on four independent lenses (ADR-048), Slice 2E.4's terminal-timestamp refutation — stand unaffected.

## 7. Verification

See `PHASE_2E_FINAL_REPORT.md` §6 for the full picture. Local gate results for this slice are recorded in `PHASE_2E_PROGRESS.md` under "Local gates on HEAD", refreshed for the Slice 2E.8 tree.

**No local pgTAP run is reported, in this slice or any other.** Docker is unavailable on this workstation, so CI's `database` job on the exact SHA is the only SQL evidence this phase has ever had.

**This slice adds no migration and no pgTAP file.** Its database footprint is zero, which is why the pgTAP count is expected to stay at `Files=30, Tests=1277` — the same arithmetic Slice 2E.7 recorded, and for the same reason.

## 8. Requirements this slice discharges

- **Fully:** `2E-OPERATIONS-001`, `2E-OPERATIONS-002`, `2E-OPERATIONS-005`, and Epic 2E-H's convergence, traceability, cleanup-verifier and permanent-documentation obligations.
- **Measured and transcribed:** `2E-MATCH-018`, with its scope caveat carried into the phase report rather than dropped.
- **Reclassified, not delivered:** `2E-COMMAND-012` (§5).
- **Written and blocked on deployment:** `2E-OPERATIONS-003`, `2E-OPERATIONS-004`, `2E-OWNERSHIP-004`'s remote half.
- **Repaired by the audit:** `2E-COMMAND-004` and PRD §10.4's versioning rule, at the vocabulary layer where they were silently unenforced (§3).

## 9. Open items after this slice

Everything here is in `PHASE_2E_FINAL_REPORT.md` §7 with fuller justification.

1. **Deployment is not authorized.** It gates every remaining item, and it is a human decision.
2. **`2E-COMMAND-012`** is deferred to Phase 2F by recorded decision.
3. **The nineteen PRD-round refutations** are permanently unrecoverable (§6).
4. **`src/features/tasks/task-candidate-form.test.tsx` is flaky under CI load.** A Phase 2C component test, unrelated to this phase. Deliberately not fixed here: it has never reproduced locally (3/3 green), and a fix without a reproduction is a guess dressed as maintenance.
5. **`PHASE_2E_SLICE_07_DESIGN.md` §6** promises 42 findings the file does not contain. The content was never written down.
6. **The `restore_task` >25-same-title cancelled-task edge** remains disclosed, with `hasMore` telling the user the list is truncated.
7. **PR #18 remains open.** Nothing merged, deployed, tagged or released.

## 10. Verdict

**Slice 2E.8 is complete, and Phase 2E reaches a coherent completion boundary.**

Every one of the 122 requirements is implemented, intentionally deferred with a written justification, or blocked only by deployment authorization. The convergence audit found three real defects and fixed them. Two of the three closeout tools were executed against the live linked project, and one of them was fixed because running it proved it wrong.

**PR #18 is READY FOR REVIEW.** It must not be merged, deployed or released without the authorizations named in `PHASE_2E_FINAL_REPORT.md` §10–§13.
