# Phase 2E — Slice 2E.5 report

**Destructive actions and confirmation (Epic 2E-E, PRD §13.6).**

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` |
| Commits | `3e506c8` database contract · `9d614e9` TypeScript · `b22fe24` post-deploy guard fix · `5ac8076` + `d6cd690` + `af0bd03` pgTAP fixture corrections · `6bb2841` **withdrawal of the candidate-slot collision** |
| Migration added | `202607260059_phase_2e_destructive_confirmation.sql` |
| pgTAP added | `supabase/tests/phase_2e_task_command_destructive.sql`, `plan(91)` |
| Deployment | **nothing merged, deployed, tagged or released.** `202607250055`–`202607260059` are local only; remote parity remains `202607250054` |

---

## 1. What the slice had to do

Slice 2E.4 shipped `public.apply_task_command` with thirteen of the fifteen actions enabled and
`cancel_task`/`restore_task` refused with `2E_ACTION_NOT_ENABLED`, because 2E-DESTRUCTIVE-004 requires
the database itself to refuse a destructive action carrying no confirmation evidence — and no such
evidence existed. This slice supplies it, enables both verbs on the same RPC by `create or replace`, and
closes every door through which a task that cannot legitimately come back could come back anyway.

## 2. The requirement matrix, with the evidence for each row

| Req | Contract | Status | Evidence |
|---|---|---|---|
| **2E-DESTRUCTIVE-001** | Cancellation never applies in one step at any score or margin | **MET** | Two independent layers. At the match layer `taxonomy.ts` declares `oneStepEligible: false` and `matching.ts:620-625` returns `matched_requires_confirmation` before consulting it. At the write layer a one-step apply is by definition an apply with no preceding issuance call, and it is refused: `phase_2e_task_command_destructive.sql` asserts `P0001:2E_CONFIRMATION_REQUIRED` for a *perfectly formed* payload, plus that the task is untouched and no operation key was burned. `set_status` cannot reach `cancelled` (bounded to the six non-terminal, asserted in 2E.4). |
| **2E-DESTRUCTIVE-002** | Server-issued, single-use token bound to fingerprint, owner and operation key | **MET** | `public.task_command_confirmations` + `public.issue_task_command_confirmation`. The issuance RPC takes the **same seven arguments** as the apply and derives the digest itself through `public.task_command_fingerprint`; a caller-supplied digest is impossible because the function does not accept one. pgTAP asserts the stored digest **equals** what `task_command_fingerprint` produces from those seven values. Single use is a guarded `UPDATE ... where status = 'issued'` whose refusal branch is provoked from a fixture. Owner binding is `auth.uid()`; key binding is the lookup; all three are predicates of the same statement. No client role — including `service_role` — may INSERT, UPDATE or DELETE the table, asserted from `has_table_privilege` and re-proven at deploy. |
| **2E-DESTRUCTIVE-003** | A changed proposal invalidates prior confirmation | **MET** | The digest covers all seven values. pgTAP reaches the refusal two ways: by editing the pre-state, and by changing only the policy version — a value that touches no column of `public.tasks`, so nothing but the digest can be doing the refusing. Re-issuance under the same key with a different payload is `2E_IDEMPOTENCY_MISMATCH`, never a silent re-bind. |
| **2E-DESTRUCTIVE-004** | Refused by the database, not only by the UI | **MET** | The gate is inside `apply_task_command`, resolved from a taxonomy flag (`action_requires_confirmation`) rather than an action name. `apply.test.ts` additionally pins that `cancel_task` is the only branch that sets it, on both the SQL and the taxonomy sides. |
| **2E-DESTRUCTIVE-005** | The preview states four things | **MET — and it was not met before** | Slice 2E.4 disclosed three: leaves the active lists, the reminder effect, and the 24-hour window (`reversible` + `undoWindowHours`). The fourth — "remains restorable afterwards" — had no effect kind and no copy string. `restorable_after_undo_window` is added to `TASK_COMMAND_LINKED_EFFECTS` with copy in both locales, and `preview.test.ts` now pins the **exact ordered list** rather than a containment check, because three of four satisfies every containment assertion that could be written about it. |
| **2E-DESTRUCTIVE-006** | A cancelled task stays reachable, and `restore_task` is offered there | **MET at the contract layer; the rendered surface is 2E.7** | The affordance is `public.list_task_command_candidates` called with `array['cancelled']` and no hints — its only non-defaulted argument is the status array, it admits every eligible row when no hint is supplied, and it orders totally before truncating. pgTAP asserts a cancelled task is returned by that call. **A second listing RPC was written and deleted**: see §4. |
| **2E-DESTRUCTIVE-007** | User and undo-driven cancellation distinguishable in audit | **MET — and it was not met before** | There are *three* routes to a cancelled task, not two: `cancel_task`, the undo of a `restore_task`, and `private.undo_confirm_entry_tasks` compensating a creation. The third never set `app.audit_actor`, so the co-firing trigger recorded a system-executed compensating write as `actor = 'user'`. It is re-pasted with one `set_config` line — the same ADR-046 mechanism, not a second one — and pgTAP asserts all three routes on two subjects, because on an already-cancelled task the creation-undo's `where status <> 'cancelled'` writes no row at all and cannot carry the assertion. |
| **2E-DESTRUCTIVE-008** | The cancel/creation-undo collision, in **both** orderings | **MET** | Ordering A is asserted as a real sequence — confirmed cancel, then `public.undo_operation` on the creation through the real router, then the cancel-undo — refused with `55P03:2E_CREATION_UNDONE`, with the operation left `available` because the whole undo rolled back. Ordering B's live door is `restore_task`, refused with the same token; its other half is a `no_change` that writes nothing. A **negative control** takes the identical cancellation with no creation operation and undoes successfully. |
| **2E-DESTRUCTIVE-009** | The same guard closes every other door | **MET** | One `private.task_creation_undone`, three readers: `restore_task`, the cancel-undo, and `list_task_command_candidates`. The listing exclusion is asserted against a subject that is still `todo`, so the eligible-status filter cannot be what hides it, with a control proving an intact task still ranks. |

## 3. Two review rounds, and what each cost

Two adversarial rounds ran: one against the **design**, before any code, and one against the **shipped
code**, reading the migration, the pgTAP suite and the TypeScript together. Both changed the slice
materially, and the second one reversed part of the first.

### 3.1 The design round — five lenses, incomplete

It was **incomplete**: the synthesiser and three of twenty-five refutations died on a session limit. The
twenty-two refutations that ran were used; the three that did not were evaluated by hand against the
code, and the synthesis was done by hand. Recorded as incomplete rather than reported as clean. It
produced two findings that changed the slice — one of which the second round then disproved:

**1. Five lockstep edits, two of which fail silently.** Enabling the two verbs required them to join five
separate `p_action in ('complete_task', 'reopen_task', 'set_status')` predicates: the delta against the
claimed pre-state, the delta against the locked row, the write itself, and the two terminal-timestamp
expressions of the recorded `applied_state`. Missing the third sends `cancel_task` into the **relation
insert branch**; missing the fifth records a `cancelled_at` the row does not hold, which makes the
ten-column undo guard refuse **every** cancel-undo forever — and Slice 2E.4's own comment had already
named the hazard ("adding an action there means adding it here"). The five copies are now one declared
`status_writing_actions` constant.

### 3.2 The finding the design round got wrong, and the shipped round reversed

**2. A second collision that turned out not to exist.** The design round argued that
`202607220040:13-19` made candidate identity unique only over non-cancelled rows, and that
`confirm_entry_task_candidates_v6` records a resolution row only for a disposition **other than**
`'confirmed'` (`202607220044:1357-1358`) — so a confirmed candidate would leave no ledger entry, the
`2C_TERMINAL_DISPOSITION` gate would never fire for it, cancelling would free the candidate slot, and a
re-confirmed duplicate would make the later restore a bare `23505` that `apply.ts` reports as retryable
forever. A whole guard shipped on that argument: `2E_CANDIDATE_REMATERIALIZED`,
`private.task_candidate_slot_taken`, two raises, two `unique_violation` traps and a pgTAP section.

**It was wrong, and the review of the shipped code found it — four of five lenses independently.**
The claim is true of the RPC and false of the system. `public.record_entry_task_candidate_confirmation`
(`202607220041:299-364`) is an `after insert or update` trigger on `public.tasks` that writes exactly
that `'confirmed'` row — which is *why* v6 does not, and why `undo_confirm_entry_tasks` deletes
resolutions by `task_id` as well as by `undo_operation_id`. The row is keyed
`unique (user_id, interpretation_id, candidate_index)`, it survives the task's cancellation, and the
terminal-disposition gate reads it: **the duplicate can never be created.** The one path that does free
the slot is a creation-undo, which deletes those rows — and that path is already refused by
`2E_CREATION_UNDONE` at step 15b, before the row is even locked.

So the token was a declared member of a closed vocabulary no reachable state can provoke. **All of it
was removed** rather than kept as defence in depth, because ADR-049 — written in this same slice — says
exactly that an unprovokable member is the same defect as a missing raise. Applying one's own doctrine
to one's own work is the whole point of writing it down. In its place, both the migration and the pgTAP
suite now assert that `tasks_record_candidate_confirmation` still exists, because that trigger is the
load-bearing reason no guard is needed and nothing else in the repository would notice if it went.

The comment at `taxonomy.ts:301-305` was **right all along**, and this slice's "correction" of it was the
error. It is restored, with the misreading recorded at the site so the next reader does not repeat it.

**The lesson, stated plainly:** a reachability argument assembled from one function's source is a claim
about that function, not about the system. Triggers are where the difference hides, and neither the
requirement text nor the RPC being extended mentions this one.

### 3.3 The shipped-code round — five lenses, complete, fifteen findings

All five lenses returned; no agent errored. Findings, and their disposition:

| # | Finding | Verdict |
|---|---|---|
| 7 | The candidate-slot collision is unreachable; the guard, its token, its predicate, its traps and its pgTAP are dead weight, and `taxonomy.ts` now states the inverse of the truth. Raised by four lenses independently, from four different angles — SQL correctness, contract, pgTAP truth, cross-artifact. | **SURVIVED. Fixed** by withdrawing all of it (§3.2). The one finding that mattered most, and the one a single-artifact review could not have produced: it needed the RPC, a 2C trigger, a partial index and a ledger constraint read together. |
| 1 | `dest_iso` builds `observed_before` with a `+00` offset the RPC's ISO regex rejects, so every call in the suite returns `22023` instead of the thing under test. | **SURVIVED. Already fixed** — CI had found the same defect two runs earlier, and the lens confirmed both the cause and the fix. |
| 1 | The ordering-A reachability assertion is unfalsifiable: every instant in the transaction is `transaction_timestamp()`, so comparing `cancelled_at` against the recorded `applied_state` passes whether or not the creation-undo wrote anything. | **SURVIVED. Fixed** — it now counts `task_updated` rows, which the audit trigger writes only when a watched column really changed. This is the slice's own "unfalsifiable guard" doctrine turned on its own test. |
| 3 | Three comments describe code that is not there: a read-only half of the confirmation gate before the reservation, a third reader of `2E_CREATION_UNDONE` (`list_restorable_cancelled_tasks`, written and deleted), and a claim that a second destructive action acquires the gate by setting one taxonomy variable when three places name `cancel_task` literally. | **SURVIVED. Fixed** — all three corrected. Documentation that describes an earlier draft is a trap for the next reader, and two of these described things this slice had itself removed. |
| 1 | The declared-vocabulary modules miscount themselves. | **SURVIVED. Fixed** by the withdrawal: 11 → 10, with every count assertion updated. |
| 2 | The `unique_violation` backstop is preempted by a `P0001` the BEFORE trigger raises first, and over-broad because it can swallow a `23505` from another table. | **SURVIVED, and MOOT** — the backstop is gone with the guard it served. Recorded because the reasoning is right and would apply to any future trap of that shape. |

**Nothing was refuted as wrong.** Two findings were partially superseded by fixes already in flight, and
one became moot through a larger correction; none was dismissed. The round's whole value came from
reading four artifacts together — the exact discipline Slice 2E.4 recorded as its own lesson, now
vindicated twice.

## 4. Decisions taken, and one reversed

- **ADR-047 — the confirmation has no expiry.** §13.6 requires none; the digest binds the observed
  pre-state and the twelve-column staleness gate independently refuses any payload whose pre-state moved,
  so an outdated confirmation is unusable rather than dangerous. The decisive argument is 2E-UX-001: its
  outcome vocabulary is a *closed* list that `copy.ts` and the exhaustiveness test run against, and an
  expired confirmation has no member in it — an expiry would have to widen a closed contract or lie by
  reporting itself as `refused`.
- **ADR-048 — the token is the row, and the client never presents it.** `apply_task_command`'s seven
  arguments are fixed (an eighth would create a second function beside the first, which 2E-UPDATE-001
  forbids), so the apply resolves the confirmation by `(auth.uid(), btrim(operation_key))` and requires
  the stored digest to equal the one it derives itself. Every binding 2E-DESTRUCTIVE-002 names is
  enforced, and none is a value a caller may assert. This is the shape `public.undo_operation` already
  uses: possession of a server-minted uuid plus ownership, and nothing else.
- **ADR-049 — the collision guards are scoped, and the scoping is proven rather than trusted.** The
  cancel-undo guard keys on the recorded `cancel_task` because a creation-undo forces the row to
  `cancelled` while every other action's `applied_state.status` is something else, so every other
  field-undo is already refused by the ten-column guard. pgTAP asserts that reasoning with a rename:
  applied, creation-undone, then refused with `2E_UNDO_RESTORE_INTEGRITY` — the ten-column guard, not the
  collision guard.
- **Lock order is `undo_operations` before `public.tasks`, everywhere.** `public.undo_operation` takes
  the operation row `for update` and only then calls a handler that writes `public.tasks`, so both new
  readers of the creation family take those rows `for update` **before** the task is locked. The reverse
  is a cycle. The `for update` is not decoration: without it the predicate is a snapshot read and a
  creation-undo committing afterwards would let a `restore_task` resurrect a task deleted concurrently.
- **`2E_ACTION_NOT_ENABLED` is retired.** With all fifteen actions resolved from the taxonomy, no
  reachable state raises it, and this phase treats an unprovokable member of a closed vocabulary as the
  same defect as a missing raise. The `case`'s `else` survives as a fail-closed terminator raising the
  bare `22023` step 2 already gives an unknown action — a refusal that *is* provokable.
- **REVERSED: a dedicated `public.list_restorable_cancelled_tasks` was written and deleted.** The review
  established that `list_task_command_candidates(array['cancelled'])` already *is* the owner-scoped
  cancelled-task listing. Shipping a parallel one would have been worse than redundant: the
  2E-DESTRUCTIVE-009 exclusion would have lived on the new function only, leaving the existing one free
  to rank a creation-undone task for `restore_task` — so the matching path would keep offering a task the
  RPC refuses, which §12.6 and 2E-DISAMBIG-005 treat as a defect rather than a refusal. The predicate
  went into `list_task_command_candidates` instead, by a body-only `create or replace` that touches
  neither its result columns nor its argument list (both frozen by `42P13` exhaustion).
- **The candidate-slot conflict is deliberately NOT excluded from the listing**, and the asymmetry is the
  point: a creation-undone task is *deleted*, permanently, by the user's own act; a task whose slot was
  taken is merely *blocked* by a duplicate the user can still cancel. Hiding the second would hide the
  only row from which the situation is legible. It stays listed and the refusal names the way out.

## 5. The vocabulary

`TASK_COMMAND_ERROR_DETAILS` goes 9 → 10: minus `2E_ACTION_NOT_ENABLED`, plus `2E_CONFIRMATION_REQUIRED`
(`P0001`) and `2E_CREATION_UNDONE` (`55P03`). Both are `refused` and neither is retryable — resending
changes nothing, and `retryable: true` would put a "try again" control in front of a command that fails
identically forever. (An eleventh token shipped and was withdrawn; see §3.2.)

**`55P03` now carries a DETAIL on one path and none on the other**, which forced a mapper change:
`mapTaskCommandApplyError` reads the token first and falls back to `stale_pre_state`. Matching on the
code alone, as Slice 2E.4 did and documented as deliberate, would have degraded "that task was deleted"
into "the task changed since the preview" — inviting a refresh-and-retry that can never succeed. The
staleness raise still carries nothing, so `src/features/agent/actions.ts:221`'s convention holds for the
gate it was written for, and `errors.test.ts` now asserts that every *detailed* `55P03` carries a
declared token and that exactly the two collision tokens pair with that code.

## 6. The defect the pre-push audit caught

The post-deploy block greps the shipped function definitions for the invariants `create or replace` is
free to break silently. Reading its twenty-four grep literals back against the bodies they target found
one that did not match: it looked for `and confirmation_row.status = 'issued'` while the consuming UPDATE
aliases the table as `confirmation`. The migration would have **failed to deploy**, with a guard refusing
the very thing it was written to protect. Fixed in `b22fe24`.

That audit is the practice Slice 2E.4 recorded as cheaper than a red database job, and this is the second
consecutive slice in which it paid for itself.

## 7. Local gates

`lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **2039 passed / 115 files** · focused
`src/features/task-commands` **947 passed / 17 files** · `build` clean · `deno check` clean on both
Edge Function entrypoints.

**pgTAP cannot run locally — Docker is unavailable**, so `supabase db reset`, `supabase test db` and
`supabase db lint --local` never execute on this workstation. No claim of a local pgTAP run is made
anywhere in this report.

## 8. Database evidence

All three jobs green on `6bb2841` (run [30241338626](https://github.com/fabiokyrillos/my-brain/actions/runs/30241338626)):
`application` 2m04s · `edge worker` 11s · `database and journey` 3m45s.

**The arithmetic, not the pass.**

| Check | Evidence |
|---|---|
| Migration chain applies from an empty database | `supabase db reset` applied 118 migrations, `202607260059_phase_2e_destructive_confirmation.sql` among them. The post-deploy `DO` block therefore executed and every one of its catalog assertions held. |
| pgTAP totals | `Files=29, Tests=1150, Result: PASS`, `All tests successful.` Slice 2E.4's baseline was `Files=28, Tests=1059`, so the delta is **exactly `+1` file and `+91` assertions** — the new file's whole `plan(91)`, with `phase_2e_task_command_apply.sql` unchanged at 132 and `rpc_version_retirement.sql` at 24. |
| The new file executed rather than being skipped | `phase_2e_task_command_destructive.sql .......... ok` appears in the log, and `phase_2e_task_command_apply.sql ................ ok` beside it. |
| Nothing was skipped, voided or plan-mismatched | Zero occurrences of `not ok`, `# SKIP`, `# TODO`, `Bad plan` or `Failed` anywhere in the job log. |
| Database lint | `supabase db lint --local --schema public,private --level warning --fail-on error` — **both** schemas, failing on error. |
| Journey | `e2e/foundation.spec.ts` against the production build, desktop and Pixel 7. |

Three earlier runs on this branch were red, and each is worth recording because each names a defect a
local gate could not have seen:

1. `9d614e9`/`b22fe24` — `2C_INVALID_CANDIDATE_PROVENANCE` on a fixture insert. **16 assertions ran and
   all passed**, which is what proved the migration applies and its post-deploy block holds.
2. `5ac8076` — `Invalid observed-before instant`; 44 ran, 22 failed on one wrong offset format, and the
   direct RPC call at the 44th aborted the transaction so the remaining 52 never ran. `Bad plan` was the
   symptom; a single refusal was the cause.
3. `d6cd690`/`af0bd03` — green on everything except the candidate-slot section, which the shipped-code
   review then removed entirely.

**pgTAP never ran locally**, in any of this. Docker is unavailable on the workstation.

## 9. Open items owed by Slice 2E.5

1. **The design-review round was incomplete.** The synthesiser and three of twenty-five refutations died
   on a session limit. The twenty-two refutations that did run were used; the three that did not were
   evaluated by hand against the code instead, and the synthesis was done by hand. Recorded as incomplete
   rather than reported as clean.
2. **No dedicated mutation round ran**, for the second slice running. Slice 2E.2's 36-mutation discipline
   has not been repeated as its own pass.
3. **2E-OPERATIONS-003's focused remote smoke — owed, blocked on deployment.** Epic 2E-E inherits Epic
   2E-D's unmet obligation and adds to it: a real two-session concurrency race on one confirmation,
   consumption across two separate PostgREST requests, and cross-owner confirmation denial with two real
   owners.
4. **Authenticated desktop/mobile Playwright journeys** — blocked on there being no surface (ADR-043).
5. **2E-DESTRUCTIVE-006's rendered affordance is Slice 2E.7's.** What ships here is the owner-scoped
   query that surface reads, and the exclusion the requirement demands of it. The listing itself is
   asserted; the rendering of `restore_task` beside each row is not, because there is nothing to render
   into.
6. **`confirmation.ts` and `apply.ts` still have no production caller.** By design; Slice 2E.7.
7. **The candidate-slot reasoning now rests on a trigger, and that dependence is new.**
   `record_entry_task_candidate_confirmation` is why a cancelled task keeps its candidate slot, and both
   the migration and the pgTAP suite assert it still exists — but the *consequence* (that a re-confirmation
   is refused with `2C_TERMINAL_DISPOSITION`) is asserted nowhere in this slice, because it is 2C's
   contract and 2C's suite. If a future slice touches that trigger, the assertion here fires and points at
   this reasoning; if it touches the terminal-disposition gate instead, nothing here notices.
9. **The pre-existing flaky test** `src/features/tasks/task-candidate-form.test.tsx` still reds CI
   intermittently.
