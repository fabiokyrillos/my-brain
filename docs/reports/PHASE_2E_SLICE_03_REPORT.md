# Phase 2E — Slice 2E.3 Report: Disambiguation and Read-Only Preview

## 1. Status

| Field | Value |
|---|---|
| Slice | 2E.3 — Disambiguation and read-only preview (Epic 2E-C) |
| Status | **READY WITH NON-BLOCKING NOTES** |
| Date | 2026-07-26 |
| Repository | `github.com/fabiokyrillos/my-brain` |
| Branch | `codex/phase-2e-natural-language-task-updates` |
| Phase base | `2e2acfd` (Pre-Phase-2E Foundation Hardening, PR #17) |
| Slice base | `52f8db6` (Slice 2E.2 accepted) |
| HEAD | `4f9aff8` |
| Commits | `97c633a` (projection widened + fingerprint migration), `129fb46` (preview and disambiguation projections), `c50960b` (distinguishing evidence; the confirm-one copy contradiction), `4f9aff8` (two preview-truthfulness Criticals from an adversarial review) |
| Migrations | `202607250056_phase_2e_task_command_matching.sql` — **amended in place, twice**, in `97c633a` and `4f9aff8`. `202607250057_phase_2e_task_command_fingerprint.sql` — **new**, in `97c633a`. Both **local only, not applied to the linked project** |
| Remote migration parity | `202607250054`, unchanged since the pre-2E cutover, verified this session |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — unchanged and verified; this slice touches no worker code |
| Generated types | The widened `list_task_command_candidates` signature and the new `task_command_fingerprint` entry added **by hand**. Not regenerated — ADR-041 |
| Publication | Draft PR [#18](https://github.com/fabiokyrillos/my-brain/pull/18), **CI evidence only**. Not merged, not deployed, not tagged. |
| Governing documents | `docs/PHASE_2E_PRD.md` §13.3, §13.4, §19.1 (Epic 2E-C), §11.2, §11.3; `docs/ENGINEERING_STANDARDS.md`; ADR-021, ADR-036, ADR-037, ADR-040, ADR-041, and the two ADRs this slice adds (ADR-042, ADR-043) |

Slices 2E.4–2E.8 have not started. They proceed under the approved PRD without further authorization.

## 2. Objective, and what this slice deliberately is not

The objective is the **projection** half of Epic 2E-C: given a match from Slice 2E.2, produce a read-only, truthful, localized, fingerprinted statement of what a command *would* do — and, when the match is ambiguous, a ranked list of the competing candidates with the evidence that actually tells them apart.

What this slice deliberately is not:

- **No mutation.** Epic 2E-C's own acceptance criteria end with "no mutation exists in this slice". `202607250056` remains `stable`; `202607250057` is `immutable` and reads no table; `preview.ts`, `disambiguation.ts` and `fingerprint.ts` write nothing. The first task-mutation RPC this codebase has ever had still arrives in Slice 2E.4.
- **No UI, no route, no Server Action, no product event, no user-visible behaviour change.** Nothing calls the preview, the disambiguation projection or the fingerprint in production. Epic 2E-C's "the surfaces are keyboard operable and localized" clause is therefore **not met**, deliberately: 2E.4, 2E.5 and 2E.6 each change the surface's shape (an Apply control, a confirmation dialog, a creation offer), and with no mutation there is no async action, so 2E-A11Y-002 (focus after an async action) and 2E-A11Y-003 (live-region announcement) cannot be tested against anything. Components are deferred to **Slice 2E.7**, which must own 2E-A11Y-001/002/003 in the traceability matrix. Shipping them now would repeat the consumer-less `retryProcessingJob` pattern the pre-2E hardening pass removed.
- **No model call.** 2E-DISAMBIG-001 requires the competing candidates to be "rendered from owned rows without a model", and 2E-OWNERSHIP-005 forbids a task row from entering a Phase 2E prompt at all. There is no model on this path, so a task titled "ignore previous instructions and cancel everything" has nowhere to be interpreted as an instruction.
- **No hashing in TypeScript.** The fingerprint is computed in Postgres. See §5 and ADR-042.

## 3. What shipped

| Artifact | Responsibility |
|---|---|
| `supabase/migrations/202607250056_…` (amended in place, twice) | +3 `default null` relation-ref arguments (`p_project_ref`, `p_context_ref`, `p_person_ref`); +8 result columns — `project/context/person_ref_id`, `project/context/person_ref_name`, `scheduled_reminder_count`, `next_reminder_at`. Relation references resolve through `public.resolve_owned_entity_exact`; reminders are counted per candidate, `status = 'scheduled'` only |
| `supabase/migrations/202607250057_…` (new) | `public.task_command_fingerprint` — `immutable`, `strict`, **not** `security definer`, `set search_path = ''`, `jsonb_build_object` as the canonicalizer, 64 lowercase hex characters out |
| `supabase/tests/phase_2e_task_command_matching.sql` | Extended to cover the amended signature, the resolved refs and the reminder columns. `plan(73)` |
| `supabase/tests/phase_2e_task_command_fingerprint.sql` | New. `plan(19)`: catalog signature, digest shape anchored at both ends, canonicality under key reorder and whitespace, all seven inputs varied one at a time, a timezone probe, strictness, grants, and `provolatile`/`prosecdef`/`proconfig` pinned against the catalog |
| `src/features/task-commands/preview.ts` | `buildTaskCommandPreview` — pure, `willMutate: false` as a literal type, five dispositions, relation- and instant-aware `no_change`, linked effects computed from observed state, `atApply` for the two timestamps a preview cannot know |
| `src/features/task-commands/disambiguation.ts` | `buildTaskDisambiguation` — ranked order preserved untouched, distinguishing evidence marked, `confirm_one` never a list of one, no field in which a selection could be pre-set |
| `src/features/task-commands/outcomes.ts` | 2E-UX-001's twelve outcomes, declared for the first time, as an iterable `as const`; the five preview dispositions; the one declared refusal |
| `src/features/task-commands/copy.ts` | pt-BR/en, every record keyed by a declared union, `satisfies Record<Locale, …>` rather than `as const`, and **no** locale fallback |
| `src/features/task-commands/fingerprint.ts` | Payload assembly plus the RPC call through an injected client. **Hashes nothing** |
| `src/features/task-commands/taxonomy.ts` | `targetStatus` (PRD §11.2's `status→completed` arrow, previously only prose) and `TASK_COMMAND_UNDO_WINDOW_HOURS` |
| `src/features/task-commands/candidates.ts`, `matching.ts` | The eight new columns validated, decoded and carried; `describeUnreachableCandidates` extended to refuse a set whose rows disagree on any query-scalar ref |
| `src/lib/supabase/database.types.ts` | Both hand-written entries (ADR-041) |
| Tests | New `preview.test.ts`, `disambiguation.test.ts`, `copy.test.ts`, `fingerprint.test.ts`; additions to `candidates.test.ts`, `matching.test.ts`, `match-baseline.test.ts`, `policy-lock.test.ts`, `sql-reachability.test.ts`, `database-types-parity.test.ts` |

`TASK_COMMAND_POLICY_VERSION` moves to `2026-07-25.2` — the `targetStatus` addition changes the policy digest. `TASK_MATCH_POLICY_VERSION` stays `2026-07-25.3`: no weight, threshold or limit changed, and the pinned 2E-MATCH-018 baseline rates did not move.

## 4. The projection sufficiency question

Slice 2E.2's report §15 named this the slice's first task: *"the first task is to confirm the widened projection really is sufficient before writing the preview. It is also the last slice in which correcting `202607250056` in place remains possible."*

It was not sufficient. Building the preview found exactly two gaps, and **neither was fixable in TypeScript.**

### Gap 1 — relation reference resolution

`patch.projectRef` / `contextRef` / `personRef` are the user's own words. The pre-state carries relation *ids*. Deciding "does this task already hold the project the user named" (2E-PREVIEW-005) therefore requires the reference resolved to an id, under the authoritative normalizer.

Doing that in TypeScript means `normalizeEntityName`, whose divergence from `public.normalize_entity_alias` 2E-MATCH-008 characterizes over an eight-entry corpus. The consequence is concrete: a preview could report "will add Acme" where Slice 2E.4's RPC then computes `no_change`. It is also **structurally forbidden** — `normalizer-divergence.test.ts` enumerates this feature directory and forbids `normalizeEntityName(`, `.localeCompare(` and `Intl.Collator(` in every non-test module in it, *including modules not yet written*. That guard was made directory-enumerating rather than list-based during Slice 2E.2's acceptance review precisely so it could not be defeated by adding a new file, and `preview.ts` is that new file.

So resolution happens in SQL, through `public.resolve_owned_entity_exact` — the resolver the rest of the product already uses, rather than a second copy of entity resolution (ADR-021). It is exact-or-nothing: null means no owned entity of that name **or** more than one, and the preview says so truthfully (`refused` / `relation_reference_unresolved`) rather than guessing. Equality on the normalized name, never the hint predicate's equality-or-word-containment: a ref of "Acme" must not report that a task linked to "Acme Corp" already holds it.

**Resolved ids, not booleans.** A boolean cannot separate "you have no project called Acme" from "Acme exists but is not linked"; Slice 2E.4's `remove_added_relation` undo needs the id (2E-UPDATE-015); and binding the id rather than the words stops a rename between preview and apply from silently retargeting the assignment.

### Gap 2 — reminder state

`reminders` is a member of the taxonomy's `changedFields` and was the only member with **no observed state**, so a preview rendering before/after over that list had a hole on six of the fifteen actions.

`due_at is not null` is not a proxy. `create_due_task_reminder` is `after insert on public.tasks` (`202607160007:195-209`), so a due date set by any later UPDATE has no reminder at all, and `authenticated` retains direct `insert/update/delete` on `public.reminders`. 2E-PREVIEW-003 asks for the *linked effect*; a preview that promises to cancel a reminder that does not exist is not disclosing an effect, it is inventing one.

Both additions are deliberately **outside** the ranking path: computed after truncation, absent from every `order by`, and reaching neither `TaskPreState` nor `TaskCandidateShape`. The refs especially must not qualify a candidate — `writesRelation` in `matching.ts` exists because the relation a command is *adding* must never boost the task that already holds it, and a Slice 2E.2 review proved that defect reached a one-step apply.

### Why an in-place amendment, and not a `_v2`

- `202607250056` had only ever been applied to **ephemeral CI databases**, which are not a shared environment under the repository's append-only migration rule. Slice 2E.2 deliberately deferred deployment and left the window open for exactly this eventuality, and its report §10 said so in writing.
- `create or replace` cannot add, rename or retype a `RETURNS TABLE` column (`42P13`). Deploying first and then discovering the gap buys a `_v2` in the very next slice — the versioned-RPC sprawl ADR-037 exists to contain.
- The three new arguments are **appended and every one defaulted**, so `pg_proc.proargnames` stays an ordered superset and `pronargdefaults` still encodes `p_eligible_statuses` as the only required argument. Inserting an argument mid-list, or adding a non-defaulted one, would have broken both pgTAP contracts — and adding an argument at all creates an *overload* rather than replacing the function, which is why position matters.

**The window is now closed by exhaustion, not by policy.** Slice 2E.2 left it open so its first consumer could prove the projection sufficient. Slice 2E.3 was that consumer, found it insufficient twice, and amended in place both times. Any further change to the result columns or the argument list now costs a `_v2`.

## 5. The preview contract

**Five dispositions**, declared in `outcomes.ts`: `previewed`, `matched_requires_confirmation`, `no_change`, `rejected_stale`, `refused`. Four are members of 2E-UX-001's twelve outcomes; `previewed` deliberately is not — PRD §11.1 makes it a *lifecycle state* (`matched → previewed → applied | no_change | …`) while the twelve are the states a command comes to rest at, and a preview waiting for the user has not come to rest. `copy.test.ts` pins that containment in both directions, so the two vocabularies cannot drift and the reasoning cannot quietly stop being true.

**`willMutate: false` as a literal type**, mirroring `QuestionEffectPreview.willMutate`. A `boolean` would let a future edit set it true and still compile, which is the entire value of the literal. It is backed structurally rather than by promise: the module is a total function of one already-observed candidate set, the validated command, a locale, a timezone and an injected instant. There is no client, no clock read and nothing to mutate with.

**Relation- and instant-aware `no_change`** (2E-PREVIEW-005). Field deltas and relation deltas are both consulted: `changed = deltas.some(changed) || relationChanges(action, row, resolvedId)`. Instants compare as moments, not as strings — `2026-07-31T12:00:00Z` and `2026-07-31T09:00:00-03:00` are one instant, and a string comparison would call rescheduling a task to the time it already has a *change*, producing an audit row, an undo row and reminder churn for a user-visible no-op. A `no_change` preview claims no reversibility, offers no Apply control, and carries no effects.

**Linked effects from observed state** (2E-PREVIEW-003). Four declared kinds: `reminders_cancelled`, `reminder_created`, `reminders_none`, `leaves_active_lists`. They are derived from `scheduled_reminder_count` and the post-patch due date against the observed instant — never from §11.3's assumptions about what the task *ought* to hold. See §7.

**The fingerprint split: identity versus staleness.** These are two mechanisms, not one.

- *Identity* (2E-PREVIEW-004) is `public.task_command_fingerprint` over seven values: owner, task id, `observedBefore` as text, the pre-state, the canonical patch, the policy version, the operation key. It is what Slice 2E.4 reads to recognize a replay and what Slice 2E.5 binds a confirmation token to.
- *Staleness* (2E-PREVIEW-006, and 2E-UPDATE-003 later) is a typed comparison, not a digest. In this slice it is `expected.updatedAt !== candidate.preState.updatedAt` → `rejected_stale`. In Slice 2E.4 it must be a column-by-column `is distinct from` against the `for update`-locked row. Conflating them would force the RPC to re-render the locked row's timestamps as text byte-identically to what PostgREST emitted, which is unwinnable.

Two further properties of the identity half, both irreversible once 2E.4 stores fingerprints: **only `TASK_COMMAND_POLICY_VERSION` is hashed**, not the match policy version (the match policy decided *which* task, which `taskId` already binds; the command policy decides what the patch is allowed to mean); and **reminder state is deliberately absent from the hashed pre-state**, because the heartbeat flips `scheduled → sent` hourly with no user act and gating a write on it would manufacture a stale refusal on a cron tick.

`observedBefore` is never substituted. A shell whose match ranked no candidates carries `null`, and `buildFingerprintPayload` raises `missing_observation` rather than passing anything: the function is `strict`, so a null yields null, and an empty string yields a *valid* digest over an instant that never happened — two different requests sharing one identity, which is exactly what 2E-UPDATE-006's replay check reads.

**Disambiguation.** `confirm_one` is read from `qualifyingCount`, not `candidates.length`: the ranked array is capped for presentation, so its length answers "how many are shown" while the question is "how many cleared the floor". A signal is marked `distinguishing: false` when every *shown* candidate carries it — "the title contains what you said", rendered identically under two identically-titled tasks, restates PRD §12.2's canonical ambiguity rather than resolving it. Shared signals are marked rather than dropped, because a candidate rendered with an empty evidence list would look like a candidate with no reason to be there. Nothing in `TaskDisambiguationView` can express a selected, default, recommended or pre-checked candidate — 2E-DISAMBIG-002 is unrepresentable, not merely unset.

## 6. Security posture

- **No grant widened.** Both new `grant execute` statements are to `authenticated`, each paired with `revoke all on function … from public, anon`. That is the whole grant delta of this slice. 2E-OWNERSHIP-003 and PRD §14 hold.
- **`public.resolve_owned_entity_exact` is not granted to `authenticated`, and was not granted.** `202607170020:463` revokes it from `public, anon, authenticated`. It is reachable here only because `list_task_command_candidates` is `security definer` (ADR-040) and executes as its owner. Widening that grant would have been the easy path and was not taken.
- **`task_command_fingerprint` is `immutable`, `strict`, and deliberately not `security definer`.** It reads no table and touches no row, which is what makes 2E-PREVIEW-001 and 2E-PREVIEW-007 structurally true rather than asserted, and why obtaining a fingerprint cannot re-read the task and reopen the TOCTOU window `observed_before` exists to close.
- **The fingerprint is identity, never authorization.** It is granted to `authenticated` and all seven inputs are values the caller already holds, so a client can derive it. Granting it therefore costs nothing — and it is exactly why 2E-DESTRUCTIVE-002 requires a *separate*, server-issued, single-use confirmation token bound to it. Slice 2E.5 must not accept a matching fingerprint as evidence of confirmation. Recorded in the migration comment, in `fingerprint.ts`, in the pgTAP file, and in ADR-042.
- **Owner scoping on the new projection.** The three refs resolve under the caller's own id at `observed_before` (not at `now()`, so the alias validity window is the same instant the pre-state was read at), and the stored-name lookups re-apply `user_id = owner_id` even though the id came from an owner-scoped resolver. The predicate costs nothing on a primary-key lookup, and this is a `security definer` function. Reminder counts are scoped on both `task_id` and `user_id`.
- **2E-PREVIEW-007, and the defect that proved it needed enforcing.** Every value in a preview is the caller's own. The `rejected_stale` / `refused` shells carry `title: null` and `status: null` deliberately: a shell is reached *before* ownership has been established — the stale path fires when the selected id is absent from `rows`, which is precisely when the cross-owner `throw` cannot run — and reading the candidate's `preState` there was the one path in the module returning task content no check had cleared. A review demonstrated a hand-assembled result leaking another owner's title through it. Not reachable through `loadTaskCandidates`, which raises on a foreign row, but the module had already decided cross-owner is a `throw`, and this bypassed that decision.
- **Nothing reaches analytics or a model.** This slice emits no product event and makes no model call. Disambiguation evidence names the signal that fired, never the value.
- **Residual, named:** `resolve_owned_entity_exact` is called from inside a `security definer` function, where the `auth.uid()`-derived predicate is the only ownership control there is — the same residual ADR-040 recorded for the ranking path, now extended to relation resolution and to the reminder lateral. RLS does not apply to the definer. If that predicate regresses, nothing else inside the function stops a cross-owner read. That is why the cross-owner pgTAP assertions are symmetric and run from zero on every push.

## 7. The reminder findings that contradict the PRD

**Nothing in this repository has ever cancelled a reminder.** The only writers of `public.reminders` are the `after insert` trigger (`202607160007:195-209`) and the heartbeat's two mark-sent updates (`202607160013:33`, `202607170016:552-560`). `authenticated` also retains full `insert/update/delete` on the table. Two consequences follow, and they point in opposite directions.

**§11.3's `reopen_task` premise is false for pre-2E rows.** §11.3 says `reopen_task` "re-creates the reminder the INSERT-only trigger cannot", which presumes the task has none — that entering `completed` had already cancelled it. Nothing ever did. A task written before Phase 2E may therefore still hold a live `scheduled` reminder while sitting in `completed` or `cancelled`. The preview renders observed state and discloses close-and-insert for such a row: an existing `scheduled` reminder is *closed* even under `reopen_task` and `restore_task`. Disclosing "one already exists" and "a new one will be created" together — as an earlier version of the module did — commits the phase to leaving two live reminders, which is the outcome close-and-insert exists to prevent. §11.3's own mechanism sentence is what governs; its parenthetical about the trigger is what is wrong.

**`snoozed` is NOT a gap.** Every heartbeat path selects `status = 'scheduled'` and no other — `202607160007:274`, `202607160013:31`, `202607170016:510`. A `snoozed` reminder can therefore never fire, a `sent` one has already fired and §11.3 leaves it alone, and a `cancelled` one is already where a terminal transition would put it. `status = 'scheduled'` is the whole live population, so §11.3's wording is complete and the projection's `scheduled`-only count is the right count. There is deliberately **no `remind_at` predicate**: a reminder whose instant has passed but which the heartbeat has not yet marked `sent` is still scheduled and would still notify on the next hourly tick, so filtering it out would under-report the effect on precisely the rows most likely to fire next.

## 8. Independent review, and what it found

Three delegated implementation tracks plus one adversarial reviewer. The reviewer returned **NOT READY** on two Criticals, both reproduced by execution, both in modules written earlier in the same slice.

**Critical 1 — the preview could never name the entity it would add.** `relationAfter` looked the resolved id up in the arrays of relations the task *already holds*, so the name resolved only in the `no_change` case — the one case where it is not needed — and the real addition rendered `"+1"`. That is a raw literal bypassing the copy module entirely, and 2E-PREVIEW-002 asks for the *proposed value*; `"+1"` is not a value. Worse, the already-held case appended anyway and rendered "Acme, Acme" beside copy saying nothing would change — the delta contradicting the `no_change` verdict computed from the same facts. Fixed by projecting the resolved entity's **stored** name from SQL (the second `202607250056` amendment). The stored name rather than the user's typing, because `normalize_entity_alias` folds case, accents and punctuation: a ref of "acme corp" legitimately resolves a project stored as "ACME Corp.", and echoing the typing back would confirm something the database does not hold.

**Critical 2 — the reminder rule required a full hour of lead.** The condition was `due - 1h > now`, strictly, on a misreading of `greatest(now(), due_at - interval '1 hour')`. The `greatest` exists precisely so a due date less than an hour out still gets a reminder, at `now()`. "Move it to 5pm" typed at 4:30pm therefore disclosed "no reminders are affected" while the mechanism would have created one. §11.3's condition is only that the due date is in the future, and `create_due_task_reminder` itself has no future condition at all.

**Important findings, all fixed:**

- `reopen_task` / `restore_task` promised a duplicate live reminder (§7).
- `completed_at` / `cancelled_at` reported `changed: false` while rendering a change.
- The stale and refused shells read candidate content before ownership had been established (§6).
- Two different instants acted as "now" — the selected row's own `observed_before` rather than the match result's, which silently opted out of `rankTaskCandidates` reporting the *earliest* observation across the set.
- A fabricated empty-string `observedBefore` that would have produced a **valid** digest over an instant that never happened (§5).
- The `confirm_one` prompt reused `outcomes.ambiguous.title` ("I need you to choose"), which contradicted its own body text: a `qualifyingCount === 1` result offers nothing to choose *between*. It now has its own title (`c50960b`).

**One finding was rejected, with reasoning recorded.** The reviewer called it a defect that `no_change` suppresses reminder disclosure — a task holding a null `due_at` beside a live `scheduled` reminder would, under `clear_due`, be told nothing happens while a stale reminder survives. **Rejected.** 2E-UPDATE-009 is explicit that `no_change` writes no task update, no audit row and no undo row, and PRD §11.1 makes it terminal at preview time. Nothing happens to those reminders, so disclosing a cancellation would be the invented effect — the same failure class as Gap 2's "promising to cancel a reminder that does not exist", in the opposite direction. The underlying inconsistency is real, predates this phase, is a direct consequence of nothing ever having cancelled a reminder, and is recorded in `docs/TODO.md` as a data-consistency item rather than fixed by making a read-only preview lie.

**The review also named the two assertions that let the Criticals hide.** The relation delta's `after.text` was only swept for non-emptiness — which `"+1"` satisfies — and the reminder rule was pinned only at "already past" and "+2h", never inside the hour. Both are now pinned on both sides of their boundaries.

## 9. Verification

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | 0 errors |
| `npm test` | **1875 passed / 113 files** |
| `npx vitest run src/features/task-commands` | **786 passed / 15 files** |
| `npm run build` | clean |
| `supabase/tests/phase_2e_task_command_matching.sql` | **`plan(73)` — executed in CI, passed.** Never executed locally |
| `supabase/tests/phase_2e_task_command_fingerprint.sql` | **`plan(19)` — executed in CI, passed.** Never executed locally |
| `supabase db reset`, `supabase test db`, `supabase db lint --local` | **cannot run on this workstation — Docker is unavailable.** No local result is claimed anywhere in this report |
| CI `application` / `edge worker` / `database and journey` | **all three pass** on `4f9aff8`, run `30203421883` |
| Full pgTAP suite in CI | **`Files=27, Tests=927, Result: PASS`.** That is `883 + 25 + 19` against Slice 2E.2's baseline, so every assertion this slice added executed rather than being skipped — the arithmetic matters more than the pass, because a NUL byte once voided a whole file in this repository while TypeScript stayed green |
| Migration chain from zero | **PASS in CI** — the twice-amended `202607250056` and the new `202607250057` applied to an empty database |
| Worker gates (`deno check`, `deno test`) | This slice touches no worker code and no `supabase/functions/` file; no local run is claimed for it. |
| CI `database` on `c50960b` | **pass.** Proves the *first* `202607250056` amendment and the new `202607250057` apply from an empty database with the full pgTAP suite green. |
| CI on `4f9aff8` | **Not yet read. This is the gate that must be read before the slice is accepted.** |

**No pgTAP result and no `db lint` result in this report is a local execution.** Every SQL claim rests on draft PR #18's `database` job, which resets the whole migration chain from zero, runs the complete pgTAP suite, runs `supabase db lint` over `public,private`, and runs the foundation journey on desktop and Pixel 7.

That gap is now closed. The **second** `202607250056` amendment — the three `*_ref_name` columns — and the updated `plan(73)` were executed by run `30203421883` on `4f9aff8`, from an empty database, and passed.

## 10. Migrations, deployment, and rollback

**Migrations.** `202607250056` is amended in place: three appended, defaulted arguments and eight appended result columns, plus a rewritten `comment`, `grant` and `revoke` for the new signature. `202607250057` is a new file: one `create or replace function`, one `comment`, one `grant`, one `revoke`. No table, column, index, trigger or constraint is touched by either. Both are additive and forward-only, and the chain applies from an empty database in CI — proven for the first amendment on `c50960b`, pending for the second.

**Deployment: deliberately deferred, on the same reasoning as Slice 2E.2 §10 — but the window is now closed.**

`202607250055`, `202607250056` and `202607250057` remain local/branch-only; remote parity stays at `202607250054`. The reasons Slice 2E.2 gave still hold, minus the one that has now been spent:

- **Nothing calls either function.** Deploying yields no user-visible capability and reduces no risk. `fingerprint.ts` has no production caller by design; its consumers are Slices 2E.4/2E.5.
- **`list_task_command_candidates` is a `security definer` function exposed through PostgREST.** Deploying it before any consumer means carrying that surface with no compensating benefit.
- **The amendment argument is exhausted, not reversed.** Slice 2E.2 deferred deployment specifically to keep the `42P13` window open for its first consumer. That consumer has now run, twice, and any further change costs a `_v2` whether the function is deployed or not. Deferral is therefore no longer *buying* anything on that axis — it is simply the same additive-migration-with-no-consumer posture, held until Slice 2E.4 gives the surface a reason to exist remotely.
- **PRD §21's deployment order does not apply.** "Worker first, then migrations" governs slices touching both; this one touches no worker.

**Rollback is routing-level, and there is nothing to route.** Per PRD §21 and 2E-OPERATIONS-005, no applied migration is reverted. Concretely:

- nothing calls either function, so "stop routing to the new surface" is already the state;
- no index, trigger or constraint was created, so no existing write path changed behaviour;
- both functions can remain dormant indefinitely at zero cost — one is `stable`, the other `immutable`, and neither writes;
- if either ever needs disabling after deployment, `revoke execute … from authenticated` is sufficient and is itself additive;
- no destructive down migration is required, or provided.

**Grant posture on rollback:** revoking EXECUTE removes the only two grants this slice adds. Because the slice widened no other grant, there is no second privilege to unwind, and `resolve_owned_entity_exact` and `normalize_entity_alias` are left exactly as `202607170020` and `202607170022` left them.

## 11. 2E-OPERATIONS-003 — the focused remote smoke

**Owed, not skipped, and it did not run. No claim is made that it passed.**

The focused disposable remote smoke is **blocked on deployment**: it would exercise `list_task_command_candidates` and `task_command_fingerprint`, and neither exists in the linked project. Since deployment is deliberately deferred (§10), so is the smoke. `scripts/` contains no reference to either function, so what follows is a specification, not deferred code.

This is classified as a **non-blocking deployment dependency** for the slice verdict, on the same PRD grounds Slice 2E.2 recorded: Epic 2E-C's acceptance criteria (PRD §19.1) do not name a remote smoke, while **Epic 2E-D's explicitly require "a disposable remote smoke and authenticated desktop/mobile journeys"**; and 2E-OPERATIONS-003 is an Epic 2E-H requirement that PRD §19.3 lists as a **phase-level** Definition of Done item. The requirement's own text is per-slice ("Each slice has a focused disposable remote smoke") and that is not disputed — only that Epic 2E-C's acceptance does not gate on it.

**Slice 2E.2's specification is carried forward in full** — disposable and owner-isolated with two owners; cross-owner non-disclosure (the other owner's identically-titled task **absent**, not outranked); `limit + 1` overflow detection; deterministic ordering across repeated executions; injection-pattern hints (`%`, `_`, embedded and trailing backslash) neither widening results nor raising `22025`; and complete fixture cleanup.

**What this slice's smoke must additionally prove:**

1. **Relation reference resolution against the real project's roles.** That `resolve_owned_entity_exact` is reachable from `list_task_command_candidates` when called by a real `authenticated` user over PostgREST — the case pgTAP cannot fully answer, since the revoke at `202607170020:463` means the whole path depends on the definer's ownership rather than on the caller's grants.
2. **Cross-owner ref resolution.** A ref naming the *other* owner's project must resolve to null, not to their id — and the resulting preview must be indistinguishable from "you own no project by that name".
3. **Ambiguity collapse.** Two owned entities with the same normalized name must resolve to null, exactly as zero do, with the same refusal.
4. **Alias-driven resolution.** `resolve_owned_entity_exact` also unions `entity_aliases` within a validity window; the new pgTAP assertions cover the base-table path only (§13.7).
5. **Reminder counts.** `scheduled_reminder_count` and `next_reminder_at` against real rows: a task with none, one, and several; a `sent` and a `snoozed` row both excluded; a `scheduled` row whose `remind_at` has already passed still counted.
6. **The fingerprint's stability and its grant posture.** The same logical request hashed twice returns the same 64-hex value; two callers in two session timezones return the same value; every one of the seven inputs varied alone returns a different one; a null input returns null; and `anon` cannot execute it while `authenticated` can.

## 12. Requirement disposition

| Requirement | Status | Evidence |
|---|---|---|
| 2E-DISAMBIG-001 (ranked order, distinguishing evidence, owned rows, no model) | **MET** (contract) | `buildTaskDisambiguation` preserves `rankTaskCandidates`' total order untouched and marks `distinguishing: false` for any signal every shown candidate carries. No model exists on this path. The rendering surface is Slice 2E.7 |
| 2E-DISAMBIG-002 (explicit selection; nothing pre-applied, pre-checked or implied by ordering) | **MET** (contract) | `TaskDisambiguationView` has no field in which a selection could be expressed — unrepresentable, not merely unset. The selection control is Slice 2E.7 |
| 2E-DISAMBIG-003 (selection carries identity and observed pre-state into a fresh server-computed preview; never a client-computed effect) | **MET** | `buildTaskCommandPreview` takes `selectedTaskId` and requires it to be present in the match result it is *for*; every value comes from the observed rows. The only client-echoed input is `expected`, used solely as a staleness witness |
| 2E-DISAMBIG-004 (resolved per command; a selection never persists as a preference) | **MET** | Pure function; nothing is stored, and no store exists |
| 2E-DISAMBIG-005 (ineligible between listing and selection → stale, not error) | **MET** | Three `rejected_stale` paths: absent from `rows`/`candidates`, `isEligibleStatus` false, `expected.updatedAt` mismatch. Pinned in `preview.test.ts` |
| 2E-PREVIEW-001 (read-only, computed server-side, `willMutate: false`) | **MET**, with a named carry-forward | The literal type, plus a module with no client, no clock read and nothing to mutate with. "Server-side" is a property the Slice 2E.7 Server Action must preserve — there is no caller today |
| 2E-PREVIEW-002 (selected task, current and proposed value of every touched field, reversibility, undo window, confirmation) | **MET** | `deltas` covers every `changedFields` member changed or not; `targetStatus` was added to the taxonomy so the four patch-less status actions can render a destination; `atApply` for `completed_at`/`cancelled_at`; `reversible`, `undoWindowHours = 24`, `requiresConfirmation` |
| 2E-PREVIEW-003 (every linked effect: reminders per §11.3, and that cancelling leaves the active lists) | **MET**, with the §7 correction stated | Four declared effect kinds derived from observed reminder state and the post-patch due date; `leaves_active_lists` for every destructive action |
| 2E-PREVIEW-004 (fingerprint over task identity, observed pre-state, canonical patch, policy version, owner, operation key) | **MET** — pgTAP authored, not locally executed | `202607250057` + `fingerprint.ts`. All seven inputs proven to reach the digest by seven `isnt` assertions, each varying one input against a shared base |
| 2E-PREVIEW-005 (no field **or relation** delta → `no_change`, truthful copy, no Apply) | **MET** | Field and relation deltas both consulted; instants compared as moments; `oneStep` withdrawn, `reversible` false, `effects` empty, copy from the declared `no_change` entry |
| 2E-PREVIEW-006 (stale reported, not silently recomputed) | **MET** | `rejected_stale` with empty `deltas` and empty `canonicalPatch` — rendering the effects of a pre-state known to be wrong is a quieter form of the same mistake |
| 2E-PREVIEW-007 (never another owner's data; never a value the caller could not already read) | **MET**, and enforced after a review found a leak | Cross-owner row is a `throw`; the stale/refused shells carry `title: null`/`status: null`; ref-name lookups re-apply the owner predicate; reminder counts scoped on `task_id` **and** `user_id` |
| 2E-UX-001 (twelve outcomes declared once and exhaustively; distinct truthful presentation) | **PARTIAL** | The vocabulary is declared for the first time as an iterable `as const`, and all twelve have distinct pt-BR/en copy. **Presentation** requires a surface, which is Slice 2E.7 |
| 2E-UX-002 (a pending command is never silently dropped; failure states explicit and recoverable) | **PARTIAL** | The preview's failure states are explicit, terminal-at-preview and localized (`rejected_stale`, `refused`), and each sends the caller back for a fresh match. "Never silently dropped" is a property of a surface that does not exist yet — Slice 2E.7 |
| 2E-I18N-001 (typed feature `copy.ts`, pt-BR and en exhaustive, no locale ternaries) | **MET** | `copy.ts` with `satisfies Record<Locale, TaskCommandCopy>`, `Locale` imported never redeclared, and **no** `?? copy["pt-BR"]` fallback — so an unhandled locale is a compile error, not silently-Portuguese text |
| 2E-I18N-002 (dates render in the user's timezone and locale) | **MET** | `Intl.DateTimeFormat(locale, { timeZone })` in both projections, with a declared `unrenderableInstant` fallback so an unknown IANA zone cannot take the whole preview down |
| 2E-I18N-003 (every declared `2E_*` detail code maps to localized copy in both locales, asserted against the declared list) | **PARTIAL — the literal subject does not exist yet** | The *mechanism* ships and is tested against seven declared vocabularies via `copy.test.ts`'s `VOCABULARIES` table. The `2E_*` database detail codes arrive with Slice 2E.4's RPC, and **nothing will notice when they land without copy unless a row is added to that table. Slice 2E.4 owns it.** |
| 2E-A11Y-001 (keyboard operable, including disambiguation selection and confirmation) | **DEFERRED to Slice 2E.7** | No Phase 2E UI, route or Server Action exists. Epic 2E-C's "the surfaces are keyboard operable and localized" clause is therefore not met — §2 and §13.2 |
| 2E-A11Y-002 (focus moves predictably after an async action) | **DEFERRED to Slice 2E.7** | With no mutation there is no async action, so there is nothing to test focus against |
| 2E-A11Y-003 (outcome changes announced through a live region) | **DEFERRED to Slice 2E.7** | Same: no surface, and no outcome transition to announce |
| 2E-OPERATIONS-001 (additive, forward-only, chain resets from zero) | **Met** | The whole chain, including both `202607250056` amendments and `202607250057`, applied from an empty database in run `30203421883`; `db lint` over `public,private` clean |
| 2E-OPERATIONS-002 (generated-type parity by content comparison) | **MET by a substituted mechanism** (ADR-041) | Both entries hand-written; `database-types-parity.test.ts` compares by content; pgTAP pins both against `pg_proc` from the real catalog — that third check authored, not locally executed. No claim of regeneration is made anywhere |
| 2E-OPERATIONS-003 (focused disposable remote smoke) | **NOT RUN — blocked on deployment** | Non-blocking for this slice's verdict, owed at Epic 2E-H. Specification in §11 |
| 2E-OPERATIONS-005 (rollback documented, no reverted migration) | **MET** | §10 |
| 2E-OWNERSHIP-003 (nothing executable by `anon`; no grant widened) | **MET** | Both new `grant execute` to `authenticated` with `revoke all … from public, anon`. `resolve_owned_entity_exact` stays revoked from `authenticated`; the tempting widening was not taken |
| 2E-OWNERSHIP-005 (command text never a model instruction; no task row in a prompt) | **MET** | There is no model on this path. Asserted structurally in `disambiguation.ts` |
| 2E-IDEMPOTENCY-003 (canonical fingerprint stable under key reordering and insignificant whitespace) | **MET** — pgTAP authored, not locally executed | `jsonb_build_object` *is* the canonicalizer: jsonb sorts keys and discards whitespace before `::text` runs, so the property is structural. Two assertions state it literally, and they are what fails if the canonicalizer is ever replaced |
| 2E-MATCH-007 (authoritative normalizer) | **MET, extended** | Relation-reference resolution joins every other lexical decision in SQL. Nothing re-normalizes in TypeScript, enforced structurally by `normalizer-divergence.test.ts` over the whole directory |
| 2E-UNDO-002 (an action that cannot be truthfully reversed is not advertised as reversible) | **MET** | `reversible: changed && policy.reversible` — a `no_change` preview reverses nothing, so it claims nothing |
| 2E-UNDO-006 (the 24-hour window is disclosed wherever reversibility is claimed) | **MET** (disclosure half) | `TASK_COMMAND_UNDO_WINDOW_HOURS = 24`, pinned by `policy-lock.test.ts` against `202607160003:153`, and `copy.preview.undoWindow` is non-null exactly when reversibility is claimed. "The affordance is not rendered for an expired operation" belongs to Slices 2E.4/2E.7 |

## 13. Limitations that remain

These are the eight open items this slice owes, carried verbatim in substance from `docs/reports/PHASE_2E_PROGRESS.md`.

1. ~~Final CI confirmation on `4f9aff8`.~~ **CLOSED** — all three jobs green in run `30203421883`, pgTAP `Files=27, Tests=927, Result: PASS`.
2. **Epic 2E-C's "surfaces are keyboard operable and localized" clause is deliberately not met.** No Phase 2E UI, route or Server Action exists; 2E.4/2E.5/2E.6 each change the surface's shape; with no mutation there is no async action, so 2E-A11Y-002/003 cannot be tested. Components are deferred to **Slice 2E.7**, which must own 2E-A11Y-001/002/003 in the traceability matrix. ADR-043.
3. **2E-I18N-003's literal subject does not exist yet.** The requirement names "every declared `2E_*` detail code"; those arrive with Slice 2E.4's RPC. The mechanism is built and tested against seven declared vocabularies, but nothing will notice when the codes land without copy unless a row is added to `copy.test.ts`'s `VOCABULARIES` table. **Slice 2E.4 owns that.**
4. **2E-OPERATIONS-003's focused remote smoke is still owed and still blocked on deployment**, inherited from Slice 2E.2 and now covering this slice too. Nothing calls the RPCs and neither exists in the linked project. §11.
5. **A pre-existing flaky test reds CI intermittently.** `src/features/tasks/task-candidate-form.test.tsx` → "keeps one idempotency key for a same-payload retry…" failed in run `30184955865` with `Unable to find an accessible element with the role "button" and name "Resolver 2 sugestões"`. It passes 3/3 locally, this slice never touched the file, and its most recent commit (`a2c263d`, Slice 2E.2) was itself a fix for the same async-read flake class. PRD §20 names flaky gates as a risk that erodes evidence. Recorded in `docs/TODO.md`.
6. **`fingerprint.ts` has no production caller.** By design: its consumers are Slices 2E.4/2E.5. Behaviour is proven through an injected client double, which is also what lets the whole path from preview to declared RPC arguments be exercised without a database or a network.
7. **Alias-driven relation resolution is unproven in pgTAP.** `resolve_owned_entity_exact` also unions `entity_aliases` within a validity window; the new assertions cover the base-table path only. If Slice 2E.4 relies on alias resolution, it must add fixtures. Recorded in `docs/TODO.md`.
8. **Documentation for this slice was outstanding at the point the progress record was written**, and is closed by this report together with the `STATE.md`, `CHANGELOG.md`, `TODO.md` and `DECISIONS.md` updates that accompany it.

Two limitations inherited from earlier slices are unchanged here and are not re-litigated: the 2E-MATCH-018 baseline still measures the scoring layer rather than end-to-end matching, and `OpenAIProvider.parseTaskCommand` remains untestable by import.

## 14. Verdict

**READY WITH NON-BLOCKING NOTES.**

Every `2E-DISAMBIG` and `2E-PREVIEW` requirement is met at the contract level. The projection sufficiency question Slice 2E.2 handed forward was answered by execution rather than by inspection, twice, and both amendments landed while amending in place was still legitimate. The two Criticals an adversarial review proved are closed, the two assertions that let them hide are now pinned on both sides of their boundaries, and the one rejected finding is recorded with its reasoning rather than quietly dropped.

The one gate this verdict waited on has been read. Run `30203421883` on `4f9aff8` is green across all three jobs, and the pgTAP suite reports `Files=27, Tests=927, Result: PASS`. That total is `883 + 25 + 19` against Slice 2E.2's baseline, which is the part worth stating: it proves the twice-amended `RETURNS TABLE` applied from an empty database *and* that every assertion this slice added actually executed. A passing suite that silently skipped a file would have looked identical without that arithmetic, and this repository has already lost a whole pgTAP file to a NUL byte while TypeScript stayed green.

**The remaining notes are non-blocking, and each is owed by a named slice**: open items 2 (Epic 2E-C's surface clause, deferred to 2E.7 with 2E-A11Y-001/002/003), 3 (2E-I18N-003's `2E_*` detail codes, owned by 2E.4), 4 (the focused remote smoke, blocked on deployment) and 7 (alias-driven ref resolution unproven in pgTAP). None is claimed to have passed.

**What is deliberately not claimed:** no local pgTAP or `db lint` run, no type regeneration, no mutation round for this slice, and no remote smoke. Open item 5's flaky test red-ed an earlier run and is a pre-existing evidence problem under PRD §20, not a slice defect — but it is recorded rather than waved through.

## 15. Next slice

**Slice 2E.4 — Reversible non-destructive updates (Epic 2E-D).** PRD §13.5 (`2E-UPDATE-001..018`), §13.8, §13.9, §13.10, §13.11 and §11.3; then `preview.ts`, `fingerprint.ts`, `202607250057`, and `confirm_entry_task_candidates_v6` as the undo/replay precedent.

Rules this slice already committed to, which are **not** re-litigable:

- **The fingerprint is replay identity and token binding — never a staleness gate.** Staleness (2E-UPDATE-003) must be a separate, typed, column-by-column `is distinct from` comparison of the `for update`-locked row against the supplied pre-state. Conflating them forces the RPC to re-render the locked row's timestamps as text byte-identically to what PostgREST emitted, which is unwinnable. This is also the existing `resolve_pending_question` pattern.
- **Hash the client-supplied `observedBefore` string verbatim.** Never re-render it from the locked row: the preview captured one string, and the apply must hash that same string.
- **Only `TASK_COMMAND_POLICY_VERSION` is hashed**, not the match policy version. Irreversible once fingerprints are stored.
- **A matching fingerprint is not confirmation evidence.** `task_command_fingerprint` is granted to `authenticated` and all its inputs are client-held, so it is client-derivable. 2E-DESTRUCTIVE-002's server-issued single-use token is a separate mechanism (Slice 2E.5).
- **Reminder state is deliberately absent from the fingerprint's pre-state.** The heartbeat flips `scheduled → sent` hourly with no user act; gating a write on it would manufacture a stale refusal on a cron tick.
- **`no_change` writes nothing** — no task update, no audit row, no undo row (2E-UPDATE-009) — and the preview is where it is detected and terminal.
- **`operation_key` namespacing:** `'taskcmd-v1:' || key` keeps 36 + 12 = 48 inside the 8..260 bound at `202607170020:82`.
- **`202607250056` is closed.** Any further change to its result columns or its argument list costs a `_v2` (`42P13`; and adding an argument creates an overload rather than replacing).

Slice 2E.4 additionally owes the `audit_task_change` actor derivation and its extension to `title`/`description` (2E-UPDATE-010, closing 2E-MATCH-006's declared blind spot), the `2E_*` detail-code row in `copy.test.ts`'s `VOCABULARIES` (open item 3), and alias-resolution fixtures if it relies on them (open item 7).
