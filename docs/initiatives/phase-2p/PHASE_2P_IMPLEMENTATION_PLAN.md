# Phase 2P — Trustworthy capture and everyday UX (Implementation Plan)

**Status:** planning complete and owner direction signed by ADR-121;
**implementation authorized by ADR-122** (2026-08-18), slices 2P.0 … 2P.8 in
sequence. Migrations remain unfunded except the single conditional allocation
ADR-122 Decision 3 names — and Decision 4 records that the condition was
evaluated and the candidate rejected.

**Baseline:** authored against `main` `27f9f77`; **implementation baseline is
`main` `6a7bf21`** (this package's own merge; zero product surfaces changed
between them). 97 local = 97 hosted migrations, parity `202608160097`; signup
closed; rollout 25 pass · 3 fail · 2 owner-signature.

## 1. Sequencing

1. Measure the two broken loops before changing their presentation.
2. Fix Needs You and Conversation before promoting or automating them.
3. Unify capture before changing what happens after capture.
4. Calibrate automation after the queue has truthful terminal states.
5. Reorganize Settings before moving notification controls into it.
6. Redesign contextual pages and planning pages after shared modal/tab patterns exist.
7. Run mobile and accessibility evidence after the final surfaces exist.

## 2. Slices

| Slice | Scope | Requirements | Estimate | Migration posture |
|---|---|---:|---:|---|
| 2P.0 | current-state proof and contracts | FOUNDATION 001–007 | 0.5–1 week | zero |
| 2P.1 | Needs You lifecycle | ATTENTION 001–008 | 1–2 weeks | existing 098 candidate; re-audit required |
| 2P.2 | Conversation repair and reachability | CHAT 001–007 | 1–2 weeks | zero expected |
| 2P.3 | shared multimodal composer | CAPTURE 001–010 | 2–3 weeks | zero expected |
| 2P.4 | calibrated reversible automation | AUTONOMY 001–010 | 3–5 weeks | conditional; stop if schema authority is required |
| 2P.5 | settings IA and notification move | SETTINGS 001–008 | 2–3 weeks | zero expected |
| 2P.6 | people, memories and relations | PERSON, MEMORY, RELATION | 2–3 weeks | zero expected |
| 2P.7 | calendar and reminders | CALENDAR, REMINDER | 2–3 weeks | zero expected |
| 2P.8 | mobile, accessibility, security, traceability and closeout | MOBILE, ACCESS, CLOSE | 1–2 weeks | zero |

**Sequential estimate:** 14–21 weeks. **Safe parallel estimate:** 10–15 weeks,
after 2P.2. 2P.6 and 2P.7 may run in parallel only in isolated worktrees and
only after their shared dialog/tab primitives are settled. 2P.3 and 2P.4 must
not run in parallel because both change the capture-to-decision contract.

## 3. Slice gates

Every slice follows the same loop:

1. Re-audit against current `main` and state divergences before editing.
2. Write or update the slice acceptance record before claiming completion.
3. Implement the smallest vertical user journey.
4. Run focused unit/component tests, guards, lint, typecheck and production build.
5. Run desktop and Pixel/iPhone-sized journeys for changed surfaces.
6. Open a PR; obtain green CI on its exact head; review the diff.
7. Merge only after authorization; obtain green CI on the exact merge SHA.
8. Update the permanent handoff and re-audit the next slice.

No test, document, emulator or viewport may stand in for required real-device or
hosted evidence.

## 4. Slice detail

### 2P.0 — prove the current failures

Deliver an evidence ledger for Conversation and Needs You, a capture-surface
census, baseline telemetry, and a decision on whether branch
`codex/fix-needs-attention-confirmation` is reusable, partially reusable or
obsolete. No product behavior changes.

### 2P.1 — close the lifecycle defect

Land the lifecycle correction through the real confirmation path. Prove
idempotency, terminal removal, refresh/back behavior, undo and cross-owner
isolation. If migration 098 remains correct, it becomes the phase's first
explicit allocation; if not, it is not copied forward merely to preserve work.

### 2P.2 — restore Conversation

Fix the measured boundary, add specific safe recovery states, execute the real
assistant turn with citations and recovery, then make Conversation a first-class
mobile destination. Navigation promotion and functional repair land together;
a prominent broken route is worse than a hidden one.

### 2P.3 — one composer

Replace modality tabs with one composer shell. Reuse `captureEntry`,
`uploadAttachment`, `transcribeRecording` and the current audio lifetime. Text,
file and transcript remain distinct internal contracts behind one user surface.
Today and Capture mount the same component and the same draft semantics.

### 2P.4 — autonomy

Build a calibration dataset from owner-reviewed outcomes. Define per-category
policy, conflict/ambiguity refusal, duplicate checks, audit and undo before
enabling any automatic write. Start disabled in production; enable category by
category only after measured precision meets the signed threshold. The existing
`2N-IDENTITY-EXTRACTION` and `2N-RELATION-TRIGGER` residuals are hard boundaries,
not conveniences to route around.

### 2P.5 — settings and notifications

Introduce stable settings sections and deep links, then move notification
governance without changing its readers or writers. Notifications retains its
URL, pagination and history, and closes as the focused history/inbox surface
`2P-SETTINGS-008` requires — at most one discreet contextual entry back to the
preferences, with no setting lost or changed in semantics by the move. BYOK is
compacted without exposing or re-rendering the stored key.

### 2P.6 — contextual creation and relations

Use the shared modal/sheet and tab contracts for direct person-company editing,
memory creation, and Drawing/All links. Preserve owner scope, soft lifecycle,
provenance, masking and text-equivalent completeness.

`2P-PERSON-001` was corrected by the owner on 2026-08-19 (ADR-121's amendment of
that date) after the slice's re-audit found it named a `people.role` column that
does not exist. **No column is added**: the company is edited on the person's
page, a project role stays in `person_projects`, a task role stays in
`task_people`, each is edited in its own relation's context, and nothing
synthesizes a global title from them. **Zero migrations** — ADR-123's amendment
of the same date records the posture, and a third remains a stop condition.

### 2P.7 — planning surfaces

Recompose calendar hierarchy and move reminder creation/rescheduling into the
shared modal/sheet. Preserve selected period, timezone, quiet-hour semantics,
dedupe, recurrence and existing command paths.

### 2P.8 — close honestly

Execute iPhone-sized production journeys and the owner's real iPhone/VoiceOver
script. Generate the matrix, disposition threats, read hosted parity and residue
live, and leave unexecuted hardware claims partial. Re-audit but do not start the
successor.

## 5. Stop conditions

- A fourth capture/entry write path.
- Durable audio or transcript submission without explicit send.
- Automatic person creation without collision resolution and undo.
- Automation policy based only on raw model confidence.
- A relation inferred from co-mention presented or stored as owner-authored.
- A visible preference with no behavioural consumer.
- A migration need not explicitly allocated by an implementation authorization.
- Any pressure to weaken owner scope, RLS, audit, idempotency or fail-closed error handling.

## 6. Authorization checkpoint

The next action after this package is review and signature of implementation
authority. No slice, migration, deploy or product-code change is authorized by
ADR-121.
