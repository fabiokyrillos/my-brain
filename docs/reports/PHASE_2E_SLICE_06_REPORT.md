# Phase 2E — Slice 2E.6 report

**Confirmed standalone task creation after a no-match command (Epic 2E-F, PRD §13.7).**

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` |
| Implementation/test HEAD | `2540ca52dbe42f1532e5f00584fc76480f9abcaa` |
| Commits | `56f7c84` feature · `9ea8631` review hardening · `ded8251` + `d13cbdc` parser gates · `08e0968` undo repair · `523366c` + `2540ca5` pgTAP fixture corrections |
| Migration added | `202607270060_phase_2e_no_match_task_creation.sql` |
| pgTAP added | `supabase/tests/phase_2e_task_command_creation.sql`, `plan(127)` |
| Authoritative CI | [run 30292038500](https://github.com/fabiokyrillos/my-brain/actions/runs/30292038500) — all three jobs green on the exact implementation/test HEAD |
| Deployment | **Nothing merged, deployed, tagged or released.** `202607250055`–`202607270060` remain local-only; linked remote parity remains `202607250054`. |

---

## 1. Outcome

Slice 2E.6 is **ACCEPTED — READY WITH NON-BLOCKING NOTES**.

When a validated task command has no matching task, the contract can now create one standalone task,
but only through a read-only preview, a server-issued single-use confirmation and the mutating RPC.
The created task is inbox work owned by the caller, carries `created_by = 'agent'`, has no entry or
candidate provenance, reuses the existing due-reminder trigger, emits the existing audit trail and
records one undo operation in the shared registry.

The supported creation family is intentionally narrow: `reschedule_due`, `set_planned`, `set_priority`,
`assign_project`, `assign_context`, `assign_person` and `set_waiting_on`. Creation requires a non-empty
validated `targetHints.titleWords`; the normalized title remains bounded to the database's 240-character
limit. Other actions remain no-match/clarification outcomes rather than inventing a task.

Replay is exact. A repeated operation key with the same canonical payload returns the original task,
undo and confirmation identities. If that creation has already been undone, replay reports
`creationUndone: true`; it never recreates, restores or reconfirms the task.

## 2. Shipped contract

| Artifact | Responsibility |
|---|---|
| `202607270060_phase_2e_no_match_task_creation.sql` | Canonical creation payload, read-only relation resolution, preview, confirmation issuance/consumption, standalone creation, compensating undo, creation-family integration, grants and fail-closed post-deploy assertions |
| `phase_2e_task_command_creation.sql` | 127 assertions covering validation, preview purity, confirmation binding, owner scoping, every supported scalar/relation action, reminders, replay, undo, collision doors and unauthenticated/cross-owner refusal |
| `creation.ts` | TypeScript orchestration with a capability-bound continuation after the one allowed clarification |
| `creation.test.ts` and contract/parity tests | Terminal outcome exhaustiveness, payload/type parity, copy vocabulary and migration-source parity |
| `creation-migration.test.ts` | Executable PostgreSQL/PLpgSQL parser and AST regressions over the shipped migration, final `DO` block and undo handler posture |
| `local-task-command-creation-race.mjs` | Real two-session PostgREST race and a local evidence-validator self-test |
| `.github/workflows/ci.yml` | Exact-SHA database gate for the real same-key two-session creation race |

The public RPC family is:

- `public.preview_task_command_creation(text, text[], jsonb, text, text, text)`
- `public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)`
- `public.create_task_command(text, text[], jsonb, text, text, text)`

These are first-generation unversioned names. A future incompatible contract must add a `_v2` family
rather than silently changing these signatures.

## 3. Review findings incorporated

The implementation received an adversarial design review, a full shipped-code review and scoped
re-reviews for every CI correction. No Critical or Important finding remains open.

The first shipped-code review found four Important issues, all fixed before acceptance:

1. Creation undo did not fully reconcile snoozed or extra live reminders.
2. Relation references could coerce non-string JSON values.
3. The one-clarification continuation trusted caller-controlled state.
4. Concurrency evidence was not a real two-session same-key race.

The fixes lock and reconcile the complete reminder set, require JSON strings for relation references,
make the continuation capability module-private, and run two independently authenticated PostgREST
sessions against the same confirmation and operation key.

The undo handler remains `SECURITY INVOKER`, has an empty `search_path`, is unreachable by client roles
and executes only through the existing `SECURITY DEFINER` owner-scoped router. Undo cancels rather than
deletes the task and its exact still-live reminder, then makes every resurrection door treat that
creation as permanently undone.

## 4. CI failure trail

The red runs are permanent evidence of defects found only when PostgreSQL executed the whole artifact:

| Run | First real failure | Correction |
|---|---|---|
| `30283079744` | `42601`, end of input in the payload helper: an inline `CASE` needed parentheses inside PLpgSQL `IF` grammar | Exact helper parser regression; minimal parentheses |
| `30287545414` | `42601` near `bundle`: schema-qualified `pg_catalog.position(... IN ...)` is not PostgreSQL's special `POSITION` grammar | Parse the exact final `DO` statement; use bare `position` in all 24 assertions |
| `30289110264` | Undo returned `42883`; registry also found one `SECURITY DEFINER` handler | Bare special-form `coalesce`; explicit `SECURITY INVOKER`; AST regressions for both |
| `30290500489` | Ambiguous `status` in a joined pgTAP query | Qualify the intended `r.status`; production had already passed |
| `30291402118` | A structural test read a private function while role-playing `authenticated` | Temporarily reset only around that privileged inspection, then restore `authenticated` |
| `30292038500` | **PASS** | Exact implementation/test HEAD accepted |

The parser/AST gates now cover the regions missed by the original source-contract tests. The pgTAP
fixture corrections did not remove, skip or weaken assertions; `plan(127)` stayed constant.

## 5. Verification

### Local

- `npm test`: **2,110 passed / 118 files**
- focused `src/features/task-commands`: **1,018 passed / 20 files**
- migration parser/AST contract: **17/17**
- `npm run lint`, `npm run typecheck`, production `npm run build`: green
- deployed Deno entrypoint checks: green
- Deno worker suite: **46/46**
- race evidence validator self-test: green
- `git diff --check`: green

Docker is unavailable on this workstation, so the migration chain, pgTAP, database lint and real
two-session race are not reported as local passes.

### Exact-SHA CI

Run `30292038500` is green on
`2540ca52dbe42f1532e5f00584fc76480f9abcaa`:

- application: lint, types, **2,110/2,110 tests**, production build
- edge: deployed entrypoint checks and **46/46 Deno tests**
- database migration chain: applied from an empty database
- pgTAP: `phase_2e_task_command_creation.sql ............. ok`;
  `Files=30, Tests=1277, Result: PASS`
- database lint: both `public` and `private`
- two-session race: `status: passed`, `sessions: 2`, with exactly one task, one undo operation, one
  live reminder, one command audit, one trigger audit and one consumed confirmation
- deterministic foundation journey: **6/6** across desktop and mobile

The pgTAP increase is exact: Slice 2E.5's `29 files / 1,150 tests` plus one file and 127 assertions.

## 6. Non-blocking notes and boundary

1. The linked project was not migrated and no worker/app was deployed, so an authenticated online smoke
   against the production database remains blocked on an explicitly authorized deployment.
2. The conversational and task-surface caller is Slice 2E.7. No route, Server Action or rendered
   affordance was added here.
3. The user explicitly stopped execution after accepted Slice 2E.6. **Slice 2E.7 was not started.**
4. Draft PR #18 remains open and unmerged; Phase 2E cannot be merged or released before its later
   convergence/closeout authorization.
