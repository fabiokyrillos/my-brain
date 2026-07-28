# Phase 2E — Final Report (Natural-Language Task Updates)

## 1. Status

| Field | Value |
|---|---|
| Phase | 2E — Natural-Language Task Updates |
| Epics | 2E-A … 2E-H, all eight implemented |
| Slices | 2E.1 … 2E.8, all eight accepted |
| Branch | `codex/phase-2e-natural-language-task-updates` |
| Phase base | `2e2acfd` (Pre-Phase-2E Foundation Hardening, PR #17) |
| Draft PR | [#18](https://github.com/fabiokyrillos/my-brain/pull/18) |
| Merged | **no** |
| Deployed | **no** — remote migration parity is `202607250054`; the phase ends at `202607280061` |
| Tagged / released | **no** — the last release is `phase-2d-complete` |
| Requirement inventory | 122 functional IDs across 16 families, 8 epic acceptance criteria, 5 global gates |
| Requirements delivered | **118 of 122** |
| Requirements not delivered | **4** — one deliberate reclassification to Phase 2F (`2E-COMMAND-012`), three blocked on deployment authorization and nothing else (`2E-OPERATIONS-003`, `2E-OPERATIONS-004`, `2E-OWNERSHIP-004`'s remote half) |
| Delivered with a scope note | 1 — `2E-MATCH-018`. Counted as delivered because its own text is satisfied; the note (§3) exists so a Phase 2F comparison is not made against the wrong measurement |

**Read this line before any other claim in this document.** Phase 2E is complete *as a branch*. It has never run against the linked project, no user has ever typed a command into it, and every online journey named in Epic 2E-G's acceptance is blocked on a deployment that has not been authorized. Everything below distinguishes what is proven from what is merely written.

## 2. What the phase delivered

Phase 2E lets a user act on a task they already have by typing an ordinary sentence, in pt-BR or English. The model does exactly one job — turn a sentence into a closed, validated command proposal with bounded target hints. Every decision that determines an outcome is deterministic application or database logic.

| Slice | Epic | What shipped |
|---|---|---|
| 2E.1 | 2E-A | The bounded command contract: fifteen actions as data (eligible source statuses, allowed target values, changed fields, destructiveness, one-step eligibility, confirmation, undo strategy); closed Zod schema; bilingual status/priority vocabulary; versioned bilingual temporal lexicon with fail-closed instant resolution; prompt/schema/version parity test; migration `202607250055` making command parsing recordable in the AI usage ledger |
| 2E.2 | 2E-B | Deterministic matching: migration `202607250056` `list_task_command_candidates` — owner-scoped, filtered on the action's own eligible statuses, ordered before truncation, `limit + 1` overflow probe, backed by the immutable `normalize_entity_alias`; one versioned policy module for weights, thresholds, limits, evidence and bands; margin via the existing `calculateCandidateMargin` |
| 2E.3 | 2E-C | Disambiguation rendered deterministically from owned rows without a model; server-computed read-only preview with `willMutate: false`, linked effects, undo-window disclosure, `no_change` over fields *and* relations, staleness; the preview fingerprint (ADR-042 — Postgres hashes, TypeScript never does) |
| 2E.4 | 2E-D | Migration `202607260058` `apply_task_command` — the first RPC in this codebase that mutates an existing task. Owner-scoped, expected-pre-state gated, canonical patch, operation-key idempotent, fingerprint replay detection, closed `2E_*` error vocabulary, `55P03` and never `40001`, reminder consistency by close-and-insert, audited with a real actor (ADR-046), undoable through registered private handlers |
| 2E.5 | 2E-E | Migration `202607260059` — `cancel_task` behind a server-issued single-use confirmation whose single-use-ness is a property of the **grants**, not the client (ADR-047); `restore_task`; the cancelled-task recovery affordance; both orderings of the cancel/creation-undo collision closed by one shared predicate at all three doors (ADR-048); `2E_ACTION_NOT_ENABLED` retired because nothing could raise it (ADR-049). All fifteen actions enabled |
| 2E.6 | 2E-F | Migration `202607270060` — the creation family, sharing the mutation contract's operation-key, fingerprint, audit and undo primitives rather than reusing the entry-scoped candidate path. Previewed, confirmed, replay-safe, audited, undoable; a deterministic task-like rule and a one-shot terminal clarification |
| 2E.7 | 2E-G | The first user-visible surface. One command console on Chat (list page *and* conversation) and the task surface behind a single `runTaskCommand` dispatcher; `/app/work/cancelled` recovery route; migration `202607280061` adding `task_command` to all three analytics allowlists; content-free analytics; the session envelope with a pinned clock (ADR-050); a hand-rolled dialog because jsdom 29.1.1 has no `showModal` (ADR-051) |
| 2E.8 | 2E-H | This report, the traceability matrix and its fail-closed generator, the cleanup verifier, the aggregate remote smoke, the convergence audit, and permanent-document reconciliation |

**Scale.** Seven additive migrations (`202607250055`–`202607280061`, 10,076 lines of SQL; 11,306 counting the pre-2E trio `202607250052`–`202607250054`, which PR #17 merged), **25 modules and 26 colocated test files** under `src/features/task-commands/`, 6 Phase 2E pgTAP files, and 2,254 Vitest assertions across 124 files at the Slice 2E.7 boundary — 2,256 at 2E.8's.

> The module count above was corrected during merge preparation. This line previously read "30 modules"; `git ls-tree` reports 51 files in that directory — 25 modules and 26 tests — at every slice boundary from 2E.7 onward. The SQL figure was right but ambiguous, and now separates this branch's seven migrations from the pre-2E trio it was counting alongside them. Nothing else in this report changed.

## 3. The match-quality baseline (2E-MATCH-018)

This is the bar any future semantic signal must beat. It is computed by `src/features/task-commands/match-baseline.test.ts` over a committed 14-scenario corpus and **pinned**, not merely reported — a weight change that quietly turns an ambiguity into a one-step apply has to come to this assertion and say so.

| Measure | Rate |
|---|---|
| Policy version | `2026-07-25.3` |
| Scenarios | 14 |
| One-step apply | **0.429** |
| Matched, needs deliberateness (not one-step) | 0.071 |
| Confirmation required | 0.071 |
| Ambiguous (incl. overflow) | 0.214 |
| No match | 0.214 |

**The caveat travels with the number, and Phase 2F must honour it.** The corpus supplies `prefilterTier`, `tokenOverlap` and `queryTokenCount` by hand, so these rates measure **the scoring layer against declared SQL verdicts**, not end-to-end matching. A sibling assertion (`"$id is a set SQL could actually have returned"`) proves every hand-written triple is one an execution of `list_task_command_candidates` could actually produce, so the rates are not measured over impossible inputs — but they are not an end-to-end measurement either. Any Phase 2F comparison must be made against the same scope or against a re-measured one. An end-to-end corpus needs a database and therefore needs deployment.

## 4. Convergence audit

Epic 2E-H requires one taxonomy, one matching policy, one preview contract, one mutation contract, one error vocabulary, one undo registry and one analytics allowlist across every surface. Until Slice 2E.7 each of these had *no* consumer; the audit was possible for the first time in this slice.

| Contract | Single source | Consumers | Verdict |
|---|---|---|---|
| Action taxonomy | `taxonomy.ts` | schema, matching, preview, apply, creation, copy, analytics, AI schema | one source; digest pinned to `TASK_COMMAND_POLICY_VERSION` |
| Matching policy | `match-policy.ts` | matching, analytics bands, disambiguation, baseline | one source; digest pinned to `TASK_MATCH_POLICY_VERSION` |
| Preview contract | `preview.ts` + `fingerprint.ts` | actions, console, creation | one source; Postgres owns the hash (ADR-042) |
| Mutation contract | `apply_task_command` | `apply.ts`, `confirmation.ts` (shares `buildApplyPayload`) | one RPC, one payload builder, seven fixed arguments |
| Error vocabulary | `errors.ts` (ten `2E_*` tokens) | `apply.ts`, `copy.ts` | one closed list; `2E_ACTION_NOT_ENABLED` retired under ADR-049 |
| Undo registry | `private.undo_operation_handlers` | all Phase 2E operations | fail-closed trigger proves registration |
| Analytics allowlist | `contracts.ts` + `product_events` CHECK + `record_product_event` guard | `analytics.ts`, remote smoke | all three widened in one migration; the smoke *reads* the vocabulary (ADR-052) |
| Outcome vocabulary | `outcomes.ts` (twelve, per 2E-UX-001) | `copy.ts` exhaustiveness test | one runtime array, iterable, both locales |

**The audit found three defects, all in one module, all now fixed.** They are the same defect wearing three faces: `vocabulary.ts` — the bilingual status/priority term tables — was outside the versioning regime that every other policy module lives inside.

1. **`TASK_VOCABULARY_VERSION` was orphaned.** Its own docstring said "Bumped with the policy version whenever an entry is added or re-pointed". Nothing read it. It sat at `2026-07-25.1` while `TASK_COMMAND_POLICY_VERSION` had moved to `.2`, and no gate noticed the drift.
2. **The test that claimed to pin it pinned something else.** `policy-lock.test.ts`'s case named *"pins the status and priority vocabularies to the same version"* digested `TASK_STATUSES` and `TASK_PRIORITIES` — the **closed database literals**, which `vocabulary.ts` neither owns nor can change. The 61 bilingual term mappings that this codebase *does* own were digested by nothing. Re-pointing one entry — `bloqueada` from `blocked` to `deferred` — would move a user's task to a state they never named, with the entire suite green. This is precisely the silent-drift class PRD §10.4 exists to prevent, at the one layer where a wrong mapping is directly user-visible.
3. **`vocabularyCoversEveryLiteral()` was exported and never called**, duplicating two assertions that already existed in the same test file.

Fixed by: bumping the constant to `2026-07-25.2`, adding `canonicalVocabularyEntries()` (sorted by plain code-unit comparison, *not* `localeCompare`, so a runtime ICU update cannot move a pinned digest), digesting the real term tables under it, asserting `TASK_VOCABULARY_VERSION === TASK_COMMAND_POLICY_VERSION`, renaming the misleading case, and calling the dead guard so the duplication retires rather than the guard. `policy-lock.test.ts` 35/35.

**No other duplicated logic, orphaned contract, unreachable path or dead code was found.** Specifically checked and clean: `clarifyTaskCommand` is reachable (bound to the `clarify` intent in the `runTaskCommand` dispatcher and exercised end-to-end in `actions.test.ts`); all eight Server Actions are reached through that dispatcher; every exported type with no runtime reference is a published API-surface type, not dead code.

## 5. Reviews performed in this slice

| Review | Result |
|---|---|
| Architectural | Clean. The single-source table in §4 is the evidence. No second write path exists: `confirmation.ts` shares `buildApplyPayload` with the apply rather than restating the payload |
| Shipped-code | Three defects, all in `vocabulary.ts` (§4). Fixed |
| Dead-code | One genuine finding (`vocabularyCoversEveryLiteral`, §4). The 52 exports referenced only by tests were each checked and are contract surfaces reached through the dispatcher or published types — not dead |
| Security | Clean. Every Phase 2E RPC is `SECURITY DEFINER` with `search_path = ''`, validates `auth.uid()`, and grants execute to `authenticated` only. No grant widened, `anon` holds nothing. Confirmation single-use-ness is enforced by grants, not by the client. The residual risk is unchanged and stated: `authenticated` retains direct `insert/update/delete` on `public.tasks` (PRD §16.4) |
| Documentation | Two obligations could not be discharged; see §9. Everything else reconciled |
| Consistency | One real defect found by *running* the new cleanup verifier rather than reading it: it detected a missing table by SQLSTATE `42P01`, but PostgREST answers from its schema cache and returns `PGRST205` without ever reaching Postgres. The verifier died on the first Phase 2E table — the exact failure its own branch existed to prevent. Fixed and re-run green |

No Critical or Important finding remains open. Minor findings are in §8.

## 6. Verification

**Local, on this tree.** Recorded in `PHASE_2E_SLICE_08_REPORT.md` §Verification with exact counts.

**CI is the authoritative SQL evidence and no local pgTAP run is reported anywhere in this phase.** Docker is unavailable on this workstation, so `supabase db reset`, `supabase test db` and `supabase db lint --local` have never executed here. Every SQL claim in Phase 2E rests on draft PR #18's `database` job: the whole migration chain applied from an **empty** database, the full pgTAP suite, `supabase db lint --schema public,private`, the real two-session PostgREST creation race, and `e2e/foundation.spec.ts` + `e2e/task-command.spec.ts` against the production build on desktop and Pixel 7.

**Executed live against the linked project during this slice** — the only two Phase 2E gates that can run before deployment:

- `npm run test:remote:2e` → exits **2** with `BLOCKED ON DEPLOYMENT: list_task_command_candidates does not exist in the linked project`. Exit 2 is deliberately distinct from an assertion failure (exit 1), so a future CI wiring can tell "not deployed yet" from "deployed and broken".
- `npm run test:remote:2e:cleanup` → **passes**. Zero disposable users, zero orphaned rows across 17 tables, zero remote-smoke storage objects, and `task_command_confirmations` correctly reported as the one Phase 2E table absent because the chain is undeployed.

**The traceability generator's fail-closed behaviour is proven, not asserted.** Four tamper tests were run against a restored copy of the PRD: dropping a requirement, adding one to an existing family, introducing a new family, and removing an epic bullet. All four threw; the PRD was byte-identical afterwards.

## 7. Deferred work — every item, with its justification

### 7.1 Deferred by decision

**`2E-COMMAND-012` — prompt and strategy versions recorded on the resulting operation. Reclassified to Phase 2F (PRD revision 4).**

What exists today: both versions are build constants (`TASK_COMMAND_PROMPT_VERSION`, `TASK_COMMAND_STRATEGY_VERSION`), pinned by `task-command-contract.test.ts`, carried on the command session, and available to the operation the proposal produces. What does not exist: any persisted column. `ai_usage_events` has none — which the requirement's own text admits is *why* it asks for the operation instead — and no Phase 2E RPC has one either.

Why it is deferred rather than done: discharging it literally means changing the argument list of `apply_task_command` and `create_task_command`, or of `record_ai_usage`. All three are impossible by `create or replace` — a different argument list is a new function in Postgres, and leaving both overloads live would make every existing call ambiguous — so each requires `drop function` and a full re-declaration. `apply_task_command`'s body alone is ~1,460 lines. `record_ai_usage` is the smaller target but is shared by **every AI path in the product** and is pinned by two `::regprocedure` casts and a `has_function` type array across two pgTAP files, plus hand-written types and the Deno worker. Neither is a closeout-slice change, and the only SQL evidence available is a four-minute CI round trip.

Residual risk, stated plainly: if a prompt change ships and a bad command lands, attribution requires joining `ai_usage_events.created_at` to the deploy history rather than reading a column. That is weaker than the requirement intends and is the reason this is recorded as deferred rather than satisfied.

### 7.2 Not delivered, blocked on deployment authorization and on nothing else

Deployment of migrations `202607250055`–`202607280061` to the linked project is the single gate. The code exists; the specifications exist.

1. **`2E-OPERATIONS-003`** — the focused per-slice disposable remote smokes. None can run; no Phase 2E RPC exists remotely.
2. **`2E-OPERATIONS-004`** — the aggregate remote smoke. Written, wired to `npm run test:remote:2e`, drain-safe by construction (it creates no entries, so it never competes with the `pg_cron`/`pg_net` interpretation drain), two-owner, fail-closed on cleanup. Its preflight runs today and correctly refuses.
3. **`2E-OWNERSHIP-004`'s remote half** — the disposable two-owner cross-owner-denial proof. The requirement names database tests *and* a remote smoke; the database half is proven by pgTAP from an empty database in CI, so half of it stands.

### 7.3 Delivered, but the reader must carry the scope

- **`2E-MATCH-018`.** The baseline is measured, committed and transcribed into §3, which is what the requirement asks for — so it is counted as delivered rather than held against the phase. Its scope is the **scoring layer against declared SQL verdicts**, not end-to-end matching. An end-to-end corpus needs a database and therefore needs deployment. Any Phase 2F semantic comparison must use this scope or re-measure; comparing a future end-to-end number against these rates would be comparing two different things.

### 7.4 Blocked on deployment, but not a requirement of their own

- **Every authenticated online journey for Epic 2E-G.** Typing a command, resolving a disambiguation, confirming a cancellation, creating from a no-match, undoing, restoring from the recovery page. These are acceptance evidence for requirements already delivered in code, not separate requirements. The credential-free route/auth/locale journeys do run in CI.

### 7.5 Known limitations, disclosed rather than hidden

- **The `restore_task` recovery path depends on the task being ranked by its own title.** The cancelled-task listing renders the title and builds the restore command from it, so an exact-title tier-0 match is near-certain — but a user with more than 25 cancelled tasks sharing one title could see a stale-shell preview instead of a restore. `hasMore` already tells the user the list is truncated.
- **Write-path consolidation is deferred by design** (PRD §5, §16.4, §23.3). `applyWorkItemAction`/`createRecord` still write `public.tasks` directly and `authenticated` retains those grants. Phase 2E guarantees *its* mutations are validated, audited and undoable; it does not close the pre-existing direct-write path. Recorded in `docs/TODO.md`.
- **`src/features/tasks/task-candidate-form.test.tsx` is flaky under CI load.** A Phase 2C component test with zero references to task-command code; it failed once on a docs-only commit and passed on re-run and 3/3 locally. Not a Phase 2E regression. Left as a recorded maintenance item rather than fixed blind in a closeout slice, because the failure has not been reproduced locally and a fix without a reproduction is a guess.
- **No dedicated mutation-testing round ran in any slice.** The standing evidence is the adversarial design and shipped-code review rounds, the assertion counts, the architecture boundary gates, and CI's database job.

## 8. Minor findings left open

1. `PHASE_2E_SLICE_07_DESIGN.md` §6 promises a 42-finding set the file does not contain; only the twelve critical corrections survived the session budget that ended that round. Recorded in the Slice 2E.7 report rather than pretended away. Not repaired here because the missing content was never written down and cannot be reconstructed.
2. Several exported types across the feature have no runtime reference. They are published API surface, consistent with the rest of the codebase; churning them at closeout would be change without benefit.
3. `2E-COMMAND-017` is declared out of numeric order in the PRD (between `-008` and `-009`), because revision 3 inserted it beside the requirement it qualifies. The traceability matrix preserves PRD order rather than re-sorting. Cosmetic.

## 9. Documentation obligations that could not be discharged

**PRD §24 assigns this report an obligation it cannot meet, and saying so is better than filling the space.** Revision 2's revision history states: *"Nineteen further findings were refuted with evidence and are recorded in the Slice 2E.8 convergence report rather than acted upon."* Those nineteen findings were produced by the seven-reviewer PRD round on 2026-07-25. **Their content was never persisted to the repository** — no file records them — and they cannot be faithfully reconstructed from summaries. Inventing nineteen plausible refutations to satisfy a sentence would be worse than an honest gap.

What *is* recorded, in the slice reports and `STATE.md`, are the refutations that happened during implementation and were written down at the time — the candidate-slot collision withdrawn as unreachable on four independent lenses (ADR-048's withdrawn second half), and the terminal-timestamp refutation in Slice 2E.4. Those stand. The PRD-round nineteen do not, and PRD revision 4 corrects the sentence that promised them.

## 10. Deployment checklist

**Not authorized. Nothing below has been executed.** Deployment order for this phase is **migrations only** — Slices 2E.1–2E.8 touch no worker code, so `process-jobs` v15 and `heartbeat` v4 are unchanged.

- [ ] Confirm deployment authorization for the linked project explicitly.
- [ ] Re-verify parity immediately before: `npx supabase migration list --linked` must show `202607250054` as the last applied and `202607250055`–`202607280061` as local-only. If it shows anything else, stop — the assumption this plan rests on is false.
- [ ] Take a database backup or confirm the restore point.
- [ ] Apply the chain in order. Every migration carries its own post-deploy `DO` block of catalog assertions; a failed assertion aborts that migration's transaction.
- [ ] Confirm `202607250055` swapped the `ai_usage_events` operation CHECK rather than adding a second one — the migration's own guard checks this, because `drop constraint if exists` is fail-open and its failure would be silent.
- [ ] Confirm `202607260059`'s post-deploy block passed. It greps 24 literals against the bodies they target; one wrong alias would leave a guard refusing the thing it protects.
- [ ] Confirm `202607280061` widened all three analytics allowlists — `productSurfaces`, the `product_events` CHECK, and the `p_surface` guard inside `record_product_event`.
- [ ] Run `npm run test:remote:2e`. It must now proceed past preflight instead of exiting 2.
- [ ] Run `npm run test:remote:2e:cleanup`. `tablesNotYetDeployed` must be empty.
- [ ] Run `npm run test:remote:product-events` — it reads the vocabulary rather than restating it (2E-ANALYTICS-006), so a drift is a real failure.
- [ ] Run the authenticated online journeys (`npm run test:e2e:online`) on desktop and mobile in both locales.
- [ ] Re-run `npx supabase migration list --linked` and record the new parity in `STATE.md` and `PHASE_2E_PROGRESS.md`.

## 11. Rollback checklist

**No applied migration is ever reverted.** PRD §21 is explicit and every slice was designed to it: rollback means *stop routing to the new surface*, not undo a schema change. Every Phase 2E migration is additive; nothing existing was removed or narrowed.

- [ ] Unmount the command console from Chat and the task surface. The console is the only entry point to every Phase 2E RPC.
- [ ] Remove the `/app/work/cancelled` link from the Work page (the route itself is inert without the console).
- [ ] Confirm `persistTaskStatus` and `applyWorkItemAction` still work. They were never migrated onto the new RPC — that is the deferred write-path consolidation — so **the Work surface has never depended on Phase 2E shipping**, which is what makes this rollback cheap.
- [ ] Leave every migration applied. Narrowing the `ai_usage_events` CHECK back would fail against rows already written under `task_command`; narrowing the `product_events` surface CHECK would fail against rows already written under `task_command`.
- [ ] Leave `public.task_command_confirmations` in place. It is append-only, owner-scoped and writable by no client role.
- [ ] Undo rows already recorded remain valid and their handlers remain registered; the fail-closed registry trigger means an unregistered `action_type` cannot be recorded, so removing a handler while its rows exist is the one thing not to do.

## 12. Merge checklist

- [ ] All three CI jobs green on the exact merge SHA — not on an ancestor.
- [ ] `npm run docs:phase-2e:traceability` produces no diff (the matrix is in sync with the PRD).
- [ ] `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/TODO.md`, `docs/DECISIONS.md` updated — the Definition-of-Done §13 gap that Slice 2E.6 left and Slice 2E.7 paid must not recur.
- [ ] PR #18 moved from draft to ready, with the deferred-work list in §7 restated in the PR description so a reviewer sees it without opening this file.
- [ ] The branch is 58+ commits ahead of `main` and **0 behind**; confirm that is still true at merge time rather than assuming it.
- [ ] Decide merge strategy deliberately. The branch's commit history is granular and each message carries reasoning; a squash discards it.
- [ ] **Do not merge and deploy in one motion.** Merging changes no running system; deploying does. They are separate authorizations.

## 13. Release checklist

**Withheld.** Phase 2D was tagged `phase-2d-complete` with a matching GitHub release *after* it was merged and deployed. Phase 2E is neither.

- [ ] Merge PR #18.
- [ ] Complete the deployment checklist (§10).
- [ ] Run the full online journey matrix against the deployed project.
- [ ] Tag `phase-2e-complete` on the merged commit.
- [ ] Publish the GitHub release pointing at this report.
- [ ] Record the release and the new migration parity in `STATE.md`.
- [ ] Open the Phase 2F planning item for semantic task retrieval (PRD §22), carrying the §3 baseline and its scope caveat as the bar to beat, plus the `2E-COMMAND-012` reclassification from §7.1.

## 14. Verdict

**118 of 122 requirements are delivered.** Of the four that are not, one is a deliberate reclassification to Phase 2F with its reasoning and residual risk recorded in four places (ADR-053), and three are blocked on deployment authorization and on nothing else. Every Phase 2E requirement is therefore implemented, intentionally deferred with a written justification, or blocked only by deployment authorization.

The convergence audit found three real defects and they are fixed. The closeout tooling exists, and two of its three pieces were executed against the live linked project rather than merely written — which is how one of them was found to be broken.

Phase 2E is complete as a branch. It is not merged, not deployed, not tagged and not released, and the next action is a human decision about authorization — not more engineering.
