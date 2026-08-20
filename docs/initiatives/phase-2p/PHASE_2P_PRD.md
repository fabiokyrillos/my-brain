# Phase 2P — Trustworthy capture and everyday UX (PRD)

**Authorization:** planning and the product direction below were approved by the
owner on 2026-08-18 and recorded by ADR-121. **Implementation is not authorized
by this package.** It starts only after the owner reviews the package and records
a separate implementation decision — which the owner did the same day:
**ADR-122 authorizes slices 2P.0 … 2P.8.** This document keeps stating what it
does and does not authorize on its own, because that is what makes the separate
decision legible.

**Baseline:** authored against `main` `27f9f77`; **implementation baseline is
`main` `6a7bf21`**, which is `27f9f77` plus this package's own merge (PR #253).
The complete product-code delta between them is three guard test files and
**zero product surfaces**, so every finding here still describes the tree it was
written against — see `PHASE_2P_SLICE_00_ACCEPTANCE.md` §1. 97 local migrations
and hosted parity `202608160097`, verified read-only on 2026-08-18. Signup
remains closed and the rollout gate remains 25 pass · 3 fail · 2
owner-signature.

**Governing pair:** this PRD and `PHASE_2P_IMPLEMENTATION_PLAN.md`.
**Evidence:** `docs/reports/phase-2p/`.

**87 requirements across fourteen families and nine slices. Nothing is
implemented by this package.** (86 at ADR-121; `2P-SETTINGS-008` was appended
to the end of its family by a later owner authorization on 2026-08-18,
instantiating `OD-2P-8`'s second half. No ID was renumbered, reused or
removed.)

---

## 1. Outcome

The app should feel like one dependable daily tool: capture anything from the
same composer, let the Brain handle safe high-confidence work, ask only when a
real decision remains, keep conversation visible and working, and make the
pages used every day calm and obvious on a phone.

This phase does not open signup, resume the push investigation, change the AI
provider, retain audio, or silently absorb Phase 2N/2O residuals.

## 2. Signed product decisions

- **OD-2P-1:** text is the default capture state; there is no “Write” mode.
- **OD-2P-2:** attachment and microphone are actions in one composer, shared by
  Today and Capture.
- **OD-2P-3:** voice is transcribed into an editable draft; audio is never a
  durable product record.
- **OD-2P-4:** Needs You contains only unresolved, conflicting or insufficiently
  trusted decisions; a fully resolved entry leaves immediately.
- **OD-2P-5:** automation is allowed only from calibrated, type-specific policy,
  never from an uncalibrated raw “90%” number.
- **OD-2P-6:** every automatic mutation is attributable, visible and undoable.
- **OD-2P-7:** Conversation is repaired before it is promoted, then becomes a
  first-class mobile destination and the first Brain lens.
- **OD-2P-8:** notification preferences move to Settings; Notifications becomes
  the history/inbox surface.
- **OD-2P-9:** Settings becomes a sectioned destination with stable deep links.
- **OD-2P-10:** Relations opens on the drawing and keeps a complete text tab.
- **OD-2P-11:** reminder creation moves to a modal/sheet; calendar and reminder
  context must survive opening, saving and cancelling it.
- **OD-2P-12:** the phase closes only after real iPhone and VoiceOver evidence;
  an emulator or viewport is not that evidence.

## 3. Requirements

### 3.1 `2P-FOUNDATION` — measured truth before redesign (7)

- **2P-FOUNDATION-001:** Reproduce the Conversation failure against the current production path and classify its failing boundary without exposing user content.
- **2P-FOUNDATION-002:** Reproduce capture → interpretation → confirmation → Needs You removal against current `main` and record every persisted state transition.
- **2P-FOUNDATION-003:** Re-audit `codex/fix-needs-attention-confirmation` against current `main`; no branch is merged merely because it exists.
- **2P-FOUNDATION-004:** Census every capture surface and prove which actions, write paths and draft stores each mounts.
- **2P-FOUNDATION-005:** Establish content-free telemetry for failure class, queue reason, automation decision and undo outcome before changing policy.
- **2P-FOUNDATION-006:** Record the current mobile, touch-target, screen-reader and stylesheet residuals without promoting them to passes.
- **2P-FOUNDATION-007:** Each later slice re-audits its subject against the `main` produced by the previous slice.

### 3.2 `2P-ATTENTION` — Needs You only when the owner is needed (8)

- **2P-ATTENTION-001:** A confirmed interpretation with no open question, conflict or unresolved candidate leaves Needs You atomically.
- **2P-ATTENTION-002:** Confirmation resolves the entry lifecycle, not only the visible form state.
- **2P-ATTENTION-003:** A completed entry cannot reappear because of stale projection, pagination or cached navigation.
- **2P-ATTENTION-004:** The entry page states exactly what remains unresolved and never asks to reconfirm a settled item.
- **2P-ATTENTION-005:** The terminal state says that everything is resolved and offers a route back to the originating surface.
- **2P-ATTENTION-006:** Concurrent or replayed confirmation is idempotent and cannot duplicate tasks, people, memories or audit rows.
- **2P-ATTENTION-007:** Undo restores the truthful prior queue state; it never fabricates an unresolved decision.
- **2P-ATTENTION-008:** Hosted journeys prove removal, refresh, back navigation, replay and another-owner isolation.

### 3.3 `2P-CHAT` — Conversation works and can be found (7)

- **2P-CHAT-001:** The production failure is fixed at its root cause and proved through the real conversation action.
- **2P-CHAT-002:** Credential, quota, retrieval, provider and temporary failures have distinct safe recovery states.
- **2P-CHAT-003:** No generic boundary is the only evidence for a known conversation failure.
- **2P-CHAT-004:** Conversation is a first-class mobile destination and remains the first lens inside Brain.
- **2P-CHAT-005:** A user can begin a conversation from relevant contextual pages without losing the source context.
- **2P-CHAT-006:** Conversation suggestions remain deterministic and incur no model call merely to render a page.
- **2P-CHAT-007:** Desktop and mobile journeys cover new conversation, existing conversation, source round-trip, failure and recovery.

### 3.4 `2P-CAPTURE` — one composer, every modality (10)

- **2P-CAPTURE-001:** Today and Capture mount the same composer contract.
- **2P-CAPTURE-002:** Text is ready immediately; no mode choice or “Write” button precedes it.
- **2P-CAPTURE-003:** The attachment action sits at the left of the composer and preserves the existing attachment write path.
- **2P-CAPTURE-004:** The microphone sits beside send and never replaces or clears typed text.
- **2P-CAPTURE-005:** Drag, drop and paste are supported where the browser exposes them, with the same validation as file selection.
- **2P-CAPTURE-006:** A transcript is inserted into the editable draft at the current composition boundary.
- **2P-CAPTURE-007:** The user may edit, type more, record another segment or discard before sending.
- **2P-CAPTURE-008:** Only explicit send creates an entry; transcription alone creates none.
- **2P-CAPTURE-009:** Audio remains memory-only and is discarded on success, cancel, failure and unmount.
- **2P-CAPTURE-010:** Draft restoration never stores an idempotency key, audio, file bytes or authority to replay a send.

### 3.5 `2P-AUTONOMY` — calibrated, reversible assistance (10)

- **2P-AUTONOMY-001:** Automation policy is type-specific for tasks, people, projects, companies, memories and relations.
- **2P-AUTONOMY-002:** A raw model confidence score cannot by itself authorize a write.
- **2P-AUTONOMY-003:** Calibration is measured against an owner-reviewed reference set before any threshold is enabled.
- **2P-AUTONOMY-004:** Ambiguity, conflict, missing evidence or identity collision always routes to Needs You.
- **2P-AUTONOMY-005:** High-trust task creation validates title, temporal fields and duplicate risk before writing.
- **2P-AUTONOMY-006:** High-trust person creation resolves existing candidates first and cannot create a second identity for a plausible match.
- **2P-AUTONOMY-007:** Memories require durable-language evidence; events are not silently converted into memories.
- **2P-AUTONOMY-008:** Relations are never persisted as owner-authored facts from co-mention alone.
- **2P-AUTONOMY-009:** Every automatic write produces a content-minimal audit reason and a bounded undo window visible to the owner.
- **2P-AUTONOMY-010:** The owner can disable automation by category without disabling interpretation or suggestions.

### 3.6 `2P-SETTINGS` — a navigable control centre (8)

- **2P-SETTINGS-001:** Settings has stable sections for General, Assistant, AI, Planning, Notifications, Privacy and data, Appearance, and Account.
- **2P-SETTINGS-002:** Each section has a stable deep link and preserves back/forward navigation.
- **2P-SETTINGS-003:** Mobile renders the sections as a list or compact selector rather than an overflowing tab row.
- **2P-SETTINGS-004:** Saving one section cannot reset unsaved or stored values owned by another section.
- **2P-SETTINGS-005:** Every visible control retains a proved behavioural consumer.
- **2P-SETTINGS-006:** BYOK retains its security posture while becoming a compact, comprehensible panel.
- **2P-SETTINGS-007:** Failed saves preserve input and name the affected section.
- **2P-SETTINGS-008:** Notifications becomes a focused history/inbox surface: its consent, type, frequency, quiet-hours and cap controls move to the Settings notifications section, and the page keeps at most one discreet contextual entry to those preferences. Empty, loading, error and read/unread states and navigation to each item's destination are covered on desktop and mobile; deep links, keyboard focus and screen-reader access are preserved; and no existing setting is lost or changes semantics through the reorganization alone.

### 3.7 `2P-PERSON` — direct relationship editing (4)

- **2P-PERSON-001:** The associated company is editable directly in the person's main section with one explicit action, and each role is edited in the context of the relationship that carries it.

  *Corrected by the owner on 2026-08-19; see ADR-121's amendment of the same date.* Superseded wording, preserved: *"Company and role are editable from their displayed section with one explicit action."* It named a field the product does not have — `people` carries no `role` column, and adding one would be a third Phase 2P migration and therefore a stop condition. The signed replacement: the company is editable on the person's page; there is **no global role for a person**; a project role belongs to `person_projects`; a task role belongs to `task_people`; each is edited in its own relation's context; neither is duplicated onto `people`; no global title is synthesized from the several roles; and the absence of a role produces no inference. The count stays 87 and no ID is renumbered.
- **2P-PERSON-002:** Selecting an existing company or creating a new one happens in one flow.
- **2P-PERSON-003:** A created-but-not-linked company is reported distinctly and cannot invite a duplicate retry.
- **2P-PERSON-004:** Mobile and keyboard users can complete the flow without nested dialogs or lost focus.

### 3.8 `2P-MEMORY` — deliberate memory creation (4)

- **2P-MEMORY-001:** “New memory” opens a modal/sheet with a usable multiline field instead of the inline one-line form.
- **2P-MEMORY-002:** The flow explains what makes a memory durable and asks for optional validity or source only when relevant.
- **2P-MEMORY-003:** The user reviews the final content before saving and receives undo after creation.
- **2P-MEMORY-004:** The flow preserves the existing owner scope, lifecycle and retrieval semantics.

### 3.9 `2P-RELATION` — drawing first, text always complete (4)

- **2P-RELATION-001:** Relations opens on a “Drawing” tab and exposes “All links” as the second tab.
- **2P-RELATION-002:** The text tab contains every fact the drawing contains and remains independently usable.
- **2P-RELATION-003:** The drawing supports focus on a person and opening an explainable link without adding inferred facts.
- **2P-RELATION-004:** Mobile receives a bounded readable representation when the full graph cannot fit.

### 3.10 `2P-CALENDAR` — calm planning context (5)

- **2P-CALENDAR-001:** Calendar has clear day, week and month navigation with an unmistakable current day.

  *Scope confirmed by the owner on 2026-08-19; the text is unchanged.* Slice 2P.7's re-audit found `CALENDAR_ORIENTATIONS` is `["day","week","agenda"]` and asked whether "month" could mean the agenda. **It cannot.** `2P-CALENDAR-001` means a **real month view**, and Agenda must not be interpreted or renamed as Mês. 2P.7 delivers **Dia, Semana and Mês**; Agenda may remain as an additional view while it stays useful. The month view shows the real grid of the month; marks today perceptibly **without relying on colour alone**; distinguishes days outside the current month; shows tasks, reminders and reviews in a **bounded** way; keeps cells from growing without limit; offers access to the overflow; opens a day or an item **preserving context**; works on mobile without an illegible grid; carries an accessible text alternative; preserves timezone and local-date semantics; and **creates no new write path**. If a legible month grid needs a different presentation on a phone, use a compact or contextual agenda **while the real month stays the selected period** — a plain list must not be declared a month view.

  *Delivered in slice 2P.7, with one traceable remainder.* **`2P-CALENDAR-MONTH-TELEMETRY`** — the orientation vocabulary has a third copy inside the **deployed** `private.validate_product_event_properties`, which admits exactly `['day','week','agenda']` for `calendar_viewed` (read live against the hosted database on 2026-08-19). Widening it is a third Phase 2P migration and therefore a stop condition, so **the month emits no `calendar_viewed`**. Forbidden while this stands: widening the client vocabulary past what the migration declares, which would produce an event the client accepts and the database silently refuses; labelling the month as any of the three admitted values, which would put a false statement in an append-only ledger; and any column, table, RPC or migration for it. This is consistent with the requirement's own **"creates no new write path"**, and it carries **no owner signature yet**.

  *Signed by the owner on 2026-08-20; see ADR-122's amendment of that date.* The owner **refuses** both a third migration and a vocabulary widening for this purpose. The month therefore **remains without an event of its own in this phase**; `calendar_viewed` **stays valid** for the three deployed orientations, with its producer and consumer untouched; **the absence of an event for the month is not a broken event**; no existing literal may be reused with false semantics; `month` must not be sent to a validator that refuses it; no parallel telemetry channel may be created; and the item is a **remainder explicitly not funded**, routed to the successor's re-audit. **It does not block the calendar's functional closure**, and the traceability contract's **refusal 9 must not fire on it**.
- **2P-CALENDAR-002:** Task, reminder and review use a small consistent visual vocabulary that also works without color.
- **2P-CALENDAR-003:** Opening or rescheduling an item preserves the selected period and scroll context.
- **2P-CALENDAR-004:** Empty, partial, loading and failed lanes remain distinguishable.
- **2P-CALENDAR-005:** The calendar reflows on mobile without horizontal page scrolling or clipped actions.

### 3.11 `2P-REMINDER` — creation in a focused modal/sheet (5)

- **2P-REMINDER-001:** The page header contains a single “New reminder” action, not an inline creation form.
- **2P-REMINDER-002:** The modal/sheet groups content, date and time, importance, an optional link, and the save and cancel actions, in that order.

  *Corrected by the owner on 2026-08-19; see ADR-121's amendment of that date.* Superseded wording, preserved: *"The modal/sheet groups content, schedule, recurrence/importance and optional links in that order."* It named recurrence, and `reminders` has **no recurrence column of any kind** — `id, user_id, title, remind_at, important, status, sent_at, snoozed_until, task_id, entry_id, created_at, updated_at` — so offering it would need a third Phase 2P migration, which is a stop condition. **Recurrence is not offered in this phase, because the product has no persistent model for it.** It becomes the explicit traceable remainder **`2P-REMINDER-RECURRENCE`**, and it is never classified `built`, `baseline` or `partial` for this implementation. Forbidden while it stands: a recurrence control that does not work; recurrence encoded in free text; duplicated reminders simulating a repeat; reuse of an existing column for it; any column, table, RPC or migration; and any change to what the current scheduling means. The count stays 87 and no ID is renumbered.
- **2P-REMINDER-003:** Create and reschedule share vocabulary and validation without creating a second write path.

  *Delivered in slice 2P.7, with one traceable remainder.* **`2P-REMINDER-REVALIDATE-HANG`** — the first *working* `revalidatePath` this route has ever had freezes the creation dialog: the server answers 200, nothing is logged in the server, the console or as a page error, and `pending` stays true. Measured against `next start` over ten consecutive creations — none 10/10 at ~1.4s, with it ~3.9s and a hang past 120s after two to five, client-side refresh 10/10 at ~1.88s. **It is not slice 2P.7's code**: it reproduces with that slice's own loader stubbed out of the page, and a worktree at `main` `d30177f` carrying the old inline form fails the same journey 2 in 12. `applyReminderCommand` still revalidates a resolved path, so no action on this page had ever re-rendered it. The refresh therefore runs on the client **after the dialog has closed**, where ordering rather than luck makes it safe. **A caution for the remaining `revalidatePath` repairs: fixing one can turn a dead call into a live freeze.** Carries **no owner signature yet**.

  *Signed by the owner on 2026-08-20; see ADR-122's amendment of that date.* The owner authorizes **repairing it inside slice 2P.8, without a migration**, as a real UX defect: an action can write and leave the interface stuck **or not reflecting the result**. The second half is the part still live on `03a978e`/`f52755c`: `applyReminderCommand`'s resolved-path `revalidatePath` matches nothing, so **snooze, reschedule, edit, cancel and restore write and the list never re-renders**. The repair must reproduce first against the current `main`, tell cold start, revalidation, transition, unmounted dialog and Server-Action response apart, never leave a permanent *"Salvando…"*, reflect save **and undo** without a manual reload, never close a dialog during its own transition, preserve focus and context, not duplicate a write, never turn a timeout into a success, show a **true** error on failure, work cold and warm, be proved on **desktop and mobile**, need **no migration**, and **not silently refactor the remaining `revalidatePath` call sites** — which stay a named remainder.
- **2P-REMINDER-004:** Cancel closes without writing and restores focus and page context.
- **2P-REMINDER-005:** Reminder cards prioritize content and next occurrence; destructive actions are visually secondary but reachable.

### 3.12 `2P-MOBILE` — phone-first evidence (5)

- **2P-MOBILE-001:** The composer, dialogs, settings navigation, graph alternative and calendar are exercised on an iPhone-sized production browser.
- **2P-MOBILE-002:** Keyboard, IME, safe areas and viewport resizing do not hide the active field or primary action.
- **2P-MOBILE-003:** Every new interactive target is at least 44 by 44 CSS pixels.
- **2P-MOBILE-004:** Zoom and 320 CSS-pixel reflow preserve content and actions.
- **2P-MOBILE-005:** Hardware-dependent claims are marked NOT EXECUTED until the owner runs them on a real device.

### 3.13 `2P-ACCESS` — understandable without sight or precision pointing (5)

- **2P-ACCESS-001:** Composer controls have stable accessible names and announce recording, transcription, upload and send states.
- **2P-ACCESS-002:** Dialogs trap focus only while open, close predictably and restore focus to their launcher.
- **2P-ACCESS-003:** Tabs implement keyboard selection and expose the active panel.

  *Interpreted by the owner on 2026-08-20; see ADR-122's amendment of that date. The wording above is preserved unchanged.* The requirement **must represent the navigation the product actually uses**. The five surfaces it points at — `work-modes`, `brain-lenses`, `relation-view-controls`, `settings-section-nav`, `data-ai-tabs` — navigate **between separate documents by link**, and each already carries a signed decision to do so. It is therefore discharged by **semantic links**, `aria-current="page"` on the active destination, a **visible focus indicator**, working **keyboard, Enter, back and forward**, and the new document's **title and context announced adequately**. It is expressly **not** discharged by `role="tablist"`, `role="tab"` or `role="tabpanel"`, by a **roving `tabindex`**, or by turning cross-document links into **false ARIA tabs**; **the five prior decisions are not reversed**. It may be classified `baseline` **only after every relevant surface is proved** — never by inheritance from an adjacent one.
- **2P-ACCESS-004:** Automation and Needs You outcomes are announced without interrupting for background work.
- **2P-ACCESS-005:** A real VoiceOver session executes the critical capture, review, settings and reminder paths before closeout.

### 3.14 `2P-CLOSE` — truthful completion (5)

- **2P-CLOSE-001:** A generated traceability matrix classifies every requirement exactly once.
- **2P-CLOSE-002:** Every partial or undelivered item names a concrete remainder and destination.
- **2P-CLOSE-003:** Security disposition covers automatic writes, undo, audio lifetime, file handling and conversation diagnostics.
- **2P-CLOSE-004:** Hosted parity, residue, rollout posture and signup state are read live at closeout.
- **2P-CLOSE-005:** The roadmap successor is re-audited but not started or planned by closeout.

## 4. Explicit exclusions

- Fixing the existing Apple Web Push HTTP 403 or validating Android push.
- Opening public signup or changing rollout ownership.
- Scheduling retention sweeps, SMTP work or the restore drill.
- A new AI provider, durable audio, background microphone capture or automatic send.
- Persisting inferred relations as facts.
- Redesigning public marketing/authentication pages already closed by Phase 2O.

## 5. Success measure

The phase succeeds when a person can capture by typing, file or voice from Today;
trusted results complete without ceremony; uncertain results ask one precise
question; Conversation works and is visible; settings and notification history
have clear homes; and every changed flow is usable on an iPhone with VoiceOver.
