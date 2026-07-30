# Technical Changelog

All notable technical changes are recorded here. The format follows Keep a Changelog principles without assigning a public semantic version before the product has a release policy.


## 2026-07-29 — Phase 2F Slice 2F.5: the command-funnel reader and the end-to-end match baseline (no migration)

Implemented on branch `codex/phase-2f-slice-5` under `docs/reports/PHASE_2F_SLICE_05_PRD.md`. **No migration, no RPC, no view, no grant, no policy, no new product event, no allowlist change, no production module change, no UI, no i18n key.** `src/` gained exactly two test files. Remote parity is unchanged at `202607300063`.

- **`scripts/phase-2f-command-funnel.mjs`** (2F-MEASURE-001…006) — owner-scoped, content-free aggregates over the already-emitted `task_command_*` events, plus both ADR-055 tiers and the expiry arithmetic. It lives in plain Node because it has two callers that cannot otherwise share one implementation: the Vitest suite that runs in CI with no network, and the runner that reads the deployed project. The twelve outcome members and the four event names are **read** out of TypeScript through the existing vocabulary parser; origins, apply routes and undo results are **mirrored**, because all three are declared on a single line and the shared parser needs one entry per line — a concession stated with a test that fails if a future edit makes them readable.
- **The gate's arithmetic is exact where it matters.** `windowDays` is a ceiling, so fifty commands spread over a year cannot reach the reader's only authorizing verdict. `no_match` follows ADR-055's *final-outcome* definition through `min(creationOffered, created)`, which keeps the creation rate inside its own denominator and reports out-of-window creations as skew instead of a rate above 100%. Replayed creations are excluded — a double-submit must not move a gate. Both rate gates are decided by integer multiplication against declared fractions, and a zero denominator never satisfies one. The planning tier has **no branch** that returns `met`: `distinctUsers` is out of an owner-scoped reader's range and is reported as `null`, never inferred as one.
- **The reader publishes its own blind spots.** Three allowlisted preview categories are emitted by no deployed code path, so `2F-MEASURE-005`'s unsupported-refusal volume is recorded as **not measurable this phase** rather than satisfied by a structurally-zero counter; one intent emits one to three preview rounds and some emit none, so the counting unit is named `qualifying_preview_round`; the Work direct-action path applies with no preview and has no undo event, so the previewed and applied populations are reported raw rather than subtracted. A CI case reads `actions.ts` and derives the unreachable set from the emitters, so a future emitter fails the build.
- **`scripts/phase-2f-command-funnel-reader.mjs`** — an owner read that writes nothing, and a `--proof` mode that writes disposable fixtures and deletes them. Keyset pagination on `(created_at, id)`, because `created_at` is not unique and `OFFSET` over a non-unique sort key can return a tied row twice or never. Exit-2 conditions are raised as a tagged throw, never a bare `process.exit`, so a mid-run schema-cache miss cannot leave fixtures behind. There is no `--time-zone` override: a gate whose day-bucketing the caller chooses is not a gate.
- **ADR-058** — `is_synthetic` becomes a fourth exclusion mechanism, explicitly classified as **hygiene, not a trust boundary**, because the field is client-supplied through `recordProductInteraction` while the other three are enforced by the database.
- **ADR-059** — the end-to-end baseline runs in an opt-in Vitest lane (`vitest.remote.config.ts`) so it uses the real candidate loader and the real scorer instead of a reimplementation; a case asserts the default config still excludes the pattern, so a future edit that drags credentialed tests into CI fails in CI.
- **ADR-060** — go-live is the Slice 2F.5 merge date, making ADR-055's expiry a git fact a closeout verifier can confirm.
- **Three read-only pgTAP assertions** appended to `supabase/tests/product_events.sql`: the `user_id` foreign key's delete action is `cascade`, the synthetic partial index exists, and `is_synthetic` is non-null. This is where exclusion mechanism (i) stops being prose — `revoke all … from service_role` is real and the remote proof asserts it, so no credential this repository holds can read an event row once its owner is gone.

**The end-to-end match baseline (2F-MEASURE-007), published pinned and scope-labelled.** Eleven scenarios at policy `2026-07-25.3`, measured against the deployed project: one-step **0.455**, needs-deliberateness **0**, confirmation-required **0.091**, ambiguous **0.273**, no-match **0.182**. Phase 2E's retained scoring-layer numbers (0.429 / 0.071 / 0.071 / 0.214 / 0.214 over 14 scenarios) stay beside them, and **cross-scope comparison remains prohibited**: any resemblance is a coincidence of two differently-composed corpora.

**The corpus took two corrections, and both are instructive.** The first attempt was degenerate — every hint missed tiers 0 and 1, `exactTitle` was never exercised, and the destructive and duplicate-title assertions were passing because *nothing matched* rather than for the reasons they claimed. The second: the scenario labelled tier 2 actually reached tier 1, because the ladder's phrase rung accepts any hint of three characters or more appearing as complete words in a title — so the corpus never visited tier 2 at all, while the case meant to guarantee coverage grouped on the hand-written label and passed anyway. `prefilterTier` is now read off the rows the deployed query returned, each annotation is checked against SQL, and a genuine tier-2 scenario was added rather than the claim narrowed: non-contiguous overlap is the rung where a semantic signal would plausibly help, which makes it the one an evidence gate for semantic retrieval should least like to skip.

**Evidence:** lint clean, typecheck clean, 2423/2425 Vitest, build green, `deno check` clean, 46/46 `deno test`; `npm run test:remote:2f:funnel` 32/32 at exit 0 with fixtures proven gone; `npm run test:remote:2f:baseline` 9/9 at exit 0, stable across three independent runs. The two Vitest failures are pre-existing and Windows-only — `sql-reachability.test.ts` searches migration text with `\n`-anchored literals while `core.autocrlf=true` gives the working copy CRLF — proven by reproducing them with every 2F.5 change stashed, and green in CI on Linux at `6628b02`. Recorded in `docs/TODO.md`, not fixed here.

## 2026-07-29 — Phase 2F Slice 2F.4 deployed and accepted

Migration `202607300063` applied to the linked project **18:38:20Z–18:38:28Z** via `npx supabase db push --linked` — exactly one migration, no manual intervention, all nine post-deploy assertion groups held. **Remote parity `202607290062` → `202607300063`.** Merged as PR #28 → `c174f8f`; merge-SHA CI run `30479818771` green on all three jobs.

All sixteen acceptance gates passed. Live posture verified against the deployed project: `authenticated` holds `SELECT` only on `public.tasks` and `SELECT` + `INSERT` on `public.reminders`; `anon` holds nothing; RLS still enabled **and** forced with all 8 policies and 6 triggers intact; `create_due_task_reminder` still SECURITY INVOKER. Direct task INSERT/UPDATE/DELETE and reminder UPDATE/DELETE all return `42501` through PostgREST — **on a stale pre-migration session as well as a fresh one**, closing by measurement the schema-cache residual CI could not reach. 14/14 production-flow checks passed, including the retained Option C reminder INSERT, the cross-owner `23503` proof, read-side RLS in both directions, and the decisive juxtaposition: the same caller that creates a task through the validated contract is refused a direct INSERT. **No rollback was required or executed; the slice has no data residual.** See `docs/reports/PHASE_2F_SLICE_04_ACCEPTANCE.md`.

**Gate 9 required a separate prerequisite fix, and the attribution matters.** Two assertions in `scripts/remote-supabase-smoke.mjs` were written by `5099f81` for a one-event AI-usage fixture and never updated when `6c4a907` (Slice 2E.1) added a second legitimate event — so the script aborted before reaching the downstream checks this slice depends on. **The defect predates Slice 2F.4**, which only made those checks matter for acceptance. Corrected in PR #29 → `ba63204`: one file, every value kept an exact equality, and the ownership check the stale count had rendered permanently unreachable now actually executes. No production source, database object, grant, RLS policy, trigger, RPC or pricing logic changed. `npm run test:remote` then passed exit 0 from merged main content, with zero residue.

## 2026-07-29 — Phase 2F Slice 2F.4: task grant revocation and test-suite semantic migration (one migration, no application source change)

Implemented on branch `codex/phase-2f-slice-4` under `docs/PHASE_2F_PRD.md` Revision 4.2. Exactly one migration; **no file under `src/` changed**, which is itself the verification — since Slice 2F.3 no application module issued the writes this revokes, so what is removed is a permission, not a caller.

- **Migration `202607300063_phase_2f_task_grant_revocation.sql`** (2F-REVOKE-001): `revoke insert, update, delete on public.tasks from authenticated` and `revoke update, delete on public.reminders from authenticated`. Its post-deploy block asserts, fail-closed, all nine required properties — the three task denials, task SELECT retained, the two reminder denials, reminder SELECT and INSERT retained, `anon` empty-handed on both tables, RLS still `enable` **and** `force`, all eight owner-scoped policies present, all six user triggers present, and `create_due_task_reminder` still `security invoker`. No policy, trigger, signature, RPC or row was touched, and no grant widened.
- **The 2F-REMINDER-003 determination is written, and it is a revocation** (owner decision A4, recorded in `SECURITY.md`). Evidence, not judgement: no production module issues a reminder UPDATE or DELETE; every surviving UPDATE runs inside `apply_task_command`, `run_user_heartbeat` or a definer-routed `private.undo_*` handler; and **no `delete` against `public.reminders` exists anywhere in the repository**, so rows go only by cascade. `insert` is retained — the Option C exception is unchanged.
- **13 pgTAP statements dispositioned, not 11.** Slice 2F.3 had added two origin-drift stagings (`creation.sql:1582`, `:1609`) after PRD Revision 4 fixed §9's table at eleven; this slice's pre-code inventory found them and Revision 4.2 records them as rows 12 and 13. **Ten change vehicle to the owning role; three — the reminder INSERTs — stay `authenticated`** and double as living proof the retained grant works. No statement was mechanically re-roled and none deleted: each interference proof keeps its exact behavioural pin, now writer-agnostic in fact rather than only in intent.
- **One claim was retired and inverted rather than reworded** (2F-TESTMIG-002). `apply.sql`'s "a plain client-side task UPDATE still works" is now false by construction; the denial moved to the new `supabase/tests/phase_2f_task_write_grants.sql`, and the property that write was carrying — the audit trigger tolerating an unset `app.audit_actor` — is restaged privileged. Because a `postgres` vehicle proves nothing about production, `phase_2c_slice_5_task_graph.sql` gains the actor-default assertion for a **real** SECURITY DEFINER writer that sets no actor: `confirm_entry_task_candidates_v6`'s parent-link UPDATE (2F-TESTMIG-003).
- **`supabase/tests/phase_2f_task_write_grants.sql`** (27 assertions) proves the catalog posture, the denial behaviourally as the real client role, read-side RLS in both directions, the retained Option C INSERT exercised rather than asserted, and — the part a catalog read cannot give — **non-vacuity**: it re-issues inside its own transaction exactly the grants `202607160003:195`/`202607160007:162` issued, watches the refusals become successes, re-revokes, and watches them refuse again. Section 6 then proves the surviving write shape end to end (2F-REVOKE-002): a caller with no INSERT privilege materializes a task through `confirm_entry_task_candidates_v6`, and the `security invoker` trigger `create_due_task_reminder` still fires inside that definer path.
- **`scripts/phase-2f-regrant-task-write-grants.sql`** — the committed rollback, the exact textual inverse of the two revokes, self-verifying and idempotent. CI's `database` job gains a **re-grant rehearsal** as its last step (2F-REVOKE-003), with three explicit posture boundaries: it fails if the stack is not already post-revocation, it runs its own directory `supabase/regrant-rehearsal/` so the normal suite can never execute under a re-granted posture, and it re-revokes before exiting. **Its scope is stated everywhere it appears** — it proves the SQL applies and restores the versioned chain privileges; it does **not** prove PostgREST schema-cache convergence, in-flight session behaviour, or an operational production rollback.
- **Three remote smokes re-pointed to their service-role clients** (2F-TESTMIG-006). `remote-supabase-smoke.mjs:258` was redesigned rather than re-pointed alone: its task is the subject of the cross-owner `task_projects` composite-FK denial, so the `23503` assertion is preserved intact and the file gains the compensating read-side RLS evidence, asserted in both directions so the isolation half cannot pass vacuously.
- **PRD Revision 4.2** (owner decisions A1–A3) corrects three facts without changing any requirement: §12's privilege provenance — the grants are versioned in the chain, issued dynamically inside `DO` loops, **not** Supabase platform defaults (the original claim survives for `service_role`) — plus §9's row count and five drifted `creation.sql` anchors. The stale `202607170028:33` `audit_logs` claim is corrected at source in `DATABASE.md`/`SECURITY.md` (2F-TESTMIG-007); the migration is not edited, because the chain is append-only, and the `audit_logs` grant is not changed, because it is outside this phase.

## 2026-07-29 — Phase 2F Slice 2F.3: manual task-creation convergence (one migration, deployed)

*Entry added during Slice 2F.4's documentation reconciliation — the slice itself is accepted, merged and deployed, and is not reopened here.* Merged as PR #26 → `48d6a83`, CI run `30467623925` green on all three jobs.

- **Migration `202607290062_phase_2f_creation_origin.sql`** extends `public.create_task_command` with a trailing `p_created_by text default 'agent'` bounded to the column's closed domain, by drop-and-recreate under the same name in one transaction — not a `_v2`, because a trailing defaulted parameter is a compatible extension and a versioned pair would leave two live creation write paths. `private.undo_create_task_command`'s integrity guard widens body-only from `is distinct from 'agent'` to the bounded domain, so a user-created task's undo is functional rather than cosmetic. The same migration admits one bare-creation action, `create_title_only`, whose expected patch-key set is empty — the manual form expresses a title and nothing else, and all seven qualifier-bearing actions require their exact patch key.
- **`createRecord`'s task branch routes through the creation family** and its direct INSERT is deleted, taking the architecture gate's `tasks` allowlist to **empty**.
- **Deployed 2026-07-29**, moving remote parity `202607280061` → `202607290062`. All 21 deployment-session gates executed and passed, including manual creation through the rendered form persisting `created_by = 'user'` with audit actor `'user'`, an executed undo of a user-origin task, the two-owner creation probe, replay idempotency, and zero fixture residue. See `docs/reports/PHASE_2F_SLICE_03_ACCEPTANCE.md`.

## 2026-07-29 — Phase 2F Slice 2F.2: Work-surface mutation convergence (code only, no migration)

Implemented on branch `codex/phase-2f-slice-2` under `docs/PHASE_2F_PRD.md` Revision 4. **No SQL, no migration, no grant change, no new RPC, no change to `list_task_command_candidates`** — Gate 3 proved none was needed. Single revert boundary.

- **The four Work buttons route through `public.apply_task_command`** (2F-SURFACE-001). `src/features/task-commands/work-command.ts` is the whole mechanism: map the Work verb to its taxonomy action, build the command through `validateTaskCommand`, resolve through `loadTaskCandidates` with the rendered title as the query hint, select the row **by clicked id out of the whole result**, project the nineteen-key pre-state, derive the canonical patch, and hand the five bound values to the shared `buildApplyPayload`. One read, one row, one database-derived `observed_before`.
- **`persistTaskStatus` and `updateTaskStatus` are deleted** (2F-SURFACE-012/013), and with them the eight-status `statusSchema` that made the Work surface an unconfirmed route to `cancelled`. The destination is now the taxonomy's, bounded by `set_status`'s `allowedTargetValues`. `direct-write-guard.test.ts`'s `tasks` allowlist drops to the single `createRecord` insert; the gate compares by exact equality, so the entry could not be left behind.
- **Refusals are rendered, not swallowed** (2F-SURFACE-005/011). A clicked id absent from the resolution result, or a row that no longer admits the action, produces a localized state with a keyboard-reachable refresh affordance — and **makes no write at all**. Nothing throws out of the Server Action; known precondition faults resolve to an honest failed state and unknown ones are re-thrown.
- **`task-list.tsx` is a Client Component** with `useActionState` (2F-SURFACE-010). The no-JS submit path is intentionally lost and recorded. The operation key is minted once per mount into a ref, scoped per `(row, action)`, set on the FormData at submit time, **never rendered into markup** (a client-minted hidden input would hydration-mismatch), and rotated after every terminal outcome — stricter than `quick-capture-form.tsx`, which rotates only on success.
- **Reminder consequences, both directions** (2F-SURFACE-008): completion cancels the task's scheduled reminders — a real, disclosed behaviour change, since the deleted writer cancelled nothing — and `wait_task`/`resume_task` leave every reminder untouched.
- **Analytics reuse the existing vocabulary and require no migration** (2F-ANALYTICS-001/002): `task_command_applied` with `commandOrigin: 'work'`, already constrained to `array['chat','work']` at `202607280061:434`, on surface `task_command` (the event family; the property names the mount); `task_status_changed` unchanged in shape, emitted only when the status actually moved, with `fromStatus` from the click-time pre-state and `toStatus` from the canonical patch.
- **Three Phase 2E modules were widened, not duplicated:** `toTaskPreState` lifted out of `scoreRow` (one nineteen-key projection), `buildCanonicalPatch` exported (one patch builder), and `TaskCommandApplyInput.preview` narrowed to a structural `source` (`TaskCommandPreview` satisfies it, so the chat path is behaviourally unchanged). Two projections of a count-exact contract, or two builders of a hashed patch, is how one of them silently stops matching.
- **New tests:** `work-command.test.ts` (the resolution mechanism against injected clients, including the nineteen keys read out of the migration guard), `task-list.test.tsx` (keyboard, focus, live region, refresh affordance, the full key lifecycle, eligibility→rendering), a rewritten `operations/actions.test.ts`, four new assertions in the preserved Gate 3 static suite, and `e2e/work-actions.spec.ts` (credential-gated, deployment session).

## 2026-07-29 — Phase 2F Slice 2F.1: guardrails, decisions and preconditions (no migration, no behaviour change)

Implemented on branch `codex/phase-2f-slice-1` under the approved `docs/PHASE_2F_PRD.md` Revision 4. Tests and documents only — nothing deployed, no production behaviour touched.

- **`src/lib/supabase/sql-grammar-guard.test.ts`** (2F-GUARD-001) — scans every migration for the two plpgsql grammar traps that each cost a CI round trip in Phase 2E: schema-qualified `coalesce`/`nullif`/`greatest`/`least` (no `pg_proc` entry, unresolvable under `search_path = ''`) and a depth-zero `case` inside an `if` condition (`42601`, the migration does not apply). Comments and string literals are stripped first, because the chain legitimately names both patterns in post-deploy guards and prose. The two superseded historical `pg_catalog.greatest(` sites (`202607220041:1524`, `202607220044:1506`) are allowlisted by exact equality, so a third occurrence fails and so does allowlist rot. **Proven red-first:** a deliberately defective fixture migration made both chain assertions fail, naming the fixture, before it was deleted.
- **`src/lib/supabase/direct-write-guard.test.ts`** (2F-GUARD-002/003) — the architecture regression gate: walks every non-test module under `src/`, extracts each PostgREST chain from `.from("tasks"|"reminders")` into a DML method, and requires the found writers to equal the allowlists exactly — tasks: `createRecord` insert (leaves in 2F.3) and `persistTaskStatus` update (leaves in 2F.2), empty at 2F.4; reminders: `createReminder` insert, the permanent Option C exception (PRD §2 item 6). **Proven red-first:** a fixture module adding a `tasks` delete and a `reminders` update failed both assertions before removal.
- **`supabase/tests/phase_2f_effective_limit.sql`** (2F-PRECOND-002) — pins the `list_task_command_candidates` row-count laws 2F.2's click-time resolution depends on: truncation returns exactly `effective_limit + 1` rows (the overflow probe is part of the result), a population equal to the limit returns no phantom row, a negative limit clamps up to one, and `effective_limit` is a query-scalar. The clamp bounds (0→1, 101→100, null→25) were already pinned in `phase_2e_task_command_matching.sql:424-443` and are not restated. Executes in CI's `database` job.
- **ADR-054–057** — activity remains a task (reopening condition: real-usage evidence); the two-tier semantic-retrieval evidence standard (spike tier 50/10/14 authorizing only an offline replay spike; planning tier 150/20/30/≥2 users; `no_match` = `still_unmatched` ∪ `creation_offered`; five permanently non-authorizing metrics; 90-day expiry with a dated `TODO.md` entry); phase-letter reconciliation (`PHASE_2_PLAN.md` §2F and `TODO.md` line 28 re-pointed at the PRD, displaced scope preserved as unscheduled future work); provenance deferred past Phase 2F behind the executed-dry-run reopening gate (supplements ADR-053).
- **The pre-code gate package is tracked** (2F-PRECOND-001): `scripts/phase-2f-writer-inventory.mjs`, `scripts/phase-2f-reminder-census.mjs`, `scripts/phase-2f-gate3-exact-title-reuse.mjs`, `scripts/phase-2f-gate1-record-ai-usage-dry-run.sql` (unrun by design; refuses non-disposable databases), both gate reports, the adversarial reviews, the proposal, the approved PRD, and `src/features/task-commands/work-surface-reuse.test.ts` — which now runs in every CI `app` job.

## 2026-07-28 — Phase 2E deployed, validated and released (`phase-2e-complete`)

**The Phase 2E migration chain is applied to the linked project and remote parity is `202607280061`.** All seven migrations applied in order on the first attempt, every post-deploy `DO` block held, and **no rollback was required**. Deployment order was migrations only — `process-jobs` v15 and `heartbeat` v4 are untouched by this phase.

**121 of 122 requirements are delivered.** The three that Phase 2E closed as blocked on deployment authorization — `2E-OPERATIONS-003`, `2E-OPERATIONS-004` and `2E-OWNERSHIP-004`'s remote half — are now delivered and proven remotely. **`2E-COMMAND-012` is the only requirement Phase 2E did not deliver**, reclassified to Phase 2F by recorded decision (ADR-053, PRD revision 4), with its residual risk unchanged: attribution requires joining `ai_usage_events.created_at` to the deploy history rather than reading a column.

Release gates, all executed against the deployed project:

- `npm run test:remote:2e` — **23 assertions, exit 0.** Ownership isolation, cross-owner non-disclosure, anon denial, stable ordering, the `limit + 1` overflow probe, three injection-shaped title patterns, apply, exact replay, fingerprint-mismatch refusal, `55P03` staleness, unconfirmed-cancel refusal, confirmation issuance, the confirmed cancel, restore reachability, undo, undo replay, creation preview, creation replay and actor provenance.
- `npm run test:remote:2e:cleanup` — **exit 0**, `tablesNotYetDeployed: []`, zero orphans, zero remote-smoke storage objects.
- `npm run test:remote:product-events` — **exit 0**, 26 taxonomy events across all nine controls including `privacy`.
- Phase 2E authenticated online journeys — **12/12** on desktop and mobile, pt-BR and English.

**Deployment exposed eight defects in three validation scripts, and not one was a fault in the deployed system** (PR #20, merge commit `0efcd82`). Seven were the same mistake: tooling that restated a contract instead of reading it. `remote-phase-2e-smoke.mjs` sent an empty patch where the canonical patch must carry the destination status, read `.status` where the RPC returns `.outcome`, passed `p_operation_id` where the parameter is `p_undo_id`, and used `create_task` where the creation family's action is the qualifier the unmatched command carried. **One of its assertions had been passing while testing nothing** — `undefined !== "undone"` is permanently true. `verify-phase-2e-cleanup.mjs` read a `42501` on `task_command_confirmations` as a fault when it is the designed posture; that exception is now written as an assertion, so a *successful* read fails the check as a widened grant. `remote-product-events-smoke.mjs` failed its own free-content assertion because a declared evidence label is named `normalized_exact_title`; the substring match is replaced by a shape test that also catches the leaks the old form missed.

All three scripts had never executed against a deployed database — the smoke had only ever run its own preflight, and the verifier had only ever taken its absent-table branch. `PHASE_2E_SLICE_08_REPORT.md` §4.2 had already named this failure mode after finding one instance at closeout: *"A verifier that has never run is a claim, not a gate."* Deployment found three more. No migration, RPC, deployed privilege or production contract was changed to fix them.

**Known non-blocking issue, recorded rather than smoothed over.** `e2e/intelligent-capture.spec.ts` — the intelligent-capture journey, which predates Phase 2E — does not pass deterministically online. Its assertions wait on UI that renders only if a live OpenAI interpretation produced particular output, so it is non-reproducible by construction: the failing set moved on every run (10 failed parallel, then 9 with a different set, then 1 serially with a third). It is **not a Phase 2E regression** — failures occur upstream of every Phase 2E mutation, `editable-candidate-confirmation.spec.ts` passes 4/4 in isolation while exercising the one Phase 2C undo handler `202607260059` re-declared, and no failed or stuck jobs exist remotely. No pre-deployment baseline exists because the suite is manual and CI has never run it. Tracked in issue #21.

## 2026-07-28 — Phase 2E merged to `main` (PR #18, merge commit `5d22400`)

**Phase 2E — Natural-Language Task Updates is merged and is not deployed.** PR #18 landed on `main` as a **merge commit**, matching PRs #15, #16 and #17, with parents `2e2acfd` (the phase base) and `96cf178` (the branch HEAD). A squash was considered and rejected: the 64 commit messages carry the phase's reasoning, including the refutations, ADR-048's withdrawn second half, and the defects CI found that no local gate could reproduce.

All three CI jobs were green on the **exact merge SHA** `96cf178` (run `30383879590`) — not on an ancestor, which `PHASE_2E_FINAL_REPORT.md` §12 requires by name.

The merge landed 125 files, +46,465/−64: seven additive migrations (`202607250055`–`202607280061`), fifteen ADRs (ADR-039 … ADR-053), 25 modules and 26 colocated test files under `src/features/task-commands/`, 6 new pgTAP files, one credential-free Playwright spec now gating CI, and five new scripts.

**Nothing else changed.** No deployment, no tag, no release. Remote migration parity stays at `202607250054`, so every Phase 2E RPC remains unreachable online and the command console has no live path to a database that knows what it is asking for. The three requirements blocked on deployment (`2E-OPERATIONS-003`, `2E-OPERATIONS-004`, `2E-OWNERSHIP-004`'s remote half) are still blocked, and `2E-COMMAND-012` is still Phase 2F's. **Merging changed no running system; deploying will.**

Two documentation commits were made during merge preparation and are part of the merge. `aee9c84` reconciled `PHASE_2E_PROGRESS.md`'s repository-state table against `git rev-parse` and retired two sentences that had gone false — `TODO.md`'s "Slice 2E.8 has not started" and `STATE.md`'s "will not be merged until Slice 2E.8". `96cf178` corrected the one scale figure in the final report that was counted wrong: it claimed 30 modules under `src/features/task-commands/` where `git ls-tree` reports 25 modules and 26 tests, and it ran this branch's 10,076 lines of SQL together with the pre-2E trio PR #17 had already merged. Both corrections are annotated in place rather than substituted silently.

## 2026-07-28 — Phase 2E Slice 2E.8: convergence and closeout (branch `codex/phase-2e-natural-language-task-updates`)

Epic 2E-H, and the last slice of Phase 2E. **No product behaviour changes and no migration is added** — its database footprint is zero, which is why the pgTAP count is expected to hold at `Files=30, Tests=1277`. Normative contract: `docs/PHASE_2E_PRD.md` §9 (Epic 2E-H), §13.14, §19.1, §19.3. See `docs/reports/PHASE_2E_FINAL_REPORT.md` and `docs/reports/PHASE_2E_SLICE_08_REPORT.md`.

### Added

- **`scripts/generate-phase-2e-traceability.mjs` and `docs/reports/PHASE_2E_TRACEABILITY_MATRIX.md`** — 135 mapped rows: 122 requirement IDs across 16 families, 8 epic acceptance criteria, 5 global gates. **Phase 2E closes with 118 of 122 delivered and 4 not** — `2E-COMMAND-012` reclassified to Phase 2F, and `2E-OPERATIONS-003`/`2E-OPERATIONS-004`/`2E-OWNERSHIP-004`'s remote half blocked on deployment authorization. `2E-MATCH-018` is counted as delivered and carries a scope note, because its own text is satisfied. The generator fails closed on any inventory drift, and that was **tested rather than asserted**: four tamper runs (drop a requirement, add one to a family, introduce a new family, remove an epic bullet) all threw, with the PRD byte-identical afterwards. Phase 2E is the first phase whose families carry digits (`2E-I18N`, `2E-A11Y`), so the family regex is `[A-Z0-9]+` — a letters-only class silently drops seven requirements and still emits a well-formed matrix, which is why the expected total is 122 and not 115.
- **`scripts/verify-phase-2e-cleanup.mjs`** — residual-data check over 18 owned tables, adding `task_command_confirmations`, `reminders`, `undo_operations` and `ai_usage_events` to the inherited set. Passes against the live linked project.
- **`scripts/remote-phase-2e-smoke.mjs`** — the aggregate two-owner remote smoke (2E-OPERATIONS-003/004). Drain-safe by construction: it creates **no entries**, so no `interpret_entry` job is enqueued and the per-minute `pg_cron`/`pg_net` drain has nothing to race. Its preflight runs today and exits **2** with `BLOCKED ON DEPLOYMENT`, deliberately distinct from an assertion failure (exit 1).
- **npm scripts** `docs:phase-2e:traceability`, `test:remote:2e`, `test:remote:2e:cleanup`.
- **`src/features/task-commands/vocabulary.ts` — `canonicalVocabularyEntries()`**, emitting the bilingual term tables as sorted `["kind", "term", "literal"]` triples for digesting. Sorted by plain code-unit comparison, **not** `localeCompare`: a digest pinned in a test must not move when the runtime's ICU data does.

### Fixed

- **The bilingual vocabulary was outside the versioning regime, and the test that claimed to guard it guarded something else.** `policy-lock.test.ts`'s *"pins the status and priority vocabularies to the same version"* digested `TASK_STATUSES` and `TASK_PRIORITIES` — the closed database literals, which `vocabulary.ts` cannot change — while the 61 term mappings it does own were digested by nothing. Re-pointing `bloqueada` from `blocked` to `deferred` would move a user's task to a state they never named with the entire suite green. The term tables are now digested under `TASK_VOCABULARY_VERSION`, which is asserted equal to `TASK_COMMAND_POLICY_VERSION`; the misnamed case is renamed to what it pins.
- **`TASK_VOCABULARY_VERSION` was orphaned** — read by nothing, and therefore already stale at `2026-07-25.1` while `TASK_COMMAND_POLICY_VERSION` was at `.2`, in direct contradiction of its own docstring. Bumped to `.2` and now enforced by test, as PRD §10.4 requires.
- **`vocabularyCoversEveryLiteral()` was exported and never called**, duplicating two assertions in the same test file. It is now called, so the duplication retires rather than the guard.
- **`verify-phase-2e-cleanup.mjs` detected an absent table by the wrong error code.** It tested for SQLSTATE `42P01`; PostgREST answers from its schema cache and never reaches Postgres for an unknown relation, so it returns `PGRST205`. The verifier died on the first Phase 2E table — the exact failure its own branch existed to prevent — and was found only because the script was executed rather than shipped read-only.

### Changed

- **`docs/PHASE_2E_PRD.md` revision 4** makes two corrections, both of them admissions rather than redefinitions. (1) **`2E-COMMAND-012` is reclassified to Phase 2F and is not delivered by Phase 2E.** Recording prompt and strategy versions on the operation requires changing the argument list of `apply_task_command`, `create_task_command` or `record_ai_usage` — impossible by `create or replace`, since a different argument list is a different function in PostgreSQL and the surviving overload makes every existing call ambiguous. Each needs `drop function` plus a full re-declaration: ~1,460 lines for `apply_task_command`, and `record_ai_usage` is shared by every AI path in the product and pinned by two `::regprocedure` casts and a `has_function` type array across two pgTAP files, hand-written types and the Deno worker. Residual risk: attribution now requires joining `ai_usage_events.created_at` to the deploy history. (2) **Revision 2's promise that nineteen refuted PRD-round findings would be recorded at closeout is withdrawn as unkeepable** — they were never persisted to the repository and reconstructing them would be fabrication.

## 2026-07-28 — Phase 2E Slice 2E.7: conversational and task-surface integration (branch `codex/phase-2e-natural-language-task-updates`)

Epic 2E-G. **The phase gets its first user-visible behaviour.** Slices 2E.1–2E.6 built the schema, the matcher, the preview, the mutation RPC, the confirmation ledger and the creation RPC, and left every one of them without a production caller. This slice is that caller. Migration `202607280061` is **local only**; remote parity stays at `202607250054`. Normative contract: `docs/PHASE_2E_PRD.md` §13.12, §13.13, §12.1–12.7, §19.1 (Epic 2E-G). See ADR-050, ADR-051, ADR-052 and `docs/reports/PHASE_2E_SLICE_07_REPORT.md`.

### Added

- **`src/features/task-commands/session.ts`** — the command envelope, and the reason the whole flow is deterministic. It carries the model's normalized proposal plus the instant the session was issued at; every step re-runs `validateTaskCommand`, `loadTaskCandidates` and `rankTaskCandidates` against **that** instant, so all of them recompute the identical command, the identical `observed_before` and therefore the identical fingerprint. It also carries the explicit selection and the staleness witness `{taskId, updatedAt}` from the preview that was actually rendered. Parsed by a Zod schema with a version literal, because it round-trips through the browser. See ADR-050.
- **`src/features/task-commands/actions.ts`** — eight Server Actions (start, select, apply, confirm, clarify, create, undo, restore) behind one `runTaskCommand` dispatcher that validates a closed intent list. `useActionState` binds one action to one state, and this flow is one conversation with several steps.
- **`src/features/task-commands/console-state.ts`** — the state contract, separate because a `"use server"` module may export **only** async functions. The production build caught this; lint and typecheck did not.
- **`src/features/task-commands/analytics.ts`** — the score/margin band mapper and four content-free payload builders. Band boundaries are arithmetic over `TASK_MATCH_THRESHOLDS` rather than a fourth magic number, so re-tuning the policy moves the bands with it. `match-policy.ts:183-191` had deliberately deferred these until a caller existed; this is that caller.
- **`src/features/task-commands/command-console.tsx`, `confirm-dialog.tsx`, `cancelled-tasks-view.tsx`** — the surface. The confirmation dialog is a hand-rolled `role="dialog" aria-modal="true"`: jsdom 29.1.1 has no `showModal`/`show`/`close`, verified by execution, and Vitest with jsdom is the only accessibility gate CI runs. Focus management, a Tab cycle and Escape-restores-focus are implemented and each has a test.
- **`src/features/task-commands/undo-listing.ts`** — the task-scoped undo projection (2E-UNDO-005). Reading the row before calling the router is also how 2E-UNDO-007's "expired" and "no longer available" become distinct localized outcomes **without widening the SQL error vocabulary**: `public.undo_operation` reports both as `P0001` with message text and no detail token, and this repository's mapper keys on the token and never on the message.
- **`src/features/task-commands/recovery.ts`** and **`/app/work/cancelled`** — the cancelled-task recovery surface (2E-DESTRUCTIVE-006). It lists through `list_task_command_candidates` rather than querying `public.tasks`, because that RPC is where 2E-DESTRUCTIVE-009's creation-undone predicate lives; a direct read would be a second, weaker door.
- **Migration `202607280061`** — the `task_command` surface and four event names (`task_command_previewed`, `task_command_disambiguated`, `task_command_applied`, `task_command_undone`) added to the table CHECKs and to both guards inside `private.record_product_event`, in the same change as the first emitting code (2E-ANALYTICS-005). Three new property validators: a real JSON boolean, a bounded enum **set** with no repeats, and the policy version as a shape rather than as today's literal. Both private functions are re-declared in full from their current bodies, verified by `diff` against `202607230050`.
- **`scripts/product-event-vocabulary.mjs`** — the reader the remote smoke uses instead of restating the taxonomy (2E-ANALYTICS-006), held to the real imported constants by a Vitest case. See ADR-052.
- **`e2e/task-command.spec.ts`**, named in `ci.yml` beside `foundation.spec.ts` — credential-free, so it actually gates: the new nested route joins the auth boundary and the locale-redirect contract on desktop and mobile.

### Changed

- **`src/features/product-analytics/contracts.ts`** — `productSurfaces` 9 → 10, `productEventNames` 22 → 26, with typed properties and runtime validators for the four. Phase 2E's vocabularies arrive as **types** and their literals are restated, so the command taxonomy does not follow this module into the client bundle; `contracts.test.ts` holds every restated list to its declaring module by exact equality, because a type catches a wrong value and not a missing one.
- **`scripts/remote-product-events-smoke.mjs`** — reads the vocabulary rather than restating it. Making it authoritative immediately exposed that its event matrix had never exercised `question_resolved`, `question_effect_previewed` or `question_reinterpret_applied`; all three are now covered.
- **`src/features/task-commands/copy.ts`** — six new sections. Four are vocabulary-backed and registered in `copy.test.ts`'s exhaustiveness gate (`unsupportedReasons`, `validation`, `provider`, `undoStates`); two are the console's and the recovery surface's own chrome.
- **`src/features/task-commands/outcomes.ts`** — `TASK_COMMAND_UNDO_STATES` declared here rather than beside the projection that computes it, because `undo-listing.ts` is `server-only` and `copy.ts` is bundled for the client.
- **`src/features/daily-cycle/work-view.tsx`** — mounts the console and renders the recovery link. The link is here rather than in the navigation because `capabilities.ts`'s `nested: true` drives active-state highlighting only; links render from `primaryNavigationKeys`/`moreNavigationGroups`, so a nested route with none of its own is reachable only by typing the URL.
- **Both chat pages** mount the console. `sendChatMessage` ends in `redirect()` to `chat/[conversationId]`, so mounting only on the list page would break Epic 2E-G's "behaves identically" the moment a user sent one message.
- **`src/features/daily-cycle/architecture.test.ts`** — three new surfaces under the same boundary, including a regex against locale ternaries in components (2E-I18N-001).

### Fixed

- **The dialog focus trap selected unfocusable elements.** `input:not([disabled])` matches `type="hidden"`, and every form in the dialog carries hidden locale, origin and session fields — so "the first focusable element" resolved to a hidden input, `.focus()` was a silent no-op, and the dialog opened with focus still on the page behind it. The Tab cycle failed identically. Found by the tests written for 2E-A11Y-002/004, not by review.
- **The result region had no role.** A bare `div` with an `aria-label` has no implicit role, so its name was announced only if focus happened to land there. It is now an explicit named `region`, which also makes it reachable by landmark navigation.


## 2026-07-27 — Phase 2E Slice 2E.6: no-match activity creation (branch `codex/phase-2e-natural-language-task-updates`)

Epic 2E-F. **Recorded late.** Slice 2E.6 was accepted on 2026-07-27 in commit `291cc75`, which touched only `PHASE_2E_PROGRESS.md` and that slice's report — so this entry, and the `STATE.md`/`TODO.md` entries beside it, are Slice 2E.7's documentation catch-up rather than same-commit records. The gap is stated rather than backdated. Migration `202607270060` is **local only**; remote parity stays at `202607250054`. Normative contract: `docs/PHASE_2E_PRD.md` §13.7, §12.4, §12.5, §19.1 (Epic 2E-F). See `docs/reports/PHASE_2E_SLICE_06_REPORT.md`.

### Added

- **Migration `202607270060`** — the canonical creation payload, owned relation resolution, and three RPCs: `preview_task_command_creation`, `issue_task_command_creation_confirmation` and `create_task_command`, sharing the mutation contract's operation-key, fingerprint, audit and undo-registry primitives (2E-NOMATCH-004). A compensating `undo_create_task_command` handler cancels the exact created task and its still-live reminder after verifying recorded scalar and relation state, and the shared creation-family guards prevent later resurrection. Created rows carry `created_by = 'agent'`, `status = 'inbox'` and null `source_entry_id`/`source_interpretation_id`/`candidate_index`, so an activity is distinguishable from a user-confirmed candidate by actor and action type (2E-NOMATCH-007).
- **`supabase/tests/phase_2e_task_command_creation.sql`** — `plan(127)`.
- **`src/features/task-commands/creation.ts`** — the capability-bound one-clarification continuation and its terminal outcome. Its result type has no `clarification_requested` member, so the bounded slot of 2E-NOMATCH-008 cannot be spent twice by supplying a fresh boolean.
- **`creation-migration.test.ts`** — executable parser/AST gates over the shipped helper, the final `DO` block and the undo handler.
- **`scripts/local-task-command-creation-race.mjs`** — a real two-session same-key PostgREST proof plus an evidence self-test, run by the CI database job after migrations, pgTAP and database lint.

### Notes

- The existing task-insert trigger remains the only due-reminder creator. Exact replay returns the original identities, including after undo, and never recreates or restores the task (2E-NOMATCH-006).
- **Still no UI, route, Server Action, product event or model call** at the time of acceptance; the consumer is Slice 2E.7.


## 2026-07-27 — Phase 2E Slice 2E.5: destructive actions and confirmation (branch `codex/phase-2e-natural-language-task-updates`)

Epic 2E-E. **All fifteen actions of PRD §11.2 are now enabled on one RPC.** `cancel_task` is gated on a server-issued, single-use confirmation the database enforces; `restore_task` is gated on two collision guards. **Still no UI, route, Server Action, product event or model call** — nothing calls either RPC; the consumer is Slice 2E.7. Migration `202607260059` is **local only**; remote parity stays at `202607250054`. Normative contract: `docs/PHASE_2E_PRD.md` §13.6, §11.2, §11.3, §12.3, §19.1 (Epic 2E-E). See ADR-047, ADR-048, ADR-049 and `docs/reports/PHASE_2E_SLICE_05_REPORT.md`.

### Added

- **`public.task_command_confirmations`** (`2E-DESTRUCTIVE-002`). Owner-scoped with a composite owner FK, forced RLS, and a `select`-only grant to `authenticated`. **No role may INSERT, UPDATE or DELETE it, including `service_role`** — both writers are `SECURITY DEFINER` functions — so "server-issued" and "single-use" are properties of the grants rather than of the two functions that respect them. Its `id` **is** the token; a `status`/`consumed_at` equivalence CHECK makes a half-consumed row unrepresentable.
- **`public.issue_task_command_confirmation`** — the same seven arguments as `apply_task_command`, in the same order, because the binding must be *derived* rather than asserted: it computes the digest itself through `public.task_command_fingerprint`. Idempotent on `(user_id, operation_key)`; a different payload under the same key is `2E_IDEMPOTENCY_MISMATCH`, never a silent re-bind, which is 2E-DESTRUCTIVE-003.
- **`private.task_creation_undone`** — one definition, read by all three doors (`restore_task`, the cancel-undo, and the candidate listing), because §13.6 requires "the same guard" and a predicate copied three times is three predicates.
- **`supabase/tests/phase_2e_task_command_destructive.sql`** — `plan(91)`. Both orderings of the creation-undo collision as **real sequences** through `public.undo_operation`, not hand-placed `undone` rows; single use provoked from a fixture no client role could write; a positive control beside every refusal, because a guard wired to `true` passes every refusal test in the file.
- **`src/features/task-commands/confirmation.ts`** — the issuance wrapper. It builds its payload with `buildApplyPayload`, the same function the apply uses, so the two calls cannot send different values; there is deliberately no way to pass a token to `applyTaskCommand`.

### Changed

- **`public.apply_task_command`, by `create or replace` with the same seven arguments** (ADR-047). Adding an eighth would create a second function beside the first, which 2E-UPDATE-001 forbids — so the apply resolves the confirmation by `(auth.uid(), btrim(p_operation_key))` and consumes it with one guarded UPDATE whose predicates *are* the three bindings. That UPDATE sits **after** the replay branch, so an exact resubmission returns the original outcome and consumes nothing, and **inside** the mutating transaction, so any later raise rolls the consumption back and a lost race does not cost the user a deliberate act.
- **Five hand-copied `p_action in (...)` predicates became one `status_writing_actions` constant.** Enabling two actions required all five to agree, and two fail silently: missing the domain-write list sends `cancel_task` into the relation-insert branch, and missing the recorded-`applied_state` list makes the ten-column undo guard refuse every cancel-undo forever.
- **`private.undo_apply_task_command_fields`** gains both collision guards and an `action` term in its evidence gate. The creation-undo guard is scoped to a recorded `cancel_task` because that is the only field-undo that can pass the ten-column guard on a creation-undone task — an argument about the other fourteen actions, which pgTAP proves with a rename rather than asserting.
- **`private.undo_confirm_entry_tasks` sets `app.audit_actor` to `'system'`** (`2E-DESTRUCTIVE-007`). It compensates a creation by cancelling and never set the actor, so the co-firing trigger recorded a system-executed write as `actor = 'user'` — the third cancellation route, and the one that made the requirement false. One line, the same ADR-046 mechanism, no second one. `audit_logs.actor` is rendered in exactly one place and branched on nowhere, so the blast radius is a more truthful word in the change history.
- **`public.list_task_command_candidates`** — a body-only `create or replace` adding one predicate that excludes creation-undone tasks. A **dedicated recovery-listing RPC was written and deleted**: this function called with `array['cancelled']` and no hints already *is* the owner-scoped cancelled-task listing, and a parallel one would have left this one free to rank a deleted task for `restore_task`, so the matching path would keep offering a task the RPC refuses. Its result columns and argument list are untouched, which is what `42P13` exhaustion requires of that function in particular.
- **`errors.ts` / `copy.ts`** — the declared vocabulary goes 9 → 10 tokens. `2E_ACTION_NOT_ENABLED` is **retired** (ADR-049): with all fifteen actions resolved from the taxonomy nothing can raise it, and this phase treats an unprovokable member of a closed vocabulary as a missing raise. A post-deploy grep over every shipped body enforces the retirement.
- **`apply.ts`** — the `55P03` branch reads the DETAIL before falling back to `stale_pre_state`. One of the new tokens pairs with that SQLSTATE, which PRD 2E-DESTRUCTIVE-008 names by hand; matching on the code alone would have degraded "that task was deleted" into "the task changed since the preview" and invited a retry that can never succeed.
- **`preview.ts`** — 2E-DESTRUCTIVE-005's fourth disclosure, `restorable_after_undo_window`. The requirement lists four things and Slice 2E.4 shipped three; three of four satisfies every containment assertion that could be written about it, so the test now pins the exact ordered list.
- **`taxonomy.ts`** — a comment this slice wrongly "corrected" is restored, with the misreading recorded where it happened. It says re-confirmation of a cancelled task's candidate is gated by the resolution ledger, and that is **true**: `record_entry_task_candidate_confirmation` writes the `'confirmed'` row `confirm_entry_task_candidates_v6` does not, and it survives the cancellation.
- **Six test files re-pointed from the superseded migrations to `202607260059`.** `create or replace` in an append-only chain silently invalidates every text-grep assertion aimed at the old file, in both directions: red for something correctly removed, green for a subject that no longer exists.

### Fixed

- **A post-deploy guard that would have failed its own deployment.** It grepped the apply body for `and confirmation_row.status = 'issued'` while the UPDATE aliases the table as `confirmation`. Found by reading all twenty-four grep literals back against the bodies they target, before pushing.
- **Two pgTAP fixture defects CI found.** `tasks_candidate_provenance` refuses an *active* task whose `candidate_index` is not less than `jsonb_array_length(task_candidates)`, and the fixture interpretation used that column's default of `[]`; a cancelled row is exempt, which is why only one row tripped. And the instant helper rendered offsets with `to_char(..., 'OF')`, which emits `+00` where the RPC's observed-before regex requires `+00:00` or `Z` — so twenty-two assertions failed before reaching the gate under test. Every RPC call in that file now goes through a helper that catches, because a direct call aborts the transaction and turns one refusal into "Bad plan".

### Withdrawn before acceptance

- **`2E_CANDIDATE_REMATERIALIZED`, `private.task_candidate_slot_taken`, both collision guards, both `unique_violation` traps, and the pgTAP section that exercised them.** The slice briefly claimed a *second* collision: that `202607220040` made candidate identity unique only over non-cancelled rows and `confirm_entry_task_candidates_v6` writes no ledger row for a confirmed candidate, so cancelling frees the candidate slot and a re-confirmed duplicate makes the later restore a bare `23505`. The second half is true of the RPC and **false of the system** — `public.record_entry_task_candidate_confirmation` (`202607220041:299-364`) is an `after insert or update` trigger on `public.tasks` that writes exactly that row, which is why v6 does not; it survives the cancellation and `2C_TERMINAL_DISPOSITION` reads it, so the duplicate cannot be created. The one path that frees the slot is a creation-undo, already refused earlier by `2E_CREATION_UNDONE`. A five-lens adversarial review of the shipped code found it, four lenses independently. Removed rather than kept as defence in depth, per ADR-049 — the doctrine this same slice wrote. In its place both the migration and the suite assert that the trigger still exists, since it is now the load-bearing reason no guard is needed. See ADR-048's withdrawal note.
## 2026-07-26 — Phase 2E Slice 2E.4: reversible non-destructive updates (branch `codex/phase-2e-natural-language-task-updates`)

Epic 2E-D. **The first RPC in this codebase that mutates an existing task.** Thirteen of the fifteen actions are enabled; `cancel_task` and `restore_task` are refused with the declared code `2E_ACTION_NOT_ENABLED` (Slice 2E.5). **Still no UI, route, Server Action, product event or model call** — nothing calls the RPC; its consumer is Slice 2E.7. Migration `202607260058` is **local only**; remote parity stays at `202607250054`. All three CI jobs green on `bfa28a1` (run `30227374101`), pgTAP `Files=28, Tests=1059, Result: PASS`. Normative contract: `docs/PHASE_2E_PRD.md` §13.5, §13.8–§13.11, §11.2, §11.3, §19.1 (Epic 2E-D). See ADR-044, ADR-045, ADR-046 and `docs/reports/PHASE_2E_SLICE_04_REPORT.md`. **Acceptance is pending one owed review round** — see that report's §9.3 and §11.

### Added

- **Migration `202607260058` — `public.apply_task_command`** (`2E-UPDATE-001..018`). Seven arguments, none defaulted, `returns jsonb`, `security definer`, `set search_path = ''`, granted to `authenticated` only. The write order is the one `confirm_entry_task_candidates_v6` established and is not negotiable: all pure validation and both ownership probes, then the `undo_operations` reservation as the **first** write, then the replay branch which returns **before** any task lock is taken, then the `for update` lock, the typed staleness gate, the eligibility gate, the domain write, reminder reconciliation, the mandatory patch of `before_state`/`after_state`, and the audit row last. Staleness is a typed twelve-column `is distinct from` comparison raising `55P03` with **no detail** — the house convention, because `src/features/agent/actions.ts` branches on the SQLSTATE alone. Relation arrays and reminder state are deliberately excluded from it. Every guarded cast keeps a malformed claim as a bare `22023` rather than letting `22P02` escape to a client whose mapper has no case for it.
- **Two private undo handlers**, `private.undo_apply_task_command_fields` and `private.undo_apply_task_command_relation`, registered under two `action_type` values so the registry routes without a branch inside a handler. Both are `(uuid, uuid) returns jsonb`, `set search_path = ''`, and deliberately **SECURITY INVOKER** — `undo_operation_routing.sql` asserts `prosecdef = false`. Reminders are restored by **close-and-insert**, per §11.3's "forced, not chosen": un-cancelling the recorded ids would in fact be safe under the current heartbeat predicate, but it depends on that predicate never changing. `remove_added_relation` deletes only the row its own operation created (2E-UPDATE-015), asserted against a task holding both an `involved` and a `waiting_on` person.
- **`supabase/tests/phase_2e_task_command_apply.sql`** — `plan(132)` (116 for the original contract, plus 16 the second review round added). All thirteen declared `2E_*` codes provoked, twelve staleness columns varied one at a time, replay with three counts pinned to literals, `no_change` proven to create zero undo and zero audit rows, all thirteen enabled actions applied, both refused actions, due-date consistency at both sites, and the grant/posture block. Three assertions are **fault-injected rather than raced** and say so: one pgTAP transaction cannot stage a concurrent writer, so `2E_REMINDER_INTEGRITY` uses a transaction-scoped trigger suppressing the close, and `2E_UNDO_REMINDER_INTEGRITY` needs a privileged corruption of the recorded evidence because `authenticated` cannot write `undo_operations` at all.
- **`src/features/task-commands/errors.ts`** — the closed `2E_*` failure vocabulary as iterable `as const` tuples with outcome, retryable and SQLSTATE carried as data. A bare union is the anti-pattern `outcomes.ts` already names in `ConfirmTasksCode`, two of whose codes have no test and one of which has no raising migration; 2E-I18N-003 needs runtime iteration. `errors.test.ts` asserts the list describes the migration **in both directions** — every declared token is raised, and every raised token is declared.
- **`src/features/task-commands/apply.ts`** — the RPC wrapper behind an injected client, validating the returned jsonb rather than trusting it. One shared `normalizeTaskCommandOperationKey` feeds both the fingerprint payload and the apply call, because the RPC btrims the key before hashing it and an untrimmed key sent to one but not the other would make every retry look like a new request. It trims ASCII spaces only, matching `btrim(text)`.

### Changed

- **`public.audit_task_change` derives its actor from a transaction-local `app.audit_actor`** (2E-UPDATE-010, ADR-046), read with `missing_ok` and defaulting to `'user'` so `persistTaskStatus` behaviour is byte-identical, and written with `is_local => true` so it cannot leak across a pooled PgBouncer session. Its watched columns extend to `title` and `description`, and both jsonb payloads gain those keys — closing the blind spot 2E-MATCH-006 declared, going forward and not retroactively. **The INSERT branch is untouched**: it already derives `'agent'` from `created_by`, which answers a different question. The trigger definition is not recreated and gains no `update of` list. **This is the first Phase 2E migration that is not inert on a dormant surface** — the trigger fires on every existing `public.tasks` write, so rollback means re-pasting `202607160014`'s body in a further forward migration, and the `database` job's green foundation journey on desktop and Pixel 7 is what evidences neutrality.
- **`docs/DATABASE.md`** — the new RPC and the trigger change documented. **No ADR-037 inventory row is added**: the name carries no `_vN` suffix, so it neither joins nor forks an inventoried family (ADR-044).
- **`supabase/tests/rpc_version_retirement.sql`** — the new RPC added to the `prosecdef` + `search_path=""` array and nowhere else. `plan(24)` unchanged, because adding an element to a literal array is not an assertion.
- **`src/features/task-commands/copy.ts` / `copy.test.ts`** — the eighth section and the eighth `VOCABULARIES` row, which **closes Slice 2E.3's open item 3**: 2E-I18N-003's literal subject ("every declared `2E_*` detail code") did not exist until this slice raised the codes, and nothing would have noticed them landing without copy.
- **`src/features/agent/actions.ts`** — the two `2E_UNDO_*` codes now reach it through the shared `undo_operation` router, since the migration registered two new action types, and were collapsing onto one generic sentence.
- **`src/lib/supabase/database.types.ts` / `database-types-parity.test.ts`** — hand-written entry (ADR-041), `jsonb → Json` added to the type map, and the migration parser generalized to read the return *shape* rather than assuming `returns table`, so a scalar parses instead of throwing. Parity is now proven **three ways** for this RPC: migration text, content comparison, and `proargnames`/`pronargdefaults` from the real catalog.

### Fixed after a second, whole-artifact adversarial review

Five lenses over the migration, the pgTAP suite and the TypeScript together, every finding handed to a separate skeptic instructed to refute it: 19 findings, 10 survived, 7 distinct defects. The first round had reviewed the migration alone and **could not have found five of these**, because they live in code it never read; two more require reasoning across the migration and the test suite at once.

- **The undo guard was one column wide while the write was ten (Critical).** `undo_apply_task_command_fields` restored all ten scalar columns from `before_state` but guarded only on `status`. Rename a task, reschedule it, then undo the rename: `expected_status` still matched, so `affected = 1` and the restore wrote `due_at = null` — **silently discarding the reschedule** and returning `{"undone": true}`. Because `after_state.reminder_created_id` is null for a rename, the reminder the reschedule armed was never cancelled, leaving a live `scheduled` reminder against a null due date for the heartbeat to fire. The asymmetry was the tell: the forward path gates on twelve columns to protect a write of at most three. Step 23 now records `applied_state` — the ten scalars as the forward write left them — and the compensating UPDATE guards all ten with `is not distinct from`, failing closed when `applied_state` is absent. **2E-UPDATE-014 was violated and the slice report had recorded it as met.**
- **`2E_UNDO_REMINDER_INTEGRITY` could not fire from any production state.** The handler had replaced the contract's post-condition with an element-*shape* check over data the forward path can never write malformed — the exact objection this migration's own comment uses to reject the tautological count form. It now re-queries the live scheduled count after the restore, scoped by a recorded `reminders_reconciled` flag; unconditional, it would refuse every undo of a task legitimately holding a reminder the action never touched.
- **The policy version was durably recorded nowhere.** A digest is not a record: hashing it into the fingerprint left no row able to attribute an applied command to the policy that governed it. `after_state` now carries `policy_version`. **2E-PROVENANCE-001 was likewise violated and recorded as met.**
- **Two fail-closed evidence gates did not fail closed.** `jsonb_typeof(...) <> …` yields SQL NULL for an absent key and plpgsql treats a NULL `if` as false, so both gates missed exactly the two shapes their comments said they refused — while the same file documented `is distinct from` as the fix ninety lines later.
- **`append_note` was unappliable past 2000 characters.** The RPC bounded the canonical `description` by the *note* bound while the preview produces `description + note`, so a task with a long description could never take another note and the preview offered a one-step apply the RPC would refuse.
- **Copy promised a rollback it cannot know about.** `undeclared_failure` said "Nothing was changed", but the mapper also routes there for an error with no SQLSTATE — and `@supabase/postgrest-js` *catches* a client-side fetch failure and resolves rather than rejecting, so a lost response after a successful commit landed on that copy. Both locales now claim only the retry, which is safe by idempotency rather than by rollback.
- **`buildFingerprintPayload` sent the raw operation key while the apply call sent the normalized one**, so the two agreed only because callers happened to pass trimmed keys. The test guarding the invariant asserted the *disagreement*, which documented the divergence as correct and forbade fixing it at the source.
- **Three guards were unfalsifiable by the 116-assertion suite** — the `action_touches_reminders` gate, the reminder-insert half's terminal-status guard, and (because every undo fixture was a `complete_task`) the seven-action `expected_status` path and the reminder-cancel block. `plan(116)` → `plan(132)`; the new cases include the Critical's exact reproduction, which silently passed before the fix, plus its success companion so a guard widened to something unsatisfiable cannot pass by refusing everything.

### Fixed

- **`42601 syntax error at end of input` — the migration would not apply at all, and CI is what caught it.** plpgsql reads an `if` condition with `read_sql_expression(K_THEN)`, which scans for the first `then` at paren-depth zero, so a bare `case … when … then … end` in that position ends the condition at the `case`'s own `then`; the remainder is parsed as statements and the parser reaches the end of the body still expecting `end if`. One site, fixed by parenthesizing, with the rule recorded in a comment. Every other `case` in the file was audited: three are plpgsql `case` statements closed with `end case;`, the rest sit at paren-depth one or deeper.
- **`pg_catalog.coalesce(...)` at eleven sites, found by adversarial review before CI.** COALESCE is a SQL special form with no `pg_proc` entry — exactly like GREATEST/LEAST — so every call would have failed to resolve with `42883`. Two sat in `audit_task_change`'s UPDATE branch, so the first `public.tasks` update touching a watched column would have broken `persistTaskStatus`, `private.undo_confirm_entry_tasks` and two existing pgTAP suites. The corpus settles it: 387 bare `coalesce(` across the prior migrations and zero qualified. **The post-deploy recurrence guard now greps for `pg_catalog.coalesce(` and `pg_catalog.nullif(` as well as `greatest`/`least`**; `overlay`/`substring`/`position`/`trim`/`extract` are deliberately excluded because they have real catalog entries and banning the qualified form would red a legal call.
- **Three reminder-integrity guards were tautological**, which for a declared member of a closed error vocabulary is the same defect as a missing raise. Replaced with one postcondition read back from `public.reminders`, which has independent provenance on each side and guards the reachable cause: `authenticated` still holds INSERT and UPDATE there, so a direct client write committing between the close and the check would leave a live reminder the command never disclosed closing.

## 2026-07-26 — Phase 2E Slice 2E.3: disambiguation and read-only preview (branch `codex/phase-2e-natural-language-task-updates`)

The projection half of Epic 2E-C. **No mutation, no UI, no route, no Server Action, no product event, no model call, and no user-visible behaviour change.** Nothing calls the preview, the disambiguation projection or the fingerprint; their consumers are Slices 2E.4/2E.5/2E.7. `202607250056` was **amended in place, twice** — the window Slice 2E.2 deliberately kept open for its first consumer, now **closed by exhaustion**; `202607250057` is new. Both are **local only** — remote parity stays at `202607250054`, and deployment stays deliberately deferred. Normative contract: `docs/PHASE_2E_PRD.md` §13.3, §13.4, §19.1 (Epic 2E-C), §11.2, §11.3. See ADR-042, ADR-043 and `docs/reports/PHASE_2E_SLICE_03_REPORT.md`. **The `database` job passed on `c50960b` but has not been executed on `4f9aff8`, so the slice verdict is conditional on that gate.**

### Added

- **Migration `202607250057`** — `public.task_command_fingerprint` (2E-PREVIEW-004, 2E-IDEMPOTENCY-003). `immutable`, `strict`, `set search_path = ''`, and deliberately **not** `security definer`: it reads no table, which is what makes 2E-PREVIEW-001's "a preview is read-only" structurally true and why computing a fingerprint cannot re-read the task and reopen the TOCTOU window `observed_before` exists to close. `jsonb_build_object` **is** the canonicalizer — jsonb sorts keys and discards whitespace before `::text` runs, so 2E-IDEMPOTENCY-003 holds structurally rather than by convention. Instants arrive already rendered as text, because `to_jsonb(timestamptz)` renders through the session `TimeZone` GUC that an empty `search_path` does not pin (`202607230051:203` carries exactly that latent bug; this does not copy it). Output is 64 lowercase hex characters — already the shape `undo_operations_request_fingerprint_check` accepts, so Slice 2E.4 stores it with no new column and no new constraint. **The fingerprint is identity, never authorization**: all seven inputs are client-held, so 2E-DESTRUCTIVE-002's server-issued single-use token remains a separate mechanism. See ADR-042.
- **`src/features/task-commands/preview.ts`** — `buildTaskCommandPreview`. Pure: no I/O, no Supabase client, no ambient clock, and `willMutate: false` as a **literal type** rather than a boolean, so a future edit cannot set it true and still compile. Five declared dispositions (`previewed`, `matched_requires_confirmation`, `no_change`, `rejected_stale`, `refused`). `no_change` is relation- **and** instant-aware: instants compare as moments, not strings, because `2026-07-31T12:00:00Z` and `2026-07-31T09:00:00-03:00` are one instant and a string comparison would produce an audit row, an undo row and reminder churn for a user-visible no-op. `completed_at`/`cancelled_at` render as `atApply` rather than a plausible timestamp the preview cannot know.
- **`src/features/task-commands/disambiguation.ts`** — `buildTaskDisambiguation`. Rank order preserved untouched (re-sorting on a locale-aware comparison would resolve against the host's ICU data, which 2E-MATCH-009 forbids); a signal is marked `distinguishing: false` when every shown candidate carries it, because "the title contains what you said" rendered identically under two identically-titled tasks restates PRD §12.2's ambiguity rather than resolving it; `confirm_one` is read from `qualifyingCount`, never from the presentation-capped array length, so 2E-MATCH-012's forbidden "disambiguation list of one" is unreachable. Nothing in the view can express a selected, default, recommended or pre-checked candidate — 2E-DISAMBIG-002 is unrepresentable, not merely unset.
- **`src/features/task-commands/outcomes.ts`** — 2E-UX-001's twelve outcomes, declared for the first time, as an iterable `as const` rather than a bare union, because the requirement names itself as "the source the 2E-I18N-003 exhaustiveness test runs against" and a `Record` over a union is not iterable at compile time. `previewed` is deliberately **not** one of the twelve: PRD §11.1 makes it a lifecycle state, and a preview waiting for the user has not come to rest.
- **`src/features/task-commands/copy.ts`** — pt-BR and English, every record keyed by a declared union so adding a vocabulary member is a type error in both locales at once. Three deliberate departures from the copy modules already in the tree, each fixing a defect that module has: `Locale` imported never redeclared; `satisfies Record<Locale, …>` rather than `as const`, which infers a shape from the data instead of checking the data against one; and **no** `?? copy["pt-BR"]` fallback, which turns an unhandled locale into a compile error instead of silently-Portuguese text for an English user.
- **`src/features/task-commands/fingerprint.ts`** — payload assembly plus the RPC call through an injected client. **It hashes nothing, and no module in that directory may.** Only `TASK_COMMAND_POLICY_VERSION` is hashed, not the match policy version — irreversible once Slice 2E.4 stores fingerprints. A preview carrying a null `observedBefore` raises rather than substituting: the function is `strict`, so a null yields null and an empty string yields a *valid* digest over an instant that never happened, which is exactly what 2E-UPDATE-006's replay check reads.
- **`TASK_COMMAND_UNDO_WINDOW_HOURS`** and **`targetStatus`** in the taxonomy. `targetStatus` makes §11.2's `status→completed` arrow data instead of prose, because for the four actions with no patch fields at all the proposed status is not derivable from anything the command carries; `policy-lock.test.ts` pins the biconditional so a fail-open null cannot make the preview render "Status: Not started → " with nothing after the arrow. The undo window is a mirror of `undo_operations.expires_at` (`202607160003:153`), pinned against that migration's text and deliberately kept **outside** the policy digest.
- **`supabase/tests/phase_2e_task_command_fingerprint.sql`** — `plan(19)`: the catalog signature, the digest shape anchored at both ends (a 64-character prefix of a longer value would satisfy an unanchored pattern and then fail the production CHECK), canonicality under key reordering and whitespace, all seven inputs varied one at a time against a shared base, a session-timezone probe that fails if anyone casts the instant back to `timestamptz`, strictness, grants for `authenticated`/`anon`/`public`, and `provolatile`/`prosecdef`/`proconfig` pinned against the catalog.

### Changed

- **Migration `202607250056` amended in place, twice** (2E-PREVIEW-002, 2E-PREVIEW-003, 2E-PREVIEW-005). +3 appended `default null` relation-ref arguments and +8 result columns: `project/context/person_ref_id`, `project/context/person_ref_name`, `scheduled_reminder_count`, `next_reminder_at`. Building the preview proved the pre-state alone insufficient in exactly two places, and **neither was fixable in TypeScript** — `patch.projectRef`/`contextRef`/`personRef` are the user's own words while the pre-state carries relation *ids*, so comparing them needs the authoritative normalizer, which `normalizer-divergence.test.ts` forbids in every non-test module of that directory including ones not yet written; and `reminders` was the only member of the taxonomy's `changedFields` with no observed state, for which `due_at is not null` is not a proxy because `create_due_task_reminder` is `after insert` only. Resolution therefore happens in SQL through `public.resolve_owned_entity_exact` rather than a second copy of entity resolution (ADR-021) — exact-or-nothing, so null means "no owned entity of that name, *or* more than one" and the preview says so truthfully instead of guessing. The arguments are **appended and all defaulted**, so `pg_proc.proargnames` stays an ordered superset and `pronargdefaults` still encodes `p_eligible_statuses` as the only required argument. Amending in place was legitimate because the migration had only ever been applied to ephemeral CI databases; **the window is now closed by exhaustion**, and any further change to its columns or arguments costs a `_v2` (`42P13`).
- **`src/lib/supabase/database.types.ts`** — the widened `list_task_command_candidates` signature and the new `task_command_fingerprint` entry, both added **by hand** under the named tooling constraint of ADR-041. No claim of regeneration is made anywhere.
- **`TASK_COMMAND_POLICY_VERSION` → `2026-07-25.2`.** Not bookkeeping: the value is one of the seven fingerprint inputs, so from Slice 2E.4 onwards changing it invalidates every stored fingerprint and every unexpired confirmation token. Nothing stores one yet, which is precisely why `targetStatus` had to arrive with its bump now. `TASK_MATCH_POLICY_VERSION` stays `2026-07-25.3` — no weight, threshold or limit changed, and the pinned 2E-MATCH-018 baseline rates did not move.
- **`describeUnreachableCandidates`** now also refuses a result set whose rows disagree on any query-scalar relation reference, alongside `observed_before`, `effective_limit` and `query_token_count`.
- **Documented, not fixed: §11.3's `reopen_task` premise is false for pre-2E rows.** Nothing in this repository has ever cancelled a reminder — the only writers of `public.reminders` are the `after insert` trigger (`202607160007:195-209`) and the heartbeat's two mark-sent updates (`202607160013:33`, `202607170016:552-560`), and `authenticated` retains direct `insert/update/delete`. A completed or cancelled task written before Phase 2E may therefore still hold a live `scheduled` reminder, and the preview renders observed state and discloses close-and-insert for it. Conversely `snoozed` is **not** a gap: every heartbeat path selects `status = 'scheduled'` and no other (`202607160007:274`, `202607160013:31`, `202607170016:510`), so a snoozed reminder can never fire and §11.3's wording is complete.

### Fixed

Two Criticals from one adversarial review, both proven by execution, both introduced earlier in this same slice and never released:

- **The preview could never name the entity it would add.** `relationAfter` looked the resolved id up in the arrays of relations the task *already holds*, so the name resolved only in the `no_change` case — the one case where it is not needed — and the real addition rendered a bare `"+1"`, a raw literal bypassing the copy module, where 2E-PREVIEW-002 asks for the proposed *value*. The already-held case appended anyway and rendered "Acme, Acme" beside copy saying nothing would change, the delta contradicting the `no_change` verdict computed from the same facts. Fixed by projecting the resolved entity's **stored** name from SQL (the second `202607250056` amendment) — the stored name rather than the user's typing, because `normalize_entity_alias` folds case, accents and punctuation, so echoing "acme corp" back for a project stored as "ACME Corp." would confirm something the database does not hold.
- **The reminder rule required a full hour of lead.** The condition was `due - 1h > now`, strictly, misreading `greatest(now(), due_at - interval '1 hour')` — whose `greatest` exists precisely so a due date less than an hour out still gets a reminder, at `now()`. "Move it to 5pm" typed at 4:30pm therefore disclosed "no reminders are affected" while the mechanism would have created one. §11.3's condition is only that the due date is in the future.

Also fixed, from the same review: `reopen_task`/`restore_task` promising a duplicate live reminder; `completed_at`/`cancelled_at` reporting `changed: false` while rendering a change; the stale and refused shells reading candidate content **before** ownership had been established, which a hand-assembled result could use to leak another owner's title (they now carry `title: null`/`status: null`); two different instants acting as "now", which silently opted out of `rankTaskCandidates` reporting the earliest observation across the set; a fabricated empty-string `observedBefore` that would have produced a *valid* digest over an instant that never happened; and the `confirm_one` prompt reusing "I need you to choose", which contradicts its own body text because a single qualifying candidate offers nothing to choose between.

**One finding was rejected, with the reasoning recorded** rather than quietly dropped: the reviewer called it a defect that `no_change` suppresses reminder disclosure, but 2E-UPDATE-009 makes `no_change` write no task update, no audit row and no undo row, so nothing happens to those reminders and disclosing a cancellation would be the invented effect. The underlying inconsistency — a null due date beside a live `scheduled` reminder — is real, predates this phase, and is recorded in `docs/TODO.md`.

The review also named the two assertions that let both Criticals hide: the relation delta's `after.text` was only swept for non-emptiness, which `"+1"` satisfies, and the reminder rule was pinned only at "already past" and "+2h", never inside the hour. Both are now pinned on both sides of their boundaries.

## 2026-07-25 - Phase 2E Slice 2E.2: deterministic matching and margins (branch `codex/phase-2e-natural-language-task-updates`)

The read half of natural-language task matching. **No mutation, no UI, no Server Action, no product event, no model call, and no user-visible behaviour change.** Nothing calls the new RPC; its first consumer is Slice 2E.3's preview. Migration `202607250056` is **local only** - remote parity stays at `202607250054`, and deployment is deliberately deferred until the first consumer proves the projection sufficient (`42P13` makes a `RETURNS TABLE` shape permanent once deployed). Normative contract: `docs/PHASE_2E_PRD.md` Epic 2E-B. See ADR-040, ADR-041 and `docs/reports/PHASE_2E_SLICE_02_REPORT.md`.

### Added

- **Migration `202607250056`** - `public.list_task_command_candidates`, owner-scoped, filtered on the action's declared eligible statuses, ordered totally and deterministically **before** truncating, returning one row beyond the limit so truncation is detectable, and projecting the full observed pre-state of every field SS11.2 can change. `security definer` with `set search_path = ''`, because `202607170020:314` revokes EXECUTE on `normalize_entity_alias` from `authenticated` and its non-null `proconfig` blocks inlining - `security invoker` was written first and would have raised `42501` for the only role that calls it. No grant widened (ADR-040). No index: an expression index on `(user_id, normalize_entity_alias(title))` was written and removed, because index maintenance evaluates the expression as the *writing* role and would have broken `createRecord`'s direct insert on a live path.
- **`src/features/task-commands/match-policy.ts`** - every weight, threshold, limit, tier and band at `TASK_MATCH_POLICY_VERSION = 2026-07-25.3`, pinned by digest. The calibration that matters: no single non-lexical signal reaches `minMargin`, so none can resolve the canonical two-identical-titles ambiguity of PRD SS12.2 on its own.
- **`src/features/task-commands/matching.ts`** - the pure scorer, comparator and outcome classifier. No AI, no network, no clock read, no Supabase client; the instant and timezone are injected and a designator-less instant is refused, because `Date.parse` reads such a string in the *host's* zone and a review proved the same command then resolved differently on two machines. Ordering uses the uncapped score and breaks ties by code point, never `localeCompare`.
- **`src/features/task-commands/candidates.ts`** - the injectable data-access layer. Deliberately free of `import "server-only"`, so the whole path from arguments to validated rows is exercisable without a database or a network. Raises (never filters) on a cross-owner row, because under `security definer` the `auth.uid()` predicate is the only ownership control inside the function and quietly dropping the row would hide its failure.
- **`describeUnreachableCandidates`** - the `(tier, overlap, queryTokenCount)` combinations `list_task_command_candidates` can actually emit, stated once, pinned against the migration text by `sql-reachability.test.ts`, enforced by `loadTaskCandidates`, and asserted over every fixture in both corpora. The scorer reads those three numbers as the authoritative normalizer's verdict and never re-derives them, which left it trusting triples nothing checked.
- **`supabase/tests/phase_2e_task_command_matching.sql`** - 48 pgTAP assertions executed against a from-zero database in CI: the catalog signature, `prosecdef`, `proconfig`, grants for `authenticated` and `anon`, the 8-entry normalizer corpus, symmetric cross-owner denial plus a null-caller case, ordering before truncation, overflow detection, fail-closed status handling, and LIKE-metacharacter hints (`%`, `_`, embedded and trailing backslash - the last being the `22025` case, since backslash is LIKE's default escape).

### Changed

- **`src/lib/supabase/database.types.ts`** - the `list_task_command_candidates` entry added **by hand**. `supabase gen types typescript` cannot run here (no Docker locally; in CI the CLI demands an access token even against a local `--db-url`, and the credential-shaped literal that satisfied it was correctly rejected by push protection). No claim of regeneration is made anywhere; parity is proven three ways instead - the migration declares the signature, `database-types-parity.test.ts` compares by content, and pgTAP pins both against `pg_proc.proargnames` from the real catalog. The whole-file regeneration check is withdrawn and recorded in `docs/TODO.md`. See ADR-041.

### Fixed

- Fifteen mutations that a mutation run proved the suite could not see, each applied, confirmed to fail, and reverted: `overflowed` `>`/`>=`, `topScore` and `margin` at their inclusive boundaries, deletion of the ranked presentation cap, both temporal band edges, the title tie-break swapped for `localeCompare`, four `rowSchema` refinements (including `prefilter_tier: z.any()`, which defeated the single test written to catch it because deleting the key then parses), the reachability check, and a commented-out pgTAP corpus assertion. Details in SS8 of the slice report.

## 2026-07-25 - Phase 2E Slice 2E.1: bounded task command contract (branch `codex/phase-2e-natural-language-task-updates`)

The first slice of Phase 2E - Natural-Language Task Updates. **Contract only: no task search, no matching, no mutation, no RPC, no UI, no Server Action, no product event, and no user-visible behaviour change.** `AIProvider.parseTaskCommand` has no production caller yet; its first consumer is Slice 2E.7. Normative contract: `docs/PHASE_2E_PRD.md` Epic 2E-A. See ADR-039 and `docs/reports/PHASE_2E_SLICE_01_REPORT.md`.

### Added

- **`src/features/task-commands/taxonomy.ts`** - PRD SS11.2 as executable data: fifteen actions, each declaring eligible source statuses, allowed target values, the patch field those values govern, required/allowed patch fields, changed fields, destructiveness, one-step eligibility, confirmation requirement and undo strategy. The *allowed target values* column is load-bearing: without it `set_status` carrying `cancelled` is a non-destructive, one-step, unconfirmed route to the transition `cancel_task` exists to guard.
- **`src/features/task-commands/temporal.ts`** - a declared, enumerable bilingual lexicon whose entries state their own resolution rules, resolved against an explicitly injected instant and IANA timezone and converted by the already-proven `resolveLocal` (the first Node consumer of `supabase/functions/_shared/extraction-normalization.ts`, reused rather than copied). Fails closed on a non-existent wall time, a non-calendar date, an unknown zone, an out-of-window explicit date, an ambiguous "this <weekday>", a bare time-of-day already past, and any phrase outside the lexicon.
- **`src/features/task-commands/vocabulary.ts`** - the declared closed bilingual table mapping a user's pt-BR or English status/priority word onto the database literal.
- **`src/features/task-commands/schema.ts`** - the closed command contract: strict shape, per-action patch contracts, per-action value bounds, a total serialized hint cap over and above each field's own, and a declared closed validation-reason vocabulary (Zod's own issue codes are mapped onto it rather than passed through, so the vocabulary is not library-owned and version-dependent).
- **`src/lib/ai/task-command-schema.ts`** - the prompt, the Structured Outputs response schema, both version constants, the bounded-input classifier and the closed content-free provider-error vocabulary, in one module with no `server-only` import so the fencing and the no-task-row promise are asserted against the real values rather than by regex over source.
- **`AIProvider.parseTaskCommand`** and its `OpenAIProvider` implementation - bounded input and output, explicit timeout and retries, strict post-response validation, and a failure that still carries the usage it was billed.
- **Migration `202607250055`** - the `task_command` operation literal added to the `ai_usage_events` CHECK *and* the `record_ai_usage` guard in one change, with a fail-closed `DO` block asserting the constraint swap took effect. `source_type` deliberately unchanged: at parse time no task is selected, so a null source is truthful and `'task'` stays a Phase 2F decision (PRD SS22). Generated types unaffected - `operation` is `text`, so CHECK literals never reach `database.types.ts`.
- **`supabase/tests/phase_2e_task_command_ai_usage.sql`** - asserts the widened CHECK and the rewritten RPC guard independently, that all seven prior operations survived both, and that the `create or replace` kept `SECURITY DEFINER` and its empty `search_path`.
- **`src/features/task-commands/policy-lock.test.ts`** - PRD SS11.2 transcribed row for row, plus digests pinning the taxonomy, vocabulary, lexicon and prompt to their declared versions, so SS10.4's "enforced by test" is actually enforced.
- The `task_command` cost-dashboard label, and a `task_command` round-trip in `scripts/remote-supabase-smoke.mjs` - the only gate that reaches the linked project, where the constraint already existed and was swapped in place.

### Changed

- `supabase/functions/_shared/extraction-normalization.ts` is no longer Deno-only: it is imported from the Node runtime for the first time. `deno-parity.test.ts`'s rationale is corrected accordingly and gains a guard keeping the module Node-importable, which neither existing gate would catch (`vitest.config.ts` includes only `src/**`; `deno check` accepts Deno globals and `.ts` specifiers).

### Fixed

All found by independent review, all proven by executing the code, all introduced within this slice and never released:

- **`lastDayOfMonth` returned 1 February in every non-leap year.** The base date was built in the year 2000 - a leap year - so `Date.UTC(2000, 2, 0)` is 29 February, and setting a non-leap target year rolled forward to 1 March, leaving day 1. "Fim do mes" produced a deadline up to 27 days in the past, reported as `resolved`; "mes que vem" landed two days into the current month. No test covered February, a leap year, or "next month".
- **A model-supplied instant was trusted verbatim.** The fast path returned the caller's string before `resolveLocal` ever saw it, so `2026-13-45T99:99:99Z` and `2026-02-30T12:00:00Z` were both `resolved`, on their way to a `timestamptz` column - the exact failure class the module exists to prevent, against a model the Gate 1 cutover had already measured ignoring this instruction. A complete instant is now a clarification (2E-COMMAND-016).
- `parseTaskCommand` used `responses.parse`, which runs the schema inside the awaited promise: schema-violating output arrived as a `ZodError` indistinguishable from a transport failure, was classified `provider_unavailable` (inviting a retry of a deterministic model defect), and took the response's usage with it. It now parses the response itself, so classification is precise and every post-response failure carries what it was billed - the rule `usage-order.test.ts` already pins for the worker.
- An empty command was reported as `command_text_too_long`, decided inside a `server-only` module no test could reach.
- Portuguese status and priority words were refused, and refused with `value_not_allowed_for_action` - which claims the value belongs to another action rather than that it was not understood.

## 2026-07-25 — Pre-Phase-2E foundation hardening (branch `codex/pre-2e-foundation-hardening`)

One consolidated initiative against `docs/reviews/ARCHITECTURE_REVIEW_2026_07.md`, between Phase 2D and Phase 2E. **No Phase 2E product functionality.** Full finding-by-finding disposition — accepted, modified, deferred, rejected — in `docs/reports/PRE_2E_FOUNDATION_HARDENING_REPORT.md`. ADR-035 (undo handler architecture), ADR-036 (canonical localization), ADR-037 (RPC retirement policy), ADR-038 (CI database/worker verification).

### Added

- **`.github/workflows/ci.yml` gained two jobs beside the existing `app` one** (review H1/H10, ADR-038). `worker`: `deno check` on `process-jobs/index.ts` and `heartbeat/index.ts`, then `deno test supabase/functions/` with **no** `--allow-*` flags, so the suite cannot reach a network — this is the first static or behavioural gate `supabase/functions/**` has ever had (`eslint.config.mjs` ignores it and `vitest.config.ts` includes only `src/**`). `database`: local Supabase stack → `supabase db reset` (the whole migration chain applied to an empty database — nothing checked this before) → `supabase test db` (the full pgTAP suite, which had never executed as a suite in any environment) → `supabase db lint --local --schema public,private --level warning --fail-on error` → production build → `e2e/foundation.spec.ts` on desktop and Pixel 7. Failure uploads the Playwright report and the last 200 lines of every Supabase container log; the stack is always stopped.
- `supabase/seed.sql` — local/CI only (never run by `db push`). Installs `pgtap` into `extensions` and puts `extensions` on the database `search_path`, because all 24 suites call assertions unqualified. pgTAP is deliberately **not** created by a migration: it is a test harness, not product schema, and the linked project must not carry it. No domain fixtures — each suite builds and rolls back its own data.
- Migration `202607250052` — **`undo_operation` becomes a thin router** (review H2, the only true pre-2E blocker; ADR-035). Each operation family's compensation body moves verbatim into a private `security invoker` handler with `execute` revoked from every role; `private.undo_operation_handlers` maps `action_type` → handler and a `before insert or update of action_type` trigger on `public.undo_operations` refuses to record an operation whose `action_type` is not registered, so an operation cannot exist without a handler to reverse it (a trigger rather than an FK: an FK to the unexposed `private` schema is metadata the Supabase type generator reads, and `pg_trigger` metadata is not — the same reasoning as `202607170027`). Each handler additionally refuses an `action_type` it does not own. `private.undo_operation_definition_bundle()` exposes router + handlers as one blob so the pre-existing fail-closed source guards (no `errcode = '40001'`, `55P03` present, no `pg_catalog.greatest(`) keep working after the split instead of passing vacuously. Adding a Phase 2E undoable operation is now one handler plus one registry row, not a ~470-line re-paste — the authoring pattern that shipped the same `pg_catalog.greatest(` defect twice (`202607220042` fixed it, `202607220044` re-pasted the pre-fix version, `202607220045` re-fixed it).
- `supabase/functions/_shared/extraction-validation.ts` — **runtime validation for AI extraction output** (review H5), replacing the worker's `JSON.parse(...) as Extraction`. Dependency-free on purpose: that is what lets Vitest import it and prove behavioural parity with the Zod source of truth in the existing CI job, which a `npm:zod` validator could never do. Validates enums, trimmed lengths, 0..1 confidence bounds, calendar-real ISO instants with a required timezone, and non-negative integer `parentIndex`. Issues carry a field path and a machine code only — never a value.
- `src/lib/ai/extraction-parity.test.ts` — 114-case corpus run through both `entryExtractionSchema` and the worker validator, failing the build on any disagreement in verdict *or* normalized output. Covers the datetime edges that matter (no timezone, space separator, month 13, hour 24, 2026-02-30, a real leap day, fractional seconds) and asserts issue payloads never contain model or user content.
- `supabase/functions/_shared/extraction-validation.test.ts` — 22 Deno tests for the validator, executed by the new `worker` job.
- Migration `202607250053` — a `before insert` trigger bounding AI-origin interpretations as defense in depth. **Deliberately bounds, not a third schema**: it does not learn which fields are required or which concepts exist (that belongs to the worker validator and the provider response schema), only the values downstream domain objects already constrain, and only for fields that are present. Every check is at least as permissive as the worker validator by construction, so no worker-accepted output can be refused. Scoped to `ai_generated`/`ai_reprocessed` and to INSERT, so the correction path and undo's restore of a pre-bounds snapshot are untouched.
- Migration `202607250054` — first application of the **RPC version retirement policy** (review H3, ADR-037, policy in `docs/DATABASE.md`): `authenticated` execute revoked on `confirm_entry_tasks(uuid, integer[])`, the single case a repository-wide consumer search justifies. Body retained; `resolve_pending_question_v1`/`_v2`/`_v3` untouched, their deferral (PRD §21.7, ADR-034) explicitly upheld.
- `supabase/tests/undo_operation_routing.sql` (19 assertions), `supabase/tests/ai_interpretation_bounds.sql` (21), `supabase/tests/rpc_version_retirement.sql` (24) — router posture and registry integrity; the bounds trigger including proof that it imposes no completeness contract and leaves `user_corrected` alone; and the whole RPC inventory as an executable contract, which is now the *only* gate that can catch a grant change (revoking a grant is a zero-diff change in the generated types).
- `src/features/chat/actions.test.ts` — the chat slice's first tests: citation hydration drops an unmatched or malformed cited id instead of throwing, and every action result is localized.
- `src/features/interpretations/deno-parity.test.ts` — source-parity locks for the three `_shared` modules ADR-021 declared "byte-for-byte identical" by comment only, comparing algorithm bodies with the two documented differences (provenance header, import block) excluded, plus a check that no new `_shared` file escapes pairing.

### Changed

- `resolve_pending_question_v3.sql` declared `plan(34)` for 37 assertions — a real drift, invisible for as long as the suite never ran anywhere. Corrected to 37. All 24 suites now have plan counts matching their assertion counts.
- Four pgTAP source-text assertions that inspected `pg_get_functiondef('public.undo_operation(uuid)')` now inspect `private.undo_operation_definition_bundle()`, so they neither pass vacuously after the split nor need editing when a handler is added.
- `playwright.config.ts` runs `npm run start` (the production build the same job just produced) with `reuseExistingServer: !CI` and an explicit 120s webServer timeout under CI. Local behaviour is unchanged.
- **Localization** (review H6, ADR-036): typed feature copy modules in the `daily-cycle/copy.ts` shape are canonical, `Locale`/`resolveLocale` come from `src/lib/preferences.ts`, and Server Actions resolve the locale *first and independently* — validation failures are user-facing too and happen before the input schema succeeds. 30 Portuguese-only strings that reached English users are localized across `chat/actions.ts` (7), `operations/actions.ts` (6), `agent/actions.ts` (reminders 5, upload 9) and `interpretations/actions.ts` (3 locale-parse-failure branches). `ENGINEERING_STANDARDS.md` gained the explicit rule and the incremental-migration policy; 180 ternaries and 77 inline literals remain and migrate opportunistically.
- `src/app/[locale]/app/error.tsx` no longer claims "the problem was recorded" while discarding the `error` prop. It surfaces `error.digest` as a quotable code and emits one structured `console.error`; the copy is truthful in both locales (review H7 subset).
- The Node OpenAI client sets `timeout: 120_000` and `maxRetries: 2`, closing a window where SDK defaults (10 min × 2 retries) could hold a blocking Server Action for ~30 minutes (review L7).
- The worker reads `x-request-id` for embedding calls instead of recording `provider_request_id: null`, restoring `ai_usage_events_request_id_idx` deduplication so a job retry no longer double-records embedding cost (review L8).
- Chat citation hydration replaces `sources.find(...)!` with a `flatMap` that drops an unmatched id, preserving order and shape. The non-null assertion coupled the action to provider stripping behaviour across the `AIProvider` portability seam, where a weakened filter became a TypeError mid-conversation (review L9/H9 subset).
- The worker no longer propagates `JSON.parse` `SyntaxError` messages, which embed an excerpt of the offending model output and reached `jobs.error` — rendered verbatim on the Jobs page.
- `docs/STATE.md` gained a current-truth section and three factual corrections: the projection mappers described as consumer-less while five of them ship in production; the 180-day `product_events` retention described as shipped when it is a table comment with no purge job; and the HNSW indexes described as used when `match_internal_knowledge`'s `UNION ALL` + computed-alias ordering forces an exact scan. `docs/DATABASE.md` gained the same pgvector correction. `CLAUDE.md`'s description of `src/i18n/messages.ts` as a "next-intl message catalog" was false and is corrected; its feature-slice list was missing `reviews`.

### Removed

- `next-intl` (dependency and lockfile) — declared, installed, and imported by nothing. Its removal takes 706 lines of transitive lockfile entries with it (review H6/quick win).
- `src/lib/ai/cost-calculator.ts` and its test — a dead TypeScript mirror of the database's cost arithmetic, rounding each component in float where `get_ai_cost_summary` sums in `numeric` and rounds once (review L6).
- `summarizeAIUsage` and its `breakdown`/`dateKey`/`usdToNanoUsd` helpers from `cost-summary.ts` — same reason; `parseAICostSummary` (live on the costs page) and the shared types stay, and the file's stray bottom-of-file `import { z }` moved to the top.
- `resolveAIRoutes` from `model-routing.ts` — no production caller. `MODEL_PROFILES` is live in Settings and stays covered. Consolidating the five ad-hoc `preferences?.X ?? "<hardcoded>"` sites needs a Deno mirror to be truthful, which belongs to Phase 2E's AI-layer work, not to a hardening pass keeping a consumer-less abstraction alive (review M9).
- `retryProcessingJob` and its test from `agent/actions.ts` — consumer-less two phases after its promised consumers (Slices 2X.10/2X.11) shipped a different Action (`reprocessEntry`, wired on the entry-review page). Wiring it to the Jobs page would need a new client component, per-type dispatch across two incompatible result shapes, and a missing `revalidatePath` (review L3).

## 2026-07-24 — Phase 2D Slice 2D.6: convergence and closeout (branch)

### Added

- `scripts/generate-phase-2d-traceability.mjs` (`npm run docs:phase-2d:traceability`) — parses the PRD's 58 `2D-<FAMILY>-NNN` functional/non-functional requirement IDs (15 families), 6 per-epic acceptance criteria (§19.1), and 5 global gates (§19.2), maps each to its owning slice(s) and durable evidence, and **fails closed** if the inventory or any per-family count drifts. Verified: a deliberately injected extra requirement makes it exit non-zero (59 ≠ 58), and the PRD restores byte-identical.
- `docs/reports/PHASE_2D_TRACEABILITY_MATRIX.md` — 69 generated rows (58 requirements + 6 epics + 5 gates). No requirement is represented as non-green: the deterministic suggested-answer path fully satisfies `2D-SUGGEST-002`/`2D-OPERATIONS-003` (the AI extraction-schema field they name is an explicitly deferred, separately-authorized fallback that was not needed), and the `2C-UNDO-004` hard gate behind `2D-ACTION-006`/`2D-UNDO-003` is resolved by migration `202607230050`.
- `scripts/verify-phase-2d-cleanup.mjs` (`npm run test:remote:2d:cleanup`) — fail-closed residual-data check across Auth users (Phase 2D fixture prefixes `phase-2d-resolution-`/`-preview-`/`-reinterpret-` plus adjacent smoke prefixes), 14 owner-scoped tables (adding `entry_interpretations` to the Phase 2C set — `pending_questions` was already scanned — since reinterpretation appends an immutable interpretation revision), and remote-smoke storage objects.
- `test:remote:2d` aggregate (`remote-supabase-smoke.mjs --phase-2d`) — a deterministic, fail-fast sequence: question-resolution (v1/v2 answer + dispositions), suggested-answer/preview, reinterpretation (v3), content-free resolution analytics, and residual-data cleanup. The daily-cycle smoke is intentionally excluded (its needs-attention section claims an `interpret_entry` job that races the unattended `pg_cron` drain) and remains runnable standalone and inside `test:remote:2x`.
- `docs/reports/PHASE_2D_SLICE_06_REPORT.md` (this slice's acceptance report) and `docs/PHASE_2D_REPORT.md` (phase-level closeout handoff).

### Changed

- `docs/SECURITY.md` — reconciled to record that the `undo_operation` `40001`→`55P03` fix shipped in migration `202607230050` (Slice 2D.4, `2C-UNDO-004` resolved) and to document the Phase 2C/2D versioned resolution/confirmation security controls; the stale pre-production `undo_operation 40001` residual item is closed.
- `docs/DECISIONS.md` — ADR-034 records the closeout decisions (evidence-based convergence with no product source change; legacy answer path preserved per PRD §21.7; deterministic fail-fast aggregate; documentation reconciliation).
- `docs/STATE.md`, `docs/TODO.md` — reconciled to mark Phase 2D complete through Slice 2D.6 and Phase 2E as the next authorized scope.

### Notes

- **No migration, RPC, or product/UI source change.** The convergence audit confirmed every actionable-question reader already shares `actionablePendingQuestionFilter` (mirrored in SQL by `list_needs_attention`) and the single `resolvePendingQuestion`/`undoQuestionResolution` contract, so no drift required a product fix. The closeout scripts are node-only with no runtime coupling. Local/remote parity is preserved through `202607230051`; generated types are unchanged. Branch `codex/phase-2d-slice-6`, base `62883af` (Slice 2D.5 merge / PR #15). See `docs/reports/PHASE_2D_SLICE_06_REPORT.md` and ADR-034.

## 2026-07-24 — Phase 2D Slice 2D.5: conversational surfacing (Chat + queue) and cooldown (branch, not merged)

### Added

- `src/features/agent/question-surfacing.ts` — pure, LLM-free `decideQuestionSurfacing`: the deterministic proactive-nudge decision the PRD's `2D-COOLDOWN` requirements demand. Mirrors the heartbeat discipline (`run_user_heartbeat`): quiet hours in the user's own timezone (reusing `isWithinQuietHours` verbatim), a per-local-day `max_followups_per_day` cap, a rolling 24h cooldown, and an `important_reminder_override` bypass that only an *important* item may use. Gates evaluate in a stable order (quiet hours → cap → cooldown). 18 unit tests cover every branch, timezone correctness, the empty quiet window, cap 0, cooldown boundaries, an unparseable timestamp, and every override interaction.
- `src/features/agent/question-surfacing-data.ts` (`server-only`) — derives the decision inputs from owner-scoped data and **reuses the heartbeat's existing `notifications` ledger read-only** as the shared nudge budget (delivered-today count + last-nudge cooldown anchor), so no new cron, channel, or persisted surfacing state is introduced — surfacing stays pull-based per ADR-033 decision 5. Fails **closed** (no nudge) on any read error. 7 unit tests.
- `src/features/agent/conversational-questions.tsx` (`server-only`) — a reusable `<section>` (role `region`) panel that renders open actionable questions as interactive, untrusted-data elements resolvable through the **unchanged** `resolvePendingQuestion` / `undoQuestionResolution` contract and the existing `QuestionAnswerForm` (answer, defer, dismiss, not-relevant, 2D.3 suggestions/previews, 2D.4 confirm-to-reinterpret). Two modes: **proactive** (Chat — shown with attention only when the surfacing module allows, otherwise collapsed to one quiet reachable link so nothing is ever permanently hidden) and **pull** (the "Precisa de você" queue — always shown; the decision only sets header emphasis). Fully failure-isolated: a read error degrades to "no panel" instead of crashing the host page. Every projected string is React-escaped owner content and is never injected into the chat prompt.
- `ConversationalQuestionsViewed` (`src/features/product-analytics/interaction-events.tsx`) — content-free "surfaced" observation reusing the existing allowlisted `needs_attention_viewed` event with the allowlisted `questions` surface and a bounded item count only. No new event name, surface, or migration.
- E2E: a new authenticated journey in `e2e/intelligent-capture.spec.ts` resolving the same pending question from Chat and the Needs-you queue through the identical contract, asserting cross-surface convergence with `/questions`, ≥44 px targets, and no mobile overflow (desktop + Pixel 7 verified against the linked project).

### Changed

- `src/app/[locale]/app/chat/page.tsx` mounts the proactive panel above the chat form; `src/app/[locale]/app/inbox/page.tsx` (`?view=needs-you`) mounts the pull panel above the entry-centric needs-attention list. `src/app/agent.css` gains the panel styles (reusing the existing `question-card`/`question-answer` chrome).

### Notes

- **No migration.** No table, column, RPC, constraint, or product-event name/surface changed; generated types are unchanged; local/remote parity is preserved through `202607230051`. The resolution, reinterpretation, undo, and analytics contracts of 2D.1–2D.4 are reused byte-for-byte. Verified: ESLint clean, TypeScript clean, Vitest 902/902, production build green, linked DB lint (`--level error`) clean, authenticated Playwright desktop + Pixel 7 green (new journey + regressions). Branch `codex/phase-2d-slice-5`, base `218e56e` — not pushed, no PR, not deployed. See `docs/reports/PHASE_2D_SLICE_05_REPORT.md`.

## 2026-07-24 — Phase 2D Slice 2D.4: confirmed consequence / reinterpretation (branch, not merged)

### Added

- Migration `202607230050` (additive) — `resolve_pending_question_v3`, the third version of the single long-lived resolution RPC family (`security definer`, `search_path = ''`, execute to `authenticated` only). Its closed discriminated `p_resolution` keeps every 2D.1/2D.2 kind byte-compatible and adds **exactly one** approved extension: an optional closed-enum `consequence` (`none`, `reinterpret`) carried **only** by the `answer` kind. An unknown consequence value, or a `consequence` key on any non-answer kind, rejects with `22023` before any mutation; an absent consequence canonicalizes to `none` and hashes identically, so replay stays deterministic. `reinterpret` reuses the deployed owner-scoped path (`enqueue_entry_reprocessing` → one `interpret_entry` reprocess job → the `process-jobs` worker appends a new immutable interpretation revision) — no new engine/queue/worker/scheduler/secret/Edge Function. The reprocess operation key is derived from the resolution's own canonical SHA-256 fingerprint (`qr3-<60 hex>`), so the consequence is idempotent per operation key and can never double-enqueue on replay or concurrency. Three independently replay-safe audit events are written with no duplication: `resolve_pending_question_v3` (answer persisted), `question_consequence_confirmed` (consequence confirmed, only when applied), and `entry_reprocessing_enqueued` (reinterpretation created, by `enqueue_entry_reprocessing`). Returns `{ question_id, resolution, consequence, consequence_status, undo_id, idempotent }`; a consequence that cannot be applied truthfully (reprocessing already queued/running) rolls the whole resolution back with `P0001` / `2D_CONSEQUENCE_UNAVAILABLE`. `resolve_pending_question_v1`/`_v2` are untouched and callable; namespaces (`resolve-v1:`/`resolve-v2:`/`resolve-v3:`) never collide.
- Migration `202607230050` also **resolves the `2C-UNDO-004` hard gate**: `undo_operation`'s own "Cannot undo after a newer interpretation revision" conflict, which raised the gateway-hanging SQLSTATE `40001` (proven in Phase 2X to hang the platform gateway), is forward-fixed to `55P03` (mirroring ADR-026), asserted by a fail-closed `DO` block that fails the migration if `40001` remains in the function body. Its `undo_operation` v3 branch restores the question to exactly `open` (cleared answer/answered_at/snoozed_until, guarded by the evidence's status so it can never clobber a newer resolution) and compensates the queued reprocess job — an un-claimed (`pending`/`failed`) job is removed (`reprocessing_cancelled`); a claimed (`running`) job is left intact (`reprocessing_in_progress`). Undo restores pointers, not history; it never deletes or resurrects an interpretation revision, and is idempotent.
- Migration `202607230050` adds the content-free `question_reinterpret_applied` product event (boolean-by-existence: no properties at all) to the allowlist (`CHECK`, per-event property allowlist, and the defense-in-depth name guard), reproducing every other branch byte-for-byte. Generated types are content-identical (only the new function signature added).
- Migration `202607230051` (forward-only hardening) — re-creates `resolve_pending_question_v3` verbatim except that, for the `reinterpret` consequence, it acquires `enqueue_entry_reprocessing`'s per-(user, entry) advisory lock **before** the entry row lock (key matched byte-for-byte). This removes a lock-ordering deadlock with a concurrent manual retry (`retryProcessingJob → enqueue_entry_reprocessing`, which locks advisory-then-entry). Same signature, grants, security posture, contract, audit, undo, and return shape; `_v1`/`_v2` and `undo_operation` untouched.
- `scripts/remote-question-reinterpretation-smoke.mjs` (`npm run test:remote:2d:reinterpretation`) — 12 disposable authenticated case groups proving the closed consequence enum, ownership/anonymity denial, no-consequence applying nothing, confirmed reinterpretation enqueuing exactly one job with three distinct audit events, replay never double-enqueuing, same-key/different-consequence mismatch, undo restoring open + cancelling the un-claimed job + preserving the immutable interpretation + idempotency, a claimed job compensated as `in_progress` (never deleted), `_v1`/`_v2` still callable and namespace-isolated, and the content-free `question_reinterpret_applied` allowlist. Cleanup is fail-closed.
- `supabase/tests/resolve_pending_question_v3.sql` — pgTAP coverage of the v3 structural contract, the closed consequence enum, single-enqueue + three audit events, consequence idempotency, undo compensation, the `40001` forward-fix structural assertion, and the analytics allowlist (Docker-gated locally; equivalent authenticated linked remote behavior proved by the smoke).

### Changed

- `src/features/agent/question-resolution-contract.ts` — the `answer` command variant gains an optional `consequence: z.enum(["none","reinterpret"]).default("none")`, carried only by `answer`; the serializer always emits the normalized consequence for the answer kind so the replay fingerprint is unambiguous. Exports `questionConsequences`/`QuestionConsequence`.
- `src/features/agent/actions.ts` — `resolvePendingQuestion` validates the submitted `consequence` against the same closed enum (unknown → `validation_error`, absent → `none`), cuts the consumer over to `resolve_pending_question_v3`, surfaces the truthful `consequence_status` as localized copy, maps `2D_CONSEQUENCE_UNAVAILABLE` to a distinct retryable `consequence_unavailable` code, and emits the property-free `question_reinterpret_applied` event only when the consequence applied on a non-replayed operation.
- `src/features/agent/forms.tsx` — `QuestionAnswerForm` gains a `canReinterpret` prop and an **Answer and re-interpret** control that opens a pure, non-mutating disclosure ("nothing has been applied yet"), applying the consequence only on an explicit **Confirm and re-interpret** (or **Skip consequence**). The operation-key signature includes the consequence so answer-only and answer-plus-reinterpret can never be conflated on replay. Adds `consequence`/`consequenceStatus` to the resolution state and a truthful undo hint.
- `src/app/[locale]/app/questions/page.tsx` — passes `canReinterpret={preview?.effect.kind === "reinterpret"}` so the consequence is offered only when the read-only 2D.3 effect preview says reinterpretation is genuinely possible.
- `src/features/agent/question-preview-projection.ts` — the `reinterpret` effect-preview copy now describes the confirmed reinterpretation ("a new interpretation revision; earlier interpretations stay preserved") while still stating nothing has been applied yet.
- `src/features/product-analytics/contracts.ts` — allowlists `question_reinterpret_applied` (property-free).
- `src/app/agent.css` — consequence-panel styles (≥44 px targets, `overflow-wrap`, single-column mobile).

## 2026-07-23 — Phase 2D Slice 2D.3: deterministic suggested answers and read-only source/effect preview (branch, not merged)

### Added

- `src/features/agent/question-suggestions.ts` — a pure, deterministic suggested-answer generator with **no** network, AI, provider, worker, database, clock, or randomness dependency, and no mutation. Because the extraction contract stores only `question`/`reason`/`confidence` (there is no persisted question type, and ADR-033 decision 4 forbids adding one by default), the taxonomy is discovered from the question's **leading** interrogative — anchored at the start, so a relative pronoun deeper in the sentence cannot hijack the classification and unrelated leading prose yields nothing: `yes_no` (polar openers, accent-aware so a leading `é` is never the conjunction `e` → the closed localized `{Sim,Não}`/`{Yes,No}` set), `person` (`quem`/`who`), `project`, `organization`, and `context`, each drawn from the question's own interpretation's extracted entity names. Options are bounded (≤6, ≤160 chars, over-long values **dropped not truncated**), deduplicated on a normalized key, stripped of empty/markup/control-bearing values, deterministically ordered, and carry stable semantic ids (`person:ana-prado`, `yes_no:yes`) so ids stay locale-independent while yes/no values and labels localize. `quando`/`when`, `por que`/`why`, `quanto`/`how much`, and any supported kind with no owned context return `[]` — values are never fabricated to guarantee a suggestion, and the ordinary free-text flow is kept intact. Also exports `findPresentedSuggestion`, the provenance matcher.
- `src/features/agent/question-preview-projection.ts` — a `server-only`, strictly read-only projection issuing three explicitly owner-scoped `SELECT`s (no `SECURITY DEFINER` RPC needed). It verifies question, entry, and interpretation ownership plus interpretation-to-entry provenance consistency, and returns a closed DTO (`questionId`, `entryId`, `question`, `reason`, `candidateIndex`, whitespace-collapsed ≤280-char `entryExcerpt` + `entryExcerptTruncated`, `entryCreatedAt`, `entryOccurredAt`, `interpretationVersion`, `interpretationCreatedAt`, ≤280-char `interpretationSummary`, truthful `isCurrent`). No raw row, raw interpretation JSON, `raw_output`, embedding, provider response, operation key, audit internal, or `user_id`/`interpretation_id` reaches the client; a cross-owner question is silently absent and indistinguishable from a missing one. Its `toQuestionEffectPreview` is pure and returns the closed `{kind: "none" | "reinterpret", title, description, notice, willMutate: false}` — `reinterpret` for a current question, `none` for a superseded one — always stating that nothing has been applied yet. `loadQuestionSuggestions` re-derives the options server-side for provenance authentication.
- `src/features/agent/question-preview-panels.tsx` — two collapsed read-only `<details>` disclosures (source, predicted effect) over the bounded DTOs. Opening or closing one performs no domain write; its only side effect is a fail-open, property-free analytics observation.
- Migration `202607230049` (additive, **product-event allowlist only**): adds the property-free `question_effect_previewed` event; gives `question_answered_basic` the **optional** bounded `origin ∈ {typed, suggested}` property (optional so the pre-cutover application's `{}` payload keeps recording — the migration is independently deployable and the application commit is rollback-safe without reverting it); and adds a truthful `questions` product surface. Every other event branch, guard, `search_path`, and revoke is reproduced byte-for-byte. **No resolution RPC version, table, column, trigger, cron, queue, worker, Edge Function, provider, or extraction-schema change**; `resolve_pending_question_v1`/`_v2` are untouched, and generated types are content-identical.
- `scripts/remote-question-preview-smoke.mjs` (`npm run test:remote:2d:preview`) — 10 disposable authenticated case groups proving owner-scoped source reads, non-disclosing cross-owner/anonymous denial (including a forged `user_id` filter), byte-stable owned suggestion context, a **byte-identical per-owner evidence footprint across the whole preview path** (no audit, undo, job, interpretation, task, or product-event row), the new allowlist accept/reject matrices, a suggestion-originated answer resolving/replaying/mismatching/auditing/undoing normally, typed answers and all three 2D.2 dispositions still working, the closed payload still rejecting smuggled `origin`/`suggestionId` keys, and a byte-identical immutable interpretation. Cleanup is fail-closed.

### Changed

- `src/features/agent/question-resolution-contract.ts` gains `questionAnswerOrigins` and the bounded `parseSubmittedSuggestionId` (`^[a-z_]+:[a-z0-9-]+$`, ≤64 chars). **`questionResolutionCommandSchema` and `serializeQuestionResolution` are unchanged** and still reject `suggestionId`/`origin` as unknown keys, so `p_resolution` remains exactly `{ kind: "answer", answer }`.
- `resolvePendingQuestion` authenticates suggestion provenance server-side: the browser submits only a bounded id, the deterministic options are regenerated from owner-scoped data, and the id must have been presented for that question **and** carry exactly the submitted answer. A forged, stale, or edited-away id records `typed` — attribution cannot be forged, and a UI hint never fails a resolution. The result is recorded as the bounded `origin` enum on the persisted-outcome `question_answered_basic` event (emitted only after the RPC persisted and only when not a replay).
- `QuestionAnswerForm` gains a labelled, keyboard-operable suggestion chip group with `aria-pressed`, a polite live region announcing selection, visual distinction from typed input, and a hidden bounded `suggestionId`. Picking a chip fills the controlled answer field and moves focus to it — never submitting or resolving; editing away from it clears provenance deterministically (trim-normalized, matching the server's comparison); picking another replaces it; undo clears it. The existing answer/defer/dismiss/not-relevant controls are unchanged.
- The questions page loads previews in one owner-scoped batch and degrades to no chips/panels if that purely additive read fails, so answering, deferring, dismissing, and marking not relevant keep working exactly as before.
- `product-analytics/contracts.ts` gains `question_effect_previewed`, the `questions` surface, and the `origin` property; `interaction-events.tsx` gains `TrackedQuestionPreview` (session-deduplicated per question across both panels, fail-open).

## 2026-07-23 — Phase 2D Slice 2D.2: question dispositions (branch, not merged)

### Added

- Migration `202607230048` (additive): `resolve_pending_question_v2(p_question_id uuid, p_resolution jsonb, p_operation_key text) returns jsonb` — the second version of the single long-lived resolution RPC family (ADR-033), adding the approved non-answer dispositions to the closed discriminated `p_resolution`: `{ "kind": "deferred", "snoozedUntil": <explicit-offset future instant> }`, `{ "kind": "dismissed" }`, and `{ "kind": "not_relevant" }`, alongside the existing `answer` kind. `SECURITY DEFINER`, `set search_path = ''`, execute to `authenticated` only, `auth.uid()` identity. The deferral instant must be an explicit-offset ISO-8601 instant (naive local rejected), strictly future, within 366 days, and is canonicalized to a millisecond UTC form matching ECMAScript `toISOString()`, so equal deferrals hash identically. `not_relevant` reuses the `dismissed` status and is recorded as a distinct kind on the audit/undo evidence (ADR-033) — no status `CHECK` migration. The RPC's authoritative open check accepts `status='open'` **or** a snoozed question past its `snoozed_until` (deterministic reactivation), so a reactivated question is resolvable and the automatic `snoozed → open` transition is captured as before-state evidence. Owner scoping (`P0002`, indistinguishable cross-owner/missing), entry lock + stale check (`55P03`), non-open/still-snoozed rejection (`55000`), canonical SHA-256 replay (`resolve-v2:` namespace) with `P0001`/`2D_IDEMPOTENCY_MISMATCH`, and atomic state + audit + undo mirror Slice 2D.1.
- The same migration extends `undo_operation(p_undo_id)` with a guarded `resolve_pending_question_v2` branch: it restores the exact prior open state (`open`, cleared `answer`/`answered_at`/`snoozed_until`) **only from the status the resolution evidence says it left behind**, so undoing a superseded resolution (e.g. a deferral whose reactivated question was later answered) fails with `2D_UNDO_RESTORE_INTEGRITY` instead of clobbering newer work. The `resolve_pending_question_v1` branch and every earlier branch are byte-identical to migration `202607230046`.
- The same migration widens `list_needs_attention`'s three open-question predicates to the deterministic read-time reactivation rule (open, or snoozed past its deadline); signature, `SECURITY DEFINER`, `search_path`, grants, and supporting index unchanged.
- The same migration adds `question_resolved` to the private `product_events` allowlist (table CHECK, per-event property validation, and `record_product_event`'s defense-in-depth guard), with its only property the bounded `kind ∈ {deferred, dismissed, not_relevant}` — content-free by construction; every other event branch reproduced byte-for-byte.
- `src/features/agent/question-visibility.ts` — `actionablePendingQuestionFilter`, the single application-side PostgREST predicate for an actionable (open, or reactivated-snoozed) pending question, mirrored by `list_needs_attention` and `resolve_pending_question_v2`, with unit tests.
- `supabase/tests/resolve_pending_question_v2.sql` — 76-assertion pgTAP suite (signature/security posture, v1 still-callable, `question_resolved` allowlist, closed shape for all four kinds, deferral-instant validation, non-disclosing denial, defer success/replay/mismatch, still-snoozed rejection, deterministic reactivation + resolvability, guarded superseded-undo, terminal dismissal + undo + redismissal, distinct `not_relevant` history, stale rejection, v1/v2 namespace isolation, immutable interpretation).
- Question-page disposition controls: Defer (inline profile-timezone `datetime-local` picker reusing the Phase 2C `localDateTimeToOffsetInstant`, with DST-gap/overlap rejection and a field-associated local error), Dismiss, and Not Relevant beside Answer, each with distinct states, per-kind undo controls, live regions, predictable focus, and ≥44px targets in PT-BR/English.

### Changed

- `scripts/remote-question-resolution-smoke.mjs` extended from 14 to 28 disposable authenticated cases, adding the disposition contract (closed-shape rejection, defer success/replay/mismatch, still-snoozed rejection + queue departure, deterministic reactivation + queue return + resolvability, guarded superseded-undo, terminal dismissal/undo/redismiss, distinct `not_relevant` history, stale deferral, v1/v2 namespace isolation, content-free `question_resolved` allowlist, immutable interpretation), still fail-closed with environment-snapshot preservation.
- `src/features/agent/question-resolution-contract.ts` — `QuestionResolutionCommand` extended to the four-variant discriminated union with the validated/canonicalized deferral instant; `serializeQuestionResolution` emits exactly the discriminant plus its content.
- The questions-page consumer cuts over to `resolve_pending_question_v2` via the new `resolvePendingQuestion` action (`answerPendingQuestion` retained as the answer-kind wrapper); dispositions emit the content-free `question_resolved` event (bounded `kind` only, suppressed on replay/failure) while answers keep `question_answered_basic`; `undoQuestionResolution` localizes its confirmation per resolution kind.
- The Home, Inbox, entry-review, and questions-page open-question queries now use `actionablePendingQuestionFilter` so read-time snooze reactivation converges every surface with `list_needs_attention`.
- `resolve_pending_question_v1` is untouched and remains callable for rollback; the client-side product-analytics contract gains `question_resolved`.

## 2026-07-23 — Phase 2D Slice 2D.1: traceable answer transition (merged via PR #11)

### Added

- Migration `202607230046` (additive): `resolve_pending_question_v1(p_question_id uuid, p_resolution jsonb, p_operation_key text) returns jsonb` — the first version of the single long-lived resolution RPC family (ADR-033). `SECURITY DEFINER`, `set search_path = ''`, execute granted to `authenticated` only (revoked from `public`/`anon`), owner identity from `auth.uid()` only. Slice 2D.1's closed discriminated `p_resolution` accepts exactly `{ "kind": "answer", "answer": <trimmed 1–4000 chars> }`; unknown keys, unknown kinds, non-string values, empty/whitespace answers, oversized payloads, and malformed operation keys (outside 8–240) are rejected with `22023` before any write. The transition validates owner-scoped existence (`P0002`, indistinguishable for cross-owner and missing), locks the owned entry and re-reads the question `FOR UPDATE`, rejects a stale interpretation (`55P03`) and a non-open question (`55000`), then atomically sets `status='answered'`/`answer`/`answered_at`, writes one audit row, and registers one `resolve-v1:`-namespaced undo operation carrying the canonical SHA-256 request fingerprint. Same key + same canonical payload replays the original result (`idempotent: true`); same key + different payload raises `P0001`/`2D_IDEMPOTENCY_MISMATCH`; two concurrent resolutions yield exactly one winner. The same migration extends `undo_operation(p_undo_id)` with a `resolve_pending_question_v1` branch restoring the exact prior state (`open`, cleared `answer`/`answered_at`) with an integrity check, immutable audit evidence, and idempotent repetition; all pre-existing undo branches are byte-identical to migration `202607220045`.
- Migration `202607230047` (additive forward-fix): replaces the answer normalization's `btrim(text)` (spaces only) with a POSIX `[[:space:]]` boundary trim so newline/tab-only answers are rejected as whitespace-only — discovered by the dedicated remote smoke immediately after `202607230046` was applied; migration 046 left unedited per the append-only convention.
- `src/features/agent/question-resolution-contract.ts` — closed, discriminated `QuestionResolutionCommand` (Zod strict; 2D.1 variant `{ questionId, kind: "answer", answer }` with trim + 1–4000 bounds) plus `serializeQuestionResolution` producing the exact `p_resolution` payload (never the question id), with unit tests for valid/trimming/empty/whitespace/overlong/unknown-kind/unknown-key/malformed commands.
- `scripts/remote-question-resolution-smoke.mjs` (`npm run test:remote:2d:resolution`) — disposable authenticated remote smoke: owner success with canonical trimming, deterministic replay, idempotency mismatch, non-open rejection, stale rejection after supersession, two-client concurrent single winner, cross-owner/missing indistinguishability, anonymous denial, audit/undo evidence and fingerprint agreement, exact-prior-state undo with idempotent repetition, post-undo re-answer, legacy answer-path compatibility, immutable interpretation JSON, and fail-closed cleanup with environment-snapshot preservation.
- `supabase/tests/resolve_pending_question.sql` — 55-assertion pgTAP suite covering the exact signature, `SECURITY DEFINER`, empty `search_path`, grants/revokes, legacy-path grant compatibility, closed-shape rejection, anonymous/cross-owner/missing denial without disclosure, owner success, canonical fingerprint agreement, replay/mismatch, non-open and stale rejection with atomic rollback of reserved evidence, undo restore/repeat, post-undo resolvability, and immutable interpretation evidence.
- `QuestionAnswerForm` undo control and distinct visible states (`editing`, `submitting`, `answered`, per-failure codes) with PT-BR/English copy, field-associated validation errors (`aria-invalid`/`aria-describedby`), polite pending live region, `status`/`alert` result regions with predictable focus, a controlled answer field that survives failed submissions, and ≥44px controls at mobile widths.

### Changed

- `answerPendingQuestion` (exported name preserved) now authenticates, validates the closed command, calls `resolve_pending_question_v1`, and maps database outcomes to stable localized codes (`validation_error`, `session_expired`, `stale_interpretation`, `not_open`, `idempotency_mismatch`, `retryable_failure`, `resolution_succeeded`) — raw SQL text never reaches the UI. The client preserves the operation key across retries of the same answer and rotates it when the answer text changes or after a successful undo. The fail-open, content-free `question_answered_basic` event is now deterministic per resolution operation key and is not re-emitted on idempotent replays. A new `undoQuestionResolution` action executes the stored compensating operation and revalidates the question surfaces.
- The legacy owner-scoped plain-`UPDATE` answer path remains grant-compatible (proven by remote smoke) until its removal is separately authorized.

## 2026-07-22 — Phase 2C Slice 2C.6: product convergence and closeout (branch, not merged)

Closeout slice — no migration, no RPC, and no product/UI source change. Slices 2C.1–2C.5 are merged to `main` (2C.5 via PR #9, base `b5c8edb`).

### Added

- `scripts/generate-phase-2c-traceability.mjs` (`npm run docs:phase-2c:traceability`) parses `docs/PHASE_2C_PRD.md` and emits `docs/reports/PHASE_2C_TRACEABILITY_MATRIX.md` — 83 rows mapping all 72 functional/non-functional requirement IDs (14 families), 6 per-epic acceptance criteria, and 5 global gates to owning slice(s) and durable evidence. Fails closed if the PRD inventory or any per-family count drifts, and never marks the two non-green requirements (`2C-STRUCTURE-004` deferred split/merge, `2C-UNDO-004` `undo_operation` residual risk) as complete.
- `scripts/verify-phase-2c-cleanup.mjs` (`npm run test:remote:2c:cleanup`) — fail-closed residual-data check across Auth users, 13 owner-scoped tables (including the Phase 2C `task_projects`/`task_contexts`/`task_people`/`task_dependencies`/`entry_task_candidate_resolutions` tables), and `user-files` storage.
- `test:remote:2c` aggregate (`remote-supabase-smoke.mjs --phase-2c`): a deterministic, fail-fast sequence of editable-candidate confirmation (v2–v6), candidate-analytics product events, and residual-data cleanup, plus the focused `test:remote:2c:confirmation` alias.
- `docs/reports/PHASE_2C_SLICE_06_REPORT.md` and `docs/PHASE_2C_REPORT.md` (phase-level closeout).

### Changed

- Convergence audit of the four daily surfaces (Home, Caixa/Inbox, entry review, canonical Work) plus the candidate form: the Slice 2X.16 projection-boundary guardrails and 714/714 unit tests are green; no raw row, raw enum/confidence, duplicate lifecycle rule, unbounded read, or content analytic was found. **No product source needed to change.**

### Fixed

- `scripts/remote-daily-cycle-smoke.mjs` concurrency-race assertion was stale relative to the Slice 2C.4 disposition contract: it expected two *different*-operation-key confirmations racing on the same candidate to both succeed with the same task id. Under the shipped contract (`2C-IDEMPOTENCY-005`, `2C-DISPOSITION-010`) the entry lock serializes them, one materializes the task plus its terminal `confirmed` disposition, and the loser is rejected with a terminal-disposition conflict (`P0001`). The smoke now asserts exactly one winner, one `P0001` conflict, and still exactly one task — a stronger, contract-accurate check (remote-evidence drift only; no product behavior changed).

## 2026-07-22 — Phase 2C Slice 2C.5: subtasks and dependencies (merged to `main` via PR #9)

### Added

- Migration `202607220044` (additive): `confirm_entry_task_candidates_v6` RPC — the exact `confirm_entry_task_candidates_v5` disposition contract, extended so each confirmed candidate's edit `changes` object may also carry `parentRef` (a single graph reference or `null`) and `dependsOn` (a bounded ≤20-element array of `{target, type: blocks|requires|related}`). A graph reference is a closed discriminated union: `{type:"candidateIndex", value:int}` targeting another confirmed candidate in the same batch, or `{type:"taskId", value:uuid}` targeting an existing owned, non-cancelled task (PRD `2C-STRUCTURE-002`). Reuses the pre-existing `tasks.parent_task_id` column and `task_dependencies` table — both already carry composite `(user_id, id)` ownership foreign keys from migration `202607170016`, so cross-owner graph edges are already impossible at the database level; v6 adds RPC-level validation only for a clear closed error contract (`2C_INVALID_GRAPH_REFERENCE`) and cycle safety (`2C_GRAPH_CYCLE`). Rejects self-reference, targets that are not confirmed in the same batch, cross-owner/cancelled task targets, and duplicate dependency targets. Cycle detection is proven to only need the intra-batch `candidateIndex` subgraph (an existing task's edges can never point at a not-yet-created task), implemented with two bounded recursive CTEs. Resolves candidate references to their newly created task ids in a second pass after every insert, so forward references resolve correctly, then writes `parent_task_id`/`task_dependencies` atomically. Sorted/deduplicated graph payload participates in the replay fingerprint.
- `src/features/tasks/relation-options.ts` now also loads a bounded (≤200) list of the user's own active tasks as `{id,label}` options for the parent/dependency pickers. `candidate-editor.tsx` gained a native parent `<select>` (grouped into this-review suggestions and existing tasks) and a `<select multiple>` dependency listbox with matching clear controls, disabled when nothing is selectable. `task-candidate-form.tsx` passes each candidate its sibling candidates so intra-batch parent/dependency references can be chosen before any task exists.
- `work-projection.ts`/`projection-mappers.ts`/`contracts.ts`/`task-list.tsx` hydrate and display each task's parent and dependency targets via the existing bounded two-step flat-select join, with fail-closed mapping.
- `supabase/tests/phase_2c_slice_5_task_graph.sql` (34 assertions) covers the schema/RLS/grants, self-reference/non-confirmed-target/malformed-shape rejection, cross-owner and cancelled taskId denial, direct and indirect cycle rejection, mixed-attempt atomicity, intra-batch and taskId parent/dependency materialization, fingerprint replay/mismatch sensitivity to the graph payload, the undo affected-count regression, retained dependency rows, and the analytics bound extension.

### Changed

- The live `resolveEntryTaskCandidates` Server Action now calls `confirm_entry_task_candidates_v6`; `v5` and every earlier RPC remain unchanged and callable. New graph-specific error codes map to stable localized results (`invalid_graph_reference`, `graph_cycle`).
- `candidate-edit-contract.ts` extends the closed Zod command with `parentRef`/`dependsOn`, canonicalizes both (sorted, deduplicated by target), and counts them as edited fields. The analytics edited-field ceiling grows from 11 to 13 (`require_task_candidates_confirmed_edit_counts` and `candidate_edit_reset`'s own `editedFieldCount` bound), continuing the per-slice forward-patch pattern.
- `database.types.ts` was regenerated twice from the linked schema and is byte-stable. The remote smoke now covers 29 candidate cases and includes `task_dependencies` in fatal cleanup/baseline parity.

### Fixed

- Migration `202607220045` replaces `undo_operation(uuid)` forward-only to avoid the same `pg_catalog.greatest(integer, integer)` lookup failure under `search_path=''` that migration `202607220042` already fixed once for Slice 2C.4 — reintroduced when migration `044`'s copy extended the v5/v6 branch. Migration `044` itself was left unedited, per this project's append-only convention.
- Two stale analytics-bound pgTAP assertions (`phase_2c_slice_3_owned_relations.sql`, `editable_candidate_analytics_events.sql`) that hardcoded the previous ceiling of 11/12 now target the current ceiling of 13/14, the same correction earlier slices already applied when the bound last grew.

### Verification

- Linked migrations are aligned through `202607220045`; linked DB lint at error level is clean (only the two pre-existing unrelated `run_user_heartbeat` warnings remain at warning level); linked generated types match the committed file byte-for-byte across two consecutive runs.
- The new 34-assertion pgTAP suite passed 34/34 online; seven earlier relevant candidate suites were re-run and passed after the two stale-bound assertions were corrected. The disposable remote smoke passed 29/29 with zero remaining users/fixtures and preserved pre-existing Auth IDs/table counts.
- Vitest passed 85 files/714 tests (up from 693); lint, typecheck, and the production build passed. The deterministic disposition Playwright spec (now exercising the v6 live path) passed 4/4 (PT-BR/en × desktop/Pixel 7). The full real-AI serial `intelligent-capture` journey and the `online-auth`/`online-mobile-navigation` specs continue to fail from pre-existing causes unchanged from `main` (worker/OpenAI latency and auth rate-limiting) — none touch the graph confirmation path.
- Independent review of the complete branch diff found no Critical/Important issue. The branch remains local: no push, PR, merge, or application deployment.
- See `docs/reports/PHASE_2C_SLICE_05_REPORT.md` for the complete contract, evidence, rollback state, and non-blocking notes.

## 2026-07-22 — Phase 2C Slice 2C.4: candidate dispositions (branch, not merged)

### Added

- Migration `202607220041` adds the narrow `entry_task_candidate_resolutions` provenance ledger and `confirm_entry_task_candidates_v5`. The database owns the exact terminal enum `confirmed`/`rejected`/`retained`/`dismissed`, derives ownership from `auth.uid()`, resolves a mixed batch atomically, creates tasks only for `confirmed`, and preserves all earlier RPC signatures.
- `src/features/tasks/candidate-disposition-contract.ts` provides the closed Zod command, canonical normalization, and serialization used by the client and Server Action. The candidate editor exposes one accessible decision group per selected candidate while leaving unselected candidates pending.
- Entry review now includes immutable, entry-local disposition history. Inbox and Needs Attention treat every terminal outcome as resolved; Work remains task-only and therefore shows only confirmed outcomes.
- `supabase/tests/phase_2c_slice_4_candidate_dispositions.sql` covers the schema/RLS/grants, v5 ownership and replay contract, all outcomes, mixed-batch atomicity, legacy compatibility, integrity triggers, undo, reconfirmation, record-only/current-interpretation checks, and lifecycle convergence.

### Changed

- Migration `202607220040` replaces the existing confirmation RPC bodies and uniqueness indexes forward-only so a supported undo can preserve cancelled task history and still allow a later confirmation with a new operation key.
- The existing undo architecture now owns v5 compensation: it removes exactly the operation's resolution rows, cancels only tasks created by that operation, validates drift before mutation, and restores pending state without inventing a parallel undo system.
- `confirmEntryTasks` calls the generated-type-checked v5 RPC and maps disposition/ownership/relation/replay errors to stable localized results. The existing `task_candidates_confirmed` event is emitted only for a non-idempotent batch containing at least one confirmation, with aggregate counts only and fail-open behavior; no disposition category, content, reason, or identity is recorded.
- `database.types.ts` was regenerated twice from the linked schema and is byte-stable. The remote smoke now covers 24 candidate cases and includes the resolution ledger in fatal cleanup/baseline parity; the deterministic Playwright spec covers PT-BR and English on desktop and Pixel 7.

### Fixed

- Migration `202607220042` replaces `undo_operation(uuid)` forward-only to avoid an invalid `pg_catalog.greatest(integer, integer)` lookup under `search_path=''` and returns the truthful larger affected count for mixed resolution batches.
- Migration `202607220043` permits only the safe legacy provenance enrichment `NULL → already-linked interpretation`, while continuing to reject every other confirmed-task identity change.
- Real linked pgTAP execution exposed two fixture defects: an unsupported `unlike` overload and an update against immutable interpretation rows. The canonical test now uses an equivalent `ok(... not like ...)` assertion and inserts record-only fixtures correctly.
- Full Vitest execution exposed two stale copy assertions from the pre-disposition confirmation model; they now assert the approved “resolve suggestions” language.

### Verification

- Linked migrations are aligned through `202607220043`; linked DB lint at error level is clean; linked generated types match the committed file byte-for-byte.
- Seven relevant linked pgTAP suites passed 290/290. The disposable remote smoke passed 24/24 with zero remaining users/fixtures and preserved pre-existing Auth IDs/table counts.
- Playwright passed 4/4 (PT-BR/en × desktop/Pixel 7). Vitest passed 85 files/693 tests; lint, typecheck, and the production build passed.
- Independent final review approved the complete branch diff with no Critical/Important finding. The branch remains local: no push, PR, merge, or application deployment.
- See `docs/reports/PHASE_2C_SLICE_04_REPORT.md` for the complete contract, evidence, rollback state, and non-blocking notes.

## 2026-07-22 — Phase 2C Slice 2C.3: owned relations (branch, not merged)

### Added

- Migration `202607220038` (additive): `confirm_entry_task_candidates_v4` RPC — the exact `confirm_entry_task_candidates_v3` contract, extended so each candidate's edit `changes` object may also carry `projectIds`/`contextIds`/`personIds`/`waitingOnPersonIds` (each a bounded, ≤20-element array of distinct owned UUIDs). Reuses the pre-existing `task_projects`/`task_contexts`/`task_people` junction tables per PRD `2C-RELATIONS-002`, not the dormant `tasks.waiting_on_person_id` scalar column; `task_people.role='involved'` covers the generic person relation, `role='waiting_on'` covers waiting-on. Validates every relation ID's `(user_id, id)` ownership across all candidates in one pass before any write, aborting the entire multi-candidate materialization atomically on any invalid/cross-owner ID (`2C_INVALID_RELATION`). Relation arrays are sorted/deduplicated before entering the replay fingerprint. Extends the correction-race guard trigger to also recognize the `confirm-v4:` operation-key namespace. Extends `private.require_task_candidates_confirmed_edit_counts`'s bound from `* 7` to `* 11` and `candidate_edit_reset`'s own `editedFieldCount` bound from `[1,3]` to `[1,11]` (a second, independently-discovered pre-existing staleness — see Fixed).
- `src/features/tasks/relation-options.ts` (`loadCandidateRelationOptions`): new server-only projection loading the authenticated user's own projects/contexts/people, bounded to 200 rows each, ordered by name, mapped to plain `{id,label}` pairs before ever reaching a Client Component.
- `supabase/tests/phase_2c_slice_3_owned_relations.sql`: a focused, additive pgTAP file (29 assertions) covering the v4 contract's structural relation validation, cross-owner denial per relation type, mixed valid/invalid atomic abort, full materialization across all four relation kinds with correct `task_people` roles, audit-evidence field-name-only privacy, idempotent replay sensitivity to the relation set, the guard-trigger and analytics-bound extensions, and legacy-v3 compatibility.

### Changed

- `src/features/tasks/candidate-edit-contract.ts`: `CandidateChanges`/`CandidateEditableField` extended with the four relation fields; `normalizeCandidateEdits` sorts/deduplicates each relation array and counts a non-empty array as an edited field (no AI baseline exists for relations, so any non-empty value is an edit).
- `src/features/tasks/candidate-editor.tsx`: four new native `<select multiple>` listboxes (project/context/person/waiting-on) with matching clear buttons, each disabled when the user owns nothing of that kind; reset clears all four alongside the existing seven fields.
- `src/features/tasks/task-candidate-form.tsx`, `src/features/daily-cycle/review-projection.ts`, `src/app/[locale]/app/inbox/[entryId]/page.tsx`: thread `relationOptions` from the new projection down to each `CandidateEditor`.
- `src/features/tasks/actions.ts`: `confirmEntryTasks` now calls `confirm_entry_task_candidates_v4`; maps the new `2C_INVALID_RELATION` error to a localized `invalid_relation` result code.
- `src/features/daily-cycle/contracts.ts`/`projection-mappers.ts`/`work-projection.ts`, `src/features/operations/task-list.tsx`: `WorkItemView` gained non-optional `projects`/`contexts`/`people`/`waitingOnPeople` (`RelationSummary[]`, always present, possibly empty); `work-projection.ts` hydrates them per page via a bounded two-step flat-select join across `task_projects`/`task_contexts`/`task_people` and `projects`/`contexts`/`people` (no Supabase embedded-resource select), matching the existing projects/people detail-page pattern; `TaskList` renders relation badges reusing the existing `status-badge` class.
- `src/lib/supabase/database.types.ts`: regenerated for the new `confirm_entry_task_candidates_v4` signature only (diffed byte-identical to the linked schema both before and after the forward-fix).
- `scripts/remote-editable-candidate-confirmation-smoke.mjs`: extended with 5 new cases (full relation materialization, cross-owner project denial, mixed valid/invalid atomic abort, legacy-v3 compatibility); fixed a latent bug where a second disposable test user reused the first user's email.
- `e2e/editable-candidate-confirmation.spec.ts`: extended with owned project/context/person fixtures and real listbox selection through the browser; verifies `task_projects`/`task_contexts`/`task_people` materialization and that the audit trail never contains relation IDs or names.

### Fixed

- `confirm_entry_task_candidates_v4`'s cross-owner ownership check for `personIds`/`waitingOnPersonIds` used `candidate_row.value -> 'personIds' || candidate_row.value -> 'waitingOnPersonIds'`. PostgreSQL gives `->` and `||` the same precedence and associates them left-to-right, so this parsed as `(candidate_row.value -> 'personIds' || candidate_row.value) -> 'waitingOnPersonIds'` — concatenating the personIds array with the entire candidate object as one extra element, then applying `->` with a text key to the resulting array (always `NULL`). `jsonb_array_elements_text(NULL)` in a `FROM` clause yields zero rows, so the ownership check never found anything to reject; the composite foreign key `task_people_person_owner_fk` still correctly rejected the resulting insert with SQLSTATE `23503` (no cross-owner row was ever persisted), but degraded the intended `2C_INVALID_RELATION` rejection into a confusing raw FK violation. Found while writing this slice's own pgTAP coverage, not assumed from a read-through. Migration `202607220039` (forward-fix, additive) parenthesizes both operands; `038` itself was left unedited once applied, per this project's append-only migration convention.
- `candidate_edit_reset`'s own `editedFieldCount` property bound was still `[1,3]` (set by migration `202607210034` for Phase 2C.1's 3 fields); Slice 2C.2 raised the real maximum possible reset-time edited-field count to 7 but never updated this specific bound. Fixed in the same migration `202607220038` that raises it to 11 for this slice's own fields.

### Verification

- 653/653 unit/component tests (up from 622), 0 ESLint errors, 0 `tsc --noEmit` errors, production build green.
- `npx supabase migration list --linked`: parity through `202607220039`. `npx supabase db lint --linked --level warning`: clean (only the pre-existing, unrelated `run_user_heartbeat` warning).
- `phase_2c_slice_3_owned_relations.sql` (29 assertions) executed for real online via `npx supabase db query --linked -f ...` after the forward-fix (Docker unavailable locally; `pgtap` temporarily installed into the linked project's `extensions` schema, removed afterward, not committed).
- `remote-editable-candidate-confirmation-smoke.mjs`: 23/23 cases passed, disposable fixtures cleaned up, pre-existing table counts and Auth users preserved.
- `editable-candidate-confirmation.spec.ts` online Playwright: 2/2 passed (desktop + Pixel 7), selecting real owned relations through the actual listbox controls.
- `intelligent-capture.spec.ts`'s deterministic-fixture describe block: 4/4 passed. Its real-AI-capture describe block's first serial test timed out waiting for the deployed worker to organize an entry — a pre-existing external dependency on worker/OpenAI dispatch latency, confirmed unrelated to this slice (no change anywhere in `supabase/functions/` or capture/job code).

## 2026-07-21 — Phase 2C Slice 2C.2: planning, priority, and no-due semantics (branch, not merged)

### Added

- Migration `202607210036` (additive): `confirm_entry_task_candidates_v3` RPC — the exact `confirm_entry_task_candidates_v2` contract, extended so each candidate's edit `changes` object may also carry `plannedAt`/`manualPriority`/`intentionalNoDue`/`noDueReason`. A new versioned RPC rather than widening v2 in place, per ADR-031's already-approved reasoning (rollback boundary, generated-client/PostgREST overload safety), which the implementation plan carries forward through Slices 2C.2–2C.5; `confirm_entry_task_candidates_v2` is unchanged and remains callable. Enforces due/no-due mutual consistency (`intentionalNoDue` true requires an effective `dueAt` of null; a non-null `noDueReason` requires `intentionalNoDue` true) inside the transaction before any write. Extends the Slice 2C.1 correction-race guard trigger (`guard_v2_confirmed_interpretation_correction`) to also recognize the `confirm-v3:` operation-key namespace. Adds table constraint `tasks_no_due_consistency_check` as defense in depth, independent of the RPC (safe additively — every existing row already satisfies it, since `intentional_no_due`/`no_due_reason` were never previously set by any code path).
- `supabase/tests/phase_2c_slice_2_planning_priority_no_due.sql`: a focused, additive pgTAP file (25 assertions) covering the v3 contract's structural validation, the due/no-due mutual-consistency rule (both directions), planned-date/priority materialization, one idempotent-replay case, the guard-trigger extension, legacy-v2 compatibility, and ownership denial. Does not re-derive the title/description/dueAt/replay/idempotency/ownership/atomicity machinery v3 shares with v2 — that is already exhaustively proved by `editable_candidate_confirmation.sql`/`editable_candidate_confirmation_race.sql` against v2's own copy of that logic.
- Migration `202607210037` (forward-fix, additive): `private.require_task_candidates_confirmed_edit_counts` (Issue #3, migration `202607210034`) bounded `editedFieldCount` at `editedCandidateCount * 3` — correct only for Phase 2C.1's 3 editable fields. Discovered by actually running the new Slice 2C.2 Playwright journey online: editing 2 candidates across all 7 now-editable fields (title, description, dueAt, plannedAt, manualPriority, intentionalNoDue, noDueReason) legitimately produces `editedFieldCount = 7`, which the stale `* 3` bound rejected (7 > 2×3=6), silently dropping the `task_candidates_confirmed` analytics event (fail-open, no crash, but not persisted). The bound is now `editedCandidateCount * 7`. The one Issue #3 pgTAP assertion whose test value assumed the old bound (`editedCandidateCount:1, editedFieldCount:4`, expected rejected) was updated to a value that still genuinely exceeds the corrected bound (`editedFieldCount:8`).

### Changed

- `src/features/tasks/candidate-edit-contract.ts`: `CandidateChanges`/`CandidateEditableField` extended with the four new fields; `manualPriorityValues` exported; `normalizeCandidateEdits` computes effective due/no-due state per candidate and throws when the mutual-consistency rule is violated, mirroring the RPC's own check for client-side UX (never a substitute for it).
- `src/features/tasks/candidate-editor.tsx`: new planned-date field (reusing `candidate-due-date.ts`'s DST-aware conversion), priority `<select>`, and a no-due checkbox that atomically clears/disables the due-date field and reveals an optional reason textarea when checked (unchecking clears the reason and re-enables due-date editing). Reset restores all seven fields to their baseline (immutable suggestion for title/description/dueAt; neutral/unset for the four new fields, since the AI never proposes them).
- `src/features/tasks/actions.ts`: `confirmEntryTasks` now calls `confirm_entry_task_candidates_v3`.
- `src/features/daily-cycle/contracts.ts`/`projection-mappers.ts`/`work-projection.ts`, `src/features/operations/task-list.tsx`: `WorkItemView` gained `plannedAt`/`priority`/`intentionalNoDue`/`noDueReason`; Work now selects, maps, and displays a planned-date line, a priority badge, and a "No due date" indicator (with reason) alongside the existing due-date/status badges.
- `src/lib/supabase/database.types.ts`: regenerated for the new `confirm_entry_task_candidates_v3` signature only (diffed byte-identical to the linked schema before committing).

### Verification

- 622/622 unit/component tests (up from 594), 0 ESLint errors, 0 `tsc --noEmit` errors, production build green.
- `npx supabase migration list --linked`: parity through `202607210037`. `npx supabase db lint --linked --level error`: clean.
- `phase_2c_slice_2_planning_priority_no_due.sql` (25 assertions) and a clean re-run of `editable_candidate_analytics_events.sql` (29 assertions, after the bound fix) both executed for real online via `npx supabase db query --linked -f ...` (Docker unavailable locally; `pgtap` temporarily installed into the linked project's `extensions` schema, removed afterward, not committed).
- `scripts/remote-editable-candidate-confirmation-smoke.mjs` extended from 13 to 18 disposable-fixture cases (planned date + priority materialization, intentional-no-due + reason materialization, mutual-consistency rejection, guard-trigger race + undo + post-undo correction, legacy-v2-still-defaults) — all passed, fixtures cleaned up, pre-existing data preserved.
- `node scripts/online-playwright.mjs e2e/editable-candidate-confirmation.spec.ts --project=desktop --project=mobile`: 2/2 passed, exercising every new field through the real browser UI against the real Server Action and linked database, including the `task_candidates_confirmed` analytics event that the bound fix above unblocked.
- `npx playwright test e2e/foundation.spec.ts` (offline, 3/3) and `node scripts/online-playwright.mjs e2e/intelligent-capture.spec.ts --project=desktop` (18/18) confirm no regression to the existing daily journey or Work rendering for tasks that never set the new fields.

## 2026-07-21 — Fix a pre-existing product-events validation gap found by running pgTAP online (branch, not merged)

### Fixed

- Migration `202607210035` (additive, forward-fix): `private.require_product_event_integer` and `private.require_product_event_enum` (both from migration `202607170024`, untouched since Phase 2X) silently accepted a payload that omitted its required property entirely. Root cause: `jsonb -> missing_key` returns SQL `NULL`; `jsonb_typeof(NULL)` is SQL `NULL`; `NULL <> 'number'`/`NULL <> 'string'` is SQL `NULL`; and PL/pgSQL treats a `NULL` `IF` condition as false, so neither function's guard clause ever raised for a missing key, and the integer helper's follow-up regex/bounds check inherited the same `NULL` and also never raised. Found by actually executing `supabase/tests/editable_candidate_analytics_events.sql` against the linked project (see below) rather than only reasoning through the SQL — the very first "missing required property" assertion failed against real, live validation. Both functions now check `p_properties ? p_key` first and raise `22023` immediately if the key is absent. Additive, same signatures, no behavior change for any payload that already includes its required key(s) with a valid value — every event that uses either helper (all `capture_*` events, `needs_attention_viewed`/`_item_opened`, `interpretation_corrected`, `task_candidates_presented`/`_confirmed`, `processing_retry_requested`, `work_view_viewed`, `task_status_changed`, and the two events added in migration `202607210034`) is affected identically. This gap was masked in practice by the TypeScript client's exact-key contract check before any request left the browser/server, but the database — the actual trust boundary in this codebase — did not independently enforce key presence until now.

### Verification

- Direct before/after proof: `select private.require_product_event_integer('{}'::jsonb, 'candidateCount', 1, 1);` and the equivalent `require_product_event_enum` call returned silently (no exception) before the fix, and raised `22023` after.
- `npx supabase db query --linked -f supabase/tests/editable_candidate_analytics_events.sql`: reported "failed 1 test of 29" before the fix; after applying `202607210035`, the same run showed no failure diagnostic (pgTAP's `finish()` only emits failure commentary; a clean pass surfaces none, consistent with the tool's single-result-set output showing the last assertion's own `ok` line instead) — all 29 assertions pass.
- `npx supabase migration list --linked`: parity through `202607210035`. `npx supabase db lint --linked --level error`: clean.
- `npm run test:remote:product-events`: re-passed after the fix (19 taxonomy events, 22 owner-visible rows, fixtures torn down).
- Generated types diffed byte-identical after this migration too — no regeneration needed.
- 594/594 application tests (unchanged), 0 lint/typecheck errors, production build unaffected by a database-only change.

## 2026-07-21 — Issue #3: enable editable-candidate analytics persistence (branch, not merged)

### Added

- Migration `202607210034` (additive): extends `product_events.event_name`'s CHECK constraint with `candidate_edit_started`/`candidate_edit_reset` (all 17 prior names preserved); extends `private.validate_product_event_properties` with their allowlisted-property validation (`candidate_edit_started.candidateCount` fixed at exactly 1; `candidate_edit_reset.editedFieldCount` bounded 1–3, the number of editable candidate fields) and with `task_candidates_confirmed`'s now-optional `editedCandidateCount`/`editedFieldCount`; adds `private.require_task_candidates_confirmed_edit_counts`, a new cross-field bound helper enforcing `0 ≤ editedCandidateCount ≤ candidateCount` and `0 ≤ editedFieldCount ≤ editedCandidateCount × 3` (both new properties optional together — legacy `{candidateCount}`-only payloads still persist; supplying exactly one of the pair is rejected); extends `private.record_product_event`'s own event-name guard with the two new names. `SECURITY DEFINER`, `set search_path = ''`, and existing grants/revokes preserved on every replaced function; no RPC signature, table shape, or generated-type change.
- `supabase/tests/editable_candidate_analytics_events.sql`: a focused, additive pgTAP file (29 assertions) covering both new events' valid/invalid payloads, the extended `task_candidates_confirmed` cross-field bounds (legacy-only, zero-edit, edited, and every invalid combination), unknown-property/unknown-event/cross-owner-subject rejection, RLS, and security-definer/search-path preservation. `supabase test db --linked` requires Docker locally even against a remote target (it runs `pg_prove` via a container image), unavailable on this workstation; executed instead via `npx supabase db query --linked -f supabase/tests/editable_candidate_analytics_events.sql` after temporarily installing `pgtap` into the `extensions` schema (not committed as a migration — removed again after verification, see the entry above this one for the finding it surfaced and its fix).
- `scripts/remote-product-events-smoke.mjs`: extended the canonical 17-event matrix to 19, added a legacy-payload-only `task_candidates_confirmed` persistence check and two invalid-payload rejection checks for the new events, and added direct row-level assertions that `candidate_edit_started`, `candidate_edit_reset`, and `task_candidates_confirmed`'s new counts are actually present in `product_events` (not merely that the RPC call didn't error).

### Verification

- `npx supabase migration list --linked`: local/remote parity through `202607210034`. `npx supabase db lint --linked --level error`: clean.
- `npx supabase gen types typescript --linked` diffed byte-identical (after normalizing line endings) against the committed `database.types.ts` — no regeneration needed, confirming no RPC signature or column-type change.
- `npm run test:remote:product-events`: passed against the linked development project (19 taxonomy events, 22 owner-visible rows, disposable fixtures created and torn down) — proves real persisted rows for all three analytics changes plus a rejected invalid payload.
- 594/594 unit/component tests (unchanged), 0 ESLint errors, 0 `tsc --noEmit` errors, production build green.
- No RPC, task-confirmation, undo, or idempotency-flow change; `confirm_entry_task_candidates`/`confirm_entry_task_candidates_v2` untouched.

## 2026-07-21 — Issue #3: editable-candidate analytics fast-follow (branch, not merged)

### Added

- `src/features/product-analytics/contracts.ts`: two new allowlisted events, `candidate_edit_started` (`{ candidateCount: 1 }`) and `candidate_edit_reset` (`{ editedFieldCount: number }`, bounded 0–300); `task_candidates_confirmed` extended with bounded `editedCandidateCount`/`editedFieldCount` alongside the existing `candidateCount`.
- `src/features/product-analytics/interaction-events.tsx`: `recordCandidateEditStarted` (deduplicated once per entry/candidate per tab session, matching the existing `recordOnce` session-storage pattern) and `recordCandidateEditReset` (a new non-deduplicating `recordRepeatable` path, since a user may meaningfully repeat a reset).

### Changed

- `src/features/tasks/candidate-editor.tsx`: takes a new required `entryId` prop; calls `recordCandidateEditStarted` from every real field mutation (title/description/due-date change or explicit clear) — never from expand/collapse, a prop-driven rerender, or a React Strict Mode double-mount, since it is only ever invoked from `emitEdit`, which itself is only reachable from user input handlers; calls `recordCandidateEditReset` only from the explicit "Restaurar sugestão"/"Reset to suggestion" action, with `editedFieldCount` taken from the current canonical normalized edit (`normalizeCandidateEdits` output), never from raw touched-field UI state.
- `src/features/tasks/task-candidate-form.tsx`: passes the new `entryId` prop through to `CandidateEditor`.
- `src/features/tasks/actions.ts` (`confirmEntryTasks`): derives `editedCandidateCount`/`editedFieldCount` server-side from the same validated canonical `candidateEdits` array already sent to `confirm_entry_task_candidates_v2` (a candidate counts as edited only if its canonical `changes` object is non-empty), and includes both in the `task_candidates_confirmed` event; idempotent replay (`confirmation.idempotent`) still skips the event entirely, so replay never double-fires it.

### Known gap at this commit (resolved same day — see the entry above)

- At this commit, `public.product_events`'s `event_name` CHECK constraint, `private.record_product_event`'s allowlist, and `private.validate_product_event_properties`'s `task_candidates_confirmed` case (all in migration `202607170024`) did not yet recognize `candidate_edit_started`, `candidate_edit_reset`, or the two new `task_candidates_confirmed` properties, so all three analytics calls were rejected by the database's own allowlist and dropped fail-open. Closed by migration `202607210034`, documented in the changelog entry above.

### Verification

- 594/594 unit/component tests (up from 579), 0 ESLint errors, 0 `tsc --noEmit` errors, production build green.
- No RPC, migration, or database change; no consumer of `confirm_entry_task_candidates`/`confirm_entry_task_candidates_v2` was touched.

## 2026-07-19 — Phase 2C Slice 2C.1: editable candidate confirmation (branch, not merged)

### Added

- Migration `202607190032`: `confirm_entry_task_candidates_v2` RPC (`SECURITY DEFINER`, `set search_path = ''`, `auth.uid()`-only identity) accepting a bounded, closed-allowlist edit array (`title`/`description`/`dueAt`) per selected candidate index; rejects duplicate/out-of-range/unselected-candidate edits, empty/overlong title, overlong description, and invalid/nonexistent/ambiguous due dates at the database boundary; canonicalizes effective values, stores a SHA-256 request fingerprint on `undo_operations` for same-key/different-payload replay rejection, and atomically materializes all selected tasks with a `2C_ALREADY_MATERIALIZED` guard against double confirmation. The legacy `confirm_entry_task_candidates(uuid, uuid, integer[], text)` RPC is unchanged and remains callable.
- Migration `202607190033`: `guard_v2_confirmed_interpretation_correction` trigger on `entry_interpretations` (`SECURITY DEFINER`, no public/authenticated execute grant) rejecting a `user_corrected` interpretation insert that would supersede an interpretation still backing active tasks from a v2 confirmation, closing a confirmation/correction race.
- `src/features/tasks/candidate-edit-contract.ts`: closed Zod schemas and canonicalization for candidate edit commands, byte-bounded serialization, and unique-index enforcement.
- `src/features/tasks/candidate-due-date.ts`: local wall-time↔offset-instant conversion against the profile IANA timezone, explicitly rejecting nonexistent (DST gap) and ambiguous (DST overlap) local times via a bounded ±24h-minute scan.
- `src/features/tasks/candidate-editor.tsx`: per-candidate inline edit/reset/explicit-clear UI with an "Edited" indicator, visible immutable suggestion, accessible fieldset/legend, keyboard/focus/live-region support, and 44px touch targets.
- `e2e/editable-candidate-confirmation.spec.ts` and `scripts/remote-editable-candidate-confirmation-smoke.mjs`: disposable-fixture live journeys through the real Server Action and linked database.
- `supabase/tests/editable_candidate_confirmation.sql` and `editable_candidate_confirmation_race.sql`: pgTAP coverage for the new RPC and the correction-race guard.

### Changed

- `src/features/tasks/task-candidate-form.tsx`: rewritten to hold an edit map keyed by candidate index (retained across deselect/reselect within the mounted page, excluded from the submitted command while deselected), rotate the operation key only when the canonical payload signature actually changes, and surface stable per-failure result codes instead of raw errors.
- `src/features/tasks/actions.ts` (`confirmEntryTasks`): re-validates every field server-side, never forwards client-supplied ownership or task identifiers, calls `confirm_entry_task_candidates_v2`, and maps every RPC error to a localized, stable code with no raw SQL/PostgREST text reaching the UI.
- `src/features/daily-cycle/review-projection.ts` / `src/app/[locale]/app/inbox/[entryId]/page.tsx`: thread the authenticated profile timezone (server-validated, default `America/Sao_Paulo`) into the editor.

### Known gap

- The PRD §14 / implementation-plan Task 5 analytics extension — `candidate_edit_started`, `candidate_edit_reset` events, and `editedCandidateCount`/`editedFieldCount` on `task_candidates_confirmed` — was not implemented in this slice; `task_candidates_confirmed` currently records only `candidateCount`. See `docs/reports/PHASE_2C_SLICE_01_FINAL_ACCEPTANCE.md`.

### Verification

- 579/579 unit/component tests (83 files), 0 ESLint errors, 0 `tsc --noEmit` errors, production build green, `git diff --check` clean.
- Migrations `202607190032`/`202607190033` at local/remote parity; `supabase db lint --linked --level error` clean.
- Live authenticated Playwright run (desktop + Pixel 7 projects) against the linked development database exercised edit, confirm, audit, and undo through the real production Server Action with a disposable fixture torn down afterward.
- Not pushed; no pull request opened; no hosting deployment occurred.

## 2026-07-19 — Phase 2C planning checkpoint

### Added

- `docs/PHASE_2C_PRD.md`, the canonical product contract for Editable Candidate Tasks and Transactional Materialization, including stable requirement IDs, exact 2C.1 semantics, UX, security/privacy, analytics, acceptance, risks, rollout, rollback, and full-phase Definition of Done.
- `docs/PHASE_2C_IMPLEMENTATION_PLAN.md`, the ordered 2C.1–2C.6 execution plan with an exact versioned RPC direction, transient edit command, atomic transaction, compatibility boundary, test matrix, per-slice gates, and authorization stops.
- ADR-031, accepting transient candidate edits, immutable suggestion provenance, a persistent task as the sole edited truth, and a versioned materialization contract while preserving the legacy RPC.

### Changed

- Current state, backlog, and Phase 2 roadmap now identify Phase 2C planning as approved and implementation as not started; Phase 2C.1 is limited to title, description, and due date, while split/merge remains isolated in Slice 2C.5.

### Verification

- Repository preflight matched clean `main`/`origin/main` at `89af5abad497fd2220ceac22704cf6abc57a20fe` before documentation work.
- Planning was reconciled against current candidate projection/form/action, `confirm_entry_task_candidates`, provenance, audit/undo, Needs Attention, Work, product events, generated types, pgTAP, remote smoke, authenticated Playwright, and installed Next.js 16.2.10 forms/Server Action guides.
- No product code, migration, generated type, Supabase state, Edge Function, secret, schedule, grant, RLS, Auth/email setting, remote infrastructure, feature branch, deployment, push, or PR changed.

## 2026-07-19 — Slice 2X.18: close remote parity and Phase 2X evidence

### Added

- `test:remote:2x`, a sequential fail-fast aggregate covering jobs, interpretation revisions, product events, entry processing, daily-cycle behavior, the complete Supabase baseline, and residual-data cleanup.
- `test:remote:2x:cleanup`, a read-only linked verifier for disposable Auth prefixes, owner-row orphans, and storage leftovers.
- Remote entry-worker assertions for persisted completion events, same-attempt deduplication, distinct reprocessing-attempt events, and unattended scheduled drain when the worker secret is not locally readable.
- A reproducible 283-row PRD traceability annex plus sanitized deployment/parity/Auth/cleanup evidence, alongside `docs/reports/PHASE_2X_SLICE_18_REPORT.md` and the complete `docs/PHASE_2X_REPORT.md` crosswalk.

### Changed

- Deployed only the accumulated committed `process-jobs` runtime from remote v12 to v13 after preserving the complete v12 rollback input. A fresh v13 download matches the local runtime and `_shared` dependencies exactly; the local-only Deno test was not deployed.
- The provider-auth E2E harness now avoids retrying email delivery to the reserved `example.com` domain after redacted linked Auth logs established HTTP 400 `email_address_invalid`; signup remains an explicit external skip and recovery core remains independently verified through a disposable administrative link.
- Shared-project smokes now use job-scoped claims, preflight and single-row reaping for disposable fixtures, rely on the existing scheduled drain instead of manually draining the global queue, and make every cleanup failure process-fatal.
- Permanent architecture, database, agent, security, standards, decision, state, backlog, and Phase 2 plan documents now describe the deployed Phase 2X closeout.

### Verification

- Remote aggregate passed all seven gates; direct initial/reprocess worker, scheduled drain, attachment compatibility, owner/RLS boundaries, idempotency, and final residual-data cleanup passed against active v13.
- Local Vitest passed 80 files/443 tests; lint, typecheck, Next.js 16.2.10 production build, and `git diff --check` passed.
- Playwright passed Foundation 3/3 per viewport, authenticated daily journey 18/18 per viewport, navigation 1/1 per viewport, sign-in/profile 2/2, and recovery core 2/2; provider signup is 2 explicit skips, not passes.
- Local and linked migrations match through `202607180031`; generated linked types match exactly; linked DB lint has only the two pre-existing `run_user_heartbeat` SQLSTATE `42804` warnings.
- Final cleanup found zero disposable users, zero orphaned entries/jobs/attachments/pending questions/tasks, zero owner-visible disposable product events after Auth deletion, and zero `remote-smoke.txt` storage leftovers.
- Independent final closeout review returned READY with no critical or important finding after shared-queue, cleanup, drain-outcome, and per-ID traceability remediation.
- No Deno or Docker/pgTAP pass is claimed. No migration, secret, schedule, grant, RLS, Auth/email configuration, other Edge Function, branch push, or non-disposable data change occurred.

## 2026-07-19 — Slice 2X.17: cover the converged daily journey

### Added

- Deterministic coverage for basic pending question, recoverable retry, and terminal retry in `e2e/intelligent-capture.spec.ts` — previously entirely absent, since these entry states are not reliably reachable through real, unambiguous AI extraction. Uses already-granted `authenticated` RPCs (`begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`) to force the exact state directly, the same technique the existing suite already used for forcing an unconfirmed candidate.
- Keyboard/focus/live-region/touch-target assertions on the entry-review page's progressive disclosure (native `<details>` technical panel, retry control).
- `docs/reports/PHASE_2X_SLICE_17_REPORT.md` with full scope, RED/GREEN evidence, and rollback.

### Changed

- `e2e/intelligent-capture.spec.ts` reorganized from one 379-line serial test into deterministic, independently-attributable named scenarios across two `test.describe` blocks — the existing real capture→review→confirmation→chat→reviews→files→costs→settings→heartbeat→undo→product-events journey is unchanged in behavior, only reorganized into 13 named tests; a second, new describe adds the 3 tests above.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: the "no interpretation yet" fallback's own retry button is now conditioned on `!canRetry`, removing a duplicate "Reinterpretar entrada"/"Reinterpret entry" button that appeared whenever an entry had never had a successful interpretation and its latest state was `recoverable_error`/`terminal_error` — found by real execution of the new retry scenarios, not by inspection. No capability was removed; retry is still offered exactly once, from whichever location is contextually correct.

### Verification

- Real RED found and fixed via actual online execution, not predicted: an initial wrong button-label assumption, then the duplicate-button defect above, then a flaky assertion on the ephemeral `useActionState` success toast (which races a legitimately fast worker pickup) — replaced with an assertion on the durable recovery signal instead.
- Full Vitest unchanged at 80 files/443 tests (E2E-only slice; the touched page has no render-based test harness in this codebase, only a source-text architecture guardrail — its behavior is validated through Playwright). ESLint, TypeScript, Next.js 16.2.10 production build, and `git diff --check` passed.
- Offline Playwright (`foundation.spec.ts`) desktop and mobile each passed 3/3, unaffected.
- Authenticated online `intelligent-capture.spec.ts` passed 18/18 on both desktop and mobile (full matrix, run twice during RED/GREEN iteration). `online-mobile-navigation.spec.ts` re-run 1/1 both projects to confirm no regression. `online-auth.spec.ts` re-run once (not modified): password recovery now genuinely passes both projects, resolving Slice 2X.16's `recovery-failed` observation as transient rate limiting; signup remains explicitly, traceably skipped on confirmed ongoing hosted-email quota exhaustion.
- Remote daily-cycle smoke and remote product-events smoke both passed against the linked project; linked migration status confirmed synchronized through `202607180031`; `supabase db lint --linked` showed only the same pre-existing, unrelated `run_user_heartbeat` warning.
- No migration, RPC, grant, generated database type, secret, schedule, deployment, or remote infrastructure mutation. No product-event contract changed. Does not close Phase 2X — Slice 2X.18 does.

## 2026-07-19 — Slice 2X.16: close the projection boundary across Home/Caixa/Work/review

### Added

- `src/features/daily-cycle/home-projection.ts` (`loadHomeSupplementalProjection`): a minimal `server-only` module owning Home's waiting-count and newest-open-question queries, explicitly owner-scoped.
- `src/features/daily-cycle/architecture.test.ts`: a table-driven architecture guardrail asserting forbidden/required source patterns (no `database.types`, no raw `.from()` table calls, no raw enum/score rendering) across Home, Caixa, Work, the entry review, and the candidate-confirmation form.
- `docs/reports/PHASE_2X_SLICE_16_REPORT.md` with full scope, evidence, and rollback.

### Changed

- Home's priority panel now reads `loadWorkProjection(..., { view: "today" })` directly — the same due-today/overdue rule, profile timezone, and fallback Work already uses — instead of a raw, divergent `tasks` query that ignored due dates entirely; it links to `/{locale}/app/work?view=today`. This also removes a raw internal-enum fallback (`task.status.replaceAll(...)`) since every `today` item has a `due_at`.
- `TaskCandidateForm` now accepts `ActionableCandidateView[]` (from `@/features/daily-cycle/contracts`) instead of the raw AI-extraction `TaskCandidate[]`: the confidence-score badge is gone, and the component no longer re-filters `unavailableIndexes` on the client — that validity rule is applied once, upstream, in `review-projection.ts`. Each candidate's own `key` (its true original extraction index) is now the submitted `candidateIndex` value.
- `EntryReviewProjection`'s public output no longer exposes the raw `taskCandidates`/`unavailableCandidateIndexes` fields; nothing outside `review-projection.ts` consumed them once the form moved to `actionableCandidates`.
- `src/features/interpretations/data.ts` now imports `server-only`, making its previously-only-conventional server boundary a build-time guarantee.

### Verification

- Strict TDD: focused RED confirmed missing modules/updated contracts before implementation; focused GREEN reached 28 files/196 tests across all touched surfaces.
- Full Vitest passed 80 files/443 tests (up from 78/425). ESLint, TypeScript, Next.js 16.2.10 production build, and `git diff --check` passed.
- Offline Playwright desktop and mobile each passed 3/3 with the same 5 expected credential-gated skips as the Slice 2X.15 baseline.
- Authenticated online Playwright passed 12/16; the 2 failures (`online-auth.spec.ts` signup and password-recovery journeys) are unrelated to this slice's file list and most likely reflect Supabase email-sending rate limits from the remote smoke scripts run immediately beforehand in the same session.
- Remote daily-cycle smoke and remote product-events smoke both passed against the linked project; linked migration status confirmed synchronized through `202607180031`; `supabase db lint --linked` showed only a pre-existing, unrelated warning in `run_user_heartbeat`.
- No migration, RPC, grant, generated database type, secret, schedule, deployment, or remote infrastructure mutation. No product-event contract changed.

## 2026-07-19 — Slice 2X.15: complete daily product funnel instrumentation

### Added

- A closed browser interaction boundary for capture intent, confirmed views, item opens and technical disclosure, with per-tab session identity, logical deduplication and no arbitrary client event names.
- Deterministic UUID idempotency keys for domain and worker outcomes, plus owner-scoped worker emission after persisted completion/failure.
- Complete focused tests, a 17-event authenticated remote smoke, safe bounded conversion/latency checks and owner-token-only Playwright event-name/count assertions.
- The durable trigger/subject/payload/failure inventory in `docs/reports/PHASE_2X_SLICE_15_REPORT.md`.

### Changed

- Capture, correction, candidate confirmation, question answer, processing retry and task-status Actions now record their approved outcome events only after the underlying mutation succeeds and independently of the product response.
- Home/Needs Attention, entry review/candidates/technical details and canonical Work now emit only meaningful visible/open interactions; render, hydration, prefetch, rerender, nested disclosure and no-op task updates do not overcount.
- The entry worker now records completion/failure/retry only after the respective persistence RPC succeeds, using the existing service-role owner-scoped event RPC.
- Event contracts expose an explicit version-1 map and preserve exact content-free payload allowlists.

### Verification

- Strict TDD recorded 18 focused files with 25 failures/60 passes before production changes and reached 18 files/134 tests green after the separate review regressions.
- Full Vitest passed 78 files/425 tests. ESLint, TypeScript, Next.js 16.2.10 production build and `git diff --check` pass. Offline Playwright desktop/mobile passed 6 tests with 10 credential-gated skips.
- Authenticated online Playwright passed intelligent capture on desktop/mobile and navigation on desktop/mobile (4 tests total). The expanded remote product-events smoke passed all 17 names, privacy/allowlist rejection, idempotency/meaningful repeat, ownership/RLS/service-role controls, bounded queries and cleanup.
- No migration, RPC, grant, generated database type, secret, schedule, deployment or remote infrastructure mutation. Local Edge Function source changed but was not deployed.

## 2026-07-19 — Slice 2X.14: visible promises aligned with behavior

### Added

- A static capability registry that records each authenticated product promise as operational, informational, advanced, or future, with its visible surface and consumer evidence.
- Owner-scoped server-only Settings and Reviews projections that return localized product DTOs and fail closed on unsupported persisted values.
- Home operational status derived from the existing Inbox and Needs Attention projections, plus PT-BR/English lexical and product-contract tests.
- The permanent capability inventory in `docs/PHASE_2X_REPORT.md` and execution evidence in `docs/reports/PHASE_2X_SLICE_14_REPORT.md`.

### Changed

- Settings now exposes only controls with real consumers. Proven AI routing and cost transparency use accessible progressive disclosure; identity, persisted locale, automatic review schedules, autonomy, privacy, follow-up intensity, and unused reasoning/background routes remain hidden.
- Saving Settings submits only visible fields, ignores reserved Next.js `$ACTION_` transport metadata, rejects unknown product keys, and preserves every hidden legacy value through owner-scoped server reads before calling the existing full-payload RPC.
- Reviews presents localized product period/status labels and on-demand generation language without exposing raw storage enums or `model_used`.
- Capture and reprocessing copy now distinguishes durable save, enqueue request, organizing, retry, and completion. Home no longer implies an automatic next review.

### Verification

- Strict TDD recorded the focused RED (10 files, 13 failures) and final focused GREEN (43 tests plus the Settings action regression). Full Vitest passes 75 files/404 tests; ESLint, TypeScript, Next.js 16.2.10 production build, and `git diff --check` pass.
- Offline Playwright desktop/mobile passes 6 tests with 10 credential-gated skips. Targeted authenticated Playwright passes 4 tests covering real Settings persistence and Home/Settings/Reviews reachability in PT-BR/English on desktop/mobile.
- No migration, RPC, Edge Function, generated database type, deployment, secret, or infrastructure mutation. Linked local/remote migration histories remain synchronized through `202607180031`.

## 2026-07-19 — Slice 2X.13: converged primary navigation and More grouping

### Added

- `src/features/shell/capabilities.ts` as the pure, tested route/product navigation contract: all authenticated pages are classified into primary, Context, Reflection, Organization, Transparency, Preferences, global, or advanced/context-only destinations; Jobs is never surfaced by common navigation.
- Deterministic active-state mapping for nested Inbox/review and Brain routes, canonical Work query views, and the localized `/today`, `/tasks`, and `/waiting` compatibility aliases. Canonical link and locale-switch helpers preserve locale plus meaningful query state without reading Supabase or persisted-domain state.
- Grouped desktop navigation and the same conceptual hierarchy inside mobile Mais/More, with localized accessible group names, visible focus, 44 px targets, bounded viewport overflow, Escape close/focus restoration, and DOM order aligned with visual/tab order.

### Changed

- Início/Home, Caixa/Inbox, Trabalho/Work, and Brain are now the only primary destinations on desktop and mobile. Capture remains global and visually distinct; Notifications remains the global icon; Projects, People, Memories, Files, Reviews, Questions, Reminders, History, Costs, and Settings remain reachable through their approved groups.
- The locale switch preserves the current localized pathname and supported query string instead of returning to Home.
- The shell no longer presents the static, unobservable "Brain atento" and "Brain ativo" claims. Existing canonical routes, nested routes, query views, legacy redirects, and direct technical access to Jobs remain unchanged.

### Verification

- Strict TDD: the initial focused run failed because `capabilities.ts` and the new hierarchy did not exist; a second RED exposed DOM/visual tab-order drift. Final focused GREEN: 2 files/9 tests. Full Vitest: 69 files/382 tests. ESLint, TypeScript, the Next.js 16.2.10 production build, and `git diff --check` pass.
- Offline Playwright desktop/mobile: 6 passed and 10 credential-gated online tests skipped, as expected for the standard offline command. Targeted authenticated online Playwright obtained all three linked `ONLINE_SUPABASE_*` credentials and passed desktop/mobile in PT-BR and English: 2 passed.
- No migration, RPC, Edge Function, generated type, secret, deployment, or infrastructure change. `supabase migration list --linked` confirms local and remote histories synchronized through `202607180031`.

## 2026-07-18 — Slice 2X.12: canonical Work route and task projection

### Added

- `src/features/daily-cycle/work-projection.ts`: server-only `loadWorkProjection`, the canonical Work page's only `tasks` reader. It scopes both profile and task queries to the authenticated owner, resolves an IANA timezone with the existing `America/Sao_Paulo` fallback, implements Today (overdue + due today, open, `due_at asc/id asc`), All (non-cancelled, `updated_at desc/id asc`) and Waiting (`waiting`, same stable updated ordering), retains the existing 50-item page/lookahead contract, and maps each row through the existing fail-closed `toWorkItemView` mapper.
- `src/features/daily-cycle/work-view.tsx`: localized PT-BR/English canonical Work presentation with accessible view links (`aria-current="page"`, native links, visible focus, 44px touch targets), short criteria copy per view, honest Waiting limitation copy, manual creation on All, DTO-only task rendering, and pagination URLs that preserve `view`.
- `src/app/[locale]/app/work/page.tsx` plus architecture/route tests. The page authenticates, parses the product view/page, calls only `loadWorkProjection`, and passes product DTOs to `WorkView`; it never imports database types or reads `tasks` directly.
- Focused tests for projection filtering/ordering/ownership/pagination/timezone/DTO actions/fail-closed mapping, Work presentation/localization/accessibility/actions/manual creation/pagination, exact route aliases, and canonical Work revalidation after creation/mutation/confirmation/undo. Playwright coverage now includes offline protection for every legacy route and credential-gated authenticated alias plus confirmed-task/undo Work assertions.

### Changed

- Localized `/today`, `/tasks`, and `/waiting` page modules are now safe redirects to `/{locale}/app/work?view=today|all|waiting&page=N`; locale, equivalent filter, and page are retained. Existing primary navigation destinations are deliberately unchanged until Slice 2X.13.
- `TaskList` now consumes `WorkItemView[]` instead of raw task rows/status strings, localizes the complete human-state/origin vocabulary without raw-enum fallback, formats deadlines in the authenticated profile timezone, and renders only actions supplied by `availableActions` (complete, wait, resume, reopen).
- `PaginationLinks` gained an optional product-query map so Work retains `view` while changing pages; all existing callers retain their original `?page=N` URLs.
- Manual task creation, task-status mutation, candidate confirmation, and candidate-creation undo now revalidate canonical Work in both locales while preserving their genuinely affected pre-existing Home/Inbox/legacy surfaces.

### Verification

- Strict TDD: the initial focused suite failed with 18 expected missing-slice failures; a second focused RED proved the product-action translation was still absent from the Server Action. Final focused GREEN: 6 files/29 tests. Full Vitest: 68 files/375 tests. Lint, typecheck, production Next 16.2.10 build, and `git diff --check` pass.
- Offline Playwright desktop/mobile: 6 passing, 10 credential-gated skips. Authenticated online alias/confirmed-task/undo assertions were authored but not run because `ONLINE_SUPABASE_URL`, `ONLINE_SUPABASE_PUBLISHABLE_KEY`, and `ONLINE_SUPABASE_SERVICE_ROLE_KEY` are absent; no online pass is claimed.
- No migration, RPC, Edge Function, generated type, or infrastructure change. `supabase migration list --linked` confirms local and remote histories synchronized through `202607180031`.

### Known limitation

- Primary navigation still points to some legacy task URLs; those destinations now converge through redirects, while reorganizing the navigation itself remains explicitly Slice 2X.13.
- The authenticated online Work journey is skipped in this environment due to absent `ONLINE_SUPABASE_*` credentials. Unit/architecture coverage and offline desktop/mobile route protection passed, but no live authenticated browser result is claimed.

## 2026-07-18 — Slice 2X.11: Needs Attention on Home and Caixa

### Added

- `src/features/daily-cycle/needs-attention-item.tsx` (`NeedsAttentionItemRow`): pure presentational row consuming only `NeedsAttentionItemView` — title, explanation, localized primary-action hint, timestamp, and a full-row link to the canonical `/{locale}/app/inbox/{entryId}` review route. Shared by both the Home preview and the Caixa full queue, mirroring the Slice 2X.6 `InboxItemRow` reuse pattern so both surfaces render the exact same row markup for the same DTO.
- `src/features/daily-cycle/needs-attention-list.tsx` (`NeedsAttentionList`, client component): renders the accumulated `NeedsAttentionItemView[]` for the Caixa `?view=needs-you` filter and owns keyset "load more" state entirely client-side — a "Carregar mais"/"Load more" button (hidden once `hasNext` is false) calls a bound Server Action with the last-seen `{ occurredAt, entryId }` cursor and appends the returned page to existing items. Duplicate clicks are prevented by disabling the button while a request is in flight; a failed page load leaves already-loaded items untouched and shows an inline, localized retry-safe error instead of losing state; there is no automatic retry loop.
- `src/features/daily-cycle/attention-actions.ts` (`loadMoreNeedsAttention`, Server Action): thin authenticated wrapper around `loadAttentionProjection` for the one client-driven pagination call site this slice adds. Returns a discriminated `{ ok: true; page }` / `{ ok: false; code: "session_expired" | "action_failed" }` result instead of letting a Supabase error or an unauthenticated call reject the promise uncaught in the browser.
- Home (`src/features/shell/home-dashboard.tsx`): a new "Precisa de você" panel calls `loadAttentionProjection` with a small bounded limit (3), renders up to three `NeedsAttentionItemRow`s, an honest count badge (`{items.length}` with a `+` suffix only when `hasNext` — never a promised exact total, since the RPC deliberately does not scan the user's full history per XG-025), an empty state, and a "Ver tudo"/"View all" link to `/{locale}/app/inbox?view=needs-you`. Existing panel kickers were renumbered (02 → 06) to make room; no existing panel's behavior changed.
- Caixa (`src/app/[locale]/app/inbox/page.tsx`): a new two-tab `InboxViewTabs` nav ("Todos"/"All" and "Precisa de você"/"Needs you", `aria-current="page"` on the active tab) and a `?view=needs-you` branch that loads the first page via `loadAttentionProjection` (no cursor — a stable, bookmarkable URL) and renders it through `NeedsAttentionList`, with its own empty state. The default (`all`) branch is otherwise unchanged, including its existing offset-based `page` pagination.
- `src/i18n/messages.ts`: new `home.needsAttention`, `home.needsAttentionEmpty`, `home.viewAll` keys (pt-BR/en). Tab labels and empty-state copy inside `daily-cycle`/inbox files follow the existing local `pt ? "…" : "…"` convention already used by every other file in that module, not `messages.ts`.
- CSS (`src/app/operations.css`): `.attention-panel`, `.attention-count`, `.needs-attention-action-hint`, `.panel-view-all`, `.inbox-view-tabs` (with `aria-current` styling and 44px touch targets), `.needs-attention-list`, `.load-more-button`, `.needs-attention-error`, reusing `.list-row`/`.list-stack`/`.count`/`.button-secondary`/`.form-error` wherever the existing shape already matched.
- `e2e/intelligent-capture.spec.ts`: extended the existing authenticated online journey with a Needs Attention detour before candidate confirmation — the Home panel lists the entry, "Ver tudo" navigates to the Caixa `?view=needs-you` filter with the tab marked active, the row's link lands back on the same entry's review page, and the English tab label renders correctly on a direct visit to the localized URL. Not executed in this session (no `ONLINE_SUPABASE_*` credentials on this workstation) — see Known limitation.

### Decisions

- **Client-side accumulation instead of URL-encoded cursor pagination for the Caixa queue.** The general pagination requirements for this slice (preserve already-loaded items on a failed subsequent page, prevent duplicate load-more requests, avoid infinite retry loops) are not achievable with pure server-rendered `Link` navigation, since a failed page load there would replace the whole rendered list. `NeedsAttentionList` is the first client component in this codebase to drive pagination through a bound Server Action; it introduces no new abstraction beyond this one call site (no generic "paginated list" framework). The `?view=needs-you` URL itself stays stable and bookmarkable — only the first page is server-rendered; deeper "load more" state is not reflected in the URL, consistent with XG-027 (a refresh naturally reloads page one of a live queue, which is expected, not a defect).
- **Home's count badge shows only what the bounded page proves, never a promised exact total.** `list_needs_attention` deliberately does not scan a user's full entry history (XG-025), so there is no cheap exact count to show. `{items.length}` plus a `+` suffix when `hasNext` is the honest signal available without a second, unbounded query — consistent with TRU-002/TRU-A04 (no message may claim more than what actually happened/is known).
- **`needs_attention_viewed`/`needs_attention_item_opened` product events are intentionally not emitted by this slice.** Both event names and their property schemas already exist (Slice 2X.2), but wiring client-side view/open emitters is explicitly Slice 2X.15's file list ("adicionar emissores pequenos aos componentes Home/attention/review/work"), and no client-invoked emitter of any kind exists anywhere in this codebase yet (`recordProductInteraction` has zero production callers before this slice). Building that pattern for a single call site now would be exactly the kind of premature, single-consumer abstraction the engineering standards warn against. See the Slice 2X.11 report for the full reasoning.
- **No new filters beyond "Todos"/"Precisa de você".** The PRD's full Caixa filter set (Todos, Precisa de você, Organizando, Prontos, Com problema — FLOW-010) is not this slice's scope; the implementation plan's own file list for 2X.11 authorizes only the one canonical `view=needs-you` filter.

### Verification

- `npm test`: 64 files / 357 tests passing (13 new: 4 `needs-attention-item.test.tsx`, 5 `needs-attention-list.test.tsx`, 3 `attention-actions.test.ts`, plus 5 new/adjusted cases in `home-dashboard.test.tsx`). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing, `/[locale]/app/inbox` and `/[locale]/app` both compile.
- Offline Playwright (`desktop`+`mobile`): 4/4 passing, 10 expected online skips — unchanged from the Slice 2X.10 baseline; this slice's new online assertions are gated behind the same pre-existing `ONLINE_SUPABASE_*` skip. `git diff --check`: clean (pre-existing LF/CRLF advisories only).
- No migration in this slice; local/remote migrations remain synchronized through `031`.

### Known limitation

- The online authenticated Playwright addition described above was authored and reviewed but not executed — this workstation has no `ONLINE_SUPABASE_*` credentials. No claim of online execution is made for it.
- This slice does not assert that a fully-confirmed entry disappears from the Needs Attention queue end-to-end in the online journey: that specific fixture's post-confirmation entry status is not deterministic (the existing spec itself tolerates either `awaiting_review` or `completed`), and if the entry stays `awaiting_review` it correctly remains queued under `review_interpretation` rather than vanishing. That exact removal invariant is already deterministically proven at the unit/RPC level by Slice 2X.10's own `attention-projection.test.ts` and `needs_attention_projection.sql` regression case, under a controlled fixture — this slice does not need to re-prove it under an ambiguous one.
- Home's count badge is a lower bound (`items.length`, `+` when `hasNext`), never an exact total of the user's full Needs Attention backlog, by design (see Decisions).

## 2026-07-18 — Slice 2X.10: Needs Attention query and projection

### Added

- Migration `202607180030_phase_2x_needs_attention_projection.sql`: RPC `list_needs_attention(p_limit, p_cursor_occurred_at, p_cursor_entry_id)` — `SECURITY DEFINER`, owner-scoped via `auth.uid()`, `set search_path = ''` — reimplements the exact five-reason precedence already codified in `src/features/daily-cycle/lifecycle.ts` (`resolveDailyCycleLifecycle`) directly in SQL, since that TypeScript mapper cannot run inside Postgres and Inbox's existing fixed-page approach does not generalize to "every entry that currently qualifies" across an unbounded entry history. Filtering is restricted to a bounded candidate set (entries whose status alone already implies possible attention; `completed` entries with a non-empty, non-record-only current-interpretation candidate list or an open pending question; the narrow `saved`+settled-or-unrecognized-job fallback) so the queue stays paginable without an unbounded per-user scan (XG-025). Returns only ids, reason codes, timestamps, and keys — no copy, no trust. Also adds the supporting partial index `jobs_interpret_entry_status_idx`. Grants execute to `authenticated` only.
- Migration `202607180031_fix_needs_attention_candidate_correlation.sql`: same-session hotfix (applied before either migration was committed) fixing a real defect the extended remote smoke found — see Fixed below.
- `src/features/daily-cycle/attention-projection.ts` (`loadAttentionProjection`, `ATTENTION_PAGE_SIZE`): server-only loader that calls `list_needs_attention`, never recomputes lifecycle, and hydrates only the page actually returned (entry original content / current interpretation summary for the title, minimal additional owner-scoped queries) into `NeedsAttentionItemView` through the existing Slice 2X.1 mapper `toNeedsAttentionItemView`. Its primary action reuses `review-projection.ts`'s `attentionActionId` (now exported) so a queue item's action id always matches the entry-review page's own action for the same reason; `href` always points at the canonical `/{locale}/app/inbox/{entryId}` review route rather than duplicating the review UI inline. Fails closed by dropping (not fabricating) a row whose entry cannot be hydrated or whose reason the current contracts don't recognize. 13 new tests (`attention-projection.test.ts`).
- `supabase/tests/needs_attention_projection.sql` (new, 35 pgTAP assertions): function/grant/security-definer/search-path contract; every reason across a realistic entries/jobs/interpretations/tasks/pending_questions fixture set (including the NY-006/NY-007 automatic-vs-manual-retry distinction and the `answer_existing_question` precedence over `confirm_existing_candidates`); cross-owner isolation; deterministic full-order and keyset-pagination assertions with an explicit same-timestamp tie-break case; response-shape spot checks (`current_interpretation_id`/`job_id`/`open_question_id` populated or left `null`, never invented); a limit-clamping case; and a dedicated regression for the migration-031 defect (confirm one of two candidates, assert still listed; confirm the second, assert resolved) exercised through the real `confirm_entry_task_candidates` RPC.
- `scripts/remote-daily-cycle-smoke.mjs`: extended with needs-attention fixtures — a qualifying entry with unconfirmed candidates is listed; partial confirmation keeps it listed; full confirmation resolves it out of the queue; another owner's entries never leak in either direction; three-page keyset pagination has no overlap/duplication; response time is asserted bounded. A new helper, `moveToCompletedWithSameCandidates`, corrects a freshly-persisted interpretation to `completed`/`auto_apply` (since `persist_entry_interpretation`'s `model_only_element_trust` can never itself reach `auto_apply` — its score ceiling is 0.25, always below the 0.55 threshold, by design) while preserving the same candidates. A new helper, `settleInterpretEntryJob`, claims and completes the fixture's underlying `interpret_entry` job via the service-role client, reproducing what the deployed worker always does in the same cycle it persists an interpretation — without it, the job stays `pending` and the lifecycle mapper (correctly) reports `organizing` regardless of entry status.

### Fixed

- `has_unconfirmed_candidate` (inside `list_needs_attention`) named its `generate_series` output `candidate_index` — identical to `tasks.candidate_index`. Inside the correlated `tasks` subquery, the unqualified `candidate_index` reference on the right-hand side of `t.candidate_index = candidate_index` resolved against the innermost scope (`tasks` itself), making the comparison `t.candidate_index = t.candidate_index` — always true — instead of comparing against the outer loop value. Confirmed live against the linked project before the fix: as soon as any task existed for an entry, the check went false for every candidate index, so confirming one of two current candidates incorrectly removed the entry from the queue entirely instead of leaving it listed until the second candidate was resolved (NY-004/NY-013). Migration `031` (`create or replace function`, identical signature/grants/index) renames the alias to the unambiguous two-part form `candidate_slot(idx)`, referenced explicitly as `candidate_slot.idx`. See `DECISIONS.md` ADR-027.

### Verification

- `npm test`: 61 files / 340 tests passing (13 new). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing.
- `supabase db push` applied `030` (after fixing a `min(uuid)` aggregate error — Postgres has no `min()`/`max()` for `uuid` — before anything committed remotely) and then `031`; `supabase migration list --linked` shows local/remote synchronized through `031`. `supabase db lint --linked --level warning`: only the single pre-existing, unrelated `run_user_heartbeat` finding. `supabase gen types typescript --linked` produced no diff after `031` (unchanged signature from `030`).
- `npm run test:remote:daily-cycle` passed in full after the `031` fix, including every needs-attention scenario above. `npm run test:remote:entry-processing` and `npm run test:remote:jobs` were re-run unchanged and passed, confirming no regression outside this slice's scope.
- Offline Playwright (`desktop`+`mobile`): 4/4 passing, 10 expected online skips — unchanged from the Slice 2X.9 baseline; this slice adds no route or UI. `git diff --check`: clean (pre-existing LF/CRLF advisories only).

### Known limitation

- `supabase/tests/needs_attention_projection.sql` is committed but could not execute locally (Docker unavailable — the same pre-existing environment gap as every other pgTAP file in this project); the remote smoke's real execution against the linked project is the equivalent verification, and is in fact how the migration-031 defect was actually found.
- An entry sitting in `interpreting`/`reprocessing` whose job independently becomes `exhausted` or reaches an unrecognized status before the entry's own status reflects that (a transient, self-correcting race — `fail_entry_interpretation`/`reap_expired_jobs` update both together in every existing path) will not surface in the queue until that status settles. Documented in the migration itself; not a new class of risk this slice introduces.
- No UI consumes `list_needs_attention`/`loadAttentionProjection` yet — Slice 2X.11 wires Home/Caixa onto it.

## 2026-07-18 — Slice 2X.9: decision-first progressive-disclosure entry review

### Added

- `src/features/daily-cycle/entry-review.tsx`: `EntryReview` composes four always-visible blocks in order — `ReviewUnderstanding` (the interpretation's `understanding` text, status badge, and the DTO's `humanFields`, rendered for the first time), `ReviewAttention` (`view.attentionItems`, with the retry button and a specific error/pending-question detail injected by the page as slot content — the component itself never branches on internal state or reads Supabase), `ReviewNextActions` (a labeled wrapper around whatever action content the page supplies), and `OriginalRecord` (the existing collapsed-by-default original-entry disclosure). 13 new tests (`entry-review.test.tsx`).
- `src/features/daily-cycle/technical-details.tsx`: `TechnicalDetails` consolidates the former two-column grid — per-element trust/scores/policy/evidence/overrides, the immutable version history with field-by-field comparisons, and the structured extraction (concepts, dates, entity links, mentions, none of which are part of a public DTO but all of which continue to come from the review projection's `editableCurrent`) — behind a single native `<details>`, collapsed by default. When `hasTechnicalDetails` is `false` it renders nothing; when the technical-details load failed but a current interpretation exists, it renders a fallback message instead of blocking or hiding the main review (matching the Slice 2X.8 independent-failure guarantee). 7 new tests (`technical-details.test.tsx`).

### Changed

- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: rewritten to compose `EntryReview`/`TechnicalDetails` instead of rendering the interpretation grid, trust panel, and revision history inline. Visibility of the correction editor, its undo button, and the candidate-confirmation form is now derived exclusively from `view.availableActions` (`correct_interpretation`, `undo_correction`, `confirm_existing_candidates`) instead of ad hoc truthiness checks on raw arrays — `confirm_existing_candidates` in particular now gates on the interpretation-scoped `actionableCandidates` count rather than the unfiltered `taskCandidates.length`, so a fully-covered candidate set never renders a form only to have it immediately report "nothing pending." The page still loads exclusively through the two Slice 2X.8 projections; `page.architecture.test.ts` continues to pass unchanged.
- `src/features/interpretations/revision-editor.tsx`: `InterpretationRevisionEditor` gained an optional `showSummary` prop (default `true`). The entry-detail page now passes `showSummary={false}` because the same summary text is already the page's primary heading (`ReviewUnderstanding`'s `view.understanding`); no other prop or behavior changed. 1 new test.
- `src/app/operations.css`: added styles for `.entry-review`, `.review-facts`, `.review-organizing-note`, `.attention-notice`/`.attention-safety-note`/`.attention-detail`, and `.technical-details`/`.technical-details-body`, including a `max-width:600px` adjustment and a `:focus-visible` outline on the technical-details `<summary>`; no existing selector was renamed or removed.
- `e2e/intelligent-capture.spec.ts`: `waitForOrganized` now polls for the "Ver detalhes técnicos" disclosure summary instead of the (now-collapsed) "Confiança por elemento" heading; the pt-BR and en assertions against the trust panel and immutable-history heading now click that disclosure open first. No other journey step, selector, or assertion changed.

### Known limitation

- The online authenticated Playwright journey (`e2e/intelligent-capture.spec.ts`) was updated to match the new markup but could not be re-executed in this environment — no `ONLINE_SUPABASE_*` credentials are configured. Offline Playwright (desktop+mobile, 4 passed / 10 skipped, unchanged from the pre-slice baseline), the full unit suite (323 tests, 21 new), lint, typecheck, and the production build all passed.

## 2026-07-18 — Hotfix: candidate lifecycle scoped to the current interpretation (F1)

### Fixed

- The architecture review of Slices 2X.5–2X.8 (`docs/reports/PHASE_2X_SLICES_2X5_2X8_ARCHITECTURE_REVIEW.md`, finding F1) found that `hasMaterializedTaskForCandidates` — the lifecycle input that decides whether an entry's `productState` can resolve to `ready` — was computed entry-wide in both `src/features/daily-cycle/inbox-projection.ts` and `src/features/daily-cycle/review-projection.ts` ("does any non-cancelled task exist for this entry") instead of interpretation/candidate-scoped ("does every one of the current interpretation's task candidates already have a matching materialized task"). Confirming only one of two candidates from a single, uncorrected interpretation made the entry read `ready` on Inbox/Home/entry-detail while the still-unconfirmed second candidate remained visible in `TaskCandidateForm` — a status badge, an available-actions list, and a rendered form disagreeing about the same entry. `lifecycle.ts` itself was already correctly specified (verified by its own unit tests); only the two loaders computed its input incorrectly.
- Both loaders now derive `hasMaterializedTaskForCandidates` from the same interpretation-scoped source `review-projection.ts` already used correctly for `actionableCandidates`: a new pure helper `hasUnconfirmedTaskCandidates(candidateCount, unavailableCandidateIndexes)` (`src/features/interpretations/data.ts`, colocated with `computeUnavailableCandidateIndexes`) returns whether any candidate index in `[0, candidateCount)` is missing from the already-covered set. `review-projection.ts`'s `loadEntryReviewProjection` now feeds it the `unavailableCandidateIndexes` `loadInterpretationReview` already computes. `inbox-projection.ts`'s `tasks` query now additionally selects `source_interpretation_id`/`candidate_index` (previously only `source_entry_id`), groups tasks per entry, and runs `computeUnavailableCandidateIndexes` per entry against that entry's `current_interpretation_id` before the same helper decides coverage. Neither `lifecycle.ts`, `resolveDailyCycleLifecycle`'s contract, candidate confirmation semantics, `TaskCandidateForm`, nor any RPC/migration changed.

### Added

- `src/features/interpretations/data.test.ts`: 6 new cases for `hasUnconfirmedTaskCandidates`.
- `src/features/daily-cycle/inbox-projection.test.ts`: 4 new cases — partial confirmation stays `needs_attention`, full confirmation resolves `ready`, a task from an older interpretation doesn't count, a task for a mismatched candidate index doesn't count.
- `src/features/daily-cycle/review-projection.test.ts`: 5 new cases covering the same partial/full/older-interpretation/mismatched-index/zero-candidates matrix at the `loadEntryReviewProjection` level.
- `src/features/daily-cycle/lifecycle-consistency.test.ts` (new file): drives equivalent fixtures through `loadInboxProjection` and `loadEntryReviewProjection` and asserts both resolve the same `productState`/`attentionReason` for the same entry.

### Verification

- `npm test`: 58 files / 302 tests passing (35 new). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing.
- Offline Playwright (`desktop`+`mobile`): 4/4 passing, 10 expected online skips — unchanged from the Slice 2X.8 baseline.
- No migration, RPC, or schema change — `tasks.source_interpretation_id`/`candidate_index` already existed and were already read by `interpretations/data.ts`. Local/remote migrations remain synchronized through `029`.
- `git diff --check`: clean (only pre-existing LF/CRLF advisories).
- Full report: `docs/reports/PHASE_2X_CANDIDATE_LIFECYCLE_HOTFIX_REPORT.md`.

## 2026-07-18 — Phase 2X Slice 2X.8 separated review and technical-details projections

### Added

- `src/features/daily-cycle/review-projection.ts`: pure `toEntryReviewProjection` mapper producing the Slice 2X.1 `InterpretationReviewView` (understanding, human fields, attention items, actionable candidates, materialized tasks, available actions, original record, no scores/policies/evidence) plus the non-frozen editable/candidate data the still-unchanged `InterpretationRevisionEditor`/`TaskCandidateForm` components require; `productState`/`availableActions` are computed through the shared `resolveDailyCycleLifecycle` mapper (Slice 2X.1/2X.6), never a raw `entries.status` read. A thin `server-only` `loadEntryReviewProjection` wrapper reuses `loadInterpretationReview` plus an owner-scoped `interpret_entry` job lookup and `pending_questions` check (mirroring `inbox-projection.ts`'s Slice 2X.6 query shape) to feed the mapper.
- `src/features/daily-cycle/technical-details-projection.ts`: pure `toEntryTechnicalDetailsView` mapper producing the complete Slice 2X.1 `InterpretationTechnicalDetailsView` (per-element scores/policies/signals/evidence/overrides, version-to-version field comparisons, per-task candidate provenance, model/source) plus a thin `loadEntryTechnicalDetailsProjection` wrapper performing its own independent `loadInterpretationReview` call — deliberately separate from the review loader so a technical-detail failure can never block or misreport the primary review.
- `src/app/[locale]/app/inbox/[entryId]/page.architecture.test.ts` (new): forbids `database.types`, `Database["public"]`, `@/lib/supabase/server`, and raw `entry.status` reads in the page file, and asserts it only loads data through the two new daily-cycle projections.
- 19 new Vitest cases across `review-projection.test.ts` (10), `technical-details-projection.test.ts` (7), and `page.architecture.test.ts` (2) covering: the human contract never containing a score/policy/evidence/signal key; lifecycle-driven `productState` instead of a raw internal status; record-only interpretations hiding candidates and the confirm action; unavailable-candidate-index exclusion; materialized tasks scoped to the current interpretation only; `retry_processing` gated strictly by `could_not_organize`; original content/`isRetroactive` preserved even with no interpretation yet; full `isDailyCycleSerializable` conformance of both DTOs; per-element score/policy/signal/evidence/override extraction; version-to-version comparisons; per-task provenance; loader-level null/ownership propagation; and the page's import boundary.

### Changed

- `src/features/interpretations/data.ts`: `loadInterpretationReview` is now internal infrastructure — its new exported `InterpretationReviewData` type documents that only the two daily-cycle projection modules above are its intended consumers, not page components.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: rewritten to load exclusively through `loadEntryReviewProjection`/`loadEntryTechnicalDetailsProjection`. No Supabase row or `Database` type is imported by the page. The status badge, the error/organizing notice cards, and the retry button's visibility are now driven by `productState`/`availableActions` instead of `entries.status`/`entry.processing_error`. Two small, deliberate consequences of centralizing lifecycle through the shared mapper: `recoverable_error` and `terminal_error` (previously only the former offered a retry button) both now map to `could_not_organize`/`retry_processing` and both offer retry; and the old `reprocessing`-only "reinterpretation in progress" banner is now the same shared `organizing` banner already used by Caixa/Início since Slice 2X.6, also shown for a first-ever interpretation still in flight (previously silent). All existing Playwright-load-bearing text and selectors (`.entry-heading h1`, the exact "Confiança por elemento"/"Trust by element" and "Immutable history" headings, `.revision-timeline` version/origin text, the original-record `<details>`, correction/reprocess/undo/confirm button labels) are unchanged.
- `src/app/operations.css`: `.entry-status-*` modifier classes now key off the five `ProductState` values (`saved`, `organizing`, `needs_attention`, `could_not_organize`, `ready`) instead of the eight internal `entries.status` values, reusing the same colors already established for `.status-badge.*` (Slice 2X.6).

### Verification

- `npm test`: 57 files / 286 tests passing (19 new). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing.
- Offline Playwright (`desktop`+`mobile`, public foundation only): 4/4 passing, 10 expected online skips — this workstation has no `ONLINE_SUPABASE_*` credentials, so `intelligent-capture.spec.ts` (the load-bearing regression for this page, including the trust-panel heading, revision-timeline text, and record-only/undo journey) could not be re-run live here; the rewrite was designed against its exact assertions (selectors and copy) rather than left unverified.
- No migration in this slice (`Nenhuma exclusiva` per the implementation plan); local/remote migrations remain synchronized through `029` from the prior hotfix, unaffected by this change.
- `git diff --check`: clean (only pre-existing LF/CRLF advisories, no whitespace errors); `git status` shows only the files listed above.

### Known limitation

- `src/features/daily-cycle/review-projection.ts` and `technical-details-projection.ts` each independently call `loadInterpretationReview`, so the entry-detail page now issues two parallel sets of Supabase reads instead of one. This keeps the two projections genuinely independent (a technical-detail failure literally cannot affect the review query), matching the slice's fail-closed requirement, at the cost of roughly doubling read volume for this page. Not a regression target of this slice; a future slice could share one load between both projections if this becomes measurably significant.

## 2026-07-18 — Hotfix: correction conflict no longer hangs until gateway timeout

### Fixed

- `correct_entry_interpretation` (Phase 2B, already shipped) signaled its optimistic-concurrency version conflict with SQLSTATE `40001`. Slice 2X.7 independently confirmed — via a raw `fetch()` against the linked project's REST endpoint, no application code involved — that any RPC raising `40001` on this platform hangs the request until the gateway times out instead of returning an error, and deliberately left this specific already-shipped path unfixed because `interpretations/actions.ts` and this function were outside that slice's file list (see ADR-025). Migration `202607180029` closes that follow-up: `correct_entry_interpretation` is redefined (`create or replace`, identical signature `(uuid, integer, jsonb, text, text)`) with the single version-conflict raise now using `errcode = '55P03'` instead of `'40001'`. Every other line — ownership checks, the idempotent-replay short-circuit, patch/entity-link validation, and all inserts/updates/audit/undo writes — is unchanged. `src/features/interpretations/actions.ts`'s `correctInterpretation` conflict detection now checks `error.code === "55P03"` instead of `"40001"`; the reload/retry message shown to the user is unchanged. See ADR-026.

### Added

- `src/features/interpretations/actions.test.ts`: a new case asserting the `55P03` conflict maps to the same localized "reload and retry" message.
- `supabase/tests/interpretation_revisions.sql`: two new pgTAP assertions (plan raised to 46) confirming `correct_entry_interpretation`'s published body raises `55P03` for the version-conflict message and no longer contains an `errcode = '40001'` raise.
- `scripts/remote-interpretation-revisions-smoke.mjs`: the existing concurrent-correction race now asserts a bounded elapsed time (< 15s, actually observed ~530ms), the `55P03` SQLSTATE on the losing call, that the interpretation-row count advanced by exactly one (no partial write from the rejected side), and that the current-interpretation pointer was not overwritten by the losing correction.
- `docs/reports/PHASE_2X_CORRECTION_CONFLICT_HOTFIX_REPORT.md`: official hotfix report.

### Verification

- `npm test`: 54 files / 267 tests passing (1 new). `npm run lint` and `npx tsc --noEmit`: clean. `npm run build`: production build passing.
- `supabase db push` applied migration `029` to the linked project; `supabase migration list --linked` shows local/remote in sync through `029`. `supabase db lint --linked --level warning`: unchanged, only the pre-existing unrelated `run_user_heartbeat` finding.
- `npm run test:remote:interpretations` (extended) executed against the linked project with disposable users and passed: the version-conflict correction returned in ~530ms with SQLSTATE `55P03` (no gateway hang), no partial interpretation row was left by the rejected side, and the current interpretation pointer still reflected the winning correction.
- `supabase gen types typescript --linked` regenerated with no diff (beyond a BOM artifact from the shell redirect used to compare), confirming the RPC signature was fully preserved.
- pgTAP (`interpretation_revisions.sql`) could not be executed locally — Docker unavailable on this workstation, the same pre-existing environment gap documented elsewhere in this file. The two new assertions are committed and correct syntactically/logically; the authenticated remote smoke is the equivalent, and in this case stronger, verification (it caught a genuine issue on the first migration attempt — see Known limitation).

### Known limitation

- The first version of migration `029` failed its own post-deploy verification: an inline PL/pgSQL comment explaining the fix happened to contain the literal digits `40001`, and PostgreSQL stores a function's body as literal source text, so `pg_get_functiondef()` returned that comment verbatim and tripped a naive substring check. The whole migration (including the otherwise-correct `create or replace`) rolled back as one transaction — confirmed via `supabase migration list --linked` showing no partial application — before being fixed (reworded comment; verification narrowed to inspect the literal `errcode = '40001'`/`errcode = '55P03'` assignment instead of an arbitrary numeric substring) and re-pushed successfully.
- `undo_operation` raises a separate SQLSTATE `40001` for its own conflict (`'Cannot undo after a newer interpretation revision'`). It was not touched by this hotfix — a single-RPC fix, not a schema-wide sweep — and is not confirmed to hang the gateway, but is the same class of platform risk. See `TODO.md`/`SECURITY.md`.

## 2026-07-18 — Phase 2X Slice 2X.7 candidate provenance and safe task confirmation

### Added

- Migration `202607170028_phase_2x_candidate_action_consistency.sql`: `entry_interpretations.is_record_only` (persisted at creation/correction/reprocess/undo instead of only ever existing as a transient correction input); `tasks.source_interpretation_id` (FK-composite-proven `(user_id, id)` against `entry_interpretations`) and `tasks.operation_key`; two partial unique indexes replacing the old entry-wide `(source_entry_id, candidate_index)` constraint (`tasks_legacy_source_entry_candidate_key` for provenance-less rows, `tasks_source_interpretation_candidate_key` as the new authoritative interpretation-scoped uniqueness); a conservative backfill that only sets `source_interpretation_id` for tasks on entries with exactly one interpretation ever created. New RPC `confirm_entry_task_candidates(entry_id, expected_interpretation_id, candidate_indexes, operation_key)`: confirms only candidates belonging to `entries.current_interpretation_id`, rejects `record-only` interpretations, is idempotent per operation key, and preserves the existing person/project/context linking and `parentIndex` chaining behavior (now scoped by interpretation). `confirm_entry_tasks` is preserved for compatibility with no new consumer.
- `src/features/interpretations/data.ts`: `computeUnavailableCandidateIndexes` (new, pure, tested) — a candidate index is unavailable when its task belongs to the current interpretation, or, conservatively, when its provenance is unproven (legacy rows with `source_interpretation_id = null`), since consistency cannot be verified either way. `InterpretationRevision` gained `isRecordOnly`; `loadInterpretationReview` returns `unavailableCandidateIndexes` and scopes `taskUndoId`'s lookup to both `confirm_entry_tasks` and `confirm_entry_task_candidates` action types.
- `src/features/tasks/actions.test.ts` (new, 9 cases) and 5 new `task-candidate-form.test.tsx` cases covering interpretation binding, unavailable-index filtering, and the record-only empty state.
- `scripts/remote-daily-cycle-smoke.mjs` (new; `npm run test:remote:daily-cycle`): executed, not just written, against the linked project with disposable users. Covers current-interpretation binding, stale/out-of-range rejection, idempotent replay, a task confirmed under an older version surviving a later correction, a concurrent confirmation race for the same candidate producing exactly one task, record-only rejection, cross-user isolation, and undo scoped to the correct task.
- `supabase/tests/candidate_action_consistency.sql` (33 pgTAP assertions; committed, not executed locally — see Known limitation).

### Changed

- `src/features/tasks/actions.ts` (`confirmEntryTasks`): now validates and forwards `interpretationId`/`operationKey`, calls `confirm_entry_task_candidates`, and maps `55P03`/`55000` to distinct sanitized messages instead of one generic failure string.
- `src/features/tasks/task-candidate-form.tsx`: new required `interpretationId`/`operationKey` props (sent as hidden fields) and optional `unavailableIndexes` prop; renders neither a checkbox nor a submit button for an unavailable index, and shows an explicit "nothing pending" state when every candidate is unavailable, instead of an empty-but-interactive form.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: the confirmed-task count driving the pre-filled success state is now scoped to the current interpretation's own tasks, not every task ever confirmed for the entry; a record-only current interpretation shows an explicit "record only" message instead of the confirmation form; `TaskCandidateForm` receives `interpretationId`, a fresh `operationKey`, and `unavailableIndexes`.

### Fixed

- `confirm_entry_tasks` — pre-existing, unrelated to this slice's own candidate-provenance work — was `SECURITY INVOKER` and took `SELECT ... FOR UPDATE` on `entry_interpretations` (no `UPDATE` grant for `authenticated`) and inserted into `undo_operations`/`audit_logs` (no `INSERT` grant for `authenticated`). It had never successfully completed for a real signed-in user; every call failed with `permission denied`. Both `confirm_entry_tasks` and the new `confirm_entry_task_candidates` are now `SECURITY DEFINER`, matching every other RPC in this schema that writes to those tables. `confirm_entry_tasks` also gained the `grant ... to authenticated` / `revoke ... from public, anon` pair it was missing (it had been reachable, harmlessly, by `anon`).
- The first version of `confirm_entry_task_candidates` signaled a stale interpretation with SQLSTATE `40001`, mirroring `correct_entry_interpretation`. Direct testing against the linked project's live REST gateway showed any request raising `40001` — including calls to the already-shipped `correct_entry_interpretation` — hangs until the platform gateway times out. `confirm_entry_task_candidates` now uses `55P03`. See `DECISIONS.md` ADR-025 and the urgent, explicitly out-of-scope-for-this-slice follow-up recorded in `TODO.md`/`SECURITY.md` for `correct_entry_interpretation`'s own equivalent path.

### Known limitation

- `supabase/tests/candidate_action_consistency.sql` could not be executed locally (Docker unavailable on this workstation, the same pre-existing environment gap documented elsewhere in this file). The migration itself was applied to and verified against the linked project directly (`supabase db push`, `supabase db lint --linked`), and the equivalent behavior was proven by actually running `scripts/remote-daily-cycle-smoke.mjs` against real authenticated users on that same project — which is how the two SECURITY DEFINER/grant defects and the `40001` gateway hang above were found in the first place.
- `ActionableCandidateView`/`InterpretationReviewView` (Slice 2X.1 prework) still have no consumer; `/inbox/{entryId}` remains the broad Phase 2B revision page for this slice, only adapted enough (`isRecordOnly`, `unavailableCandidateIndexes`) to stop offering an unconfirmable or already-confirmed candidate. The full projection split is Slice 2X.8.

## 2026-07-17 — Phase 2X Slice 2X.6 human processing states in Inbox and Home

### Added

- `src/features/daily-cycle/inbox-projection.ts` (`loadInboxProjection`): owner-scoped, paginated query that reads a page of `entries`, each entry's latest `interpret_entry` job (matched by `payload->>entry_id`), its current interpretation's `task_candidates`, open `pending_questions`, and non-cancelled materialized `tasks`, then feeds `resolveDailyCycleLifecycle` (Slice 2X.1) per entry to produce `InboxItemView[]`. When the mapper returns `null` for an unrecognized internal combination, the loader builds an explicit `could_not_organize`/`resolve_consistency` item instead of dropping the entry — the original is always preserved, so it is always shown.
- `src/features/daily-cycle/inbox-item.tsx` (`InboxItemRow`): presentational component that renders an `InboxItemView` — title, original preview, localized product-state badge, and attention-reason hint — through `getDailyCycleCopy`. Receives only the DTO, never a Supabase row or an internal lifecycle string.
- Tests: `inbox-projection.test.ts` (12 cases covering every product-state/attention-reason combination reachable from real query data, the fail-closed fallback, pagination, and the locale-scoped safe href), `inbox-item.test.tsx` (4 cases), `home-dashboard.test.tsx` (4 cases — first test coverage for this component).

### Changed

- `src/app/[locale]/app/inbox/page.tsx`: now calls `loadInboxProjection` and renders `InboxItemRow` instead of reading `entries.status` directly through `lifecycleLabels`; pagination is driven by the projection's own `hasNext`.
- `src/features/shell/home-dashboard.tsx`: adds a fifth "05 / RECENTE" panel that calls the same `loadInboxProjection` and renders the same `InboxItemRow`, so Home and Inbox are guaranteed to agree on an entry's state. Wires up the previously-unused `home.recent` copy key.
- `src/app/operations.css`: `.status-badge` modifiers for the Caixa list changed from the eight internal `entries.status` values (`awaiting_review`, `partially_processed`, `recoverable_error`, `terminal_error`, `interpreting`, `reprocessing`, ...) to the five product states (`saved`, `organizing`, `needs_attention`, `ready`, `could_not_organize`). The entry-detail page's separate `.entry-status-*` rules (Slice 2X.8/2X.9 scope) are untouched.
- `docs/ARCHITECTURE.md`: documents the daily-cycle vertical slice and the Slice 2X.6 projection wiring, including the known limitation that `recordOnly`/`hasConsistencyIssue` are conservatively `false` until Slice 2X.7's `is_record_only` column exists.

### Known limitation

- A candidate corrected as record-only still has its original `task_candidates` JSON on the interpretation row (the correction RPC does not clear it), and there is no persisted `is_record_only` column yet. Until Slice 2X.7 lands, such an entry is shown as `needs_attention`/`confirm_existing_candidates` rather than `ready`. This is a known, documented gap, not a regression — `2X.6`'s own dependency list is `2X.1` and `2X.5` only.

## 2026-07-17 — Phase 2X Slice 2X.5 asynchronous capture cutover

### Added

- `src/lib/jobs/entry-worker.ts` (`kickEntryInterpretationWorker`): shared, fire-and-forget nudge that invokes the deployed `process-jobs` worker for a given job id using the caller's own authenticated session (same `{ jobId }` contract as existing direct invocation); every internal error is swallowed since the `pg_cron` drain (Slice 2X.4) is the correctness backstop, not this nudge.
- `src/features/daily-cycle/capture-receipt.tsx` (`CaptureReceiptView`): renders a `CaptureReceipt` as a `role="status"` region with the localized save/replay message and, when the Action supplied one, a safe "Ver registro"/"View record" link. First production consumer of the previously-unconsumed `toCaptureReceipt` projection mapper.
- `retryProcessingJob` in `src/features/agent/actions.ts`: generalizes manual retry to `interpret_entry` jobs. A `failed` job whose backoff has elapsed only gets a worker kick (it is still automatically re-claimed by the dispatch drain); an `exhausted` job gets a fresh `enqueue_entry_reprocessing` job, since exhausted work is never re-claimed. `retryAttachmentJob` is untouched. No UI consumes this Action yet — it lands with the Needs-Attention slices (2X.10–2X.11).
- Official Slice 2X.5 evidence report at `docs/reports/PHASE_2X_SLICE_05_REPORT.md`.
- `docs/DECISIONS.md` ADR-023: the `after()` mechanism, the entry-retry generalization, and the `interpret-entry.ts` removal.

### Changed

- `src/features/capture/actions.ts` (`captureEntry`): calls `capture_entry_async` and returns as soon as it (plus one lightweight indexed lookup for job/entry state) settles — no redirect, no synchronous AI call. Builds a `CaptureReceipt` through `toCaptureReceipt`, only including a `safeHref` when captured from the dedicated `/capture` page (not Home), and schedules the worker nudge plus best-effort `capture_save_succeeded`/`capture_save_failed`/`capture_processing_enqueued` product events inside `next/server`'s `after()` so neither adds latency to the response.
- `src/features/capture/quick-capture-form.tsx`: `CaptureState` is now a discriminated `idle | success (receipt) | error (code, message)` union. The button reads "Salvando…"/"Saving…" while pending (not "Interpretando…"/"Interpreting…"); on success the form resets and the field regains focus so consecutive captures do not wait on interpretation, and a client-generated idempotency key rotates only after a confirmed success so a failed-attempt retry cannot create a duplicate entry.
- `src/features/shell/home-dashboard.tsx` and `src/app/[locale]/app/capture/page.tsx` pass the new required `captureSource` prop (`"home"` / `"capture_page"`) so the Action knows which surface to attribute analytics to and whether to include the receipt's record link.
- `src/features/interpretations/actions.ts` (`reprocessEntry`): calls `enqueue_entry_reprocessing` instead of running extraction synchronously; returns the honest "Vou organizar este registro novamente."/"I will organize this record again." message instead of claiming completion, and schedules the same worker-nudge/analytics pattern as `captureEntry`.
- `src/features/interpretations/copy.ts`: the reprocess button's pending label changed from "Reinterpretando…"/"Reinterpreting…" to "Enfileirando…"/"Queueing…", matching what the click now actually does (an enqueue, not a live AI call).
- `e2e/intelligent-capture.spec.ts`: the capture step now asserts the immediate receipt, the cleared/refocused field, and an enabled submit button — proving the UI is interactive before interpretation completes — then polls the entry-detail route until the worker finishes before continuing into the existing correction/task-confirmation journey.

### Removed

- `src/features/interpretations/interpret-entry.ts`: the synchronous Node extraction orchestrator, now unreachable since neither `captureEntry` nor `reprocessEntry` calls it. All production entry-interpretation extraction now runs exclusively in the Deno worker (`supabase/functions/process-jobs/entry.ts`, Slice 2X.4).
- Two now-superseded assertions in `src/lib/ai/usage-order.test.ts` that checked the deleted Node synchronous ordering; the two Deno-worker ordering assertions are unchanged and still pass.

### Fixed

- `src/test/setup.ts` now registers Testing Library's `cleanup()` in a global `afterEach`. Vitest's config never enabled `globals: true`, so the library's automatic cleanup had never been active in this project — a render from one `it()` block could leak into the next within the same file. Caught while writing the `CaptureReceiptView` test; fixed once, project-wide, rather than worked around locally.

### Verification

- Vitest: 50 files / 228 tests passing (up from 47/205), ESLint, TypeScript, and the Next.js 16.2.10 production build all clean.
- `npm run test:remote:entry-processing`, `test:remote:jobs`, `test:remote:product-events`, and `test:remote` all re-run against the linked project after the cutover and passed unchanged.
- Online Playwright (`intelligent-capture.spec.ts`) passed on both `desktop` (~1.1 min) and `mobile` (~1.0 min) against the linked project, including the full downstream journey (correction, undo, task confirmation, chat, reviews, files, settings, heartbeat, final undo).

## 2026-07-17 — Phase 2X Slice 2X.4 entry-interpretation worker and automatic dispatch

### Added

- Migration `026`: extends `begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, and `fail_entry_reprocessing` with an optional `p_service_user_id` parameter honored only for `service_role`, so an unattended worker can call the same RPCs the synchronous UI path already uses; the `auth.uid()` path is unchanged. Enables `pg_net` and schedules `my-brain-entry-dispatch` (`pg_cron`, every minute), reading the dispatch URL and secret from Supabase Vault by name — no value lives in the migration or the repository.
- `supabase/functions/process-jobs/entry.ts`: a single pipeline for `interpret_entry` jobs in both `initial` and `reprocess` modes. Never trusts the job payload beyond `entry_id`/`mode`/`operation_key`; reloads the entry, calls `begin_entry_interpretation`/`begin_entry_reprocessing`, runs the OpenAI extraction and (for reprocessing) the same deterministic entity-resolution/trust computation as the synchronous path, persists via the service-role-extended RPCs, and independently records AI usage and a best-effort `capture_processing_completed`/`capture_processing_failed` product event.
- `supabase/functions/_shared/entity-resolution.ts`, `trust-builders.ts`, `trust-policy.ts`: Deno-runtime copies of the corresponding `src/features/interpretations/` modules, genuinely reused (not reimplemented) because those Node modules have no Node/Next.js-specific imports; kept in sync manually and flagged in each file's header.
- `supabase/functions/process-jobs/dispatch.ts`: a fail-closed type router (`process_attachment` | `interpret_entry`; unknown types are rejected before any claim) and the unattended dispatch-drain loop for `interpret_entry` jobs only.
- `supabase/functions/process-jobs/attachment.ts`: the existing attachment-processing behavior, extracted verbatim from `index.ts` with no behavioral change (payload, model, usage, lease, and messages all unchanged).
- `supabase/functions/process-jobs/dispatch.test.ts`: a Deno test file for the type-routing guard; written for `deno test` but not executable on this workstation (no Deno runtime installed).
- `supabase/tests/entry_interpretation_worker.sql`: pgTAP contract for the migration `026` signature/privilege surface and a full service-role initial/reprocess/failure round trip.
- Extended `scripts/remote-entry-processing-smoke.mjs` with real end-to-end worker coverage: direct invocation (initial and reprocess), an incorrect-dispatch-secret denial, and the unattended dispatch drain processing a fixture job with no `jobId` supplied.
- Migration `027`: fixes a Slice 2X.3 regression (see below) by replacing a CHECK constraint with a `SECURITY DEFINER` trigger, gated by `WHEN (new.type = 'interpret_entry')`.
- Official Slice 2X.4 evidence report at `docs/reports/PHASE_2X_SLICE_04_REPORT.md`.

### Fixed

- **Slice 2X.3 regression (broke every real file upload since migration `025`):** the `jobs` CHECK constraint added in migration `025` referenced `private.is_valid_entry_interpretation_job_payload`, whose `EXECUTE` privilege had been revoked from every role. PostgreSQL checks a referenced function's ACL when the executor initializes the CHECK constraint's expression tree, not only when the branch that calls it is actually evaluated — so even a `process_attachment` insert, where the constraint's `OR` should short-circuit on `type`, failed with `permission denied for function is_valid_entry_interpretation_job_payload`. Migration `027` replaces the CHECK constraint with trigger `jobs_interpret_entry_payload_trigger` (`before insert or update ... when (new.type = 'interpret_entry')`) backed by a `SECURITY DEFINER` function; trigger firing does not require the writing role to hold `EXECUTE` on the function it calls, so the private validator keeps its original `revoke all` — no privilege was broadened. See `DECISIONS.md` ADR-022.

### Changed

- `supabase/functions/process-jobs/index.ts`: reduced to authentication, job-type lookup, claim, and routing (via `dispatch.ts`); no longer contains attachment- or entry-specific logic directly.
- Direct invocation keeps its exact existing request contract (`{ jobId }`) for both job types; no Server Action, route, or UI consumer changed.

### Verification

- Migrations `026` and `027` are synchronized with the linked project; linked database lint at level `error` is clean and Supabase types were regenerated from the remote schema.
- `npm run test:remote:entry-processing` (extended) passed: 2X.3's atomic-capture/lease/retry/reaper assertions plus real direct worker invocation (initial and reprocess), dispatch-secret denial, and unattended dispatch-drain processing.
- `npm run test:remote:jobs` (attachment regression) failed before the migration `027` fix and passed after it.
- `npm run test:remote` (full regression, including the deployed attachment worker over HTTP) passed after the fix.
- An ad hoc disposable-user check confirmed the worker's best-effort `capture_processing_completed` product event is actually persisted with the expected properties.
- The committed pgTAP contract (`entry_interpretation_worker.sql`) could not run on this workstation because Supabase CLI requires Docker Desktop; the Deno test file could not run because no Deno runtime is installed. Deployment (`supabase functions deploy`, which bundles/resolves the full Deno module graph including the `_shared` imports) plus the remote smokes above served as the equivalent real verification.
- Vitest (47 files/205 tests — one new AI-usage-ordering assertion for `entry.ts`, and the existing attachment-worker assertion repointed from `index.ts` to `attachment.ts`), ESLint, TypeScript, the Next.js 16.2.10 production build, and `git diff --check` passed.

## 2026-07-17 — Phase 2X Slice 2X.3 atomic entry capture and input jobs

### Added

- Migration `025` with a bounded `interpret_entry` payload contract, lookup/active-job indexes, and atomic authenticated RPCs `capture_entry_async` and `enqueue_entry_reprocessing`.
- Service-role-only `claim_entry_interpretation_job` and `claim_next_entry_interpretation_job` contracts with type/payload/ownership guards, retry eligibility, attempts, leases, and `SKIP LOCKED` concurrency control; existing attachment claim, completion, failure, and reaper contracts remain unchanged.
- Linked Supabase-generated types, pgTAP contract at `supabase/tests/entry_processing_jobs.sql`, and disposable remote smoke at `npm run test:remote:entry-processing`.
- Official Slice 2X.3 evidence report at `docs/reports/PHASE_2X_SLICE_03_REPORT.md`.

### Changed

- The historical projection commit `9f0c1e6` is preserved and reclassified as prework; it is not credited as the official database Slice 2X.3.
- Permanent architecture, database, security, state, backlog, and decision documentation now distinguish durable entry jobs from the future worker/dispatch and the current synchronous UI path.

### Verification

- Migration `025` is synchronized with the linked project; linked database lint at level `error` is clean and Supabase types were regenerated from the remote schema.
- Disposable remote smoke passed atomic capture, bounded payloads, replay, ownership denial, exclusive lease, retry eligibility, stale-worker denial, lease recovery, and reprocessing isolation.
- The committed pgTAP contract could not run on this workstation because Supabase CLI requires Docker Desktop; the exact limitation is recorded in the Slice 2X.3 report.
- Vitest (47 files/204 tests), ESLint, TypeScript, the Next.js 16.2.10 production build, and `git diff --check` passed.

## 2026-07-17 — Phase 2X Product Projections prework (historical commit `9f0c1e6`)

### Added

- Pure mappers in `daily-cycle` for `CaptureReceipt`, `InboxItemView`, `NeedsAttentionItemView`, and `WorkItemView`, plus serializable source contracts for future server-side adapters.
- Immutable product DTO outputs with cloned/frozen action data, strict required-field validation, safe local destinations, internal task-status-to-human-state conversion, and `null` fail-closed results for invalid or unknown inputs.
- Focused architecture tests that prohibit React, Supabase, `database.types`, direct table access, and RPC calls in the projection mapper boundary.
- Prework evidence report at `docs/reports/PHASE_2X_PROJECTIONS_PREWORK_REPORT.md`.

### Changed

- The four existing product DTO contracts and nested available actions are now explicitly readonly, so future UI consumers cannot mutate their public shape through TypeScript.
- The original prework documentation is retained for historical evidence; planning/status documents now distinguish it from the official Slice 2X.3.

### Verification

- Focused projection/lifecycle/contract Vitest: 3 files and 23 tests passing.
- Full Vitest: 47 files and 204 tests passing.
- ESLint, TypeScript, the Next.js 16.2.10 production build, and `git diff --check` passed.
- No migration, RPC, Edge Function, route, UI, analytics integration, Playwright, or remote smoke was required or executed because this slice has no runtime consumer.

## 2026-07-17 — Phase 2X Slice 2X.2 private product-events foundation

### Added

- Migration `024` with the private `product_events` ledger, forced owner RLS, minimum read grant, per-owner idempotency, bounded indexes, synthetic-test marker, and documented 180-day retention requirement.
- Dedicated security-definer RPCs: `record_product_event` derives the authenticated owner; `record_product_event_for_user` accepts only service-role callers. Both validate the closed taxonomy, event-specific property allowlists, opaque subject ownership, and forbidden free-content fields.
- Pure serializable TypeScript contracts for all 17 events, closed surfaces/properties, safe parser, and discriminated telemetry result; a server-only best-effort boundary and thin acknowledgement Server Action expose no raw Supabase errors.
- Focused Vitest suites, pgTAP contract at `supabase/tests/product_events.sql`, generated `Database` schema, and a disposable remote product-events smoke command.
- Slice evidence report at `docs/reports/PHASE_2X_SLICE_02_REPORT.md`.

### Changed

- Permanent architecture, database, security, state, backlog, and decision documentation now distinguish product-behavior telemetry from audit, jobs, and AI-cost ledgers.

### Verification

- Migration `024` is synchronized with the linked project; linked database lint at level `error` is clean and Supabase types were regenerated from the remote schema.
- Focused contract/server/action Vitest and disposable remote product-events smoke passed. Full quality-gate counts are recorded in the Slice 2X.2 report.
- The committed pgTAP contract could not run on this workstation: Supabase CLI requires Docker Desktop and the remote runner also reported missing `SUPABASE_DB_PASSWORD`; the remote smoke covers the same high-risk RLS, privilege, allowlist, idempotency, ownership, and cleanup paths.

## 2026-07-17 — Phase 2X Slice 2X.1 daily-cycle product contracts

### Added

- Pure `daily-cycle` contracts for the five public product states, five attention reasons, product-oriented DTOs, and user-available action identifiers.
- Stable discriminated Action-result codes and safe runtime guards that keep localized copy, provider details, and database errors outside the contract.
- Typed PT-BR and English product copy for states, attention reasons, actions, and Action-result messages.
- One deterministic, fail-closed internal-lifecycle-to-product-state mapper covering the eight known entry states, job status, retry scheduling, questions, candidates, record-only entries, materialized tasks, and consistency fallbacks.
- Four colocated Vitest suites, including an architectural source guard that prevents React, Supabase, database types, and UI-module imports in the new boundary.
- Slice evidence report at `docs/reports/PHASE_2X_SLICE_01_REPORT.md`.

### Changed

- Permanent state and backlog now record that Phase 2X implementation is in progress, Slice 2X.1 is complete, and Slice 2X.2 has not started.

### Verification

- Focused daily-cycle Vitest: 4 files and 24 tests passing.
- Full Vitest: 43 files and 171 tests passing.
- ESLint, TypeScript, and the Next.js 16.2.10 production build passed.
- No migration, RPC, Edge Function, route, UI, telemetry, remote smoke, or Playwright work was required or executed because this slice has no runtime consumer.

## 2026-07-17 — Phase 2X — Product Convergence planning checkpoint

### Added

- Approved architecture review, PRD, and detailed implementation plan for Phase 2X, positioned between Phase 2B and Phase 2C.
- Reusable slice report template at `docs/reports/SLICE_REPORT_TEMPLATE.md`.

### Changed

- Project state, backlog, and Phase 2 roadmap now identify Phase 2X — Product Convergence as the approved next phase; implementation has not started.

### Verification

- The three Phase 2X planning documents were checked for internal Markdown links, cross-references, heading numbering, naming consistency, roadmap references, and unexpected placeholders.
- No production code, migration, RPC, Edge Function, or Phase 2X slice was created or executed in this checkpoint.

## 2026-07-17 — Phase 2B immutable interpretation revisions and trust

### Added

- Migrations `020` through `023` with eight persisted entry states, an owned current-interpretation pointer, immutable revision metadata, temporal entity aliases, reprocessing leases, correction/reprocessing RPCs, compensating undo, and two append-only runtime/lint fixes.
- Deterministic trust engine with centralized weights and `0.90`/`0.78`/`0.55` policy thresholds, hard overrides, explicit missing evidence, per-element persisted decisions, and user-confirmed correction handling.
- Bounded owner-filtered entity resolver using normalized exact names, aliases, historical recurrence, organization context, temporal validity, optional semantic similarity, and top-candidate margin.
- Typed interpretation DAL, Zod form parser, correction/undo/reprocessing Server Actions, shared extraction pipeline, localized copy, immutable version comparison, and accessible revision editor.
- Inbox review experience for lifecycle state, original record, current interpretation, dates, concepts, resolved links and extracted mentions, classifications, pending questions, element trust/evidence, history, adjacent comparison, undo, and recovery.
- 44-assertion pgTAP structural contract, disposable remote interpretation smoke, and desktop/mobile linked Playwright correction journey.

### Changed

- Initial capture now persists `saved`, transitions through `begin_entry_interpretation`, and records recoverable failures through a sanitizing RPC instead of legacy direct `processing`/`failed` updates.
- Capture and reprocessing use the same bounded provider, prompt/strategy versions, owned context retrieval, usage ledger ordering, entity evidence, and embedding persistence.
- Inbox summaries follow `entries.current_interpretation_id` instead of assuming the highest returned version.
- User corrections and undo never update/delete interpretation evidence; both append a new snapshot and atomically move the current pointer.
- Online E2E assertions no longer depend on nondeterministic model wording or task extraction; a reprocessing fixture is used only when the real model omits the explicit task candidate.

### Verification

- Vitest passed 39 files and 147 tests; ESLint, TypeScript, and Next.js 16.2.10 production build passed.
- Linked Playwright passed the complete journey on desktop and Pixel 7 mobile, including `pt-BR`, English, correction, date editing, record-only, history, undo, task confirmation, and cleanup.
- Local/remote migrations are synchronized through `023`. Linked database lint has no Phase 2B issue; only two pre-existing heartbeat type warnings remain.
- Focused remote interpretation smoke passed immutability, append-only correction, idempotency, concurrency, ownership, rollback, audit, undo, aliases, reprocessing, sanitization, RLS, and cleanup.
- Complete remote Supabase regression smoke passed auth, settings, RLS, ownership, heartbeat, AI accounting, and deployed file processing.

### Known external limitation

- Docker Desktop remains unavailable, so the committed pgTAP file could not execute locally through the Supabase CLI. Equivalent high-risk behavior passed against disposable remote data.

## 2026-07-17 — Phase 2A operational reliability

### Added

- Migration `019` with worker leases (`locked_at`, `locked_by`, `lease_expires_at`), terminal `exhausted` state, failure timestamp, eligible/expired indexes, leased claim/complete/fail RPCs, queue metrics, and a per-minute expired-job reaper.
- pgTAP contract plus a disposable remote job smoke for exclusive claims, stale-worker denial, expired recovery, bounded exhaustion, error sanitization, metrics, cross-owner denial, and RLS.
- Owning-user Files UI for recoverable/terminal jobs, attempt counts, retry windows, and a validated authenticated retry Server Action.
- Linked Supabase-generated TypeScript schema; the `jobs` row contract is used by the Phase 2A page.

### Changed

- `process-jobs` version 9 now uses a unique worker identity, 300-second lease, 120-second OpenAI timeout, persisted interpretation reuse, lease-validated completion/failure, sanitized bounded errors, backoff, and operational logs.
- Successful or failed attachment processing no longer mutates `jobs` directly from the Edge Function.
- Failed attachment retry is explicit and user-driven after the database `next_attempt_at`; no generic unattended consumer was introduced without a concrete workflow.

### Verification

- ESLint and TypeScript passed with zero errors.
- Vitest passed 29 files and 93 tests.
- Next.js 16.2.10 production build passed.
- Linked intelligent-capture/file Playwright passed 2/2 across desktop and mobile.
- Local/remote migrations are synchronized through `019`; linked database lint passed at error level.
- Remote job smoke and complete remote smoke passed, including RLS, ownership, heartbeat, AI ledger/aggregation, and real deployed file processing.

### Known external limitation

- Docker Desktop remains unavailable, so the new pgTAP file could not execute locally through the Supabase CLI. Equivalent high-risk behavior passed against disposable remote data.

## 2026-07-17 — Phase 2 planning and engineering contract

### Added

- Mandatory permanent engineering standards covering architecture, database, security, AI, jobs, interface, tests, commits, dead code, and external dependencies.
- Reality-based `PHASE_2_PLAN.md` that preserves complete pre-MVP capabilities, identifies partial/missing behavior, defines trust thresholds, and starts with operational queue reliability.

### Changed

- Project state and backlog now identify Phase 2A as the active milestone instead of treating the original roadmap as unimplemented.
- Permanent source-of-truth precedence is explicit from current code and linked database through the project documents.

## 2026-07-17 — Sprint 1.5 foundation hardening

### Added

- Permanent project state documentation: `STATE.md`, `DECISIONS.md`, `CHANGELOG.md`, and `TODO.md`.
- Completed password-recovery journey with PKCE callback continuation, reset page, validated password update, session close, and fresh-login confirmation.
- Zod authentication schemas and regression tests for signup, sign-in, recovery, password strength, and confirmation.
- Public and online Playwright coverage for signup/reset form contracts and remote signup/recovery journeys.
- Complete mobile navigation overflow with localized access to every authenticated destination and a dedicated online mobile smoke test.
- Lookahead pagination, shared pagination links, batched storage URL signing, and a safe authenticated error boundary.
- Composite ownership constraints, polymorphic ownership triggers, least-privilege grants/policies, and behavioral denial tests.
- AI routing profiles, normalized usage metadata, versioned pricing, append-only ledger, complete database-side aggregates, and the AI cost dashboard.
- Disposable remote Supabase smoke runner covering auth, atomic settings, RLS, ownership, heartbeat, ledger, cost aggregation, and real file processing.
- Linked-environment Playwright runner that obtains credentials in process without persisting or printing privileged keys.

### Changed

- Sprint scope is now explicitly limited to foundation hardening and completion of the already-started AI Routing and Cost Control phase.
- Signup now normalizes and validates names/emails, enforces a strong confirmed password, and supplies an explicit email callback URL.
- Authentication proxy validation uses verified claims and preserves only callback/reset continuation routes for an authenticated recovery session.
- Provider errors are mapped to stable localized messages instead of being exposed in URLs.
- Hosted email throttling is classified explicitly and shown as a safe localized retry-later message.
- Heartbeat now uses user-local dates/locale, advisory locks, rolling cooldown, lossless caps, sanitized failure records, and per-user batch isolation.
- Profile/settings writes are atomic through `save_profile_settings`; application and Edge Function Supabase failures are checked explicitly.
- Successful provider calls are recorded before downstream domain persistence so later failures do not erase usage cost.
- Cost totals are aggregated in PostgreSQL and recent calls remain bounded to 20 rows.
- Remote migrations are synchronized through `202607170018`; `process-jobs` is deployed with the final result-handling bundle.
- The final gate passes ESLint, TypeScript, 87 Vitest tests, production build, public Playwright, linked online Playwright, remote Supabase smoke, and linked schema lint.

### Database

- Added migrations `016` through `018` for foundation/RLS hardening, complete AI cost aggregation, and incremental AI ledger validation.

### Removed

- Hid the Google OAuth action until the provider, redirect URLs, and end-to-end journey are configured.

### Verification

- Vitest: 27 files, 87 tests passing.
- Scoped coverage: 93.66% statements, 61.61% branches, 90.62% functions, and 95.88% lines.
- Playwright public matrix: 4 passing, 10 expected online skips without credentials.
- Playwright linked matrix: 11 passing, 3 explicit environment/scope skips; final targeted recovery journey 1/1 passing.
- Remote smoke: auth, settings, RLS, ownership, lossless heartbeat, AI ledger/aggregation, dashboard data, and real deployed file worker passing.
- Supabase: local/remote migrations synchronized through `018`, schema lint clean, `process-jobs` active at version 8.

### Known external limitations

- Expanded pgTAP execution remains dependent on Docker Desktop, while equivalent high-risk behaviors passed against the disposable remote project.
- Hosted Auth email quota prevented a final non-throttled delivery assertion; custom SMTP is required before production launch.
- Three moderate transitive PostCSS advisories remain in the current Next.js dependency graph; the incompatible forced downgrade proposed by npm was rejected.

## 2026-07-16 — Intelligent brain pre-MVP

### Added

- Intelligent capture interpretation, confirmations, pending questions, and entity materialization.
- Agent chat, memory retrieval, summaries, embeddings, and attachment processing.
- Tasks, Today, Waiting, Projects, People, Reminders, Reviews, Files, Memories, Notifications, and Change History experiences.
- Entity relationships and timelines.
- Agent operations, undo records, and task change auditing.
- Scheduled heartbeat database functions, preference limits, and notification generation.
- Durable AI job queue and `process-jobs` Edge Function.
- Unit/component, Playwright, and pgTAP test foundations.

### Changed

- Profile settings save behavior was made more reliable.
- Online Supabase authentication received a dedicated Playwright validation flow.

### Database

- Added migrations `003` through `014` for intelligent capture, chat/memory, agent operations, heartbeat, relationships, timelines, attachments, preference limits, and audit behavior.

## 2026-07-16 — Phase 1 foundation

### Added

- Next.js 16 App Router foundation with TypeScript, Tailwind CSS 4, Vitest, and Playwright.
- Supabase SSR authentication, profiles, agent preferences, localized routes, protected shell, and user-scoped RLS.
- `pt-BR` and English message catalogs.
- Core product, architecture, database, AI agent, security, and implementation documentation.

### Database

- Added identity/profile migrations `001` and `002` with signup trigger, timestamps, indexes, grants, and RLS.
