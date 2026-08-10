# Phase 2M — UX gaps and opportunities

**Status:** planning evidence. Derived from
`PHASE_2M_CURRENT_EXPERIENCE_AUDIT.md`. Nothing here is a commitment; each gap
is stated with what it costs and whether Phase 2M's PRD addresses it.

---

## 1. The gaps, ranked by user cost against implementation cost

### G1 — A label with no behaviour: "Planejado"

**What the user sees.** A task detail field and a list line reading
*"Planejado: 12/08 09:00"*, and a command *"mudar o dia planejado"*.

**What actually happens.** Nothing. `planned_at` drives no view, no filter, no
ordering, no reminder and no notification (audit §1.2). A user who plans their
week finds their plan nowhere the next morning: Hoje is a deadline queue, Work's
`today` view is a `due_at` predicate, and the heartbeat never looks at plans.

**Cost to the user:** the highest in this phase. It is not a missing feature —
it is a promise the interface makes and the product does not keep.

**Cost to build:** the lowest of the four large gaps. Zero schema. The column,
the audit trail, the command action, the projection and the rendering all exist;
what is missing is a predicate, an ordering and a surface.

**Addressed by:** `2M-PLAN-001` … `-004`, and OD-2M-3.

---

### G2 — Five settings that change nothing

**What the user sees.** In settings: a daily review time, a weekly review day
and time, a planning day and a planning time.

**What actually happens.** Those five columns are read by the settings surface
and by nothing else. Reviews are on demand only, and the reviews page says so in
both locales (audit §5.2–§5.3).

**Cost to the user:** a user who sets "daily review at 22:00" reasonably
believes something will happen at 22:00. Nothing will. This is the same class of
defect as G1 and it is worse in one way: the user configured it deliberately.

**Cost to build:** the honest answer is *a decision, then either a consumer or a
removal*. Both are cheap; leaving it as it is is the only expensive option,
because it compounds.

**Addressed by:** `2M-AUDIT-005`, `2M-REVIEW-006`, `2M-REVIEW-007`.

---

### G3 — Nothing shows a day

**What the user sees.** Deadlines on Work, reminders on Reminders, reviews on
Reviews, and today's priorities on Hoje.

**What is missing.** Any surface where those appear **together on a timeline**.
A user cannot answer "what does Thursday actually contain?" without visiting
three pages and holding the answer in their head.

**Cost to build:** a genuine surface, but with **zero schema** — the five lanes
all exist (audit §6.1), and the reschedule path, the preview, the partial-result
vocabulary and the undo all exist too (audit §9).

**Addressed by:** `2M-CAL-001` … `-011`.

---

### G4 — A review that cannot become an action

**What the user sees.** A generated review they can read and edit.

**What is missing.** Any path from a conclusion to a change. "Three things
slipped this week" cannot become three rescheduled tasks without leaving the
review, finding each task and editing it.

**Cost to build:** moderate, and **entirely reuse** — every action a review would
produce already exists as a validated, undoable command.

**Addressed by:** `2M-REVIEW-003` … `-005`.

---

### G5 — Notifications the user cannot govern

**What exists and works.** Quiet hours, a daily cap, a 24-hour per-item
cooldown, dedupe, and an important-only exception during quiet hours (audit
§4.2). This is genuinely good machinery.

**What is missing.** Any way for the user to see or change most of it, per type
or per frequency; and any consent concept at all. Today the controls that exist
are two time fields.

**Cost to build:** moderate for the governance half, high for any outbound half
— which is why they are separated (OD-2M-4).

**Addressed by:** `2M-NOTIFY-001` … `-011`.

---

### G6 — Two definitions of "today"

**What is true.** `localDayBounds` (TypeScript) and the heartbeat's PL/pgSQL
boundary computation are independent implementations of the user's local day
(audit §2.3–§2.4). They agree today because they are asked different questions on
different surfaces.

**Why it becomes a gap.** A calendar day column and a notification about that
day ask the **same** question. And `localDayBounds` returns `start + 24h`, which
is not the end of a 23-hour or 25-hour DST day.

**Cost to the user when it goes wrong:** an item that appears on the wrong day,
twice a year, in a way nobody reproduces on demand.

**Addressed by:** `2M-TIME-001` … `-007`.

---

### G7 — Reminders on a calendar would leak what tasks do not

**What is true.** Task sensitivity is derived and masked (OD-2L-1 B).
`reminders.entry_id` is the same relationship, and **nobody has derived through
it** (audit §7.3).

**Why it becomes a gap.** The moment a calendar renders `reminder.title`
alongside a masked task title, the surface protects one and exposes the other —
which is exactly the divergence slice 2L.1 found on Hoje, one entity over.

**Addressed by:** `2M-PRIVACY-005` and OD-2M-1.

---

### G8 — A service worker nobody is watching

**What is true.** `public/sw.js` exists, is registered in production, calls
`skipWaiting()` and `clients.claim()`, and is invisible to the guard that
asserts the absence of push (audit §4.3).

**Why it is an opportunity and not only a risk.** It means a future push surface
does not need a new registration — and it means the update-ordering problem is
**already there**, unowned, and should be owned before anything is added to it.

**Addressed by:** `2M-AUDIT-006`, and OD-2M-4's framing.

---

## 2. Opportunities that are cheap because Phase 2L already paid for them

| Opportunity | What already exists |
|---|---|
| "Reschedule these five" from a calendar | selection with a ceiling of 50, preview, truthful partial results, bulk eligibility with destructive excluded |
| Undo a reschedule where it happened | `UndoAffordance` + `undoWorkOperation` → `public.undo_operation`, 24-hour window |
| A shareable link to a specific week | the URL-is-the-state contract and its fail-closed **narrower** defaults |
| Open an item and come back | the return-position contract |
| Masked task titles on a new surface | derived sensitivity + `ProtectedContent` + the convergence guard |
| A content-free notification payload | `notificationCopy(locale)`, whose signature is asserted by a guard |

**None of these authorizes its consumer.** Each is available; using it is a
decision to take with the owner.

---

## 3. Opportunities deliberately **not** taken

| Not taken | Why |
|---|---|
| Drag-to-reschedule as the primary interaction | OD-2M-6; it makes the primary path unreachable by keyboard and unusable by screen reader |
| An appointment/event entity | OD-2M-3; the committed-versus-suggested distinction is already representable, and an event entity pulls recurrence back in |
| Recurrence | OD-2M-7; a domain, not a slice, and the product already refuses it honestly |
| An AI-generated daily plan | a provider call whose cost, consent and provenance are a separate decision; and it collides with "nothing moves by itself" |
| External calendar sync | the roadmap's own boundary; needs separate authorization |
| Kanban / user ordering | named as missing by Phase 2L, still missing, not needed here |

---

## 4. What would make this phase fail

Stated plainly, because each has happened here before in some form:

1. **A producer before its migration.** Cost so far: two extraordinary
   corrections.
2. **A `partial` whose remainder says nothing is pending.** Cost so far: two
   wrong published classifications in Phase 2L, corrected only by an independent
   pass.
3. **A real-device claim satisfied by an emulator.** Not yet paid for, and the
   cheapest possible way to make a notification phase dishonest.
4. **A new surface rendering a title directly.** Caught by a guard — but only if
   the surface is added to `GOVERNED_SURFACES`, which is a step somebody has to
   take.
5. **A control with no consumer**, or **an event with no reader**. Both already
   recorded, in both directions.
6. **Scope that cannot close.** Calendar + planning + reviews + notifications is
   already four domains. Adding recurrence or an event entity makes five and six.
