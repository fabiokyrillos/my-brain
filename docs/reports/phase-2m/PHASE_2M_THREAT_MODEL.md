# Phase 2M — threat model

**Status:** planning evidence. Every threat below is stated against the
repository as it is at `5e6174bb3f50da5f8560c5b7702642b0b1e83545`, with the
existing control named where one exists and the gap named where none does.

**Trust boundaries this phase would touch**

1. `authenticated` → Postgres, mediated by RLS and validated RPCs. *Unchanged.*
2. Server Action → command path → audit + undo. *Reused, never duplicated.*
3. Presentation → sensitivity derivation. *Extended to new surfaces.*
4. **Application → outside the application.** This does not exist yet. If
   OD-2M-4 signs outbound delivery, Phase 2M creates the **first** egress of
   user-linked data in this product, and everything in §T-16 … §T-22 becomes
   live rather than hypothetical.

---

## T-01 — Reading another user's task, reminder or day

**Vector.** A calendar range query, a planner selection, or an id in a URL.

**Existing control.** Every user-owned table has non-null `user_id`, forced RLS
and least-privilege grants; relationship rows prove ownership through composite
FKs `(user_id, id)`.

**Requirement.** No new read path may widen scope; every projection is
owner-scoped at the query, not at the render. `2M-CAL-005` forbids a parameter
resolving to a **wider** result set or date range.

---

## T-02 — A calendar that leaks by existence

**Vector.** A day cell, a count, a lane header or an aria label that differs
depending on whether a record the reader may not see exists.

**Existing control.** `2L-PRIVACY-005`'s pattern: absence from the owner-scoped
map is one indistinguishable state.

**Requirement.** `2M-PRIVACY-006` — no refusal, empty state, count, aria label,
error or telemetry property may differ in a way that reveals existence,
classification or content.

---

## T-03 — A sensitive title on a new surface

**Vector.** A calendar item, a planner row, a review action list.

**Existing control.** Derived sensitivity + `ProtectedContent` +
`sensitivity-convergence.test.ts`, which fails a content surface that does not go
through the contract.

**Gap.** The guard only governs surfaces listed in `GOVERNED_SURFACES`. Adding
the surface to that list is a step a person takes.

**Requirement.** `2M-PRIVACY-001` binds the two together: the surface joins
`GOVERNED_SURFACES` **in the same change** that ships its first consumer.

---

## T-04 — Reminder titles rendered unprotected beside masked task titles

**Vector.** A calendar lane for reminders.

**Gap.** No derivation exists for reminders today, though `reminders.entry_id`
makes one possible with no schema change.

**Requirement.** `2M-PRIVACY-005` and OD-2M-1: derive, or do not render the
title. Rendering it directly is refused.

---

## T-05 — A sensitive title in a notification

**Existing state.** `notifications.body` already carries `task.title` and
`reminder.title`, written by `run_user_heartbeat`, with **no** classification
consulted. In-app and behind authentication, this is the surface OD-2J-1 treats
as ordinary.

**Threat.** The same body reaching any surface that is **not** behind
authentication.

**Requirement.** `2M-NOTIFY-006` and `-008`: content stays in-app; anything
leaving the application carries none.

---

## T-06 — A payload on a lock screen

**Threat.** A push notification renders on a locked device, to anyone holding
it, with no authentication at all. This is the strongest argument in the whole
phase for a content-free payload.

**Existing control by construction.** `notificationCopy(locale)` takes exactly
one parameter, and `sensitivity-boundary.test.ts` asserts that signature by
regex.

**Requirement.** `2M-NOTIFY-006`, `-007`. The payload type must have **nowhere**
to put content, and a guard fails on a content-carrying parameter.

---

## T-07 — A permission prompt too early

**Threat.** A browser permission prompt on first load is both a dark pattern and
a one-shot resource: a denial is sticky and often unrecoverable without the user
digging through browser settings.

**Requirement.** `2M-NOTIFY-003`: no permission requested on first load, on
sign-in, or from any surface the user did not navigate to for that purpose.

---

## T-08 — A stale or hijacked service worker

**Existing state — and this is the correction that matters.** `public/sw.js`
**exists and is registered in production**, and it calls `skipWaiting()` and
`clients.claim()`. The Phase 2L re-audit's "no service worker" is wrong.

**Threats.** (a) A push handler added to a worker already installed on every
client, with no defined update ordering, so old and new workers coexist.
(b) A worker that outlives a revoked consent and keeps rendering notifications.
(c) A worker caching a response it should not.

**Existing control.** The current worker only caches `/_next/static/` and one
icon, only for same-origin `GET` — a deliberately narrow scope.

**Gap.** The push-absence guard scans `src/features/pwa`, `src/features/agent`
and `src/app` for `.ts`/`.tsx` files. **It cannot see `public/sw.js`.**

**Requirement.** `2M-AUDIT-006` measures this before anything is built;
`2M-NOTIFY-010` requires revoked/expired/failed to be distinguishable states with
bounded behaviour; and any 2M.4b work defines update ordering explicitly.

---

## T-09 — Delivery after consent is revoked

**Threat.** A subscription outlives the consent record; the sender does not
re-check; the user is notified after opting out.

**Requirement.** `2M-NOTIFY-001` (revocation takes effect without a further
step), `-002` (absence of consent means no delivery, never default-on), `-009`
(every delivery records the consent record it ran under).

---

## T-10 — Quiet hours ignored on a new channel

**Threat.** Quiet hours are enforced inside `run_user_heartbeat`. A second
delivery path that does not go through it inherits nothing.

**Requirement.** `2M-NOTIFY-005`: quiet hours, the daily cap, the 24-hour
cooldown and dedupe are **proved per channel**, never inherited by assumption.

---

## T-11 — Duplicate delivery

**Existing control.** `notifications_user_dedupe_idx` (unique per user on
`dedupe_key`) plus `on conflict … do nothing`, plus a 24-hour cooldown by
`dedupe_key` prefix.

**Threat.** A second channel that dedupes independently, so one event arrives
twice by two routes.

**Requirement.** `2M-NOTIFY-005`, `-010`, and a bounded retry — never indefinite.

---

## T-12 — An unaudited outbound action

**Standard.** Every automatic action in this product is auditable: actor, source,
reason, target, time, resulting state.

**Requirement.** `2M-NOTIFY-009` — auditable **without** recording content, of
which there is none.

---

## T-13 — Wrong timezone, wrong day

**Threat.** A boundary computed in the server's zone or the browser's rather than
`profiles.timezone`; an item that appears on the wrong day.

**Requirement.** `2M-TIME-003`: computed from the stored zone; a missing or
invalid zone is a **caller error**, never a silent default.

---

## T-14 — DST

**Threat.** `localDayBounds` returns `start + 24h`. On a 23-hour or 25-hour day
that is not the local day's end. Two implementations of "local day" exist and
nothing forces them to agree.

**Requirement.** `2M-TIME-001`, `-002`, `-004`: one definition, a true local end,
and transitions tested in both directions in both hemispheres.

---

## T-15 — Timezone change rewriting stored data

**Threat.** A user changes zone and a stored instant is silently rewritten to
"keep the same local time".

**Requirement.** `2M-TIME-005`: a defined, tested result on every dated surface,
and **no stored value silently rewritten**.

---

## T-16 — Recurrence, duplicated or lost

**Threat, if recurrence were built.** A series expanded twice produces duplicate
occurrences; an expansion that skips a DST boundary loses one; editing one
occurrence silently edits the series; undo restores the wrong scope.

**Control.** `2M-RECUR-001` … `-003`: out of scope by rule, guarded against
appearing "in preparation", with the existing deterministic refusal re-asserted
by test.

---

## T-17 — Concurrent rescheduling

**Threat.** Two surfaces (calendar and planner, or two devices) reschedule the
same task; the second write silently overwrites the first; the undo row then
restores a state neither user chose.

**Existing control.** The command path's audit rows record before and after
state; `undo_operations` stores `before_state`.

**Requirement.** Every reschedule is a confirmed operation through that one path
(`2M-CAL-009`, `2M-PLAN-005`), so there is exactly one place where the race can
be reasoned about — and the plan requires it to be reasoned about rather than
assumed away.

---

## T-18 — Stale client state

**Threat.** A calendar rendered from a projection taken before a change; a
planner acting on an item that has since been completed or cancelled elsewhere.

**Requirement.** `2M-CAL-010` and `2M-PLAN-008`: the result is truthful,
including partial, and an item that could not change says why. An operation
whose target moved must not be reported as applied.

---

## T-19 — Undo applied to the wrong item

**Threat.** An undo affordance rendered far from the operation, or reused across
two operations, undoing something the user did not mean.

**Existing control.** Undo lives where the operation happened; the window is
`undo_operations.expires_at` (24h); `public.undo_operation` is a handler registry
keyed by operation.

**Requirement.** `2M-CAL-010`, `2M-PLAN-005`, `2M-REVIEW-005`.

---

## T-20 — A partial result presented as total

**Threat.** "5 tarefas reagendadas" when three succeeded.

**Existing control.** `bulk-result.ts`'s partial-result vocabulary.

**Requirement.** `2M-CAL-010`, `2M-PLAN-009`, `2M-REVIEW-005`, and the
traceability contract refuses a bulk claim with no partial-result truth.

---

## T-21 — An accidental gesture changing a commitment

**Threat.** A drag or a swipe on a dense mobile grid moves a real commitment,
possibly with no visible confirmation.

**Control.** OD-2M-6, and `2M-MOBILE-003`/`-004` regardless of what it signs:
every gesture-reachable action is also visible and keyboard-reachable, and every
touch-initiated change is confirmed or undoable.

---

## T-22 — Telemetry carrying content

**Threat.** A calendar or planner event property holding a title, a project
name, or a user-chosen date that identifies an item.

**Existing control.** `private.validate_product_event_properties` whitelists keys
per event and raises `22023` for anything else; the whitelist is the privacy
mechanism precisely because no key can hold text.

**Requirement.** `2M-METRICS-004`, and the traceability contract refuses
telemetry carrying content.

---

## T-23 — Vocabulary drift between CHECK, validator and writer

**History.** This has fired twice: `202608080087` deleted a frozen event-name
copy from the writer, and `202608090089` deleted the surface copy that the first
correction had described as "a non-vocabulary guard" — *"and calling it something
else is what let it survive."*

**Current state.** The writer holds no copy. Five enforcement points remain,
enumerated by name in the audit §8.

**Requirement.** `2M-AUDIT-002` (enumerate by name, not by count),
`2M-METRICS-002` (widen every point in one migration, with assertions that
nothing pre-existing was lost).

---

## T-24 — A producer before its migration

**History.** The direct cause of both corrections above. A producer wraps
emission in `.catch(() => {})`, so a refused event is **silent**.

**Requirement.** `2M-METRICS-001`: the migration lands first, and a guard fails
the build if a producer names an event the deployed vocabulary does not admit.

---

## T-25 — `service_role` as a shortcut

**Threat.** A calendar range query or a notification sender reaching for the
service key to avoid an RLS problem.

**Standard.** Authorization lives in the backend and the database. `service_role`
is not an authorization strategy for user-scoped reads.

**Requirement.** Stated in the PRD §6 and enforced by review; any new
`service_role` use is a decision, visible as one.

---

## T-26 — A new parallel authority

**Threat.** A second task-mutation write path introduced "just for the calendar",
bypassing `actionPolicy`, the audit trigger and the undo registry.

**Requirement.** `2M-CAL-009` and `2M-REVIEW-004`: reuse the existing path, and a
guard fails the build if a second appears.

---

## T-27 — A real-device claim that was never run

**Threat.** A closing report claiming lock-screen behaviour, permission flow or
quiet-hours delivery was verified, on the strength of an emulated viewport.

**Requirement.** `2M-DEVICE-004`, and the traceability contract refuses a
close carrying an unexecuted real-device claim. This repository has recorded six
probe-side defects out of twelve in one phase; a harness that tests a different
artifact is its most reliable failure mode.

---

## T-28 — Starting the successor

**Threat.** A successor artifact, requirement, ADR or implementation-marked file
arriving without authorization.

**Existing control.** The A13 detector: four signals — a governing artifact by
role, a declared requirement in the repository's declaration shape, an accepted
ADR whose heading names the phase, and an implementation-marked file — fail-closed
on unreadable inputs.

**Requirement.** `2M-CLOSE-006`.
