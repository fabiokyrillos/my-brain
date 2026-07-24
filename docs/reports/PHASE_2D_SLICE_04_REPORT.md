# Phase 2D — Slice 2D.4 Acceptance Report

## 1. Status

| Field | Value |
| --- | --- |
| Slice | Phase 2D Slice 2D.4 — Confirmed Consequence / Reinterpretation |
| Status | Implemented, gate-verified, remotely proved, and independently reviewed on a local branch |
| Date | 2026-07-24 |
| Repository | `D:\Projetos\GitHub\my-brain` |
| Branch | `codex/phase-2d-slice-4` |
| Base SHA | `d02477d` (`origin/main`, Slice 2D.3 merged via PR #13) |
| Migrations | `202607230050_phase_2d_confirmed_reinterpretation.sql`, `202607230051_fix_reinterpretation_advisory_lock_order.sql` |
| Publication state | Not pushed, no PR, not merged, no application code deployed |
| Governing documents | `PHASE_2D_PRD.md` §11.3/§13.4/§15/§20, `PHASE_2D_IMPLEMENTATION_PLAN.md` §7, ADR-033 decisions 1/2/3/7 |

Slices 2D.5–2D.6 remain unauthorized and unstarted.

## 2. Objective

Deliver the first real consequence after answering a pending question: when a
question is answered **and the user explicitly confirms**, the affected entry is
re-interpreted through a new immutable interpretation revision. The consequence
is explicit, deterministic, authenticated, auditable, undoable, and replay-safe;
nothing happens implicitly, and answering and applying the consequence remain
separate logical decisions.

## 3. Acceptance IDs covered

| Requirement | Where satisfied |
| --- | --- |
| `2D-ACTION-002` | Closed `consequence` enum (`none`, `reinterpret`) validated client (`question-resolution-contract.ts`), server (`actions.ts`), and database (`resolve_pending_question_v3`) |
| `2D-ACTION-003` | `reinterpret` reuses the deployed `enqueue_entry_reprocessing` → `interpret_entry` job → `process-jobs` worker path; no new engine/queue/worker |
| `2D-ACTION-004` | Reprocess operation key derived from the resolution's canonical fingerprint → idempotent per operation key; replay never double-enqueues |
| `2D-ACTION-005` | Truthful `consequence_status` result surfaced as localized copy ("re-interpretation queued"); no internal job/interpretation id shown as instruction |
| `2D-ACTION-006` | Undo reverses the answer and compensates the reprocess job; the `40001` hard gate resolved (see §7) |
| `2D-UNDO-002/003/004` | `undo_operation` v3 branch restores exact prior open state, compensates the consequence, never edits/resurrects an interpretation revision, idempotent |
| `2D-ANALYTICS-001/002` | `question_reinterpret_applied` is boolean-by-existence (no properties); allowlisted, fail-open |
| `2D-UX-001/002/003`, `2D-I18N-001`, `2D-A11Y-001/002/003` | Explicit confirmation panel with "nothing applied yet" notice; PT-BR/English; focus, live region, ≥44 px, no horizontal overflow at Pixel 7 |
| `2D-OPERATIONS-001` | Append-only migrations, linked parity, regenerated (content-identical) types |

## 4. Consequence contract

The permitted consequence is a **closed enum**, not an action object, free-form
payload, JSON blob, or hidden metadata:

```
questionConsequences = ["none", "reinterpret"]
```

- **Client** (`question-resolution-contract.ts`): the `answer` command variant
  gains an optional `consequence: z.enum(["none","reinterpret"]).default("none")`.
  It is carried **only** by the `answer` kind — a deferral/dismissal/not-relevant
  with a `consequence` key is rejected as an unknown key. The serializer always
  emits the normalized consequence for the answer kind so the replay fingerprint
  is unambiguous.
- **Server** (`actions.ts`): the submitted `consequence` form field is validated
  against the same enum before the RPC call. An unknown value is a
  `validation_error`, never a silent downgrade; an absent field means `none`.
- **Database** (`resolve_pending_question_v3`): an unknown consequence value, or
  a `consequence` key on any non-answer kind, rejects with `22023` before any
  mutation. An absent consequence canonicalizes to `none` and hashes identically
  to an explicit `"none"`, so replay stays deterministic either way.

The consequence is **never** executed merely because an answer exists: it runs
only when the caller explicitly submits `"consequence": "reinterpret"`, which in
the UI requires opening the consequence panel and pressing **Confirm and
re-interpret**.

## 5. v3 contract

`resolve_pending_question_v3(p_question_id uuid, p_resolution jsonb,
p_operation_key text) returns jsonb` — `language plpgsql`, `security definer`,
`set search_path = ''`, execute granted to `authenticated` only,
`public`/`anon` revoked.

- **Preserves** every Slice 2D.1/2D.2 kind byte-compatibly; `p_resolution` is the
  same closed discriminated shape plus the optional `consequence` on `answer`.
- `resolve_pending_question_v1` and `_v2` remain **unchanged and callable**;
  operation-key namespaces stay isolated (`resolve-v1:`/`resolve-v2:`/`resolve-v3:`).
- Owner from `auth.uid()`; owner entry lock; current-interpretation (anti-stale,
  `55P03`) check; single-winner concurrency (`55000`); canonical SHA-256 replay
  fingerprint over `{questionId, kind, answer, consequence}`; atomic state +
  consequence + audit + undo.
- Return: `{ question_id, resolution, consequence, consequence_status, undo_id,
  idempotent }` (plus `snoozed_until` for deferrals). A same-key/different-payload
  attempt raises `P0001` / `2D_IDEMPOTENCY_MISMATCH`; a consequence that cannot
  be applied truthfully (reprocessing already queued/running) rolls the whole
  resolution back with `P0001` / `2D_CONSEQUENCE_UNAVAILABLE`.

The application cuts the consumer over to `_v3`; reverting the application commit
alone is a complete rollback because `_v1`/`_v2` are intact.

## 6. Reinterpretation flow

`reinterpret` reuses the deployed owner-scoped path with no new engine, queue,
worker, scheduler, secret, or Edge Function:

`resolve_pending_question_v3` → `public.enqueue_entry_reprocessing(entry, key)` →
one `interpret_entry` reprocess job → the deployed `process-jobs` worker appends
a **new immutable interpretation revision**. History is strictly additive: no
historical interpretation is mutated, overwritten, or deleted, and the immutable
`pending_questions` JSON is never touched.

The reprocess operation key is derived deterministically from the resolution's
own canonical fingerprint (`qr3-<first 60 hex>`), so replaying the identical
resolution addresses the identical reprocess job and the consequence can never
double-apply.

## 7. Undo and the `2C-UNDO-004` hard gate

- The `resolve_pending_question_v3` undo branch restores the question to exactly
  `open` (cleared answer/answered_at/snoozed_until) guarded by the status the
  evidence says it left behind, so it can never clobber a newer resolution. For a
  `reinterpret` consequence it locks the owned entry, then compensates the queued
  reprocess job: an un-claimed (`pending`/`failed`) job is removed
  (`reprocessing_cancelled`); an already-claimed (`running`) job is left intact
  (`reprocessing_in_progress`) — **undo restores pointers, not history, and never
  deletes or resurrects an interpretation revision**. Undo is idempotent.
- **Hard gate resolved.** `undo_operation`'s own "Cannot undo after a newer
  interpretation revision" conflict, which raised the gateway-hanging SQLSTATE
  `40001` (`2C-UNDO-004`, proven in Phase 2X to hang the platform gateway), is
  forward-fixed to `55P03` in migration `202607230050`, mirroring ADR-026. A
  fail-closed `DO` block in the same migration asserts the function body no
  longer contains `40001`; the remote smoke's confirmed-reinterpretation undo
  returns promptly rather than hanging.

## 8. Audit

Three independently replay-safe events, no duplication, no missing provenance:

1. **answer persisted** — `audit_logs.action_type = 'resolve_pending_question_v3'`
2. **consequence confirmed** — `action_type = 'question_consequence_confirmed'`
   (written only when a consequence was actually applied)
3. **reinterpretation created** — `action_type = 'entry_reprocessing_enqueued'`
   (written by `enqueue_entry_reprocessing` itself)

The remote smoke and pgTAP both assert exactly one of each for a confirmed
reinterpretation.

## 9. Analytics

`question_reinterpret_applied` — **boolean-by-existence**: it carries no
properties at all, so it reveals only *that* a resolution applied the bounded
reinterpretation consequence, never the question, answer, interpretation, entry,
job id, or any free text. Emitted server-side only after the RPC persisted, only
for a genuinely new (non-replayed) operation, keyed by the operation key, and
fail-open. Migration `202607230050` extends the allowlist (`CHECK`, per-event
property allowlist, and the defense-in-depth name guard) reproducing every other
branch byte-for-byte. Content-free analytics is asserted by contract tests, the
remote smoke (accept `{}`, reject any property), and pgTAP.

## 10. UI

- The **Answer and re-interpret** control appears only when the read-only effect
  preview says a reinterpretation is genuinely possible (`effect.kind ===
  "reinterpret"`, i.e. the question's interpretation is current). When the
  preview is unavailable the flow degrades to the plain answer.
- Opening the panel is a pure disclosure — no write, no enqueue, no resolution —
  and states plainly: *"Nada foi aplicado ainda. Isto só acontece se você
  confirmar." / "Nothing has been applied yet. This only happens if you
  confirm."* The user may **Confirm and re-interpret** or **Skip consequence**.
- Only the confirm button submits, and it submits `consequence=reinterpret`. The
  operation-key signature includes the consequence, so an answer-only and an
  answer-plus-reinterpret attempt can never be conflated on replay.
- On success the result copy is truthful ("Answer recorded. Re-interpretation of
  this record is queued.") and an undo hint explains that undo also cancels the
  queued re-interpretation. Focus, a polite live region, `data-consequence`
  state, ≥44 px targets, single-column mobile layout, and PT-BR/English copy are
  all covered. Desktop + Pixel 7 verified.

## 11. Verification

| Gate | Result |
| --- | --- |
| ESLint | 0 errors, 0 warnings |
| TypeScript (`tsc --noEmit`) | 0 errors |
| Vitest | **877/877 passed across 91 files** |
| Production build | Green |
| Linked migration parity | Local = remote = applied through `202607230051` |
| Linked DB lint (`--level error`) | Clean |
| Linked DB lint (`--level warning`) | Only the pre-existing `public.run_user_heartbeat` note |
| Generated types | Re-generated from the linked schema and **content-identical** |

New unit/component coverage: consequence-contract cases
(`question-resolution-contract.test.ts`), confirmed-consequence Server-Action
cases (`answer-pending-question.test.ts`), consequence-panel component cases
(`question-answer-form.test.tsx`), and the boolean-by-existence analytics
contract case (`contracts.test.ts`).

## 12. Remote evidence

`npm run test:remote:2d:reinterpretation` — **passed, 12 case groups**,
fail-closed cleanup verified (disposable users deleted, zero prefixed
users/entries remaining, pre-existing Auth users and table counts byte-identical
before and after). It proves: the closed consequence enum (unknown value and
consequence-on-non-answer both `22023`, leaving no reserved evidence);
ownership/anonymity denial; answer-with-`none` and absent-consequence apply no
reprocess job; explicit `reinterpret` records the answer and enqueues exactly one
reprocess job with three distinct audit events; replay never double-enqueues;
same-key/different-consequence is a deterministic mismatch; undo restores open,
cancels the un-claimed job, preserves the immutable interpretation, and is
idempotent; a **claimed** reprocess job is compensated as `in_progress` and never
deleted; `_v1`/`_v2` remain callable and namespace-isolated; and the
`question_reinterpret_applied` allowlist accepts only the property-free payload.

Regressions re-run green: `test:remote:2d:resolution` (28 cases),
`test:remote:2d:preview` (10 case groups), `test:remote:product-events`.

## 13. Playwright

| Journey | desktop | Pixel 7 |
| --- | --- | --- |
| Answer + re-interpret only on explicit confirmation, with undo (PT-BR) | ✅ | ✅ |
| 2D.1 answer / undo / stale (regression) | ✅ | ✅ |
| 2D.2 defer / dismiss / not-relevant (regression) | ✅ | ✅ |
| 2D.3 suggestions + read-only previews, non-mutating (regression) | ✅ | ✅ |
| English suggestion/preview chrome, English resolution/disposition copy (regression) | ✅ | ✅ |
| Needs-attention open-question surfacing (regression) | ✅ | ✅ |
| No-chips safe empty fallback (regression) | ✅ | ✅ |

The new journey asserts: the consequence control appears only when
reinterpretation is possible; opening the panel mutates nothing and shows the
"nothing applied yet" notice; skipping returns to the plain answer with no
consequence; confirming enqueues exactly one reprocess job and lands the
content-free `question_reinterpret_applied` event; undo cancels the un-claimed
job; ≥44 px confirm target and no horizontal overflow on mobile.

One pre-existing failure is unrelated and unchanged: `e2e/intelligent-capture.spec.ts:281`
(`Criar N tarefas`) fails identically on `main`, in a candidate-confirmation
surface this branch does not touch.

## 14. Independent review

Full-branch review against the Slice 2D.4 checklist (replay, consequence
correctness, interpretation history, undo, audit, ownership, stale, task graph,
analytics, localization, accessibility). One issue found and fixed on this
branch:

- **Important — lock-ordering deadlock.** `resolve_pending_question_v3` locked the
  entry row and then called `enqueue_entry_reprocessing`, which takes a
  per-(user, entry) advisory lock **before** locking the entry row; a concurrent
  manual retry (`retryProcessingJob → enqueue_entry_reprocessing`) acquires them
  in the opposite order, so the two could deadlock. PostgreSQL would abort one
  with `40P01` (a prompt, retryable error — never the gateway-hanging `40001`),
  but the deadlock is avoidable. **Fixed** in forward-only migration
  `202607230051`: for the `reinterpret` consequence the RPC now acquires the
  identical advisory lock (key matched byte-for-byte to
  `enqueue_entry_reprocessing`) **before** the entry row lock, so both paths take
  the advisory lock first and one waits instead of deadlocking. Applied to the
  linked project; generated types unchanged; the remote smoke re-ran green.

Verified clean: the consequence never runs implicitly; the enum is closed and
rejected client/server/database; reinterpretation reuses the existing path with
no new engine; history is additive and the immutable interpretation is
byte-stable across the whole cycle; undo restores pointers not history and is
idempotent; three non-duplicated audit events; content-free analytics;
`_v1`/`_v2` untouched; the `40001` gate resolved with a fail-closed structural
assertion.

## 15. Assumptions

1. **`reinterpret` is offered only for a current question.** The read-only 2D.3
   effect preview already distinguishes `reinterpret` (current) from `none`
   (superseded); the UI gates the consequence control on that, and the database
   independently rejects a stale resolution with `55P03`.
2. **Undo compensates the queued work item, not a produced revision.** Because
   `jobs` is an operational work queue (not append-only evidence), removing an
   un-claimed reprocess job is the truthful compensation; a claimed/running job is
   left intact and reported as `in_progress`. Any revision the worker already
   produced follows its own interpretation lifecycle and is never touched by undo.
3. **Consequence provenance is transactional** (unlike 2D.3's fail-open
   suggestion origin) because the `_v3` write shape now carries it — the deferred
   follow-up noted in the 2D.3 report is thereby available, though this slice
   records the consequence on audit/undo evidence and a boolean analytics event
   rather than widening telemetry.

## 16. Deferred items

- Retiring the legacy `answerPendingQuestion` wrapper and
  `resolve_pending_question_v1`/`_v2` — still explicitly out of scope.
- Chat/queue conversational surfacing and cooldown (Slice 2D.5) and convergence/
  closeout (Slice 2D.6) — await separate authorization.

## 17. Verdict

**READY WITH NON-BLOCKING NOTES.**

Slice 2D.4 is implemented, gate-verified, remotely proved, independently
reviewed, and documented. The `2C-UNDO-004` `40001` hard gate is resolved. Every
Critical and Important finding is fixed. The only outstanding failure is the
pre-existing `Criar N tarefas` e2e assertion, demonstrated to fail identically on
`main` in files this branch does not touch. The branch is local only: not pushed,
no PR, not merged, nothing deployed, and Slice 2D.5 has not been started.
