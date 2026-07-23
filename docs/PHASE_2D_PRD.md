# Phase 2D PRD — Conversational Pending Questions

## 1. Document metadata

| Field | Value |
| --- | --- |
| Phase identifier | Phase 2D |
| Title | Conversational Pending Questions |
| Status | Approved product scope; implementation not started |
| Date | 2026-07-23 (approved 2026-07-23 with the deterministic-suggestions and single-resolution-RPC adjustments) |
| Predecessor | Phase 2C — Editable Candidate Tasks and Transactional Materialization, complete through Slice 2C.6 |
| Governing roadmap | [`PHASE_2_PLAN.md`](./PHASE_2_PLAN.md) §7 (line 118–120), §16 architecture review "Perguntas que resolvem, não apenas fecham" |
| Owner | My Brain Product and Engineering |
| Implementation status | Planned only; no Phase 2D code, migration, deployment, or remote mutation exists |
| Canonical implementation plan | [`PHASE_2D_IMPLEMENTATION_PLAN.md`](./PHASE_2D_IMPLEMENTATION_PLAN.md) |
| Governing decision | ADR-033 (accepted; see [`DECISIONS.md`](./DECISIONS.md)) |

Source of truth, in order: current application code; applied and local Supabase migrations; generated database types; permanent current-state documentation; this PRD and its implementation plan. Historical Phase 2X and Phase 2C plans and reports remain evidence of their own delivery and must not be overridden or rewritten.

## 2. Executive summary

My Brain already extracts *pending questions* — the ambiguities the AI chose to preserve instead of guessing — and stores them in an owner-scoped queue. But answering one is a dead end. The current action performs a plain client-style `UPDATE` that marks the question `answered` and saves the free text. Nothing is audited, nothing can be undone, and the answer never changes anything the user can see: the interpretation, the confidence, the candidate tasks, and the daily surfaces all stay exactly as they were. This is the roadmap's Gap #5 — "question answers stop at storage instead of completing a traceable domain transition."

Phase 2D turns answering a question into a **traceable, reversible domain transition**. A pending question becomes an interactive object the user can *answer in natural language*, *answer by accepting an AI-suggested option*, or *defer / dismiss / mark not relevant* — each recorded as an auditable, undoable outcome. Before committing, the user can inspect the question's **source** (which entry and interpretation raised it) and a **predicted effect** ("if you answer this, here is what will change"). When an answer warrants it, Phase 2D applies exactly one **permitted consequence** — most importantly a bounded **reinterpretation** of the entry — and shows the visible **result**, all inside one atomic, audited, undoable operation. Finally, questions become *conversational*: they render in Chat and in the "Precisa de você" queue, and proactive surfacing respects the same **quiet-hours and cooldown** discipline the heartbeat already enforces.

Phase 2D follows Phase 2C because Phase 2C established the versioned-RPC, canonical-fingerprint, audit/undo, disposition-ledger, and fail-open analytics patterns that a question-resolution contract can now safely reuse rather than reinvent. Like Phase 2C, Phase 2D preserves the immutable interpretation as evidence: an answer never edits the AI's original question or candidate JSON in place; it produces a new, auditable resolution and — only when the user asks for it — a new interpretation revision through the existing correction/reprocessing machinery.

The first delivery, Phase 2D.1, is intentionally narrow: convert the existing free-text answer into a versioned, `SECURITY DEFINER`, owner-scoped, audited, undoable answer transition — with **no** AI, suggested answers, effect preview, reinterpretation, dispositions, or chat surfacing. Those land as later, independently reviewable slices.

## 3. Current baseline

### 3.1 Implemented foundation to preserve

- `public.pending_questions` stores one row per interpretation candidate question: `user_id`, `entry_id`, `interpretation_id`, `candidate_index`, `question`, `reason`, `confidence`, `status ∈ ('open','answered','dismissed','snoozed')`, `answer`, `snoozed_until`, `answered_at`, and timestamps, with `unique (interpretation_id, candidate_index)` and index `(user_id, status, created_at desc)`.
- `public.normalize_pending_questions()` is a trigger on `entry_interpretations` insert that materializes the immutable interpretation's `pending_questions` JSON into rows. A new interpretation revision produces new question rows; the immutable JSON is the provenance.
- `src/app/[locale]/app/questions/page.tsx` lists `status = 'open'` questions with confidence, reason, and a free-text `QuestionAnswerForm`.
- `answerPendingQuestion` (`src/features/agent/actions.ts`) validates locale + `questionId` + a 1–4000-char answer, performs an owner-scoped `UPDATE ... status='answered', answer, answered_at` guarded by `status='open'`, and emits a fail-open `question_answered_basic` product event (empty properties). It calls no RPC, writes no audit row, and registers no undo.
- The interpretation lifecycle already treats an open pending question as a Needs Attention reason: `resolveDailyCycleLifecycle` and `list_needs_attention` surface entries with open questions, and the daily-cycle projections converge Home / Caixa / Work / entry review on that state.
- Reinterpretation infrastructure exists and is owner-scoped, audited, and undoable: `correct_entry_interpretation` appends an immutable interpretation revision (conflict now `55P03`, ADR-026); `enqueue_entry_reprocessing` creates an idempotent `interpret_entry` job without changing the current interpretation; the deployed worker (`supabase/functions/process-jobs/entry.ts`) processes it; `undo_operation(p_undo_id)` compensates.
- `public.agent_preferences` carries `quiet_start`, `quiet_end`, `important_reminder_override`, and `max_followups_per_day (0–20)` — the same quiet-hours / daily-cap / override controls the deterministic heartbeat (`run_all_heartbeats`) already honors, together with its 24h cooldown and per-user lock.
- `undo_operations` (with the additive `request_fingerprint` column and `confirm-v2:`-style operation-key namespacing from Phase 2C) and `audit_logs` are the append-only operation-evidence tables; the Phase 2C `entry_task_candidate_resolutions` ledger demonstrates the narrow-ledger pattern for non-materializing outcomes.
- The private `product_events` ledger allowlists 19 daily-funnel events (contract version 1), including `question_answered_basic`, with per-event property allowlists, server/client ownership rules, per-user idempotency, and fail-open semantics.
- `src/features/chat/*` provides grounded chat (query → embedding → pgvector retrieval → structured cited response); sources enter the prompt as untrusted data, never instructions. Chat does not currently render or resolve pending questions.

### 3.2 Capabilities that do not exist

- No question resolution is audited or undoable. The current answer is a plain mutable `UPDATE` with no operation evidence.
- No versioned, `SECURITY DEFINER` question-resolution RPC exists; resolution is a direct table write from the Server Action.
- No suggested-answer options exist. The extraction schema stores `question`, `reason`, and `confidence` only — never candidate answers.
- No source view or predicted-effect preview exists. The user cannot see what answering will change before committing.
- No defer, dismiss, or "not relevant" flow exists in the application, even though `snoozed`/`dismissed` statuses and `snoozed_until` exist unused in the schema.
- Answering never triggers reinterpretation, confidence update, candidate update, or any other permitted consequence, and shows no result of the answer.
- Questions never render in Chat; they are not conversational.
- No quiet-hours / cooldown discipline governs how or when questions are proactively surfaced, because proactive surfacing does not exist.
- Stale-question safety is undefined: nothing rejects answering a question whose interpretation is no longer current.

## 4. Product goals

1. **Every question resolution is a traceable domain transition** — auditable, attributable, and reversible — not a silent status flip.
2. **Answering can visibly improve the state of the Brain** — through a bounded, user-consented reinterpretation or linked resolution — while never doing so behind the user's back.
3. **The user always sees, before committing, where a question came from and what answering it will change.**
4. **A question can be resolved without answering it** — deferred, dismissed, or marked not relevant — so the queue reflects intent, not obligation.
5. **Questions are conversational** — reachable and answerable in Chat and in the "Precisa de você" queue — while proactive surfacing respects quiet hours and cooldown.
6. **The immutable interpretation stays evidence.** Resolution never edits the AI's original question or candidate JSON in place.

## 5. Non-goals

Phase 2D does not implement:

- natural-language updates to *existing tasks* (Phase 2E);
- retroactive occurrence-date semantics or historical-review invalidation (Phase 2F);
- onboarding, scheduled review delivery, or launch-only readiness work (Phase 2F);
- push, WhatsApp, Gmail, Google Calendar, or any new outbound channel — "conversational" means in-product Chat and the queue only;
- a new analytics dashboard, aggregation service, queue, worker, scheduler, command bus, or AI provider;
- a free-form agent that can take arbitrary actions from an answer; the permitted consequences are a closed, small set;
- mutating the immutable interpretation's question/candidate JSON, or a second "question draft" source of truth;
- multi-turn conversational threading, follow-up question generation chains, or an open-ended dialog agent;
- automatically answering or auto-dismissing questions without explicit user action;
- confidence scores in the primary answering flow (confidence may inform ordering only, as today).

Phase 2D.1 additionally excludes suggested answers, source/effect preview, defer/dismiss/not-relevant dispositions, reinterpretation and every other permitted consequence, chat rendering, and cooldown/quiet-hours enforcement.

## 6. Architecture principles

1. **Resolution before consequence.** The user's resolution (answer / defer / dismiss / not relevant) is recorded first; any permitted consequence is a second, explicitly consented, atomic step within the same operation.
2. **Immutable question provenance.** Resolving never rewrites `entry_interpretations.pending_questions`, the extracted `question`/`reason`, or provider output. `pending_questions` carries the resolution *state*; the interpretation carries the *evidence*.
3. **One resolution source of truth.** A question's current resolution lives on `pending_questions` (state) plus append-only audit/undo/ledger rows (evidence). No parallel "answer draft" table or JSON column.
4. **Owner-scoped, database-owned resolution.** Authentication (`auth.uid()`), ownership, RLS, and every consequence target are enforced server-side and in PostgreSQL through a versioned `SECURITY DEFINER` RPC with `set search_path = ''`, never a plain client write.
5. **Atomic resolution + consequence + audit + undo.** State transition, permitted consequence, audit row, and undo registration succeed or fail together; invalid or conflicting input creates no partial write.
6. **Deterministic idempotency.** The same owner / operation key / canonical payload replays the same result; the same key with a different canonical payload fails — reusing the Phase 2C fingerprint pattern.
7. **Reuse the existing consequence machinery.** Reinterpretation uses the deployed `correct_entry_interpretation` / `enqueue_entry_reprocessing` / worker / `undo_operation` path. Phase 2D adds no new interpretation engine, queue, or worker.
8. **Bounded, closed permitted actions.** The set of consequences an answer may trigger is a small, explicit, database-validated enum — never an arbitrary client-supplied action.
9. **Preview is non-mutating.** Source and predicted-effect views read only; they never write, enqueue, or change lifecycle.
10. **Progressive complexity.** A traceable natural-language answer lands before suggested answers, previews, reinterpretation, and chat surfacing.
11. **Untrusted content stays data.** Question text, answer text, and interpretation content are untrusted data; in Chat and in prompts they are never treated as instructions.
12. **Analytics never controls lifecycle and never carries content.** Events observe a persisted outcome or confirmed interaction, remain fail-open, and contain no question, answer, or entity text.
13. **Deterministic surfacing.** Quiet-hours / cooldown / cap enforcement is deterministic and reuses the heartbeat's proven per-user local-time discipline; no LLM decides when to nag.
14. **Mobile, accessibility, and localization from the beginning.** Every slice ships PT-BR/English, keyboard, focus, live-region, desktop, and mobile gates.

## 7. Glossary

| Term | Definition |
| --- | --- |
| **Pending question** | An ambiguity the AI preserved during extraction, stored as a `pending_questions` row bound to one interpretation candidate. |
| **Immutable question** | The `question`/`reason`/`confidence` values inside the immutable `entry_interpretations` revision; the provenance of a pending-question row. |
| **Resolution** | The terminal or deferred outcome a user assigns to a pending question: *answered*, *deferred*, *dismissed*, or *not relevant*. |
| **Answer** | A resolution that supplies content — free-text or an accepted suggested option — recorded on `pending_questions.answer`. |
| **Suggested answer** | An AI-proposed answer option presented for one-tap acceptance; never auto-applied. |
| **Source** | The entry + interpretation + candidate a question was raised from, shown so the user understands what is being asked. |
| **Predicted effect / effect preview** | A read-only description of what a given resolution would change if committed (e.g. "will re-interpret this entry"). |
| **Permitted action / consequence** | The single bounded, closed-enum change a resolution may trigger — chiefly **reinterpretation**. |
| **Reinterpretation** | Re-running interpretation for the entry (via `enqueue_entry_reprocessing`) or appending a correction revision, incorporating the answer, through the existing owner-scoped path. |
| **Result** | The visible outcome of a committed resolution + consequence (e.g. "re-interpretation queued", "no change applied"). |
| **Defer** | A non-terminal resolution that snoozes a question until a chosen time (`status='snoozed'`, `snoozed_until`), after which it becomes open again. |
| **Dismiss** | A terminal resolution meaning "I choose not to act on this", without declaring the question wrong (`status='dismissed'`). |
| **Not relevant** | A terminal resolution meaning "this question does not apply / was not useful"; recorded distinctly from *dismiss* for truthful history, both persisted through the closed resolution enum. |
| **Stale question** | A pending question whose `interpretation_id` is no longer the entry's `current_interpretation_id`; resolving it is rejected as stale. |
| **Cooldown / quiet hours** | The deterministic per-user local-time window and rolling interval that gate proactive surfacing, reusing `agent_preferences` and heartbeat discipline. |
| **Operation key** | A client-supplied idempotency token; combined with a canonical request fingerprint to make replay deterministic. |

## 8. Personas and jobs to be done

| Persona situation | Job to be done | Expected result |
| --- | --- | --- |
| A question is easy to answer in words | Type a natural-language answer | The answer is recorded as an audited, undoable transition; the queue reflects it; nothing silently changes elsewhere |
| The AI proposed likely answers | Accept a suggested option with one tap | The chosen option is recorded exactly like a typed answer, with provenance that it was a suggestion |
| The user wants to see why they are being asked | Inspect the question's source | The originating entry/interpretation/candidate is shown read-only; no mutation occurs |
| The user wants to know the impact first | Preview the effect of answering | A read-only description of the consequence is shown before any commit |
| Answering should improve the Brain | Answer and let the entry be re-interpreted | One bounded reinterpretation is applied atomically, audited, undoable; the visible result explains what changed |
| The question is not answerable now | Defer it to later | The question snoozes until a chosen time and leaves the queue until then; the action is audited and reversible |
| The question does not apply | Mark it not relevant | The question is resolved terminally, truthfully labeled, and removed from the queue without creating any domain object |
| The user changes their mind | Undo the resolution | The exact resolution (and any consequence) is reversed; the question returns to its prior state; the reversal is audited |
| The user lives in Chat | Answer a question during a chat session | The same resolution contract runs; the queue and Chat agree on the outcome |
| It is the middle of the night | Not be nagged about open questions | Proactive surfacing respects quiet hours, cooldown, and the daily cap |

## 9. Scope by epic

### Epic 2D-A — Traceable answer transition
Convert the free-text answer into a versioned, `SECURITY DEFINER`, owner-scoped, atomic, audited, undoable resolution RPC. Preserve the immutable question; record answer content on `pending_questions` plus audit/undo evidence; enforce stale-question and idempotency safety. No AI, preview, consequence, disposition, or chat.

### Epic 2D-B — Question dispositions (defer, dismiss, not relevant)
Model the non-answer resolutions using the dormant `snoozed`/`dismissed` statuses and `snoozed_until`, plus a distinct "not relevant" outcome. Deferred questions reactivate at `snoozed_until`; dismissed / not-relevant are terminal. Owner-scoped, atomic, audited, undoable, idempotent; queue convergence.

### Epic 2D-C — Suggested answers and source/effect preview
Present suggested answer options and a read-only source view and predicted-effect preview. Suggested answers are generated **deterministically by default** from the question type and existing owned domain context — no AI extraction-schema extension. An additive, validated schema extension is a later fallback only if deterministic suggestions prove insufficient. Preview and source are strictly non-mutating.

### Epic 2D-D — Permitted action, reinterpretation, and result
Allow a resolution to trigger exactly one bounded permitted consequence — chiefly reinterpretation via the existing reprocessing/correction path — applied atomically with the resolution, audited, undoable, with a visible result. Confidence/candidate changes flow from the reinterpretation, not from Phase 2D directly.

### Epic 2D-E — Conversational surfacing and cooldown
Render pending questions in Chat and the "Precisa de você" queue, answerable/deferrable through the same resolution contract. Enforce deterministic quiet-hours / cooldown / daily-cap discipline for any proactive surfacing, reusing `agent_preferences` and heartbeat semantics.

### Epic 2D-F — Convergence and closeout
Reconcile the questions page, Chat, Needs Attention, entry review, analytics, accessibility, localization, remote evidence, traceability, reports, cleanup, and permanent documentation across all preceding slices.

## 10. Domain model and source-of-truth rules

| Concept | Lifetime | Authority |
| --- | --- | --- |
| Immutable question (interpretation JSON) | Immutable revision history | Evidence of what the AI asked; never edited in place |
| Pending-question row | Mutable state, owner-scoped | Current resolution *state* (open/answered/snoozed/dismissed) and answer content |
| Resolution audit row | Append-only | Who/what/when/effective outcome; never drives state |
| Undo operation | Stored compensating operation | Reverses one resolution (and its consequence) |
| Reinterpretation (new interpretation revision or job) | Existing interpretation lifecycle | The only durable "improvement" produced; owned by the interpretation domain, not Phase 2D |
| Effect preview | Request-time, non-persisted | Read-only projection; never a write |
| Product event | Best-effort observation | Measures interaction/outcome; never drives lifecycle or authorization |

No question-draft table, question-draft JSON column, local-storage draft, autosave endpoint, or offline draft is part of the approved Phase 2D design. `pending_questions` carries state; append-only rows carry evidence; the interpretation carries provenance.

## 11. Lifecycle and state transitions

### 11.1 Pending-question states

```
                 ┌───────────────────────── undo ──────────────────────────┐
                 v                                                          │
  (interpretation insert) ──► open ──► answered ─────────────────────────────┤ (terminal until undo)
                              │  │                                          │
                              │  ├──► snoozed ──(snoozed_until reached)──► open
                              │  │        └──────────── undo ────────────► open
                              │  ├──► dismissed ───────────────────────────┤ (terminal until undo)
                              │  └──► not_relevant* ───────────────────────┘ (terminal until undo)
                              │
                              └──(entry re-interpreted → new interpretation)─► superseded**
```

\* *not_relevant* is a distinct resolution recorded through the closed enum; whether it is a separate `status` value or an `answered`/`dismissed` sub-kind on the resolution evidence is a Slice 2D.2 implementation decision (see plan). \*\* A question tied to a no-longer-current interpretation is **stale/superseded**: it is not resolvable, and a new interpretation independently yields new question rows.

### 11.2 Allowed transitions (owner-scoped, atomic, audited)

- `open → answered` (Slice 2D.1): supply answer content; optional permitted consequence (Slice 2D.4).
- `open → snoozed` (Slice 2D.2): supply `snoozed_until`; reactivates to `open` deterministically when reached.
- `open → dismissed` / `open → not_relevant` (Slice 2D.2): terminal, no domain object created.
- `snoozed → open` (Slice 2D.2): automatic on `snoozed_until`, or via explicit undo of the defer.
- `answered|snoozed|dismissed|not_relevant → open` **only** through the operation's undo (Slice 2D.1+): direct terminal-to-terminal transitions are rejected.
- Resolving a **stale** question (interpretation no longer current) is rejected with no write.

### 11.3 Consequence lifecycle (Slice 2D.4)

- A resolution may carry at most one permitted consequence from the closed set (initially: `none`, `reinterpret`).
- `reinterpret` enqueues reprocessing (or appends a correction revision) through the existing owner-scoped path in the same transaction boundary; the resulting new interpretation follows its own lifecycle and produces its own question rows.
- Undo of a resolution with `reinterpret` reverses the resolution and compensates the consequence per the existing interpretation-undo semantics; the residual `undo_operation` SQLSTATE `40001` risk (`2C-UNDO-004`) must be resolved or proven safe before remote acceptance (see risks).

### 11.4 Entry lifecycle convergence

An entry leaves "Precisa de você" for the *pending-question* reason only when no question tied to its current interpretation remains `open`. Deferred questions leave the queue until `snoozed_until`; dismissed / not-relevant / answered questions leave terminally (until undo). Refreshing or rebuilding a projection never resurfaces a resolved question except through supported undo or a genuinely new interpretation.

## 12. Complete user flows

### 12.1 Answer a question in natural language (Slice 2D.1)
1. User opens `/questions` (or, later, Chat / the queue) and sees an open question with its reason.
2. User types an answer and submits.
3. Server Action authenticates, validates the closed command, and calls the versioned resolution RPC with an operation key.
4. RPC derives owner from `auth.uid()`, verifies ownership and that the question's interpretation is still current, records `answered` + answer + audit + undo atomically, and returns a bounded result including the undo id.
5. UI shows success, the undo control, and the queue no longer lists the question. A fail-open analytics event records the interaction with no content.
6. Replaying the same operation key + payload returns the same result; a different payload under the same key is rejected.

### 12.2 Accept a suggested answer (Slice 2D.3)
1. The question displays one or more AI-suggested options plus its source (originating entry/interpretation).
2. User taps a suggestion; the answer field is populated with the suggested text (still editable) and the option's provenance flag is set.
3. Submission runs the same resolution contract as 12.1, recording that the answer originated from a suggestion.

### 12.3 Preview the effect, then answer with reinterpretation (Slice 2D.3 + 2D.4)
1. User selects "answer and re-interpret" (or the effect panel shows the predicted consequence for the chosen answer).
2. The read-only preview describes what will change ("this entry will be re-interpreted with your answer"); nothing is written yet.
3. User confirms. The resolution RPC records `answered` **and** enqueues reinterpretation atomically, returning a result and undo id.
4. The entry enters the existing "organizing" state; when the worker finishes, a new interpretation revision (and any new questions) appears through the normal daily-cycle projections.
5. Undo reverses the answer and compensates the reinterpretation.

### 12.4 Defer a question (Slice 2D.2)
1. User chooses "defer / lembrar depois" and picks a time (or a default interval).
2. The question moves to `snoozed` with `snoozed_until`; it leaves the queue and the audit records the deferral.
3. At `snoozed_until`, deterministic logic returns it to `open`; it reappears in the queue respecting quiet hours/cooldown for any proactive surfacing.

### 12.5 Dismiss or mark not relevant (Slice 2D.2)
1. User chooses "dismiss" (chose not to act) or "not relevant" (does not apply).
2. The question moves to the corresponding terminal resolution; no task/domain object is created; history labels the outcome truthfully; undo restores it to `open`.

### 12.6 Answer inside Chat (Slice 2D.5)
1. During a chat session, an open question is surfaced as an interactive element rendered from untrusted data (never as a model instruction).
2. User answers/defers inline; the same resolution contract runs; Chat and the queue converge on the outcome.

### 12.7 Proactive surfacing respects quiet hours (Slice 2D.5)
1. Deterministic logic (heartbeat-aligned) evaluates whether to proactively surface an open/important question.
2. If the user is inside quiet hours, past the daily cap, or within cooldown, surfacing is suppressed (subject to the `important_reminder_override` rule); otherwise it surfaces once and records the surfacing time for cooldown.

## 13. Functional requirements

Every requirement below is independently testable.

### 13.1 Answering — `2D-ANSWER`
- **2D-ANSWER-001:** An open, current pending question can be answered with trimmed free text (1–4000 chars) through a versioned `SECURITY DEFINER` RPC, not a plain table write.
- **2D-ANSWER-002:** A successful answer sets `status='answered'`, persists the answer and `answered_at`, and records one audit row and one undo operation in the same transaction.
- **2D-ANSWER-003:** Answering a question whose interpretation is no longer the entry's current interpretation is rejected as stale with no write.
- **2D-ANSWER-004:** Answering a question not owned by the caller, or that is not `open`, is rejected without disclosing whether another owner's question exists.
- **2D-ANSWER-005:** The command is a closed shape (question id, answer, operation key, optional consequence/suggestion provenance in later slices); unknown keys are rejected.
- **2D-ANSWER-006:** An empty, whitespace-only, or overlong answer is rejected before any mutation and identifies the answer field.
- **2D-ANSWER-007:** The resolution never edits `entry_interpretations.pending_questions` or the immutable question/reason.

### 13.2 Dispositions — `2D-DISPOSITION`
- **2D-DISPOSITION-001:** Disposition controls (defer / dismiss / not relevant) are unavailable in Slice 2D.1.
- **2D-DISPOSITION-002:** Slice 2D.2 supports exactly these non-answer resolutions: `deferred` (snoozed), `dismissed`, `not_relevant`; each is owner-scoped, atomic, audited, and undoable.
- **2D-DISPOSITION-003:** `deferred` sets `status='snoozed'` and a validated future `snoozed_until`; the question leaves actionable projections until that instant, then returns to `open`.
- **2D-DISPOSITION-004:** `dismissed` and `not_relevant` are terminal (until undo), create no task or other domain object, and are labeled distinctly in history.
- **2D-DISPOSITION-005:** Only `open → answered|snoozed|dismissed|not_relevant` and the automatic `snoozed → open` are permitted; direct terminal-to-terminal transitions are rejected.
- **2D-DISPOSITION-006:** A resolution stores only the narrow decision/provenance needed for lifecycle; it never duplicates question or entry content.

### 13.3 Suggested answers and preview — `2D-SUGGEST`
- **2D-SUGGEST-001:** Suggested answers and preview are unavailable before Slice 2D.3.
- **2D-SUGGEST-002:** Suggested answer options are bounded and closed, generated deterministically by default from the question type and existing owned domain context (never free-form model output injected as instructions); an additive validated extraction-schema field is a later fallback only if deterministic suggestions prove insufficient.
- **2D-SUGGEST-003:** Accepting a suggestion populates the editable answer and records that the answer originated from a suggestion; it never auto-submits.
- **2D-SUGGEST-004:** The source view is read-only and shows the originating entry/interpretation/candidate without exposing raw database rows to the component.
- **2D-SUGGEST-005:** The predicted-effect preview is read-only, performs no write/enqueue, and accurately names the consequence that a commit would apply.

### 13.4 Permitted action and result — `2D-ACTION`
- **2D-ACTION-001:** Permitted consequences are unavailable before Slice 2D.4.
- **2D-ACTION-002:** A resolution may carry at most one consequence from a closed database-validated enum (initially `none`, `reinterpret`).
- **2D-ACTION-003:** `reinterpret` applies through the existing owner-scoped `enqueue_entry_reprocessing`/correction path atomically with the resolution; Phase 2D adds no new interpretation engine, queue, or worker.
- **2D-ACTION-004:** The consequence is idempotent per operation key and never double-applies on replay or concurrency.
- **2D-ACTION-005:** The committed result is surfaced to the user (e.g. "re-interpretation queued", "no change applied") without exposing internal job/interpretation identifiers as instructions.
- **2D-ACTION-006:** Undo reverses the resolution and compensates the consequence; the residual `undo_operation` `40001` risk is resolved or proven safe before remote acceptance.

### 13.5 Surfacing and cooldown — `2D-SURFACE` / `2D-COOLDOWN`
- **2D-SURFACE-001:** Chat renders open pending questions as interactive elements built from untrusted data; question/answer text is never treated as a model instruction.
- **2D-SURFACE-002:** Answering/deferring from Chat and from the queue use the identical resolution contract and converge on the same state.
- **2D-SURFACE-003:** The "Precisa de você" queue and the questions page agree on which questions are actionable after any resolution.
- **2D-COOLDOWN-001:** Any proactive surfacing is deterministic (no LLM decides timing) and respects the user's local quiet hours, `max_followups_per_day` cap, and rolling cooldown, honoring `important_reminder_override`.
- **2D-COOLDOWN-002:** Cooldown/quiet-hours evaluation is per-user, timezone-aware, and one user's failure never blocks the batch, matching heartbeat guarantees.

### 13.6 Provenance — `2D-PROVENANCE`
- **2D-PROVENANCE-001:** Every resolution audit row identifies the question id, interpretation id, resolution kind, consequence, and effective-value fingerprint without becoming state.
- **2D-PROVENANCE-002:** A suggestion-originated answer records the suggestion provenance distinctly from a typed answer.
- **2D-PROVENANCE-003:** The immutable interpretation remains the sole provenance of the question text; resolution rows never copy it beyond the minimum needed for support.

### 13.7 Idempotency — `2D-IDEMPOTENCY`
- **2D-IDEMPOTENCY-001:** The server and database derive a canonical, owner-independent request fingerprint (reusing the Phase 2C fingerprint pattern).
- **2D-IDEMPOTENCY-002:** Replaying the same operation key + canonical payload returns the original result and undo id.
- **2D-IDEMPOTENCY-003:** Reusing the operation key with a different question, resolution, answer, or consequence fails deterministically.
- **2D-IDEMPOTENCY-004:** Two concurrent resolutions of the same question cannot both apply; exactly one wins and the other reports a deterministic conflict.

### 13.8 Ownership and security — `2D-OWNERSHIP`
- **2D-OWNERSHIP-001:** The authenticated owner is derived from `auth.uid()`; no client-controlled owner id is accepted.
- **2D-OWNERSHIP-002:** Question, interpretation, entry, consequence target, audit row, and undo row all belong to the same owner.
- **2D-OWNERSHIP-003:** Anonymous and cross-owner calls are denied without revealing whether another owner's question or entry exists.
- **2D-OWNERSHIP-004:** The RPC accepts a closed JSON shape, rejects unknown keys at every level, uses a safe explicit `search_path`, least-privilege grants (execute to `authenticated` only; revoke `public`/`anon`), qualified references, and no dynamic SQL.

### 13.9 Undo — `2D-UNDO`
- **2D-UNDO-001:** A successful resolution creates one available undo operation in the same transaction.
- **2D-UNDO-002:** Undo restores the question to its exact prior state (`open`, cleared answer/snooze as applicable), records immutable audit evidence, and is idempotent.
- **2D-UNDO-003:** Undo of a resolution with a `reinterpret` consequence compensates the reinterpretation through the existing interpretation-undo semantics and never resurrects or edits a later interpretation revision arbitrarily.
- **2D-UNDO-004:** Undo never rewrites the immutable question and never silently changes an unrelated question or entry.

### 13.10 UX, localization, accessibility — `2D-UX` / `2D-I18N` / `2D-A11Y`
- **2D-UX-001:** Open, editing, pending, success, deferred, terminal, conflict, and retryable-failure states each have distinct visible states.
- **2D-UX-002:** The primary answering flow never renders a raw confidence score or internal state name.
- **2D-UX-003:** The flow is usable without horizontal scrolling at the Pixel 7 viewport.
- **2D-I18N-001:** Every new label, hint, error, status, suggested-answer chrome, and action has reviewed PT-BR and English copy.
- **2D-I18N-002:** Deferral times and any dates render with locale plus the persisted profile timezone.
- **2D-A11Y-001:** Every control has a programmatic label; errors associate with fields; aggregate failure focuses an error summary.
- **2D-A11Y-002:** Pending and successful results use appropriate live regions; focus returns predictably after answer, defer, conflict, and undo.
- **2D-A11Y-003:** Pointer targets remain at least 44×44 CSS px; the full flow is keyboard-operable, including suggested-answer chips and the chat surface.

### 13.11 Analytics — `2D-ANALYTICS`
- **2D-ANALYTICS-001:** Product events contain no question text, answer text, reason, entity names, or free text.
- **2D-ANALYTICS-002:** New events are closed, narrow, allowlisted, and fail-open; they observe a persisted outcome or confirmed interaction only.
- **2D-ANALYTICS-003:** Resolution-kind granularity is permitted only where it cannot reveal content (e.g. a bounded enum of `answered|deferred|dismissed|not_relevant`), decided as a privacy boundary per Slice 2D.2/2D.6; consequence application may record a boolean/count only.

### 13.12 Operations — `2D-OPERATIONS`
- **2D-OPERATIONS-001:** Every schema change is append-only; generated types are refreshed from the linked schema; local/remote migration parity is proved.
- **2D-OPERATIONS-002:** Reinterpretation reuses the deployed worker/dispatch; any Edge Function, cron, secret, Auth, email, or provider change requires explicit separate authorization and is out of scope for Slices 2D.1–2D.2.
- **2D-OPERATIONS-003:** Slice 2D.3 generates suggested answers deterministically with no extraction-schema or worker change; if a later fallback introduces an AI schema field, it is additive, validated with Zod and Structured Outputs, and never breaks existing interpretation persistence.

## 14. Permissions model

| Actor | May | May not |
| --- | --- | --- |
| Authenticated owner | Resolve (answer/defer/dismiss/not relevant) their own open, current questions; preview source/effect; trigger a permitted consequence on their own entry; undo their own resolution | Resolve another owner's question; resolve a stale/superseded question; supply an owner id; trigger an arbitrary action |
| Anonymous / unauthenticated | Nothing | Any resolution, preview, or read of question data |
| `service_role` (worker) | Produce new interpretations/questions through existing gated interpretation RPCs | Resolve questions on a user's behalf; write resolution audit/undo as if the user acted |
| Server Action boundary | Authenticate, validate the closed command, convert local times, call the versioned RPC, map errors to stable localized codes, emit fail-open analytics | Forward raw SQL/provider text, bypass the RPC, or perform a plain resolution `UPDATE` |
| Database RPC (`SECURITY DEFINER`) | Own identity/locking/validation/atomic resolution/consequence/audit/undo | Accept a client owner id, run dynamic SQL, or write outside the least-privilege grant/`search_path=''` boundary |

RLS remains enabled and forced on `pending_questions`; the `SECURITY DEFINER` RPC still performs explicit owner predicates. Ownership is validated before any question data, resolution evidence, or conflict detail is returned.

## 15. Undo model

- Every resolution — answer, defer, dismiss, not relevant — registers exactly one undo operation in the same transaction, reusing the existing `undo_operations` table, `request_fingerprint`, a single resolution operation-key namespace (e.g. `resolve-v1:`), and the `undo_operation(p_undo_id)` compensation contract. All resolution kinds flow through one long-lived versioned RPC family (`resolve_pending_question_vN`), not separate answer/disposition RPCs.
- Undo restores the question's exact prior state: `answered → open` clears the answer/`answered_at`; `snoozed → open` clears `snoozed_until`; `dismissed`/`not_relevant → open`. It records immutable audit evidence and is idempotent (a second undo of the same operation is a no-op success).
- For a resolution that also applied `reinterpret`, undo compensates the reinterpretation through the existing interpretation/reprocessing undo path. Because that path currently contains the unresolved `undo_operation` SQLSTATE `40001` residual risk (`2C-UNDO-004`), Slice 2D.4 must resolve it (forward-fix to `55P03`, mirroring ADR-026) or prove it safe before remote acceptance — this is a hard gate, not a follow-up.
- Undo never rewrites the immutable question JSON, never edits or resurrects a later interpretation revision arbitrarily, and never touches an unrelated question or entry.
- No new undo architecture is introduced. If a non-answer disposition or a reinterpretation consequence cannot be represented by the existing undo system, Slice 2D.2/2D.4 must stop and document the exact incompatibility before inventing a parallel undo mechanism.

## 16. Security model

- `auth.uid()` is the only caller identity; the owner id never appears in public RPC arguments.
- Every resolution flows through one long-lived versioned `SECURITY DEFINER` RPC family (`resolve_pending_question_vN`) with `set search_path = ''`, qualified `public.*`/`extensions.*` references, least-privilege grants (execute to `authenticated`, revoke `public`/`anon`), no dynamic SQL, and RLS intact on `pending_questions`. A new version is added only when the closed input shape must change; separate answer/disposition RPC families are not created unless a future contract genuinely requires separation.
- Ownership is validated before candidate data, resolution evidence, or conflict detail is returned; cross-owner probing cannot distinguish "not owned" from "does not exist".
- The command JSON is closed at every level, bounded in count and length, and rejects unknown keys.
- Stale-question, concurrency, idempotency-mismatch, and reinterpretation-race paths are database-tested and remotely exercised as an authenticated user.
- Question text, answer text, and interpretation content are untrusted data. In Chat and in any prompt, they are inserted as data, never as instructions; suggested answers are bounded/closed and cannot smuggle model directives into the resolution path.
- Raw SQL errors, provider output, secrets, and internal policy/confidence/state names are never rendered in the primary flow.
- The reinterpretation consequence reuses already-authorized worker/dispatch security; Phase 2D introduces no new secret, cron, or Edge Function in Slices 2D.1–2D.2.

## 17. Privacy requirements

- The private `product_events` ledger's existing rules apply unchanged: allowlisted event names, per-event property allowlists, owner RLS, per-user idempotency, synthetic-test marking, server/client boundary, 180-day retention, and fail-open behavior.
- No event or property may contain question text, answer text, reason, suggested-answer text, entity/person/project names, provider output, secrets, or any free text.
- Resolution-kind counts (`answered|deferred|dismissed|not_relevant`) are a bounded enum that reveals *that* a resolution happened, not its content; they may be recorded only if approved as a privacy-safe granularity in Slice 2D.2/2D.6. Consequence application records a boolean/count only.
- Effect previews and source views are computed server-side from owner-scoped data and returned as bounded DTOs; they never expose another owner's data and never persist a preview.
- Answer content persists only on `pending_questions.answer` (as today) and in the minimum audit fingerprint needed for support — never in analytics.

## 18. Analytics philosophy

Phase 2D uses the existing private product-event ledger and its server/client ownership rules. It prefers **reusing** the existing `question_answered_basic` event and adds new events only where a distinct, privacy-safe, countable interaction genuinely exists.

| Event (candidate) | Meaning | Allowed properties | Idempotency/repeat |
| --- | --- | --- | --- |
| `question_answered_basic` (existing) | A question was answered | none (or a bounded `origin: typed\|suggested` if approved) | Deterministic per resolution operation key |
| `question_resolved` (proposed, 2D.2) | A question reached a non-answer resolution | bounded `kind: deferred\|dismissed\|not_relevant` only | Deterministic per operation key |
| `question_effect_previewed` (proposed, 2D.3) | User opened the effect/source preview | none | Best-effort, session-deduplicated |
| `question_reinterpret_applied` (proposed, 2D.4) | A resolution applied the reinterpret consequence | none (boolean-by-existence) | Deterministic per operation key |

No separate analytics dashboard, aggregation job, queue, or lifecycle dependency is introduced. Invalid analytics payloads are rejected by the allowlist; unavailable telemetry remains fail-open and never changes a resolution result. Analytics never gates or drives lifecycle, surfacing, or authorization.

## 19. Acceptance criteria grouped by feature family

### 19.1 By epic
- **Epic 2D-A:** All `2D-ANSWER`, `2D-PROVENANCE`, `2D-IDEMPOTENCY`, `2D-OWNERSHIP`, and `2D-UNDO` requirements pass locally, in database contracts, in disposable remote smoke, and in authenticated desktop/mobile journeys; the plain-`UPDATE` answer path is fully replaced by the versioned RPC with the legacy behavior preserved only until cutover.
- **Epic 2D-B:** Every open question can move atomically to exactly one of `deferred|dismissed|not_relevant`, with deterministic snooze reactivation, terminal semantics, truthful history, queue convergence, undo to `open`, and no content duplication or content analytics.
- **Epic 2D-C:** Suggested answers are bounded/closed and never auto-apply; source and effect previews are read-only and accurate; any extraction-schema extension is additive and validated with no regression to interpretation persistence.
- **Epic 2D-D:** A resolution can apply exactly one bounded consequence (`reinterpret`) atomically and idempotently through the existing path, show a truthful result, and be fully undone — with the `undo_operation` `40001` risk resolved/proven before remote acceptance.
- **Epic 2D-E:** Questions render and resolve identically in Chat and the queue as untrusted-data elements; proactive surfacing is deterministic and honors quiet hours, cap, cooldown, and override, per-user and failure-isolated.
- **Epic 2D-F:** The questions page, Chat, Needs Attention, review, analytics, accessibility, localization, remote gates, cleanup, reports, traceability, and permanent documentation agree on the completed behavior.

### 19.2 Global gates
- **Security:** authenticated ownership, RLS/grants, cross-owner denial, closed JSON, stale/replay/concurrency safety, untrusted-data prompt boundary, and no content telemetry pass.
- **Accessibility/localization:** WCAG-oriented labels, focus, live regions, target size, responsive layout, PT-BR/English, and timezone copy pass, including the chat surface and suggested-answer chips.
- **Rollback:** the legacy answer path remains callable during rollout; UI can be restored without reverting an additive migration.
- **Observability:** content-free resolution events are allowlisted, idempotent as specified, and fail-open.
- **Documentation/traceability:** each requirement maps to a slice, test/evidence owner, and closeout report.

### 19.3 Definition of Done for Phase 2D
Phase 2D is complete only when: Slices 2D.1–2D.6 are implemented and independently reviewed; code, applied migrations, generated types, linked schema, and documented contracts agree; migrations are append-only and synchronized; focused and full Vitest, ESLint, TypeScript, and production build gates pass; structural/behavioral database tests pass in pgTAP or the approved equivalent (denial, stale, concurrency, idempotency, undo, reinterpretation compensation); disposable authenticated remote smokes pass with fail-closed cleanup; authenticated Playwright passes desktop and mobile in PT-BR and English, including Chat and queue surfaces; keyboard/focus/live-regions/target-size/responsive/timezone behavior pass; product-event privacy, allowlists, idempotency, and fail-open behavior pass; no disposable fixture remains; permanent state, backlog, decisions, changelog, and architecture/database/security/AI references (where applicable) are current; every PRD requirement maps to implementation and executed evidence; independent product and database/security reviews find no unresolved critical/important issue; and no historical Phase 2X/2C evidence is rewritten.

## 20. Risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Reinterpretation undo hits `undo_operation` `40001` | Undo hangs the gateway (known platform behavior) | Resolve the `2C-UNDO-004` residual (forward-fix to `55P03`, mirror ADR-026) or prove safe **before** 2D.4 remote acceptance; hard gate |
| Reinterpretation loop | Answer → new interpretation → new questions → answer → … unbounded | Consequence is user-initiated only, idempotent per operation key, and bounded by the existing reprocessing dedupe; no auto-answer exists |
| Stale/superseded question answered | Answer applied to an obsolete interpretation | Reject resolution unless the question's interpretation is current under an owner lock; new interpretation yields new question rows |
| Prompt injection via question/answer in Chat | Model treats content as instruction | Render/insert question and answer strictly as untrusted data; suggested answers are bounded/closed; reuse the existing chat data-not-instructions boundary |
| Deterministic suggestions insufficient for some question types | Weak or empty suggestions | Deterministic derivation by default with a safe empty fallback; only if proven insufficient, add an additive/optional/validated AI schema field in a later, separately authorized step |
| Content leaking into analytics | Privacy violation | Closed allowlist, bounded enums/counts only, no free text; reuse existing ledger validators; fail-open |
| Concurrent resolution of one question | Double resolution / duplicate undo | Owner lock + operation fingerprint + unique operation key; one winner, deterministic conflict for the loser |
| Dormant column semantics (`snoozed_until`) misused | Deferral behaves inconsistently | Define snooze reactivation deterministically (heartbeat-aligned), test reactivation and quiet-hours interplay |
| Chat surface scope creep | A general dialog agent instead of question resolution | Keep Chat rendering to interactive question elements + the existing resolution contract; no multi-turn agent, no follow-up generation |
| Proactive surfacing annoyance | Nagging during quiet hours | Deterministic quiet-hours/cap/cooldown reuse of heartbeat discipline; `important_reminder_override` respected; per-user failure isolation |
| RPC/schema compatibility during rollout | Old UI breaks | Additive migration + versioned RPC; deploy migration before UI cutover; legacy path callable until proven |
| Untested pgTAP environment | Structural regressions escape local gate | Keep pgTAP committed; run in Docker/CI when available; require equivalent linked remote behavior meanwhile |

## 21. Rollout and rollback strategy

1. Implement and locally test each slice's additive migration and versioned RPC while the legacy answer path remains callable.
2. Apply migrations only after explicit remote authorization; regenerate linked types; run focused pgTAP/equivalent contracts plus disposable authenticated remote smoke with fail-closed cleanup.
3. Cut the UI/Server Action to the new RPC only after the linked contract passes; preserve the legacy path for rollback.
4. Run focused Vitest, full local gates, queue/review/Chat regression, and authenticated desktop/mobile PT-BR/English Playwright.
5. Correct database defects with forward-only migrations; never edit or delete an applied migration.
6. Reinterpretation deployment reuses the existing worker/dispatch; any new Edge Function/cron/secret requires separate authorization and is out of scope for 2D.1–2D.2.
7. Consider retiring the legacy answer path only in a separately authorized later step after search, deployed-client compatibility, and rollback review prove it has no consumer.

## 22. Product decisions (confirmed at approval, 2026-07-23)

1. **Single resolution RPC family.** All resolution kinds (answer, defer, dismiss, not relevant, and later a permitted consequence) flow through one long-lived versioned RPC family, `resolve_pending_question_vN`, versioned only when the closed input shape must change. Separate answer/disposition RPC families are **not** created unless a future contract genuinely requires separation.
2. **Deterministic suggested answers by default.** Suggested answers are generated deterministically from the question type and existing owned domain context, with **no** AI extraction-schema extension. An additive, validated schema field is a later fallback only if deterministic suggestions prove insufficient.
3. **`not_relevant` representation.** Reuse the existing `dismissed` status plus a distinct resolution-kind on the evidence row, avoiding a status-enum `CHECK` migration (see ADR-033). Promote to a first-class status only if product later requires it.
4. **Pull-based surfacing.** Proactive question surfacing is queue/Chat-pull only, gated by the deterministic cooldown/quiet-hours module; no new outbound channel (push/email) is added in Phase 2D.
