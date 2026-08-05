# Phase 2F PRD Revision 3 — final delta review

Reviewed 2026-07-29 against the normative hierarchy: repository truth at `b54b833` (remote parity `202607280061`) → `docs/reports/phase-2f/PHASE_2F_PRE_CODE_GATE_REPORT.md` → the four fixed owner decisions → `docs/initiatives/phase-2f/PHASE_2F_PRD.md` Revision 3.

The four owner decisions are treated as fixed and are not reopened. No finding below proposes a cleaner architecture; every correction is the smallest one that preserves the decisions and the Gate 3-proven mechanism.

---

## 1. Executive verdict

## `BLOCKED`

Three blocking findings. None requires re-architecting, none reopens an owner decision, and two are corrected by editing prose. The third (B1) is a genuine contradiction between two requirements that cannot both be satisfied against the deployed contract, and its resolution changes the phase's migration estimate — so it must be settled before approval, not inside the slice.

Revision 3 is otherwise in good shape and materially more truthful than its predecessors. The §9 pgTAP disposition table is accurate to the line, the writer enumeration in §2 covers all fourteen in-database writers found by Gate 2, requirement numbering is perfectly contiguous, and no removed provenance or reconciliation scope survives indirectly anywhere. The blockers are concentrated in three places, not spread through the document.

---

## 2. Blocking findings

### B1 — 2F-CREATE-002 and 2F-CREATE-004 are mutually unsatisfiable against the deployed contract

- **Severity:** Blocking.
- **PRD sections:** 2F-CREATE-002, 2F-CREATE-004; §7 ("Migrations expected in the whole phase: **exactly one**"; "2F.2 and 2F.3 are code-only"); §8 2F.3 acceptance; §11 ("2F.2 / 2F.3: mechanical code revert … no migration").
- **Repository evidence:**
  - `create_task_command` hardcodes the literal `'agent'` in its INSERT: `202607270060_phase_2e_no_match_task_creation.sql:2517` (column list `:2501`, values list `:2504-2520`). The caller cannot express origin; there is no parameter for it.
  - `private.undo_create_task_command`'s integrity check contains, among its conditions, `or target_task.created_by is distinct from 'agent'` (`:2722`), and any failure raises `'Task creation undo integrity check failed'` with `errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY'` (`:2729-2730`).
  - The column domain does permit the value: `created_by text not null default 'user' check (created_by in ('user','agent'))` (`202607160003_intelligent_capture.sql:117`). So the obstacle is the contract, not the schema.
- **Why it matters:** 2F-CREATE-002 requires a manually created task to record `created_by = 'user'`. 2F-CREATE-004 requires that same creation to record "a compensable undo (the registered creation-undo handler)". Satisfying the first makes the second refuse: the handler's guard rejects every row whose `created_by` is not `'agent'`. A slice that ships both as written produces manual tasks that are attributed honestly and **cannot be undone** — which is precisely the "cosmetic undo" the phase exists to eliminate. 2F-CREATE-002's escape hatch ("the accommodation is designed inside this slice under the contract's own change rules") understates the cost: the accommodation requires re-declaring **two** large function bodies — `public.create_task_command` to accept a bounded origin argument (a different argument list, therefore a different function, therefore `drop`-and-recreate or a `_v2` under ADR-037) and `private.undo_create_task_command` to relax the guard. That is a second migration and an RPC lifecycle event, contradicting §7's "exactly one", §7's "2F.3 is code-only", and §11's "no migration" rollback model.
- **Smallest valid correction:** State the conflict in 2F-CREATE-002 explicitly (naming `:2517` and `:2722`), and make the choice a **pre-code gate on 2F.3** rather than a design task inside it — the same discipline Gate 1 imposed on provenance. Two admissible outcomes, both preserving the owner decisions: **(a)** accept `created_by = 'agent'` for manual creation, delete the honest-attribution clause from 2F-CREATE-002, and record the attribution gap as a named residual (audit actor `'user'` is still achievable and unaffected — it is set via `app.audit_actor`, not `created_by`); or **(b)** accept a second migration, restate §7's count as "two", and move 2F.3 out of the code-only and mechanical-revert classes. Do not leave the choice to the implementer.
- **Changes:** scope and estimate under (b); scope and one requirement's wording under (a). Not architecture, and not an owner decision.

### B2 — The requirement count is wrong: 68, not 62

- **Severity:** Blocking (the PRD is the traceability source of truth and 2F-OPERATIONS-003 is fail-closed against this inventory).
- **PRD sections:** §6 header ("**62 requirements across 12 families**"); §14 Revision 3 entry ("requirement inventory recalculated to **62 across 12 families**"); consumed by 2F-OPERATIONS-003.
- **Repository evidence:** Mechanical count over the PRD itself — **68 unique requirement IDs and 68 definition bullets** across 12 families. The per-family counts in the section headers are each correct and sum to 68: GUARD 3, DECISION 4, PRECOND 3, SURFACE 14, CREATE 6, REMINDER 4, REVOKE 8, TESTMIG 8, MEASURE 7, OWNERSHIP 2, ANALYTICS 3, OPERATIONS 6.
- **Why it matters:** 2F-OPERATIONS-003 ships "a fail-closed traceability generator and matrix over this PRD's requirement inventory, tamper-proven". A generator built to the stated total either fails immediately or, worse, is written to the wrong number and silently under-covers six requirements. The repository has already paid for a verifier that was green while covering nothing.
- **Smallest valid correction:** Replace `62` with `68` in §6 and §14. Nothing else changes; the family headers, numbering and mapping are all already correct.
- **Changes:** wording only.

### B3 — The census stop-gate fires on behaviour the same PRD blesses

- **Severity:** Blocking (self-contradiction that halts closeout on normal use of a retained feature).
- **PRD sections:** 2F-OPERATIONS-005 and §1's restatement ("a nonzero bucket 1, 2 **or 7** at closeout is a **stop-gate**"); §8 2F.6 acceptance ("census stop-gate executed (buckets 1/2/7 zero, or closeout halted)"); §10 matrix row "Census stop-gate (buckets 1/2/7…)"; contradicted by 2F-REMINDER-001.
- **Repository evidence:** In `scripts/phase-2f-reminder-census.mjs`, bucket 6 is "independent reminders (`task_id is null`)" and **bucket 7 is "live independent reminders"** — `task_id is null` and `status = 'scheduled'`. `createReminder` (`src/features/agent/actions.ts:125-132`) inserts exactly that shape: no `task_id`, and `status` takes its column default `'scheduled'` (`202607160007_agent_operations.sql:41`).
- **Why it matters:** 2F-REMINDER-001 retains independent reminder creation as a deliberate, owner-approved posture (Option C). Under 2F-OPERATIONS-005, a single use of the reminders form at any point during the phase makes bucket 7 nonzero, which halts closeout and demands a fresh owner decision — about a feature the same document just blessed. Buckets 1 and 2 are the genuine orphan-defect buckets (a live reminder on a terminal task; a live task-bound reminder on a task with no due date). Bucket 7 measures Option C working as intended.
- **Smallest valid correction:** Remove bucket 7 from the stop-gate in 2F-OPERATIONS-005, §1, §8 2F.6 and the §10 matrix row; keep buckets 1 and 2. Optionally retain bucket 7 as a *reported* number in the closeout record, with the note that a nonzero value is expected under Option C.
- **Changes:** wording and closeout scope. Not architecture, and it strengthens rather than reopens owner decision 3.

---

## 3. Major and moderate findings

### M1 — 2F-SURFACE-006 is not implementable exactly as written

- **Severity:** Major. **Direct answer to the question posed: no — not exactly as written; yes, with the wording corrected. No architecture change is needed.**
- **PRD section:** 2F-SURFACE-006 (and §4 item 5 / 2F-SURFACE-010, which depend on the same conversion).
- **Repository evidence and the three defects:**
  1. **"Minted client-side at render" re-mints on every re-render.** Placing `crypto.randomUUID()` in a Client Component's render body produces a new key on every render — including every `useActionState` pending→settled transition, every parent re-render, and React StrictMode's development double-render. The pattern the requirement cites does *not* do this: `src/features/capture/quick-capture-form.tsx:33-34` uses a ref with a lazy guard — `const idempotencyKeyRef = useRef<string | null>(null); if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID();` — which is mint-once-per-mount.
  2. **Hydration mismatch if the key stays a rendered hidden input.** Today `src/features/operations/task-list.tsx:105` renders `<input type="hidden" name="operationKey" value={randomUUID()} />` using `randomUUID` imported from `node:crypto` (`:1`) — server-side, at render. `QuickCaptureForm` avoids a mismatch only because its key **never enters the markup**: it lives in a ref and is injected at submit time via `formData.set("idempotencyKey", …)` (`:40`). If 2F.2 keeps the hidden-input shape *and* mints client-side, SSR and hydration generate different UUIDs and React reports a mismatch, with the client value silently winning.
  3. **Key scope is unspecified, and the wrong choice breaks legitimate actions.** Today the key is minted **per action, per row** — `randomUUID()` is called inside the `flatMap` that renders one `<form>` per available action (`task-list.tsx:98-107`). A single per-row key shared by all four buttons would mean two *different* concurrent actions submit the same operation key with different request fingerprints, which `apply_task_command` answers with `2E_IDEMPOTENCY_MISMATCH` — a refusal for a legitimate action.
- **One clarification that helps the implementer and should be stated:** rotation can be conservative without risk. A refused apply raises inside `apply_task_command`, which aborts the whole function's transaction, so the operation-key reservation is rolled back and the key is *not* burned — reuse after a refusal is safe. The requirement's "rotate after each terminal outcome" is therefore safe and slightly stricter than the cited pattern, which rotates only on success (`quick-capture-form.tsx:43`). Citing QuickCaptureForm as "the established pattern" is imprecise on that one point.
- **Smallest valid correction:** Restate 2F-SURFACE-006 as: the key is minted **once per mount** into a ref or lazily-initialised state (never in the render body), scoped **per (row, action)**, carried into the request at submit time rather than rendered into markup, and rotated after every terminal outcome; note that a refusal rolls back the reservation so reuse is safe.
- **Changes:** wording only.

### M2 — §7's migration estimate is contradicted in its own paragraph, and one conditional is probably unnecessary

- **Severity:** Major.
- **PRD sections:** §7 ("Migrations expected in the whole phase: **exactly one** … plus the conditional analytics widening of 2F-ANALYTICS-002 if taken … unless 2F-CREATE-002's accommodation proves otherwise"); 2F-ANALYTICS-002; §11.
- **Repository evidence:** `commandOrigin` is already enum-constrained to **`array['chat', 'work']`** (`202607280061_phase_2e_task_command_analytics.sql:394`), and the property is allowlisted on all four `task_command_*` events (`:304-317`). The Work surface reporting `commandOrigin = 'work'` therefore needs **no widening at all**. 2F-ANALYTICS-002 proposes a new value `'direct'`, which would require widening an enum that already contains the semantically correct literal.
- **Why it matters:** the sentence asserts "exactly one" and then names two conditions under which it is more than one, one of which (B1) is not really conditional. And the analytics conditional is avoidable for free.
- **Smallest valid correction:** In 2F-ANALYTICS-002, replace the proposed `'direct'` with the existing `'work'` and state that no widening is required. In §7, state the count as "one, plus one conditional (2F-CREATE-002's accommodation, per B1's gate)".
- **Changes:** estimate and wording; removes a migration rather than adding one.

### M3 — 2F-REVOKE-003's claim that CI is the rollback rehearsal does not hold as stated

- **Severity:** Major. **This is one of the two claims the review was asked to challenge specifically.**
- **PRD sections:** 2F-REVOKE-003; §10 matrix row "CI rollback rehearsal (revoke → re-grant → writers work)"; §11 ("the rehearsed re-grant … already executed in CI").
- **Repository evidence:**
  - CI's `database` job builds from an **empty database** through the whole migration chain (`CLAUDE.md`, CI description: "a local Supabase stack, `supabase db reset` … the full pgTAP suite, `supabase db lint`, then `e2e/foundation.spec.ts`"). The production rollback is a re-grant against a live database holding data, a live PostgREST schema cache, and live sessions. CI can prove the SQL; it cannot rehearse that.
  - No explicit `grant` on `public.tasks` or `public.reminders` exists anywhere in the migration chain — verified: zero matches for a grant on those tables, while the repository narrows privileges by `revoke` (e.g. `202607170016_foundation_hardening.sql:196-244` revokes from `authenticated` on eight other tables). The privileges being revoked therefore originate in **Supabase platform default privileges**, outside the chain. A CI rehearsal is only as faithful as the local stack's reproduction of those defaults.
  - The rehearsal itself is **not an existing harness**. CI's database job runs `db reset`, pgTAP, `db lint` and one Playwright spec; there is no step that applies a re-grant script and re-runs previously-broken writes.
- **Why it matters:** 2F-REVOKE-003 is the requirement standing in for the disposable-project rehearsal that Gate 1 could not have. Overstating what CI proves reintroduces exactly the "a gate that has never run is a claim" failure the PRD opens by disclaiming — here in the subtler form of a gate that runs but proves something narrower than claimed.
- **Smallest valid correction:** Restate 2F-REVOKE-003 as: the re-grant script is committed; CI's `database` job proves the re-grant SQL applies and restores the privileges (asserted by pgTAP); this is explicitly **not** an operational rehearsal of a live rollback, and the residual — schema-cache and live-session behaviour — is named. Add the harness to 2F.4's scope explicitly.
- **Changes:** scope (the harness is real work) and wording. No architecture change.

### M4 — 2F-MEASURE-001 promises an aggregate the event model cannot supply

- **Severity:** Major (it is a hidden analytics widening, which the review was asked to detect).
- **PRD sections:** 2F-MEASURE-001 ("refusal reasons"); §7 migration count.
- **Repository evidence:** `task_command_previewed`'s allowlisted properties are exactly `commandOrigin, outcomeCategory, candidateCount, scoreBand, marginBand, signalCategories, oneStep, requiresConfirmation, policyVersion` (`202607280061:304-309`). Refusal **reason codes** — the per-reason vocabulary the taxonomy defines so that "push the two invoice tasks to next week" and "remind me every Monday" are refused differently (`src/features/task-commands/taxonomy.ts:65-70`) — are not among them. Only the outcome **class** is stored.
- **Why it matters:** delivering "refusal reasons" requires widening the property allowlist, which is a migration nobody has budgeted, contradicting §7. The gate itself survives: 2F-MEASURE-002's exclusion of unsupported-feature refusals from the qualifying denominator **is** computable, because `unsupported` is its own first-class outcome (`src/features/task-commands/outcomes.ts:41-42`), not a sub-reason.
- **Smallest valid correction:** In 2F-MEASURE-001, change "refusal reasons" to "refusal outcome classes (`outcomeCategory`)" and state that reason-level granularity is out of scope for this phase.
- **Changes:** wording; prevents an unplanned migration.

### M5 — 2F-MEASURE-002's "by-construction" exclusion names a mechanism an owner-scoped reader cannot use

- **Severity:** Moderate.
- **PRD section:** 2F-MEASURE-002.
- **Repository evidence:** `product_events.user_id uuid not null references auth.users(id) **on delete cascade**` (`202607170024_phase_2x_product_events.sql:10`). The real by-construction mechanism is therefore the cascade: every remote smoke deletes its disposable users in a `finally`, and their events vanish with them. But the requirement says exclusion works by filtering "users matching the disposable fixture pattern" — which means reading `auth.users.email`, and an owner-scoped reader running as `authenticated` cannot read `auth.users` at all.
- **Why it matters:** the stated mechanism is unimplementable; the actual mechanism is stronger and already in place. There is one genuine residual the requirement should own: a smoke that fails *before* its cleanup leaves orphan events that no owner-scoped reader can pattern-match.
- **Smallest valid correction:** Restate the mechanism as (i) the `on delete cascade` from `auth.users` plus the smokes' fail-closed cleanup, and (ii) the reader's own owner-scoping, which puts foreign users out of range by RLS. Name the failed-cleanup orphan as a known residual rather than claiming it away.
- **Changes:** wording only.

### Mo1 — "Task-less rows only in practice" is not enforceable, and §2 item 5's cross-reference does not cover its own examples

- **Severity:** Moderate. **This is the second question the review was asked to answer directly: it must be stated as an observation, not a contract.**
- **PRD sections:** §2 item 6; §2 item 5; 2F-REMINDER-002.
- **Repository evidence:** `public.reminders.task_id` is a plain nullable FK (`202607160007_agent_operations.sql:36`) with no CHECK and no RLS predicate restricting it; the retained INSERT grant permits an `authenticated` insert with *or* without `task_id`. Proven by the repository's own tests: all three reminder INSERT stagings that §9 keeps as-is under Option C insert **task-bound** rows under `set local role authenticated` — `supabase/tests/phase_2e_task_command_apply.sql:2587` (`insert into public.reminders (id, user_id, task_id, …)`), `phase_2e_task_command_creation.sql:1158`, `:1179`.
- **Why it matters:** §2 is the phase's architectural invariant and claims to enumerate writers "exhaustively". An unenforceable bound stated as a contract is the kind of claim a later reader relies on. Separately, §2 item 5 defers those pgTAP stagings to "item 6", but item 6 covers only `createReminder` and task-less rows — so the allowlist as written does not actually cover the statements it points at.
- **Smallest valid correction:** In item 6, replace "task-less rows only in practice" with "INSERT only; the sole production caller creates task-less rows — an observation about the current caller, not a constraint the grant enforces". In item 5, name the pgTAP reminder stagings directly instead of deferring to item 6.
- **Changes:** wording only.

### Mo2 — §5 names the resolution parameter incorrectly

- **Severity:** Moderate (a normative mechanism section naming a parameter that does not exist).
- **PRD section:** §5 ("the rendered title as `p_query`").
- **Repository evidence:** the parameter is `p_title_query` — `202607260059_phase_2e_destructive_confirmation.sql:2519` and `src/features/task-commands/candidates.ts:242`.
- **Correction:** `p_query` → `p_title_query`. **Changes:** wording only.

### Mo3 — 2F-MEASURE-004 does not define which outcomes constitute "no match"

- **Severity:** Moderate.
- **PRD sections:** 2F-MEASURE-004 ("`no_match` rate ≥ 20%"); 2F-DECISION-002.
- **Repository evidence:** the outcome vocabulary has no member named `no_match`. The candidates are `still_unmatched` ("the re-match after a clarification also found nothing. Terminal.") and `creation_offered` ("nothing matched, and the command carries a task-like payload") — `src/features/task-commands/outcomes.ts:37-40`.
- **Why it matters:** a threshold that authorizes a future phase must not be computable two ways. Whether `creation_offered` counts as a no-match materially moves the rate.
- **Correction:** name the constituent outcome members in 2F-MEASURE-004 and in the ADR (2F-DECISION-002). **Changes:** wording only.

### Mo4 — 2F-REVOKE-004's denial proof can pass vacuously in CI

- **Severity:** Moderate.
- **PRD sections:** 2F-REVOKE-004; §10 matrix.
- **Repository evidence:** as in M3, no explicit grant on `tasks`/`reminders` exists in the chain; the privileges come from platform default privileges. If the local CI stack does not grant them in the first place, "authenticated provably cannot insert/update/delete" passes without the revocation having done anything.
- **Correction:** require 2F-REVOKE-004 to assert the **starting** privilege state before the revocation in the same pgTAP run (authenticated *can* write on the pre-revocation chain), so the denial cannot be green for the wrong reason. **Changes:** wording; adds one assertion.

### Mo5 — §2 item 1 enumerates a writer family that is no longer a writer

- **Severity:** Moderate (harmless as an allowlist, imprecise as an exhaustive enumeration).
- **PRD section:** §2 item 1 ("the Phase 2D reinterpretation family").
- **Repository evidence:** the Phase 2D-era task writes lived in `public.undo_operation` (`202607230050_phase_2d_confirmed_reinterpretation.sql`), which was superseded by the handler registry (`202607250052_pre_2e_undo_handler_registry.sql`). The current writer inventory contains no Phase 2D function; its work is now done by the three registered `private.undo_*` handlers, which item 1 already covers.
- **Correction:** delete "the Phase 2D reinterpretation family" from item 1. **Changes:** wording only.

### Mo6 — §10 marks 2F.1 for a parity re-check it cannot perform

- **Severity:** Moderate (a vacuous cell in the gate matrix, which §10 says "counts only when executed").
- **PRD sections:** §10 final row ("Parity re-check before/after · Every deploying slice") marks 2F.1 ●; §8 2F.1 states "No behaviour change, no migration"; §11 states "2F.1: nothing to roll back".
- **Correction:** change the 2F.1 cell to "—". **Changes:** wording only.

---

## 4. Requirement-count verification

| Family | Header claims | Actual IDs | Contiguous | Single primary owner |
|---|---|---|---|---|
| 2F-GUARD | 3 | 3 (001–003) | yes | 2F.1 |
| 2F-DECISION | 4 | 4 (001–004) | yes | 2F.1 |
| 2F-PRECOND | 3 | 3 (001–003) | yes | 2F.1 |
| 2F-SURFACE | 14 | 14 (001–014) | yes | 2F.2 |
| 2F-CREATE | 6 | 6 (001–006) | yes | 2F.3 |
| 2F-REMINDER | 4 | 4 (001–004) | yes | 2F.3 (001, 002, 004) / 2F.4 (003) |
| 2F-REVOKE | 8 | 8 (001–008) | yes | 2F.4 |
| 2F-TESTMIG | 8 | 8 (001–008) | yes | 2F.4 |
| 2F-MEASURE | 7 | 7 (001–007) | yes | 2F.5 |
| 2F-OWNERSHIP | 2 | 2 (001–002) | yes | 2F.2 (001) / 2F.3 (002) |
| 2F-ANALYTICS | 3 | 3 (001–003) | yes | 2F.2 (001–002) / 2F.3 (003) |
| 2F-OPERATIONS | 6 | 6 (001–006) | yes | 2F.1–2F.6 per §7 |
| **Total** | **"62"** | **68** | — | — |

**Findings.** The stated total of 62 is wrong (B2); every per-family header is correct. Numbering is contiguous `001..N` in all twelve families with **no gaps and no numbers reserved for removed scope** — the PRD's own claim on that point holds. Every requirement has exactly one primary slice owner; the three families split across slices (REMINDER, OWNERSHIP, ANALYTICS) split per-requirement, never per-requirement-twice.

**Duplicates, contradictions, orphans, impossibilities.** No duplicates. No orphans — every requirement appears in the §7 epic mapping. One contradiction (B1: 2F-CREATE-002 vs 2F-CREATE-004) and one self-contradiction (B3: 2F-REMINDER-001 vs 2F-OPERATIONS-005). One requirement is impossible as written (M4: 2F-MEASURE-001's refusal reasons) and one is not implementable as written (M1: 2F-SURFACE-006).

**Normative claims lacking a basis.** All checked claims are grounded except those named in §2–§3. Spot-verified as accurate: 2F-REVOKE-002's `security invoker` claim (`202607160007:195-199` — verbatim `security invoker`); 2F-TESTMIG-007's stale-prose claim (`phase_2e_task_command_apply.sql:1383-1384` reads verbatim "`authenticated` retains insert/update/delete on `public.tasks` (PRD 3.2)"); 2F-SURFACE-012's dead-export claim (Gate 2: only caller is `actions.test.ts:75`); 2F-REMINDER-004's dormancy claim (**zero** writers of `'snoozed'` across `src/` and `supabase/migrations/`).

**Removed scope leaking back.** Verified clean. Provenance survives only as a recorded deferral (2F-DECISION-004) and a preserved reopening artifact; §12 states `record_ai_usage` **signature unchanged**; §7's migration count excludes it; no acceptance criterion anywhere requires a provenance column. Reconciliation survives only as the census stop-gate, which 2F-OPERATIONS-005 explicitly forbids from authorizing a migration. The one leak is B3 — not of the removed migration, but of a defect bucket that now misclassifies blessed behaviour.

---

## 5. Slice-by-slice readiness matrix

| Slice | Executable with CI + linked project + no Docker + no disposable project? | Blocking issues | Verdict |
|---|---|---|---|
| **2F.1** | Yes. Guards are CI-side; ADRs are documents; the four gate artifacts already exist and the Vitest half runs in CI today (10/10). 2F-PRECOND-002's `effective_limit` pin is satisfiable in the CI `database` job's pgTAP. | B2 (count feeds 2F-OPERATIONS-003); Mo6 (vacuous parity cell) | Ready after edits. Genuinely no migration and no behaviour change — verified. |
| **2F.2** | Yes. The mechanism is Gate 3-proven against the deployed RPC (23/23), needs no migration, and the jsdom/live-region gates are the ADR-051 pattern CI already runs. Authenticated journeys run in the deployment session per house practice. | M1 (2F-SURFACE-006 wording) | Ready after M1's correction. Code-only under the current contracts — verified. |
| **2F.3** | Partly. The creation probe (2F-CREATE-005) is executable — it is the Gate 3 pattern with disposable users against the linked project. | **B1** | **Not ready.** B1 must be settled before the slice is planned, because it decides whether 2F.3 is code-only. |
| **2F.4** | Yes for the revocation and pgTAP; the full remote suite and the four smoke reworks need only the linked project and credentials, both available. | M3 (rehearsal claim + unbuilt harness); Mo4 (vacuous denial risk) | Ready after edits. Correctly sequenced after 2F.2/2F.3 soak, deployed alone. |
| **2F.5** | Yes. The four `task_command_*` events are allowlisted and emitted (`202607280061:113-116`), so the reader has data; the end-to-end baseline uses the disposable-fixture pattern. **Genuinely parallelizable from day one** — it depends only on the deployed contract and emitted events, and touches nothing 2F.2–2F.4 change. | M4, M5, Mo3 | Ready after edits. Note the tiers are *computable*, not *meetable*: production has produced zero real commands, so 2F.5 delivers the instrument, never the verdict. §8's acceptance correctly says "mechanically computable". |
| **2F.6** | Yes. Census, cleanup verifier and traceability all run against the linked project with available credentials. | B3 (stop-gate misfires); B2 (traceability inventory) | Ready after edits. **Can close without provenance or reconciliation** — verified: no closeout criterion depends on either. |

**Gates that belong earlier than assigned.** One: B1's `created_by` determination is assigned inside 2F.3 (2F-CREATE-002, "the accommodation is designed inside this slice") but decides that slice's migration count, revert model and estimate. It belongs in 2F.1 alongside the other preconditions, or as an approval precondition. Everything else is correctly sequenced; 2F-PRECOND-002 in particular is properly placed ahead of 2F.2's reliance on it.

---

## 6. Permissions and writer-inventory verification

**The narrowed invariant matches the surviving writers.** §2's six-item enumeration covers all fourteen in-database writers the Gate 2 inventory found: `apply_task_command` and `create_task_command` (item 1, Phase 2E family); `confirm_entry_tasks`, `confirm_entry_task_candidates` and its `_v2`…`_v6` (item 1, Phase 2C family); the three registered `private.undo_*` handlers (item 1); `create_due_task_reminder` (item 3); `run_user_heartbeat` (item 2). The only defect is over-enumeration, not under-enumeration (Mo5).

**Does `public.tasks` reach zero direct application writers after 2F.4?** Yes, on the evidence. The three application writers are `createRecord`'s task branch (removed by 2F-CREATE-001), `persistTaskStatus` (removed by 2F-SURFACE-013) and `updateTaskStatus` (removed by 2F-SURFACE-012, and it only delegates to `persistTaskStatus`). Gate 2 found no writer in `e2e/` and none in `supabase/functions/`. The remaining `authenticated`-role writers are fixtures, all dispositioned in §9 and 2F-TESTMIG-006. 2F-REVOKE-008's "allowlist empty at this slice's acceptance" is achievable.

**Reminders allowlist truthfulness.** The allowlist correctly contains the Option C exception and adds nothing else. But it over-claims in one direction (Mo1: "task-less rows only in practice" is not enforceable and the grant does not encode it) and under-covers in another (§2 item 5's cross-reference does not actually reach the pgTAP task-bound reminder stagings it points at). Neither accidentally permits an *additional writer* — the exception is correctly bounded to INSERT and to one call site.

**Is "exactly one validated write path" compatible with every listed path?** Yes. The subtle case is `create_due_task_reminder`, which is `security invoker` and inserts into `reminders` from a trigger on `tasks` insert. 2F-REVOKE-002's reasoning is correct: a `SECURITY INVOKER` trigger function fired by a statement inside a `SECURITY DEFINER` function executes with the definer's privileges, so once every task insert arrives through the definer family the trigger no longer depends on the caller's grants. And because Option C retains `authenticated` INSERT on `reminders`, the ordering hazard Gate 2 raised is genuinely defused rather than merely sequenced — the requirement says so accurately.

**Surviving shared-nothing mutation path: none found.** No third contract is introduced; 2F.2 reuses `apply_task_command` and 2F.3 the creation family. The one path that is *not* validated is the Option C reminder INSERT, which is a declared exception rather than a shared-nothing contract, and it writes `reminders`, never `tasks`.

**Do any trigger, undo path, heartbeat or client path need `authenticated` UPDATE/DELETE on reminders?** No. Gate 2 found **zero** production client UPDATE or DELETE on `reminders` — `createReminder` is INSERT-only, and the reminders page reads only. The heartbeat's mark-sent UPDATE runs inside `run_user_heartbeat` (`SECURITY DEFINER`), and reminder cancellation runs inside `apply_task_command` (definer). The only affected statements are the two pgTAP stagings at `creation.sql:1115` and `:1135`. **2F-REMINDER-003's claim that UPDATE/DELETE can be decided independently is correct and evidence-backed.**

**`snoozed` dormancy.** Verified: no code path and no migration writes `'snoozed'` to `reminders`. It is written only by the two pgTAP stagings, and the heartbeat fires only `'scheduled'` (`202607170016:508-512`). 2F-REMINDER-004's claim is accurate and does **not** contradict the PRD, provided the two stagings survive — which §9 rows 8 and 9 ensure under either determination outcome.

**Permissions table (§12).** Accurate, with one omission worth adding: no explicit `grant` on `tasks`/`reminders` exists in the migration chain at all; `authenticated`'s current privileges originate in Supabase's platform default privileges, and the repository narrows by `revoke`. §12's "SELECT only" outcome is therefore achieved by revoking the other three and leaving the default — correct, but the provenance should be stated because M3 and Mo4 both turn on it.

---

## 7. pgTAP and remote-smoke disposition verification

**All eleven line numbers, tables and operations are accurate** against both the Gate 2 inventory and the test source. Six in `phase_2e_task_command_apply.sql` (580, 598, 643, 1385, 2436 on `tasks`; 2587 on `reminders`) and five in `phase_2e_task_command_creation.sql` (1075 on `tasks`; 1115, 1135, 1158, 1179 on `reminders`). All eleven currently run under `set local role authenticated`.

| # | Site | Disposition verified | Invariant preserved? | Notes |
|---|---|---|---|---|
| 1 | `apply.sql:580` | **Accurate.** The assertion text is verbatim "a plain client-side task UPDATE still works with app.audit_actor unset, rather than raising 42704", and the comment at `:576-579` names the exact invariant the PRD cites (reading the setting without `missing_ok` raises `42704` on every task UPDATE). | Yes — inversion is correct, and restaging the `42704` proof privileged keeps it live for every surviving writer. | The strongest row in the table. |
| 2–3 | `apply.sql:598`, `:643` | Accurate; vehicle → `postgres`. | Yes. Trigger-watch and actor-default invariants are writer-agnostic. | No coverage lost: the trigger fires for any writer. |
| 4 | `apply.sql:1385` | Accurate. Verified the comment at `:1382-1384` says the stale row "is produced by a direct client UPDATE, which is how it occurs in production". | Yes, but **the comment must be corrected, not just the vehicle** — the PRD already requires this in 2F-TESTMIG-007, correctly. | The divergence-bless pin at `:1390` is preserved. |
| 5, 7 | `apply.sql:2436`, `creation.sql:1075` | Accurate; privileged-interference replacement. | Yes. The undo guards are writer-agnostic; the production analogue after revocation genuinely is a second RPC. | Sound. |
| 6, 10, 11 | `apply.sql:2587`, `creation.sql:1158`, `:1179` | Accurate; unaffected under Option C. | Yes — and they double as living proof the retained INSERT grant works, as the PRD says. | These insert **task-bound** reminders, which is why Mo1's wording matters. |
| 8, 9 | `creation.sql:1115`, `:1135` | Accurate; conditional on 2F-REMINDER-003. | Yes under either outcome. | Row 9 correctly ties the `snoozed` branch's falsifiability to 2F-REMINDER-004. |

**Does changing the vehicle to `postgres` weaken anything?** For rows 2–3 no: the invariants are trigger and actor-default behaviour, independent of writer. For rows 4, 5 and 7 the PRD's own reasoning is right and is the reason it refuses to re-role them mechanically — their production analogue after revocation is a privileged writer, so the replacement is more faithful, not less. What *is* genuinely lost across the set is **actor coverage**: after revocation, no test exercises the `authenticated` role writing `tasks` at all, so the "actor defaults to `'user'` when `app.audit_actor` is unset" path is only ever proven for `postgres`. Since the audit trigger derives the actor from the GUC and not from the role, this is a small loss — but it should be stated rather than assumed, and it is the one place an added assertion would be justified: **assert the actor-default behaviour for at least one definer-context write, which is the only shape that survives.**

**Additional test required to preserve lost client-role semantics.** One, and only one: Mo4's pre-revocation privilege assertion, so the denial proof cannot pass vacuously in a CI stack that never granted the privilege.

**The four remote-smoke dispositions (2F-TESTMIG-006) are accurate and correctly differentiated.** `remote-phase-2e-smoke.mjs:144` and `remote-editable-candidate-confirmation-smoke.mjs:797` move to the scripts' existing `admin` service-role clients — verified available (`remote-phase-2e-smoke.mjs:52` constructs one; `remote-product-events-smoke.mjs:165` already seeds this way). `remote-supabase-smoke.mjs:258` is correctly marked for **redesign rather than re-pointing**, which is the right call: it is the cross-owner RLS proof, and re-seeding it through `service_role` would leave it green while proving nothing. `:286`'s reminders insert correctly survives under the exception.

**Challenged claim: "the full remote suite can pass after the fixture rewrites without losing meaningful RLS evidence."** Partly true, and the PRD is more honest about it than its predecessor. The write-side RLS evidence for `tasks` is genuinely lost — after revocation the grant refuses before RLS is consulted, so no client-role test can distinguish the two. 2F-TESTMIG-006's replacement (isolation proven "through reads and RPCs") is the right substitution and is real evidence: reads remain grant-permitted, so a cross-owner `select` returning zero rows still proves RLS, and `apply_task_command` against another owner's task still raises `P0002`. What the PRD should add — it is currently implied by 2F-REVOKE-004 rather than stated — is that the loss is **write-side RLS on `tasks` specifically**, and that the compensating evidence is read-side RLS plus RPC-boundary denial. With that sentence, the claim holds.

---

## 8. Measurement-gate feasibility verification

| Question | Verdict | Evidence |
|---|---|---|
| Do the events exist? | **Yes.** | `202607280061_phase_2e_task_command_analytics.sql:113-116` allowlists `task_command_previewed`, `task_command_disambiguated`, `task_command_applied`, `task_command_undone`. |
| Can no-match-to-creation be computed without a new join, event or field? | **Yes.** | `task_command_applied` carries `applyRoute` (`:312-315`), whose vocabulary is `["direct","confirmed","created"]` (`src/features/task-commands/analytics.ts:108`). The `created` route is exactly the no-match-to-creation outcome. |
| Qualifying commands, active days, windows, refusal classes, origin split? | **Yes**, all of them. | `outcomeCategory` gives the outcome class including `unsupported` as a first-class member (`outcomes.ts:41-42`); `created_at` gives days and windows; `commandOrigin` (`['chat','work']`) gives the origin split. |
| Refusal *reasons*? | **No — M4.** | Reason codes are not in the property allowlist. This is the hidden widening. |
| Distinct real users? | **Yes**, but only from a privileged reader. | `product_events.user_id` is present; counting *distinct* users is out of range for an owner-scoped `authenticated` reader by construction. 2F-MEASURE-004's "≥2 distinct real users" therefore needs a privileged path or a manual check — worth one clarifying sentence, not a redesign. |
| Fixture exclusion by construction? | **Substantially yes, but not by the stated mechanism — M5.** | `on delete cascade` from `auth.users` (`202607170024:10`) plus the smokes' fail-closed cleanup. The email-pattern filter is unimplementable from an owner-scoped reader. |
| Hidden analytics widening making "one migration plus one conditional" false? | **Two findings, and they cancel out favourably.** | M4 would add an unbudgeted widening (avoid it by narrowing the requirement). M2 removes one: `commandOrigin` already contains `'work'`, so 2F-ANALYTICS-002's conditional widening is unnecessary if `'work'` is used instead of the proposed `'direct'`. |
| Is the 90-day expiry operationally owned and executable? | **Partly — needs one edit.** | 2F-MEASURE-006 states the expiry but names no owner, no trigger mechanism and no slice. Nothing in the repository fires on a date; the phase ends before day 90; and 2F-OPERATIONS-006's closeout list does not include it. As written it is an intention. **Smallest correction:** make the expiry a dated entry in `TODO.md` created by 2F-DECISION-002's ADR, with the date computed from the reader's go-live, and name it in 2F-OPERATIONS-006's documentation reconciliation. |

The two-tier structure itself is sound and correctly conservative: 2F-MEASURE-003's spike tier forbids infrastructure explicitly, and 2F-MEASURE-004 correctly caps what a single-user dataset can authorize. 2F-MEASURE-005's non-authorizing list is complete and matches the gate report.

---

## 9. Exact PRD edits required before approval

**Blocking (must land before approval):**

1. **§6 header and §14:** `62` → `68`. *(B2, wording.)*
2. **2F-CREATE-002:** add the conflict with 2F-CREATE-004, citing `202607270060:2517` and `:2722`; convert the "accommodation" from in-slice design work into a **pre-code gate resolved before 2F.3 is planned**, with the two admissible outcomes named. If outcome (b) is chosen, amend §7's migration count, §7's "code-only" sentence and §11's 2F.3 rollback line. *(B1, scope/estimate.)*
3. **2F-OPERATIONS-005, §1, §8 2F.6, §10 matrix row:** remove bucket 7 from the stop-gate; keep buckets 1 and 2. *(B3, wording/closeout scope.)*

**Major (should land before approval):**

4. **2F-SURFACE-006:** restate as minted once per mount into a ref or lazy state (never the render body), scoped per (row, action), carried in the submit payload rather than rendered markup, rotated after every terminal outcome; note that a refusal rolls back the reservation so reuse is safe. *(M1, wording.)*
5. **2F-ANALYTICS-002 and §7:** use the existing `commandOrigin` value `'work'`; state that no widening is required; restate the migration count as "one, plus one conditional (2F-CREATE-002's accommodation)". *(M2, estimate.)*
6. **2F-REVOKE-003, §10, §11:** restate what CI proves (the re-grant SQL and restored privileges, by pgTAP) and what it does not (a live-database operational rollback); add the rehearsal harness to 2F.4's scope. *(M3, scope.)*
7. **2F-MEASURE-001:** "refusal reasons" → "refusal outcome classes (`outcomeCategory`)"; state reason-level granularity is out of scope. *(M4, wording.)*
8. **2F-MEASURE-002:** replace the email-pattern mechanism with the cascade-delete + fail-closed-cleanup + owner-scoping mechanism; name the failed-cleanup orphan as a known residual. *(M5, wording.)*

**Moderate (may land with the slice that owns them):**

9. **§2 item 6:** "task-less rows only in practice" → an explicit observation about the current caller, not an enforced bound. **§2 item 5:** name the pgTAP reminder stagings directly. *(Mo1.)*
10. **§5:** `p_query` → `p_title_query`. *(Mo2.)*
11. **2F-MEASURE-004 / 2F-DECISION-002:** name the outcome members constituting `no_match`. *(Mo3.)*
12. **2F-REVOKE-004:** add the pre-revocation privilege assertion so the denial cannot pass vacuously. *(Mo4.)*
13. **§2 item 1:** delete "the Phase 2D reinterpretation family". *(Mo5.)*
14. **§10:** 2F.1's parity cell ● → —. *(Mo6.)*
15. **2F-MEASURE-006:** give the 90-day expiry a dated `TODO.md` entry and name it in 2F-OPERATIONS-006. **2F-MEASURE-004:** note that the distinct-user count needs a privileged read. *(§8.)*
16. **2F-TESTMIG-006 / 2F-REVOKE-004:** state that the evidence lost is write-side RLS on `tasks` specifically, compensated by read-side RLS and RPC-boundary denial; add an actor-default assertion for a definer-context write. *(§7.)*

---

## 10. Final implementation authorization recommendation

**Do not authorize implementation yet.** The PRD is close — three blocking findings, of which two are corrected by editing prose and one is a genuine requirement conflict whose resolution is a decision rather than a design exercise.

**Recommended path, in order:**

1. Apply edits 1 and 3 (both wording; both eliminate a self-contradiction).
2. Settle B1 as an approval precondition, not inside 2F.3. It is a two-way choice between honest attribution and a code-only slice, and it decides the phase's migration count. Either answer is defensible and both preserve all four owner decisions.
3. Apply edits 4–8, which cost nothing and remove one migration (edit 5) while adding one (none — edit 7 avoids one).
4. Re-issue as Revision 4 and approve **2F.1 and 2F.2 for implementation**, which are ready on the evidence: 2F.2's mechanism is Gate 3-proven at 23/23 against the deployed contract, needs no SQL, and its only defect is the wording of 2F-SURFACE-006.
5. Hold **2F.3** until B1 is settled. Hold **2F.4** until 2F.2 and 2F.3 have soaked, per the PRD's own sequencing. **2F.5** may start in parallel immediately once edits 7 and 8 land — it is genuinely independent, and the earlier its reader is live, the earlier its 14-day window starts running.

**What this review does not do.** It does not approve the PRD, does not implement anything, and proposes no expansion of Phase 2F. Every correction above is the smallest one that preserves the four owner decisions and the Gate 3-proven mechanism; two of them (edits 3 and 5) make the phase smaller.
