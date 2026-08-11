# Phase 2M — slice 2M.0 acceptance · audit-derived foundations, decisions and guards

**Authorization:** ADR-104 (planning), **ADR-105** (implementation through
closeout, all seven decisions signed).

**Baseline:** `main` at `215d6d646752311333de473633b948c0f82fc72d` — the Phase 2M
planning merge — with CI green 3/3 on that exact merge SHA. 89 migrations; hosted
parity `202608090089`; signup closed; rollout gate untouched.

**No visible surface ships in this slice, and no migration is created in it.**

---

## 1. What this slice delivers

| # | Deliverable | Where |
|---|---|---|
| 1 | The **single local-day contract**, in TypeScript | `src/lib/time/local-day.ts` |
| 2 | Its proofs: 23-, 24- and 25-hour days, both hemispheres, and a day with no local midnight | `src/lib/time/local-day.test.ts` (22 cases) |
| 3 | The **SQL half of the same contract**, proved in the database | `supabase/tests/local_day_contract.sql` (16 assertions, `database` CI job) |
| 4 | The two former copies **deleted** and re-pointed at the contract | `today-priorities.ts`, `work-projection.ts` |
| 5 | A guard that a fourth copy cannot appear | `phase-2m-local-day-guard.test.ts` |
| 6 | The **recurrence guard**, including "in preparation" | `phase-2m-recurrence-guard.test.ts` |
| 7 | The **push-boundary guard**, now covering `public/` and `.js` | `phase-2m-push-boundary-guard.test.ts` |
| 8 | The **producer-before-migration guard** | `phase-2m-telemetry-guard.test.ts` |
| 9 | The census, the hardware list and the two device checklists | this document, §2–§7 |

---

## 2. M1 — the census, re-derived at the implementation baseline

`2M-AUDIT-001`. Re-executed rather than carried forward from the planning audit.

### 2.1 `planned_at` — every read and every write

| Direction | Site |
|---|---|
| **write** | `set_planned` in `TASK_COMMAND_ACTIONS`; `edit_changes ? 'plannedAt'` in the candidate-confirmation RPC chain |
| **audited** | `202607160014_task_change_audit.sql` — in the change predicate and in both `before_state` and `after_state` |
| **read (select)** | `work-projection.ts` selects it; `projection-mappers.ts` maps it; `task-detail-projection.ts` carries it |
| **rendered** | `task-list.tsx:344` ("Planejado: "), `task-detail-view.tsx:178` |
| **read (predicate, ordering, filter, view, notification)** | **none** |

The negative was re-proved by search over `src/**/*.{ts,tsx}` excluding tests, for
`planned_at` in `.eq(`, `.gte(`, `.lt(`, `.not(`, `.order(` — **empty**. There is
still no `clear_planned`, and slice 2M.2 adds one.

**No divergence from `PHASE_2M_CURRENT_EXPERIENCE_AUDIT.md` §1.**

### 2.2 Calendar

No calendar route, no calendar feature directory, no event entity. The table list
is unchanged at 49 tables; there is no `events`, `calendar_events`, `occurrences`
or `series`. **No divergence.**

### 2.3 Reviews and the five preferences

Reviews are rows in `public.summaries` — **there is no `reviews` table**.
Generation is on demand only, and `/app/reviews` says so in both locales.

`agent_preferences.daily_review_time`, `weekly_review_day`, `weekly_review_time`,
`planning_day` and `planning_time` are read by `profile/actions.ts:36` and mapped
by `settings-payload.ts:51-57`. **No scheduler, cron job, Edge Function or RPC
reads any of them.** The `pg_cron` inventory is unchanged: hourly heartbeat, job
tick, entry-interpretation tick, BYOK throttle sweep, auth-attempt sweep, and the
retention sweeps. **No divergence.**

### 2.4 Service worker

`public/sw.js` **exists and is registered in production**. Unchanged since
`6e2bf59`, a clone-ordering fix. It caches `/_next/static/` and one icon, calls
`skipWaiting()` and `clients.claim()`, and has **no `push` and no
`notificationclick` handler**. Asserted, not described, by
`phase-2m-push-boundary-guard.test.ts`.

### 2.5 Telemetry

`2M-AUDIT-002`. **Five enforcement points, by name** — a count is not the
measurement:

| # | Point | Kind | Changed by |
|---|---|---|---|
| 1 | `product_events_event_name_check` | table CHECK | migration |
| 2 | `private.validate_product_event_properties` | SQL key whitelist | migration |
| 3 | `productEventNames` | application vocabulary | application code |
| 4 | `product_events_surface_check` | table CHECK | migration |
| 5 | `productSurfaces` | application vocabulary | application code |

**The writer holds no copy of either vocabulary** — `202608080087` deleted the
event-name list and `202608090089` deleted the surface list — and that absence is
now asserted on every run rather than remembered.

**Migration 1 must therefore change points 1, 2 and 4 in one file, and points 3
and 5 land with it or after it. Never before.**

---

## 3. M2 — the local-day contract, and the defect it removes

`2M-AUDIT-004`, `2M-TIME-001`, `-002`, `-004`.

### 3.1 What the measurement found

The audit predicted two implementations. There were **three**, and the third is
the one that mattered:

| Implementation | Day start | Day end | Verdict |
|---|---|---|---|
| `today-priorities.localDayBounds` | local midnight | **`start + 24h`** | **wrong** on a 23h/25h day |
| `work-projection` private helpers | **`nextDay − 24h`** | local midnight | **wrong**, mirror image |
| `run_user_heartbeat` (SQL) | `local_date::timestamp at time zone tz` | `(local_date + 1)::…` | **correct** |

Both TypeScript copies made the same fixed-24-hour assumption in **opposite
directions**, so they disagreed with the database and with each other on exactly
the two days a year when a local day is not 24 hours long. Hoje's "due today"
window overshot into tomorrow on a spring-forward day; the Work `today` view and
the `overdue`/`today`/`upcoming` filters started an hour off on the same day.

Nothing had noticed, because each was asked a different question on a different
surface, and `America/Sao_Paulo` has observed no DST since 2019.

### 3.2 A fourth case the audit did not predict

Resolving a wall-clock date to an instant by fixed-point iteration **silently
lands in the previous day where local midnight does not exist**.

`America/Santiago` springs forward **at midnight**: on **2026-09-06** the local
times 00:00–00:59 never happen. The naive fixed point resolves "start of
2026-09-06" to `2026-09-05T23:00` local — a boundary **inside the previous day**.

The contract resolves the two offsets that bracket the instant, keeps only
candidates whose local date is the requested one, and takes the earliest. On that
date it yields `2026-09-06T01:00` local, which is when the day genuinely starts.

**A fixture error was found and corrected here, and it is recorded rather than
smoothed:** the first version of the test asserted that 2026-09-05 was the
23-hour day, because the probe that produced the fixture used the **naive**
algorithm. Re-derived from the runtime's own tz database with the corrected one:
**the 5th is 24 hours and the 6th is 23**, because the transition is at 24:00 on
the 5th and the skipped hour belongs to the 6th. The test caught its own author.

### 3.3 The proofs

**TypeScript** — `src/lib/time/local-day.test.ts`, 22 cases:

| Zone | Hemisphere | Date | Length |
|---|---|---|---|
| `America/New_York` | north | 2026-03-08 / 2026-11-01 | 23h / 25h |
| `Europe/Lisbon` | north | 2026-03-29 / 2026-10-25 | 23h / 25h |
| `Australia/Sydney` | south | 2026-10-04 / 2026-04-05 | 23h / 25h |
| `America/Santiago` | south | 2026-09-06 / 2026-04-04 | 23h (starts 01:00) / 25h |
| `Pacific/Auckland` | south | 2026-09-27 | 23h |
| `America/Sao_Paulo`, `UTC` | — | any | 24h |

Plus: both edges are local midnights; consecutive days tile with no gap or
overlap across every transition; an unsupported zone, an abbreviation like
`EST`, and an invalid `Date` each **throw rather than default**.

**SQL** — `supabase/tests/local_day_contract.sql`, 16 assertions over the same
dates, running in the `database` CI job, plus a final assertion that
`run_user_heartbeat` **still contains the expression this file describes**, so
the mirror cannot silently stop being a mirror.

### 3.4 What changed in the product

`today-priorities.ts` and `work-projection.ts` now consume the contract; their
copies are deleted, as is `work-projection`'s duplicate timezone-validity rule.
**`work-projection` also stops deriving `startOfToday` by subtracting `DAY_MS`**,
which is a behaviour change on DST days and a correctness fix everywhere else.
`phase-2m-local-day-guard.test.ts` fails the build on a fourth copy, and its
mutation cases are the two historical lines verbatim.

---

## 4. M3 — reminder sensitivity is derivable

`2M-AUDIT-003`. `public.reminders` carries
`entry_id uuid references public.entries(id) on delete cascade`
(`202607160007:37`) — the same relationship `task-derivation.ts` consumes through
`tasks.source_entry_id`. Deriving a reminder's classification therefore needs
**no schema change**: the same owner-scoped entry-level map, keyed by entry id,
answers for both.

This is the measurement OD-2M-1 was signed against, and the owner signed **option
A**. Slice 2M.1 implements it. **Nothing is implemented here.**

---

## 5. M4 — the five inert preferences, end state declared

`2M-AUDIT-005`. Each reaches a declared end state in slice 2M.3, and none is
left inert without a stated reason:

| Preference | End state | Reason |
|---|---|---|
| `daily_review_time` | **given a consumer** | 2M.3 delivers a daily review; the time is what it is offered at |
| `weekly_review_day`, `weekly_review_time` | **given a consumer** | same, for the weekly review |
| `planning_day`, `planning_time` | **retired from the interface** | Phase 2M's planning is a surface a user opens, not a scheduled event; a control that names a *time* for it would describe behaviour the phase does not build, and OD-2M-4's scheduled delivery is a notification concern rather than a planning one |

**Retiring a control is not deleting a column.** The columns stay; the settings
surface stops offering what nothing reads. `R-24` refuses a `built` for any
control whose consumer does not exist.

---

## 6. M5 — the hardware-dependent requirements, named individually

`2M-DEVICE-001`, `2M-DEVICE-002`, and OD-2M-5.

### 6.1 Blocks its slice

| Requirement | Why |
|---|---|
| `2M-NOTIFY-011` | push delivery cannot be observed in an emulated viewport at all |
| `2M-NOTIFY-010` (delivery half) | `granted`/`denied`/`unsupported`/`revoked`/`expired` are platform states |

### 6.2 Blocks closeout

| Requirement | Why |
|---|---|
| `2M-NOTIFY-003` | the permission prompt's timing is a platform behaviour |
| `2M-NOTIFY-005` (delivery half) | quiet hours, cap and cooldown must be observed **as delivered**, not as computed |
| `2M-NOTIFY-006` | that the payload carries no content is a **lock-screen** observation |
| `2M-MOBILE-001`, `-002` | real viewport, real touch targets, real one-handed reach |
| `2M-ACCESS-007` | a screen-reader session on real hardware |
| `2M-DEVICE-005` | the two inherited Phase 2L residuals, `2L-MOBILE-008` and `2L-ACCESS-008` |

### 6.3 Neither

Everything else. In particular **all of 2M.4a's governance** — consent shape,
revocation, per-type and frequency controls, the content prohibition, the audit
— is provable in CI, which is why the notification family is split into 2M.4a
and 2M.4b at all.

---

## 7. M6 — the device checklists

`2M-DEVICE-003`. Published now so the checkpoint after 2M.4b is a handover
rather than a design exercise. **The owner executes these.** An emulated run may
never satisfy one (`R-15`).

### 7.1 iOS Safari

**Required:** iPhone or iPad on **iOS/iPadOS 16.4 or later** — web push does not
exist below it — and the app **installed to the Home Screen**, because iOS grants
push only to an installed PWA. Record the exact OS version.

| # | Step | Expected |
|---|---|---|
| 1 | Open the app in Safari, sign in, browse for a minute | **No permission prompt appears at any point** |
| 2 | Add to Home Screen; open from the Home Screen | App opens standalone; still no prompt |
| 3 | Go to notification settings; read the surface | The benefit is explained **before** any control that could prompt |
| 4 | Tap the opt-in control | Prompt appears **only now**; record the wording |
| 5 | Accept | State reads `granted`; consent recorded with a time |
| 6 | Trigger a qualifying notification with the app **in the foreground** | Delivered; **no task title, description, person or project anywhere in it** |
| 7 | Background the app; trigger another | Delivered to the notification centre; still content-free |
| 8 | **Lock the device**; trigger another | Rendered on the lock screen; **read it aloud and confirm it names nothing** |
| 9 | Tap the notification | Opens the app at the intended destination, not the last screen |
| 10 | Set quiet hours to now; trigger | **Nothing is delivered** |
| 11 | Exceed the daily cap; trigger | **Nothing is delivered**; the surface says why |
| 12 | Trigger the same item twice inside the cooldown | **Exactly one** delivery |
| 13 | Revoke in the app | State reads `revoked`; the **next** trigger delivers nothing, with no further step |
| 14 | Deny at the OS level, then re-open the app | State reads `denied`; the app **does not re-prompt** and explains how to undo it |
| 15 | Delete and reinstall the PWA, then trigger | Subscription treated as `expired` and retired; **no error loop** |
| 16 | Change the device timezone; open the calendar and the planner | Every date and boundary follows the **new** zone; **no stored value is rewritten** |
| 17 | Hold the device across local midnight | The day rolls over exactly once, at the right instant |
| 18 | VoiceOver on: calendar, planner, notification settings | Every control reachable and labelled; day structure conveyed without visual position |
| 19 | Text size at maximum, zoom to 200% | No horizontal page scroll; nothing clipped or overlapping |
| 20 | One-handed reach test on the calendar | Primary actions reachable; destructive controls not adjacent to navigation |

### 7.2 Android Chrome

**Required:** Android **8.0 or later**, Chrome **current stable**. Record both
versions. Installation is optional — note whether the run was installed or not,
because the behaviours differ.

Same twenty steps, with three differences to observe explicitly:

- **Step 4** — Chrome may show its own quieter permission UI; record which.
- **Step 8** — Android lock-screen notifications can be configured to hide
  content system-wide. Set the device to **show** content, so the observation is
  about the payload rather than about the OS hiding it.
- **Step 15** — clearing site data, rather than reinstalling, is what expires the
  subscription.

### 7.3 How the evidence is recorded

For each step, in the slice 2M.5 acceptance record: **device, OS version, browser
version, date, and what was observed**. A step that was not run is recorded as
**not executed** — never inferred, never rounded up, never satisfied by an
emulator. `R-15` refuses a close that does otherwise.

---

## 8. M7 — the push contract, stated before it is built

`2M-AUDIT-006`, `2M-NOTIFY-006`/`-007`/`-011`. The full contract is
`PHASE_2M_PRD.md` §4.5. Recorded here as what 2M.4b will be held to:

- **VAPID**, private key in the server environment only, **never** reachable from
  a client;
- payload is `notificationCopy(locale)` and a destination — **nothing else**, and
  the type has nowhere to put content;
- quiet hours, daily cap and cooldown enforced **on the server before sending**;
- revocation effective immediately; expired subscriptions retired, not retried;
- no duplicate delivery; only content-free metadata recorded;
- **no `service_role` on a product path**;
- the prompt raised **only after an explicit user action**.

**The guard is already watching the file.** `phase-2m-push-boundary-guard.test.ts`
scans `public/` and `.js`, its allowlist is **empty**, and slice 2M.4b will add
`public/sw.js` to that list **by name** — which makes the addition visible as a
decision instead of as a widened pattern.

---

## 9. Gate G-2M.0

| Gate | Result |
|---|---|
| Tests written first | yes — every guard has mutation cases and a control |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **5331 passed**; 3 failed *files* are the known Windows-only shebang-parse baseline (**0 failed tests**), green in CI |
| `npm run build` | passes |
| `git diff --check` | clean |
| Migration created | **none** |
| Visible surface added | **none** |
| Provider called | **none** |
| Playwright | not run: this slice adds no surface, and no existing journey changes |

---

## 10. What this slice did not touch

No migration, no deployment, no RLS, grant, policy or Auth change, no new RPC, no
new write path, no `service_role`, no provider call, no BYOK use, no signup or
rollout change, no notification sent, no permission requested, no service-worker
change, no telemetry event created, no recurrence artifact, no gesture, and no
successor artifact.

**One product behaviour did change**, and it is stated rather than buried: Hoje's
"due today" window and the Work `today` view and due filters now use the correct
local-day boundaries. On the 363 ordinary days a year the result is identical; on
the two DST days it is correct where it was an hour wrong.

---

## 11. Claims

| Requirement | Classification | Evidence |
|---|---|---|
| `2M-AUDIT-001` | **built** | §2.1 — every `planned_at` read and write re-derived at the baseline; the absence of a read-side predicate re-proved by search, not inherited; no divergence from the audit |
| `2M-AUDIT-002` | **built** | §2.5 — five enforcement points **named**; which a migration changes and which application code changes recorded; the writer proved to hold no copy, and that is now asserted every run |
| `2M-AUDIT-003` | **built** | §4 — `reminders.entry_id` proved to be the same relationship `task-derivation.ts` consumes; derivable with no schema change; presented as the input OD-2M-1 was signed against |
| `2M-AUDIT-004` | **built** | §3 — both implementations measured against the same instants across DST in both hemispheres; **three** found rather than two, and every disagreement recorded |
| `2M-AUDIT-005` | **built** | §5 — each of the five preferences has a declared end state and a stated reason; none is left inert silently |
| `2M-AUDIT-006` | **built** | §2.4, §8 — the existing guard's scope proved unable to see `public/sw.js`; the guard change is delivered **as a measurement plus a widened guard**, with an empty allowlist and no push artifact added |
| `2M-AUDIT-007` | **built** | `PHASE_2M_PRD.md` §11.1 — `2L-MOBILE-008` and `2L-ACCESS-008` inherited by dependency (§6.2); `2L-METRICS-005` served by migration 1; `2K-AUDIT-002`, `2K-EXPL-007` and `2E-COMMAND-012` explicitly not this phase's |
| `2M-AUDIT-008` | **built** | ADR-105 records all seven signatures; `phase-2m-declarations.test.ts` asserts each is marked **SIGNED** in the PRD and that ADR-105 is accepted, non-transferable and refuses a third migration |
| `2M-RECUR-001` | **built** | `phase-2m-recurrence-guard.test.ts` — ten implementation shapes, four trees, zero found |
| `2M-RECUR-002` | **built** | same file — `recurrence_requested` re-asserted in the taxonomy, in both locales' copy, and in the extraction contract |
| `2M-RECUR-003` | **built** | same file — mutation cases fire on a recurrence column, a series table, an occurrence model, a recurring flag and an expander added "in preparation"; a control proves it does **not** fire on the refusal itself, on `recurring_info`, on `historical_recurrence` or on `String.repeat` |
| `2M-TIME-001` | **built** | §3 — one contract, both former copies deleted, a guard against a fourth, and the SQL side asserted in CI |
| `2M-TIME-002` | **built** | §3.3 — 23-, 24- and 25-hour days proved in TypeScript **and** in SQL, plus the day whose local midnight does not exist |
| `2M-TIME-004` | **built** | §3.3 — both directions, both hemispheres, at the transition and either side of it |

**Delivered earlier than the plan assigned them:** `2M-TIME-001`, `-002` and
`-004` are scheduled to slice 2M.1 in `PHASE_2M_IMPLEMENTATION_PLAN.md`, and the
owner's slice-2M.0 brief requires the local-day contract and its DST tests here.
They are delivered here. **The divergence is recorded rather than hidden**, and
the plan's slice column is the thing that moved, not the requirement.

**No requirement is claimed that this slice did not execute.** In particular
`2M-TIME-003`, `-005`, `-006` and `-007` are **not** claimed: they are about
surfaces that do not exist yet.
