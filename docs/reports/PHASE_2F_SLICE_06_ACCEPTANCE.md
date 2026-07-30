# Phase 2F — Slice 2F.6 acceptance report

**Verdict: accepted. Phase 2F is complete.**

**Objective:** close Phase 2F with executed evidence — a fail-closed traceability artifact, a phase-wide cleanup verifier, the census stop-gate, the whole-phase convergence audit, and reconciled permanent documentation.
**Scope:** `2F-OPERATIONS-003` … `006` (epic 2F-F) plus the convergence audit. Nothing else.
**Definitive PRD:** `docs/reports/PHASE_2F_SLICE_06_PRD.md` (Revision 2).
**Implementation report:** `docs/reports/PHASE_2F_SLICE_06_REPORT.md`.
**Final phase report:** `docs/reports/PHASE_2F_REPORT.md`.
**Decisions:** ADR-061, ADR-062, ADR-063.

---

## 1. Identities

| | |
|---|---|
| **Merge SHA** | **`7e3e5f08f6cc125e39a8b9bd4736bee28ce32141`** (PR #33) |
| Merge date | **2026-07-30** (`git show -s --format=%cs 7e3e5f0`) |
| **Merge-SHA CI** (`2F-OPERATIONS-002`) | run **`30520514810`** on `7e3e5f0` — `application`, `edge worker`, `database and journey` **all success, first attempt** |
| Final `main` HEAD | `7e3e5f08f6cc125e39a8b9bd4736bee28ce32141`, identical to `origin/main` |
| Working tree | clean |
| **Migration parity** | **`202607300063`** before and after, local ≡ remote, no drift |
| Deployed project | `ulvwzqlpsjyrnqzfxmck` |
| Migrations applied by this slice | **none** |
| Production writes by this slice | **none** |

## 2. Commits

| SHA | Subject |
|---|---|
| `32905e6` | `docs(2f6)`: the definitive Slice 2F.6 PRD, after one adversarial review |
| `c1074aa` | `feat(2f6)`: the closeout instruments, and what they found |
| `5de8ded` | `fix(2f6)`: four drift tests could pass on a collateral failure |
| `b07b8c8` | `fix(2f6)`: the reviews found the closeout claiming what it had not earned |
| `87aad77` | `fix(2f6)`: an unrelated strikethrough could switch the scan off |
| `af5239e` | `docs(2f6)`: measure how discriminating the §10 tokens actually are |
| `486efbc` | `docs(2f6)`: record that the final review could not execute |

**Branch:** `codex/phase-2f-slice-6`, preserved. 24 files changed.

## 3. Branch CI history

| Run | SHA | Result |
|---|---|---|
| `30516574180` | `5de8ded` | all three success |
| `30518704187` | `b07b8c8` | all three success |
| `30519327238` | `87aad77` | `application` failed on the pre-existing `task-candidate-form.test.tsx` flake, then **success on all three** after re-running that job — same test and same "Resolver 2 sugestões" message that failed at `6628b02` before this branch existed, on a tree this branch does not touch |
| `30519768789` | `af5239e` | all three success, first attempt |
| `30520287006` | `486efbc` | all three success, first attempt |
| **`30520514810`** | **`7e3e5f0` (merge)** | **all three success, first attempt** |

## 3a. Acceptance-PR CI

| Run | SHA | Result |
|---|---|---|
| `30521247006` | `9da4b71` | `database and journey` failed, then **success on all three** after re-running that job |

**The failure was external and was proven so rather than assumed.** `next build` inside the `database` job could not fetch the JetBrains Mono webfont — `Error while requesting resource`, then `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'`. Three things establish it as a runner-network flake: the **same run's** `application` job executed the identical `npm run build` and **succeeded**; this PR's diff touches only documentation, one generator evidence array and one test fixture inventory, none of it in the build graph; and the same build passed on every prior run on both branches. Recorded here because the alternative — calling a red job "unrelated" without evidence — is the habit this phase's closeout exists to break.

## 4. Post-merge verification — every gate re-executed from merged `main` content

Run in the order the PRD prescribes (§15 X5), so no fixture-minting run can contaminate the stop-gate.

| # | Gate | Result |
|---|---|---|
| 1 | `npm run test:remote:2f:census` | **stop-gate clear** — buckets 1 and 2 zero |
| 2 | `npm run test:remote:2f:cleanup` | **CLEAN — zero residue**, exit 0 |
| 3 | `npm run docs:phase-2f:traceability` | regenerates **content-identical** to the committed matrix; the byte-equality case passes. The only working-tree difference was line endings — `core.autocrlf=true` rewrites the checkout to CRLF while the generator writes LF, which `git diff --ignore-cr-at-eol` confirms is the whole delta |
| 4 | `npm run test:remote:2f:funnel` | **32 / 32**, exit 0 |
| 5 | `npm run test:remote:2f:baseline` | **9 / 9**, exit 0 |
| 6 | `npm run test:remote` (full remote suite) | **exit 0** — auth, atomic settings, RLS, ownership, heartbeat, AI ledger, aggregation, deployed file worker |
| 7 | `npm run test:remote:2f:census` again | **still clear** |
| 8 | `npm run test:remote:2f:cleanup` again | **still CLEAN — zero residue**, 0 fixture-prefix survivors, 0 fixture storage objects |
| 9 | `npx supabase migration list --linked` | **`202607300063`**, local ≡ remote |

## 5. Census result (`2F-OPERATIONS-005`)

Executed against `ulvwzqlpsjyrnqzfxmck` at parity `202607300063`, three times across the slice (twice pre-merge, once post-merge, plus a confirming run after each fixture-minting batch). Every run identical:

| Bucket | Count | |
|---|---|---|
| 1. live reminder on a terminal task | **0** | **blocking — clear** |
| 2. live task-bound reminder on a non-terminal task with null `due_at` | **0** | **blocking — clear** |
| 3. reminder owner ≠ task owner | 0 | structurally impossible, measured anyway |
| 4. `task_id` references a nonexistent task | 0 | structurally impossible, measured anyway |
| 5. snoozed rows | 0 | `2F-REMINDER-004`'s dormant literal, unreached |
| 6. independent reminders | 0 | |
| 7. live independent reminders | **0** | informational — never blocks |
| 8. total reminders | 1 | status `sent` |
| 9. total live reminders | 0 | |

**No stop-gate triggered; no owner decision required; no migration authorized or written.** Bucket 6/7 being zero is also what keeps `SECURITY.md`'s Option C justification measured rather than merely historical — recorded there with the figures and the date.

## 6. Cleanup verification result (`2F-OPERATIONS-004`)

`CLEAN — zero Phase 2F fixture residue`, exit 0, four times across the slice. Reported per category:

- **0** fixture-prefix survivors in `auth.users` over **20** prefixes (2 real users in the project);
- **0** fixture objects in `user-files` (6 real objects);
- **17** tables read with per-table row counts and **0** orphans each;
- `task_command_confirmations` and `product_events` both `refused (asserted)` — a *successful* read would have failed the run;
- `anon` denied `42501` on `tasks` and on `reminders`, each after a privileged positive control on the same table;
- **20** tables deliberately not scanned, each with its reason and cascade anchor, and a CI case requiring every owner-scoped table in the chain to appear in exactly one of the two lists;
- deferrals proven held: `create_reminder` absent, `create_task_command_v2` absent, `record_ai_usage` at **10 arguments, unchanged**, ADR-057's gate script present with **0** transcripts.

**Stated, not implied:** `product_events` row absence after an owner's deletion is unreadable with any credential this repository holds. It is proven as a composition — the asserted `service_role` refusal, plus zero surviving fixture owners, plus the `on delete cascade` now asserted in CI pgTAP.

## 7. Traceability result (`2F-OPERATIONS-003`)

`docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md`: **68 requirements, 12 families, 68 delivered, 0 not delivered, 11 carrying a recorded note, 7 cross-cutting-only, 2 migrations, 41 §10 gate cells.** Byte-stable across runs; regenerable from merged `main`.

Eleven checks, each reading the thing it is about, each proven in **both** directions by fixture-root cases — and one case that regenerates the matrix from the **real repository** and compares byte-for-byte, which is what puts all eleven inside CI. **99 / 99** closeout cases pass.

## 8. Convergence audit result

A1–A15 verified (details in the implementation report §5). The audit filed **six defects and one contradiction**, none smoothed:

1. §10's `database` cell for 2F.5 understated a slice that added three pgTAP assertions → PRD Revision 4.3-a.
2. §10's parity row's stated rule contradicted its own 2F.2 cell → Revision 4.3-b.
3. **§10's 2F.4 authenticated-journeys cell claimed an executed gate that appears in none of its sixteen acceptance gates** → Revision 4.3-c, corrected rather than back-filled (ADR-063).
4. A CI run id cited against the wrong SHA in `STATE.md`/`TODO.md`, and — found in the review that followed — **three more** documents citing a branch-head run as a merge-SHA run.
5. A third flaky component test (`question-answer-form.test.tsx`) never recorded.
6. `STATE.md`'s Current-truth section held five present-tense claims that deployed migrations were undeployed; `SECURITY.md` held a sixth.
7. `STATE.md`'s Slice 2F.4 section carried a pre-deployment paragraph beside its own deployment record.

**`2F-OPERATIONS-002` is recorded partial as a result.** Reading every Phase 2F merge commit's CI directly found nine of ten green — one only after this closeout re-ran a run the workflow's own concurrency group had cancelled — and one, `6628b02` (a documentation-only 2F.4 acceptance merge), that has never had a green `application` job across two runs on two different known flakes. The requirement says every slice PR's merge SHA, so the ledger says partial, with the two flaky tests as its destination.

## 9. Review cycles

| Cycle | Findings | Outcome |
|---|---|---|
| Design review of the initial PRD | 20 (3 blocking, 4 major, 9 moderate, 5 minor) | 19 confirmed and folded in; 1 confirmed in substance with its **framing rejected** (a date basis, not an impossible date). Two blocking findings proved the draft specified checks that **could not run against merged content**; the third *removed* scope |
| Implementation review — tooling | 20 (2 blocking, 4 major, 5 moderate, 6 minor, plus 14 attacks that held) | all confirmed and fixed |
| Implementation review — documentation | 20 (3 blocking, 6 major, 7 moderate, 4 minor) | all confirmed and fixed |
| Final pre-merge review | **could not execute** | dispatched five times; terminated on a platform error every time (once `401 OAuth token revoked`, four times `529 Overloaded`). Its highest-value items were performed directly and are recorded in the implementation report §7 as self-verification. **This is a real gap in the review record and is stated as one** |

**The substitute pass was not decorative.** It found and closed a genuine defect — the historical-line exemption could be switched off by an unrelated strikethrough anywhere on the line — and replaced an assumption about the §10 subject tokens with a measurement showing four of seven are loose, which the generator now says about itself.

**The lesson this slice earned.** Every cycle found the same species of defect at a different altitude: **a claim recorded before it was earned.** The draft's `--posture` mode would have made the read-only slice write to production. The documents declared the phase complete with the PR open. §10 marked a gate executed that never ran. Three documents cited a branch-head run as a merge-SHA run. Four drift tests could pass on a collateral failure. And the generator itself — the instrument built to catch exactly this — ran only against fixtures, in no CI job. Each was fixed by making the record wait for the fact, or by making a check read the thing it is about.

## 10. Files changed

24 files: `scripts/generate-phase-2f-traceability.mjs` (new), `scripts/verify-phase-2f-cleanup.mjs` (new), `scripts/phase-2f-reminder-census.mjs` (corrected), four new `src/lib/closeout/*.test.ts`, `supabase/tests/phase_2f_task_write_grants.sql` (+1 assertion, `plan(27)`→`plan(28)`), `package.json` (+3 scripts), `docs/PHASE_2F_PRD.md`, `PHASE_2_PLAN.md`, `STATE.md`, `TODO.md`, `CHANGELOG.md`, `DECISIONS.md`, `SECURITY.md`, `DATABASE.md`, and five reports including the new traceability matrix.

**No migration. No product code. No grant, policy, RPC, trigger, index or view.**

## 11. Test results

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **2522 / 2524** — two pre-existing Windows-only CRLF failures (§13) |
| `npx vitest run src/lib/closeout/` | **99 / 99** |
| `npm run build` | compiled successfully |
| `deno check` both entrypoints | clean |
| `deno test supabase/functions/` | **46 / 46** |
| Authenticated journeys | **36 / 36** — 18 tests × Desktop Chrome and Pixel 7, fourteen of the eighteen locale-parameterised across pt-BR and en |
| CI `database` (from an empty chain) | success on every run, including the new pgTAP cascade assertion |

## 12. Database, grant and RLS posture

**Unchanged by this slice, and re-verified.** `public.tasks`: `authenticated` holds `SELECT` only. `public.reminders`: `SELECT` + `INSERT`, the Option C exception. `anon` holds nothing on either — asserted live through the publishable key after a privileged positive control on the same table. `service_role` cannot read `product_events` or `task_command_confirmations` — asserted, and a successful read fails the verifier. RLS unchanged, all eight policies present. The `tasks` direct-write allowlist is empty and the `reminders` allowlist holds exactly one entry, both by exact equality in both directions.

## 13. Pre-existing defects, retained

1. **`sql-reachability.test.ts` fails two cases on a Windows checkout** — CRLF against `\n`-anchored literals. Green on Linux (46/46 in every CI run). Its citation was corrected: the green-on-Linux run at `6628b02` is `30497118489`, not `30496790432` (which is at `9c5345c`).
2. **`task-candidate-form.test.tsx` is flaky under CI load** — failed once on this branch and passed on rerun with no code change; also failed at `6628b02` before this branch existed.
3. **`question-answer-form.test.tsx` is flaky under CI load** — found by this audit at `6628b02`; never recorded before.
4. **`e2e/intelligent-capture.spec.ts` is not deterministic online** — issue #21.

None is fixed here: three have no reproduction on demand, and the CRLF repair is unrelated cleanup with its own change. All four are in `docs/TODO.md`.

## 14. Known limitations

1. `product_events` row absence after owner deletion is unobservable with available credentials — proven as a composition (§6).
2. Orphan scans over cascade-protected tables cannot return nonzero; the load-bearing detectors are named (§6).
3. The `authenticated` reminder UPDATE/DELETE denial is cited from three executed sources, not re-measured — re-measuring needs a fixture user in production whose footprint exceeds one row, and whose fixture reminder would move the census buckets the stop-gate reads (ADR-061).
4. Four of seven §10 subject tokens are loose; the row that mattered is tight (§9).
5. `2F-MEASURE-005`'s unsupported-refusal volume is not measurable this phase.
6. `qualifyingCommands` counts preview rounds, not intents.
7. Write-side RLS on `public.tasks` is permanently untestable from a client role.
8. The re-grant rollback remains unrehearsed at the operational layer, by design.
9. The final pre-merge review did not execute (§9).

## 15. Rollback status

**Nothing to roll back and nothing rolled back.** No migration applied, no environment changed, no production write. The phase's own rollback artifact (`scripts/phase-2f-regrant-task-write-grants.sql`) was **not executed** by this slice — it is rehearsed at SQL level in every CI `database` run and has never been executed operationally, which is exactly what the record says.

## 16. Confirmation that Phase 2G was not started

Verified by scoped grep over `docs/ src/ scripts/ supabase/ e2e/ .github/` and by the traceability generator's declaration-anchored attribution guard, which fails the run if a non-`2F-` requirement is ever declared as Phase 2F work.

- No `PHASE_2G*` document exists.
- No `2G-` requirement is declared anywhere. The single `2G-READINESS-001` string in the repository is the **negative-control fixture** inside `phase-2f-traceability.test.ts` that proves the guard fires.
- No Phase 2G plan, ADR, migration, script or product artifact exists.
- Phase 2G is named only as a recommendation in `docs/PHASE_2F_PROPOSAL.md`, with C1 as its named first item.
- **C1 is re-raised, not implemented** — the obligation `PHASE_2F_PROPOSAL.md:218` placed on this closeout, discharged in `SECURITY.md` and the final phase report. Phase 2F added no AI spend path.
- No requirement deferred out of Phase 2F was implemented here.

---

**Slice 2F.6 is accepted. Phase 2F — One Write Path is complete.** `public.tasks` has exactly one validated write path in both the application and the database; `public.reminders` carries one bounded, documented exception; and a fail-closed guard reds the build if either becomes false.
