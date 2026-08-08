# Phase 2J — Today, Capture and Attention · PRD

**Status:** PLANNING ONLY. Implementation is **not** authorized.
**Authorizing decision:** ADR-094 (planning only).
**Parent:** `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`, **Etapa 2**.
**Evidence base:** `docs/reports/phase-2j/PHASE_2J_CURRENT_EXPERIENCE_AUDIT.md`.
**Baseline:** `main` at `a02c74e`; hosted parity `202608070084`.

Phase 2I closed Etapa 0 + Etapa 1 — the shell, the palette, global lexical search and the
Library. This phase takes Etapa 2 and **nothing beyond it**. Etapa 3 (conversation as the
primary interface) and Etapa 4+ are explicitly out.

---

## 1. Acceptance question

> **On a phone, can the user open My Brain, see what needs them, capture in any modality
> including voice, resolve or defer an attention item without leaving Hoje, and close the
> day — without navigating the product's internal structure?**

This refines the owner's candidate in one place, on repository evidence. The candidate
asked whether the user can "understand what deserves attention". They already can: Home
renders an attention section, a today section, waiting, an open question and recent
activity. What they cannot do is **act on any of it in place** — every attention item's
primary action is a link to `/app/inbox/[entryId]`. The phase's coherence therefore comes
from *acting without leaving*, not from *seeing*.

## 2. Objective

Make Hoje the surface a mobile user starts and ends the day on: one destination, one
capture affordance covering text, files and voice, and attention items that can be
resolved where they are shown.

## 3. What this phase is not

- **Not** a new attention data model. `list_needs_attention` is the source; the phase adds
  a surface and actions over it.
- **Not** a second entry-write path. `captureEntry` → `capture_entry_async` stays the only
  way an entry is created. `T-2I-02` is inherited as a hard invariant.
- **Not** proactive AI. *O Brain percebeu* is deferred out of this phase (§9).
- **Not** semantic retrieval. ADR-055 remains open, unchanged, expiring **2026-10-27**;
  this phase neither satisfies nor supersedes it.
- **Not** project-paid AI. Transcription is billed to the user's own BYOK credential.
- **Not** durable audio. Original audio is discarded after confirmed transcription.

## 4. Requirement families

Nine families, **74 requirements**.

### 4.1 `2J-ACCESS` — the browser-level accessibility lane (8)

Discharges Phase 2I's one partial, `2I-CLOSE-002`. Component semantics, keyboard behaviour,
focus behaviour and ARIA contracts were asserted by test in Phase 2I; no browser-level
audit ran. This family is the destination that partial named, and it is a **pre-code gate**
for the rest of the phase.

- **2J-ACCESS-001:** an automated accessibility scan runs in a real browser over the
  Phase 2I surfaces — command palette, global search, Library — at a mobile and a desktop
  viewport, in the local (non-online) Playwright lane so CI runs it on every PR.
- **2J-ACCESS-002:** the scan's dependency is added as a devDependency and pinned; the
  repository has none today.
- **2J-ACCESS-003:** a keyboard-only journey opens the palette, runs a search, reaches a
  result and returns, with no pointer input.
- **2J-ACCESS-004:** focus is restored to the invoking element when the palette closes,
  asserted in the browser rather than in jsdom.
- **2J-ACCESS-005:** focus is visible at every stop of 2J-ACCESS-003.
- **2J-ACCESS-006:** rendered touch targets on the mobile viewport meet the stated minimum,
  measured from the rendered box, not from CSS source.
- **2J-ACCESS-007:** `prefers-reduced-motion` is honoured by the surfaces that animate,
  verified with the media feature emulated.
- **2J-ACCESS-008:** manual screen-reader verification is recorded **as manual**, with
  date, reader, platform and outcome. It is never reported as automated. If it is not
  performed, the requirement closes as an evidenced negative naming its destination.

### 4.2 `2J-HOJE` — Hoje as one destination (10)

- **2J-HOJE-001:** there is exactly one surface called Hoje. The `/app/today` → `/app/work?view=today`
  redirect and the `/app` cockpit must stop being two different answers to the same word.
- **2J-HOJE-002:** the resolution preserves every existing entry point and deep link; no
  bookmarked URL 404s.
- **2J-HOJE-003:** overdue is visually and semantically distinct from due-today. The data
  exists in `work-projection`; the distinction does not.
- **2J-HOJE-004:** up to three priorities are surfaced, derived **deterministically** from
  existing due/overdue/status data. No model call, no ranking service.
- **2J-HOJE-005:** the derivation rule is stated in one place as data, testable in
  isolation, and shown to the user in plain language when asked.
- **2J-HOJE-006:** when fewer than three qualify, fewer are shown. The surface never pads.
- **2J-HOJE-007:** capture remains the first interactive element on the mobile viewport.
- **2J-HOJE-008:** no decorative metric is added. Counts appear only where a count is the
  action's subject.
- **2J-HOJE-009:** every section has a distinct empty state that says what would put
  something there.
- **2J-HOJE-010:** a failure in one section degrades that section only; Hoje still renders.

### 4.3 `2J-ATTN` — *Precisa de você* (12)

- **2J-ATTN-001:** a dedicated attention surface exists, reachable from Hoje and from
  navigation, backed by `list_needs_attention` — no new table, no new RPC family.
- **2J-ATTN-002:** the qualifying states are exactly the five in `trackedAttentionReasons`.
  A state is admitted only if it is deterministic and already stored.
- **2J-ATTN-003:** `configure_ai_credential` is **excluded**, and the exclusion is
  documented at the surface rather than being a silent omission — it reaches the user
  through the Inbox and entry detail, and admitting it would widen a DB-validated
  analytics enum.
- **2J-ATTN-004:** memory conflicts, engagement nudges and any other state without a
  deterministic stored source are excluded, recorded as evidenced negatives.
- **2J-ATTN-005:** filtering by reason is available and is a pure client-side narrowing of
  a page already fetched, or an explicit parameter — never a second query shape that could
  diverge from the RPC's ownership scope.
- **2J-ATTN-006:** ordering is deterministic and stable across reloads; the existing keyset
  cursor is preserved.
- **2J-ATTN-007:** an item can be resolved **in place** for at least the reasons whose
  resolution is already a single bounded action. Where resolution genuinely needs the full
  entry context, the surface says so and navigates.
- **2J-ATTN-008:** dismissal is not offered unless it mutates source state. An
  attention-only dismissal would create a state that says "resolved" while the entry still
  says otherwise. Absent snooze state (§4.9), dismissal is out.
- **2J-ATTN-009:** defer/snooze is **out of this phase** and recorded as such with its
  reason: it is the one attention action that cannot be composed from existing state.
- **2J-ATTN-010:** bulk action is offered only for items that are equivalent and safe —
  same reason, same action, no per-item decision. If no such set exists, bulk is an
  evidenced negative.
- **2J-ATTN-011:** the mobile interaction resolves an item without a hover affordance and
  without a gesture that has no visible equivalent.
- **2J-ATTN-012:** empty and failure states are distinct from each other and from "still
  loading".

### 4.4 `2J-CAPTURE` — unified capture (7)

- **2J-CAPTURE-001:** one capture surface offers text, file and voice.
- **2J-CAPTURE-002:** text capture calls `captureEntry` unchanged. No new Server Action
  writes an entry.
- **2J-CAPTURE-003:** file capture calls `uploadAttachment` unchanged. The two contracts
  stay separate behind one surface; nothing merges them into a unifying record.
- **2J-CAPTURE-004:** a structural guard fails the build if a second entry-write path
  appears, in the shape Phase 2I used for `T-2I-02`.
- **2J-CAPTURE-005:** no classification — type, project, person, tag — is required before
  capture succeeds.
- **2J-CAPTURE-006:** the existing idempotency-key contract is preserved for every
  modality; a retry never produces two entries.
- **2J-CAPTURE-007:** the capture receipt keeps its existing shape and its link back to the
  created entry.

### 4.5 `2J-VOICE` — voice and reviewable transcription (15)

- **2J-VOICE-001:** recording, transcription and confirmation are three separate steps, and
  the user confirms before anything is captured.
- **2J-VOICE-002:** transcription is authorized by the **user's own BYOK credential**,
  resolved through the existing `resolveOwnCredential` path. No project key, no new secret,
  no new environment variable, no new vendor.
- **2J-VOICE-003:** the transcription capability is added to the `AIProvider` interface, so
  the provider stays swappable and authorization stays outside it.
- **2J-VOICE-004:** the model is pinned as a routing constant. No new `agent_preferences`
  column.
- **2J-VOICE-005:** every transcription call writes to the `ai_usage_events` ledger before
  any dependent write, with a named operation rather than `'other'` (see §7).
- **2J-VOICE-006:** recording state and elapsed duration are always visible while recording.
- **2J-VOICE-007:** the user can pause, finish, and cancel before sending.
- **2J-VOICE-008:** cancellation discards the captured audio immediately and provably; a
  guard asserts no code path retains it.
- **2J-VOICE-009:** microphone-permission denial is a first-class state with its own copy
  and a way forward, not an error toast.
- **2J-VOICE-010:** transcription-in-progress is an explicit state.
- **2J-VOICE-011:** a transcription failure **preserves the existing text draft** and never
  clears the composer.
- **2J-VOICE-012:** the transcript is an editable draft; the user may edit it, type
  alongside it, and append a further recorded segment.
- **2J-VOICE-013:** **no audio is durably stored.** No bucket, no table, no retention class.
  The original is discarded once the transcript exists, and a guard asserts the absence.
- **2J-VOICE-014:** the container/codec difference between Safari and Chromium is handled
  explicitly, and the duration/size ceiling is enforced client-side before an upload rather
  than surfaced as a provider error.
- **2J-VOICE-015:** nothing recorded becomes a task, memory, entity or action without the
  user's explicit confirmation. The transcript is not interpreted before capture.

### 4.6 `2J-DAY` — end of day and review continuity (6)

- **2J-DAY-001:** the existing review domain is **reused**, not rebuilt. `generateReview`
  with `period: "daily"` is the mechanism.
- **2J-DAY-002:** a daily review is reachable from Hoje.
- **2J-DAY-003:** ending the day summarizes what is unresolved, from projections that
  already exist.
- **2J-DAY-004:** nothing is mutated automatically at end of day. No auto-carry, no
  auto-complete, no auto-defer.
- **2J-DAY-005:** turning a review conclusion into an action requires explicit
  confirmation and goes through an existing write path.
- **2J-DAY-006:** weekly and monthly review remain parent Etapa 4. This phase adds no
  period beyond `daily`.

### 4.7 `2J-PRIVACY` — sensitivity on attention surfaces (5)

- **2J-PRIVACY-001:** one decision governs `highly_sensitive` behaviour across Hoje,
  attention, capture receipts, notifications and review summaries. Components do not choose
  independently. Blocked on `OD-2J-1`.
- **2J-PRIVACY-002:** the decision is expressed as **data in one module**, in the shape
  `search/contracts.ts` uses, so a guard can assert it and changing it is visible.
- **2J-PRIVACY-003:** whatever the decision, it is an **expectation** layer, never an
  authorization boundary. Ownership continues to come from the authenticated query plus
  forced RLS. No service-role path is introduced.
- **2J-PRIVACY-004:** if content is withheld, the surface leaks neither its existence nor
  its count — the Phase 2I rule, applied identically.
- **2J-PRIVACY-005:** the attention projection's 240-character `originalPreview` is
  governed by the same decision as the full record.

### 4.8 `2J-METRICS` — content-free telemetry (7)

Recorded through `record_product_event`; **each new name is a migration** (§7).

- **2J-METRICS-001:** Hoje records first useful action type and whether it completed.
- **2J-METRICS-002:** attention records item-type bucket, action taken, and a
  time-to-resolution **bucket**.
- **2J-METRICS-003:** capture records modality — text / attachment / voice — and
  confirmed-or-cancelled.
- **2J-METRICS-004:** voice records transcription success or failure, whether the transcript
  was edited (boolean), whether a further segment was recorded (boolean), and a
  time-to-confirmation bucket.
- **2J-METRICS-005:** review records started and completed.
- **2J-METRICS-006:** **no** captured text, transcript, filename, person/project/company
  name, task text, memory content, raw provider error, audio, or extracted personal content
  is recorded. Enforced by the per-event property allow-list in
  `private.validate_product_event_properties`, not only by convention.
- **2J-METRICS-007:** every declared event has a producer **and** a consumer before the
  phase closes — the lesson recorded when SH.6's quota refusals recorded nothing for weeks.

### 4.9 `2J-CLOSE` — closeout (4)

- **2J-CLOSE-001:** a fail-closed traceability matrix is generated, in the Phase 2I shape,
  refusing to write when a requirement is unevidenced.
- **2J-CLOSE-002:** the migration budget is reconciled **per slice**, not by count.
- **2J-CLOSE-003:** ADR-055 is restated at close as neither satisfied nor superseded.
- **2J-CLOSE-004:** every deferral in this phase — snooze, dismissal, *O Brain percebeu*,
  bulk actions if absent — is recorded with its destination, never dropped silently.

## 5. Slices

| Slice | Scope | Migration |
| --- | --- | --- |
| **2J.0** | Accessibility lane — `2J-ACCESS`. **Pre-code gate** for 2J.1+ | 0 |
| **2J.1** | Hoje as one destination — `2J-HOJE` | 0 |
| **2J.2** | *Precisa de você* — `2J-ATTN` | 0 |
| **2J.3** | Unified capture (text + file) — `2J-CAPTURE` | 0 |
| **2J.4** | Voice and reviewable transcription — `2J-VOICE` | 1 (avoidable) |
| **2J.5** | End of day and review continuity — `2J-DAY` | 0 |
| **2J.6** | Sensitivity behaviour — `2J-PRIVACY` | 0 |
| **2J.7** | Telemetry and closeout — `2J-METRICS`, `2J-CLOSE` | 1 |

## 6. Per-slice UX contract

Each slice's implementation document must state: user problem · current journey · target
journey · mobile-first behaviour · desktop behaviour · states (empty, loading, partial,
failure) · accessibility · sensitivity behaviour · telemetry · technical dependencies ·
write-path impact · AI/provider impact · cost impact · migration impact · acceptance
evidence. A slice that cannot fill *write-path impact* and *migration impact* is not ready
to start.

## 7. Migration budget — recommended **2**

| # | Slice | Need | Why nothing existing satisfies it |
| --- | --- | --- | --- |
| M1 | 2J.7 | `product_events` event-name vocabulary + `private.validate_product_event_properties` re-declaration | The allowed names are a **database check constraint**. No application path can record an unnamed event. |
| M2 | 2J.4 | `ai_usage_events.operation` += a transcription value | A closed check constraint. **Avoidable** — `'other'` is allowed — but logging a whole new AI capability as `'other'` destroys per-operation cost attribution and makes transcription invisible in `/app/costs`. |

Both are additive vocabulary extensions to append-only tables. **Privilege/RLS impact:**
none — no policy, grant or role changes. **Retention impact:** none — no new content class;
`product_events` and `ai_usage_events` keep their existing windows. **Deletion/cascade
impact:** none — both tables are already covered by account deletion. **Rollback posture:**
a constraint widening is forward-only by convention; narrowing it later requires the rows
to be absent first. **User content:** neither introduces any. **Operational content:** M1
adds event names, M2 adds one operation label.

`2 allocated · 1 spent` is a legitimate close if the owner refuses M2.

**No migration may be created during planning.** The budget is a recommendation and takes
effect only with the owner's implementation authorization.

## 8. Owner decisions still required

See `PHASE_2J_TRACEABILITY_CONTRACT.md` §6 for how each is discharged.

- **OD-2J-1** — how `highly_sensitive` behaves on Hoje, attention, receipts, notifications
  and review summaries. Blocks 2J.6, and gates 2J.1/2J.2 acceptance.
- **OD-2J-2** — what voice does when the account has no valid AI credential. Blocks 2J.4.
- **OD-2J-3** — whether daily priorities may be explicitly user-selected (needs storage) or
  stay deterministic (costs nothing). Blocks `2J-HOJE-004` only if the answer is "explicit".

## 9. Named deferrals

- **`O Brain percebeu`** — no deterministic source; the alternative is unbounded proactive
  AI on the user's own credential. Destination: a future phase with a crisp observation
  contract, or never.
- **Attention snooze/defer** — the only attention action that needs new state.
- **Weekly/monthly review** — parent Etapa 4.
- **Semantic retrieval** — ADR-055, expiring 2026-10-27.
