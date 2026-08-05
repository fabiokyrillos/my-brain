# Adversarial review — `docs/initiatives/phase-2f/PHASE_2F_PROPOSAL.md`

Reviewer role: independent architecture review. Posture: the proposal is assumed incorrect; the objective is invalidation, not redesign. No alternative architecture is offered. Every criticism cites the proposal requirement it attacks and the repository evidence that decides it.

Date: 2026-07-28. Reviewed against `b54b833` (`phase-2e-complete`), remote parity `202607280061`.

**Method note.** The proposal states (line 5) "Where documents disagreed with the code, the code won." This review applied the same rule to the proposal. Fourteen of its load-bearing factual claims were checked against source. Four are false or materially incomplete, and three of those four carry the proposal's central recommendation.

---

## Verdict

| | |
|---|---|
| **Sections that survive adversarial review** | §0 verdict table (deferrals), §2 out-of-scope, §7, §9's organizing lesson, §11 items 5 and 6, the write-path *diagnosis* in §0/§1, the reminder *defect mechanism* claim, the §4 drop-and-recreate SQL mechanics, the §0 bookkeeping point |
| **Sections that must not proceed to a PRD as written** | §2 item 1 + §4(1) + §12 2F.1 (provenance location), §3 "Command lifecycle" recommended default + §12 2F.2, §2 item 3 + §4(3) + §12 2F.3 (reminder scope and predicate), §12 2F.4 acceptance criteria, §2 item 4 + §12 2F.5 (evidence gate with no evidentiary standard) |
| **Findings** | 5 blocking, 5 major, 3 moderate |

The proposal's thesis — that two write paths to one table is the largest standing defect and that post-2E is when consolidation is cheapest — is not what this review attacks. The diagnosis is correct and verified. What fails is the specific mechanism proposed, the specific location chosen for provenance, and the acceptance criteria written to prove both.

---

## Blocking findings

### F1 — The chosen provenance location cannot discharge `2E-COMMAND-012`

**Requirements attacked:** §2 in-scope item 1; §3 "AI interaction" (line 90); §4 expected-migration item (1) (line 104); §12 slice 2F.1 acceptance; §1 business value bullet 2 (line 45).

**The claim.** §1: "A bad AI command becomes attributable to the exact prompt/strategy version that produced it **by reading a column** (ADR-053's residual risk, closed)." §3: "Provenance columns are written by the same ledger write that already records the parse."

**Why it fails.** `ADR-053` (`docs/DECISIONS.md:584`) states the requirement as: versions "are recorded **on the resulting operation**". The proposal records them on the parse's `ai_usage_events` row. That row is written at [actions.ts:703-708](src/features/task-commands/actions.ts#L703-L708):

```
await recordAIUsage(context.supabase, {
  operation: "task_command", model: parsed.model, userId: context.userId, usage: parsed,
});
```

No `sourceType`, no `sourceId` — and structurally there cannot be one, because the parse runs *before* matching resolves a task (`normalizeTaskCommandProposal` is line 710, after the ledger write). `recordAIUsage` ([usage.ts:35](src/lib/ai/usage.ts#L35)) passes `p_source_type: event.sourceType ?? null`, so the row lands with both link columns null. Nothing in `apply_task_command` records a reference back to that ledger row.

Consequence: after 2F.1 ships, attributing an operation to its prompt version requires joining the operation to the ledger row **by `user_id` and timestamp proximity** — structurally the same weak join ADR-053 recorded as the residual risk (`ai_usage_events.created_at` → deploy history), with one hop swapped. The residual risk is renamed, not closed. §1's "by reading a column" is false: you would read a column on a row you still cannot join to the operation.

**Evidence that would be needed.** A demonstrated join path from an operation to its parse ledger row — the ledger row's id returned by `recordAIUsage` and threaded onto the operation, or `p_source_id` populated after matching, or the columns placed on the operation/undo row instead. Any of these changes which function is re-declared, which invalidates §4's blast-radius analysis and §11 risk 3's mitigation plan.

**Stop?** **Yes.** 2F.1 must not be implemented until the join is specified. As written the phase pays its single highest-blast-radius schema change (§11 risk 3) and does not close the requirement it is paying for.

---

### F2 — 2F.1's placement rests on a rationale the proposal itself deletes

**Requirements attacked:** §0 verdict table row `2E-COMMAND-012`; §2 in-scope item 1; §12 slice 2F.1 rationale; §13 bullet 2.

`ADR-053`'s **Reason** clause (`docs/DECISIONS.md:589`) gives exactly one argument for locating this requirement in Phase 2F:

> "Phase 2F already has to widen that same table for task embeddings (PRD §22), which makes it the natural home for **one migration that fixes both**."

`docs/TODO.md:25` repeats it: "Phase 2F should close it alongside the `ai_usage_events` widening §22 already needs for task embeddings."

§2 out-of-scope (line 64) removes the embeddings widening from Phase 2F: "any `source_type` widening to `'task'` (that literal ships with the phase that ships embeddings, not speculatively)."

The amortization argument is therefore void, and §13 bullet 2 defends the placement circularly — "it is first because it is *small, independent and already promised* (ADR-053 names Phase 2F)". ADR-053 named Phase 2F **because** Phase 2F was going to widen the table anyway. Remove the other half and the ADR's own reasoning no longer supports the placement. The proposal never registers that it has invalidated its own citation.

**Evidence that would be needed.** An argument for the drop-and-recreate cost *unamortized*, standing on demand rather than on a citation whose premise the proposal removed. That demand does not exist today: §0 line 21 establishes the command surface has "been live for **hours** with zero real commands typed", so zero bad commands have needed attribution.

**Stop?** **Yes for 2F.1's placement.** The phase can proceed without it; the requirement's home is now an open question, not a settled one.

---

### F3 — §11 risk 3 answers half of ADR-053's rejection and asserts the other half away

**Requirement attacked:** §11 risk 3 (line 168).

The proposal: "This is exactly the change ADR-053 judged too risky *for a closeout slice* — as a phase's opening slice with full evidence available, it is routine."

ADR-053's rejection has **two independent legs** (`docs/DECISIONS.md:587`):

1. *Blast radius* — "the function is shared by **every** AI path in the product and its exact signature is pinned by two `::regprocedure` casts in `phase_2e_task_command_ai_usage.sql`, a `has_function` type array in `ai_usage_rls.sql`, hand-written generated types, and the Deno worker — six-plus files that must move in lockstep, **verifiable only through CI**."
2. *Closeout timing* — §589, "A closeout slice that ships its riskiest schema change last has misunderstood what closeout is for."

Leg 1 is not conditional on the slice's position in a phase. §11 risk 3's mitigation — "CI database job plus an executed remote smoke" — is precisely the evidence ADR-053 already had in view when it wrote "verifiable only through CI". Nothing has changed between the ADR (2026-07-28) and the proposal (2026-07-28). The word "routine" is doing work no new evidence supports.

Verified: `record_ai_usage` is a 10-argument function with 8 defaults ([202607250055:74-85](supabase/migrations/202607250055_phase_2e_task_command_ai_usage.sql#L74-L85)), grants pinned at `:177-179`, called by `supabase/functions/process-jobs/entry.ts` and `attachment.ts`, and pinned in `supabase/tests/phase_2e_task_command_ai_usage.sql` and `supabase/tests/ai_usage_rls.sql`. The ADR's inventory is accurate.

**Evidence that would be needed.** A new fact that lowers the blast radius — e.g. a demonstrated dry run of the drop-and-recreate against a disposable hosted project with all six pins moved and the worker exercised. §9 already requires exactly this standard ("a verifier that has never run is a claim, not a gate"); §11 risk 3 does not meet it.

**Stop?** **Yes**, until the dry run exists. This is the proposal's own standard applied to the proposal.

---

### F4 — §3's recommended default is refuted by the code §3 cites in its support

**Requirements attacked:** §3 "Command lifecycle" (line 88, the sentence beginning "Recommended default"); §4 "RPC additions: ideally zero" (line 105); §4 "Indexes: none anticipated; no new query shapes are introduced" (line 107); §12 slice 2F.2 "Deployment impact: code-only if reuse wins"; §13 bullet 1; §14 unknown 1.

**The claim.** "The Work projection already carries `updated_at` (verified in code), so a surface click can synthesize a full envelope: taxonomy action, canonical patch, **expected pre-state from the rendered row**, client-minted operation key … and the fingerprint derived server-side as always. This yields **zero new mutation RPCs**."

**What the contract actually requires.** `apply_task_command` rejects any `p_pre_state` that does not carry **exactly 19 keys**:

- [202607260059:876](supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql#L876) — `if (select count(*) from jsonb_object_keys(p_pre_state)) <> 19 … raise`
- `:922-927` — `projectIds`, `contextIds`, `personIds`, `personRoles` must be arrays, with `personIds`/`personRoles` of equal length
- `:1459-1473` — the staleness gate compares twelve scalars, including `completed_at`, `cancelled_at` and `created_at`

`TaskPreState` ([matching.ts:61-81](src/features/task-commands/matching.ts#L61-L81)) is the 19-field shape: 12 scalars plus `projectIds`, `projectNames`, `contextIds`, `contextNames`, `personIds`, `personNames`, `personRoles`.

**What the Work projection actually selects.** [work-projection.ts:120](src/features/daily-cycle/work-projection.ts#L120):

```
.select("id,user_id,title,description,status,due_at,created_by,updated_at,planned_at,manual_priority,intentional_no_due,no_due_reason,parent_task_id")
```

Thirteen columns, **no relation joins at all**. Missing from the required 19: `completed_at`, `cancelled_at`, `created_at`, and all seven relation arrays. **Ten of nineteen keys are unavailable from the rendered row.**

**And a seventh argument is missing from the envelope list entirely.** `p_observed_before` is required, pattern-validated as an ISO instant, and hashed into the fingerprint ([202607260059:858-862](supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql#L858-L862); [apply.ts:180-192](src/features/task-commands/apply.ts#L180-L192)). Today it is produced by SQL — "The instant SQL resolved the pre-state against" ([matching.ts:99](src/features/task-commands/matching.ts#L99)), sourced from `list_task_command_candidates`. A surface button performs no such call and has no server-observed instant to supply. §3's five-item envelope list omits it.

**Why this is worse than the proposal's own concession.** §13 bullet 1 concedes the point as "a real unknown … *not* yet on demonstrated ergonomics of expected-pre-state for a twelve-column witness synthesized from a projection row that carries fewer columns than the preview does." Three errors in one sentence: the witness is nineteen keys, not twelve; the deficit is not an ergonomics unknown but a measurable fact available today; and the missing part is not a few columns but three joins the projection does not perform. §14 lists this as unknown 1 to be "resolvable before code" — it is already resolved, against the proposal.

**Consequences that propagate.** With reuse excluded, §4's "RPC additions: ideally zero" is unsupported; §4's "no new query shapes are introduced" is unsupported (widening the Work projection to carry three relation joins per row *is* a new query shape, with a plausible index question §4 forecloses); §12's 2F.2 "Deployment impact: code-only if reuse wins" is unsupported; and §12's 2F.2 complexity, rollback story ("code revert") and migration count all change.

**Evidence that would be needed.** A spike demonstrating one of: (a) the Work projection widened to all nineteen fields including three relation joins, with its cost measured on a realistic row count; or (b) a per-task pre-state read that returns the 19-key shape by task id rather than by title match. Until one exists, "reuse" is not a default — it is the option the evidence excludes.

**Stop?** **Yes.** §3's "Recommended default: **reuse `apply_task_command` / the creation family directly**" must be withdrawn or re-evidenced before 2F.2 enters a PRD. The design gate §3 promises is currently scheduled to run *after* approval on a question that is already answered.

---

### F5 — 2F.4's verification instrument is destroyed by the change it is meant to verify

**Requirements attacked:** §12 slice 2F.4 acceptance ("full remote suite green in the deployment session"); §9 "Deployment validation" (line 152); §11 risk 2 (line 167); §11 item 7 ("net security delta is strictly positive"); §12 2F.4 complexity ("Small change, high verification").

§11 risk 2 frames the blast radius as "A forgotten writer — app code, script, e2e fixture, smoke — breaks at revocation time." It is not a forgotten writer. It is the gate itself:

| Writer | Role used | What breaks on revocation |
|---|---|---|
| [remote-phase-2e-smoke.mjs:144](scripts/remote-phase-2e-smoke.mjs#L144) `owner.client.from("tasks").insert(rows)` | authenticated | The Phase 2E aggregate smoke — the exact suite §12 2F.4 names as its acceptance gate |
| [remote-supabase-smoke.mjs:258](scripts/remote-supabase-smoke.mjs#L258) and `:286` | authenticated | Task **and reminder** fixtures in the full remote smoke |
| [remote-editable-candidate-confirmation-smoke.mjs:797](scripts/remote-editable-candidate-confirmation-smoke.mjs#L797) `otherOwner.from("tasks").insert(...)` | authenticated (second owner) | The repository's executable proof that **RLS** denies a cross-tenant task write |

The third row is the serious one. After revocation, a cross-owner insert is refused by the *grant* before RLS is ever consulted. The assertion still passes — and it now proves nothing about the multitenant trust boundary. §11 item 7 declares the phase's "net security delta is strictly positive"; it is positive on posture and **negative on evidence**, and the proposal does not weigh the second.

The revocation *mechanism* survives review: the repository already uses exactly this pattern ([202607170016:196-244](supabase/migrations/202607170016_foundation_hardening.sql#L196-L244) revokes `insert, update, delete` on `undo_operations`, `entry_interpretations`, `entry_entities`, `heartbeat_runs` and others from `authenticated`, with `anon` revoked wholesale in earlier migrations), and `tasks`/`reminders` are simply absent from that list. The mechanism is precedented and low-risk. The **fixtures** are not.

**Evidence that would be needed.** The §14(2) sweep executed and published **before approval**, not before 2F.2; a decision on how cross-tenant RLS on `tasks` remains provable after revocation; and a re-fixturing plan (service-role seeding) costed into 2F.4. "Small change, high verification" understates a change that requires rewriting the verification.

**Stop?** **Yes for 2F.4.** §14 already lists the sweep as an unknown, but §12 2F.4's acceptance criteria are written as though it resolves benignly. It does not.

---

## Major findings

### F6 — §2 line 76 and §5 assert "no behaviour change" while §3 imports one

**Requirements attacked:** §2 explicit non-goals ("UI behaviour of the Work surface is preserved, not redesigned"); §5 "New UX: essentially none — deliberately"; §12 slice 2F.2 acceptance; §6 line 126.

Routing surface transitions through `apply_task_command` imports its reminder reconciliation — the function's own COMMENT describes it as "reconciling reminders by close-and-insert" ([202607260059:3051](supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql#L3051)), and `apply.ts` returns `remindersCancelled` / `reminderCreatedId` for exactly that reason.

Today `persistTaskStatus` ([operations/actions.ts:148-153](src/features/operations/actions.ts#L148-L153)) cancels nothing, and the heartbeat fires on reminder state alone with **no task join whatsoever** ([202607170016:508-512](supabase/migrations/202607170016_foundation_hardening.sql#L508-L512)):

```
where reminder.user_id = p_user_id
  and reminder.status = 'scheduled'
  and reminder.remind_at <= now()
```

So after 2F.2, clicking "complete" on the Work surface stops notifications that fire today. That is a user-visible behaviour change, and a *desirable* one — but §5 enumerates three visible changes and this is not among them, and §12's 2F.2 acceptance criteria never mention reminder consequences. **Missing acceptance criterion:** 2F.2 must assert what happens to a `scheduled` reminder when a Work-surface button completes its task, in both directions (cancelled; and not cancelled for the non-terminal transitions).

**Second contradiction, same requirements.** `applyWorkItemAction`'s vocabulary is `complete_task | wait_task | resume_task | reopen_task` ([operations/actions.ts:129](src/features/operations/actions.ts#L129)). The taxonomy's vocabulary is `complete_task, reopen_task, set_status, cancel_task, restore_task, rename_task, append_note, reschedule_due, clear_due, set_planned, set_priority, assign_project, assign_context, assign_person, set_waiting_on` ([taxonomy.ts:44-60](src/features/task-commands/taxonomy.ts#L44-L60)). `wait_task` and `resume_task` are **not** taxonomy actions; there is also a distinct `set_waiting_on`. The mapping is unspecified, and eligibility is gated on the locked status against the *action's* declared set ([202607260059:1477](supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql#L1477)). §6 line 126's "a button for an ineligible transition is not rendered *and* is refused server-side" therefore implies changing which buttons render — which is the redesign §2 line 76 forbids.

---

### F7 — §12 2F.2's "code-only" understates a rendering-model change

**Requirements attacked:** §5 "New UX: essentially none"; §5 "Error handling"; §12 slice 2F.2 "Deployment impact: code-only if reuse wins"; §13 bullet 7.

[task-list.tsx](src/features/operations/task-list.tsx) is a **server component**: it imports `randomUUID` from `node:crypto` (line 1) and mints the operation key **at render time** inside a plain progressive-enhancement form (lines 102-107):

```
<form action={applyWorkItemAction} key={action.id}>
  …
  <input type="hidden" name="operationKey" value={randomUUID()} />
```

Two consequences the proposal does not price:

1. **Delivering §5's promised error states converts the component to a client component.** Today failures are silently swallowed — `applyWorkItemAction` returns on parse failure ([actions.ts:183](src/features/operations/actions.ts#L183)) and `persistTaskStatus` returns when unauthenticated ([:143](src/features/operations/actions.ts#L143)); the action's return type is `void`. Rendering "declared, localized error states … refusal rendered when the row is stale … with a refresh affordance" requires a state-returning action and `useActionState`, hence `"use client"`, hence moving key minting off `node:crypto` and losing the current no-JS submit path. That is not "code-only, essentially no new UX."

2. **The pre-state witness is snapshotted at render, not at click.** §13 bullet 7 answers the replay objection with "the contract's answer is a refusal with a refresh affordance, which is the designed behaviour for stale state — not a defect." Correct in mechanism, understated in frequency: the staleness gate compares `updated_at` by `is distinct from`, and `tasks_updated_at` fires `before update` on every write ([202607160003:180](supabase/migrations/202607160003_intelligent_capture.sql#L180)). Any page left open across any write to that task — including one from the command console in another tab — produces a refusal. The Work surface's buttons go from always-succeed to sometimes-refuse. That is an availability change, and §12 2F.2's acceptance ("every Work-surface transition audited with a real actor, idempotent, undoable, stale-guarded") does not require measuring how often the stale path is hit.

---

### F8 — §2 item 3 couples a write that has no destination contract

**Requirements attacked:** §2 in-scope item 3; §1 objective ("the *only* way a task changes"); §12 slice 2F.3 objective; §4 "RPC additions: ideally zero"; §14 unknown 5.

`createReminder` ([agent/actions.ts:125-132](src/features/agent/actions.ts#L125-L132)) inserts a **standalone** reminder with **no `task_id`**:

```
.from("reminders").insert({ user_id: user.id, title: …, remind_at: …, important: … })
```

The Phase 2E contract reconciles reminders only as a *consequence of a task mutation*. There is no validated authoring path for a free-standing reminder, and §4 forecloses building one ("RPC additions: ideally zero"). So §2 item 3's "moved behind a validated path" names no destination that exists.

Worse for the phase's coherence: a standalone reminder is **not a task change at all**, so it falls outside §1's thesis ("Make the Phase 2E mutation contract the *only* way a task changes"). Its inclusion is the grab-bag failure mode §0 line 30 uses to exclude the operational-readiness backlog, applied inconsistently.

§14 unknown 5 correctly lists the reminder-authoring decision as *open and owner-facing*. §2 nevertheless lists it in scope and §12's 2F.3 commits to "the reminder-authoring decision executed". **Scope is asserted ahead of the decision that defines it.**

---

### F9 — §4(3)'s reconciliation predicate is unspecified and demonstrably incomplete

**Requirements attacked:** §2 in-scope item 3; §4 expected-migration item (3); §11 risk 4; §12 slice 2F.3 acceptance; §14 unknown 4.

The stated predicate (§4 line 104): "cancelling `scheduled` reminders whose task is terminal or has no due date."

Given F8, a third population exists that the predicate does not name: reminders with **no task at all**, authored directly by the user. A join-based predicate either sweeps them — destroying user-authored reminders, which is precisely §11 risk 4's failure mode ("A one-off correction that cancels a reminder a user wanted") — or is null-safe and excludes them silently. Which is intended is not stated anywhere, and §12's 2F.3 acceptance ("no healthy reminder touched") does not distinguish the three populations, so it cannot detect the error.

§14 unknown 4 concedes the census has not been run ("how many rows the reconciliation would touch — a read, not a migration"). §2 nonetheless places the reconciliation in scope and §12 commits to applying it. **The requirement precedes the evidence that would establish whether the defect exists at all** in a single-user database.

**Evidence that would be needed.** The census, broken out by: (a) task in a terminal status, (b) task with null `due_at`, (c) no task. Run before approval, not inside 2F.3.

**Stop?** For the *migration*, yes. §2 item 3's diagnosis survives (see "What survives"); its remediation does not, until the census exists and the three populations are named.

---

### F10 — 2F.5 specifies no evidentiary standard for the gate whose entire purpose is evidence

**Requirements attacked:** §2 in-scope item 4; §2 in-scope item 5 ("semantic retrieval gated on named evidence thresholds"); §8 "Dashboards"; §12 slice 2F.5 acceptance; §1 business value bullet 4 ("an evidence gate instead of a vibe"); §14 "Biggest unknowns".

§0 line 21 defers §22 on the strength of: "the feature has been live for **hours** with zero real commands typed." The proposal then builds 2F.5 to make that gate real. But:

- 2F.5's acceptance is "reader answers the §18-style questions from real rows" — satisfiable with **one row from one user**.
- No minimum sample size, no observation window, no definition of "real usage" appears anywhere in §2, §8, §12 or §14.
- §14's "Biggest unknowns (all resolvable before code)" lists five items; "what the thresholds are" is not among them, though §2 item 5 makes the thresholds a deliverable.

A gate with no sample-size requirement, fed by a single-user database that has produced zero commands, is not an evidence gate. It is the same judgement call §1 says it replaces, wearing a number. This is the proposal applying to itself a materially weaker standard than the one it applies to §22 — the specific inconsistency an adversarial review is required to name.

Note the same double standard operates in F2: semantic retrieval is deferred for lack of usage evidence; provenance is retained despite identical lack of usage evidence, justified by process ("already promised") rather than demand.

**Evidence that would be needed.** Before 2F.5 is approved: a stated minimum command volume and observation window under which the thresholds become readable, and a statement of what the gate decides if that volume is never reached.

---

## Moderate findings

### F11 — §4's migration count and query-shape claims are downstream of unresolved F4

§4: "**Expected migrations:** on the order of four to six" and "**Indexes:** none anticipated; no new query shapes are introduced." Both presume reuse wins (F4) and the Work projection suffices (F4). If the projection must carry three relation joins for every rendered Work row, §4's "no new query shapes" is false by its own terms and the index question reopens. These are not independent claims to be checked later; they are conclusions of a premise this review invalidates.

### F12 — §10's "no feature flags needed" is asserted against §11's own risk ranking

§10: "**Feature flags:** none needed. Consolidation swaps the implementation behind unchanged UI; the 'flag' is the PR boundary." §6: old paths "are removed only in the same PR that proves the new routing green." §11 ranks 2F.2's contract-shape mistake as the **highest** risk in the phase.

If the reminder-cancellation behaviour (F6) or the staleness-refusal frequency (F7) proves wrong in production, the rollback is a revert of a large PR that also deleted the old path — not a switch. For the change the proposal itself ranks first by risk, "none needed" is asserted rather than argued, and §10's rollback plan ("route back (code revert) for 2F.2/2F.3") is the weakest instrument available for the highest-ranked risk.

### F13 — §2 item 2 and §12 2F.2 leave an exported write entry point unnamed

`updateTaskStatus` ([operations/actions.ts:175-179](src/features/operations/actions.ts#L175-L179)) is an exported Server Action with a **wider** vocabulary than the Work surface — eight statuses including `cancelled`, `blocked`, `deferred`, `inbox`, `in_progress` ([:122](src/features/operations/actions.ts#L122)) — and **no UI caller**; the only reference outside the module is `actions.test.ts:75`.

It shares `persistTaskStatus`, so it is covered incidentally by 2F.2's implementation. But §12's 2F.2 acceptance is scoped to "every **Work-surface** transition", which does not cover it, and its `cancelled` branch contradicts §5's "cancellation remains exclusively on the command console's confirmed path" — the console's cancel path requires a server-issued single-use confirmation ([202607260059:3051](supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql#L3051)), and this action requires nothing. Either it is dead and 2F.2 should name it for removal, or it is a live entry point and 2F.2's acceptance criterion is incomplete. The proposal does neither.

---

## What survives adversarial review

Stated explicitly, as required.

**§0's verdict table — the deferrals.** Recurrence, retroactive occurrence placement, review invalidation, multi-target commands, split/merge, and "mobile/localization/accessibility finish is not a phase" all survive. The reasoning is proportionate to the evidence, and the review-generation dependency is verified: `docs/TODO.md:198` confirms M11 ("review generation still injects tasks as fake `memory` chat sources with fabricated similarity, computes period boundaries in server-local time, and prompts only in Portuguese"). Building invalidation semantics on that generator would indeed be inverted priority.

**§0's deferral of semantic retrieval, on its own terms.** The characterization of the existing baseline is exact. `docs/TODO.md:26` records `2E-MATCH-018` as "one-step 0.429, ambiguous 0.214, no-match 0.214, confirmation-required 0.071, over 14 scenarios at policy `2026-07-25.3`" measuring "the **scoring layer against declared SQL verdicts**, not end-to-end matching." Deferring an embedding pipeline against that is correct. (What does not survive is the replacement gate — F10.)

**The write-path diagnosis in §0 and §1.** Verified in full. `persistTaskStatus` ([operations/actions.ts:148-153](src/features/operations/actions.ts#L148-L153)) is a plain `.from("tasks").update(...)` with no undo row, no expected-pre-state comparison, no operation-key reservation and no audit actor; `createRecord`'s task branch ([:68-74](src/features/operations/actions.ts#L68-L74)) is a plain insert; `createReminder` ([agent/actions.ts:125](src/features/agent/actions.ts#L125)) is a plain insert. Two write paths to one table is real, and the characterization as the largest standing contract violation is fair.

**The reminder defect *mechanism* (§0 line 24).** Verified: the heartbeat's firing predicate consults reminder state only, never the task ([202607170016:508-512](supabase/migrations/202607170016_foundation_hardening.sql#L508-L512)), and `create_due_task_reminder` is an insert-only trigger ([202607160007:203-209](supabase/migrations/202607160007_agent_operations.sql#L203-L209)) with no pre-2E cancellation path. Tasks in terminal states can and do hold live `scheduled` reminders. The defect is real; only its scoping and census (F9) are unproven.

**§4's drop-and-recreate SQL mechanics.** "the drop and the recreate must share one transaction so no window exists where the function is absent or ambiguous" is correct, and correctly grounded — ADR-053:586 states the same Postgres fact ("A different argument list is a *different function*, so `create or replace` produces an overload instead of a replacement … `function is not unique`"). F1–F3 attack *why* and *where*, not *how*.

**§2's out-of-scope list and §11 item 5.** The exclusions are disciplined and the text-pinned-test-drift hazard is a genuine, twice-paid, correctly-named recurring cost.

**§7 (AI).** "this phase adds no model call anywhere" is verified — no proposed change touches prompts, schemas, or `TASK_MATCH_POLICY_VERSION`.

**§9's organizing lesson.** "a verifier that has never run is a claim, not a gate" is the correct standard, and the mirror-test requirement (`.mjs` contract-readers held to imported constants by exact equality) is the right instrument. It is also the standard by which F3 and F5 fail — the proposal states the rule and then exempts its two riskiest steps from it.

**§0's bookkeeping point.** Verified stale: `docs/TODO.md:28` still reads "Complete Phase 2F retroactive history, mobile/localization/accessibility finish, full gates, and closeout." One ADR and two line edits is the correct remedy.

**2F.4's revocation mechanism (as distinct from its fixtures).** Precedented and low-risk: [202607170016:196-244](supabase/migrations/202607170016_foundation_hardening.sql#L196-L244) already revokes `insert, update, delete` from `authenticated` on eight tables, with `anon` revoked wholesale in the earlier chain. `tasks` and `reminders` are absent from that list, exactly as §0 line 23 claims. The migration shape is known-good; F5 is about what the revocation breaks, not about the revocation.

---

## Summary of stop conditions

| Finding | Requirements | Stop implementation until |
|---|---|---|
| F1 | §2.1, §3, §4(1), §12 2F.1, §1 | A join path from operation → parse ledger row is specified, or the columns are relocated |
| F2 | §0 table, §2.1, §12 2F.1, §13.2 | The placement is re-argued without ADR-053's now-void amortization premise |
| F3 | §11 risk 3 | An executed dry run of the drop-and-recreate with all six pins moved and the worker exercised |
| F4 | §3, §4, §12 2F.2, §13.1, §14.1 | The nineteen-key pre-state and `p_observed_before` sourcing are demonstrated from a real Work row, or "reuse" is withdrawn as the default |
| F5 | §12 2F.4, §9, §11 risk 2 & 7 | The §14(2) writer sweep is executed and published, and cross-tenant RLS provability post-revocation is settled |
| F9 | §2.3, §4(3), §12 2F.3 | The orphaned-reminder census is run, broken out by the three populations |
| F10 | §2.4, §2.5, §12 2F.5 | A minimum sample size and observation window are stated for the gate |

F6, F7, F8, F11, F12 and F13 do not independently block, but each identifies an acceptance criterion that is absent and must exist before the corresponding slice can be counted as delivered.

---

## One closing observation

The proposal is at its strongest where it diagnoses and at its weakest where it recommends. Its §13 self-review anticipated eight attacks and conceded two; of the five blocking findings above, §13 anticipated exactly one (F4, as "partly conceded") and then mis-stated its magnitude by seven fields and three joins, filed it as an unknown resolvable later, and shipped a "Recommended default" that the same evidence excludes. That pattern — an unknown named, downgraded, and then recommended around — is the one the phase's own §9 lesson exists to prevent.
