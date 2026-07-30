# Phase 2F — Slice 2F.6 PRD: Convergence and Closeout

**Revision 2 (definitive, 2026-07-29). Status: approved as the implementation contract for Slice 2F.6.**

Revision 1 was the initial draft. It was put through an independent adversarial design review that inspected the repository on its own and returned **20 findings — 3 BLOCKING, 4 MAJOR, 9 MODERATE, 5 MINOR** — of which **19 were confirmed and folded in and 1 was confirmed in substance but rejected in its framing**. The per-finding adjudication is §26. Two of the three blocking findings proved that Revision 1 specified checks that **could not run against the merged repository**; the third proved that the draft's only production write was unrequested scope that would have contaminated the phase's own stop-gate. Revision 1's `--posture` mode is **deleted**.

Governing phase document: `docs/PHASE_2F_PRD.md` **Revision 4.3** (68 requirements, 12 families, slices 2F.1–2F.6). This slice's own convergence sweep produced 4.3 from 4.2 — three §10 gate-ledger corrections, no requirement changed (§26 M1, M2). This slice owns epic **2F-F**: `2F-OPERATIONS-003`…`006`, the whole-phase convergence audit, and the phase's closeout record.

Where this document and the phase PRD disagree, the phase PRD governs. Where either and executed repository evidence disagree, **the evidence governs and the document is defective** — the standing rule of this phase (`docs/PHASE_2F_PRD.md` §5).

---

## 1. Problem statement

Phase 2F has delivered five of six slices. `public.tasks` has exactly one validated write path in both the application and the database; `public.reminders` carries one documented Option C authoring exception; the measurement instruments exist and the semantic-retrieval evidence gate is computable with a dated expiry. What does not exist is **executed evidence that the phase is internally consistent** — and the phase's own standard is that an unexecuted verifier is a claim, not a check.

Six concrete gaps remain, each named by a merged requirement or found by inspection this session:

1. **No traceability artifact.** `scripts/generate-phase-2f-traceability.mjs` does not exist (`PHASE_2F_SLICE_05_ACCEPTANCE.md` §14). Phases 2X, 2C, 2D and 2E each shipped a fail-closed generator and matrix; Phase 2F has neither.
2. **No phase-wide cleanup verifier.** `scripts/verify-phase-2f-cleanup.mjs` does not exist. Each slice proved its *own* fixtures gone; nothing verified the union. `2F-MEASURE-002`'s owned residual — orphan non-synthetic events from a run that died before its cleanup — is pointed at this verifier by ADR-058 and by the phase PRD.
3. **The census stop-gate had not executed at closeout**, and inspection found it pages with an unordered `OFFSET` (§26 Mo1) — the exact defect Slice 2F.5 already fixed once in its own reader.
4. **`docs/PHASE_2F_PRD.md` §10 carries two inaccurate cells, in opposite directions**: 2F.5's `database` cell says `—` while 2F.5 added three pgTAP assertions that run in that job (`product_events.sql` `plan(23)`→`plan(26)`, verified this session), and 2F.4's authenticated-journeys cell says `● regression` while 2F.4's acceptance records no Playwright journey among its sixteen gates (§26 M1). §10's own rule is "a cell counts only when executed".
5. **Documentation drift beyond §10.** `docs/TODO.md`'s header, active-milestone line and Phase-2F revision pointer; `docs/PHASE_2_PLAN.md`'s Revision-4 pointer; `docs/STATE.md`'s "Current phase: Phase 2E" line inside its history section and a leftover pre-deployment paragraph; `docs/SECURITY.md`'s `202607180031` parity line; `docs/DATABASE.md`'s "19 events" (the true post-`202607280061` count is **26**, verified this session).
6. **A misattributed CI citation and an unrecorded flake.** `STATE.md:31` and `TODO.md:31` cite run `30496790432` as the green-on-Linux proof at `6628b02`; that run is at `9c5345c`. The run at `6628b02` is `30497118489`, whose `application` job **failed** — on `src/features/agent/question-answer-form.test.tsx`, a third flaky component test the repository has never recorded. `sql-reachability.test.ts` did pass there (46/46), so the substance of the CRLF claim holds and only the citation is wrong.

## 2. Current Phase 2F state (established by execution, 2026-07-29 / 2026-07-30 UTC)

| Fact | Value | How established |
|---|---|---|
| `main` HEAD at slice start | `918ab2323815110785e2646153ea21654a265c87` | `git rev-parse HEAD` |
| CI on that HEAD | run `30507154042`, **success** (all three jobs) | `gh run list --branch main` |
| Working tree at slice start | clean | `git status --short` (empty) |
| Local ↔ remote migration parity | **`202607300063`**, no drift | `npx supabase migration list --linked` |
| Deployed project | `ulvwzqlpsjyrnqzfxmck` | census output |
| Phase 2F migrations | exactly two — `202607290062` (2F.3), `202607300063` (2F.4) | `supabase/migrations/` listing |
| PRD requirement inventory | **68** IDs, **12** families, zero duplicates, zero referenced-but-undeclared `2F-` IDs | declaration-anchored parse (§6.1 F2) |
| §7 ownership closure | 61 owned + 7 cross-cutting-only = **68**; zero uncovered, zero over-claimed | executed prototype of the §6.1 F3 derivation |
| Cross-cutting-only requirements | `2F-ANALYTICS-001…003`, `2F-OWNERSHIP-001…002`, `2F-OPERATIONS-001…002` | same derivation |
| `tasks` direct-write allowlist | **empty**, exact equality both ways | `src/lib/supabase/direct-write-guard.test.ts:49,111` |
| `reminders` direct-write allowlist | exactly one entry (`createReminder`) | `direct-write-guard.test.ts:51,116` |
| Census (executed 2026-07-30T02:39:48Z) | buckets 1 and 2 **zero**; bucket 7 **zero**; 1 reminder total, status `sent`; 4 tasks | `node scripts/phase-2f-reminder-census.mjs` |
| Lint / typecheck | clean / clean | `npm run lint`, `npm run typecheck` |
| Local unit suite | **2423 / 2425**; two pre-existing Windows-only CRLF failures | `npm test` |
| ADR-055 expiry | **`2026-10-27`** from go-live `2026-07-29` | `expiryDateFromGoLive('2026-07-29')` executed |
| `product_events` allowlist size | **26** event names | parsed from `202607280061`'s CHECK |
| Phase 2G | **not started** — named only as a recommendation in `PHASE_2F_PROPOSAL.md`; no PRD, plan, ADR, requirement ID or artifact | scoped grep over `docs/ src/ scripts/ supabase/ e2e/ .github/` |
| Slice 2F.6 artifacts | **none existed at slice start** | `ls scripts/` |

## 3. Authoritative evidence

| # | Source | What it authorizes |
|---|---|---|
| E1 | `docs/PHASE_2F_PRD.md` Rev 4.2 §6.12, §7, §8, §9, §10, §11, §12 | the four owned requirements, the epic mapping, 2F.6's acceptance criteria, the gate matrix, the rollback and permissions posture |
| E2 | `docs/reports/PHASE_2F_SLICE_05_ACCEPTANCE.md` §13, §14 | the written handover of deferred items and the proof no 2F.6 artifact existed |
| E3 | `docs/reports/PHASE_2F_SLICE_05_PRD.md` §22 | the cleanup-verifier scope handover: **"the verifier's scope must include this slice's `product_events` fixtures for fixture owners of the `--proof` run"** |
| E4 | `docs/reports/PHASE_2F_SLICE_04_ACCEPTANCE.md` §3, §4, §10, §11, §13 | the executed live privilege matrix, the stale/fresh-session denials, the zero-residue table list, the sixteen gates, the four remaining risks |
| E5 | `docs/reports/PHASE_2F_SLICE_02_ACCEPTANCE.md` §4, `…_03_ACCEPTANCE.md` gate 6 | the two §10 journey cells that *were* executed (32/32 and 4/4) |
| E6 | ADR-054 … ADR-060 (`docs/DECISIONS.md:592-669`) | every Phase 2F decision, including the three deferrals |
| E7 | `supabase/migrations/202607290062`, `202607300063` | the phase's whole schema delta, including `202607300063`'s nine fail-closed post-deploy assertion groups executed against the deployed catalog |
| E8 | `supabase/tests/phase_2f_task_write_grants.sql`, `phase_2f_effective_limit.sql`, `supabase/regrant-rehearsal/phase_2f_regrant_restores_writes.sql` | the phase's own database proofs |
| E9 | `.github/workflows/ci.yml` | the three jobs, the steps each runs, and the re-grant rehearsal's three posture boundaries |
| E10 | `scripts/verify-phase-2e-cleanup.mjs`, `scripts/generate-phase-2e-traceability.mjs` | the house pattern to follow — including its storage scan and its written-down exclusions, both of which Revision 1 dropped |
| E11 | `scripts/phase-2f-reminder-census.mjs` | the census as written, including its read-only guarantee and its unordered-paging defect |
| E12 | `docs/SECURITY.md` §"Phase 2F — Slice 2F.3/2F.4", `docs/DATABASE.md` §"Phase 2F — Slice 2F.3/2F.4" | the recorded final security and database posture |
| E13 | `PHASE_2F_PROPOSAL.md:218` | the accepted-lineage commitment that **Phase 2F's closeout explicitly re-raises C1** (rate limiting / spend caps) rather than letting it age silently |

## 4. Goals

1. **G1** — Ship a traceability generator that *derives* Phase 2F traceability from repository sources, resolves every artifact it names on disk, and fails closed on drift, over all 68 requirements.
2. **G2** — Ship a phase-wide cleanup verifier that proves zero Phase 2F fixture residue against the deployed project, fails closed, scans storage, and states exactly what each check can and cannot prove.
3. **G3** — Correct and mechanically protect the census, execute it, and record the stop-gate result with its exact provenance.
4. **G4** — Complete the whole-phase convergence audit, including a cell-by-cell `2F-PRECOND-003` sweep of §10, filing defects rather than smoothing them.
5. **G5** — Reconcile every permanent document to final repository truth, preserving the distinction between decision, amendment, correction, pre-existing defect, deferral, partial and conclusion.
6. **G6** — Close Phase 2F with an acceptance report and a final phase report whose every claim is backed by an executed gate, and which re-raises C1 per E13.

## 5. Non-goals

A change touching any of these is a scope violation:

1. Phase 2G, or any post-Phase-2F product work. (Re-*raising* C1 in the closeout record is E13's explicit obligation and is not Phase 2G work; **implementing** C1 is.)
2. Semantic-retrieval implementation of any kind — no embedding pipeline, no job type, no backfill, no `source_type` widening, no index (ADR-055 forbids all five even at the spike tier).
3. The offline replay spike (the spike tier is not met — the real owner's funnel is empty).
4. AI provenance / `2E-COMMAND-012` (ADR-057).
5. Any UI, route, i18n key, product module, component or Server Action change.
6. A funnel dashboard or any measurement surface.
7. Product-event allowlist widening; reason-level refusal granularity; an emitter for the three unreachable preview categories.
8. `product_events` retention/purge.
9. A privileged distinct-user measurement reader (`2F-MEASURE-004` places that read at *evaluation* time).
10. Retiring the dormant `snoozed` reminder status (`2F-REMINDER-004` defers it explicitly).
11. Any new migration, RPC, view, grant, policy, index or trigger. **Bounded exception (§26 Mo8):** read-only pgTAP assertions may be added **to an existing Phase 2F-owned test file only**, never a new file, and only where the convergence audit names the finding that motivates them; each must be listed in the acceptance report beside that finding.
12. Widening reminder permissions, or reopening the Option C decision.
13. Any production write. This slice writes nothing to any environment. (Revision 1's `--posture` mode is deleted — §26 B3.)
14. Unrelated cleanup — including the Windows CRLF defect and the two component-test flakes, unless §11 proves one blocks a mandatory gate.

## 6. Functional requirements

### 6.1 The traceability generator (`2F-OPERATIONS-003`)

- **F1** — `scripts/generate-phase-2f-traceability.mjs` writes `docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md`, wired as `npm run docs:phase-2f:traceability`, matching the four existing generators' naming.
- **F2** — The requirement inventory is **parsed** from `docs/PHASE_2F_PRD.md` §6 by a stated rule: a requirement is a line matching `^- \*\*(2F-[A-Z0-9]+-\d{3})(?:[^:]*)?:\*\*`, and mere *references* to an ID inside a requirement body are not declarations. The generator throws if the count is not 68, if per-family counts drift, if an ID is duplicated, if a family has no evidence mapping, **or if a referenced `2F-` ID in §6 does not resolve to a declared one** (which catches a typo'd cross-reference).
- **F3** — Ownership is **derived** from the phase PRD §7 table as **two distinct relations**: `owns` from the "Owns" cell (at most one slice per requirement; two is a failure) and `owed` from "Cross-cutting owed" (many permitted). Every requirement must appear in **at least one**. A family present only in `owed` is statused from the union of its owed slices' acceptance artifacts, and the matrix says so rather than inventing an owner. `2F-ANALYTICS-001…003`, `2F-OWNERSHIP-001…002` and `2F-OPERATIONS-001/002` are cross-cutting-only **by §7's design** (§2). *(Revision 1's single-relation rule fired seven false failures — §26 B1.)*
- **F4** — Every evidence entry names **repository paths**, and the generator resolves each on disk. A named artifact that does not exist fails the run. Resolution extends to **npm script names** (§26 m3): a gate cited as `npm run X` must exist in `package.json`.
- **F5** — Migration attribution is derived from `supabase/migrations/`: exactly two `phase_2f` migrations must exist, and each must carry the slice the phase PRD assigns it. A third fails the run; a mis-attribution fails the run.
- **F6** — ADR ownership is derived by scanning `docs/DECISIONS.md` for ADR headings and requirement-ID citations. Every `2F-DECISION-*` requirement must be satisfied by at least one ADR naming it; an ADR claiming a `2F-` ID the PRD does not declare fails the run.
- **F7** — Acceptance coverage is derived from `docs/reports/`. Each slice must have **at least one acceptance-bearing artifact** from the declared set `{PHASE_2F_SLICE_NN_ACCEPTANCE.md, PHASE_2F_SLICE_NN_REPORT.md}`, and the per-slice artifact inventory is reported as fact. *(Revision 1's "must have an ACCEPTANCE artifact" rule would have failed on Slice 2F.1, which has only a REPORT; Slice 2F.3 conversely has no REPORT — §26 B1's sibling, verified this session.)*
- **F8** — CI-gate cells are derived from `.github/workflows/ci.yml` by **two distinct mechanisms** (§26 Mo5):
  - **job-level** gates resolve to a workflow job **and a named step**;
  - **suite-level** gates resolve to a test or pgTAP file on disk **and** prove that file sits inside a path the workflow actually executes — `src/**` per `vitest.config.ts`'s `include` and *not* its `exclude`, `supabase/tests` for `supabase test db --local supabase/tests`, `supabase/regrant-rehearsal` for the rehearsal step.
  The second leg makes the ADR-059 hazard mechanical: a suite silently swept out of `vitest.config.ts` fails F8.
- **F9** — Deferred and partial statuses are declared with a **destination**. A deferred or partial requirement with no destination fails the run; a status override naming an ID the PRD does not declare fails the run.
- **F10** — **Phase-2G attribution guard**, restated as two declaration-anchored checks (§26 B2): (a) no non-`2F-` ID is *declared* as a requirement in §6; (b) no status override, ownership cell or matrix row names a non-`2F-` ID. Mere references to `2E-COMMAND-012` and `2E-MATCH-018` in §6 are **legitimate and must pass** — they carry the ADR-053/ADR-057 and 2E-MATCH-018 traceability chain. Proven in both directions by fixtures: a PRD *referencing* a `2E-` ID passes; a PRD *declaring* a `2G-` ID fails.
- **F11** — **§10 gate-ledger cross-check** (§26 M2): the generator parses `docs/PHASE_2F_PRD.md` §10 and fails when a `●` cell's owning slice has no acceptance-bearing artifact, and reports every `●` cell with the artifact that must name its session, so `2F-PRECOND-003` has a mechanical partner rather than only a manual sweep.
- **F12** — Detection is proven by tests that run the generator against **fixture roots** carrying deliberate drift, one per failure mode, plus **positive controls** proving each guard passes on correct content. A test that only feeds the generator the real repository proves nothing about detection.

### 6.2 The cleanup verifier (`2F-OPERATIONS-004`)

- **F13** — `scripts/verify-phase-2f-cleanup.mjs`, wired as `npm run test:remote:2f:cleanup`. **Verification only, and write-free**: it deletes nothing and creates nothing. `2F-OPERATIONS-004`'s words are "proves zero fixture residue"; turning that into a sweep, or into a fixture-minting posture prober, would be a silent scope change.
- **F14** — **Scanned tables**, the union of the 2E verifier's list, the 2F.3/2F.4 residue tables and the 2F.5 handover: `entries`, `entry_interpretations`, `jobs`, `attachments`, `pending_questions`, `tasks`, `projects`, `contexts`, `people`, `task_projects`, `task_contexts`, `task_people`, `task_dependencies`, `entry_task_candidate_resolutions`, `reminders`, `undo_operations`, `ai_usage_events` — plus the two posture-protected tables `task_command_confirmations` and `product_events`.
- **F15** — **Deliberately not scanned, each with its reason and cascade anchor written down** (§26 m2, Mo9), following the house pattern's habit rather than leaving silence that reads as oversight: `audit_logs` (`202607160003:130`), `notifications` (`202607160007:52`), `heartbeat_runs` (`:68`), `memories` / `entry_embeddings` / `conversations` (`202607160006:5,28,42`), `profiles` / `agent_preferences` (`202607160001:8,18`). All cascade from `auth.users`; all are append-only, worker-owned or identity rows no Phase 2F proof owns independently.
- **F16** — **Fixture prefixes**, read off the scripts that mint them rather than guessed: `phase-2f5-funnel-` (`phase-2f-command-funnel-reader.mjs:457`), `phase-2f5-baseline-` (`end-to-end-match-baseline.remote.test.ts:232`), `codex-2f3-` (`phase-2f3-creation-probe.mjs:73`), **`phase2f-gate3-`** (`phase-2f-gate3-exact-title-reuse.mjs:73` — note the missing hyphen, which a naive `phase-2f-` prefix would miss), plus every inherited prefix from the 2E verifier so a stray fixture from an adjacent smoke is still caught.
- **F17** — **Storage scan** (§26 M4): the recursive `user-files` scan the house verifier has is ported, `storageObjects` and `remoteSmokeObjects` are reported as named categories, and `remoteSmokeObjects > 0` is part of the nonzero-exit condition. Storage objects are the one residue class no foreign key removes.
- **F18** — `product_events` is handled per the Slice 2F.5 handover **exactly**: direct row absence after owner deletion is **not readable with any credential this repository holds** (`revoke all … from service_role` is real and asserted). The verifier asserts (a) that `service_role` is refused — a *successful* read means a grant was widened and **fails** the run — and (b) that no fixture owner survives in `auth.users`, which by `on delete cascade` (`202607170024:10`) is what removes the rows. It states that composition rather than claiming an observation.
- **F19** — Same treatment for `task_command_confirmations` (`202607260059:258-261`).
- **F20** — "Not deployed" is distinguished from "deployed and broken": `PGRST205`/`42P01` is reported as absent and the scan continues; anything else fails closed. Every table this phase requires to exist and which is absent is a **failure**, not a note.
- **F21** — **Objects expected not to be deployed**, asserted absent because that is how a deferral is proven to have held: no `create_reminder` RPC and no `_v2` of `create_task_command` (both probed by `POST /rpc/<name>` expecting `PGRST202`, which is answered from the schema cache and writes nothing). The `ai_usage_events` provenance leg is **replaced** (§26 Mo3): no provenance column name has ever been declared, so asserting the absence of a guessed name would pass for the wrong reason. Instead the verifier asserts (a) `record_ai_usage` **rejects an extra provenance argument** — its signature is unchanged at ten — and (b) `scripts/phase-2f-gate1-record-ai-usage-dry-run.sql` exists while **no dry-run transcript exists in `docs/reports/`**, which is ADR-057's own framing of the reopening gate.
- **F22** — **What each check can prove, ranked honestly** (§26 M3). Every scanned table's `user_id` cascades from `auth.users`, so an orphan there is **structurally impossible** and a zero orphan count is not a measurement. The verifier therefore: states per table that an orphan is impossible under the named cascade anchor; declares the load-bearing detectors to be (a) zero surviving fixture-prefix users in `auth.users`, (b) zero fixture storage objects, (c) per-table read reachability; and keeps the orphan scan for the one regression it *can* detect — a dropped or `NOT VALID` foreign key.
- **F23** — That cascade claim is guarded rather than asserted in prose: read-only pgTAP assertions added to the existing `supabase/tests/phase_2f_task_write_grants.sql` prove each scanned table's `user_id` foreign key still declares `on delete cascade`, so dropping one reds CI instead of silently making F18/F22 false. This is §5.11's bounded exception, used once, with M3 as the naming finding.
- **F24** — **Non-vacuity of the predicate.** The orphan predicate is an exported pure function proven by CI tests over injected rows including a known orphan, and the live scan reports the row count it actually read per table, so "zero" can never be indistinguishable from "asked nothing".
- **F25** — Output is deterministic and machine-readable (JSON), plus a concise human summary naming **every** checked category explicitly — including the ones that passed and the ones deliberately not scanned — and a nonzero exit on any residue, any absent required table, any widened grant, or any object that must be absent being present.
- **F26** — No secret is printed, and no error object whose properties may carry a key is re-raised (`scripts/linked-supabase.mjs:60-70`'s lesson).
- **F27** — Teardown and reporting may never be skipped by a bare `process.exit` inside a protected lifecycle.

### 6.3 The reminder census (`2F-OPERATIONS-005`)

- **F28** — **Correction, named rather than left to rediscovery** (§26 Mo1): `fetchAll` pages with `.range()` and **no `order`**, over both `reminders` and `tasks`. `taskById` is what the two **blocking** buckets join against, and a missed task page turns a real bucket-1 row into `TERMINAL_TASK_STATUSES.has(undefined)` — false — so the stop-gate fails **open**. A total order on the primary key `id` is added and exhaustion is asserted, matching the keyset fix Slice 2F.5 made for the same defect class.
- **F29** — **Extraction-only refactor** (§26 Mo8). The bucket predicates move into exported pure functions **in the same file**; the client construction, the docstring's read-only guarantee and every `select` list stay byte-identical; and a CI test asserts the file still contains no `insert`/`update`/`delete`/`upsert`/`rpc` call. This serves `2F-PRECOND-001`'s purpose — the preserved artifacts must not silently rot — rather than conflicting with it.
- **F30** — The census remains **read-only** and production-safe. Its docstring guarantee is load-bearing and survives this slice.
- **F31** — Wired as `npm run test:remote:2f:census` (§26 m3), matching the four existing per-phase cleanup scripts' naming.
- **F32** — **Executed** against the deployed project, with the record carrying the exact command, UTC timestamp, project ref, parity at the time, and the full bucket table.
- **F33** — **Stop-gate semantics honoured exactly.** A nonzero bucket 1 or 2 halts closeout and requires a new owner decision; no migration is authorized by the finding. Bucket 7 is informational and never blocks.
- **F34** — **Read-atomicity limitation stated, not worked around** (§26 Mo2). The census issues two independent non-transactional reads and joins them in memory, so a task completing between them can present as a bucket-1 row. The limitation is printed by the census itself, and a nonzero blocking bucket requires a **second confirming run** before it escalates under §18 B2, with both transcripts in the acceptance record. A snapshot-consistent read would need an RPC, which §5.11 forbids.
- **F35** — Bucket predicates are mechanically protected by CI tests, so a future edit that inverts a bucket reds the build rather than the census.
- **F36** — **The reminders grant posture is verified and recorded with its exact evidentiary basis, and nothing stronger is claimed** (§26 B3):
  - CI `database`, every run of this slice's own PR: `supabase/tests/phase_2f_task_write_grants.sql` — catalog posture, behavioural denial as the real client role, read-side RLS both ways, the retained Option C INSERT exercised, and **non-vacuity** by re-issuing exactly the chain's grants inside the test transaction, watching the refusals become successes, re-revoking and watching them refuse again.
  - The deployed catalog: `202607300063`'s nine fail-closed post-deploy assertion groups, executed against the live project 2026-07-29 18:38:20Z–18:38:28Z.
  - The live client surface: 2F.4's deployment session, `42501` on task INSERT/UPDATE/DELETE and reminder UPDATE/DELETE, on a **stale pre-migration session as well as a fresh one**, with `anon` denied on both tables.
  - Closeout adds the **write-free** live checks the cleanup verifier can make with existing credentials: `service_role` refused on `product_events` and `task_command_confirmations` (asserted, fails on success), and `anon` denied on `tasks` and `reminders` through the publishable key.
  - **Not re-measured at closeout, and stated as such:** the `authenticated` UPDATE/DELETE denial. Re-measuring it needs a fixture auth user in production, whose real footprint is larger than a reminder row — `handle_new_user` (`202607160001:50`) writes `profiles` and `agent_preferences`, and `run_all_heartbeats` (`202607170016:612`) enrols the user, writing a `heartbeat_runs` row per hourly tick while it exists — and whose fixture reminder would move census buckets 6–9. Docker is unavailable on this workstation, so a direct remote catalog dump is not available either; that constraint is stated rather than worked around.

### 6.4 Documentation reconciliation (`2F-OPERATIONS-006`)

- **F37** — Every document in §13 is inspected and updated only where repository truth requires it.
- **F38** — The dated ADR-055 expiry entry is verified present and equal to **`2026-10-27`**, by a CI case that reads `docs/TODO.md` and re-computes the date through `expiryDateFromGoLive` rather than eyeballing it.
- **F39** — Slice 2F.5's partials stay partial: `2F-MEASURE-005`'s unsupported-refusal volume remains **not measurable this phase**; `qualifyingCommands` remains preview rounds rather than intents; the two baselines stay scope-separated with cross-scope comparison prohibited.
- **F40** — Deferrals stay deferred: `2E-COMMAND-012`, reason-level refusal granularity, the replay spike, the privileged distinct-user read, a command identifier, `product_events` retention, the `snoozed` retirement, and the split/merge sub-epic (issue #8).
- **F41** — Accepted history is not rewritten to look cleaner. Corrections are recorded as corrections, and point-in-time records are re-labelled as historical rather than deleted.
- **F42** — C1 (rate limiting / spend caps) is **re-raised** in the final report per E13, with its current status quoted from `SECURITY.md:62`, and explicitly **not** implemented.

## 7. Operational requirements

- **O1** — Migration parity is verified before and after the closeout and recorded. This slice deploys nothing, so the expected result is `202607300063` unchanged both times. On §10's parity row: the row is labelled "every *deploying* slice" yet already assigns `●` to **2F.2**, which carried no migration (`docs/PHASE_2F_PRD.md:217`, `docs/STATE.md:66`), so the row's operative rule is evidently "every slice with a session against the deployed project" — under which 2F.6's `●` is unremarkable and 2F.5's `—` is itself inaccurate, since 2F.5 verified parity before and after. Both are dispositioned by the §14 A14 sweep. *(Revision 1 claimed its reading was "the only" consistent one; that overstated it — §26 m5.)*
- **O2** — All three CI jobs green on the exact merge SHA of every PR this slice opens (`2F-OPERATIONS-002`).
- **O3** — The working tree contains only intended Slice 2F.6 changes at PR time.
- **O4** — Two pull requests, for the reason Slices 2F.4 and 2F.5 each needed two: merge SHA, merge date and post-merge verification results do not exist while the implementation PR is open, and writing them earlier would be guessing.
- **O5** — Working branches are preserved; no admin bypass; no merge with a required check pending.

## 8. Security requirements

- **S1** — No grant, policy, RLS setting, RPC signature, trigger or privilege changes anywhere in this slice. The verifier's role is to *detect* such a change, and a detected widening is a hard failure.
- **S2** — `anon` continues to hold nothing on `public.tasks` and `public.reminders`, asserted live through the publishable key rather than assumed.
- **S3** — The Option C reminder exception remains **exactly one** exception, and the audit proves the `reminders` allowlist equals it while the `tasks` allowlist is empty, both by exact equality in both directions.
- **S4** — This slice creates no fixture user and writes nothing to production, so it has no residue of its own to reason about.
- **S5** — No content, title, user text, token or key is printed by any artifact this slice ships. Reminder titles are counted, never echoed — the census's `select` list already excludes `title`.
- **S6** — `service_role`'s inability to read `product_events` and `task_command_confirmations` is asserted as a security property, not tolerated as an inconvenience.

## 9. Ownership requirements

- **W1** — Every isolation assertion this slice adds asserts a **positive control first**, per `2F-OWNERSHIP-001`'s permanent lesson: a zero-row result must never pass an isolation check vacuously.
- **W2** — The census reads with `service_role` deliberately, because its most alarming bucket is a reminder whose owner differs from its task's owner and RLS would hide exactly that. The reason is stated wherever the choice appears.
- **W3** — "Orphan" derives from `user_id` absent from `auth.users`, never from an email or name pattern. Fixture identification derives from prefixes read out of the minting scripts, and is used **only to report**, never to delete.

## 10. Cleanup requirements

- **C1** — Zero Phase 2F fixture residue in the deployed project, proven by execution and reported per category, including storage.
- **C2** — Any temporary probe harness this slice creates is removed, and the working tree is verified clean before PR.
- **C3** — **This slice deletes nothing.** No user data, no fixture row, no storage object. No deletion driven by name, email or timestamp patterns. Residue found is reported and escalated, not swept.

## 11. Traceability requirements

- **T1** — A traceability matrix with, per row: requirement ID, description, authoritative source, owning/owed slice, implementation artifact, verification mechanism, CI or remote gate, acceptance evidence, final status, and deferred destination where applicable.
- **T2** — Every one of the 68 requirements appears exactly once, including the seven that are cross-cutting-only.
- **T3** — Every "complete" status has both an implementation artifact and a test-or-proof artifact that the generator resolved on disk.
- **T4** — **Cross-document contradiction is a failure, with a mechanism** (§26 M2, and Revision 1's T4 had none): the generator derives each slice's status from its acceptance-bearing artifact and fails when a permanent document asserts a contradicting status for the same slice — including *intra*-document contradiction, which is how `docs/STATE.md:50`'s leftover "the migration is not applied" paragraph survived beside `STATE.md:35`'s deployment record.
- **T5** — The matrix is regenerable and byte-stable across runs given an unchanged repository.

## 12. Reminder census requirements

Covered by F28–F36.

## 13. Documentation reconciliation requirements

| Document | Required action | Basis |
|---|---|---|
| `docs/PHASE_2F_PRD.md` | correct §10's `database` cell for 2F.5 (`—` → `●`); disposition §10's 2F.4 journeys cell (`● regression`, never executed) and its parity row's label and 2F.5 cell; record all of it as a **Revision 4.3** entry in §14 | §1.4; §26 M1; O1 |
| `docs/PHASE_2_PLAN.md` | Phase 2F pointer `Revision 4` → `Revision 4.2`; record Phase 2F complete with its delivered scope | `:128`; ADR-056 |
| `docs/STATE.md` | Slice 2F.6 section; Phase 2F complete; final posture, parity, SHAs, CI runs; correct `:31`'s misattributed run id; re-label `:183`'s "Current phase: Phase 2E" as a historical checkpoint; correct `:50`'s leftover pre-deployment paragraph; add a supersession preamble to `## Phase history` and `## Status summary` so their point-in-time content is not read as current | §1.5, §1.6; T4 |
| `docs/TODO.md` | header date on the repository's git-commit-date basis; rewrite `:4`'s active-milestone line whole (Phase 2C/2D/2E complete-and-released, active milestone Phase 2F closeout, issue #8 still deferred); `:28`'s `Revision 4` → `Revision 4.2` and 2F.5's status to accepted-and-merged with its SHA; check the Phase 2F box under the same merged-and-deployed-and-released rule Phases 2D/2E used; correct `:31`'s run id; **add** the newly-found `question-answer-form.test.tsx` flake; keep the three open items open | §26 Mo6, Mo7; §1.6 |
| `docs/CHANGELOG.md` | Slice 2F.6 entry and a Phase 2F closeout entry | house convention |
| `docs/DECISIONS.md` | the closeout ADRs this slice's decisions require, appended never rewritten; ADR-060's now-superseded Context discharged by one sentence in the closeout record rather than by editing it | §26 m1; F41 |
| `docs/SECURITY.md` | Phase 2F closeout section; correct the stale `202607180031` parity line; add the closeout census's bucket 6/7 figures and date to the Option C justification, keeping the decision and reopening condition unchanged | §1.5; §26 Mo4 |
| `docs/DATABASE.md` | Phase 2F closeout section; correct the `product_events` event-name count `19` → **26** | §1.5 |
| Phase 2F slice and acceptance reports | left as accepted history; additive cross-references only | F41 |
| `docs/reports/PHASE_2F_SLICE_06_REPORT.md` | new — the implementation report | house convention |
| `docs/reports/PHASE_2F_SLICE_06_ACCEPTANCE.md` | new — the acceptance record | house convention |
| `docs/reports/PHASE_2F_REPORT.md` | new — the final phase report, including C1's re-raise | `2F-OPERATIONS-006`; E13 |
| `docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md` | new — generated, never hand-edited | F1 |

## 14. Whole-phase convergence requirements

- **A1** — One validated write path for `public.tasks` in both application and database.
- **A2** — Exactly one documented reminder exception; the guard's `reminders` allowlist equals it and the `tasks` allowlist is empty, both by exact equality in both directions.
- **A3** — One payload builder and one resolution mechanism on the Work path.
- **A4** — No hidden second write path anywhere: application, migration, script, test or fixture.
- **A5** — ADR-055's expiry is `2026-10-27`, derived from go-live `2026-07-29` through `expiryDateFromGoLive`.
- **A6** — The command-funnel reader cannot authorize the planning tier without the privileged distinct-user measurement (`met_pending_privileged_read` is its ceiling).
- **A7** — Unsupported refusal volume remains labelled not measurable while no deployed emitter exists, and a CI case derives the unreachable set from the emitters.
- **A8** — Preview rounds are not misrepresented as intents anywhere.
- **A9** — Scoring-layer and end-to-end baselines remain scope-separated with comparison prohibited.
- **A10** — Every completed claim has evidence; every partial is still labelled partial; every deferral is still deferred.
- **A11** — The rollback script is documented accurately, and whether it has ever been executed is stated.
- **A12** — Migration parity verified before and after.
- **A13** — Phase 2G is not started: no artifact, no ADR, no plan, no requirement ID.
- **A14** — **`2F-PRECOND-003` gate-ledger sweep** (§26 M2): every `●` in `docs/PHASE_2F_PRD.md` §10 is matched to a named executed session in its owning slice's report or acceptance report; every mismatch is filed with a disposition — execute it now, or correct the cell with a §14 revision entry. Partly mechanical via F11.
- **A15** — Every claim in this slice's own reports is traceable to a command executed in this session, with its output.

## 15. CI and test requirements

- **X1** — Lint, typecheck, unit tests and build green locally and in CI.
- **X2** — `deno check` on both deployed entrypoints and `deno test` over `supabase/functions/` green in CI.
- **X3** — CI `database` green: whole chain from empty, full pgTAP (including F23's new assertions), `db lint --fail-on error`, the creation race, the foundation and task-command journeys, and the re-grant rehearsal with its three posture boundaries.
- **X4** — New CI tests: the generator's drift-detection **and positive-control** cases (F12), the verifier's pure-predicate cases (F24), the census bucket-predicate and write-free cases (F29, F35), and the documentation-convergence cases that read the documents they assert about (F38, T4).
- **X5** — Remote, executed in this order so no fixture can contaminate the stop-gate: the **census first**, then the cleanup verifier, the funnel proof, the end-to-end baseline, the full remote suite, and the census **again** if any run minted a fixture.
- **X6** — Authenticated Playwright journeys, desktop and mobile, both locales, per §10's 2F.6 cell — executable because `scripts/online-playwright.mjs:15-21` derives `ONLINE_SUPABASE_*` from the linked project. This run also serves as the phase-final regression evidence that A14's 2F.4 disposition leaves owing.
- **X7** — No test is weakened, and no expected value is changed merely because the implementation produced a different one.

## 16. Remote verification requirements

- **R1** — Every remote check names the project ref, the UTC timestamp and the parity at the time.
- **R2** — Every remote check that creates a fixture asserts its removal before exit 0. This slice's own artifacts create none.
- **R3** — Post-merge, every required remote check is re-executed **from merged `main` content**, not from the branch.
- **R4** — Where the available credentials cannot observe a property, the composition actually used is stated (F18, F22, F36) and no stronger claim is made.

## 17. Migration and deployment posture

**No migration. No deployment. No Edge Function deploy. No schema, grant, policy, RPC or trigger change. No production write of any kind.** Parity is `202607300063` before and after, verified both times. The only SQL this slice adds is F23's read-only pgTAP assertions, inside the existing `supabase/tests/phase_2f_task_write_grants.sql`, under §5.11's bounded exception and named in the acceptance report beside the finding that motivated them.

## 18. Error and failure behaviour

- **B1** — Every artifact fails closed: unknown state is a failure, never a pass.
- **B2** — The census stop-gate halts closeout on a nonzero bucket 1 or 2 — after F34's second confirming run — and escalates; it does not repair.
- **B3** — The cleanup verifier exits nonzero on any residue, any absent required table, any widened grant, any fixture storage object, and any object that must be absent being present.
- **B4** — The traceability generator throws rather than emitting a partial matrix.
- **B5** — A remote or CI failure is diagnosed to a root cause and attributed with evidence — a baseline reproduction, commit history, or a platform difference — before being called unrelated.

## 19. Acceptance criteria

1. Traceability **tamper-proven** over the 68-requirement inventory: the generator throws on each declared drift class and passes each positive control, proven by executed fixture runs; the matrix regenerates byte-stably.
2. Cleanup verifier **executed clean** against the deployed project, every category reported (including storage and the deliberately-not-scanned list), zero residue, and F23's cascade assertions green in CI.
3. Census **executed**, buckets 1 and 2 zero, bucket 7 reported informationally, ordered paging in place, and its read-atomicity limitation printed.
4. Convergence audit complete: A1–A15 each verified or filed as a defect with a disposition.
5. Documentation reconciled per §13, with the ADR-055 expiry verified dated `2026-10-27` by an executed CI case.
6. All applicable local and CI gates green, with retained pre-existing defects explicitly named.
7. Parity `202607300063` verified before and after.
8. Final report carrying the phase's executed-evidence ledger and C1's re-raise.
9. Phase 2G not started, asserted with the evidence that supports it.

## 20. Rollback posture

Read-only and write-free. Nothing is applied to any environment; there is no migration to revert. The code rollback is a plain revert of a PR containing scripts, tests, read-only pgTAP assertions and documentation. The phase's own rollback artifact (`scripts/phase-2f-regrant-task-write-grants.sql`) is **not executed** by this slice; its status is reported, not changed — rehearsed at SQL level in every CI `database` run, never executed operationally.

## 21. Risks

| # | Risk | Mitigation |
|---|---|---|
| K1 | A generator that reads its own declarations and proves nothing | F4, F12: every path and npm script resolved; detection proven against fixture roots with injected drift, plus positive controls |
| K2 | A verifier whose "zero" is a tautology | F22: the orphan scan's structural impossibility is stated, the load-bearing detectors are named, and F23 guards the cascade in CI |
| K3 | A verifier that reports zero while residue sits in storage | F17: the house storage scan is ported and its counter is part of the exit condition |
| K4 | The census stop-gate failing open on unordered paging | F28: total order on `id`, exhaustion asserted, covered by F35's tests |
| K5 | Escalating a blocking bucket on a read artefact | F34: limitation printed; a second confirming run required before escalation |
| K6 | Documentation reconciliation drifting into rewriting accepted history | F41; §13's per-document scope; point-in-time content re-labelled, never deleted |
| K7 | The Windows CRLF defect blocking a local gate claim | §11 of the closeout charter: it does not block — CI is green on Linux at `6628b02` (46/46 in `sql-reachability.test.ts`, verified from run `30497118489`'s log) — so it stays in TODO |
| K8 | Scope creep from a review finding that belongs to a later phase | every accepted finding checked against §5 before implementation; §26 records the check per finding |
| K9 | Docker unavailable, so no direct remote catalog dump | F36: the constraint is stated and the three executed sources that do exist are cited |

## 22. Known limitations

1. **Direct `product_events` row absence after owner deletion is unobservable** with any credential this repository holds (F18).
2. **Orphan scans over cascade-protected tables cannot return nonzero** (F22); the load-bearing residue detectors are the fixture-prefix user scan, the storage scan and per-table read reachability.
3. **The `authenticated` reminder UPDATE/DELETE denial is not re-measured at closeout** (F36); it is cited from three executed sources.
4. **The real owner's command funnel is empty**, so no evidence tier is met and none is claimed met.
5. **`2F-MEASURE-005`'s unsupported-refusal volume is not measurable this phase** — inherited partial, unchanged.
6. **`qualifyingCommands` counts preview rounds, not intents** — inherited partial, unchanged.
7. **Write-side RLS on `public.tasks` is permanently untestable from a client role** — inherited from 2F.4 with its compensating evidence.
8. **The live re-grant rollback remains unrehearsed at the operational layer**, by design.
9. **Two Vitest cases fail on a Windows checkout** (`sql-reachability.test.ts`, CRLF) — pre-existing, CI-green on Linux, retained in TODO.
10. **Two component tests are flaky under CI load** — `src/features/tasks/task-candidate-form.test.tsx` (recorded) and `src/features/agent/question-answer-form.test.tsx` (found this session at `6628b02`, run `30497118489`, `:162`) — both pass locally, neither reproducible on demand.
11. **`e2e/intelligent-capture.spec.ts` is not deterministic online** — pre-existing, issue #21.
12. **No `PHASE_2F_SLICE_03_REPORT.md` exists**; Slice 2F.3's evidence lives in its plan and acceptance reports. The naming asymmetry was already dispositioned in `PHASE_2F_SLICE_04_PLAN.md:99` with no action proposed; F7 reflects it truthfully rather than fabricating an artifact.
13. **The census's read atomicity** (F34).

## 23. Deferred post-Phase-2F work

| Item | Destination |
|---|---|
| AI provenance (`2E-COMMAND-012`) | a future phase, behind ADR-057's executed-dry-run reopening gate |
| Semantic retrieval | gated by ADR-055's two tiers, expiring **2026-10-27** |
| The ≤3-day offline replay spike | authorized only by the spike tier, unmet |
| Reason-level refusal granularity | post-2F, needs an allowlist widening |
| An emitter for `unsupported` / `applied` / `rejected_conflict` preview categories | post-2F |
| A funnel UI surface | post-2F |
| The privileged distinct-user read | ADR-055 evaluation time |
| A command identifier for per-intent counting | post-2F |
| `product_events` retention/purge | pre-production checklist, `SECURITY.md:58` |
| Retiring the dormant `snoozed` status | deferred by `2F-REMINDER-004` |
| **C1 — distributed rate limiting / spend caps** | **re-raised by this closeout per E13, not implemented**; `SECURITY.md:62` |
| Retroactive history, date semantics, review invalidation, recurrence | unscheduled, gated on repairing review generation (ADR-056, `TODO.md` M11) |
| Split/merge sub-epic (`2C-STRUCTURE-004`) | GitHub issue #8 |
| The Windows CRLF normalisation | `TODO.md`, unrelated cleanup |
| The two component-test flakes | `TODO.md`, need reproductions |
| `intelligent-capture.spec.ts` determinism | GitHub issue #21 |

## 24. Exact completion boundary

Slice 2F.6 — and Phase 2F — are complete when, and only when:

1. This definitive PRD is committed as the implementation contract.
2. `scripts/generate-phase-2f-traceability.mjs` exists, is tested for drift detection **and** positive controls, and has produced `docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md`.
3. `scripts/verify-phase-2f-cleanup.mjs` exists, is tested, and has executed clean against the deployed project.
4. The census is corrected, mechanically protected, wired and executed, with buckets 1 and 2 zero.
5. The convergence audit A1–A15 is complete and every defect is fixed or filed with a destination.
6. Every document in §13 matches repository truth.
7. Local and CI gates are green, with retained pre-existing defects named.
8. Parity is verified `202607300063` before and after.
9. The implementation PR is merged with all three CI jobs green on the exact merge SHA.
10. Post-merge verification is executed from merged `main` content.
11. The acceptance report and the final phase report are written and merged.
12. `STATE.md`, `TODO.md` and `CHANGELOG.md` mark Phase 2F complete consistently.
13. `main` is clean and synchronized with `origin`.

## 25. Explicit prohibition on starting Phase 2G

**Phase 2G is not started by this slice, and this slice creates no artifact that begins it.** No Phase 2G PRD, plan, proposal, requirement ID, ADR, migration, script, test or document section is created or modified. No requirement deferred out of Phase 2F is implemented here merely because a Phase 2F report mentions it — a mention is a record, not an authorization; E13's C1 obligation is discharged by **re-raising**, which is a sentence in a report, not work. F10 is the mechanical guard, restated so it can actually run, and A13 asserts the state with the grep that establishes it.

## 26. Review cycle 1 — adversarial design review of Revision 1, with adjudication

The review inspected the repository independently and returned 20 findings plus a section recording fourteen attacks it ran that **failed** (the draft held). Every finding is adjudicated below with the evidence used. **No accepted fix starts Phase 2G, and none implements previously deferred product functionality** — the single largest accepted change *removes* scope.

| # | Finding | Verdict | Evidence used | Correction |
|---|---|---|---|---|
| **B1** | F3's single-relation ownership derivation fires seven false failures: §7's "Owns" column covers only 61 of 68 | **CONFIRMED** | Executed the derivation myself: 61 owned, 7 cross-cutting-only (`ANALYTICS-001…003`, `OWNERSHIP-001…002`, `OPERATIONS-001/002`), 0 uncovered, 0 over-claimed. `PHASE_2F_SLICE_01_REPORT.md:7` already reads §7 this way | F3 rewritten as two relations (`owns`/`owed`), at least one required, the seven recorded as cross-cutting-only by §7's design. The concept was sound; the **text** was defective. Its sibling — F7's "must have an ACCEPTANCE artifact", which would fail on Slice 2F.1 (REPORT only) — was found by the same check and is fixed in F7 |
| **B2** | F10 false-positives on merged content | **CONFIRMED** | Verified myself: `docs/PHASE_2F_PRD.md:88` declares nothing but *references* `2E-COMMAND-012`; `:184` references `2E-MATCH-018`. A literal F10 would red the build on two owner-authorized sentences | F10 restated as two declaration-anchored checks with positive controls in both directions (referenced `2E-` passes; declared `2G-` fails) |
| **B3** | `--posture` is unrequested scope, the slice's only production write, and contaminates the census it shares a session with | **CONFIRMED** | `2F-OPERATIONS-004`'s text owns no posture check. The census counts *every* reminder via `service_role` (`:91-95`), so a fixture reminder moves buckets 6–9 — a contamination path Revision 1 never ordered against. Minting a user fires `handle_new_user` (`202607160001:50`) and enrols it in `run_all_heartbeats` (`202607170016:612`). The property is already proven three ways (F36) | **`--posture` deleted.** F36 cites the three executed sources and adds only write-free live checks. §5.13 now forbids any production write. X5 orders the census first regardless |
| **M1** | §10's 2F.4 journeys cell `● regression` was never executed | **CONFIRMED** | Verified myself: `…_04_ACCEPTANCE.md:163-184` enumerates sixteen gates, none a journey; grep for Playwright/Pixel/desktop in the 2F.4 report and acceptance returns only the CI job name. Contrast `…_02_ACCEPTANCE.md:33-41` (32/32) and `…_03_ACCEPTANCE.md:54` (4/4) | Filed as a convergence defect. **Disposition chosen:** correct the cell rather than retro-fit a journey to a slice that changed zero `src/` files (gate 13), because the substance of a post-revocation regression check was discharged by 2F.4's 14/14 production-flow checks and the full remote suite — a stronger mechanism than a browser. §10 gets a Revision 4.3 entry, and X6's own journeys give the phase an executed end-state proof |
| **M2** | The audit has no `2F-PRECOND-003` sweep — the check that would have caught M1 | **CONFIRMED** | Revision 1's A1–A13 contained no cell-to-session cross-check; the draft's own gap list missed M1 | **A14** added, plus **F11** to make it partly mechanical. The sweep immediately produced a third finding of its own: §10's parity row is labelled "every *deploying* slice" but already marks 2F.2, which deployed nothing, while marking 2F.5 `—` although 2F.5 verified parity before and after (O1) |
| **M3** | F19's orphan scan is structurally incapable of a nonzero result | **CONFIRMED** | Every scanned table's `user_id` cascades from `auth.users`; the house verifier makes this exact argument to *exclude* a table (`verify-phase-2e-cleanup.mjs:52-57`, "The row this scan looks for cannot exist") | F22 restates what the scan proves and ranks the detectors; F23 adds read-only pgTAP cascade assertions so the impossibility is guarded rather than asserted in prose |
| **M4** | The storage scan was dropped while `attachments` stayed in the table list | **CONFIRMED** | `verify-phase-2e-cleanup.mjs:187-217,230` scans `user-files` and gates on `remoteSmokeObjects > 0`; `SECURITY.md:72` records storage residue as a real category; X5 requires the full remote suite, which uploads a fixture object | F17: scan ported, both counters reported, `remoteSmokeObjects > 0` in the exit condition |
| **Mo1** | The census pages with unordered `OFFSET` — the defect 2F.5 already fixed once | **CONFIRMED** | `phase-2f-reminder-census.mjs:44-52` has no `.order`; `PHASE_2F_SLICE_05_PRD.md` §23.1 F10 and `CHANGELOG.md:21` record the same class being fixed with keyset paging. `taskById` feeds the two blocking buckets, so the stop-gate fails **open** | F28: total order on `id`, exhaustion asserted, covered by F35 |
| **Mo2** | Two non-transactional reads make the stop-gate racy | **CONFIRMED** | `:59-65` reads `reminders` then `tasks` and joins in memory; both tables are moved by `run_user_heartbeat` and `apply_task_command` | F34: limitation printed by the census; a second confirming run required before escalation |
| **Mo3** | F18's `ai_usage_events` column probe guesses a name | **CONFIRMED** | No provenance column name has ever been declared — `DECISIONS.md:585` names only build constants, `:636` says the signature is unchanged. A guessed name would pass for the wrong reason | F21: the column leg is replaced by a signature-rejection probe plus the ADR-057 reopening-gate state (script present, transcript absent) |
| **Mo4** | `SECURITY.md`'s Option C justification is falsifiable by the closeout census and §13 omitted it | **CONFIRMED** | `SECURITY.md:96` grounds the exception partly on "no independent reminders in production"; census buckets 6 and 7 measure exactly that (both **zero** at 2026-07-30T02:39:48Z, so the sentence remains true) | §13's `SECURITY.md` row now requires the closeout figures and date to be added as corroboration, decision and reopening condition unchanged |
| **Mo5** | F8's CI-gate derivation is vacuous or a false-positive machine | **CONFIRMED** | The `app` job runs only `lint`/`typecheck`/`test`/`build` (`ci.yml:29-32`); no step names the guards or the Gate 3 suite, and the pre-revocation assertion lives inside `supabase test db --local supabase/tests` (`:138`) | F8 split into job-level and suite-level legs, the second proving the file sits in a path the workflow executes — which also makes the ADR-059 vitest-exclusion hazard mechanical |
| **Mo6** | `TODO.md`'s header is post-dated; `:28` says `Revision 4` and contradicts itself; 2F.5's status is stale | **CONFIRMED in substance, framing REJECTED** | The three defects are real and verified. But "a date that cannot be a fact" overstates it: `date -u` returns `2026-07-30T02:39Z`, so `2026-07-30` is the **UTC** date while `STATE.md:3` uses the git-commit-date basis (`git show -s --format=%cs` gave `2026-07-29` for `2ae2606`). It is a date-basis inconsistency, not an impossible date | §13 normalizes both headers on the git-commit-date basis and corrects `:28` and 2F.5's status. The framing correction is recorded because G5 requires drift classes to stay distinct |
| **Mo7** | `TODO.md:4` is stale in four ways; Revision 1 named one | **CONFIRMED** | `:4` still says the active milestone is Phase 2C, that 2D.6 lives on a branch, and that Phase 2E "awaits authorization" — against `:16`, `:19` and `STATE.md:77` | §13 rewrites `:4` whole |
| **Mo8** | F28 refactors a `2F-PRECOND-001`-preserved artifact, and §17's SQL escape hatch is undefended | **CONFIRMED** | The census has no exports (`:54-95`); `2F-PRECOND-001` lists it among preserved artifacts; Revision 1's §17 permitted "a read-only assertion" without bound | F29 makes the refactor extraction-only with byte-identical selects, the docstring preserved and a write-free assertion test — which serves `2F-PRECOND-001`'s anti-rot purpose rather than conflicting with it. §5.11 now bounds new SQL to an existing Phase 2F-owned file, named in the acceptance report beside its motivating finding |
| **Mo9** | `--posture`'s production footprint exceeded what K3 and §20 stated | **CONFIRMED** | `handle_new_user` (`202607160001:50`) writes `profiles`/`agent_preferences`; `run_all_heartbeats` (`202607170016:612`) enrols the user and writes `heartbeat_runs` per tick | Moot once B3 deletes `--posture`. The residual table-list point is accepted through F15's written-down exclusions |
| **m1** | ADR-060's Context is now false, and §13 gave `DECISIONS.md` no instruction | **CONFIRMED** | `DECISIONS.md:664` says `TODO.md:30` "still carries the placeholder"; `:30` now carries `2026-10-27` | Discharged append-only: one sentence in the closeout record; ADR-060 is not rewritten (F41) |
| **m2** | F13's list neither includes nor excuses the tables the house verifier reasons about explicitly | **CONFIRMED** | `verify-phase-2e-cleanup.mjs:26-31` writes down its exclusions and why | F15 adds the "deliberately not scanned, and why" block with each cascade anchor |
| **m3** | Appendix A cited two npm gates that do not exist; the census was never wired | **CONFIRMED** | `package.json:34-36` has `test:remote:2f:funnel`/`:baseline`/`measure:2f:funnel` and neither `:cleanup` nor `:census` | F13 and F31 wire both; F4 extends resolution to npm script names |
| **m4** | §2's "68 IDs" was true only under an unstated parsing rule | **CONFIRMED** | §6 references `2F-GUARD-002`, `2F-REMINDER-003`, `2F-MEASURE-003/004`, `2F-DECISION-002`, `2F-OPERATIONS-006`, `2F-TESTMIG-003` and (in §6.5a) `2F-CREATE-001/002` inside other requirements' bodies; only a declaration-anchored match yields 68 | F2 states the rule and adds the referenced-ID-resolves check (which returns zero unresolved today) |
| **m5** | O1's "the only reading" was overstated | **CONFIRMED** | §10's parity row already marks **2F.2**, which carried no migration (`PHASE_2F_PRD.md:217`, `STATE.md:66`) | O1 rewritten to the evidence-based reading, and the row's label and 2F.5 cell folded into A14 |

**Did the review introduce scope expansion?** One accepted fix removes scope (B3). Four add work inside `2F-OPERATIONS-003`/`004`/`005` — a second derivation leg (Mo5), a storage scan port (M4), read-only pgTAP cascade assertions in an existing file (M3), and two npm scripts (m3). None touches product code, grants, policies, migrations, the Option C decision or a deferred capability. **Nothing accepted starts Phase 2G.**

**Was any finding rejected for increasing legitimate work?** No. The only rejection is Mo6's *characterization* of a date, and the underlying defect is accepted and fixed.

## 27. Traceability matrix (declared)

Ten columns, factored: per-requirement ID, description, owning or owed slice, an evidence key, status and deferred destination; the evidence keys expand below into authoritative source, implementation artifact, verification mechanism, CI/remote gate and acceptance evidence. `docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md` is the **derived** artifact and carries all columns fully expanded for all 68 rows. The two are kept in agreement by the CI case that regenerates the matrix from the real repository and compares it byte-for-byte, plus the shared counting basis stated below; an earlier revision promised a PRD-to-matrix status-comparison case that was never written, and saying so is better than leaving the promise standing.

### 27.1 Evidence keys

| Key | Authoritative source | Implementation artifact | Verification mechanism | CI / remote gate | Acceptance evidence |
|---|---|---|---|---|---|
| E-GUARD | PRD §6.1 | `src/lib/supabase/sql-grammar-guard.test.ts`; `direct-write-guard.test.ts` | red-first defective fixtures; allowlists by exact equality both ways | CI `app` | `PHASE_2F_SLICE_01_REPORT.md` |
| E-DECISION | PRD §6.2 | `docs/DECISIONS.md` ADR-054…057; `docs/TODO.md` deferral + dated expiry entries | ADR presence and ID citation derived from `DECISIONS.md`; expiry re-computed by `expiryDateFromGoLive` | CI `app` (doc-convergence) | `…_01_REPORT.md`; `…_05_ACCEPTANCE.md` §5a |
| E-PRECOND | PRD §6.3 | `scripts/phase-2f-writer-inventory.mjs`; `phase-2f-reminder-census.mjs`; `phase-2f-gate3-exact-title-reuse.mjs`; `phase-2f-gate1-record-ai-usage-dry-run.sql`; `src/features/task-commands/work-surface-reuse.test.ts`; `supabase/tests/phase_2f_effective_limit.sql` | artifacts resolved on disk; static suite continuous in CI; clamping pinned by pgTAP; A14 sweep | CI `app` + CI `database` | `…_01_REPORT.md`; A14 |
| E-SURFACE | PRD §6.4 | `src/features/task-commands/work-command.ts`; `src/features/operations/task-list.tsx`, `work-action-state.ts`, `work-actions-copy.ts` | `work-command.test.ts`; `task-list.test.tsx`; `work-surface-reuse.test.ts` | CI `app`; journeys 32/32 (2F.2 session) | `…_02_ACCEPTANCE.md` |
| E-CREATE | PRD §6.5, §6.5a | migration `202607290062`; `src/features/task-commands/creation.ts`; `src/features/tasks/actions.ts` | `supabase/tests/phase_2e_task_command_creation.sql`; `scripts/phase-2f3-creation-probe.mjs`; `e2e/manual-task-creation.spec.ts` | CI `database`; 2F.3 session (21 gates) | `…_03_ACCEPTANCE.md` |
| E-REMINDER | PRD §6.6 | `docs/SECURITY.md` Option C section; `docs/DATABASE.md` `snoozed` note; migration `202607300063` | `direct-write-guard.test.ts` reminders allowlist; `phase_2f_task_write_grants.sql`; census buckets 5–7 | CI `app` + CI `database` + `test:remote:2f:census` | `…_03_ACCEPTANCE.md`; `…_04_ACCEPTANCE.md` |
| E-REVOKE | PRD §6.7 | migration `202607300063`; `scripts/phase-2f-regrant-task-write-grants.sql`; `ci.yml` rehearsal step | `phase_2f_task_write_grants.sql` (27 assertions, non-vacuous by re-grant/re-revoke); `regrant-rehearsal/` suite | CI `database` incl. rehearsal; 2F.4 session (16 gates) | `…_04_ACCEPTANCE.md` |
| E-TESTMIG | PRD §6.8, §9 | `phase_2e_task_command_apply.sql`; `_creation.sql`; `phase_2c_slice_5_task_graph.sql`; `phase_2f_task_write_grants.sql`; three remote smokes | 13 dispositions landed per §9; full pgTAP green from an empty chain | CI `database`; full remote suite (2F.4 session) | `…_04_ACCEPTANCE.md` |
| E-MEASURE | PRD §6.9 | `scripts/phase-2f-command-funnel.mjs`; `phase-2f-command-funnel-reader.mjs`; `end-to-end-match-baseline.remote.test.ts`; `vitest.remote.config.ts` | `command-funnel.test.ts` (52 cases; reachability derived from the emitters); funnel proof 32/32; baseline 9/9 | CI `app`; deployed project | `…_05_ACCEPTANCE.md` |
| E-OWNERSHIP | PRD §6.10 | `scripts/phase-2f-gate3-exact-title-reuse.mjs`; `scripts/phase-2f3-creation-probe.mjs` | owner positive count asserted before stranger absence, both directions | 2F.2 / 2F.3 sessions | `…_02_ACCEPTANCE.md`; `…_03_ACCEPTANCE.md` |
| E-ANALYTICS | PRD §6.11 | `src/features/task-commands/analytics.ts` (`commandOrigin: 'work'`); no migration | `analytics.test.ts`; `product-analytics/contracts.test.ts`; content-free import guard | CI `app`; live event observation (2F.2 session) | `…_02_ACCEPTANCE.md`; `…_03_ACCEPTANCE.md` |
| E-OPERATIONS | PRD §6.12 | `docs/STATE.md` parity records; CI runs on each merge SHA | `npx supabase migration list --linked`; `gh run view` | deployed project; CI | each slice's acceptance |
| E-TRACE | PRD §6.12 | `scripts/generate-phase-2f-traceability.mjs`; `docs/reports/PHASE_2F_TRACEABILITY_MATRIX.md` | fixture-root drift runs and positive controls, one per declared failure class | CI `app`; `npm run docs:phase-2f:traceability` | `…_06_ACCEPTANCE.md` |
| E-CLEAN | PRD §6.12; 2F.5 PRD §22 | `scripts/verify-phase-2f-cleanup.mjs`; `supabase/tests/phase_2f_task_write_grants.sql` (cascade assertions) | pure-predicate CI tests; executed remote run; storage scan; asserted service-role refusals; cascade FKs asserted in pgTAP | CI `app` + CI `database` + `npm run test:remote:2f:cleanup` | `…_06_ACCEPTANCE.md` |
| E-CENSUS | PRD §6.12 | `scripts/phase-2f-reminder-census.mjs` (extracted predicates, ordered paging) | bucket-predicate CI tests; write-free assertion test; executed remote run, confirmed twice if any blocking bucket is nonzero | CI `app` + `npm run test:remote:2f:census` | `…_06_ACCEPTANCE.md` |
| E-DOCS | PRD §6.12 | every document in §13 | documentation-convergence CI cases that read the documents they assert about | CI `app` | `…_06_ACCEPTANCE.md` |

### 27.2 Requirements

| ID | Requirement (abridged) | Slice | Evidence | Status | Deferred destination |
|---|---|---|---|---|---|
| `2F-GUARD-001` | The plpgsql grammar-trap guard (unqualifiable coalesce/nullif/greatest/least under search… | 2F.1 | E-GUARD | complete | — |
| `2F-GUARD-002` | An architecture regression gate fails CI on any new application-module direct DML against… | 2F.1 | E-GUARD | complete | — |
| `2F-GUARD-003` | The gate inspects real source (call sites), not a restated file list; allowlist edits are… | 2F.1 | E-GUARD | complete | — |
| `2F-DECISION-001` | ADR: "activity" remains a task created by command; reopening condition named (observed re… | 2F.1 | E-DECISION | complete | — |
| `2F-DECISION-002` | ADR: the semantic-retrieval evidence standard — both tiers of 2F-MEASURE-003/004 with the… | 2F.1 | E-DECISION | complete | — |
| `2F-DECISION-003` | ADR: phase-letter reconciliation — PHASE_2_PLAN.md §"Phase 2F" and TODO.md line 28 re-poi… | 2F.1 | E-DECISION | complete | — |
| `2F-DECISION-004` | The provenance deferral is recorded (ADR + TODO.md): 2E-COMMAND-012 remains undelivered; … | 2F.1 | E-DECISION | complete | — |
| `2F-PRECOND-001` | The four gate artifacts (phase-2f-writer-inventory.mjs, phase-2f-reminder-census.mjs, pha… | 2F.1 | E-PRECOND | complete | — |
| `2F-PRECOND-002` | The effective_limit clamping semantics of list_task_command_candidates are pinned by an e… | 2F.1 | E-PRECOND | complete | — |
| `2F-PRECOND-003` | Every slice report names the session in which each of its gates executed; an unexecuted g… | 2F.1 | E-PRECOND | complete, via A14's sweep and its two filed dispositions | — |
| `2F-SURFACE-001` | The four Work actions route through public.apply_task_command via the §5 mechanism. No ne… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-002` | The §5 action mapping is pinned as data beside the taxonomy — never inline in a component… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-003` | Click-time resolution is the only pre-state source. The witness is never assembled from t… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-004` | The clicked task_id is authoritative. Title drift alone never refuses; the row is selecte… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-005` | Apply proceeds only after click-time resolution proves ownership, action eligibility, and… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-006` | The operation key is minted once per mount into a ref or lazily-initialised state — never… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-007` | Each apply records audit actor 'user', an undo operation, and continues emitting task_sta… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-008` | Reminder consequences are asserted in both directions: terminal transitions cancel the ta… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-009` | UI layout is preserved; availability follows taxonomy eligibility (reopen_task only from … | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-010` | task-list.tsx converts Server→Client Component with useActionState; the no-JS submit path… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-011` | Every refusal and failure reachable from this path maps to a rendered, localized state wi… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-012` | updateTaskStatus is removed — Gate 2 shows it delegates to persistTaskStatus, and its onl… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-013` | The legacy direct-UPDATE path (persistTaskStatus) is deleted in the same PR that proves t… | 2F.2 | E-SURFACE | complete | — |
| `2F-SURFACE-014` | 2F.2 lands as a mechanically revertible PR: single revert boundary, no unrelated work. Th… | 2F.2 | E-SURFACE | complete | — |
| `2F-CREATE-001` | createRecord's task branch routes through the validated creation family; the direct INSER… | 2F.3 | E-CREATE | complete | — |
| `2F-CREATE-002` | Manual creation persists created_by = 'user' and audit actor 'user' with fully functional… | 2F.3 | E-CREATE | complete | — |
| `2F-CREATE-003` | Creation is operation-key idempotent with database enforcement; duplicate submission retu… | 2F.3 | E-CREATE | complete | — |
| `2F-CREATE-004` | Creation records a compensable undo (the registered creation-undo handler, made satisfiab… | 2F.3 | E-CREATE | complete | — |
| `2F-CREATE-005` | Because Gate 3 proved only the mutation path, 2F.3 executes its own smaller creation-fa… | 2F.3 | E-CREATE | complete | — |
| `2F-CREATE-006` | The form's UX is preserved: same entry points, same revalidated routes, both locales. | 2F.3 | E-CREATE | complete | — |
| `2F-REMINDER-001` | The independent-reminder creation path (createReminder) is retained as-is: no create_remi… | 2F.3 | E-REMINDER | complete | — |
| `2F-REMINDER-002` | The exception is documented in SECURITY.md as a bounded, deliberate posture: what it perm… | 2F.3 | E-REMINDER | complete | — |
| `2F-REMINDER-003` | Whether authenticated UPDATE and DELETE on public.reminders can be revoked safely is dete… | 2F.4 | E-REMINDER | complete | — |
| `2F-REMINDER-004` | The dormant snoozed status (declared in the CHECK, written by nothing in production, fire… | 2F.3 | E-REMINDER | complete (recorded and deferred, which is what the requirement asks) | retirement of the literal: post-2F |
| `2F-REVOKE-001` | authenticated's insert, update, delete on public.tasks are revoked in one dedicated migra… | 2F.4 | E-REVOKE | complete | — |
| `2F-REVOKE-002` | create_due_task_reminder is verified security invoker (202607160007:195-199, Gate 2 findi… | 2F.4 | E-REVOKE | complete | — |
| `2F-REVOKE-003` | The re-grant rollback script is committed, and CI's database job gains a new harness step… | 2F.4 | E-REVOKE | complete, SQL-level scope stated wherever cited | operational live-ops rehearsal: not planned |
| `2F-REVOKE-004` | pgTAP proves the denial non-vacuously. Mechanism corrected in Revision 4.2 (§12): the sam… | 2F.4 | E-REVOKE | complete, with the write-side-RLS evidence loss recorded | — |
| `2F-REVOKE-005` | The full existing remote suite executes in the revocation deployment session; a forgotten… | 2F.4 | E-REVOKE | complete | — |
| `2F-REVOKE-006` | RLS policies are unchanged; no grant widens anywhere; anon continues to hold nothing. | 2F.4 | E-REVOKE | complete | — |
| `2F-REVOKE-007` | SECURITY.md closes the §16.4-class residual risk for tasks, states the reminders posture … | 2F.4 | E-REVOKE | complete | — |
| `2F-REVOKE-008` | The 2F-GUARD-002 tasks allowlist is empty at this slice's acceptance. | 2F.4 | E-REVOKE | complete | — |
| `2F-TESTMIG-001` | Every one of the 13 pgTAP statements receives the §9 disposition — none is mechanically r… | 2F.4 | E-TESTMIG | complete | — |
| `2F-TESTMIG-002` | apply.sql:580's positive claim ("a plain client-side task UPDATE still works") is retired… | 2F.4 | E-TESTMIG | complete | — |
| `2F-TESTMIG-003` | apply.sql:598/643 (title/description audit-watch proofs) restage their write vehicle as p… | 2F.4 | E-TESTMIG | complete | — |
| `2F-TESTMIG-004` | The interference stagings — apply.sql:1385 (legacy-shaped completed_at on a non-terminal … | 2F.4 | E-TESTMIG | complete | — |
| `2F-TESTMIG-005` | The reminder stagings split by grant outcome: the three INSERTs (apply.sql:2587, creation… | 2F.4 | E-TESTMIG | complete | — |
| `2F-TESTMIG-006` | Remote smokes: the fixture-only authenticated task inserts (remote-phase-2e-smoke.mjs:144… | 2F.4 | E-TESTMIG | complete | — |
| `2F-TESTMIG-007` | Stale in-repo prose that asserts the old grants is corrected at source in the same slice:… | 2F.4 | E-TESTMIG | complete | — |
| `2F-TESTMIG-008` | CI's database job is green on the revocation migration with the full re-dispositioned sui… | 2F.4 | E-TESTMIG | complete | — |
| `2F-MEASURE-001` | A minimal internal command-funnel reader ships: owner-scoped, content-free aggregates ove… | 2F.5 | E-MEASURE | complete | reason-level refusal granularity: post-2F |
| `2F-MEASURE-002` | Qualifying command exclusion works by construction through three real mechanisms, not ema… | 2F.5 | E-MEASURE | complete, with ADR-058's fourth mechanism and the orphan residual owned | orphan residual: mitigated by `2F-OPERATIONS-004` |
| `2F-MEASURE-003` | At 50 qualifying commands / 10 distinct active days / a 14-day observation window, the ev… | 2F.5 | E-MEASURE | complete (tier computable; **not met** — the owner's funnel is empty) | the spike itself: only if the tier is met |
| `2F-MEASURE-004` | 150 qualifying commands / 20 distinct active days / a 30-day window / ≥2 distinct real us… | 2F.5 | E-MEASURE | complete (ceiling `met_pending_privileged_read`; **not met**) | privileged distinct-user read: ADR-055 evaluation time |
| `2F-MEASURE-005` | Non-authorizing, permanently: unsupported-command refusal volume, adoption/command volume… | 2F.5 | E-MEASURE | complete as to its normative claim (ADR-055 states the list), **with a recorded measurement partial** — unsupported-refusal volume is not measurable this phase | an emitter for the three unreachable preview categories: post-2F |
| `2F-MEASURE-006` | Expiry, operationally owned: at 90 days without a met threshold, an ADR removes semantic … | 2F.5 | E-MEASURE | complete — dated `2026-10-27`, verified by F38 | the expiry ADR itself: due `2026-10-27` |
| `2F-MEASURE-007` | The end-to-end match baseline is measured once against the deployed contract (disposable … | 2F.5 | E-MEASURE | complete | — |
| `2F-OWNERSHIP-001` | The surface path is proven cross-owner-denying end-to-end through its real entry point — … | cross-cutting: 2F.2 | E-OWNERSHIP | complete | — |
| `2F-OWNERSHIP-002` | The 2F.3 creation probe includes the two-owner proof for the creation family. | cross-cutting: 2F.3 | E-OWNERSHIP | complete | — |
| `2F-ANALYTICS-001` | task_status_changed continues from the consolidated path with its current allowlisted shape. | cross-cutting: 2F.2 | E-ANALYTICS | complete | — |
| `2F-ANALYTICS-002` | Surface applies report through the existing task_command_* events with commandOrigin: 'wo… | cross-cutting: 2F.2 | E-ANALYTICS | complete | — |
| `2F-ANALYTICS-003` | All payloads and the funnel reader remain content-free: no task or reminder titles, no us… | cross-cutting: 2F.3 | E-ANALYTICS | complete | — |
| `2F-OPERATIONS-001` | Every deploying slice re-verifies remote migration parity immediately before and after, r… | cross-cutting: 2F.2 / 2F.3 / 2F.4 | E-OPERATIONS | complete | — |
| `2F-OPERATIONS-002` | All three CI jobs green on the exact merge SHA of every slice PR. | cross-cutting: 2F.1 / 2F.2 / 2F.3 / 2F.4 / 2F.5 | E-OPERATIONS | complete | — |
| `2F-OPERATIONS-003` | The phase ships a fail-closed traceability generator and matrix over this PRD's 68-requir… | 2F.6 | E-TRACE | complete (this slice) | — |
| `2F-OPERATIONS-004` | A cleanup verifier proves zero fixture residue across every table the phase's probes touc… | 2F.6 | E-CLEAN | complete (this slice) | — |
| `2F-OPERATIONS-005` | scripts/phase-2f-reminder-census.mjs re-runs at 2F.6 closeout. A nonzero bucket 1 or 2 (l… | 2F.6 | E-CENSUS | complete (this slice) | — |
| `2F-OPERATIONS-006` | Permanent documentation reconciled at closeout: STATE.md, CHANGELOG.md, TODO.md (the stal… | 2F.6 | E-DOCS | complete (this slice) | — |

**Totals: 68 requirements, 12 families, 6 slices. 68 delivered; 0 undelivered; 11 carrying a recorded scope note, measurement partial or unmet-by-design tier.** Eleven is the count the generator reports and the basis used in every document: `2F-MEASURE-001`…`-006`, `2F-REVOKE-003`, `2F-REVOKE-004`, `2F-REMINDER-004`, `2F-PRECOND-003`, `2F-OPERATIONS-002`. Within it, one is a measurement partial (`2F-MEASURE-005`) and two are computable-but-unmet evidence tiers by design (`2F-MEASURE-003/004`). An earlier revision counted 3 here and 10 in the matrix, on two different bases and with no reconciliation — the reviewers caught it. `2E-COMMAND-012` is **not** a Phase 2F requirement and is not counted here — it is deferred past this phase by ADR-057.
