# Phase 2F PRD — One Write Path: Task-Domain Write Convergence and Measured Matching

**Revision 4.3 (2026-07-30). Status: approved; the phase is in closeout — Slices 2F.1–2F.5 merged, Slice 2F.6 on branch with its PR open.** Revision 4 is the governing document. **4.1** is a single narrowly-scoped correction to 2F-CREATE-002 (§6.5a). **4.2 corrects three factual errors** found by Slice 2F.4's mandatory pre-code inventory and authorized by the owner (decisions A1–A3): §12's privilege-provenance paragraph was wrong, §9's normative table was two rows short, and five `creation.sql` line anchors had drifted. **4.3 corrects three §10 gate-ledger cells** found by Slice 2F.6's whole-phase convergence sweep — including one that claimed an executed gate that never ran (§10, §14). **None of the three revisions** adds an epic, a slice, a requirement ID, a feature surface or any architecture. See §6.5a, §9, §10, §12 and §14.

Normative evidence base: `docs/reports/phase-2f/PHASE_2F_PRE_CODE_GATE_REPORT.md` (executed gate package, verdict `PROVENANCE_DROPPED_BUT_CORE_READY`), `docs/reports/phase-2f/PHASE_2F_PRD_REV3_FINAL_REVIEW.md` (all findings resolved in this revision — see §14), `docs/PHASE_2F_PROPOSAL.md` Revision 2, and the five final owner decisions: (1) provenance out of the phase, (2) reminder reconciliation out of the phase, (3) reminder authoring is the Option C scoped exception, (4) title drift is permissive, (5) **manual task creation persists `created_by = 'user'`, audit actor `'user'`, and fully functional undo — the creation-contract and undo-handler change this requires belongs to Phase 2F** (resolves review blocker B1). Where this document and any earlier Phase 2F document disagree, this document governs; where this document and executed evidence disagree, the evidence governs and the document is defective.

**No requirement in this PRD is satisfied by an unexecuted verifier.** A gate that has never run against the real contract is a claim, not a check (`PHASE_2E_SLICE_08_REPORT.md` §4.2; `STATE.md` release notes). Every acceptance gate below names where it executes.

---

## 1. Problem statement

Phase 2E built, deployed and validated a task-mutation contract — owner-scoped, expected-pre-state gated, operation-key idempotent, fingerprint replay-safe, audited with a real actor, undoable through a fail-closed registry — and left the pre-existing write path beside it:

- `persistTaskStatus` (`src/features/operations/actions.ts:148`) is a plain client UPDATE: no undo row, no staleness guard, no operation history.
- `createRecord`'s task branch (`:68`) is a plain client INSERT.
- `updateTaskStatus` (`:175`) is an exported Server Action with no UI caller whose status vocabulary includes `cancelled` — a route to a destructive transition with no confirmation contract (Gate 3 static test 10 proves the vocabulary gap against `set_status`).
- `authenticated` holds direct `insert/update/delete` on `public.tasks` and `public.reminders` (2E PRD §16.4's recorded residual risk).

Phase 2F closes this for `public.tasks` completely, and for `public.reminders` to the truthful extent the owner has decided (§2). It additionally ships the measurement instruments and evidence gates that make the semantic-retrieval question (2E PRD §22) decidable on data, and closes the phase with the house discipline: fail-closed traceability, executed gates, reconciled documentation.

**What this phase does not contain, by owner decision on gate evidence:**

- **AI provenance (`2E-COMMAND-012`) — removed.** Gate 1 (the `record_ai_usage` hosted dry run) could not execute: no disposable hosted project exists and the only linked project is production. Under the phase's own standard, the migration does not ship. The completed, self-verifying, refuse-unless-disposable dry-run artifact (`scripts/phase-2f-gate1-record-ai-usage-dry-run.sql`) is **preserved as the reopening gate**: provenance re-enters a future phase only after that script has run and passed on a disposable hosted project, with the transcript captured. The deferral is recorded in `TODO.md` and the decision ADR (2F-DECISION-004); it is not implemented here.
- **Reminder reconciliation — removed.** Gate 4's production census measured **zero rows in every defect bucket** (1 reminder total, status `sent`; buckets 3–4 additionally structurally impossible via the composite FK `202607170016:66-68` and `on delete cascade`). A migration correcting zero rows is scope stronger than evidence. The census script (`scripts/phase-2f-reminder-census.mjs`) is retained as the closeout re-check (§8, 2F.6): a nonzero **bucket 1 or 2** at closeout is a **stop-gate requiring a new owner decision — it does not authorize an automatic migration**. Bucket 7 (live independent reminders) is **reported informationally only**: a nonzero value there is the Option C exception working as intended, not a defect.

## 2. The architectural invariant — narrowed so it is fully truthful

> **`public.tasks` has exactly one validated write path: no application module may directly insert, update, or delete it. Independent reminder creation remains a documented, bounded exception on `public.reminders`.**

**Allowed writers, enumerated exhaustively:**

1. Approved `SECURITY DEFINER` RPCs (the Phase 2E apply/destructive/creation family and the Phase 2C candidate-materialization family) and the registered `private.undo_*` handlers reached through the `undo_operation` router.
2. Privileged workers and scheduled jobs (`service_role` / `pg_cron` contexts: `process-jobs`, the heartbeat's reminder mark-sent updates inside `run_user_heartbeat`).
3. Database triggers firing inside the above contexts (`create_due_task_reminder`, `audit_task_change`, `set_updated_at`, the candidate-resolution trigger).
4. Migrations.
5. Isolated test fixtures: pgTAP staging running as `postgres`, the remote smokes' `service_role` admin clients, and — under item 6's retained INSERT grant — the three pgTAP reminder-INSERT stagings that write **task-bound** rows under `set local role authenticated` (`supabase/tests/phase_2e_task_command_apply.sql:2587`, `phase_2e_task_command_creation.sql:1232`, `:1253` — anchors refreshed in Revision 4.2, owner decision A3; §9 rows 6, 10, 11).
6. **The documented exception (owner decision 3, Option C):** `createReminder` (`src/features/agent/actions.ts:125`) — independent-reminder creation as an `authenticated` direct INSERT on `public.reminders`. Bounded: INSERT only. The sole production caller creates task-less rows — **an observation about the current caller, not a constraint the grant enforces**; the retained grant permits any owner-scoped INSERT shape, which is why item 5's stagings remain legal. Recorded in `SECURITY.md` as a scoped exception with its reopening condition (a future validated authoring contract). No second exception may be added to this list without a PRD revision.

**Prohibitions:** no new shared-nothing mutation contract; no new mutation RPC and no migration for 2F.2 (Gate 3 proved none is needed); no gate counted without execution. The architecture regression gate (2F-GUARD-002) enforces the invariant *as narrowed* — its `tasks` allowlist shrinks to empty by 2F.4 and its `reminders` allowlist contains exactly the item-6 exception, never falsely claiming emptiness.

## 3. Goals

1. Every user-reachable task mutation is validated, audited with its real actor, idempotent, resolution-gated and undoable — via the existing deployed contract, with zero new SQL on the 2F.2 mutation path and exactly one contract change on the 2F.3 creation path (owner decision 5).
2. Direct client DML on `public.tasks` is revoked, proven non-vacuously, and mechanically re-grantable; `public.reminders` write grants are narrowed to exactly what the documented exception requires, if the 2F.4 determination proves the narrowing safe.
3. The test suite's meaning survives the revocation: every affected assertion is individually re-dispositioned to state what invariant it proves in the post-revocation world (§9).
4. Matching quality and command demand become measurable from real usage, behind evidence gates that name what can — and cannot — authorize semantic-retrieval work.
5. The phase closes with executed gates, the census stop-gate, and reconciled permanent documentation.

## 4. Visible behaviour changes (complete list, each owner-approved)

1. **Stale or unresolvable rows refuse instead of overwriting.** A Work action whose click-time resolution cannot prove ownership, eligibility and the full nineteen-key pre-state renders a localized refresh affordance. Blind overwrite is retired.
2. **Title drift is permissive (owner decision 4).** The clicked `task_id` is authoritative; a changed title does not itself cause refusal. The action's result renders the **current** title from resolution, never the stale rendered title.
3. **Work completion now cancels that task's scheduled reminders.** `apply_task_command` reconciles reminders on terminal transitions; `persistTaskStatus` cancels nothing today. This is a real behaviour change and is disclosed as such. Non-terminal transitions (`wait_task`, `resume_task`) leave reminders untouched — asserted in both directions (2F-SURFACE-008).
4. **UI layout is preserved; button availability follows taxonomy eligibility.** `reopen_task` renders only for `completed` tasks; every action renders only where its declared eligible source statuses allow. "UI behaviour preserved" is retired as a claim.
5. **Progressive enhancement without JavaScript is intentionally lost for the four Work buttons** (2F-SURFACE-010's recorded trade): rendering declared error states requires a Client Component with `useActionState`.

## 5. The 2F.2 mechanism (proven by Gate 3: 23/23 behavioural, 10/10 static)

A Work-surface click resolves at click time through the deployed `list_task_command_candidates` — the rendered title as `p_title_query` (`202607260059:2520`, `src/features/task-commands/candidates.ts:242`), the mapped taxonomy action, the caller's own `auth.uid()` scope — and selects the row whose `task_id` equals the clicked id. That row supplies the complete nineteen-key pre-state and a single database-derived `observed_before`; the shared payload builder then calls `apply_task_command`. One honest instant, one witness, no new SQL, no raw-table fallback ever.

**The pinned action mapping (Gate 3-proven, tier 0 for all four):**

| Work action | Taxonomy action | Canonical patch |
|---|---|---|
| `complete_task` | `complete_task` | — |
| `wait_task` | `set_status` | `{status: waiting}` |
| `resume_task` | `set_status` | `{status: todo}` |
| `reopen_task` | `reopen_task` | — |

Resolution outcomes: clicked id present → apply proceeds; clicked id absent (renamed beyond token overlap, status now ineligible, or outside the result window) → localized refresh refusal. `p_limit`/`effective_limit` clamping semantics are pinned by test before 2F.2 relies on them (Gate report §6.4; 2F-PRECOND-002) and no completeness claim is built on `p_limit`.

## 6. Requirement families

Stable IDs `2F-<FAMILY>-<NNN>`. **68 requirements across 12 families.** Numbering is contiguous per family; nothing is reserved for removed scope.

### 6.1 2F-GUARD — guardrails (3)

- **2F-GUARD-001:** The plpgsql grammar-trap guard (unqualifiable `coalesce`/`nullif`/`greatest`/`least` under `search_path = ''`; `case … then` inside an `if` condition) runs in CI before any new Phase 2F function body merges, and its detection is proven by a deliberately-failing fixture.
- **2F-GUARD-002:** An architecture regression gate fails CI on any new application-module direct DML against `public.tasks` or `public.reminders`, with explicit allowlists: `tasks` — the legacy writers, shrinking per slice, **empty at 2F.4**; `reminders` — exactly the §2 item-6 exception, permanently, so the gate never asserts an emptiness that is false.
- **2F-GUARD-003:** The gate inspects real source (call sites), not a restated file list; allowlist edits are visible in review.

### 6.2 2F-DECISION — decisions recorded as ADRs (4)

- **2F-DECISION-001:** ADR: "activity" remains a task created by command; reopening condition named (observed real-usage evidence).
- **2F-DECISION-002:** ADR: the semantic-retrieval evidence standard — both tiers of 2F-MEASURE-003/004 with their exact constituent outcome members (`no_match` = final outcome ∈ {`still_unmatched`, `creation_offered`}, per `src/features/task-commands/outcomes.ts:37-40`), the non-authorizing metrics of 2F-MEASURE-005, the fixture-exclusion mechanism of 2F-MEASURE-002, and the 90-day expiry of 2F-MEASURE-006 — including the ADR's obligation to create the **dated expiry entry in `TODO.md`**, its date computed from the reader's go-live.
- **2F-DECISION-003:** ADR: phase-letter reconciliation — `PHASE_2_PLAN.md` §"Phase 2F" and `TODO.md` line 28 re-pointed at this PRD; the displaced scope named as future work.
- **2F-DECISION-004:** The provenance deferral is recorded (ADR + `TODO.md`): `2E-COMMAND-012` remains undelivered; `scripts/phase-2f-gate1-record-ai-usage-dry-run.sql` is the preserved reopening gate; reopening requires that script executed and passed on a disposable hosted project with a captured transcript. **Not implemented in this phase.**

### 6.3 2F-PRECOND — preconditions and preserved evidence (3)

- **2F-PRECOND-001:** The four gate artifacts (`phase-2f-writer-inventory.mjs`, `phase-2f-reminder-census.mjs`, `phase-2f-gate3-exact-title-reuse.mjs`, `work-surface-reuse.test.ts`) are preserved; the Vitest half runs in CI continuously so the mapping/eligibility/vocabulary proofs cannot silently rot.
- **2F-PRECOND-002:** The `effective_limit` clamping semantics of `list_task_command_candidates` are pinned by an executable test before 2F.2's resolution path merges (Gate report §6.4).
- **2F-PRECOND-003:** Every slice report names the session in which each of its gates executed; an unexecuted gate may not be cited as evidence anywhere in the phase.

### 6.4 2F-SURFACE — Work-surface mutation convergence (14)

- **2F-SURFACE-001:** The four Work actions route through `public.apply_task_command` via the §5 mechanism. No new RPC, no migration, no change to `list_task_command_candidates` (all three proven unnecessary by Gate 3).
- **2F-SURFACE-002:** The §5 action mapping is pinned as data beside the taxonomy — never inline in a component or action — and covered by the preserved static test.
- **2F-SURFACE-003:** Click-time resolution is the only pre-state source. The witness is never assembled from the rendered projection row or from multiple client reads (Gate 3's corrected F4 finding: a multi-read witness has no honest instant).
- **2F-SURFACE-004 (owner decision 4):** The clicked `task_id` is authoritative. Title drift alone never refuses; the row is selected by id wherever it appears in the resolution result; the outcome renders the current title.
- **2F-SURFACE-005:** Apply proceeds **only** after click-time resolution proves ownership, action eligibility, and the full nineteen-key pre-state. A clicked id absent from resolution refuses with the localized refresh affordance. No fallback read of `public.tasks` exists on this path.
- **2F-SURFACE-006:** The operation key is minted **once per mount** into a ref or lazily-initialised state — never in the render body, where every re-render (including `useActionState` pending→settled transitions and StrictMode's development double-render) would re-mint it. It is scoped **per (row, action)**, because a single per-row key shared by two different actions would submit one operation key with two request fingerprints and be refused with `2E_IDEMPOTENCY_MISMATCH` for a legitimate action (the current code already mints per action-form, `task-list.tsx:98-107`). It is **carried into the request at submit time** (`formData.set`), never rendered into markup — a rendered hidden input minted client-side would hydration-mismatch against the SSR value. It **rotates after every terminal outcome**. This follows `quick-capture-form.tsx:33-40`'s ref-with-lazy-guard mint and submit-time injection exactly, and is deliberately stricter than that pattern in one respect: it rotates on every terminal outcome where QuickCaptureForm rotates only on success (`:43`) — which is safe, because a refused apply raises inside `apply_task_command`, aborting the transaction and rolling back the operation-key reservation, so a key is never burned by a refusal and reuse after refusal is also safe.
- **2F-SURFACE-007:** Each apply records audit actor `'user'`, an undo operation, and continues emitting `task_status_changed` with its current allowlisted shape.
- **2F-SURFACE-008:** Reminder consequences are asserted in both directions: terminal transitions cancel the task's scheduled reminders; `wait_task`/`resume_task` leave every reminder untouched.
- **2F-SURFACE-009:** UI layout is preserved; availability follows taxonomy eligibility (`reopen_task` only from `completed`; every button gated by declared eligible statuses). The eligibility-to-rendering derivation is tested.
- **2F-SURFACE-010:** `task-list.tsx` converts Server→Client Component with `useActionState`; the no-JS submit path is **intentionally lost and recorded**. Acceptance includes: all four buttons keyboard-operable; focus never dropped on outcome; outcomes and refusals announced via the existing live-region pattern; the refresh affordance keyboard-reachable and accessibly named — all assertable in the jsdom gate CI runs (ADR-051 constraint).
- **2F-SURFACE-011:** Every refusal and failure reachable from this path maps to a rendered, localized state with its declared retry-ability; nothing throws out of a Server Action.
- **2F-SURFACE-012:** `updateTaskStatus` is removed — Gate 2 shows it delegates to `persistTaskStatus`, and its only caller is `actions.test.ts:75`; removal stands unless repository evidence of a live caller appears. After this slice, **no exported Server Action can reach `cancelled` or any destructive transition outside the confirmed destructive contract** — asserted by test, not review.
- **2F-SURFACE-013:** The legacy direct-UPDATE path (`persistTaskStatus`) is deleted in the same PR that proves the new routing green; no release carries both paths.
- **2F-SURFACE-014:** 2F.2 lands as a **mechanically revertible PR**: single revert boundary, no unrelated work. The slice report states the one residual a code revert does not undo — **reminders cancelled by terminal transitions while the new path was live stay cancelled** (a data effect, not a code effect).

### 6.5 2F-CREATE — manual task-creation convergence (6)

- **2F-CREATE-001:** `createRecord`'s task branch routes through the validated creation family; the direct INSERT is deleted in the same PR. The project/person/memory branches are untouched.
- **2F-CREATE-002 (owner decision 5 — the B1 resolution, fully specified):** Manual creation persists `created_by = 'user'` and audit actor `'user'` with fully functional undo. The deployed contract cannot express this today — `create_task_command` hardcodes the literal `'agent'` in its INSERT (`202607270060:2517`; no origin parameter exists) and `private.undo_create_task_command`'s integrity guard refuses any row whose `created_by` is distinct from `'agent'` (`:2722`, raising `2E_UNDO_RESTORE_INTEGRITY`) — while the column domain already permits both values (`created_by … check (created_by in ('user','agent'))`, `202607160003:117`). The obstacle is the contract, not the schema, and the fix is this phase's work:
  - **Contract change:** `public.create_task_command` gains one trailing origin parameter, bounded to the column's closed domain and **defaulted to `'agent'`**, so every pre-existing caller is byte-identical; the INSERT writes the parameter instead of the literal.
  - **Undo change:** `private.undo_create_task_command`'s guard widens from `is distinct from 'agent'` to the bounded domain (`not in ('user','agent')` refusal semantics), preserving every other condition and the declared `2E_UNDO_RESTORE_INTEGRITY` error contract, so a user-created task's undo is functional, not cosmetic.
  - **RPC lifecycle:** **drop-and-recreate of the same name, in one transaction** — not a `_v2`. ADR-037 warrants a version only when a closed input shape changes incompatibly; a trailing defaulted parameter is a compatible extension (every existing named-argument and positional call resolves), and a versioned pair would leave two live creation write paths, contradicting this phase's invariant. The drop must precede the recreate in the same transaction to avoid the two-overload `42725` ambiguity ADR-053 documents. The handler change is body-only (`create or replace`, same signature).
  - **Migration count:** one migration, owned by 2F.3 — the phase total becomes **two** (§7).
  - **Deployment sequence:** 2F.3's migration deploys in its own slice session, after 2F.2 and before 2F.4's revocation, with post-deploy `DO`-block assertions: exactly one `pg_proc` row for the name, the expected default count, the guard's accepted domain, and grants unchanged.
  - **Rollback model:** no applied migration is reverted (standing posture). A code revert of the application routing restores prior behaviour entirely; the extended function persists compatibly, because the `'agent'` default keeps every pre-existing caller's behaviour byte-identical.
  - **Caller compatibility:** the existing creation action's named-argument call resolves unchanged; every signature pin (pgTAP `has_function`/`::regprocedure`-class assertions, hand-maintained `database.types.ts` Args) moves in the same commit; tests that grep the superseded declaration in `202607270060` move to the new migration file — the standing supersession hazard `STATE.md` records from Slice 2E.5.
- **2F-CREATE-003:** Creation is operation-key idempotent with database enforcement; duplicate submission returns the original identities; the duplicate-name case renders a declared, localized error instead of substring matching.
- **2F-CREATE-004:** Creation records a compensable undo (the registered creation-undo handler, made satisfiable for user-origin rows by 2F-CREATE-002's undo change) and discloses the undo window.
- **2F-CREATE-005:** Because Gate 3 proved only the *mutation* path, 2F.3 executes its own smaller creation-family probe (Gate-3-style: disposable users, two-owner, fail-closed cleanup) against the deployed contract before acceptance — including creating with `'user'` origin and undoing it, the exact case the pre-change contract refuses.
- **2F-CREATE-006:** The form's UX is preserved: same entry points, same revalidated routes, both locales.

### 6.5a Revision 4.1 correction — the creation family must admit a bare manual creation

**This subsection corrects 2F-CREATE-002 only. Everything else in §6.5 stands as written.**

1. **What the deployed family supports.** `private.task_command_creation_payload` admits exactly seven qualifier-bearing creation actions — `reschedule_due`, `set_planned`, `set_priority`, `assign_project`, `assign_context`, `assign_person`, `set_waiting_on` (`202607270060:86-95`) — and for each it requires an **exact** patch-key match (`:128-142`). An empty patch yields `actual_patch_keys = NULL`, which `is distinct from` every expected array, so **every one of the seven refuses an empty patch**. The family was built for a *no-match* natural-language command, where the qualifier is the payload.

2. **What the manual form expresses.** `createRecord`'s task branch supplies a title and nothing else. That is a distinct, valid, already-decided intent — *create a task with this title and no qualifier* — and the deployed contract cannot represent it. Revision 4 therefore required, in 2F-CREATE-001, a routing that 2F-CREATE-002's contract change does not make possible: that change concerns only `created_by`. **The contradiction is in this document, not in the repository.**

3. **The correction.** The single Slice 2F.3 migration additionally extends the existing creation family — in `private.task_command_creation_payload` — to admit **one explicit bare-creation action whose expected patch-key set is empty**. No qualifier value is invented for it; the title validation and every other creation-family invariant remain active.

4. **What the extension must preserve**, without exception: one creation RPC (`public.create_task_command`, drop-and-recreate under the same name, no `_v2`); one creation-undo handler (`private.undo_create_task_command`, body-only); **one migration for Slice 2F.3**; the manual form's existing UX (2F-CREATE-006); every existing creation caller byte-identical (the seven actions keep their exact patch-key requirements, and only the bare action accepts an empty patch); and the prohibition on fabricated values — no date, priority, project, context, person or waiting-on value may be synthesised to satisfy a validator.

5. **Scope.** This is not a new epic, slice, feature surface or architecture, and it adds no requirement ID. It is the minimum change that makes 2F-CREATE-001 satisfiable as written.

**Naming (recorded because the obvious name was unavailable).** `create_task` is **rejected**: it already denotes the *confirmation kind* in `task_command_confirmations.action` (`202607270060:20`, mirrored as `z.literal("create_task")` at `creation.ts:335`), it is a member of the pending-question consequence vocabulary, and it is a prefix of the `create_task_command` undo `action_type`. Reusing it would put two different `action` fields carrying the same literal with different meanings inside one function (`:2325`, `:2480`). The bare action is therefore **`create_title_only`** — zero prior occurrences repository-wide, named for what it carries exactly as the seven are. It is added to the **creation-family vocabulary only** and is deliberately **not** a member of `TASK_COMMAND_ACTIONS`, so neither the apply taxonomy nor the Work-surface vocabulary is widened.

### 6.6 2F-REMINDER — the scoped authoring exception (4)

- **2F-REMINDER-001 (owner decision 3, Option C):** The independent-reminder creation path (`createReminder`) is **retained as-is**: no `create_reminder` RPC is introduced, no reminder-authoring UI changes, and `authenticated` INSERT on `public.reminders` is **not** revoked.
- **2F-REMINDER-002:** The exception is documented in `SECURITY.md` as a bounded, deliberate posture: what it permits (INSERT of owner-scoped reminder rows), why it is acceptable today (zero independent reminders in production; RLS-scoped; no cancel/edit surface exists), and its reopening condition (a future validated authoring contract).
- **2F-REMINDER-003:** Whether `authenticated` UPDATE and DELETE on `public.reminders` can be revoked safely is **determined separately** in 2F.4 on writer-inventory evidence (no production client UPDATE/DELETE exists; two pgTAP stagings at `creation.sql:1115/:1135` are the only affected statements — §9). If safe, the revocation ships in 2F.4's migration; if not, the retention is recorded with its reason. Either outcome is an explicit, written determination.
- **2F-REMINDER-004:** The dormant `snoozed` status (declared in the CHECK, written by nothing in production, fired by nothing) is recorded in `DATABASE.md` as an unreachable-in-production vocabulary member, deferred — not retired in this phase. The undo handlers' snoozed branches remain covered by the §9 pgTAP stagings so they stay falsifiable.

### 6.7 2F-REVOKE — task grant revocation (8)

- **2F-REVOKE-001:** `authenticated`'s `insert`, `update`, `delete` on `public.tasks` are revoked in one dedicated migration, deployed alone, only after 2F.2 and 2F.3 are deployed and soaked. The same migration carries the reminders UPDATE/DELETE narrowing iff 2F-REMINDER-003's determination says yes.
- **2F-REVOKE-002:** `create_due_task_reminder` is verified `security invoker` (`202607160007:195-199`, Gate 2 finding 1) and the ordering consequence is honoured: because reminders INSERT is retained (Option C), the trigger hazard reduces to proving that after tasks-INSERT revocation every task insert reaches the trigger in a definer context. That proof is part of this slice's pgTAP.
- **2F-REVOKE-003:** The re-grant rollback script is committed, and CI's `database` job gains a **new harness step, built by this slice** (none exists today — the job currently runs `db reset`, pgTAP, `db lint` and one Playwright spec): apply the revocation, apply the re-grant, and prove by pgTAP that the previously-revoked writes function again. **What this proves (wording corrected in Revision 4.2, per §12):** the re-grant SQL applies and restores the **versioned migration-chain privileges** — those issued by `202607160003:195` and `202607160007:162` — on a stack `supabase db reset` built from those same migrations. Nothing in the claim depends on an unversioned platform default. **What this explicitly does not prove:** an operational rollback of a live database — PostgREST schema-cache convergence and in-flight session behaviour are named residuals, verified instead in the 2F.4 deployment session itself. The claim "rehearsed in CI" may only ever be made with this scope attached.
- **2F-REVOKE-004:** pgTAP proves the denial **non-vacuously**. Mechanism corrected in Revision 4.2 (§12): the same run re-issues, inside its own transaction, exactly the grants the migration chain issued, proves the previously-refused write now succeeds, re-revokes, and proves it is refused again — so the privilege is demonstrably the only variable, and the denial cannot be an artefact of RLS, a missing row or a broken fixture. `select` and RLS-scoped reads are proven preserved. On `reminders`, it proves exactly the posture the 2F-REMINDER-003 determination produced. The evidence loss is stated, not implied: **write-side RLS on `tasks` becomes untestable from a client role** (the grant refuses before RLS is consulted); the compensating evidence is read-side RLS (a cross-owner `select` returning zero rows) plus RPC-boundary denial (`apply_task_command` against another owner's task raising `P0002`).
- **2F-REVOKE-005:** The full existing remote suite executes in the revocation deployment session; a forgotten writer's failure mode is an unrelated surface breaking.
- **2F-REVOKE-006:** RLS policies are unchanged; no grant widens anywhere; `anon` continues to hold nothing.
- **2F-REVOKE-007:** `SECURITY.md` closes the §16.4-class residual risk **for tasks**, states the reminders posture truthfully (the Option C exception plus the UPDATE/DELETE determination outcome), and `STATE.md` records the new posture.
- **2F-REVOKE-008:** The 2F-GUARD-002 `tasks` allowlist is empty at this slice's acceptance.

### 6.8 2F-TESTMIG — test-suite semantic migration (8)

The Gate 2 inventory found **11 direct writes under `set local role authenticated`** in pgTAP plus 4 affected client-role smoke writes. **Slice 2F.4's pre-code re-run of the same artifact found 13** — Slice 2F.3 added two after Revision 4 was written (Revision 4.2, owner decision A2). Each is individually dispositioned in §9's table, which is normative; the requirements below bind the work.

- **2F-TESTMIG-001:** Every one of the **13** pgTAP statements receives the §9 disposition — none is mechanically re-roled, none silently deleted, and each changed test's report entry states exactly what invariant it proves after revocation. (Revision 4.2, owner decision A2: the count was 11 until Slice 2F.4's inventory found the two Slice 2F.3 additions now recorded as §9 rows 12 and 13. Of the 13, **10 change vehicle** and **3 — the reminder INSERTs — are unaffected under Option C and stay `authenticated`**.)
- **2F-TESTMIG-002:** `apply.sql:580`'s positive claim ("a plain client-side task UPDATE still works") is **retired and inverted**: the denial becomes a 2F-REVOKE-004 assertion, and the invariant it was actually protecting — `audit_task_change` tolerates an unset `app.audit_actor` without raising `42704` — is restaged in a privileged context so it remains proven for every surviving writer.
- **2F-TESTMIG-003:** `apply.sql:598`/`643` (title/description audit-watch proofs) restage their write vehicle as `postgres`; the invariants they keep proving: the trigger watches `title` and `description`, records the superseded value on the before side, and defaults actor to `'user'` for writes that set no `app.audit_actor`. Because no client-role task write survives the revocation, the restaged suite **additionally asserts the actor-default behaviour for at least one definer-context write** — the only shape that survives in production — so the default is proven for the writers that actually remain, not assumed from the `postgres` vehicle.
- **2F-TESTMIG-004:** The interference stagings — `apply.sql:1385` (legacy-shaped `completed_at` on a non-terminal row), `apply.sql:2436` (post-apply drift before undo), `creation.sql:1075` (post-creation edit before undo) — are restaged as **privileged-context interference**, because their production analogue after revocation is a write from another RPC or privileged path, not a client. Each keeps its exact behavioural pin (the divergence-blessing assertion at `:1385`; the undo-guard refusals), now writer-agnostic.
- **2F-TESTMIG-005:** The reminder stagings split by grant outcome: the three INSERTs (`apply.sql:2587`, `creation.sql:1232`, `:1253`) remain valid under the Option C posture and are kept as-is, doubling as living proof the retained INSERT grant works; the two UPDATEs (`creation.sql:1189`, `:1209`) follow the 2F-REMINDER-003 determination — restaged as `postgres` if UPDATE is revoked, unchanged otherwise — while keeping their invariant: creation-undo copes with a reminder that moved, or that sits in the dormant `snoozed` state, regardless of who moved it.
- **2F-TESTMIG-006:** Remote smokes: the fixture-only authenticated task inserts (`remote-phase-2e-smoke.mjs:144`, `remote-editable-candidate-confirmation-smoke.mjs:797`) move to the scripts' existing `admin` service-role clients. `remote-supabase-smoke.mjs`'s task-insert RLS assertions are **redesigned, not re-pointed**: the evidence lost is **write-side RLS on `tasks` specifically** — after revocation the grant refuses before RLS is consulted, so no client-role test can reach the policy — and the replacement evidence is read-side RLS (cross-owner reads provably empty) plus RPC-boundary denial, which remain real proofs. Its reminders insert (`:286`) survives under the exception.
- **2F-TESTMIG-007:** Stale in-repo prose that asserts the old grants is corrected at source in the same slice: the comment block at `apply.sql:1382-1384` ("authenticated retains insert/update/delete… PRD 3.2") and the `202607170028:33` grant claim named in `TODO.md`.
- **2F-TESTMIG-008:** CI's `database` job is green on the revocation migration with the full re-dispositioned suite — the executable proof that the semantic migration is complete, since these 11 statements run in CI, not only remotely.

### 6.9 2F-MEASURE — measurement reader and evidence gate (7)

- **2F-MEASURE-001:** A minimal internal command-funnel reader ships: owner-scoped, content-free aggregates over already-emitted `task_command` events — qualifying-command count, active days, outcome distribution, **refusal outcome classes (`outcomeCategory`)**, no-match rate, no-match-to-creation rate (computable today via `task_command_applied.applyRoute = 'created'`, `analytics.ts:108`), origin split (`commandOrigin ∈ {chat, work}`). Reason-level refusal granularity is **out of scope for this phase**: reason codes are not in the property allowlist (`202607280061:304-317`), and delivering them would be an unbudgeted analytics widening. No new events, no new storage, no external exposure.
- **2F-MEASURE-002:** **Qualifying command** exclusion works by construction through three real mechanisms, not email-pattern heuristics: (i) `product_events.user_id references auth.users(id) on delete cascade` (`202607170024:10`), so smoke-created disposable users take their events with them when the smokes' fail-closed cleanup deletes them; (ii) the smokes' cleanup itself, which is fail-closed by standing convention; (iii) the reader's own owner-scoping, which puts every foreign user's events out of range by RLS. **Known residual, owned rather than claimed away:** a smoke that dies before its cleanup leaves orphan events no owner-scoped reader can detect; the cleanup verifier (2F-OPERATIONS-004) is the mitigation. Unsupported-feature refusals (`outcomeCategory = 'unsupported'`) are excluded from the qualifying denominator — computable because `unsupported` is a first-class outcome member (`outcomes.ts:41-42`).
- **2F-MEASURE-003 (the Phase 2F deliverable tier):** At **50 qualifying commands / 10 distinct active days / a 14-day observation window**, the evidence authorizes **only a time-boxed (≤3 days) offline semantic-retrieval replay spike** — replay the recorded failed-match commands against an offline embedding index and measure whether the outcome would have changed. **Never infrastructure**: no production embedding pipeline, no new job type, no backfill, no `source_type` widening, no index may result from this tier.
- **2F-MEASURE-004 (the planning tier):** **150 qualifying commands / 20 distinct active days / a 30-day window / ≥2 distinct real users**, with **`no_match` rate ≥ 20%** — where `no_match` means a qualifying command whose final outcome is **`still_unmatched` or `creation_offered`** (`outcomes.ts:37-40`; no outcome member is literally named `no_match`) — **or** no-match-to-creation rate ≥ 15% (`applyRoute = 'created'`), may authorize *planning* a later semantic-retrieval phase. The **distinct-user count is out of an owner-scoped reader's range by construction** and is verified by a privileged read (service-role query or manual check) at evaluation time, not by the reader. At one user, this tier can authorize nothing beyond the 2F-MEASURE-003 spike.
- **2F-MEASURE-005:** **Non-authorizing, permanently:** unsupported-command refusal volume, adoption/command volume, one-step rate, ambiguity rate, and latency — alone or together — cannot authorize semantic retrieval. The ADR (2F-DECISION-002) states this in the same breath as the thresholds.
- **2F-MEASURE-006:** **Expiry, operationally owned:** at 90 days without a met threshold, an ADR removes semantic retrieval from the active roadmap until a new demand signal appears. Because nothing in the repository fires on a date and the phase ends before day 90, the mechanism is explicit: 2F-DECISION-002's ADR creates a **dated entry in `TODO.md`** (date computed from the reader's go-live), and 2F-OPERATIONS-006's documentation reconciliation names that entry so closeout verifies it exists. A permanently pending gate is the same as no gate.
- **2F-MEASURE-007:** The end-to-end match baseline is measured once against the deployed contract (disposable fixtures, drain-safe, fail-closed cleanup), published pinned and labelled **end-to-end**, beside the retained Phase 2E scoring-layer baseline; cross-scope comparison is prohibited where either number is quoted (discharges the 2E-MATCH-018 caveat by like-for-like measurement).

### 6.10 2F-OWNERSHIP — cross-owner denial (2)

- **2F-OWNERSHIP-001:** The surface path is proven cross-owner-denying end-to-end through its real entry point — including the Gate 3 lesson as a permanent fixture: the resolution RPC is `auth.uid()`-scoped, so the proof asserts **positive** row counts for the owner before asserting absence for the stranger (a zero-row result must never pass an isolation check vacuously).
- **2F-OWNERSHIP-002:** The 2F.3 creation probe includes the two-owner proof for the creation family.

### 6.11 2F-ANALYTICS — analytics implications (3)

- **2F-ANALYTICS-001:** `task_status_changed` continues from the consolidated path with its current allowlisted shape.
- **2F-ANALYTICS-002:** Surface applies report through the **existing** `task_command_*` events with **`commandOrigin: 'work'`** — already allowlisted (`202607280061:395` constrains the property to `array['chat','work']`), so **no allowlist widening, no new event, and no migration** is required, and the M5 catalog-table decision point is not triggered by this phase. The previously-floated `'direct'` value is rejected: it would widen an enum that already contains the semantically correct literal (the property names the mount, and the mount is the Work surface).
- **2F-ANALYTICS-003:** All payloads and the funnel reader remain content-free: no task or reminder titles, no user text.

### 6.12 2F-OPERATIONS — operational gates and closeout (6)

- **2F-OPERATIONS-001:** Every deploying slice re-verifies remote migration parity immediately before and after, recorded in `STATE.md`.
- **2F-OPERATIONS-002:** All three CI jobs green on the exact merge SHA of every slice PR.
- **2F-OPERATIONS-003:** The phase ships a fail-closed traceability generator and matrix over this PRD's **68-requirement** inventory, tamper-proven.
- **2F-OPERATIONS-004:** A cleanup verifier proves zero fixture residue across every table the phase's probes touch, executed against the deployed project.
- **2F-OPERATIONS-005 (owner decision 2):** `scripts/phase-2f-reminder-census.mjs` re-runs at 2F.6 closeout. A nonzero **bucket 1 or 2** (live reminder on a terminal task; live task-bound reminder on a null-due task) is a **stop-gate**: closeout halts and a new owner decision is required; no automatic migration is authorized by the finding. **Bucket 7 (live independent reminders) is reported informationally with the closeout record and does not block** — a nonzero value there is the Option C exception in normal use.
- **2F-OPERATIONS-006:** Permanent documentation reconciled at closeout: `STATE.md`, `CHANGELOG.md`, `TODO.md` (the stale Phase-2F line; the provenance deferral entry; **the dated 2F-MEASURE-006 expiry entry, verified present**; discharged 2E-era items), `DECISIONS.md` (the four ADRs), `SECURITY.md` (task closure + reminder exception + UPDATE/DELETE determination), `DATABASE.md` (grants; the `snoozed` dormancy note), `PHASE_2_PLAN.md` (per 2F-DECISION-003).

## 7. Epic and slice mapping

| Epic | Slice | Owns | Cross-cutting owed |
|---|---|---|---|
| 2F-A | **2F.1 — Guardrails, decisions and preconditions** | GUARD 1–3, DECISION 1–4, PRECOND 1–3 | OPERATIONS 2 |
| 2F-B | **2F.2 — Work-surface mutation convergence** | SURFACE 1–14 | ANALYTICS 1–2, OWNERSHIP 1, OPERATIONS 1–2 |
| 2F-C | **2F.3 — Manual task-creation convergence and reminder exception** | CREATE 1–6, REMINDER 1–2, 4 | ANALYTICS 3, OWNERSHIP 2, OPERATIONS 1–2 |
| 2F-D | **2F.4 — Task grant revocation and test-suite semantic migration** | REVOKE 1–8, TESTMIG 1–8, REMINDER 3 | OPERATIONS 1–2 |
| 2F-E | **2F.5 — Measurement reader and evidence gate** | MEASURE 1–7 | OPERATIONS 2 |
| 2F-F | **2F.6 — Convergence and closeout** | OPERATIONS 3–6 + whole-phase convergence audit | — |

Order: 2F.1 → 2F.2 → 2F.3 → 2F.4 → 2F.6; **2F.5 is parallelizable from day one** (it depends only on the deployed Phase 2E contract and emitted events). **Migrations expected in the whole phase: exactly two** — 2F.3's creation-contract migration (owner decision 5, specified in 2F-CREATE-002) and 2F.4's revocation. No analytics migration exists (2F-ANALYTICS-002 uses the existing `'work'` value). **2F.2 is code-only; 2F.3 is not** — it carries the phase's first migration.

## 8. Acceptance criteria per slice

**2F.1:** Both guards live in CI and proven by deliberately-failing fixtures; four ADRs merged (2F-DECISION-002's including the no-match member definition and the dated expiry entry); provenance deferral recorded in `TODO.md`; gate artifacts preserved with the static test green in CI; `effective_limit` semantics pinned. No behaviour change, no migration, no deployment.

**2F.2:** All four actions round-trip through `apply_task_command` via click-time resolution against the deployed project — replay (double-submit on one minted key), title-drift-permissive apply rendering the current title, refusal on unresolvable clicks, reminder cancellation on completion and non-interference on wait/resume, undo, audit actor — proven by the preserved static suite, jsdom component tests (keyboard/focus/live-region), and authenticated journeys desktop+mobile in both locales executed in the deployment session. `commandOrigin: 'work'` events observed live. `updateTaskStatus` and the legacy UPDATE gone; the destructive-reachability assertion green; single-revert-boundary PR; the revert's reminder-data caveat stated in the slice report.

**2F.3:** The creation-contract migration applied with its post-deploy assertions (one `pg_proc` row, default count, guard domain, grants); every signature pin and superseded-text grep moved in the same commit; manual creation through the extended family persisting `created_by = 'user'` and actor `'user'`, idempotent, with **executed undo of a user-created task** — proven by the slice's own two-owner creation probe against the deployed contract. The reminder exception documented in `SECURITY.md`; `snoozed` dormancy recorded; no reminder code change; `tasks` allowlist reduced to empty pending 2F.4.

**2F.4:** Revocation migration applied alone in its session with: the CI re-grant harness (built by this slice) already green, its scope stated per 2F-REVOKE-003; pre-revocation privilege assertion plus denial proofs green (2F-REVOKE-004); the reminders UPDATE/DELETE determination written and executed (or its retention recorded); all **13** pgTAP dispositions landed per §9 with CI green; the four smoke reworks executed; the full remote suite green in-session; `SECURITY.md`/`STATE.md` posture updated; `tasks` allowlist empty.

**2F.5:** Reader live and owner-scoped with the §6.9 exclusion mechanisms proven by test; both evidence tiers and the expiry mechanically computable from the reader's outputs (the distinct-user check documented as a privileged read); the end-to-end baseline published pinned with its scope label; fixtures cleaned, proven.

**2F.6:** Traceability tamper-proven over the 68-requirement inventory; cleanup verifier executed clean; **census stop-gate executed** — buckets 1 and 2 zero, or closeout halted for an owner decision; bucket 7 reported informationally; convergence audit finds one write path for `tasks`, the single documented reminder exception, one payload builder, one resolution mechanism — or files defects; documentation reconciled per 2F-OPERATIONS-006; final report with the phase's executed-evidence ledger.

## 9. The eleven pgTAP dispositions (normative table)

| # | Site | Table · op | Classification | Post-revocation invariant it proves |
|---|---|---|---|---|
| 1 | `apply.sql:580` | tasks · update | **Client-write behaviour that becomes invalid** — retire and invert | The denial itself (moves to 2F-REVOKE-004); its protected invariant — `audit_task_change` reads `app.audit_actor` with `missing_ok` and never raises `42704` — restaged privileged |
| 2 | `apply.sql:598` | tasks · update | Fixture vehicle → `postgres` | Trigger watches `title`; before-state carries the superseded title; actor defaults to `'user'` when unset — plus the added definer-context actor-default assertion (2F-TESTMIG-003) |
| 3 | `apply.sql:643` | tasks · update | Fixture vehicle → `postgres` | Same, for `description` |
| 4 | `apply.sql:1385` | tasks · update | **Concurrency/legacy-shape proof → privileged-interference replacement** | `apply_task_command`'s pinned behaviour on a non-terminal row carrying `completed_at` (the one-input divergence bless), now writer-agnostic — such rows can still arise from privileged paths and pre-existing data; the stale comment at `:1382-1384` corrected (2F-TESTMIG-007) |
| 5 | `apply.sql:2436` | tasks · update | **Concurrency proof → privileged-interference replacement** | The ten-column undo guard refuses when the task drifted after apply, regardless of which writer moved it (production analogue: a second RPC apply) |
| 6 | `apply.sql:2587` | reminders · insert | **Unaffected under Option C** — keep as-is | The retained INSERT grant works; undo's reminder-integrity behaviour with a live reminder staged on a completed task |
| 7 | `creation.sql:1075` | tasks · update | **Concurrency proof → privileged-interference replacement** | Creation-undo's guard on post-creation drift, writer-agnostic (production analogue: a rename via `apply_task_command`) |
| 8 | `creation.sql:1189` | reminders · update | **Conditional on 2F-REMINDER-003** — restage `postgres` iff UPDATE revoked | Creation-undo copes with a reminder whose `remind_at` moved after creation, whoever moved it |
| 9 | `creation.sql:1209` | reminders · update | **Conditional on 2F-REMINDER-003** — restage `postgres` iff UPDATE revoked | Creation-undo copes with a reminder in the dormant `snoozed` state (keeps the handlers' snoozed branches falsifiable per 2F-REMINDER-004) |
| 10 | `creation.sql:1232` | reminders · insert | **Unaffected under Option C** — keep as-is | Retained INSERT grant; undo behaviour with an extra scheduled reminder present |
| 11 | `creation.sql:1253` | reminders · insert | **Unaffected under Option C** — keep as-is | Retained INSERT grant; undo behaviour with an extra snoozed reminder present |
| **12** | `creation.sql:1582` | tasks · update | **Concurrency proof → privileged-interference replacement** | `undo_create_task_command` refuses a task whose origin drifted from the recorded `user` to `agent` (`2E_UNDO_RESTORE_INTEGRITY`), writer-agnostic |
| **13** | `creation.sql:1609` | tasks · update | **Concurrency proof → privileged-interference replacement** | The mirror direction, `agent` → `user`. Both are kept because the guard is an equality, and a single-direction test would pass a one-way regression |
| — | Obsolete tests to retire | — | **None** | Every statement's underlying invariant survives; only vehicles and one inverted claim change |

**Revision 4.2 corrections to this table (owner decisions A2 and A3), recorded rather than silently applied:**

- **Rows 12 and 13 are new.** Slice 2F.3 added two `set local role authenticated` task UPDATEs after Revision 4 fixed this table at eleven rows, so the normative table did not describe the repository. Slice 2F.4's pre-code inventory found them. The disposition count is **13**, and 2F-TESTMIG-001 binds to all thirteen.
- **Rows 7–11's line anchors moved +74.** Slice 2F.3 inserted content above them. The pre-4.2 anchors were `1075`, `1115`, `1135`, `1158`, `1179`; the current lines are `1149`, `1189`, `1209`, `1232`, `1253`. §2 item 5's citations of `creation.sql:1158`/`:1179` move with them. All six `apply.sql` anchors were verified still exact and are unchanged.

No statement is mechanically re-roled to `service_role`; classifications 4, 5, 7, 12 and 13 exist precisely because re-seeding would have changed what they prove. The one deliberate coverage addition across the set is 2F-TESTMIG-003's definer-context actor-default assertion — the only write shape that survives in production is otherwise never exercised for that behaviour.

## 10. Validation-gate matrix

| Gate | Executes in | 2F.1 | 2F.2 | 2F.3 | 2F.4 | 2F.5 | 2F.6 |
|---|---|---|---|---|---|---|---|
| lint / typecheck / Vitest / build · `deno check`+`test` | CI, exact merge SHA | ● | ● | ● | ● | ● | ● |
| Empty-DB chain + full pgTAP + db lint | CI `database` | ● | ● | ● | ● | ● | ● |
| Grammar-trap guard + architecture gate (allowlists per §2) | CI, from 2F.1 | ● proven | ● shrunk | ● shrunk | ● tasks-empty | ● | ● |
| Preserved Gate 3 static suite (`work-surface-reuse.test.ts`) | CI, continuous | ● | ● | ● | ● | ● | ● |
| Authenticated journeys desktop+mobile, pt-BR+en | Deployment session | — | ● | ● | — (see 4.3-c) | — | ● |
| Two-owner disposable probe (mutation / creation incl. user-origin undo) | Deployment session | — | ● | ● | — | — | — |
| CI re-grant proof (revoke → re-grant → writes restored; **SQL-level only, not a live-ops rehearsal**) | CI, before 2F.4 deploy | — | — | — | ● cited | — | — |
| Pre-revocation privilege assertion (denial non-vacuous) | CI `database`, 2F.4 | — | — | — | ● | — | — |
| Full existing remote suite | 2F.4 deployment session | — | — | — | ● | — | — |
| Reminders UPDATE/DELETE determination (written) | 2F.4 | — | — | — | ● | — | — |
| End-to-end baseline + reader exclusion-mechanism proof | Deployed project / CI | — | — | — | — | ● | — |
| **Census stop-gate** (buckets 1/2 blocking; bucket 7 informational) | 2F.6 closeout session | — | — | — | — | — | ● |
| Traceability tamper runs + cleanup verifier | 2F.6, deployed project | — | — | — | — | — | ● |
| Parity re-check before/after | Every slice with a **deployed-project session** | — | ● | ● | ● | ● | ● |

A cell counts only when executed; the slice report names the session (2F-PRECOND-003). 2F.1 deploys nothing and has no deployed-project session, so it carries no parity cell.

**Revision 4.3 corrections to this matrix (Slice 2F.6's A14 sweep), recorded rather than silently applied.** The sweep exists because §10 is the phase's gate ledger and nothing before Slice 2F.6 cross-checked it against what the slice reports actually record.

- **4.3-a — the `database` cell for 2F.5 was `—` and is now `●`.** Slice 2F.5 added three read-only pgTAP catalog assertions to `supabase/tests/product_events.sql` (`plan(23)` → `plan(26)`), which run in that job; its acceptance report §4 records the job reporting `product_events.sql … ok`. The cell understated the slice.
- **4.3-b — the parity row's rule is restated, and 2F.5's cell corrected.** The row was labelled "every *deploying* slice" while already marking **2F.2**, which carried no migration. The operative rule is evidently "every slice with a session against the deployed project", under which 2F.5 — which verified parity `202607300063` before and after with `npx supabase migration list --linked` — earns the cell it was denied. No requirement changes: `2F-OPERATIONS-001` still binds deploying slices, and Slice 2F.6 reads its own cell as a closeout verification that parity is *unmoved*.
- **4.3-c — the 2F.4 authenticated-journeys cell claimed an execution that never happened**, and is now `—`. `PHASE_2F_SLICE_04_ACCEPTANCE.md` §11 enumerates all sixteen acceptance gates and not one is a Playwright journey; the file's only browser mention is the CI job name. §10's own rule is that a cell counts only when executed, and `2F-PRECOND-003` forbids citing an unexecuted gate as evidence anywhere in the phase — so the cell is corrected rather than back-filled. What the slice *did* execute in place of a browser regression is stronger for its subject: 14/14 production-flow checks through PostgREST with a real end-user token, plus the full remote suite at exit 0 (`…_04_ACCEPTANCE.md` §5, §7). Slice 2F.6 executes its own journeys cell against merged `main`, which gives the phase an executed end-state journey proof that this correction leaves owing.

**Slice 2F.6's own cells, stated with the same discipline.** Four of 2F.6's `●` cells sit on rows whose *Executes in* is a CI gate ("CI, exact merge SHA", "CI `database`", "CI, from 2F.1", "CI, continuous"). At the time this revision was written those gates had run **locally and on the branch-head CI run for PR #33**, not on a merge SHA that does not exist yet — so under §10's own footnote and ADR-063 they are **pending the merge-SHA run and confirmed in `PHASE_2F_SLICE_06_ACCEPTANCE.md`**, not back-filled here. The cells 2F.6 has already discharged by execution are the census stop-gate, the traceability and cleanup verifiers, the parity re-check, and the authenticated journeys (36/36 across the two Playwright projects). The reviewers raised this against an earlier draft that had left the distinction unstated, which is the same omission Revision 4.3-c corrects one row above.

No requirement was added, removed, renumbered or rescoped by Revision 4.3; no epic, slice, feature surface or architecture changed. All three corrections were found by the closeout sweep the phase reserved for exactly this (`2F-OPERATIONS-006` + the whole-phase convergence audit), which is what that gate exists for.

## 11. Rollback evidence model

- 2F.1: nothing to roll back (guards, ADRs, docs; no deployment).
- 2F.2: mechanical code revert (single-concern PR, no migration). Recorded residual: reminders cancelled by terminal transitions while live stay cancelled — a data effect a revert does not undo (2F-SURFACE-014).
- 2F.3: code revert restores prior behaviour entirely; the deployed creation-contract extension persists compatibly (its `'agent'` default keeps every pre-existing caller byte-identical), and no applied migration is ever reverted (standing posture).
- 2F.4: the committed re-grant, proven at SQL level in CI per 2F-REVOKE-003's stated scope, executed operationally only if needed in the deployment session where schema-cache and live-session behaviour are actually observable.
- 2F.5 / 2F.6: read-only; nothing to roll back.

## 12. Permissions posture at phase end

| Object | `anon` | `authenticated` | `service_role` / definer |
|---|---|---|---|
| `public.tasks` | nothing | **SELECT only** (RLS-scoped) | unchanged |
| `public.reminders` | nothing | **SELECT + INSERT** (the §2 item-6 documented exception); UPDATE/DELETE revoked iff the 2F-REMINDER-003 determination proves it safe, else retained with the reason recorded | unchanged |
| All phase-relevant RPCs | nothing | execute where already granted, plus the re-declared `create_task_command` at its extended signature | unchanged |
| RLS policies | — | **unchanged** | — |
| `record_ai_usage` | — | **signature unchanged** (provenance deferred) | — |

No grant widens anywhere in this phase.

**Privilege provenance — corrected in Revision 4.2 (owner decision A1), because two gates turn on it.**

Revision 4 stated that no explicit `grant` on `tasks`/`reminders` existed anywhere in the migration chain and that the privileges originated in Supabase's platform defaults. **That was false for `authenticated`.** Slice 2F.4's pre-code inventory found both grants; they are issued dynamically, which is why a literal search for `grant … on public.tasks` returns nothing:

- `202607160003:185-196` — a `DO` loop over an array containing `'tasks'`, issuing `grant select, insert, update, delete on public.%I to authenticated` and `revoke all on public.%I from anon`.
- `202607160007:155-163` — the same loop shape over an array containing `'reminders'`.

The claim **is** true for `service_role`: no table grant to it exists anywhere in the chain, so its access is Supabase's default, and this phase does not touch it.

Three consequences, each affecting a gate's stated rationale rather than its requirement:

1. **2F-REVOKE-003's proof scope.** The CI re-grant harness does not prove a re-grant "on a stack whose starting privileges reproduce Supabase's platform defaults". It proves the re-grant restores **versioned migration-chain privileges** on a stack `supabase db reset` built from those very migrations. That is the stronger claim — it depends on nothing unversioned — and it is the wording the harness, the script and the slice report must use.
2. **2F-REVOKE-004's pre-revocation assertion.** It no longer proves "the local stack granted the platform defaults at all". It proves the chain-issued grant was in effect at the revocation point, and — by re-issuing exactly those grants inside the test transaction and watching the refusals become successes — that the denial is **caused by the missing privilege** rather than by RLS, a missing row or a broken fixture. Non-vacuity is unchanged as a requirement; only its mechanism is now exact.
3. **The rollback script is exact rather than reconstructed.** `scripts/phase-2f-regrant-task-write-grants.sql` is the textual inverse of two known statements.

§12's end state is reached by revoking three of the four privileges this repository granted on `tasks`, and two of the four on `reminders`, leaving the rest in place.

## 13. Traceability anchors

- **Gate report**: Gate 1 → §1 provenance removal + 2F-DECISION-004; Gate 2 → §2 enumeration, §9, 2F-REVOKE-002, 2F-TESTMIG; Gate 3 → §5, 2F-SURFACE-001…005, 2F-PRECOND-002, 2F-OWNERSHIP-001; Gate 4 → §1 reconciliation removal + 2F-OPERATIONS-005; Gate 5/F10 → 2F-MEASURE-002…006.
- **Rev 3 final review**: B1 → 2F-CREATE-002 (settled by owner decision 5); B2 → §6/§14 count; B3 → 2F-OPERATIONS-005/§1/§8/§10; M1 → 2F-SURFACE-006; M2 → 2F-ANALYTICS-002 + §7; M3 → 2F-REVOKE-003 + §10/§11; M4 → 2F-MEASURE-001; M5 → 2F-MEASURE-002; Mo1 → §2 items 5–6; Mo2 → §5; Mo3 → 2F-MEASURE-004 + 2F-DECISION-002; Mo4 → 2F-REVOKE-004; Mo5 → §2 item 1; Mo6 → §10; review §8 items → 2F-MEASURE-004/006 + 2F-OPERATIONS-006; review §7 items → 2F-TESTMIG-003/006 + 2F-REVOKE-004.
- **F6–F13** (adversarial review, resolved in Rev 3, carried): F6 → 2F-SURFACE-002/008/009 + §4 items 3–4; F7 → 2F-SURFACE-006/010 + §4 item 5; F8 → 2F-REMINDER-001…003 + §2 item 6 + 2F-GUARD-002; F9 → 2F-OPERATIONS-005; F10 → 2F-MEASURE-002…006; F11 → §7 migration count + 2F-SURFACE-001; F12 → 2F-SURFACE-014 + §11; F13 → 2F-SURFACE-012.
- **ADR-053 / 2E-COMMAND-012** → *not delivered here*; deferral re-recorded with its reopening gate (2F-DECISION-004). Residual risk (deploy-history joins) persists and is restated, not absorbed.
- **2E PRD §16.4 / §5** → closed for `public.tasks` (2F-SURFACE, 2F-CREATE, 2F-REVOKE); narrowed-and-documented for `public.reminders` (2F-REMINDER).
- **2E PRD §22** → not triggered; replaced by the two-tier evidence gate with expiry (2F-MEASURE, 2F-DECISION-002). `source_type` widening travels with any future provenance/embedding phase, not this one.
- **2E-MATCH-018 scope caveat** → discharged by 2F-MEASURE-007.

## 14. Revision history

- **Revision 4.3 (2026-07-30).** Three corrections to §10's gate ledger, found by Slice 2F.6's mandatory whole-phase convergence sweep (A14) and recorded in §10 rather than applied silently: the `database` cell for 2F.5 understated the slice (`—` → `●`); the parity row's stated rule contradicted its own 2F.2 cell and is restated, which earns 2F.5 the cell it was denied; and **2F.4's authenticated-journeys cell claimed an executed gate that appears in none of its sixteen acceptance gates** (`—`). The third is the one that mattered: §10's own rule and `2F-PRECOND-003` both forbid citing an unexecuted gate, and a closeout that had not swept the ledger cell by cell would have carried it into the final report. **No requirement was added, removed, renumbered or rescoped; no epic, slice, feature surface or architecture changed.** Slice 2F.6's definitive PRD (`docs/reports/phase-2f/PHASE_2F_SLICE_06_PRD.md` §26 M1, M2) carries the adjudication.
- **Revision 1 (2026-07-28).** Initial draft (83 requirements, 13 families); included provenance, an Option B reminder contract, a reconciliation migration, and a render-witness surface design. Superseded before commit.
- **Revision 2 (2026-07-28/29).** Interim alignment with proposal Revision 2 (F1–F5); never committed — the adversarial review and gate package ran against the proposal lineage instead.
- **Revision 3 (2026-07-29).** First committed revision, written against the executed gate package and four owner decisions; absorbed F6–F13 and dispositioned the eleven pgTAP writes. Reviewed by `PHASE_2F_PRD_REV3_FINAL_REVIEW.md`: verdict `BLOCKED` on B1–B3, with M1–M5 and Mo1–Mo6.
- **Revision 4 (2026-07-29, this document — final implementation candidate).** Resolves every Rev 3 review finding; none rejected, since every citation verified against repository truth (`created_by` literal `202607270060:2517`; undo guard `:2722`; column domain `202607160003:117`; `commandOrigin` enum `['chat','work']` `202607280061:395`; `p_title_query` `202607260059:2520`; outcome members `outcomes.ts:37-42`; `applyRoute` `analytics.ts:108`; the QuickCaptureForm ref-lazy mint `quick-capture-form.tsx:33-40`). **B1** settled by owner decision 5 — the creation contract and undo handler change in 2F.3, drop-and-recreate lifecycle, phase migration count now **two**, 2F.3 no longer code-only. **B2** — count corrected to **68**. **B3** — bucket 7 demoted to informational; buckets 1–2 remain blocking. **M1** — operation-key requirement rewritten (mint once per mount, per (row, action), submit-time injection, rotate on terminal outcomes, refusal-rollback note). **M2** — `commandOrigin: 'work'` reused; the analytics conditional migration deleted. **M3** — the CI re-grant proof's scope stated exactly; the harness named as 2F.4 work. **M4** — refusal outcome classes, reason granularity out of scope. **M5** — real exclusion mechanism (cascade + cleanup + owner-scoping) with the failed-cleanup residual owned. **Mo1–Mo6 and the review's §7/§8 items** — applied as written (writer-observation wording; `p_title_query`; no-match members; pre-revocation assertion; Phase 2D family removed from §2; 2F.1 parity cell cleared; expiry given a dated `TODO.md` mechanism; distinct-user privileged read; write-side-RLS loss stated with its compensation; definer-context actor-default assertion). No new requirements, no new epics, no slice changes, no scope expansion.
- **Revision 4.2 (2026-07-29).** Three factual corrections, authorized by the owner as decisions A1–A3 on Slice 2F.4's mandatory pre-code inventory and blast-radius summary (`docs/reports/phase-2f/PHASE_2F_SLICE_04_PLAN.md`, `…_BLAST_RADIUS.md`). **A1 — §12's privilege provenance was wrong.** Revision 4 claimed no explicit `grant` on `tasks`/`reminders` existed in the migration chain and that the privileges were Supabase platform defaults; both grants exist, issued dynamically inside `DO` loops (`202607160003:185-196`, `202607160007:155-163`), which is why a literal search missed them. §12 is rewritten, and the two rationales that depended on it — 2F-REVOKE-003's proof scope and 2F-REVOKE-004's non-vacuity mechanism — are restated. The claim remains true for `service_role`. **A2 — §9 was two rows short.** Slice 2F.3 added two `set local role authenticated` task UPDATEs (`creation.sql:1582`, `:1609`) after Revision 4 fixed the table at eleven; they are now rows 12 and 13, classified as privileged-interference like rows 4, 5 and 7. The disposition count is 13, of which 10 change vehicle and 3 stay `authenticated` under Option C. **A3 — five `creation.sql` anchors had drifted +74** and are refreshed in §9, §2 item 5 and 2F-TESTMIG-005; all six `apply.sql` anchors were verified still exact. **No requirement was added, removed, renumbered or rescoped; no epic, slice, feature surface or architecture changed.** Every correction was found by the pre-code inventory the owner mandates before each slice, which is what that gate exists for — the same mechanism that produced Revision 4.1.
- **Revision 4.1 (2026-07-29).** One correction, to 2F-CREATE-002 only, recorded in **§6.5a** and authorized by the owner. Slice 2F.3's mandatory pre-code inventory proved that `2F-CREATE-001` was unsatisfiable as written: the deployed creation family admits only seven *qualifier-bearing* actions and requires an exact patch-key match for each, so it cannot represent the manual form's title-only intent, and 2F-CREATE-002's contract change (which concerns only `created_by`) does not close that gap. The same single migration now also admits one explicit bare-creation action, `create_title_only`, whose expected patch-key set is empty. **Unchanged:** one creation RPC, one undo handler, one migration for 2F.3, the form's UX, every existing caller, and the prohibition on fabricated values. **No new requirement ID, no new epic, no new slice, no new feature surface, no architecture change.** The correction was found by the inventory gate the owner mandated, which is what that gate exists for.
