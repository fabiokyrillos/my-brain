# Phase 2F — pre-code gate package report

Baseline: `docs/initiatives/phase-2f/PHASE_2F_PROPOSAL.md` Revision 2, accepted as design baseline; implementation not authorized.
Executed 2026-07-28/29 against repository truth at `b54b833` and the linked project `ulvwzqlpsjyrnqzfxmck` (remote parity `202607280061`).
No Phase 2F slice was implemented. No production migration was written. No application behaviour was changed.

---

## 1. Executive verdict

Four of five gates executed. Three passed outright, one returned a **decisive negative that removes scope from the phase**, and one could not be executed for an environmental reason that is an owner decision rather than a technical failure.

| Gate | Status | One-line result |
|---|---|---|
| 1 — `record_ai_usage` hosted dry run | **NOT EXECUTED — blocked** | No disposable hosted project exists; the only linked project is production. Complete self-verifying artifact committed and one command from running. |
| 2 — writer inventory | **EXECUTED — passed** | 8 client writers (7 as `authenticated`), 14 in-database writers, 6 triggers, 30 pgTAP statements of which **11 run under `set local role authenticated`**. Blast radius is ~3× what the adversarial review named. |
| 3 — exact-title reuse proof | **EXECUTED — passed, 23/23 + 10/10** | The Revision 2 mechanism works against the deployed RPC for all four Work actions. Two claims corrected along the way — one of mine, one of Revision 2's. |
| 4 — reminder census | **EXECUTED — passed, and decisive** | **Every defect bucket is zero.** There is nothing to reconcile. The reconciliation should leave Phase 2F. |
| 5 — F6–F13 amendment specification | **DELIVERED** | Eight amendment specs; F10 carries a concrete threshold with a costed lower-cost alternative. |

**Net effect on the phase: it gets smaller.** Gate 4 removes a data migration, Gate 1's block removes provenance until an owner decision, and Gate 3 confirms the core consolidation needs no new SQL at all. What remains is the part the proposal always argued was the point.

**Final verdict: `PROVENANCE_DROPPED_BUT_CORE_READY`** (see §9).

---

## 2. Gate-by-gate evidence

### Gate 1 — `record_ai_usage` hosted dry run — NOT EXECUTED

**Why not.** The gate requires a *disposable hosted* Supabase project. The environment has exactly one project — `ulvwzqlpsjyrnqzfxmck`, the linked production project holding real user data and the deployed Phase 2E chain. Executing a `drop function public.record_ai_usage(...)` there is a production migration against the function every AI path in the product depends on, which this task forbids twice over ("Do not write production migrations", "Do not modify application behavior"). Provisioning a *new* hosted project is a billable, outward-facing action on the owner's Supabase organisation and is not mine to take.

Preconditions verified rather than assumed:

- Supabase CLI 2.106.0 is authenticated (credentials resolve through the OS keyring, not a token file — `scripts/linked-supabase.mjs` returns both keys successfully).
- `SUPABASE_ACCESS_TOKEN` unset, no `~/.supabase/access-token`; `.env.local` carries only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY` — no `SUPABASE_SERVICE_ROLE_KEY`.
- `docker` is not installed, so there is no local Supabase stack and no local pgTAP either. This is why no gate in this package was answerable by `supabase db reset`.

**What was produced instead.** `scripts/phase-2f-gate1-record-ai-usage-dry-run.sql` — a self-verifying script covering every element the gate names, which **refuses to run** unless the target database is explicitly marked disposable:

```sql
if coalesce(current_setting('phase_2f.disposable', true), '') <> 'yes' then
  raise exception 'REFUSED: this database is not marked disposable. ...';
```

It proves, in one transaction that ends in `rollback`: the drop-and-recreate pair; the two trailing defaulted provenance arguments (`pronargdefaults = 10`); `'task_command'` added to the `source_type` allowlist **in both the table CHECK and the function-body guard**; exactly one overload surviving (the `42725` ambiguity ADR-053:586 warns about); `SECURITY DEFINER` preserved; grants re-issued to `authenticated, service_role` and *not* widened to `anon`/`PUBLIC`; a legacy ten-argument **named** call; a legacy ten-argument **positional** call; a twelve-argument call persisting both provenance columns; and the join the requirement is actually about —

```sql
join public.undo_operations undo
  on undo.user_id = ledger.user_id
 and undo.operation_key = 'taskcmd-v1:' || ledger.source_id::text
```

— with no timestamp anywhere in the predicate.

Two steps of the gate are **not** SQL-provable and are documented as shell steps in §3: PostgREST schema-cache convergence, and one real Deno worker ledger call after the recreate.

**Must provenance leave Phase 2F?** Under Revision 2's own drop-out condition (§0 verdict table, §12 2F.1): **yes, for now.** Not because the change was shown to be unsafe — nothing was shown either way — but because the phase committed to the standard that an unexecuted gate is a claim. Provenance re-enters the moment the dry run runs and passes; that is a single command, not a redesign. The rest of the phase does not depend on it.

### Gate 2 — complete writer inventory — EXECUTED, PASSED

Command: `node scripts/phase-2f-writer-inventory.mjs`. Reads the repository only; no credentials, no network.

**Client-role writers (8).** These are what a table-grant revocation can break.

| File | Symbol | Table | Op | Role |
|---|---|---|---|---|
| `src/features/operations/actions.ts:68` | `createRecord` | tasks | insert | authenticated |
| `src/features/operations/actions.ts:148` | `persistTaskStatus` | tasks | update | authenticated |
| `src/features/agent/actions.ts:125` | `createReminder` | reminders | insert | authenticated |
| `scripts/remote-phase-2e-smoke.mjs:144` | seed | tasks | insert | authenticated |
| `scripts/remote-supabase-smoke.mjs:258` | fixture | tasks | insert | authenticated |
| `scripts/remote-supabase-smoke.mjs:286` | fixture | reminders | insert | authenticated |
| `scripts/remote-editable-candidate-confirmation-smoke.mjs:797` | cross-owner RLS proof | tasks | insert | authenticated |
| `scripts/remote-product-events-smoke.mjs:165` | fixture | tasks | insert | **service_role** — unaffected |

`updateTaskStatus` (`operations/actions.ts:175`) is **not** a distinct writer: it delegates to `persistTaskStatus`. It is nevertheless an exported Server Action with a wider status vocabulary and no UI caller — F13's disposition, now backed by an executable assertion (Gate 3 static, test 10).

**In-database writers (14, last declaration only)** and **triggers (6)**: full tables in the command's output. Three findings that were not in the adversarial review:

1. **`public.create_due_task_reminder` is explicitly `security invoker`** (`202607160007:195-199`) and inserts into `reminders` from a trigger on `tasks` insert. **This creates a revocation *ordering* hazard 2F.4 must respect:** revoking `insert` on `reminders` before `insert` on `tasks` would break `createRecord` — not at the task insert, but inside the trigger, surfacing as a failure on a table the caller never named. The two revocations must land together, or tasks-first.
2. **`private.undo_apply_task_command_fields` and `private.undo_confirm_entry_tasks` are also invoker** (no `security definer`). They are safe because they are only ever reached from the definer `undo_operation` router and inherit its context — but they are not independently callable, which is worth stating before someone tries.
3. Every other writer is `SECURITY DEFINER` and therefore **unaffected** by revoking table grants from `authenticated`. That is the structural reason 2F.4 is survivable at all.

**pgTAP blast radius — larger than reported.** 30 statements touch the two tables; **11 execute under `set local role authenticated`** and write directly:

- `supabase/tests/phase_2e_task_command_apply.sql` — lines 580, 598, 643, 1385, 2436 (`tasks`), 2587 (`reminders`)
- `supabase/tests/phase_2e_task_command_creation.sql` — lines 1075 (`tasks`), 1115, 1135, 1158, 1179 (`reminders`)

The adversarial review (F5) named three remote smokes. The true count is **7 client writers + 11 pgTAP statements**, and the pgTAP half runs in CI's `database` job, so revocation breaks CI as well as the remote suite. These 11 statements are mostly *deliberate* — they simulate a concurrent client mutation to trigger the staleness gate — which means they cannot simply be re-seeded through `service_role` without changing what they test. **This is new work 2F.4 must own and Revision 2 did not price.**

### Gate 3 — exact-title reuse proof — EXECUTED, PASSED

Two halves, both green.

**Static half** — `npx vitest run src/features/task-commands/work-surface-reuse.test.ts` → **10/10 passed**. Reads the migration and the projection rather than restating them (ADR-052 mirror-test pattern). Proves the 19-key contract, the exact ten-key shortfall of the Work *task select*, the Work-action → taxonomy mapping, that `reopen_task` is eligible only from `completed`, and that the surface's status vocabulary contains `cancelled` while `set_status` does not.

**Behavioural half** — `node scripts/phase-2f-gate3-exact-title-reuse.mjs` → **23/23 properties held**, against the deployed `list_task_command_candidates`, using two disposable users deleted in a `finally`.

| Property | Result |
|---|---|
| `complete_task` → `complete_task`, target within `p_limit` | ok — tier 0 of 3 rows |
| `wait_task` → `set_status`, target within `p_limit` | ok — tier 0 of 3 rows |
| `resume_task` → `set_status`, target within `p_limit` | ok — tier 0 of 3 rows |
| `reopen_task` → `reopen_task`, target within `p_limit` | ok — tier 0 of 1 row |
| All nineteen pre-state keys present, per action | ok ×4 |
| `observed_before` database-derived, per action | ok ×4 (e.g. `2026-07-29T02:44:23.771334+00:00`) |
| Another owner's identically titled task never returned | ok |
| Every returned row carries one `owner_id` | ok |
| Both eligible duplicate-title rows returned, distinguishable by `task_id` | ok — 2 of 2 |
| Ineligible duplicate excluded by status filter | ok |
| Normalization variant (case, accents, whitespace) reaches the row | ok |
| Relation-bearing task returns relation arrays | ok |
| `person_ids` non-empty **and** length-matched to `person_roles` | ok — 1 id vs 1 role |
| Relation ordering stable across identical calls | ok |
| Title drift: row still resolves by `task_id` after rename | ok — tier 2 |
| Title drift is **not** self-refusing | ok |
| >25 eligible owner tasks, so `p_limit` genuinely exercised | ok — 37 seeded, 26 returned |

**Verdict: reuse is proven. 2F.2 needs no new RPC, no migration, and no change to `list_task_command_candidates`.**

Three things this gate caught that no amount of reading would have:

1. **The RPC is `auth.uid()`-scoped.** The first run called it as `service_role` and every query returned zero rows — while *five checks passed*, because "no cross-owner row" and "ineligible duplicate excluded" are trivially true of an empty result. That is precisely the repository's recorded failure mode (an assertion green while testing nothing), reproduced and then fixed by signing in as the disposable owner. The volume property now asserts a positive row count for exactly this reason.
2. **A vacuous green, caught and fixed.** `person_ids`/`person_roles` were length-matched at `0 vs 0` because the seed used `role: "responsible"`, which violates `task_people_role_check` (allowed: `requester`, `involved`, `assignee`, `waiting_on` — `202607160009:30`). The unchecked insert error hid it. The assertion now requires non-empty.
3. **Revision 2 §3 is wrong about title drift.** It claims "if the task's title changed since render, the exact-title query returns nothing and the click refuses with the refresh affordance." Measured: the row **still resolves**, at prefilter tier 2, through token overlap between the stale query and the new title. Harmless to the mechanism — the surface selects by `task_id` — but the promised refusal does not happen, so **2F.2 owns a title-drift policy decision it was told it had inherited**. See F6 in §8.

**A correction to my own adversarial review.** F4 asserted that the Work projection "performs no relation joins at all". That is false: `work-projection.ts:197-199` fetches `task_projects`, `task_contexts`, `task_people`, and `:220-226` resolves their names. The ten-key shortfall is a property of the **task select** (`:120`), not of the pipeline. The finding survives on a different and stronger footing: those are four independent round trips at four independent instants, and `apply_task_command` hashes a *single* `p_observed_before` alongside the pre-state it describes — so a witness assembled from five separate client reads has no honest instant to declare, whatever its column count. `personRoles` also has no carrier in the DTO (`RelationSummary` is `{id, label}`, `contracts.ts:202-205`). Both facts are now assertions in the static test rather than prose.

### Gate 4 — reminder census — EXECUTED, DECISIVE

Command: `node scripts/phase-2f-reminder-census.mjs`. Read-only, service-role, against the linked project. **No writes issued.**

Rows read: **1 reminder, 4 tasks.**

| Bucket | Count |
|---|---|
| 1. live reminder on a terminal task | **0** |
| 2. live task-bound reminder on a non-terminal task with null `due_at` | **0** |
| 3. `reminder.user_id` differs from its task's `user_id` | **0** |
| 4. `task_id` references a nonexistent task | **0** |
| 5. snoozed rows | **0** |
| 6. independent reminders (`task_id is null`) | **0** |
| 7. live independent reminders | **0** |
| 8. total reminders | **1** |
| 9. total live reminders | **0** |

Supplementary: status distribution `{"sent": 1}`; 0 independent reminders carrying an `entry_id`; 0 live reminders past `remind_at`; 1 distinct owner.

Buckets 3 and 4 are **structurally impossible**, not merely empty — `reminders.task_id` carries `on delete cascade` (`202607160007:36`) and `202607170016:66-68` adds the composite `(user_id, task_id) references public.tasks (user_id, id)`. They were measured anyway, because "the constraint says this cannot happen" and "this did not happen" are different claims and this repository has already paid for confusing them.

**Consequence, and it is a scope reduction.** The defect class is real *in mechanism* — `run_user_heartbeat` fires on `reminder.status = 'scheduled'` and consults the task not at all (`202607170016:508-512`) — but its population is **empty**. Writing an audited, idempotent data-correction migration to fix zero rows is the "requirement stronger than the evidence" pattern this whole review sequence exists to catch. **Recommendation: drop the reconciliation from Phase 2F.** Keep the forward guarantee Phase 2E already ships, keep the census script, and re-run it if the population ever becomes non-zero. This also collapses most of F9.

### Gate 5 — F6–F13 amendment specification — DELIVERED

See §8. The F10 evidence standard is specified with its trade-off reasoning and a costed lower-cost alternative.

---

## 3. Reproducible commands

```bash
# Gate 2 — writer inventory (no credentials, no network)
node scripts/phase-2f-writer-inventory.mjs

# Gate 3 — static half
npx vitest run src/features/task-commands/work-surface-reuse.test.ts

# Gate 3 — behavioural half (linked project; disposable users, fail-closed cleanup)
node scripts/phase-2f-gate3-exact-title-reuse.mjs

# Gate 4 — reminder census (linked project; READ-ONLY)
node scripts/phase-2f-reminder-census.mjs

# Gate 1 — NOT YET RUN. Requires a disposable hosted project.
#   1. provision it, then against that project only:
#        alter database postgres set "phase_2f.disposable" = 'yes';
#   2. psql "$DISPOSABLE_DB_URL" -f scripts/phase-2f-gate1-record-ai-usage-dry-run.sql
#   3. shell steps the SQL cannot prove:
#        # PostgREST schema-cache convergence
#        curl -s -X POST "$DISPOSABLE_URL/rest/v1/rpc/record_ai_usage" \
#          -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
#          -d '{"p_operation":"chat","p_model":"gpt-test"}'      # expect 200, not PGRST202/205
#        # one real Deno worker ledger call after the recreate
#        supabase functions invoke process-jobs --project-ref "$DISPOSABLE_REF"
#   4. capture the transcript to docs/reports/PHASE_2F_GATE1_DRY_RUN_TRANSCRIPT.md
```

---

## 4. Artifacts and tests created

| Path | Kind | Runs where |
|---|---|---|
| `scripts/phase-2f-writer-inventory.mjs` | Validation artifact | Offline |
| `scripts/phase-2f-reminder-census.mjs` | Validation artifact, read-only | Linked project |
| `scripts/phase-2f-gate3-exact-title-reuse.mjs` | Disposable-fixture probe, fail-closed cleanup | Linked project |
| `scripts/phase-2f-gate1-record-ai-usage-dry-run.sql` | Dry-run support, **unrun**, refuses non-disposable databases | Disposable project only |
| `src/features/task-commands/work-surface-reuse.test.ts` | Focused Vitest, 10 cases | CI |
| `docs/reports/phase-2f/PHASE_2F_PRE_CODE_GATE_REPORT.md` | This report | — |

---

## 5. Repository changes

Six files added, none modified. No production code, no migration, no schema, no behaviour.

`npm run typecheck` clean; `npx eslint` clean on all five new files. The new Vitest file is additive and does not alter any existing suite. The dry-run SQL is deliberately **not** in `supabase/migrations/` and is not numbered, so no migration runner will ever pick it up.

---

## 6. Failures and unresolved questions

**Executed and failed: none.** Every property that failed during development was a defect in my own instrumentation, each fixed and each recorded above rather than quietly corrected — the service-role zero-row false pass, the `0 vs 0` vacuous green, the wrong `.select()` regex, the invalid `role` literal.

**Unresolved:**

1. **Gate 1 has not run.** Environmental, not technical. §7 decision 1.
2. **The 11 pgTAP `set local role authenticated` writes.** Most exist to simulate a concurrent client mutation and trigger the staleness gate; re-seeding them through `service_role` may change what they prove. Each needs an individual disposition before 2F.4. Not resolvable without deciding 2F.4's RLS evidence trade first.
3. **Title-drift policy** (Gate 3 discovery). Permissive (match by `task_id`, ignore drift) or strict (compare titles, refuse)? A product decision, not a technical one.
4. **`p_limit` returned 26 rows for a null-title query with the default limit of 25.** Harmless for the gate — the target was found at tier 0 in every case — but the clamping semantics of `effective_limit` are not what a reader would assume, and 2F.2 should not build a "did we see everything?" claim on `p_limit` without pinning this down.
5. **Whether `create_task_command`'s creation path needs the same treatment as `apply_task_command`.** Gate 3 proved the *mutation* pre-state path. `createRecord`'s task branch (2F.3) goes through the creation family, which takes no pre-state — so the gate does not cover it, and 2F.3 needs its own smaller proof.

---

## 7. Owner decisions required

**Decision 1 — provision a disposable hosted project for Gate 1?** Cost: one Supabase project on your organisation for roughly an hour; free-tier eligible; deleted immediately after. Choosing *no* is entirely reasonable given the change buys attribution nobody has yet needed — and Revision 2 already wrote the drop-out condition for exactly this. Choosing *yes* costs one command and reinstates provenance in 2F.1.

**Decision 2 — confirm the reconciliation leaves Phase 2F.** Gate 4 measured zero rows in every bucket. The recommendation is to drop the reconciliation migration and keep the census script as the re-check. This is a *reduction*; saying nothing means it stays in, which is the outcome the evidence does not support.

**Decision 3 — reminder authoring (unchanged, still open).** `createReminder` writes a task-less reminder (`agent/actions.ts:125-132`) for which no validated destination contract exists. With Gate 4 showing zero independent reminders in existence, option (C) "retain current behaviour as a scoped exception" is now the cheapest defensible answer. See F8 in §8.

**Decision 4 — title-drift policy for 2F.2.** Permissive or strict, per Gate 3's discovery.

---

## 8. F6–F13 amendment matrix

Amendment specifications only. The PRD is not rewritten here.

| Finding | Amendment specification |
|---|---|
| **F6** — reminder behaviour change and Work-action taxonomy mapping | Add to §5 a fourth visible change: **routing a Work-surface completion through the contract cancels that task's scheduled reminders** (`apply_task_command` reconciles by close-and-insert; `persistTaskStatus` cancels nothing today). Add to §12 2F.2's acceptance an assertion in both directions — reminders cancelled on terminal transitions, untouched on non-terminal ones. Adopt the mapping proven in Gate 3 and pin it in the PRD: `complete_task`→`complete_task`, `wait_task`→`set_status{status:waiting}`, `resume_task`→`set_status{status:todo}`, `reopen_task`→`reopen_task`. State that `reopen_task` is eligible only from `completed`, so button rendering **does** change — and amend §2's "UI behaviour is preserved" to "UI *layout* is preserved; button availability follows the taxonomy". Add the title-drift policy decision (Gate 3) as a named sub-decision of 2F.2. |
| **F7** — Server/Client Component and operation-key implications | Amend §12 2F.2's "Deployment impact: code-only" to "code-only, **including a Server→Client Component conversion of `task-list.tsx`**". Specify: delivering §5's declared error states requires a state-returning action and `useActionState`, hence `"use client"`; `randomUUID` from `node:crypto` (line 1) cannot survive that and the operation key must be minted in the action rather than at render; the current no-JS progressive-enhancement submit path is lost and that must be an accepted, recorded trade. Add an acceptance criterion that the four buttons remain keyboard-operable and announce their outcome. Note that Gate 3's click-time pre-state read already removes the render-time staleness concern, so this is now purely about error rendering. |
| **F8** — destination contract for independent reminder authoring | Specify that §2 item 3 currently names no destination: `apply_task_command` reconciles reminders only as a consequence of a task mutation and cannot author a task-less one, while §4 forecloses adding an RPC. Amend §2 to present three options explicitly and require one to be chosen before 2F.3 is planned: **(A)** reminders always belong to tasks — migrate `createReminder` to create a task plus its reminder, which changes the product's model and is the largest option; **(B)** both kinds exist — build a validated `create_reminder` RPC, which contradicts "RPC additions: zero"; **(C)** scoped exception — leave `createReminder` a direct insert, record the exception in `SECURITY.md`, and **do not revoke `authenticated` insert on `reminders` in 2F.4**. Gate 4's zero independent reminders makes (C) cheapest and (A) unjustified. Whichever is chosen, 2F.4's revocation scope follows from it, so this decision **gates 2F.4**, not just 2F.3. |
| **F9** — reconciliation populations and stop-gate | Largely discharged by Gate 4. Amend §2 item 3 and §4 migration (2) to **remove** the reconciliation from Phase 2F on measured grounds, and replace the stop-gate with a standing one: `scripts/phase-2f-reminder-census.mjs` is re-run at 2F.6 closeout, and a non-zero bucket 1, 2 or 7 at that point reopens the question in the next phase. If the reconciliation is ever written, the predicate must be `task_id is not null and ...` — Gate 4 shows the naive-join failure mode would currently sweep zero rows, which is luck, not safety. |
| **F10** — evidence standard for semantic-retrieval planning | See the dedicated specification below. |
| **F11** — estimates downstream of the final 2F.2 mechanism | Gate 3 settles the mechanism, so the estimates resolve rather than needing hedging. Amend §4: expected migrations **three to five → one to three** (provenance if Decision 1 says yes; grant revocations; nothing else), "RPC additions: zero" now *proven* rather than asserted, "no new query shapes" now *proven* (the click path calls an existing indexed function). Amend §12 2F.2 complexity from "Large" to "Medium-large": the SQL risk is gone, the Component conversion (F7) remains. |
| **F12** — rollback or feature-flag decision for 2F.2 | §10's "no feature flags needed" is now better supported — with no migration in 2F.2, a code revert genuinely does restore prior behaviour. Amend §10 to say so *and* to record the one residual: the reminder-cancellation change (F6) is a **data** effect a code revert does not undo, since reminders cancelled while the new path was live stay cancelled. Add an acceptance criterion that this is stated in the slice report, and require 2F.2 to ship behind a single-commit revert boundary (no unrelated changes in the PR) so the revert is mechanical. |
| **F13** — disposition of `updateTaskStatus` | Gate 2 confirms it is not an independent writer (it delegates to `persistTaskStatus`) and Gate 3's static test confirms it accepts `cancelled` while `set_status` does not. Amend §12 2F.2 to require an explicit disposition: **remove it** (recommended — it has no UI caller, only `actions.test.ts:75`), or keep it and route its `cancelled` branch through the confirmed destructive path. Add an acceptance criterion that after 2F.2 no exported Server Action can reach a destructive transition without confirmation. |

### F10 — the semantic-retrieval evidence standard, specified

The gate exists to answer one question: *is lexical matching failing in a way embeddings would fix?* Everything below follows from that and from the fact that the product currently has one user.

**Qualifying command.** A command that produced a model-parsed proposal for a real user. Explicitly excluded: refusals for unsupported features (multi-target, recurrence — semantic retrieval fixes none of them, so counting them inflates the very rate that authorizes it); commands from users whose id was created by a smoke or whose email matches the disposable fixture pattern; any command against a task created by a fixture. Test rows are excluded **by construction**, by filtering on user provenance rather than by heuristics on content.

**Recommended threshold — authorizes planning a semantic-retrieval phase.**

| Parameter | Value | Why this value |
|---|---|---|
| Minimum qualifying commands | **150** | To distinguish a no-match rate of ≥20% from ≤5% with reasonable confidence you need order-100 trials; below that a run of three unlucky commands moves the rate by 6 points. 150 buys margin without being unreachable. |
| Minimum distinct active days | **20** | A day with ≥1 qualifying command. Guards against 150 commands produced in two enthusiastic sessions, which measures a mood, not a workflow. |
| Minimum observation window | **30 days** | Long enough for the task corpus to grow and age; retrieval quality against 40 tasks says little about retrieval against 400. |
| Minimum distinct users | **2** | With n=1 the measurement is of one person's naming habits. At n=1 the gate may authorize a **time-boxed spike only**, never a phase. |

**Authorizing metrics** — either alone suffices: `no_match` refusal rate **≥ 20%** of qualifying commands; or no-match-to-creation rate **≥ 15%** (user typed a command, matcher found nothing, user created a task that a human would call a duplicate).

**Explicitly non-authorizing** — these must never be cited as evidence for embeddings: **one-step rate** (low values have many causes — destructive actions requiring confirmation, ambiguous phrasing — most unrelated to retrieval); **total command volume / proposal rate** (measures adoption); **ambiguity rate alone** (semantic retrieval plausibly makes ambiguity *worse* by returning more near-matches, so a high value is not evidence for it); **latency**; **unsupported-feature refusals**.

**If the threshold is never reached.** The gate expires rather than waiting forever. At **90 days** with no threshold met, record an ADR that semantic retrieval is **not planned**, remove it from the roadmap, and let a future demand signal reopen it. A permanently pending gate is the same as no gate.

**Lower-cost alternative — recommended as the first step.** Thresholds of **50 qualifying commands / 10 active days / 14 days**, authorizing not a phase but a **time-boxed offline replay spike** (≤3 days): take the recorded command corpus, build an embedding index over the task titles *offline*, and measure whether semantic retrieval would have changed the outcome of the commands that actually failed to match. Cost: no production infrastructure, no new job type, no backfill, no `source_type` widening, no index tuning — a script and an API key. It also answers a strictly better question than the full threshold does: not "is lexical matching struggling?" but "would embeddings have helped *these* commands?" If the replay shows no improvement, the expensive gate never needs to fire at all.

---

## 9. Final readiness verdict

## `PROVENANCE_DROPPED_BUT_CORE_READY`

**Ready now.** The core of Phase 2F — surface mutation convergence (2F.2), creation convergence (2F.3), grant revocation (2F.4), measured matching (2F.5), closeout (2F.6) — is ready for PRD revision. Gate 3 proved the central mechanism against the deployed contract with no new SQL. Gate 2 measured the revocation blast radius and found it larger than reported but bounded and enumerated. Gate 4 removed a data migration on measured grounds.

**Dropped, reversibly.** `2E-COMMAND-012` provenance leaves Phase 2F because Gate 1 has not executed, and Revision 2 bound itself to the standard that an unexecuted gate is a claim. This is not a judgement that the change is unsafe — it is a refusal to assert either way. Owner decision 1 reinstates it at the cost of one disposable project and one command.

**Not ready, and must be resolved before the PRD is written rather than during it:**

- The reminder-authoring decision (F8, owner decision 3) **gates 2F.4's revocation scope**, not merely 2F.3. Revision 2 sequenced it as a 2F.3 concern; Gate 2 shows the `reminders` revocation cannot be scoped until it is answered.
- The 11 pgTAP `set local role authenticated` writes need individual dispositions. Several exist to *simulate a concurrent client mutation*, so they cannot be mechanically re-seeded through `service_role` without weakening what they prove.
- The title-drift policy (owner decision 4).

**Implementation remains unauthorized.** No slice may begin, no migration may be written, and the proposal remains unapproved. The next step is a PRD revision written against this evidence — not code.
