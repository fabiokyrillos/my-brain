# Phase 2C Slice 01 — RED Report

Date: 2026-07-19
Branch: `codex/phase-2c-editable-candidate-tasks`
Base: `main` at `7d550cafa3f3346811b7c293d6d3d99f69813925`

## Outcome

Phase 2C.1 now has a local RED contract for editable candidate confirmation. The new tests define the typed edit command, profile-timezone due-date conversion, localized accessible editor behavior, and the future transactional database boundary. Production behavior is unchanged: the TypeScript modules are compile-only placeholders that deliberately do not satisfy the tests, the editor is not integrated into the current form, and migration `032` does not exist.

## Preflight

- The starting worktree on `main` was clean.
- Local `main` and `origin/main` both resolved to `7d550cafa3f3346811b7c293d6d3d99f69813925` after `git fetch origin`.
- Ahead/behind was `0/0`.
- The authorized branch `codex/phase-2c-editable-candidate-tasks` was created from that exact commit.
- Local and linked migration history both ended at `202607180031_fix_needs_attention_candidate_correlation.sql`; migration number `032` remains available.
- The installed Next.js Server Actions and forms guides were read before defining the future component boundary.

## Inspected implementation baseline

- `ActionableCandidateView` currently exposes `key`, `title`, optional `description`, and optional `dueAt`.
- `TaskCandidateForm` selects all actionable candidates by default and submits hidden `entryId`, `interpretationId`, `operationKey`, `locale`, and `candidateIndex[]` fields.
- `confirmEntryTasks` validates identifiers, operation key, locale, authentication, and selected indices; calls the four-argument legacy RPC; maps the proved stale/record-only codes; sanitizes other failures; revalidates product surfaces; and emits analytics only after success.
- The legacy database boundary is `public.confirm_entry_task_candidates(uuid, uuid, integer[], text) returns jsonb`.
- Legacy replay is keyed by operation key but does not compare an effective request fingerprint.
- The current RPC materializes candidate `waitingOn`, `parentIndex`, and blanket interpretation links; those effects are explicitly excluded from Phase 2C.1.
- `public.undo_operation(uuid)` cancels stored task IDs, appends audit evidence, and treats repeated undo as idempotent.
- Candidate `dueAt` is an optional offset-bearing string and persists as `tasks.due_at timestamptz`; the user timezone source is `profiles.timezone`.
- Vitest/Zod, Testing Library/user-event, and transactional pgTAP conventions were reused.
- No Edge Function or generated database type change is required for this RED slice.

## Changed-file classification

| File | Classification | Purpose |
| --- | --- | --- |
| `src/features/tasks/candidate-edit-contract.test.ts` | test | Strict closed edit command, normalization, canonicalization, bounds, counts, and serialization contract |
| `src/features/tasks/candidate-edit-contract.ts` | minimal compile-only placeholder | Proposed public types/exports with deliberate sentinel behavior |
| `src/features/tasks/candidate-due-date.test.ts` | test | Offset instant formatting, IANA wall-time conversion, malformed values, invalid zones, DST gaps/overlaps, and round trips |
| `src/features/tasks/candidate-due-date.ts` | minimal compile-only placeholder | Proposed conversion exports with deliberate sentinel behavior |
| `src/features/tasks/candidate-editor.test.tsx` | test | PT-BR/English editor state, callbacks, reset/clear semantics, immutable evidence, a11y, keyboard/focus, form safety, and 44-by-44 targets |
| `src/features/tasks/candidate-editor.tsx` | minimal compile-only placeholder | Proposed component interface with no production integration |
| `supabase/tests/editable_candidate_confirmation.sql` | test fixture/helper and pgTAP test | Guarded RED contract for the v2 RPC, fingerprint, validation, transaction, evidence, replay, conflict, provenance, partial resolution, and undo |
| `docs/reports/PHASE_2C_SLICE_01_RED.md` | documentation report | Durable RED evidence and handoff |

## RED coverage

### Typed edit command

- title-only, description-only, due-only, and all-field edits;
- omitted, unchanged, suggestion-equal, reset, empty changes, explicit null, and clear semantics;
- trimming and title/description limits;
- malformed/offsetless due strings;
- closed object shapes, scalar types, unknown keys, negative/fractional/duplicate indices;
- selected-index ownership, empty/duplicate/over-50 selection, missing immutable suggestions;
- 50/51 edit bounds, canonical index order, edited candidate/field counts;
- complete canonical serialization and the 131,072-byte UTF-8 boundary.

### Due-date conversion

- formatting offset-bearing instants to `datetime-local` in `America/Sao_Paulo`, `America/New_York`, and UTC;
- converting a valid local wall time to exactly one offset-bearing instant;
- invalid IANA zones, malformed/impossible local dates, malformed/impossible offset instants;
- DST gap and overlap rejection;
- normal round trips and workstation-timezone independence.

### Candidate editor

- collapsed and expanded localized states;
- exact immutable title/description/due presentation and profile-timezone copy;
- ordinary edit callback propagation, normalized unchanged behavior, explicit clear commands, and reset-to-null parent command;
- empty originals and exact reset behavior;
- edited/original evidence for every editable field;
- PT-BR and English copy, compact dates, timezone hints, clear actions, and reset announcements;
- unselected-state suspension without mounted-state loss;
- native `fieldset`/`legend`, labels, exact localized errors, non-vacuous `aria-describedby`, live region, and focus retention;
- `type="button"` form safety and complete keyboard order including field-local clear actions;
- stylesheet-backed 44-by-44 minimum target checks;
- no confidence score in the primary flow.

### Database contract

The pgTAP file declares 74 assertions and is guarded so a missing v2 RPC produces RED failures instead of aborting on an undefined function. It covers:

- exact `confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text) returns jsonb` contract;
- `SECURITY DEFINER`, catalog-proved empty `search_path`, authenticated-only execute, and legacy RPC preservation;
- nullable text `undo_operations.request_fingerprint`, exact lowercase SHA-256 shape, installed digest/encode dependencies, algorithm literal, and an independently computed canonical fingerprint;
- anonymous/cross-owner denial and stable malformed/stale/record-only codes;
- closed JSON, scalar types, operation-key limits, 1–50 selection, 0–50 edits, and the isolated UTF-8 byte bound using 51 real fixture candidates;
- successful no-edit fallback, whitespace description clear, explicit due clear, and exact edited materialization;
- canonical replay with reversed input order and suggestion-equal fields;
- mismatch by entry, interpretation, selection, and edits; already-materialized conflict;
- task/evidence/relation/dependency atomicity snapshots;
- exact task provenance/confidence/creator and immutable candidate preservation;
- exact closed audit and undo evidence, shared fingerprint, partial resolution, Needs Attention continuity, undo, repeated undo, and replay after undo;
- non-vacuous proof that Phase 2C.1 does not copy waiting state, parent links, entity links, or dependencies.

## Commands and evidence

```text
npx vitest run src/features/tasks/candidate-edit-contract.test.ts src/features/tasks/candidate-due-date.test.ts src/features/tasks/candidate-editor.test.tsx
```

Expected RED: 3 files failed; 106 tests total; 104 failed for deliberately missing placeholder behavior and 2 passed scaffold-level negative constraints. Breakdown: edit contract 50 failed/1 passed, due date 18 failed/0 passed, editor 36 failed/1 passed. There were no syntax, import, reference, or unexpected runtime failures.

```text
npx tsc --noEmit --pretty false
npx eslint src/features/tasks/candidate-edit-contract.test.ts src/features/tasks/candidate-edit-contract.ts src/features/tasks/candidate-due-date.test.ts src/features/tasks/candidate-due-date.ts src/features/tasks/candidate-editor.test.tsx src/features/tasks/candidate-editor.tsx
```

Both completed with exit code 0.

Static SQL validation proved `plan(74)` equals 74 assertions, all 67 inline JSON literals parse, dollar-quote tags are paired, parentheses are balanced, one `begin`/`rollback` pair is present, and no production `public` DDL or migration is embedded in the test.

```text
npx supabase test db --local supabase/tests/editable_candidate_confirmation.sql
npx supabase status
```

Runtime pgTAP did not execute. The local Supabase endpoint at `127.0.0.1:54322` refused the connection, the Docker daemon was unavailable, and no `docker` command was available. This is an environment limitation, not a claimed database-test result. The test was not run against the linked/remote database.

`npx supabase migration list --linked` was used read-only to confirm migration parity through `031`. No remote write occurred.

## Independent RED review

Three independent review passes were performed as TypeScript/domain, frontend/accessibility, and PostgreSQL/security reviewers. Initial findings were corrected, including closed-shape and bounds gaps, canonical replay dimensions, false/vacuous SQL assertions, exact evidence, bilingual error/a11y behavior, keyboard order, and target sizing. The final reviews reported no remaining critical or important test defects and judged all three RED boundaries ready for the initial local commit.

## Mandatory pre-GREEN gates and baseline blocker

1. Run real two-session same-request confirmation and correction-versus-confirmation races before migration `032` can be considered GREEN. The current pgTAP assertion proves only that the planned reservation/lock primitives exist; it does not claim behavioral concurrency proof.
2. Run the 74 pgTAP assertions against a safe local Supabase database and confirm `extensions.digest(bytea,text)` and `extensions.encode(bytea,text)` before migration execution. If the fingerprint helpers are unavailable, stop for an explicit database design decision.
3. Reconcile the pre-existing `supabase/tests/candidate_action_consistency.sql` expectation with the shipped source of truth: lines 11–14 expect the legacy RPC to be `SECURITY INVOKER`, while migration `028` deliberately defines it as `SECURITY DEFINER` and documents why authenticated execution requires that boundary. The existing full candidate pgTAP set cannot be treated as a trustworthy GREEN gate until this stale assertion is corrected in an authorized scope.

## Scope confirmation

- No production feature was implemented.
- No current production file or current form/Server Action behavior was changed.
- No migration was created, edited, applied, or deployed.
- No generated database type was changed.
- No Edge Function was changed.
- No remote fixture or mutation was created.
- No remote smoke, authenticated online Playwright run, deployment, push, or pull request occurred.
- Phase 2C.2 was not started.
