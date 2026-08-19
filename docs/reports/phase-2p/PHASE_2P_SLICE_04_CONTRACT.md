# Phase 2P — slice 2P.4 contract and threat model

**Written before any SQL**, as the owner's execution order requires. Sections 1
and 2 are the re-audit and the insufficiency finding; sections 3 to 8 are the
contract the migration must satisfy; section 9 is the threat model. Nothing here
is a claim of delivery — the acceptance record makes those, and only after the
gates run.

Baseline: `main` `02c41d13c318039b13beefc368de4a07f8fe3e64`, 98 local = 98
hosted, parity `202608180098`, read live from
`supabase_migrations.schema_migrations`.

---

## 1. What exists today, measured against the deployed database

| Object | Measured |
|---|---|
| `agent_preferences.autonomy_level` | `text`, `not null`, default `'autonomous'`, **no check constraint** |
| behavioural consumers of that column | **none.** It appears in one `select` list (`src/features/profile/actions.ts:50`) and is passed through `settings-payload.ts` as `autonomyLevel`. Nothing branches on it. |
| `capabilities.ts:148` | `{ key: "autonomy", state: "future", consumerEvidence: [], visible: false, columns: ["autonomy_level"], controls: [] }` |
| `trust-builders.ts:55,88` | passes `autonomyAllowed: true` **as a literal**. The column is not read. |
| `public.model_only_element_trust` | `score = confidence * 0.20 + 0.05`, never above `0.25`; the `request_review` cut is `0.55`, so it returns `block_until_confirmation` at **every** confidence |
| `TRUST_THRESHOLDS.autoApply` | `0.9` — a single global score cut, over interpretation *elements* |
| `product_events.event_name` | closed `CHECK`, **39** values, none about automation; `surface` closed, **12** values, no `settings` |
| `audit_logs.action_type` | **no** check constraint; `actor` is `user` / `agent` / `system` |
| `private.undo_operation_handlers` | `(action_type, handler_function, description)`, **17** rows |
| automatic domain writes in the product | **zero**. Every task, person, project, organization, memory and relation is written by an owner action. |

## 2. Why this schema cannot carry `2P-AUTONOMY-001`, `-003` and `-010`

**One column cannot hold six policies.** `autonomy_level` is a single global
`text`. `-001` requires a policy *per category* and `-010` requires disabling
*one* category without disabling the others. A single scalar can express neither,
and no combination of its values can.

**Its default is a fact that can never be false.** The column is `not null`
defaulting to `'autonomous'`, so every account already reads `'autonomous'`
without anyone ever having chosen it. Reading authority out of that value would
convert a schema default into consent for six categories of automatic write. It
is recorded here so that no later reader mistakes it for a decision.

**`privacy_preferences` is not available as a store.** It is a `jsonb` column on
the same table with zero references outside the generated types. Bending it into
an automation authority would put two authorities in one vocabulary — the defect
this repository has already paid for, and the reason `element_trust` and
`element_policy` had to be normalized in slice 2P.1.

**`element_trust` is a different authority and must stay one.** It decides
whether an *element of an interpretation* (summary, concepts, `occurredAt`,
`extractedDates`, entities) may be applied. The six categories are *domain
writes*. Overloading `element_trust` would make one score govern both, which is
precisely the generic-threshold rule the owner forbade.

**There is no reference set and nowhere to put one.** `-003` requires
calibration against owner-reviewed outcomes. The owner's reviews exist —
`entry_task_candidate_resolutions` and `entry_person_candidate_resolutions` — but
nothing derives an outcome from them, nothing counts them per category, and there
is no table in which a count could live.

**`product_events` cannot carry the telemetry.** Its `event_name` and `surface`
are closed `CHECK` vocabularies deployed on the hosted database, and widening a
deployed vocabulary is a stop condition this phase's own plan names. The audit
trail therefore uses `audit_logs`, whose `action_type` carries no constraint.

## 3. The six categories

Fixed by the owner's signature, and by a `CHECK` constraint so a seventh is a
visible schema change rather than a quiet insert:

`task` · `person` · `project` · `organization` · `memory` · `relation`

## 4. The three policy states

| State | Meaning | Automates? |
|---|---|---|
| `disabled` | the owner has switched this category off; eligibility is not even evaluated | never |
| `suggest_only` | suggestions flow to Needs You exactly as they do today | never |
| `automatic_when_eligible` | automatic writes are permitted **only** while the measured eligibility gate says yes | only when eligible |

**No row is written by the migration.** An absent policy computes as
`suggest_only`. That is `"ausência de política específica significa não
automatizar"` discharged by construction rather than by a default value someone
could later read as consent — the mistake `autonomy_level` already embodies.

All three states leave interpretation and suggestion untouched, which is
`2P-AUTONOMY-010`.

## 5. The decision, and the five reasons it can give

One authority — `private.automation_category_decision(user_id, category)` —
consumed by every reader. Its `reason` vocabulary is closed:

| Reason | When | `eligible` |
|---|---|---|
| `automation_disabled_by_owner` | state is `disabled` | false |
| `suggest_only_by_owner` | state is `suggest_only`, **including an absent row and any unrecognized value** | false |
| `insufficient_calibration` | armed, but sample, precision or freshness is short | false |
| `blocked_by_recent_undo` | armed and calibrated, but a recent undo blocks | false |
| `automatic` | armed, calibrated, unblocked | **true** |

**Fail-closed laws, each of which is a test:**

1. an absent policy row is `suggest_only_by_owner`, never `automatic`;
2. an unrecognized state value is `suggest_only_by_owner` and does **not** raise
   — raising would deny the owner the read surface that explains the refusal;
3. `agent_preferences.autonomy_level` is **not read** by any function in this
   contract, and a guard asserts its absence from their bodies;
4. no confidence, score or probability column is read either — `2P-AUTONOMY-002`
   is discharged structurally, not by a threshold comparison;
5. `eligible` is true for exactly one reason and no other.

## 6. Calibration

### 6.1 What counts as a reviewed example

Four outcomes, distinct as the owner required:

| Outcome | Produced by |
|---|---|
| `approved` | the owner confirmed the suggestion unchanged |
| `corrected` | the owner confirmed it but changed what it said |
| `rejected` | the owner marked it incorrect or unsuitable — and **only** that |
| `undone` | the owner reversed their own acceptance afterwards |

**Only `rejected` is a rejection**, and the product's own copy is what decides
that. `task-candidate-form.tsx:79-94` tells the owner, in both locales, that
`rejected` *"marks the suggestion as incorrect or unsuitable"*, that `retained`
*"keeps it only in this entry's history"*, and that `dismissed` *"closes it
without saying the suggestion was wrong"*.

So `retained` and `dismissed` produce **no observation at all**. Counting either
as a miss would understate the model and would put a verdict in the owner's
mouth that the interface promised not to take — the same failure as treating
absence of review as approval, in the other direction.

### 6.2 Content-minimal, structurally

The observation table has **no free-text content column at all**. It stores the
category, the outcome, the source kind, owner-scoped foreign keys to the entry,
the interpretation and the subject, a deterministic `subject_key` built from ids
and an index, and a timestamp. `corrected` is *computed* by comparing the stored
title to the candidate's title and only the resulting outcome is stored — the
comparison touches content, the row never does. A guard asserts the table's
column list.

### 6.3 Counting, and why append-only still yields one verdict per subject

Rows are append-only and unique on `(user_id, observation_key)`, where the key
carries the identity of the *source row*. So a re-fired trigger is a no-op, and a
confirm → undo → confirm cycle produces three distinct rows rather than silently
dropping the third.

The summary then reduces to **the latest observation per `subject_key`**, so one
candidate contributes exactly one verdict. `reviewed` is the number of distinct
subjects; precision is `approved / reviewed`. The raw `undone` rows are read
separately for the blocking rule, because an undo is evidence even when a later
approval supersedes it.

### 6.4 The proposed thresholds, and their justification

The repository defines no minimum sample size and no calibration criterion, so
this is a **proposal for the owner to sign**, coded so it is reviewable in a diff
and readable by pgTAP, and unreachable today by every category.

| Category | Min. reviewed | Min. precision | Justification |
|---|---|---|---|
| `task` | 50 | 0.90 | fully reversible — cancellation plus a registered undo — the smallest blast radius and the highest volume |
| `project` | 60 | 0.95 | nominal duplication propagates through associations; a wrong project is cheap to create and expensive to unpick |
| `organization` | 60 | 0.95 | company names collide across contexts; a duplicate splits a person's affiliation |
| `person` | 80 | 0.97 | identity collision is the dominant risk; a wrong person fragments the graph and merging is not implemented |
| `memory` | 80 | 0.97 | a memory is durable by definition and enters retrieval; a wrong durable fact contaminates answers indefinitely |
| `relation` | 100 | 0.98 | `2N-RELATION-TRIGGER` is a hard boundary; a relation asserted as owner-authored is the highest-cost error the product can make |

Freshness: at least **10** of the reviewed subjects observed within **90 days**,
and the newest within **30 days**. A calibration that stopped being measured is
not a calibration.

Blocking: any `undone` observation among the **20** most recent produces
`blocked_by_recent_undo`. The owner reversing an acceptance is the strongest
available signal that the category is not ready, and it must outrank an
aggregate.

**Every threshold is a code constant, and the policy state is data.** Eligibility
needs both, so neither the owner's switch nor a measurement can authorize a write
alone.

## 7. What an automatic write must do, if a category ever becomes eligible

These rules ship as encoded, tested predicates. **None of them is reachable
today**, because no category is eligible and no automatic writer exists; the
acceptance record classifies them accordingly rather than claiming delivery.

| Requirement | Rule |
|---|---|
| `-005` task | non-empty title within bounds; any date storable and resolved in the owner's timezone; refuse when an open task with the same normalized title exists for the owner |
| `-006` person | resolve existing candidates first; any plausible match refuses and routes to Needs You; never a second identity |
| `-007` memory | durable-language evidence required; a dated event is not a memory |
| `-008` relation | co-mention alone never persists; `2N-RELATION-TRIGGER` stands |
| project / organization | refuse on nominal duplication; never invent an association |
| all | attributable to the agent, announced, content-minimal audit reason, registered undo, idempotent on an operation key, owner-scoped, refuses on conflict or insufficient information |

## 8. What this slice must not do

- no third migration — one, and one only;
- no new `product_events` vocabulary value, name or surface;
- no change to any existing grant, RLS policy, retention rule or `EXECUTE`
  privilege;
- no read of `agent_preferences.autonomy_level` as authority;
- no category set to `automatic_when_eligible` by this work;
- no fabricated dataset, approval or threshold;
- no absorption of `2P-ATTENTION-008`'s browser half, `2P-CHAT-004-MOBILE`,
  `2P-CHAT-007-JOURNEY` or `RG-DEP-3`.

## 9. Threat model

Phase 2P's own threats first, then the ones this slice introduces.

| Threat | Mitigation, and where it is discharged |
|---|---|
| **T-5** raw confidence authorizes a wrong mutation | the decision function reads no score column at all; a guard asserts the absence. Policy state and measured calibration are both necessary. |
| **T-6** automation creates duplicate people | `-006`'s predicate refuses on any plausible match; and no category is eligible, so no create path exists to reach. |
| **T-7** co-mention becomes a relationship fact | `relation` carries the strictest thresholds and `-008`'s refusal; `2N-RELATION-TRIGGER` is untouched. |
| **T-8** an automatic write cannot be explained or undone | `audit_logs` + `undo_operations` with a registered handler; the policy change itself is already both. |
| **T-20** the slice absorbs residuals | section 8. |
| **T-2P4-a** a schema default read as consent | no policy row is written; absence computes `suggest_only`; `autonomy_level` is excluded by guard. |
| **T-2P4-b** calibration evidence leaks content | the table has no content column; `corrected` is computed and discarded. Guard on the column list. |
| **T-2P4-c** another owner's reviews calibrate this owner | every producer derives `user_id` from the source row; RLS forced; the summary is `user_id`-scoped; cross-owner proved hosted and in pgTAP. |
| **T-2P4-d** a replayed or concurrent producer double-counts | unique `(user_id, observation_key)` keyed on the source row's identity; the summary reduces to latest-per-subject. |
| **T-2P4-e** a failing producer destroys the owner's resolution | the producer performs no lookup that can raise and inserts `on conflict do nothing`. It carries **no** exception handler, so a real defect fails loudly in CI instead of being swallowed. |
| **T-2P4-f** the control writes a state the gate then honours blindly | arming is permitted and is not authorization; the gate re-measures on every read. |
| **T-2P4-g** a stale calibration keeps a category armed | freshness is part of eligibility; an unmeasured category degrades to `insufficient_calibration`. |
| **T-2P4-h** the new tables escape the deletion cascade | both carry `on delete cascade` to `auth.users`, and both join the cascade drill's populator in this same change — the drill's runtime enumeration fails by name otherwise. |
