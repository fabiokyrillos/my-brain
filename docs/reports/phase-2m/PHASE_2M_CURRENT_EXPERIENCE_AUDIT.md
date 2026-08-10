# Phase 2M — Calendar, planning rituals and notifications · current-experience audit

**Status:** planning evidence. This document builds nothing, authorizes nothing
and declares no requirement. It records **what the repository actually does
today** for every subject Phase 2M's candidate scope names, with the file and
line that proves it.

**Baseline:** `main` at `5e6174bb3f50da5f8560c5b7702642b0b1e83545`, 89
migrations, hosted parity `202608090089` **confirmed by a live read-only
`supabase migration list --linked` on 2026-08-09** — 89 rows, local equal to
remote on every one, zero local-only, zero remote-only. Public signup closed.

**Method.** Every absence below is proved by a search and by naming the contract
that would have to carry the thing if it existed. "We did not find it" is not
recorded as an absence anywhere in this document; "the only declaration is X and
X does not contain it" is.

---

## 1. `planned_at` — what it means today

### 1.1 It exists, it is writable, it is audited, it is displayed

| Property | Evidence |
|---|---|
| Column | `tasks.planned_at timestamptz` (nullable), `supabase/migrations/202607160003_intelligent_capture.sql:115` |
| Change is audited | `202607160014_task_change_audit.sql:17,22,23` — `planned_at` is in the trigger's change predicate and in both `before_state` and `after_state` |
| Settable at confirmation | `edit_changes ? 'plannedAt'` in the candidate-confirmation RPC chain (`202607210036:427`, `202607220038:629`, `202607220039:611`, `202607220040:1155`) |
| Settable by command | `set_planned` is one of the fifteen `TASK_COMMAND_ACTIONS` (`src/features/task-commands/taxonomy.ts:54`) |
| Selected by the Work projection | `src/features/daily-cycle/work-projection.ts:238`, mapped to `plannedAt` at `:300` |
| Carried by the contracts | `src/features/daily-cycle/contracts.ts:335`, `projection-mappers.ts:72,374,410` |
| Rendered | `src/features/operations/task-list.tsx:344-345` ("Planejado: " / "Planned: "), `src/features/daily-cycle/task-detail-view.tsx:178` |
| Named to the user | `set_planned: "mudar o dia planejado"` / `"change the planned day"` (`src/features/task-commands/copy.ts:366,641`) |

### 1.2 It has **no read-side semantics anywhere**

This is the audit's single most consequential finding, and it is proved rather
than asserted.

A search over `src/**/*.{ts,tsx}`, excluding tests, for `planned_at` in any
PostgREST predicate or ordering position — `.eq(`, `.gte(`, `.lt(`, `.not(`,
`.order(` — **returns nothing**. There is no filter, no view predicate, no
ordering, no grouping and no notification rule that consults it:

- **Work views.** The `today` view's predicate is `due_at`, not `planned_at`
  (`work-projection.ts:242-243`). The `waiting` view is a `status` predicate.
- **Work filters.** `WORK_DUE_FILTERS = ["any","overdue","today","upcoming","none"]`
  are all `due_at` predicates (`work-projection.ts:267-275`).
- **Work ordering.** `WORK_ORDERS = ["default","due_asc","due_desc","updated_desc","updated_asc"]`
  (`work-query.ts`) — no planned ordering exists.
- **Hoje.** `dueState()` reads `due_at` only (`today-priorities.ts:106-116`);
  `localDayBounds()` is used to classify deadlines, never plans.
- **Heartbeat.** `run_user_heartbeat`'s three candidate sources are
  `tasks.due_at < now()`, `tasks.updated_at` staleness and
  `reminders.remind_at <= now()` (`202608040071_account_lifecycle_wiring.sql:640-706`).
  `planned_at` appears nowhere in it.

**Statement of fact:** `planned_at` is a **write-then-display** field. A user can
set it, the change is audited, the value is shown on two surfaces, and **nothing
in the product ever acts on it**. The word "planned" in the UI is therefore a
label without a behaviour behind it.

### 1.3 Due date versus planned date, as the product currently distinguishes them

| | `due_at` | `planned_at` |
|---|---|---|
| Meaning implied by copy | deadline / prazo | "o dia planejado" / "the planned day" |
| Drives a view | yes (`today`) | no |
| Drives a filter | yes (four of five) | no |
| Drives ordering | yes (two orders) | no |
| Drives a notification | yes (`task_overdue`) | no |
| Drives Hoje's priorities | yes | no |
| Settable by command | `reschedule_due`, `clear_due` | `set_planned` (no clear) |
| Intentional absence modelled | yes — `intentional_no_due` + `no_due_reason` | no |

**There is no `clear_planned` action.** `TASK_COMMAND_ACTIONS` contains
`clear_due` and no counterpart, so a planned day set once cannot be removed
through the command path. This is a real asymmetry a planner surface would meet
on its first day.

---

## 2. Time, timezone, day boundaries and DST

### 2.1 Where the user's timezone lives

`public.profiles.timezone text not null default 'America/Sao_Paulo'`
(`202607160001_phase1_identity.sql:12`). One column, per user, always present.

### 2.2 How it is resolved on the read path

- `work-projection.ts` validates a candidate zone by constructing an
  `Intl.DateTimeFormat` and additionally requiring `value.includes("/") || value === "UTC"`
  (`:89-97`) — so a bare `"EST"` is rejected as under-specified.
- `task-detail-projection.ts:101-110` and `review-projection.ts:328-359` each
  read `profiles.timezone` and fall back to `defaultAgentPreferences.timezone`.
- Formatting always passes `timeZone` explicitly to `Intl.DateTimeFormat`
  (`entry-outcome-projection.ts:92-98`, `task-list.tsx:345`).

### 2.3 Day boundaries and DST, on the application side

`localDayBounds(now, timeZone)` (`today-priorities.ts:60-74`) formats the instant
in `en-CA` to obtain `YYYY-MM-DD`, then subtracts the offset **re-read at that
instant** by `zoneOffsetMs()` (`:76-97`). The comment states the reason
explicitly: *"Re-read the offset at that instant instead of assuming a fixed one,
so a DST transition inside the day cannot shift the boundary."*

**What this does and does not give Phase 2M.** It gives a correct *start* of the
user's day. It computes `end = start + 24h`, which is **not** the local day's end
on a DST transition day (23h or 25h). No surface today depends on that
difference, because the only consumers classify a single instant as before/inside/
after. **A calendar with a day column and a week grid does depend on it.**

### 2.4 Day boundaries on the database side

`run_user_heartbeat` computes `local_day_start`/`local_day_end` from
`profiles.timezone` for the daily cap
(`202608040071_account_lifecycle_wiring.sql:568-647`). Quiet hours are compared
as `time` values against the user's local clock, with the wrap-around case
handled (`in_quiet_hours := case when quiet_start < quiet_end then … else … end`,
`:621-629`, originally `202607160007:238`).

**Consequence:** there are **two independent implementations** of "the user's
local day" — one in TypeScript (`localDayBounds`) and one in PL/pgSQL
(`run_user_heartbeat`). They agree today because they answer different questions
on different surfaces. A calendar and a notification about the same day would
make them answer the *same* question, and nothing currently forces them to agree.

### 2.5 What is bounded

The ±730-day lexicon bound for relative-date parsing is enforced in the task
command path. Nothing bounds how far a calendar may be navigated, because no
calendar exists.

---

## 3. Recurrence

**Recurrence does not exist, and the product says so deterministically.**

- `recurrence_requested` is a declared member of the task-command refusal
  taxonomy (`src/features/task-commands/taxonomy.ts:89`).
- It has user-facing copy in both locales: *"Ainda não trabalho com agendas que
  se repetem."* / *"I do not handle repeating schedules yet."*
  (`copy.ts:440,715`).
- The extraction contract instructs the model to use it:
  *"Repeating or recurring schedules do not exist: unsupportedReason
  `recurrence_requested`"* (`src/lib/ai/task-command-schema.ts:111`).

A search of `supabase/migrations/` and `src/` for `rrule`, `RRULE`, `recurring`
and `recurrence` outside those declarations returns only unrelated matches
(`String.repeat`, a `recurring_info` memory kind, a `historical_recurrence`
technical-detail label, and prose). **There is no series table, no occurrence
table, no expander, no exception model and no cancellation semantics.**

---

## 4. Notifications — what exists, and where the boundary actually is

### 4.1 The table

`public.notifications` (`202607160007_agent_operations.sql:50-64`):
`type`, `title`, `body`, `action_url`, `priority`, `status`,
`dedupe_key` (unique per user, partial index), `read_at`, `created_at`.
**No sensitivity column. No consent column. No channel column. No delivery
record.**

### 4.2 The only writer

`run_user_heartbeat` (current definition:
`202608040071_account_lifecycle_wiring.sql:640-745`). Three candidate families,
each writing a **task or reminder title into `notifications.body`**:

| type | title (localized, generic) | body |
|---|---|---|
| `task_overdue` | "Tarefa atrasada" / "Overdue task" | `task.title` |
| `task_stale` | "Tarefa sem movimento" / "Task without movement" | `task.title` |
| `reminder` | "Lembrete" / "Reminder" (+ "importante") | `reminder.title` |

Frequency controls that already exist and work:
- **quiet hours** — `agent_preferences.quiet_start` / `quiet_end`
  (`202607160007:2-3`, defaults `22:30`/`07:00`), wrap-around handled;
- **an important-only exception during quiet hours** for reminders (`:512`);
- **a daily cap** counted over the user's local day (`available_slots`);
- **a 24-hour cooldown** per task per type, via a `dedupe_key` prefix match;
- **deduplication** by `dedupe_key` with `on conflict … do nothing`.

### 4.3 Delivery is in-app only — and the guard that says so has a blind spot

`sensitivity-convergence.test.ts:145-176` asserts that no file under
`src/features/pwa`, `src/features/agent` or `src/app` matches
`showNotification|PushManager|pushSubscription|web-push`. That assertion passes
today and is honest about what it covers.

**It does not cover `public/`.** And `public/sw.js` **exists and is registered**:

```
src/app/layout.tsx:3   import { RegisterServiceWorker } from "@/features/pwa/register-service-worker";
src/features/pwa/register-service-worker.tsx:7-8
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js")
```

`public/sw.js` is a **static-asset cache only**: `install` pre-caches
`/brain-icon.svg`, `activate` deletes non-current caches and claims clients,
`fetch` serves `/_next/static/` and the icon from cache. It registers **no
`push` and no `notificationclick` listener**.

**Two corrections this audit records:**

1. The Phase 2L successor re-audit says *"no service worker"*
   (`PHASE_2L_SUCCESSOR_REAUDIT.md` §2). **A service worker exists and is
   registered in production.** What does not exist is a push handler. The
   consequence is the opposite of reassuring: the registration, the update
   lifecycle and the `skipWaiting()`/`clients.claim()` behaviour are **already
   live**, so a push surface would not be starting from zero — it would be
   modifying a worker that is already installed on every production client.
2. The push-absence guard's scope (`src/features/pwa`, `src/features/agent`,
   `src/app`) **cannot see `public/sw.js`**, and the file is `.js` rather than
   `.ts`. A `push` listener added there would be invisible to the only guard that
   claims the absence.

### 4.4 Consent

There is no notification consent model. `policy_acceptances` exists and governs
legal documents, not delivery channels. `agent_preferences.privacy_preferences`
is a free `jsonb` with no declared notification key.

### 4.5 Email

No email is sent by the product. Transactional auth email is GoTrue's
(confirmation, recovery), configured in `supabase/config.toml`, and is outside
the product's own write paths.

---

## 5. Reviews

### 5.1 There is no `reviews` table

Reviews are rows in **`public.summaries`**
(`202607160007_agent_operations.sql:80-98`):
`period_type in ('daily','weekly_review','weekly_plan','monthly')`,
`period_start date`, `period_end date`, `title`, `content`, `original_content`,
`status in ('generated','edited','outdated')`, `model`, token counts,
`unique (user_id, period_type, period_start, period_end)`.

Read by `src/features/reviews/review-list.ts:21` and written by
`src/features/agent/actions.ts:1028`.

### 5.2 Reviews are **on demand only**, and the surface says so

`src/app/[locale]/app/reviews/page.tsx` renders four buttons — `daily`,
`weekly_review`, `weekly_plan`, `monthly` — under the header copy:

> *"Gere uma revisão quando quiser; **nada é executado por horário
> configurado**."* / *"Generate a review when you choose; **nothing runs from a
> configured schedule**."*

### 5.3 The scheduling preferences exist and are inert

`agent_preferences` carries `daily_review_time` (default `22:00`),
`weekly_review_day` (default 5), `weekly_review_time` (`19:00`), `planning_day`
(default 1) and `planning_time` (`08:00`)
(`202607160001_phase1_identity.sql:24-28`).

Every consumer of those five columns is the settings surface:
`src/features/profile/actions.ts:36` reads them,
`src/features/profile/settings-payload.ts:51-57` maps them for display, and the
tests fixture them. **No scheduler, no cron job, no Edge Function and no RPC
reads any of them.** The only `pg_cron` entries in the repository are the hourly
heartbeat, the job-queue tick, the entry-interpretation tick, the BYOK
validation throttle sweep, the auth-attempt sweep and the retention sweeps —
enumerated at `cron.schedule` call sites across six migrations.

**Statement of fact:** the product offers five review/planning schedule
preferences that **change nothing**. That is the same class of defect this
repository has already paid for twice (a producer with no consumer), inverted:
a **stored preference with no consumer**.

### 5.4 Review-to-action

`ReviewBody` renders review content and supports editing the summary. There is
**no** path from a review conclusion to a confirmed domain operation — no
carry-forward, no reschedule, no archive, no follow-up creation. The Phase 2L
re-audit's characterisation ("review-to-act is the gap") is confirmed.

---

## 6. Calendar

**No calendar exists.** The authenticated route set is:

`/app`, `capture`, `chat`, `chat/[conversationId]`, `contexts`,
`contexts/[contextId]`, `costs`, `files`, `history`, `inbox`,
`inbox/[entryId]`, `jobs`, `library`, `memories`, `memories/[memoryId]`,
`notifications`, `organizations`, `organizations/[organizationId]`, `people`,
`people/[personId]`, `projects`, `projects/[projectId]`, `questions`,
`reminders`, `reviews`, `search`, `settings`, `tasks`, `today`, `waiting`,
`work`, `work/[taskId]`, `work/cancelled`, and the `work/@panel` parallel route.

There is no calendar route, no calendar feature directory, no external-calendar
boundary and no consent model for one. `/app/today` is a **redirect to `/app`**
(Hoje), documented in place as `2J-HOJE-001`/`-002`.

**There is no event entity.** The complete table list at this baseline is:
`account_deletion_attempts`, `account_deletion_log`, `account_lifecycle`,
`agent_preferences`, `ai_model_pricing`, `ai_usage_events`,
`attachment_interpretations`, `attachments`, `audit_logs`,
`auth_event_attempts`, `contexts`, `conversation_messages`, `conversations`,
`credential_validation_attempts`, `entity_aliases`, `entity_attachments`,
`entity_tags`, `entries`, `entry_embeddings`, `entry_entities`,
`entry_interpretations`, `entry_task_candidate_resolutions`, `error_events`,
`heartbeat_runs`, `jobs`, `memories`, `notifications`, `organizations`,
`pending_questions`, `people`, `person_contexts`, `person_projects`,
`person_relationships`, `policy_acceptances`, `product_events`, `profiles`,
`projects`, `rate_limit_events`, `reminders`, `scheduled_job_health`,
`summaries`, `tags`, `task_contexts`, `task_dependencies`, `task_people`,
`task_projects`, `tasks`, `undo_operations`, `user_ai_credentials`.

**No `events`, no `calendar_events`, no `occurrences`, no `series`.**

### 6.1 What a calendar could render today, without any schema

| Lane | Source | Instant | Committed or suggested |
|---|---|---|---|
| Deadlines | `tasks.due_at` | yes | committed |
| Intentions | `tasks.planned_at` | yes | intention (today: inert) |
| Reminders | `reminders.remind_at` | yes | committed |
| Reviews | `summaries.period_start`/`period_end` | date range | record of a period |
| Unconfirmed dates | entry event date persisted by interpretation | yes | **suggested** |

The parent PRD's slice 4.4 asks for *"distinção visual entre compromisso
confirmado e sugestão"*. That distinction is **already representable** by the
five rows above. It does **not** require a new entity.

---

## 7. Sensitivity — every surface that renders a title

### 7.1 The contract

`src/features/sensitivity/contracts.ts`:
`GOVERNED_SURFACES = ["hoje","attention","capture_receipt","review_summary","notification","chat","work"]`
(`:80-88`), with three outcomes — `show`, `mask` (revealable in place) and
`omit` — where `omit` is documented as existing *"only because [a
notification's] payload leaves the application's control"* (`:98-99`).

`notificationCopy(locale)` (`:165`) returns a fixed `{title, body}` and takes
**one** parameter, the locale. `sensitivity-boundary.test.ts:168-170` asserts
that signature by regex, so a content parameter cannot be added quietly.

### 7.2 Task sensitivity is derived, never stored

`src/features/sensitivity/task-derivation.ts` implements OD-2L-1 option B: a
task's level is the **current** level of its source entry, read at presentation
time from an owner-scoped map keyed by entry id; a task whose source is absent
from that map takes the **most protective** level; a task with **no**
`source_entry_id` is `undetermined` — a variant with **no `level` field**, so
"never classified" cannot decay into "normal".

### 7.3 What this means for the surfaces 2M would add

- A calendar rendering task titles **inherits** the obligation. It must derive
  through `task-derivation.ts` and render through `ProtectedContent`, and it must
  be added to `GOVERNED_SURFACES` — the convergence guard fails a content surface
  that is not.
- **Reminders are derivable by the same mechanism, and nobody has done it.**
  `reminders.entry_id uuid references public.entries(id)`
  (`202607160007:37`) is exactly the relationship `task-derivation.ts` consumes
  for tasks. A calendar lane rendering `reminder.title` would otherwise
  reproduce, for reminders, precisely the divergence slice 2L.1 found on Hoje.
- **`notifications.body` already carries `task.title` and `reminder.title`**
  with no classification consulted (§4.2). In-app and behind authentication this
  is the ordinary surface; **the moment any of it leaves the application, it is
  the `omit` case.**

---

## 8. Telemetry — the enforcement points, by name

`2L-METRICS-005` closed `partial` because Work's selection and bulk-preview
behaviour has no admitting event name and Phase 2L had no migration. The
enforcement points a new event must pass, enumerated rather than counted:

| # | Enforcement point | Where | What it gates |
|---|---|---|---|
| 1 | `product_events_event_name_check` | table CHECK, current definition `202608090088:46-84` | the event **name** |
| 2 | `private.validate_product_event_properties` | `202608090088:124-218` — a `case` over event name with an `else raise … 22023` | the **property keys** |
| 3 | `productEventNames` | `src/features/product-analytics/contracts.ts:114-199` | the application's own vocabulary |
| 4 | `product_events_surface_check` | table CHECK, current definition `202608090089:60-80` | the **surface** |
| 5 | `productSurfaces` | `src/features/product-analytics/contracts.ts:206-236` | the application's surface vocabulary |

**The writer no longer holds a copy of either vocabulary.** `202608080087`
deleted the frozen event-name list from `private.record_product_event` and
`202608090089` deleted the surface list, re-raising a surface violation as
`22023` via `GET STACKED DIAGNOSTICS` so the caller contract survived. That
history is the reason enumeration is a requirement and a count is not: two
separate closeouts were bought by a list nobody had enumerated.

**Consequence for Phase 2M:** any planning/calendar/notification event needs
points 1, 2 and 3; a new `calendar` surface needs 4 and 5 as well. Points 1, 2
and 4 are **one migration**. Points 3 and 5 are application code. **The migration
must precede every producer**, which is exactly what `202608080087` and
`202608090089` cost when it did not.

---

## 9. Bulk, undo, partial results and the URL contract

| Contract | Where | State |
|---|---|---|
| Selection with a ceiling of 50 | `src/features/operations/selection.ts` | shipped |
| Preview before applying | `bulk-preview.ts` | shipped |
| Truthful partial results | `bulk-result.ts` | shipped |
| Bulk eligibility, destructive excluded | `bulk-eligibility.ts` (`BULK_ELIGIBLE_ACTIONS` filters `TASK_COMMAND_ACTIONS`) | shipped; OD-2L-3 A excludes `cancel_task` |
| Undo where the operation happened | `undo-affordance.tsx` + `undoWorkOperation` (`task-commands/actions.ts:1430-1482`) → `public.undo_operation` | shipped, 24h window (`undo_operations.expires_at`) |
| The URL is the complete state | `work-query.ts` (`2L-VIEW-007`), fail-closed **narrower** defaults (`2L-VIEW-008`) | shipped |
| Return position | `work-position.ts` | shipped |

**`reschedule_due` is bulk-eligible today** (it is not destructive, so it
survives the `BULK_ELIGIBLE_ACTIONS` filter). `set_planned` is likewise
eligible. So "reschedule these five" already has a validated path, a preview, a
partial-result vocabulary and an undo — **for `due_at` and for `planned_at`**,
from Work. What it does not have is a calendar to invoke it from.

---

## 10. Gesture posture

OD-2L-5 signed **option A: no gesture on any Work surface**, and
`src/lib/closeout/phase-2l-no-gesture-guard.test.ts` enforces it mechanically
over a **named** surface list, matching the four families (touch, pointer, drag,
swipe) in both the JSX-prop and `addEventListener` shapes, with comments
stripped first. `onClick`, `onChange` and `onSubmit` are explicitly not gestures.

The guard is **scoped to Work surfaces by name**. It therefore does not
pre-decide a calendar — and it also means a calendar's gesture policy is an
owner decision that must be taken explicitly, since "we'll add drag later"
cannot happen quietly on Work and should not be able to happen quietly anywhere.

---

## 11. Accessibility and mobile — inherited state

- `e2e/accessibility.spec.ts` runs in CI; routes behind `src/proxy.ts` cannot be
  reached without a Supabase session, so palette/search/Library are **mirrored**,
  and `accessibility-mirror-guard.test.ts` re-derives every load-bearing
  attribute from component source on each run to bound mirror drift.
- `e2e/online-mobile-navigation.spec.ts` exists for the authenticated mobile
  journey and is manual (online lane).
- **`2L-MOBILE-008` and `2L-ACCESS-008` are open**, both `partial` for want of
  owner-run hardware.

---

## 12. Reconciliation with the Phase 2L successor re-audit

| Re-audit statement | This audit's finding | Correction |
|---|---|---|
| "There is no push payload anywhere — **no service worker**, no `PushManager`, no `showNotification`" | A service worker **exists** (`public/sw.js`) and is **registered in production** (`layout.tsx:3,21`). It has no `push`/`notificationclick` handler. | **Corrected.** The absent thing is the push handler, not the worker. |
| The push-absence assertion | True for its scope; its scope excludes `public/` and non-`.ts` files. | **Recorded as a gap**, not a failure. |
| "Timezone semantics — baseline" | Confirmed, with a bound: `localDayBounds` returns `start + 24h`, which is not a DST-transition day's true end, and two independent local-day implementations exist (TS and PL/pgSQL). | **Refined.** |
| "Daily planning — partial: `planned_at` exists and is editable" | Confirmed and sharpened: it is editable and **never read**. There is also no `clear_planned`. | **Sharpened.** |
| "Review — baseline; review-to-act is the gap" | Confirmed, plus: reviews are on-demand only and **five schedule preferences are inert**. | **Extended.** |
| "Notifications — baseline, in-app only" | Confirmed, with quiet hours, daily cap, 24h cooldown and dedupe already working. No consent model, no channel, no delivery record. | Confirmed. |
| "Calendar — not started" | Confirmed, and **no event entity exists**; but the committed-versus-suggested distinction slice 4.4 asks for is already representable from five existing sources. | **Extended.** |
| "The next Work event costs a migration" | Confirmed, and the enforcement points are now **five, enumerated by name** (§8) rather than counted. | **Enumerated.** |
| "`2L-MOBILE-008`/`2L-ACCESS-008` inherited by dependency" | Confirmed. | Confirmed. |

---

## 13. What this audit refuses to conclude

- It does **not** conclude that a calendar should exist, what it should render,
  or what `planned_at` should come to mean. Those are owner decisions, presented
  in `docs/initiatives/phase-2m/PHASE_2M_PRD.md` §10 with options and impact.
- It does **not** propose schema. No table, column, RPC, policy or grant is
  designed here.
- It does **not** treat any absence above as a defect. Several are deliberate
  (`recurrence_requested`, on-demand reviews, no push). They are recorded as the
  state a plan must be written against.
