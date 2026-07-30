# Phase 2F — Slice 2F.6 implementation report

**Convergence and closeout.** Governed by `docs/reports/PHASE_2F_SLICE_06_PRD.md` (Revision 2, definitive). Scope: `2F-OPERATIONS-003`, `004`, `005`, `006`, the whole-phase convergence audit, and the phase's closeout record. Nothing else.

**Base:** `main` at `918ab2323815110785e2646153ea21654a265c87` (CI run `30507154042`, all three jobs `success`). **Branch:** `codex/phase-2f-slice-6`.

**No migration. No deployment. No production write.** Remote parity `202607300063` before and after, verified both times with `npx supabase migration list --linked`. The only SQL added is one read-only pgTAP assertion inside a Phase 2F test file that already existed.

---

## 1. What was delivered

| Requirement | Artifact | State |
|---|---|---|
| `2F-OPERATIONS-003` | `scripts/generate-phase-2f-traceability.mjs` → `docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md`; `npm run docs:phase-2f:traceability` | delivered |
| `2F-OPERATIONS-004` | `scripts/verify-phase-2f-cleanup.mjs`; `npm run test:remote:2f:cleanup`; `supabase/tests/phase_2f_task_write_grants.sql` §8 | delivered |
| `2F-OPERATIONS-005` | `scripts/phase-2f-reminder-census.mjs` corrected and wired as `npm run test:remote:2f:census` | delivered, executed clear |
| `2F-OPERATIONS-006` | `docs/PHASE_2F_PRD.md` (Rev 4.3), `PHASE_2_PLAN.md`, `STATE.md`, `TODO.md`, `CHANGELOG.md`, `DECISIONS.md` (ADR-061…063), `SECURITY.md`, `DATABASE.md` | delivered |
| whole-phase convergence audit | §5 below; `docs/reports/PHASE_2F_REPORT.md` | delivered, three defects filed |

## 2. The traceability generator, and why it is not the fourth of its kind

The four generators before it (`2c`, `2d`, `2e`, `2x`) each parse a PRD inventory, fail closed on inventory drift, and then print a hand-written evidence map. Nothing resolves the artifact names, the ownership or the statuses those maps assert — which is the failure mode `PHASE_2E_SLICE_08_REPORT.md` §4.2 named and Slice 2F.5 then hit three times in one slice.

This one derives what it can and resolves what it declares. Eleven checks, each reading the thing it is about:

1. **Inventory** parsed from PRD §6 by a stated declaration-anchored rule; a `2F-` ID appearing elsewhere in §6 is a *reference* and must resolve to a declared requirement or to a recorded cross-phase reference.
2. **Ownership** derived from §7 as **two relations** — `owns` (at most one slice) and `owed` (many). The "Owns" column covers **61** of 68; seven requirements (`2F-ANALYTICS-001…003`, `2F-OWNERSHIP-001…002`, `2F-OPERATIONS-001/002`) are cross-cutting-only **by §7's design** and the matrix labels them so rather than inventing an owner.
3. **Every artifact and acceptance path resolved on disk.**
4. **Every `npm run` gate resolved in `package.json`.**
5. **Migrations** read out of `supabase/migrations/`: exactly two `phase_2f` files, each attributed.
6. **ADR coverage** read out of `docs/DECISIONS.md`, in both directions.
7. **Per-slice acceptance artifacts** read out of `docs/reports/`, requiring *at least one* acceptance-bearing artifact rather than a particular filename.
8. **CI gates resolved two ways** — job-level to a workflow job *and step*; suite-level to a file inside a path the workflow actually executes.
9. **§10's gate ledger** cross-checked, so `2F-PRECOND-003` has a mechanical partner.
10. **Cross-document status contradiction**, including intra-document.
11. **Phase-2G attribution guard**, keyed on *declaration* rather than appearance.

`src/lib/closeout/phase-2f-traceability.test.ts` proves each in both directions: one fixture root per drift class, plus positive controls, because a guard proven only in the failing direction may be refusing everything. The fixture root is built from the generator's **own declarations**, so a newly declared artifact gets a placeholder automatically instead of silently weakening the fixture.

**Two of those checks exist because the design review proved the draft's versions could not run against merged content.** A single-relation ownership rule fires seven false failures; a Phase-2G guard keyed on appearance reds the build on `docs/PHASE_2F_PRD.md:88` and `:184`, two owner-authorized sentences that carry the ADR-053/ADR-057 and 2E-MATCH-018 chains. Both are recorded as blocking findings B1 and B2 in the definitive PRD §26.

## 3. The cleanup verifier, and what it refuses to claim

Verification only, write-free: no deletion, no fixture, no user. A CI case asserts its source contains no `insert`, `update`, `delete`, `upsert` or `rpc` call, and that it reaches PostgREST only by a GET.

**The honest ranking is the deliverable.** Every table it scans carries `user_id … references auth.users(id) on delete cascade`, so an orphan row is **structurally impossible** and a zero orphan count is not a measurement — the Phase 2E verifier already made that argument to *exclude* a table from its scan. So:

- the orphan scan is kept for the one regression it *can* detect — a dropped or `NOT VALID` key — and §8 of `phase_2f_task_write_grants.sql` now asserts all nineteen cascades in CI, so the impossibility is guarded rather than asserted in prose;
- the **load-bearing detectors** are named: zero surviving fixture-prefix users in `auth.users`, zero fixture objects in the `user-files` bucket, and per-table read reachability;
- the **storage scan** the Phase 2E verifier had — and the Slice 2F.6 draft had dropped — is back, with `remoteSmokeObjects > 0` in the exit condition. Storage is the one residue class no foreign key removes (`SECURITY.md` records it as a real category for this project);
- eight tables are **deliberately not scanned**, each with its reason and cascade anchor written down, following the house pattern's habit rather than leaving silence that reads as oversight;
- both posture-protected tables must **refuse** a `service_role` read, and a *successful* read fails the run — a widened grant, not a convenience;
- `product_events` row absence after an owner's deletion is stated as **unreadable with any credential this repository holds**, proven instead as a composition (asserted refusal + zero surviving fixture owners + the CI-asserted cascade). No stronger claim is made.

**Fixture prefixes are read off the minting scripts, not guessed.** `phase-2f5-funnel-`, `phase-2f5-baseline-`, `codex-2f3-` and **`phase2f-gate3-`** — which has no hyphen after `phase2f` and which a naive `phase-2f-` prefix would have missed entirely. A test derives that prefix from `scripts/phase-2f-gate3-exact-title-reuse.mjs` rather than restating it.

**Deferrals are proven to have held** through PostgREST's OpenAPI definition — a GET reaching no function: `create_reminder` absent, `create_task_command_v2` absent, and `ai_usage_events` carrying no provenance column, checked as a pattern over the **live column set** rather than against a guessed name, because no provenance column name was ever declared (`DECISIONS.md:585`, `:636`). ADR-057's reopening gate is intact: script present, no transcript.

## 4. The census, corrected before it could be trusted as a stop-gate

`2F-OPERATIONS-005` makes buckets 1 and 2 blocking. Inspection found the census paged with `.range()` and **no `order`**, over both `reminders` and `tasks`. `taskById` is what those two buckets join against, and a skipped task page turns a real bucket-1 row into `TERMINAL_TASK_STATUSES.has(undefined)` — false — so the stop-gate failed **open**. Slice 2F.5 had already fixed the same defect class in the funnel reader by moving to keyset paging.

Corrections, all extraction-only so `2F-PRECOND-001`'s preservation obligation holds while serving its actual purpose:

- a total order on the primary key, with **exhaustion asserted** rather than assumed;
- the nine bucket predicates extracted as exported pure functions in the same file, with the client construction, the docstring's read-only guarantee and every `select` list byte-identical;
- CI cases for every bucket in **both** directions, including the one that matters most — a task that cannot be resolved lands in bucket 4 rather than being silently dropped out of bucket 1;
- a case asserting the file still issues no write, so the read-only guarantee is mechanical;
- the **read-atomicity limitation printed by the census itself**: two independent reads joined in memory are not a snapshot, both `run_user_heartbeat` and `apply_task_command` move rows on this exact pair, so a nonzero blocking bucket requires a **second confirming run** before it escalates.

**Executed 2026-07-30T02:39:48Z against `ulvwzqlpsjyrnqzfxmck` at parity `202607300063`:**

| Bucket | Count | |
|---|---|---|
| 1. live reminder on a terminal task | **0** | blocking — clear |
| 2. live task-bound reminder on a non-terminal task with null `due_at` | **0** | blocking — clear |
| 3. reminder owner ≠ task owner | 0 | structurally impossible, measured anyway |
| 4. `task_id` references a nonexistent task | 0 | structurally impossible, measured anyway |
| 5. snoozed rows | 0 | `2F-REMINDER-004`'s dormant literal, unreached |
| 6. independent reminders | 0 | |
| 7. live independent reminders | **0** | informational — never blocks |
| 8. total reminders | 1 | status `sent` |
| 9. total live reminders | 0 | |

**Stop-gate clear.** Bucket 6/7 being zero also keeps `SECURITY.md`'s Option C justification true rather than merely historical, which is why the figures and their date are now recorded there.

## 5. The whole-phase convergence audit

A1–A15 of the definitive PRD §14. Verified by execution, not by reading:

| # | Property | Result |
|---|---|---|
| A1 | one validated write path for `public.tasks` in application and database | **holds** — `authenticated` has `SELECT` only; every surviving writer is a definer RPC, a trigger inside one, a privileged worker, or a migration |
| A2 | exactly one documented reminder exception; allowlists exact both ways | **holds** — `TASKS_ALLOWLIST` is `[]`, `REMINDERS_ALLOWLIST` has one entry, both compared with `toEqual` |
| A3 | one payload builder, one resolution mechanism | **holds** — a single `buildApplyPayload` definition serves the apply and confirmation paths and `work-command.ts`; a single `loadTaskCandidates` definition serves all four callers |
| A4 | no hidden second write path anywhere | **holds** — every `tasks`/`reminders` write outside `src/` is a `service_role` fixture client or the Option C exception; `local-task-command-creation-race.mjs` and the two e2e specs read only |
| A5 | ADR-055 expiry `2026-10-27` from go-live `2026-07-29` | **holds** — `expiryDateFromGoLive('2026-07-29')` executed and returns it; a CI case recomputes it |
| A6 | planning tier cannot self-authorize | **holds** — ceiling is `met_pending_privileged_read` |
| A7 | unsupported refusal volume labelled not measurable, derived from emitters | **holds** — `command-funnel.test.ts:883-915` reads `actions.ts` and derives the unreachable set |
| A8 | preview rounds not misrepresented as intents | **holds** — the counting unit is `qualifying_preview_round` |
| A9 | the two baselines stay scope-separated | **holds** — the prohibition travels with every quotation |
| A10 | every completed claim evidenced; partials still partial; deferrals still deferred | **holds after three corrections** — see the defects below |
| A11 | rollback documented accurately, execution state stated | **holds** — rehearsed at SQL level in every CI `database` run; never executed operationally |
| A12 | parity verified before and after | **holds** — `202607300063` both times |
| A13 | Phase 2G not started | **holds** — named only as a recommendation in `PHASE_2F_PROPOSAL.md`; no PRD, plan, ADR, requirement ID or artifact, by scoped grep over `docs/ src/ scripts/ supabase/ e2e/ .github/` |
| A14 | §10 gate-ledger cell-to-session sweep | **three defects filed** — below |
| A15 | every claim in this report traceable to a command executed this session | **holds** |

### The three defects A14 filed

1. **§10's `database` cell for 2F.5 said `—`.** The slice added three read-only pgTAP assertions to `product_events.sql` (`plan(23)` → `plan(26)`, verified) that run in that job, and its acceptance §4 records the job reporting the file `ok`. The cell understated the slice. → PRD Revision 4.3-a.
2. **§10's parity row's stated rule contradicted its own cells.** Labelled "every *deploying* slice" while already marking **2F.2**, which carried no migration. The operative rule is "every slice with a deployed-project session", under which 2F.5 — which verified parity before and after — earns the cell it was denied. → Revision 4.3-b.
3. **§10's 2F.4 authenticated-journeys cell claimed `● regression` for a gate that never ran.** `PHASE_2F_SLICE_04_ACCEPTANCE.md` §11 enumerates all sixteen acceptance gates and not one is a Playwright journey; the file's only browser mention is the CI job name. §10's own footnote and `2F-PRECOND-003` both forbid this. **Corrected rather than back-filled** — ADR-063 records why: executing journeys now would make the cell true *at closeout* rather than in the session it claims, and the ledger's value is that it records when a gate ran. What 2F.4 executed instead is stronger for its subject (14/14 production-flow checks through PostgREST with a real end-user token, plus the full remote suite), and Slice 2F.6 executes its own journeys cell so the phase has an executed end-state proof. → Revision 4.3-c.

### Two further defects the audit found while verifying a citation

4. **A misattributed CI run id.** `STATE.md:31` and `TODO.md:31` cited run `30496790432` as the green-on-Linux proof for the CRLF failures at `6628b02`. That run is at **`9c5345c`**. The run at `6628b02` is **`30497118489`**, and its log does show `sql-reachability.test.ts … 46 tests` passing — so the substance of the claim holds and only the citation was wrong. Corrected in both documents.
5. **A third flaky component test, never recorded.** Run `30497118489`'s `application` job concluded `failure`: `src/features/agent/question-answer-form.test.tsx` → *"runs the undo flow and returns the question to an editable state"* failed at `:162` on `expect(element).toHaveTextContent()`, with 129 of 130 files passing. It passes locally and passed on both subsequent `main` runs. Recorded in `TODO.md` beside the `task-candidate-form.test.tsx` flake; **not fixed**, because it has never reproduced on demand.

### One intra-document contradiction

**`STATE.md`'s Slice 2F.4 section carried a pre-deployment paragraph beside its own deployment record** — "the migration is not applied, the full remote suite has not run in-session, and the live schema-cache observation has not been made" — all three false since 2026-07-29. Corrected with the correction labelled, and the contradiction is now a fail-closed check in the generator rather than something a reader has to notice.

## 6. Documentation reconciliation (`2F-OPERATIONS-006`)

| Document | Change |
|---|---|
| `docs/PHASE_2F_PRD.md` | Revision 4.3: three §10 cells corrected, each with its evidence; §14 entry |
| `docs/PHASE_2_PLAN.md` | Phase 2F recorded complete with its delivered scope; pointer `Revision 4` → `Revision 4.2`/`4.3` |
| `docs/STATE.md` | Slice 2F.6 section; Phase 2F complete; run-id citation corrected; the pre-deployment leftover corrected; `## Phase history` and `## Status summary` given a supersession preamble and the "Current phase: Phase 2E" line re-labelled as a checkpoint |
| `docs/TODO.md` | header and active-milestone line rewritten; Phase 2F box checked; `Revision 4` → `4.2`/`4.3`; run-id corrected; the new flake added; the three open items left open |
| `docs/CHANGELOG.md` | Slice 2F.6 entry |
| `docs/DECISIONS.md` | ADR-061 (the closeout writes nothing), ADR-062 (a closeout generator resolves what it declares), ADR-063 (an unexecuted gate cell is corrected, never back-filled); ADR-060's superseded Context discharged append-only |
| `docs/SECURITY.md` | closeout section with the live-verification table and the three cited posture sources; parity line corrected `202607180031` → chain head; Option C justification given the closeout census figures and date |
| `docs/DATABASE.md` | closeout section; `product_events` count `19` → **26** with the three-step provenance |
| `docs/reports/PHASE_2F_REPORT.md` | new — the final phase report |
| `docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md` | new — generated |

Point-in-time records were **re-labelled, never deleted**. Accepted slice reports are untouched.

## 7. Executed gates

Every row is a command run in this session, with its actual result.

### Local

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **clean** |
| Types | `npm run typecheck` | **clean** |
| Unit + component | `npm test` | **2511 / 2513** — 135 files, 134 passed. The two failures are the pre-existing Windows CRLF cases in `sql-reachability.test.ts`, retained and named (§8). Baseline before this slice was 2423 / 2425 over 131 files, so the slice added exactly the 88 closeout cases in 4 files and broke nothing |
| Closeout suites alone | `npx vitest run src/lib/closeout/` | **88 / 88** |
| Build | `npm run build` | **compiled successfully** |
| Worker types | `deno check` on both deployed entrypoints | **clean** (deno 2.9.4) |
| Worker tests | `deno test` over `supabase/functions/**` | **46 / 46**, no network permissions |
| Traceability | `npm run docs:phase-2f:traceability` | **68 requirements, 12 families, 68 delivered, 0 not delivered, 10 with a recorded note, 7 cross-cutting-only, 2 migrations, 41 §10 gate cells** |

### Remote, executed in the order §15 X5 prescribes so no fixture can contaminate the stop-gate

| # | Gate | Result |
|---|---|---|
| 1 | `npm run test:remote:2f:census` (before any fixture-minting run) | **stop-gate clear** — buckets 1 and 2 zero; 2026-07-30T02:39:48Z / 03:32:19Z |
| 2 | `npm run test:remote:2f:cleanup` | **CLEAN — zero residue**, exit 0 |
| 3 | `npm run test:remote:2f:funnel` | **32 / 32**, exit 0, every fixture owner proven deleted |
| 4 | `npm run test:remote:2f:baseline` | **9 / 9**, exit 0 |
| 5 | `npm run test:remote` (full remote suite) | **exit 0** — auth, atomic settings, RLS, ownership, heartbeat, AI ledger, aggregation, deployed file worker |
| 6 | Authenticated journeys, desktop + mobile × pt-BR + en | **36 / 36 passed** (2.2 min) — `e2e/work-actions.spec.ts` and `e2e/manual-task-creation.spec.ts` through `scripts/online-playwright.mjs` against a freshly-served production build |
| 7 | `npm run test:remote:2f:census` (after 3–6 minted fixtures) | **still clear** — buckets 1 and 2 zero |
| 8 | `npm run test:remote:2f:cleanup` (after every run above) | **still CLEAN — zero residue**, 0 fixture-prefix survivors, 0 fixture storage objects |
| 9 | Parity | `npx supabase migration list --linked` → **`202607300063`** before and after, no drift |

**On the journeys (§10's 2F.6 cell).** Port 3000 was held by a Next.js server this session did not start, so reusing it — the local default — would have reported a Slice 2F.6 result while exercising unknown code. Slice 2F.2's acceptance hit the same hazard; the same resolution was used: a temporary Playwright config on port 3140 with `reuseExistingServer: false`, serving `npm run start`. The config was **deleted** afterwards and the working tree verified clean; the stale process was left untouched. These 36 also serve as the executed end-state regression proof that ADR-063's §10 correction leaves owing.

### Self-verification performed after the review agents were interrupted

Both independent implementation reviewers terminated mid-run on a platform session limit — an outage, not a repository blocker (§19 of the closeout charter names this case explicitly). The highest-risk checks they had queued were performed directly, and two produced real corrections:

1. **The new pgTAP section 8 would have red CI if any of the nineteen tables lacked the exact foreign-key shape.** All nineteen were verified against the migration chain to carry `user_id uuid not null references auth.users(id) on delete cascade`; two initially appeared to differ and did not — `task_dependencies` declares it on a shared line (`202607160009:42`) and `task_command_confirmations` uses `create table if not exists` (`202607260059:213`). The assertion count was verified at 28 against `plan(28)`. The assertion was additionally reformulated to report **which** table failed rather than only that one did, because a count tells a CI reader nothing actionable.
2. **Four drift tests used regex alternations a collateral failure could satisfy.** The generator accumulates every finding into one thrown message, so `toThrow(/A|B/)` can pass on B while A — the check under test — never fired. All four now assert the specific message of the check under test, and all 88 cases still pass, which is what proves each check actually fires.
3. The verifier's write-freedom was confirmed by reading every route, not only by the source-grep case: the sole `auth.admin` call is `listUsers`, and there is no `deleteUser`, `createUser`, storage `upload`/`remove`, or POST anywhere in the file.
4. The census refactor's "byte-identical selects" claim was checked by diffing string literals against `918ab23`'s version: the only added literal is `"id"`, from the new `.order("id", …)`. One predicate widening (`bound()` also excluding `undefined`) is recorded in the census docstring rather than folded into the identity claim — against PostgREST it is a no-op, and it exists for the injected rows the CI cases feed.

The reviewers are re-run once execution is available; their findings and adjudication are recorded in the acceptance report.

## 8. Deliberately not done

- **No production write.** `--posture` was designed, reviewed and deleted (ADR-061).
- **The Windows CRLF defect is not fixed.** It blocks no mandatory gate: CI checks out LF and `sql-reachability.test.ts` passes 46/46 there. Retained in `TODO.md` as unrelated cleanup, with its citation corrected.
- **Neither component-test flake is fixed.** Neither reproduces on demand, and a fix without a reproduction is a guess.
- **No deferred capability implemented.** A mention in a Phase 2F report is a record, not an authorization.
- **C1 re-raised, not implemented** — the obligation `PHASE_2F_PROPOSAL.md:218` placed on this closeout is a sentence in a report, and Phase 2F added no AI spend path.

## 9. Executed evidence

Filled from this session's commands; the post-merge half is in `PHASE_2F_SLICE_06_ACCEPTANCE.md`, because merge SHA, merge date and post-merge results are not facts while the implementation PR is open.
