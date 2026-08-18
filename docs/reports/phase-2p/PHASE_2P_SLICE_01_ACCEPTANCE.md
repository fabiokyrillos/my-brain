# Phase 2P — slice 2P.1 acceptance record

**Slice:** 2P.1 — close the Needs You lifecycle defect.
**Requirements:** `2P-ATTENTION-001` … `2P-ATTENTION-008`.
**Authorization:** ADR-122 Decision 1 (slice sequence) and the owner's
**replacement-migration authorization of 2026-08-18**, which corrects and widens
the earlier one: the single migration this slice is allowed to spend must cover
**the twelve resolution functions measured in §93**, through one central
lifecycle re-derivation contract, and the rejected candidate
`202608170098_confirm_entry_interpretation.sql` is **rejected, obsolete, never
applied, not reused, not copied, and not counted as delivery**. The replacement
is written from nothing.

**Baseline this slice re-audited against:** `main`
`22c7e2db3d3bba6db3774d5282afe51952bed8c1` — worktree clean, `0/0` against
`origin/main`, zero open PRs, CI green on merge SHAs `f16d431` and `22c7e2d`
(three jobs each, every internal step of `database and journey` read and
`success`, including `Install the browser` and `Run the deterministic foundation
journey`; the only `skipped` steps are the two `if: failure()` artifact
collectors). **97 local = 97 hosted, parity `202608160097`**, read live from
`supabase_migrations.schema_migrations`.

---

## 1. The six defects of migration 098, recorded before any SQL was written

Read in full from `origin/codex/fix-needs-attention-confirmation` (`2bfbe91`),
sixty-six lines. Recorded here so that the replacement is written **against a
list of failures**, not against a body of code. **No line of 098 is reused.**

| # | Defect | Line-level evidence | What the replacement must do instead |
|---|---|---|---|
| 1 | **Accepts only `awaiting_review`** | `if owned_entry.status <> 'awaiting_review' then raise exception 'Entry is not awaiting review'` | Accept **`awaiting_review` and `partially_processed`**. The hosted census below proves a `partially_processed` entry with every decision already resolved, which 098 would have refused. |
| 2 | **Registers no undo** | its only write beyond `entries` is one `audit_logs` insert; nothing reaches `private.undo_operation_handlers` (migration 052) | Register a real, handler-backed undo — `2P-ATTENTION-007`. |
| 3 | **Forces rather than re-derives** | `set status = 'completed'` with no call to `interpretation_lifecycle_status`, while `element_policy` may still demand review | Re-derive from the **real** unresolved state. That is threat `T-10`'s shape and the whole subject of this slice. |
| 4 | **`entity_id` absent from the audit insert** | the column list is `(user_id, action_type, entity_type, actor, before_state, after_state, reason, source_entry_id)` — no `entity_id` | Write `entity_id`, so the row **points at** the entry it describes. |
| 5 | **`reason` used as an idempotency marker** | `'operation:' \|\| p_operation_key::text` in the `reason` column | `reason` carries human-readable prose only. Deduplication uses a real key. |
| 6 | **`p_operation_key` deduplicates nothing** (sharpening of 5) | the early return keys on `status = 'completed'`, so two *different* keys answer identically on a completed entry and the *same* key re-executes once the status has moved; the parameter is validated non-null and then only written into prose | Deduplicate on a **true key** — the unique partial index `undo_operations_operation_key_idx` on `(user_id, operation_key)` — never on the current status. |

## 2. The hosted census that decided the contract

Read live, content-free, on `ulvwzqlpsjyrnqzfxmck`. Every entry the owner has:

| Entry | status | record only | task candidates | task resolutions | open questions | people | person resolutions | Real decision pending? |
|---|---|---|---|---|---|---|---|---|
| A | `awaiting_review` | no | 1 | **1** | **0** | 3 | **3** | **No — and it is stuck** |
| B | `awaiting_review` | no | 2 | 0 | 0 | 1 | 0 | **Yes** — two unconfirmed candidates |
| C | `partially_processed` | no | 1 | **1** | **0** | 0 | 0 | **No — and it is stuck** |

**Two of the owner's three entries are held in Needs You with nothing left to
decide, and the third is held correctly.** That is the defect and its own
negative control, in production data, without reading one character of entry
content.

`element_policy` is identical on all three — `{"summary": "block_until_confirmation",
"concepts": …, "entities": …, "occurredAt": …, "extractedDates": …}` — so the
policy is what pins A and C in `awaiting_review`, and it names elements of the
interpretation as a whole, which **no resolution action can clear**. That is why
a positive confirmation act is required and why 098 was reaching for the right
product behaviour with the wrong mechanism.

One measurement that changes the shape of the fix: `interpretation_lifecycle_status`
reads `value ->> 'policy'`, i.e. the **nested** trust form
`{key: {policy: …}}` produced by `model_only_element_trust`, while
`entry_interpretations.element_policy` stores the **flattened** form
`{key: "policy"}`. Verified by executing the deployed function on both shapes:
flattened → `completed`, nested → `awaiting_review`. A re-derivation that read
the stored column directly through the deployed function would therefore have
silently completed every entry. The contract normalizes before deriving.

## 3. The twelve resolution functions, and their grants

Read live from `pg_proc` and `information_schema.routine_privileges` against the
hosted database, confirming §93 and superseding §89's "nine":

| # | Function | `EXECUTE` to `authenticated` | writes | called by the app |
|---|---|---|---|---|
| 1 | `confirm_entry_task_candidates` | **yes** | `tasks` | no |
| 2 | `confirm_entry_task_candidates_v2` | **yes** | `tasks` | no |
| 3 | `confirm_entry_task_candidates_v3` | **yes** | `tasks` | no |
| 4 | `confirm_entry_task_candidates_v4` | **yes** | `tasks` | **yes** |
| 5 | `confirm_entry_task_candidates_v5` | **yes** | `tasks`, `entry_task_candidate_resolutions` | no |
| 6 | `confirm_entry_task_candidates_v6` | **yes** | `tasks`, `entry_task_candidate_resolutions` | **yes** |
| 7 | `confirm_entry_tasks` | no — `service_role` | `tasks` | no |
| 8 | `record_entry_task_candidate_confirmation` | no — `service_role`; it is a **trigger** on `tasks` | `entry_task_candidate_resolutions` | n/a |
| 9 | `resolve_pending_question_v1` | **yes** | `pending_questions` | no |
| 10 | `resolve_pending_question_v2` | **yes** | `pending_questions` | no |
| 11 | `resolve_pending_question_v3` | **yes** | `pending_questions` | **yes** |
| 12 | `resolve_entry_person_candidates` | **yes** | `entry_person_candidate_resolutions` | **yes** |

**Ten are reachable by the owner's own session through PostgREST; the
application calls four.** None of the twelve calls
`interpretation_lifecycle_status`, and none writes `public.entries` — measured,
not inferred.

**The union of everything the twelve write is four tables:** `tasks`,
`entry_task_candidate_resolutions`, `pending_questions`,
`entry_person_candidate_resolutions`. That fact is what makes a central contract
possible without twelve copies of the rule, and it is the reason the design
below binds to **tables** rather than to function bodies.

## 4. The central contract

**One decision, in one place, reached by every route — including the six the
application never calls and any direct DML.**

```
private.entry_lifecycle_state(user, entry) -> text | null
```

- returns `null` when the entry is **not in a governable lifecycle state** —
  `saved`, `interpreting`, `reprocessing`, `recoverable_error`,
  `terminal_error`, `awaiting_ai_configuration` are never rewritten by this
  contract, so it can add no authority over states it does not own;
- otherwise returns the status the **real** state implies:
  1. an **open pending question** (or a snoozed one past its deadline — the same
     predicate `list_needs_attention` already uses) → `partially_processed`;
  2. an **unconfirmed task candidate** — a slot with neither a live `tasks` row
     nor a resolution row for the *current* interpretation, the same predicate
     `list_needs_attention` already uses → `awaiting_review`;
  3. an **unresolved person candidate** — an `extracted_people` slot with no
     resolution row for the current interpretation → `awaiting_review`;
  4. `is_record_only` → `completed`;
  5. an **element policy demanding review**, normalized to the nested trust form
     and passed through the deployed `interpretation_lifecycle_status`, with no
     live owner confirmation recorded → `awaiting_review`;
  6. otherwise → `completed`.

```
private.rederive_entry_lifecycle(user, entry) -> text | null
```

locks the entry row, computes the above, writes `public.entries.status` **only
when it actually changes**, and records one content-minimal `audit_logs` row
naming actor, before, after and reason.

**Four `after` triggers** — on `tasks`, `entry_task_candidate_resolutions`,
`pending_questions`, `entry_person_candidate_resolutions` — call the
re-derivation. This is the delegation the owner's authorization asks for: the
twelve functions **consume one unambiguous definition** rather than carrying
twelve copies of it, and a thirteenth resolution path added later inherits the
contract without being told about it.

```
public.confirm_entry_interpretation(entry, expected_interpretation, operation_key) -> jsonb
```

is the positive act the census proves is missing: it clears defect class 5
(element policy) and nothing else. It accepts `awaiting_review` **and**
`partially_processed`, refuses while any *other* decision remains, records the
confirmation as an `undo_operations` row keyed by the real unique index, calls
the same central re-derivation, and returns the undo id.

`private.undo_confirm_entry_interpretation` is registered in
`private.undo_operation_handlers`, marks the operation `undone`, re-derives, and
therefore **restores the truthful prior state rather than a remembered one**.

**Authority statement, made explicitly rather than silently:** this slice
changes **no existing grant, no RLS policy, no retention rule and no `EXECUTE`
privilege on any function that already exists**. The only new privilege is
`EXECUTE` on the newly created `public.confirm_entry_interpretation` to
`authenticated`, which is the requirement's own object. The two `service_role`-only
functions stay `service_role`-only. `private.*` gains no grant.

**Decision recorded rather than assumed — person candidates count as a real
decision.** `extracted_people` entries carry `name`, `confidence`, `evidence`,
`inferred` and no "decision required" marker, so treating them as blocking is a
judgement, not a reading. It is made because the owner's contract names
"candidato unresolved", because a resolution surface exists
(`src/features/interpretations/person-candidate-form.tsx`, reachable from
`/app/inbox/[entryId]`), and because it changes the outcome for **none** of the
three hosted entries — A is fully resolved, B is already blocked by its task
candidates, C has no people. The risk of the opposite choice — silently
completing an entry whose people the owner never resolved — is the larger one.

---

## 5. What shipped

*(completed after implementation)*

## 6. Verification

*(completed after implementation)*

## 7. Threats dispositioned

*(completed after implementation)*

## 8. Where this stops

*(completed after implementation)*
