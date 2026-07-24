# Phase 2D — Slice 2D.5 Acceptance Report

## 1. Status

| Field | Value |
| --- | --- |
| Slice | Phase 2D Slice 2D.5 — Conversational Surfacing (Chat + Queue) and Cooldown |
| Status | Implemented, gate-verified, linked-verified, and independently reviewed on a local branch |
| Date | 2026-07-24 |
| Repository | `D:\Projetos\GitHub\my-brain` |
| Branch | `codex/phase-2d-slice-5` |
| Base SHA | `218e56e` (`origin/main`, Slice 2D.4 merged via PR #14) |
| Migrations | **None** — no schema change was required (see §5) |
| Publication state | Not pushed, no PR, not merged, no application code deployed |
| Governing documents | `PHASE_2D_PRD.md` §12.6/§12.7/§13.5, `PHASE_2D_IMPLEMENTATION_PLAN.md` §8, ADR-033 decisions 5/6 |

Slice 2D.6 (convergence and closeout) remains unauthorized and unstarted.

## 2. Objective

Make pending questions **conversational**: render open questions as interactive,
untrusted-data elements in Chat and the "Precisa de você" queue, resolvable
through the **identical** Slice 2D.1–2D.4 resolution contract, and gate any
**proactive** surfacing with a deterministic, heartbeat-aligned quiet-hours /
cap / cooldown module. No AI-generated conversation, no new persistence model,
no new outbound channel, no change to the resolution/reinterpretation/undo
contracts.

## 3. Acceptance IDs covered

| Requirement | Where satisfied |
| --- | --- |
| `2D-SURFACE-001` | `ConversationalQuestions` renders open questions from bounded server DTOs; question/answer/suggestion text is React-escaped data, never a model instruction, and is never injected into the chat prompt |
| `2D-SURFACE-002` | Chat and queue resolve through the same `resolvePendingQuestion` / `undoQuestionResolution` Server Actions and the same `QuestionAnswerForm` |
| `2D-SURFACE-003` | Chat, the queue, and the `/questions` page all read the shared `actionablePendingQuestionFilter`, so they agree on which questions are actionable after any resolution (asserted end-to-end) |
| `2D-COOLDOWN-001` | `decideQuestionSurfacing` is deterministic (no LLM), honors local quiet hours, `max_followups_per_day`, rolling cooldown, and `important_reminder_override` |
| `2D-COOLDOWN-002` | The decision is per-user and timezone-aware; the loader is fully failure-isolated and one user's read error only suppresses that user's nudge |
| `2D-ANALYTICS-001/002` | Reused content-free `needs_attention_viewed` (surface `questions`, item count only) plus the existing server-emitted resolution events; no question/answer text; fail-open |
| `2D-UX-001/003`, `2D-I18N-001`, `2D-A11Y-001/002/003` | Distinct proactive/pull/quiet states; PT-BR/English; region landmark, heading order, focus, ≥44 px targets, no horizontal overflow at Pixel 7 (all verified) |
| `2D-OPERATIONS-001` | No migration; generated types unchanged; local/remote parity preserved through `202607230051` |

## 4. What shipped

### 4.1 Deterministic surfacing / cooldown module (the core of 2D-COOLDOWN)
`src/features/agent/question-surfacing.ts` — a pure, LLM-free `decideQuestionSurfacing`
that mirrors the heartbeat's discipline (`run_user_heartbeat`): quiet hours in
the user's own timezone (reusing `isWithinQuietHours` verbatim), a per-local-day
cap, a rolling 24h cooldown, and an override that only an *important* item may
use. Gates evaluate in a stable order (quiet hours → cap → cooldown). 18 unit
tests cover every branch, timezone correctness, the empty quiet window, cap 0,
cooldown boundaries, an unparseable timestamp, and every override interaction.

`src/features/agent/question-surfacing-data.ts` (`server-only`) derives the
decision inputs from owner-scoped data and **reuses the heartbeat's existing
`notifications` ledger read-only** as the shared nudge budget (delivered-today
count + last-nudge cooldown anchor), so no new cron, channel, or persisted
surfacing state is introduced — surfacing stays pull-based per ADR-033 decision
5. It fails **closed** (no nudge) on any read error. 7 unit tests cover the happy
path, no-open-questions, preference/notification read errors, cap, cooldown, and
quiet hours.

### 4.2 Conversational panel (the core of 2D-SURFACE)
`src/features/agent/conversational-questions.tsx` (`server-only`) renders open
actionable questions as interactive elements resolvable through the **unchanged**
`resolvePendingQuestion` / `undoQuestionResolution` contract and the existing
`QuestionAnswerForm` (answer, defer, dismiss, not-relevant, suggestions, the
read-only 2D.3 previews, and the 2D.4 confirm-to-reinterpret control) — no
resolution logic was duplicated. Two modes:

- **proactive** (Chat): shown with attention only when `decideQuestionSurfacing`
  allows; when suppressed, it collapses to one quiet, reachable link to
  `/questions` — never a nag, **never permanently hidden**.
- **pull** (the "Precisa de você" queue): open questions are always shown; the
  decision only sets header emphasis.

Every projected string is untrusted owner content rendered through normal React
text escaping. The panel is fully failure-isolated: a pending-question read
error degrades to "no panel" instead of crashing its host surface.

### 4.3 Mounts
- `src/app/[locale]/app/chat/page.tsx` — the proactive panel above the chat form.
- `src/app/[locale]/app/inbox/page.tsx` (`?view=needs-you`) — the pull panel above
  the entry-centric needs-attention list.

### 4.4 Analytics (content-free, no migration)
`ConversationalQuestionsViewed` (`interaction-events.tsx`) reuses the existing
allowlisted `needs_attention_viewed` event with the allowlisted `questions`
surface and a bounded item count only. Resolution outcomes
(`question_answered_basic` / `question_resolved` / `question_reinterpret_applied`)
are already emitted content-free by the shared Server Action, so Chat- and
queue-originated resolutions converge on the same telemetry with zero new events.

## 5. Why no migration

Slice 2D.5 is a UX/surfacing slice over already-shipped contracts. It adds no
table, column, RPC, constraint, or product-event name/surface. The `questions`
surface and every reused event name were already allowlisted (migration
`202607230049`), so the reused `needs_attention_viewed` insert is DB-valid.
Generated types are unchanged; local/remote migration parity is preserved through
`202607230051`. The resolution, reinterpretation, and undo contracts are reused
byte-for-byte.

## 6. Conversation state derives from existing domain state

No parallel state machine, lifecycle, or persistence was introduced. The panel's
"open vs resolved" derives entirely from `pending_questions` via the shared
`actionablePendingQuestionFilter` — the same predicate `list_needs_attention` and
the `/questions` page use. Resolving anywhere flows through the one
`resolve_pending_question_v3` family; the surfaces converge on the next request.

## 7. Verification

| Gate | Result |
| --- | --- |
| ESLint | 0 errors, 0 warnings |
| TypeScript (`tsc --noEmit`) | 0 errors |
| Vitest | **902/902 passed across 93 files** (+25 tests, +2 files vs. base 877/91) |
| Production build | Green (`✓ Compiled successfully`) |
| Linked DB lint (`--level error`) | Clean (no schema change this slice) |
| Generated types | Unchanged (no migration) |

New unit coverage: `question-surfacing.test.ts` (18), `question-surfacing-data.test.ts` (7).

One pre-existing unit test (`task-candidate-form.test.tsx:206`, a synchronous
`userEvent` validation assertion this slice does not touch) flaked once under
heavy parallel load, then passed on every subsequent full run (902/902); it
passes in isolation and passes 877/877 on clean `main`. Non-blocking environment
flakiness, not a logic race in this slice.

## 8. Linked (remote) verification — authenticated Playwright

Run against the linked development project (real user, real RPCs), desktop +
Pixel 7:

| Journey | desktop | Pixel 7 |
| --- | --- | --- |
| Resolve the same question from Chat and the Needs-you queue via the identical contract, with convergence across `/questions` (new) | ✅ | ✅ |
| 2D.1 answer / undo / stale (regression) | ✅ | — |
| 2D.2 defer / dismiss / not-relevant (regression) | ✅ | — |
| 2D.3 suggestions + read-only previews (regression) | ✅ | — |
| 2D.4 answer + confirm-to-reinterpret + undo (regression) | ✅ | — |
| English resolution / disposition copy (regression) | ✅ | — |
| Needs-attention open-question surfacing (regression) | ✅ | — |

The new journey asserts: the pull panel is a labeled `region` on the queue with
the interactive card built from untrusted question text; Chat renders the same
question and resolves it inline through the same action, showing the audited
success state and undo; ≥44 px answer targets and no horizontal overflow on
mobile; and that after resolving from Chat, both the queue and `/questions` agree
the question is no longer actionable. The full desktop question set (8 tests,
including the new one) ran green together — no regression.

## 9. Independent review

Full-branch review against the Slice 2D.5 checklist (UX, conversation flow,
accessibility, routing, replay safety, analytics, regressions). Two issues found
and fixed on this branch:

- **Important — landmark semantics / accessibility.** The panel was first an
  `<aside>` (implicit role `complementary`), which mismatched the app's existing
  labeled-region convention and hid the panel from a `region` landmark query.
  **Fixed** to `<section aria-label>` (role `region`), matching the "Precisa de
  você" region and giving assistive tech a named landmark for this primary
  interactive content. Caught by the new authenticated Playwright run.
- **Important — failure isolation.** The panel first used `requireSupabaseData`,
  which throws on a query error and would crash the Chat/Inbox page that mounts
  it. **Fixed** to degrade to "no panel" on a pending-question read error and to
  fall back to the default timezone on a profile read error, so an additive
  affordance can never take down its host surface.

Verified clean: no resolution/undo logic duplicated; questions are untrusted data
and never enter the chat prompt; surfacing is deterministic and per-user; the
cooldown reuses the heartbeat budget read-only with no new persistence; analytics
is content-free and fail-open; no routing/navigation redesign; the persistence
model of 2D.1–2D.4 is untouched.

## 10. Assumptions

1. **Pull-based surfacing.** Per ADR-033 decision 5 and product decision 4,
   proactive surfacing is queue/Chat-pull only. Questions are always *reachable*;
   the cooldown module gates only the proactive *emphasis*, so nothing is ever
   permanently hidden.
2. **Shared nudge budget.** Cooldown/cap reuse the heartbeat's `notifications`
   ledger read-only rather than persisting a new per-question surfacing record,
   keeping the slice migration-free and honoring one shared "don't nag past the
   cap / within 24h" budget across the heartbeat and question nudges.
3. **Question importance.** No pending question carries importance in the current
   schema, so the `important_reminder_override` bypass is inert today but modeled
   faithfully and covered by tests for when importance is introduced.
4. **Inline copy pattern.** New user-facing strings follow the established
   bilingual copy-object pattern used throughout the agent feature
   (`questionResolutionCopy`, preview/effect copy), for consistency with
   2D.1–2D.4.

## 11. Deferred items

- Retiring the legacy `answerPendingQuestion` wrapper and
  `resolve_pending_question_v1`/`_v2` — still explicitly out of scope.
- Convergence and closeout (Slice 2D.6) — awaits separate authorization.
- The split/merge sub-epic (`2C-STRUCTURE-004`, GitHub issue #8) — deferred,
  non-blocking.

## 12. Verdict

**READY WITH NON-BLOCKING NOTES.**

Slice 2D.5 is implemented, gate-verified, linked-verified (authenticated desktop
+ Pixel 7), and independently reviewed. Every Critical and Important finding is
fixed. No migration was required; the resolution/reinterpretation/undo/analytics
contracts of 2D.1–2D.4 are reused unchanged. The only outstanding item is a
pre-existing unit-test flake in a file this slice does not touch, demonstrated to
be an environment artifact. The branch is local only: not pushed, no PR, not
merged, nothing deployed, and Slice 2D.6 has not been started.
