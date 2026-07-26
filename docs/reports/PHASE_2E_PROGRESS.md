# Phase 2E — Execution Progress

**Status: IN PROGRESS — Slice 2E.3 accepted; Slice 2E.4 next.**

This file is the handoff between execution sessions. It is authoritative for *where the work stands*; `docs/PHASE_2E_PRD.md` remains authoritative for *what the work is*.

## Repository state

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` (tracks its remote) |
| Branch HEAD | `4f9aff8` |
| Phase base | `2e2acfd` |
| Working tree | clean |
| Draft PR | [#18](https://github.com/fabiokyrillos/my-brain/pull/18) — CI evidence only, **must not be merged before Slice 2E.8** |
| CI | **all three jobs green** on `4f9aff8` (run `30203421883`): `application`, `edge worker`, `database and journey`. The pgTAP suite reports `Files=27, Tests=927, Result: PASS` |
| Merged / tagged / released | nothing |

**Drift corrected on entry to this session:** the previous record named `56111ac` as branch HEAD and cited CI run `30182925282`. Both were stale by two docs-only commits; CI was green on the true HEAD (`52f8db6`, run `30183090238`). No regression, and Slices 2E.1/2E.2 remain accepted.

## Deployment state

| Artifact | State |
|---|---|
| Remote migration parity | `202607250054` — unchanged since the pre-2E cutover, verified this session |
| `202607250055`, `202607250056`, `202607250057` | **local only.** The whole chain applies from zero in CI; none is applied to the linked project |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — unchanged and verified; Slices 2E.1–2E.3 touch no worker code |
| Generated types | hand-written (ADR-041), parity proven three ways. No claim of regeneration is made anywhere |

**The `202607250056` amendment window is now CLOSED by exhaustion, not by policy.** Slice 2E.2 deliberately left it open so its first consumer could prove the projection sufficient. Slice 2E.3 was that consumer, found it insufficient twice, and amended in place both times. Any further change to its result columns or arguments costs a `_v2` (`42P13` — and adding an argument creates an overload rather than replacing).

## Slice status

| Slice | Epic | Status |
|---|---|---|
| 2E.1 — Bounded task command contract | 2E-A | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_01_REPORT.md` |
| 2E.2 — Deterministic matching and margins | 2E-B | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_02_REPORT.md` |
| 2E.3 — Disambiguation and read-only preview | 2E-C | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_03_REPORT.md` |
| 2E.4 — Reversible non-destructive updates | 2E-D | not started |
| 2E.5 — Destructive actions and confirmation | 2E-E | not started |
| 2E.6 — No-match activity creation | 2E-F | not started |
| 2E.7 — Conversational and task-surface integration | 2E-G | not started |
| 2E.8 — Convergence and closeout | 2E-H | not started |

## Slice 2E.3 — what shipped

| Artifact | Responsibility |
|---|---|
| `202607250056` (amended in place, twice) | +3 `default null` relation-ref arguments; +8 result columns: `project/context/person_ref_id`, `project/context/person_ref_name`, `scheduled_reminder_count`, `next_reminder_at` |
| `202607250057` (new) | `public.task_command_fingerprint` — `immutable`, `strict`, **not** `security definer`, `jsonb_build_object` as the canonicalizer |
| `preview.ts` | `buildTaskCommandPreview` — pure, `willMutate: false` as a literal type, relation- and instant-aware `no_change`, linked effects from observed state, five dispositions |
| `disambiguation.ts` | `buildTaskDisambiguation` — ranked order preserved, distinguishing evidence marked, `confirm_one` never a list of one |
| `outcomes.ts` | 2E-UX-001's twelve outcomes, declared for the first time, as an iterable `as const` |
| `copy.ts` | pt-BR/en, every record keyed by a declared union, no locale fallback |
| `fingerprint.ts` | payload assembly + the RPC call. **Hashes nothing** |
| `taxonomy.ts` | `targetStatus` (PRD §11.2's `status→completed` arrow, previously only prose), `TASK_COMMAND_UNDO_WINDOW_HOURS` |

`TASK_COMMAND_POLICY_VERSION` → `2026-07-25.2` (the `targetStatus` addition moves the digest). `TASK_MATCH_POLICY_VERSION` stays `2026-07-25.3` — no weight, threshold or limit changed, and the pinned 2E-MATCH-018 baseline rates did not move.

### The two projection gaps, and why neither was fixable in TypeScript

1. **Relation reference resolution.** `patch.projectRef`/`contextRef`/`personRef` are the user's own words; the pre-state carries relation *ids*. Comparing them needs the authoritative normalizer, and `normalizer-divergence.test.ts` enumerates this directory and forbids `normalizeEntityName(`, `.localeCompare(` and `Intl.Collator(` in every non-test module — including ones not yet written. Resolution therefore happens in SQL, through `public.resolve_owned_entity_exact`, which the rest of the product already uses (ADR-021: no second copy of entity resolution). It is exact-or-nothing: null means no owned entity of that name *or* more than one, and the preview says so truthfully rather than guessing.
2. **Reminder state.** `reminders` was the only member of the taxonomy's `changedFields` with no observed state. `due_at is not null` is not a proxy: `create_due_task_reminder` is `after insert` only.

**Resolved ids, not booleans.** A boolean cannot separate "you have no project called Acme" from "Acme exists but is not linked", Slice 2E.4's `remove_added_relation` undo needs the id (2E-UPDATE-015), and binding the id stops a rename between preview and apply silently retargeting the assignment.

### Verified facts about reminders that contradict the PRD

**Nothing in this repository has ever cancelled a reminder.** The only writers of `public.reminders` are the `after insert` trigger (`202607160007:195-209`) and the heartbeat's two mark-sent updates (`202607160013:33`, `202607170016:552-560`). `authenticated` also retains full `insert/update/delete` on the table. So:

- §11.3's premise that `reopen_task` "re-creates the reminder the INSERT-only trigger cannot" is **false for rows written before Phase 2E** — such a task may still hold a live `scheduled` row. The preview renders observed state and discloses close-and-insert for it.
- `snoozed` is **not** a gap: every heartbeat path selects `status = 'scheduled'` and no other, so a snoozed reminder can never fire. §11.3's wording is complete.

### Review, and the corrections it forced

Three delegated implementation tracks plus one adversarial reviewer. The reviewer returned **NOT READY** on two Criticals, both reproduced by execution, both in modules written earlier in the same slice:

1. **The preview could never name the entity it would add.** `relationAfter` looked the resolved id up in the arrays of relations the task *already holds*, so the name resolved only in the `no_change` case and the real addition rendered `"+1"` — a raw literal bypassing the copy module. The already-held case appended anyway and rendered "Acme, Acme" beside copy saying nothing would change. Fixed by projecting the stored name (the second `202607250056` amendment).
2. **The reminder rule required a full hour of lead** (`due - 1h > now`, strictly), misreading `greatest(now(), due_at - interval '1 hour')`. "Move it to 5pm" typed at 4:30pm disclosed "no reminders are affected" while the mechanism would have created one. §11.3's condition is only that the due date is in the future.

Also fixed: `reopen_task`/`restore_task` promising a duplicate live reminder; `completed_at`/`cancelled_at` reporting `changed: false` while rendering a change; the stale/refused shells reading candidate content before ownership was established; two different instants acting as "now"; a fabricated empty-string `observedBefore` that would have produced a *valid* digest over an instant that never happened.

**One finding was rejected, with reasoning recorded.** The reviewer called it a defect that `no_change` suppresses reminder disclosure. 2E-UPDATE-009 is explicit that `no_change` writes no task update, no audit row and no undo row — so nothing happens to those reminders, and disclosing a cancellation would be the invented effect. The underlying inconsistency (a null due date beside a live reminder) is real, predates this phase, and is in `TODO.md`.

The reviewer also named the assertions that let both Criticals hide: the relation delta's `after.text` was only swept for non-emptiness, which `"+1"` satisfies, and the reminder rule was pinned only at "already past" and "+2h". Both are now pinned on both sides.

## Local gates on HEAD

`lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **1875 passed / 113 files** · focused `src/features/task-commands` **786 passed / 15 files** · `build` clean.

pgTAP cannot run locally — Docker is unavailable here, so `supabase db reset`, `supabase test db` and `supabase db lint --local` never execute on this workstation. It ran **in CI**: `phase_2e_task_command_matching.sql` at `plan(73)` and `phase_2e_task_command_fingerprint.sql` at `plan(19)`, inside a suite total of `Files=27, Tests=927, Result: PASS`. That is `883 + 25 + 19` against Slice 2E.2's baseline, so every assertion this slice added executed rather than being skipped.

## Open items owed by Slice 2E.3

1. ~~Final CI confirmation on `4f9aff8`.~~ **CLOSED.** All three jobs green (run `30203421883`); the twice-amended migration applies from an empty database and every new pgTAP assertion executed.
2. **Epic 2E-C's "surfaces are keyboard operable and localized" clause is deliberately NOT met.** No Phase 2E UI, route or Server Action exists; 2E.4/2E.5/2E.6 each change the surface's shape; and with no mutation there is no async action, so 2E-A11Y-002/003 cannot be tested. Components are deferred to **Slice 2E.7**, which must own 2E-A11Y-001/002/003 in the traceability matrix. Shipping them now would repeat the consumer-less `retryProcessingJob` pattern the pre-2E hardening removed.
3. **2E-I18N-003's literal subject does not exist yet.** The requirement names "every declared `2E_*` detail code"; those arrive with Slice 2E.4's RPC. The *mechanism* is built and tested against seven declared vocabularies, but nothing will notice when the codes land without copy unless a row is added to `copy.test.ts`'s `VOCABULARIES` table. **Slice 2E.4 owns that.**
4. **`2E-OPERATIONS-003` focused remote smoke — still owed, still blocked on deployment**, inherited from Slice 2E.2 and now covering this slice too. Nothing calls the RPCs and they do not exist in the linked project.
5. **A pre-existing flaky test reds CI intermittently.** `src/features/tasks/task-candidate-form.test.tsx` → "keeps one idempotency key for a same-payload retry…" failed in run `30184955865` with `Unable to find an accessible element with the role "button" and name "Resolver 2 sugestões"`. It passes 3/3 locally, this slice never touched the file, and its most recent commit (`a2c263d`, Slice 2E.2) was itself a fix for the same async-read flake class. PRD §20 names flaky gates as a risk that erodes evidence — recorded in `TODO.md`.
6. **`fingerprint.ts` has no production caller.** By design: its consumers are Slices 2E.4/2E.5. Behaviour is proven through an injected client double.
7. **Alias-driven relation resolution is unproven in pgTAP.** `resolve_owned_entity_exact` also unions `entity_aliases` within a validity window; the new assertions cover the base-table path only. If Slice 2E.4 relies on alias resolution, it must add fixtures.
8. **`PHASE_2E_SLICE_03_REPORT.md` is not yet written**, and `STATE.md` / `CHANGELOG.md` / `TODO.md` / `DECISIONS.md` are not yet updated for this slice.

## Next: Slice 2E.4 — Reversible non-destructive updates (Epic 2E-D)

Read `docs/PHASE_2E_PRD.md` §13.5 (`2E-UPDATE-001..018`), §13.8, §13.9, §13.10, §13.11 and §11.3, then `preview.ts`, `fingerprint.ts`, `202607250057`, and `confirm_entry_task_candidates_v6` as the undo/replay precedent.

Inherited rules that are **not** re-litigable, because Slice 2E.3 already committed to them:

- **The fingerprint is replay identity and token binding — never a staleness gate.** Staleness (2E-UPDATE-003) must be a separate, typed, column-by-column `is distinct from` comparison of the `for update`-locked row against the supplied pre-state. Conflating them forces the RPC to re-render the locked row's timestamps as text byte-identically to what PostgREST emitted, which is unwinnable. This is also the existing `resolve_pending_question` pattern.
- **Hash the client-supplied `observedBefore` string verbatim.** Never re-render it from the locked row: the preview captured one string, and the apply must hash that same string.
- **Only `TASK_COMMAND_POLICY_VERSION` is hashed**, not the match policy version. Irreversible once fingerprints are stored.
- **A matching fingerprint is not confirmation evidence.** `task_command_fingerprint` is granted to `authenticated` and all its inputs are client-held, so it is client-derivable. 2E-DESTRUCTIVE-002's server-issued single-use token is a separate mechanism (Slice 2E.5).
- **Reminder state is deliberately absent from the fingerprint's pre-state.** The heartbeat flips `scheduled → sent` hourly with no user act; gating a write on it would manufacture a stale refusal on a cron tick.
- **`no_change` writes nothing** — no task update, no audit row, no undo row (2E-UPDATE-009) — and the preview is where it is detected and terminal.
- **`operation_key` namespacing:** `'taskcmd-v1:' || key` keeps 36+12 = 48 inside the 8..260 bound at `202607170020:82`.
- Slice 2E.4 owes the `audit_task_change` actor derivation and its extension to `title`/`description` (2E-UPDATE-010, closing 2E-MATCH-006's declared blind spot).

Useful commands:

```powershell
npx vitest run src/features/task-commands           # focused
npm run lint; npm run typecheck; npm test; npm run build
deno check supabase/functions/process-jobs/index.ts supabase/functions/heartbeat/index.ts
deno test supabase/functions/
npx supabase migration list --linked                # parity
npx supabase functions list                         # deployed worker versions
gh pr checks 18                                     # the database gate
```

## Environment constraints that shape the workflow

- **Docker is unavailable.** Every SQL claim is proven only by draft PR #18's `database` job (~5 min/run): full migration reset from zero, the whole pgTAP suite, `db lint`, and the foundation journey on desktop and Pixel 7. Budget for the round trip; never report a local pgTAP run.
- `supabase gen types typescript` cannot run here either (ADR-041). Types are hand-written and parity is proven by content comparison plus `pg_proc`.
- Remote smokes and authenticated online journeys stay manual.
- Edit SQL with a text editor, never a script: a scripted edit once injected NUL bytes and silently voided an entire pgTAP file while TypeScript stayed green.
