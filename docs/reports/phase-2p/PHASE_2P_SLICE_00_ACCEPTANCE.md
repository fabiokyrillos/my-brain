# Phase 2P — Slice 2P.0 acceptance record

**Measure the two broken loops, census the capture surfaces, and firm the
contracts the later slices spend.**

- **Authorization:** implementation through closeout, **ADR-122** (2026-08-18),
  over the package ADR-121 authorized and the twelve decisions it signed.
- **Requirements:** `2P-FOUNDATION-001` … `-007` (7 of 87).
- **Migrations:** **none created, none spent.** 97 local = 97 hosted, parity
  `202608160097`, unchanged by this slice.
- **Baseline:** `main` `6a7bf21`, worktree clean, no open PR, CI green on the
  exact merge SHA `6a7bf21` (three jobs, all `success`), rollout gate **25 pass ·
  3 fail · 2 owner-signature**, signup closed.
- **Product behaviour changed: none.** No Server Action, RPC, policy, schema,
  route, copy string or rendered control is altered by this slice.

---

## 1. The baseline divergence, recorded before anything was edited

The package (PRD, plan, current-experience audit, handoff §88) names baseline
`main` `27f9f77`. `main` is `6a7bf21`.

**This is not drift.** `27f9f77` is an ancestor of `6a7bf21`, and the five
commits between them are the planning package itself (PR #253). The complete
product-code delta is three files:

| File | Nature |
|---|---|
| `src/lib/closeout/phase-2f-documentation.test.ts` | guard |
| `src/lib/closeout/phase-2o-declarations.test.ts` | guard (the A13 pin §88 repaired) |
| `src/lib/closeout/phase-2p-declarations.test.ts` | guard (new) |

**Zero product surfaces moved.** Every finding in
`PHASE_2P_CURRENT_EXPERIENCE_AUDIT.md` still describes the tree it was written
against. The baseline lines in the governing pair are corrected to `6a7bf21` by
this slice so that later re-audits compare against a commit that exists on
`main`.

---

## 2. `2P-FOUNDATION-001` — the Conversation failure, classified

**Classification: the failure is not in producing the answer. It is that no
failure of this path is recorded anywhere, so the generic boundary is the only
artifact it can produce.**

### 2.1 The provider path works, and the hosted record proves it

Read live, owner-scoped, content-free (counts and shapes only):

| Fact | Value |
|---|---|
| conversations | 2 |
| `role='user'` messages | 2 |
| `role='assistant'` messages | 2 |
| `audit_logs` `chat_answered` | 2 |
| `ai_usage_events` `operation='chat'` | 2 |
| latest assistant message | 2026-08-17 13:27:42Z |
| citation envelope keys, both assistant rows | `evidence`, `explanation`, `reach`, `sources`, `v` |

Every question produced an answer, an audit row, a usage row and a well-formed
citations envelope. `sendChatMessage` reached its `redirect()` on both turns.
**No repair is needed in the grounded-answer path itself.**

### 2.2 The failing boundary

Three findings, each reproduced against the code on `6a7bf21`.

**F-1 — an unknown fault throws out of the Server Action.**
`src/features/task-commands/actions.ts:290` — `if (!known) throw error;`. The
module's own header states property 4: *"Nothing throws out of a Server
Action."* `guard()` upholds that for four declared error classes and **rethrows
everything else**. The default Conversation route runs `runTaskCommand` *before*
the knowledge path (`assistant/actions.ts`, the fallthrough contract), so an
undeclared fault anywhere under the command pipeline escapes `runAssistantTurn`
and lands on the app error boundary. This is the mechanism that renders the
generic screen.

**F-2 — the error boundary records nothing, and says so with a stale claim.**
`src/app/[locale]/app/error.tsx:20` states *"There is no error sink in this
product yet (H7 remains open in docs/TODO.md)."* The sink shipped in Phase 2H
(`202608070080`, table `public.error_events`). The comment has been false since
that migration. Worse than stale: the boundary's only record is a
`console.error` inside `useEffect`, which is a **Client Component** — it reaches
the browser console and no server log. In production Next replaces
`error.message`, so the digest on screen is the entire durable artifact.

**F-3 — the chat path has no sink producer.**
`recordErrorEvent` has exactly **one** production call site in the repository:
`src/features/rate-limits/server.ts:76`. `sendChatMessage`'s `catch` writes a
`console.error` and returns a localized sentence; it never records. Hosted
`public.error_events` holds **1 row, dated 2026-08-07** — a Phase 2H artifact.
No Conversation failure has ever been recorded.

### 2.3 What this settles for slice 2P.2

`2P-CHAT-003` ("no generic boundary is the only evidence for a known
conversation failure") is **currently false in the product**, and F-1/F-2/F-3
are its three causes. `2P-CHAT-001`'s "root cause" is therefore F-1, not a
provider defect — and the repair is a declared refusal plus a recorded reason,
not a change to retrieval or to the model call.

**No provider call was made and no BYOK credential was spent to reach this
classification.** All of it is static reading plus content-free hosted counts.

---

## 3. `2P-FOUNDATION-002` — the capture → Needs You cycle, measured

**Classification: the entry's lifecycle status is derived from the
interpretation at three moments and never from the owner resolving what the
interpretation asked for.**

### 3.1 The derivation

`public.interpretation_lifecycle_status(p_pending_questions, p_element_trust,
p_record_only)` — `IMMUTABLE`, reads only the interpretation's own JSON:

| Condition | Result |
|---|---|
| any pending question | `partially_processed` |
| record-only | `completed` |
| any `element_trust` policy in (`request_review`, `block_until_confirmation`) | `awaiting_review` |
| otherwise | `completed` |

### 3.2 Who calls it, and who does not

Read live from `pg_proc` on the hosted database.

**Re-derives the lifecycle (3):**

| Function | When |
|---|---|
| `persist_entry_interpretation` | worker persists the first interpretation |
| `persist_reprocessed_entry_interpretation` | worker persists a reinterpretation |
| `correct_entry_interpretation` | the owner corrects the interpretation |

**Records the owner's resolution and never touches `entries` nor re-derives (9):**

| Function |
|---|
| `confirm_entry_task_candidates` |
| `confirm_entry_task_candidates_v2` … `_v6` |
| `confirm_entry_tasks` |
| `record_entry_task_candidate_confirmation` |
| `resolve_pending_question_v1` / `_v2` / `_v3` |
| `resolve_entry_person_candidates` |

### 3.3 Why a fully resolved entry never leaves

The live `public.list_needs_attention` resolves its reason with:

```
when f.entry_status in ('awaiting_review', 'partially_processed')
  then 'review_interpretation'
```

— **unconditional on the status**, evaluated before the finer predicates for
open questions and unconfirmed candidates. So an entry parked in
`awaiting_review` returns `review_interpretation` forever, no matter how much of
it the owner has resolved, because nothing recomputes the status that puts it
there.

The finer predicates below it are correct and already derive from all
unresolved classes (`has_open_question`, `has_unconfirmed_candidate`,
`record_only`, `candidate_count`) — they are simply **unreachable** for an entry
whose status never changes.

### 3.4 What this settles for slice 2P.1

`2P-ATTENTION-002` ("confirmation resolves the entry lifecycle, not only the
visible form state") names this defect exactly. The correction is
**re-derivation on resolution**, not a new terminal-state override — and the
finer predicates already in `list_needs_attention` mean no projection change is
needed once the status can move.

**This requires a migration**, and migration 098 is not it (§4). That is a stop
condition, raised in §8.

---

## 4. `2P-FOUNDATION-003` — re-audit of `codex/fix-needs-attention-confirmation`

**Verdict: partially reusable. The diagnosis and the UI affordance are
reusable. The migration is not correct and is not copied forward.**

Branch head `2bfbe91`, still absent from `main` and from the hosted chain.
Carries `supabase/migrations/202608170098_confirm_entry_interpretation.sql`
plus the inbox page, the revision editor and `database.types.ts`.

### What is correct

| Property | Evidence |
|---|---|
| conflict code | `55P03`, **not** `40001` — matches the standing rule that `40001` hangs the gateway |
| definer hygiene | `security definer`, `set search_path = ''`, every reference schema-qualified |
| least privilege | `revoke all … from public, anon`, `grant execute … to authenticated` |
| concurrency | `select … for update` on the owned row before any decision |
| ownership | `where id = p_entry_id and user_id = current_user_id`, `auth.uid()` checked non-null |
| optimistic concurrency | refuses when `current_interpretation_id` moved |
| replay | a second call on a `completed` entry returns `idempotent: true` |

### Why it is not correct

| # | Defect | Requirement it breaks |
|---|---|---|
| 1 | Accepts **only** `awaiting_review`. An entry in `partially_processed` whose questions are all answered still cannot leave the queue. | `2P-ATTENTION-001`, `-002` |
| 2 | **Registers no undo.** The product has an `undo_operation` handler registry (migration `052`); this operation is absent from it, so confirmation cannot be reversed. | `2P-ATTENTION-007` |
| 3 | It is a **manual override, not a re-derivation**: it forces `completed` while `element_trust` may still demand review, instead of making the status follow from the resolved facts. | `2P-ATTENTION-001`, threat `T-10` |
| 4 | `entity_id` is left **null** in the audit row. The row describes an entry and does not point at it (only `source_entry_id` does). | `2P-ATTENTION-006` |
| 5 | `reason` carries `'operation:' \|\| p_operation_key` — the human-readable audit reason used as an idempotency marker. | audit legibility |
| 6 | Emits no `attention_item_resolved`, although that name is in the **deployed** `product_events` vocabulary. | `2P-FOUNDATION-005` |

Defects 1 and 2 alone make it unable to satisfy `2P-ATTENTION-001…008`. Under
the owner's condition — *apply 098 only if the re-audit proves it still
correct* — **it does not pass, and it is not applied.**

**Reusable from the branch:** the diagnosis (there is no positive resolution
path), and the shape of the inbox affordance. Neither is a migration.

---

## 5. `2P-FOUNDATION-004` — capture surface census

Every surface that can begin a capture, and what each mounts.

| Surface | Component | Write path | Draft store |
|---|---|---|---|
| `/{locale}/app` (Today) | `QuickCaptureForm` via `HomeDashboard:276` | `captureEntry` → `capture_entry_async` | `sessionStorage`, key `draftKey("home")` |
| `/{locale}/app/capture`, text | `QuickCaptureForm` via `CaptureModeReporter` | `captureEntry` → `capture_entry_async` | `sessionStorage`, key `draftKey("capture_page")` |
| `/{locale}/app/capture`, file | `UploadForm` | `uploadAttachment` → `process_attachment` job | none |
| `/{locale}/app/capture`, voice | `VoiceComposer` | `transcribeRecording`, then `captureEntry` | none; audio memory-only |
| `/{locale}/app/chat`, `/chat/{id}` | `AssistantComposer` | `captureEntry` on the `capture_intent` route only | none |

**Proved properties**

- **Exactly one caller creates an entry.** `.rpc("capture_entry_async")` appears
  in exactly one non-test file: `src/features/capture/actions.ts`. Held by
  `capture-write-path-guard.test.ts`, which was written against planted
  violations before the unified surface existed.
- **`enqueue_entry_reprocessing` has two named callers** —
  `features/interpretations/actions.ts` and `features/byok/actions.ts`. Neither
  creates an entry.
- **One draft module.** `composer-draft.ts` is imported by exactly one
  component, `quick-capture-form.tsx`. It uses `sessionStorage`, never
  `localStorage`, and stores text only.
- **`UnifiedCapture` declares no `"use server"`, imports no action module and
  touches no Supabase client.** Both actions arrive as props. The only
  occurrence of `use server` in that file is inside the comment that explains
  the rule.
- **Two `captureSource` values exist**: `home`, `capture_page`. The assistant
  route passes `composer`.

**Consequence for slice 2P.3:** Today and Capture already submit through the
same action with the same draft contract. Unifying the surface is a *component*
change; it needs no new write path, and `T-1` is already guarded.

---

## 6. `2P-FOUNDATION-005` — content-free telemetry, established without a migration

The four classes the requirement names, each mapped onto a **deployed**
vocabulary read live from the hosted check constraints.

| Class | Home | Deployed vocabulary | Migration |
|---|---|---|---|
| failure class | `public.error_events` | `surface` (5), `operation` (16, incl. `chat_answer`, `embed_text`, `capture_entry`, `interpret_entry`), `reason` (14) | **none** |
| queue reason | `public.product_events` | `attention_item_resolved`, `needs_attention_viewed`, `needs_attention_item_opened`, plus `properties` jsonb (object, ≤ 4096 bytes) | **none** |
| automation decision | `public.audit_logs` | `actor` ∈ (`user`,`agent`,`system`); **`action_type` carries no check constraint** | **none** |
| undo outcome | `public.audit_logs` + the `undo_operation` registry | same | **none** |

`2P-CHAT-002` needs five distinguishable failure classes. All five already exist
in the deployed `error_events_reason_check`:

| Failure | Deployed reason |
|---|---|
| credential | `permission_denied`, `lifecycle_blocked` |
| quota | `quota_exceeded`, `throttled` |
| retrieval | `database_error`, `not_found` |
| provider | `provider_error`, `provider_rate_limited` |
| temporary | `provider_timeout`, `timeout` |

`error_events` has **no free-text column** — surface, operation and reason are
closed vocabularies and the row carries a correlation id and a user id. Content
cannot travel through it by construction.

**The vocabulary was built for this and never wired to the chat path.** What is
missing is a producer, not a schema. Slice 2P.2 adds the producer; no migration
is required to do it.

**One gap named honestly:** `product_events` has no event name meaning "the
agent decided to write automatically". Routing automation decisions through
`audit_logs` (unconstrained `action_type`, `actor='agent'`, `before_state`/
`after_state`, `reason`) covers `2P-AUTONOMY-009` without a migration. If slice
2P.4 later needs a *product analytics* funnel for automation rather than an
audit trail, that is a new deployed vocabulary value and therefore a stop
condition.

---

## 7. `2P-FOUNDATION-006` — inherited residuals, recorded and not promoted

Carried forward from the Phase 2O closing report unchanged. **None is claimed,
closed, re-measured or absorbed by Phase 2P.**

| Residual | State |
|---|---|
| real-device VoiceOver session | **NOT EXECUTED.** Script at `PHASE_2O_SCREEN_READER_SCRIPT.md`. ADR-118 Decision 8 forbids promotion by documentation, emulator, automated scan or inference. |
| Apple Web Push HTTP 403 on a real iPhone | live; Android **never executed** |
| four touch-target exceptions | `legal/*` two links at 18px, shell `skip-link` 39px, `palette-trigger` 38px — each with a liveness check |
| forty-nine elements no stylesheet reaches | ratchet with a planted control; not restyled |
| `RG-QUO-3` retention sweeps | built, dry-run, **not scheduled** — scheduling is authorization |
| `RG-DEP-1` production SMTP | not configured |
| `RG-DEP-3` restore drill | not performed; **cannot be closed by writing a file** |
| `RG-LEG-4`, `RG-DEP-4` | owner signatures |
| `2N-RELATION-TRIGGER`, `2N-IDENTITY-EXTRACTION`, `2N-FILES-WRITER` | boundaries on slice 2P.4, not work it may claim |
| `entity_attachments` | has a reader, still no writer; table empty |
| ADR-055 | neither satisfied nor superseded; expires 2026-10-27 |

---

## 8. `2P-FOUNDATION-007` and the stop condition this slice raises

Each later slice re-audits its subject against the `main` the previous slice
produced. This slice establishes that discipline and is itself the first
application of it (§1).

### Stop condition — slice 2P.1 needs a migration that 098 is not

- The plan funds **one** conditional allocation for 2P.1: *"existing 098
  candidate; re-audit required … If migration 098 remains correct, it becomes
  the phase's first explicit allocation; if not, it is not copied forward
  merely to preserve work."*
- The re-audit (§4) proves it is **not correct**.
- The defect (§3) is in deployed SQL — `list_needs_attention`'s unconditional
  status branch and nine resolution functions that never re-derive the
  lifecycle. It **cannot** be repaired from the application layer without
  either a second entry-status write path or a client-side status write, both
  of which the standards and the plan's stop conditions forbid.

**Therefore a corrected migration for 2P.1 is an owner authorization, not a
convenience.** It is raised here, at the end of the measurement slice, with the
evidence, rather than discovered mid-implementation.

---

## 9. Threats dispositioned

| Threat | Disposition |
|---|---|
| `T-1` second entry writer | **held**; census §5 proves one caller, guard is non-vacuous |
| `T-4` restored draft replays authority | **held**; `composer-draft.ts` stores text only, no key, no bytes |
| `T-10` queue removal hides an unresolved question | **measured**, §3; the correction is re-derivation, and 098's override is rejected partly for this |
| `T-11` conversation error exposes provider or user content | **measured**, §2; `error_events` has no free-text column, so the fix cannot leak |
| `T-19` tests claim real-device accessibility | **held**; §7 records every hardware claim as NOT EXECUTED |
| `T-20` implementation absorbs rollout/push residuals | **held**; §7 carries them forward untouched |

---

## 10. Verification

| Gate | Result |
|---|---|
| `phase-2p-declarations.test.ts` | pass (flipped to implementation posture) |
| `phase-2p-foundation-guard.test.ts` | pass (new) |
| `capture-write-path-guard.test.ts` | pass |
| `error-sink-parity.test.ts` | pass |
| lint | zero errors |
| typecheck | zero errors |
| production build | pass |
| hosted parity | 97 local = 97 hosted, `202608160097` |
| hosted residue | none created; all hosted reads were `select`-only |
| rollout gate | 25 pass · 3 fail · 2 owner-signature, unchanged |
| signup | closed, unchanged |

No browser journey is claimed by this slice: it renders nothing new. No hosted
write was performed, so there is no residue to clean.
