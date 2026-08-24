# Phase 2S — current experience audit

**Read-only.** Every hosted statement behind this document was a `select`. No
fixture was planted, no row was written, no Edge Function was invoked, no AI call
was made and no credential was spent. Aggregates only — no content, no
identifiers, no personal data.

Measured **2026-08-24** against `main` at `885f7f7` and the deployed project
`ulvwzqlpsjyrnqzfxmck`.

---

## 1. The baseline, re-proved rather than carried forward

| fact | how it was verified | result |
|---|---|---|
| `main` = `origin/main` = `885f7f7` | `git rev-parse` after `git fetch` | identical |
| worktree | `git status --porcelain` | 0 lines |
| open PRs | `gh pr list --state open` | 0 |
| CI at the exact SHA | `gh run view 32741546389` | `push` event on `885f7f7…`, `success`, **three jobs** — `application`, `edge worker`, `database and journey` — all green |
| migrations | `ls supabase/migrations/*.sql` vs `supabase_migrations.schema_migrations` | **101 = 101**, and the **version sets are identical by diff**, not merely equal in count |
| parity | `max(version)` | `202608230101` |
| Phase 2R | `docs/DECISIONS.md:1957` | **CLOSED by ADR-135**, Status Accepted |
| requirements | `node scripts/generate-phase-2r-traceability.mjs --check` | `declared 73 · classified 73 · unclassified 0` |
| Phase 2S | `ls`, plus a repository-wide scan for `2S-` and `Phase 2S` | **absent** — every occurrence is a guard, a planted fixture, or a "not started" declaration |
| signup | `hosted-auth-posture.ts:89`, `hosted-auth-config.mjs:104`, RG-SIG readbacks | `disable_signup: true` — **closed** |
| rollout | `npm run rollout:verify`, executed | **25 pass · 3 fail · 2 owner-signature** — `RG-QUO-3`, `RG-DEP-1`, `RG-DEP-3` fail; `RG-DEP-4` unsigned |

### 1.1 One correction to the baseline record itself

**`PHASE_2R_THREAT_MODEL.md` ends at slice 2R.5's disposition** — ten CLOSED,
`T-2R-11` and `T-2R-12` recorded as *"OPEN — carried"*. Their final disposition
exists only in **ADR-135 Decision 4** and in `STATE.md`.

*12 of 12 disposed* is **true**. A reader of the threat model alone would
conclude 10 of 12. Both statements are accurate about different moments; the
document of record for threats is the one that was not updated.

**Not corrected here.** ADR-136 authorizes the Phase 2S package and the
correction of its own guards, not edits to Phase 2R's closed record. It is named
so that excluding it is a decision rather than an omission.

---

## 2. What the product already is

Forty-five routes under `src/app/[locale]/`, covering capture, inbox, today,
tasks, work, waiting, projects, people, organizations, contexts, relations,
library, reminders, calendar, reviews, chat, memories, files, notifications,
history, jobs, questions, search, costs and settings, in two locales, behind
authentication with forced RLS, an append-only audit ledger, an undo registry, a
job queue with leases, a per-operation AI ledger, BYOK, a service worker, push
subscriptions, and an hourly deterministic heartbeat.

**Eighteen lettered phases have shipped.** The product is not missing
capability.

---

## 3. What the rows say

Every count live, 2026-08-24.

### 3.1 The store is nearly empty

| table | rows |
|---|---|
| `auth.users` | 2 — created 2026-07-16 and 2026-07-30 |
| **`entries`** | **1** — created 2026-08-22 |
| `entry_interpretations` | 2 |
| `entry_embeddings` | 1 |
| `tasks` | 6 |
| `people` | 1 |
| `memories` | 1 |
| `reminders` | 4 — 2 `scheduled` (2026-08-26, 2026-09-05), 2 `cancelled` |
| `reminder_series` | 2 |
| **`conversations`** · **`conversation_messages`** | **0** · **0** |
| **`summaries`** | **0** |
| **`attachments`** · `attachment_interpretations` | **0** · **0** |
| `pending_questions` | 0 |
| `projects` · `organizations` · `contexts` · `tags` | **0 each** |
| `notifications` | **57** |
| **`notification_deliveries`** | **0** |
| `push_subscriptions` | 1 |
| `audit_logs` | 317 |
| `undo_operations` | 14 |
| `product_events` | 498 |
| `heartbeat_runs` | 651 |
| `ai_usage_events` | **5** |
| `automation_calibration_observations` | **2** |
| `automation_category_policies` | **0** |
| `user_ai_credentials` | **1** |

**`summaries` read 2 on 2026-08-23 in Phase 2R's audit and reads 0 today.** The
direction of travel is down.

### 3.2 The product is opened constantly and used almost never

| event | surface | n | first | last |
|---|---|---|---|---|
| `needs_attention_viewed` | home | **170** | 2026-07-30 | **2026-08-24** |
| `work_view_viewed` | work | 92 | 2026-07-30 | 2026-08-15 |
| `needs_attention_viewed` | needs_attention | 59 | 2026-08-15 | 2026-08-23 |
| `day_review_opened` | calendar | 56 | 2026-08-12 | 2026-08-15 |
| `conversation_suggestion_shown` | conversation | 51 | 2026-08-15 | 2026-08-15 |
| `calendar_viewed` | calendar | 28 | 2026-08-12 | 2026-08-15 |
| `capture_mode_selected` | capture | 18 | 2026-08-18 | 2026-08-22 |
| `interpretation_review_viewed` | interpretation_review | 5 | 2026-08-22 | 2026-08-23 |
| **`capture_started`** | capture | **1** | 2026-08-22 | 2026-08-22 |
| **`capture_save_succeeded`** | capture | **1** | 2026-08-22 | 2026-08-22 |
| `task_status_changed` | work | **2** | 2026-08-15 | 2026-08-15 |

**170 home views against one capture.**

**The instrumentation was checked before the numbers were read as a funnel.**
`capture_started` has a real producer — `recordCaptureStarted` at
`src/features/capture/composer.tsx:161` — so `1` is a measurement, not a missing
emitter. `capture_mode_selected` breaks down as `text` 9, `attachment` 8,
`voice` **1**.

### 3.3 Seven of the nine AI operations have never fired

`ai_usage_events_operation_check` allows nine members. **Two have ever
appeared** — `capture_extraction` and `semantic_search`, five rows total, all on
2026-08-22 and 2026-08-23.

Never invoked: **`chat`**, `review`, `file_analysis`, `advanced_reasoning`,
`background`, `task_command`, **`transcription`**.

### 3.4 No task has ever been finished

`tasks_status_check` allows `inbox, todo, in_progress, waiting, blocked,
deferred, completed, cancelled`. **All eight are reachable in code** —
`task-commands/taxonomy.ts`, `vocabulary.ts` and `detail-controls-copy.ts`,
including natural-language *adiada* and *postergada* mapping to `deferred`. This
is **not** a missing-control finding.

**Used, ever: `inbox` (4) and `cancelled` (2).** The two cancellations on
2026-08-15 are the only status changes in the product's history. **Zero
`completed`.**

---

## 4. The finding this audit was not looking for

**The product's only autonomous voice is a nag that cannot be told to stop, and
it has been running for eighteen days.**

| | measured |
|---|---|
| notifications | **57** — 54 `task_stale`, 3 `task_overdue` |
| read | **0 of 57** |
| dismissed | **0** |
| rate | **exactly 3 per day**, 2026-08-17 → **2026-08-24**, unbroken |
| subject | **3 tasks**, `inbox`, `due_at` null, `updated_at` **2026-07-30** |
| delivered by push | **0** |

Three per day is the **daily cap**. On every day without a reminder, the cap is
consumed entirely by three tasks nobody has touched in twenty-five days.

### 4.1 The mechanism, read from the deployed function

`202608040073_account_lifecycle_admin.sql:616-676`, confirmed against
`pg_get_functiondef`:

```sql
'stale:' || task.id::text || ':' || local_date::text  as dedupe_key
...
where task.status not in ('completed','cancelled','deferred','waiting')
  and task.due_at is null
  and task.updated_at < now() - interval '7 days'
```

and the suppression:

```sql
and not exists (
  select 1 from public.notifications notification
  where candidate.type in ('task_overdue','task_stale')
    and notification.created_at > now() - interval '24 hours'
    and notification.dedupe_key like 'stale:' || <task id> || ':%'
)
```

**The dedupe key carries the local date and the suppression window is twenty-four
hours, and the suppression never reads `status`.** So the same subject
re-notifies **every day, forever**, and **marking a notification read changes
nothing about tomorrow's copy.**

The only escapes are inside the task: complete, cancel, defer, mark waiting, or
give it a due date.

### 4.2 What the surface actually offers

`src/app/[locale]/app/notifications/page.tsx` renders exactly two controls per
row:

- **"Abrir"** → `action_url`, hardcoded by the migration to **`/pt-BR/app/tasks`**
  — the whole task list, not the task;
- **"Lida"** → `markNotification` with `status="read"`.

**`dismissed` is unreachable.** `markNotification` accepts
`z.enum(["read","dismissed"])`, has **exactly one caller**, and that caller always
sends `"read"`. The list then filters `.neq("status","dismissed")` — **a filter
guarding a state nothing in the product can produce.**

So the only control on offer does not address the cause, and the one disposition
the schema has has no button.

### 4.3 The asymmetry is in the schema

| object | statuses | deferrable? |
|---|---|---|
| `pending_questions` | `open, answered, dismissed, snoozed` + `snoozed_until` | **yes** |
| `reminders` | `scheduled, sent, snoozed, cancelled` + `snoozed_until` | **yes** |
| **`notifications`** | `unread, read, dismissed` — **no snooze, no `snoozed_until`** | **no** |

**The product built *"not now"* twice, and did not build it for the one thing
that speaks daily.**

### 4.4 It is not a starvation defect, and saying so precisely matters

`run_user_heartbeat`'s `limited` CTE orders by `rank desc`. `task_stale` has rank
**1**; a reminder has **2** or **3**; `task_overdue` has 2 to 4. **A reminder
wins a capped slot against a stale nudge.** The cap is nonetheless consumed by
noise on every day a reminder does not come due.

### 4.5 Phase 2R's delivery has never reached the owner

**There is not one `reminder`-type notification in the ledger.** The two live
reminders come due **2026-08-26** and 2026-09-05. When they fire they will land
in a channel where push has delivered zero and fifty-seven unread notices already
sit.

---

## 5. Three corrections to the standing record

### 5.1 `2P-CHAT-007-JOURNEY` is no longer unspendable

Recorded across Phases 2P, 2Q and 2R as *"unspendable — it needs the owner's own
credential."*

`user_ai_credentials` holds **one row**: `provider = openai`, `status = active`,
`validated_at = 2026-08-02`, `last_failure_code = null`.

**The credential exists and is active.** The classification is corrected here;
the remainder is **not** discharged by being reclassified, and it stays out of
this phase.

### 5.2 Voice with an editable transcript is built, and has never run

The owner names *captura por voz com transcrição editável antes de enviar ao
Brain* as a future priority. Measured:

- `src/features/capture/voice-composer.tsx` ships and is **mounted** at
  `src/features/capture/composer.tsx:575`. Its own header states the delivered
  contract: *record → transcribe → **the composer's editable field** → type more
  → submit*, inserting at the caret. It owns no draft, renders no textarea and
  never calls `captureEntry`.
- `capture_mode_selected` with `captureMode: "voice"` fired **once**, 2026-08-22.
- **`ai_usage_events` holds zero `transcription` rows**, and `transcription` is a
  valid member of the operation vocabulary.

**Built. Never once completed end to end.** What is owed is a proof on the
owner's device — or a defect report if it fails — not a build. It is **not** this
phase's scope, and it is named in the PRD's §7.1 with that destination.

### 5.3 The automation record moved again, in the direction the instruction predicted

Phase 2R's audit §5 found `task` and `person` stored as
`automatic_when_eligible`; §10.3 recorded the owner undoing it.

**Read live today: `automation_category_policies` holds zero rows.** All six
categories read through the computed default.

**The instruction that came out of that finding was: read the rows, never a
document — including this one.** The table has now moved three times in five
days. `2S-TRUST-009` carries the obligation forward.

---

## 6. Themes, measured against each other

Four coherent options, compared in
[`PHASE_2S_THEME_OPTIONS.md`](../../initiatives/phase-2s/PHASE_2S_THEME_OPTIONS.md).
**The owner chose A on 2026-08-24.**

| | theme | value | risk | migrations | volume-dependent? |
|---|---|---|---|---|---|
| **A** | **Responder ao Brain** | **high** | medium | **1** | **no** |
| B | Continuity — link a search, keep a filter | medium | low | 0 | no |
| C | Chat and review citations | high on paper | **disqualifying** | 1 | **yes** |
| D | Recurring tasks | medium | medium-high | ≥1 | yes |

**The constraint applied before preference:** any theme whose completion depends
on accumulated usage is not buildable now. That disqualified C and D. B is a
slice, by Phase 2R's own audit.

---

## 7. Inherited items, every one with a destination

Nothing below is absorbed, discharged or downgraded by this package.

| item | state today | destination |
|---|---|---|
| `2R-TZ-SECOND-AUTHORITY` | eight inline zone sites, no CHECK on `profiles.timezone` | carried; routed by ADR-134 |
| `2R-UNDO-LEDGER-NOT-CLOSED` | 1 of 20 handlers; needs a migration | a later initiative |
| `2R-OCCURRENCE-CANCEL-IRREVERSIBLE` | needs DDL | a later initiative |
| `2R-AXE-MANUAL-LANE` | axe behind auth only | narrowed by `2S-ACCESS-004`, **not closed** |
| `2R-RECURRENCE-LANE-UNRUNNABLE` | cannot be listed or run here; wrong opener label | operations |
| `2R-DRAWER-NOT-LOCKED` | `.ux-detail` claims `aria-modal`, does not lock | **an owner design decision** — `2S-MOBILE-005` |
| `2R-TASK-RECURRENCE` | +6 to +9 days and a further migration | a later phase |
| `OD-2R-9`'s two defects | re-verified today: `/app/search` reads no `searchParams` while **24** other route files do; `activeFilter` is component-local at `needs-attention-list.tsx:169` | `OD-2S-8`, recommended out |
| the interval gap | *every N days* inexpressible | `OD-2R-2`'s closed set |
| push HTTP 403 | unresolved; deliveries **0** | `OD-2S-6` — out by rule; `2S-TRUST-008` refuses the claim |
| `2P-ATTENTION-008` | open half | `OD-2S-8` |
| `RG-DEP-3` | **FAIL**, re-verified today | rollout track; not closable by writing a file |
| `2P-CHAT-007-JOURNEY` | **classification corrected** — spendable | a later phase |
| `2P-REVIEW-CITATIONS` | not delivered; one `jsonb` column | a later phase |
| `2P-ACCESS-005` (VoiceOver) | **NOT EXECUTED — OWNER WAIVED** | stays waived; never reported as passing |
| `2P-MOBILE-002` keyboard / IME | open | owner hardware |
| four automation review flows | out under `OD-2Q-8` | separate initiative |
| voice end to end | **built, never run** | a device checkpoint or a defect report |
| **ADR-055 expiry — 2026-10-27** | **live, 64 days out**; spike tier needs 50 qualifying commands, `task_command_applied` = **2** | **the owner's ADR.** Nothing in this repository fires on a date |

---

## 8. A defect found by the broad sweep, and it is in a guard

**A13's declared-requirement signal has never matched the shape this repository
actually uses.**

`src/lib/closeout/phase-2f-documentation.test.ts` detects an unauthorized phase
start through four signals. Signal 2 is:

```ts
const DECLARED_SUCCESSOR_REQUIREMENT = /^- \*\*2S-[A-Z]+-\d{3}/m;
```

a **bullet**. But this repository declares requirements in **PRD tables** —
`` | `2R-FAMILY-001` | … | `` — which `phase-2r-declarations.test.ts` states in
its own parser:

```ts
const DECLARATION = /^\| `(2R-[A-Z]+-\d{3})` \|/gm;
```

**There is not one bullet-shaped requirement declaration anywhere under `docs/`.**
Signal 2 has therefore never once fired on a real declaration, and the control
that guards it tests the regex against a **planted bullet string** — proving the
pattern works on a shape nothing produces.

**A13 as a whole still fires**, through signal 1 (the `PHASE_2S_*PRD*` filename)
and signal 3 (an accepted ADR heading), so this is not a hole through which a
phase could have started silently. It is a signal that has been carried, inert,
through every retarget.

**Repaired in this package**, as part of the retarget: the constant matches
**both** shapes, with a two-sided control that plants a table row and proves the
old pattern would have missed it. A retarget that carried a dead signal forward
would be the same failure Phase 2R named — *a contract stated in prose is not a
contract anybody enforces*.

**Signal 4 is narrower than it reads, and is named rather than changed.**
`IMPLEMENTATION_MARKED_FILE` is applied by `filesIn`, which is **not recursive**,
so it scans only the top level of `supabase/migrations`, `src/features` and
`src/lib`. `supabase/migrations` is flat, which is the case that matters; a
successor file under `src/lib/closeout/` would not be seen. Recorded, not
widened — widening a second signal in the same commit as a retarget is more
change than this authorization covers.

---

## 9. What this audit deliberately did not do

- It **did not write anything hosted.** Every statement was a `select`.
- It **did not run the product**, spend a credential, or make an AI call.
- It **did not open or alter signup**, the rollout gate, or any automation
  category's state.
- It **did not resume the push investigation.**
- It **did not edit Phase 2R's closed record**, including the threat model
  divergence in §1.1.
- It **did not execute any remainder.**
