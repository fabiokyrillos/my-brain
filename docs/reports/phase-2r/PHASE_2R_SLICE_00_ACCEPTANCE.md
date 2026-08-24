# Phase 2R — Slice 2R.0 acceptance record

**Measure the ground this phase will stand on, and change nothing.**

- **Authorization:** implementation of slices 2R.0 … 2R.5, **ADR-133**
  (2026-08-23), over the package ADR-131 authorized and the nine decisions
  ADR-132 signed. ADR-133 authorizes construction; **it does not authorize
  closure**, which stays `2R-CLOSE-012`'s owner checkpoint.
- **Requirements:** `2R-FOUNDATION-001` … `-006` (6 of 73).
- **Migrations:** **none created, none spent.** 100 local = 100 hosted, parity
  `202608210100`, unchanged by this slice. Budget stays **1 allocated · 0 spent ·
  0 created**.
- **Baseline:** `main` **`ee3c153b0eb32793182cd2d93a0bb5829afa9fbb`**, worktree
  clean, zero open pull requests, CI green **3 / 3** on that exact SHA
  (run `32614271822` — `application` · `edge worker` · `database and journey`),
  signup closed, rollout gate **25 pass · 3 fail · 2 owner-signature**.
- **Product behaviour changed: none.** No route, component, Server Action, RPC,
  schema, policy, grant, copy string or rendered control is altered.
- **Hosted writes: none.** Six read-only statements were run against the
  deployed database. Every one is a `select`, every one is reproduced below with
  its exact SQL, and **no fixture was planted**, so no residue can exist and none
  is claimed.
- **AI calls: none. BYOK credit spent: none.**

Executed by `src/lib/closeout/phase-2r-foundation.test.ts`.

---

## 1. The baseline the package names, and the one this slice measured

The governing pair was written against `main` `43c8be17` and revalidated against
`73f30b39` (audit §10). `main` is now **`ee3c153b`**.

**This is not drift.** `73f30b39` is an ancestor of `ee3c153b`, and the only
commit between them is the merge of PR #287 — the planning package itself. The
complete delta is `docs/`, `*.test.ts` and `scripts/`. **Zero product surfaces
moved**, so every premise the audit measured still describes the tree.

Each was nonetheless re-derived rather than carried over, because a finding read
from a document cannot fail.

| # | Premise | Method | Result |
|---|---|---|---|
| 1 | `main` = `origin/main` | `git rev-parse` | both `ee3c153b` |
| 2 | worktree clean | `git status --porcelain` | empty |
| 3 | open pull requests | `list_pull_requests state=open` | **zero** |
| 4 | a concurrent Phase 2R branch | `git log main..origin/claude/phase-2r-implementation-i9zjin` | **empty** — the branch exists and carries nothing |
| 5 | PR #287 merged | `ee3c153b` is its merge commit | merged |
| 6 | CI at the exact `main` SHA | workflow run `32614271822` | **3 / 3 success** |
| 7 | local migrations | `ls supabase/migrations/*.sql` | **100** |
| 8 | hosted migrations | `list_migrations`, read-only | **100**, newest `202608210100` |
| 9 | parity | comparison of 7 and 8 | **`202608210100`**, 100 = 100 |
| 10 | a Phase 2R migration | filename scan | **none** |
| 11 | Phase 2S artifacts | `docs/initiatives`, `docs/reports` | **absent** |

---

## 2. `2R-FOUNDATION-001` — the absence of recurrence, re-proved

**Three independent reads, so a generated artifact lagging the schema cannot
hide the answer.**

| Read | Result |
|---|---|
| the deployed `information_schema.columns` for `public.reminders` | **12 columns**, none expressing repetition |
| the generated `database.types.ts` `reminders` Row block | the same twelve, asserted as a **closed list** |
| the repository-wide artifact scan (`recurrenceArtifacts`, delegated to `phase-2m-recurrence-guard.test.ts`) | **zero** across `src`, `supabase/migrations`, `supabase/functions`, `public` |

The deployed column list, in ordinal order:

```
id · user_id · task_id · entry_id · title · remind_at · important
status · snoozed_until · sent_at · created_at · updated_at
```

```sql
select ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'reminders'
order by ordinal_position;
```

**§3.6 and §10.1 of the audit both stand.** There is no recurrence column, no
`jsonb` column to repurpose, and no `rrule`, `recurrence` or `repeat_*` anywhere
in the migration chain. PRD §5's necessity argument is re-proved, not inherited.

---

## 3. `2R-FOUNDATION-002` — the heartbeat, observed rather than read

Observed **twice, against two different objects**: the live `pg_proc.prosrc` of
the deployed function, and the migration chain that produced it. A divergence
between them would show as one passing and the other failing.

### The live reading

```sql
with src as (
  select p.prosrc as body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_user_heartbeat'
)
select
  (body like '%pg_try_advisory_xact_lock(hashtextextended(''my-brain-heartbeat:''%') as per_user_lock,
  (body like '%coalesce(preferences.quiet_start, ''22:30'')%')                       as quiet_start_default_2230,
  (body like '%coalesce(preferences.quiet_end, ''07:00'')%')                         as quiet_end_default_0700,
  (body like '%coalesce(preferences.max_followups_per_day, 3)%')                     as daily_cap_default_3,
  (body like '%available_slots := greatest(daily_cap - delivered_today, 0)%')        as cap_is_slots,
  (body like '%notification.created_at > now() - interval ''24 hours''%')            as cooldown_24h,
  (body like '%candidate.type in (''task_overdue'', ''task_stale'')%')               as cooldown_scope_tasks_only,
  (body like '%(not in_quiet_hours or (allow_important and reminder.important))%')   as reminder_quiet_override,
  (body like '%''reminder:'' || reminder.id::text%')                                 as reminder_dedupe_per_id,
  (body like '%limit available_slots%')                                              as limited_by_slots,
  pg_catalog.length(body)                                                            as body_length
from src;
```

| Property | Observed | Where |
|---|---|---|
| per-user lock | `true` | `pg_try_advisory_xact_lock(hashtextextended('my-brain-heartbeat:' ‖ user))` — a failed lock returns `skipped: already-running`, so one user never blocks the batch |
| quiet hours | `true` / `true` | `agent_preferences.quiet_start` / `quiet_end`, defaults **22:30** and **07:00**, compared against the **local** wall clock in the owner's zone |
| daily cap | `true` | `agent_preferences.max_followups_per_day`, default **3**, spent as `available_slots := greatest(cap − delivered_today, 0)` and applied as `limit available_slots` |
| 24-hour cooldown | `true` | `notification.created_at > now() - interval '24 hours'`, **scoped to `task_overdue` and `task_stale` only** |
| reminders through quiet hours | `true` | admitted only when `important_reminder_override` **and** the reminder is important |
| reminders deduplicated | `true` | `dedupe_key = 'reminder:' ‖ reminder.id`, so a reminder yields **at most one notification, ever** |

`body_length` = **9 160** characters, so the reader had something to read.

**Non-vacuity control**, same statement shape, three clauses that must be
absent:

| Control | Observed | Meaning |
|---|---|---|
| `body like '%recurrence%'` | **false** | the deployed heartbeat has no recurrence concept |
| `body like '%interval ''48 hours''%'` | **false** | the cooldown is 24 hours and the probe would have seen 48 |
| `body like '%…''task_overdue'', ''task_stale'', ''reminder''…'` | **false** | the cooldown is genuinely not applied to reminders |

Live preference values, read in the same round trip: **2 rows**, cap `3`, quiet
`22:30:00 .. 07:00:00`.

```sql
select count(*) from public.agent_preferences;
```

### The schedule

`cron.job` holds **five** jobs, all active. The heartbeat is `jobid 1`:

```
0 * * * *   select public.run_all_heartbeats()
```

**Hourly**, confirmed live rather than from the migration that declares it.

### What this means for the phase

`OD-2R-3` option A — exactly one materialised occurrence — was signed precisely
so none of the six properties above has to change. This record is the
before-state that `2R-NOTIFY-001` … `-004` will be re-proved against in slice
2R.4, and the reminder dedupe key is the mechanism that makes `2R-NOTIFY-005`
answerable at all: one scheduled row per series means one candidate per run,
which the cap then bounds.

---

## 4. `2R-FOUNDATION-003` — the reminder modal's current shape

Read from `src/features/reminders/reminder-composer.tsx`, **not** from Phase
2P's description of it.

| # | Group | Control | Contract |
|---|---|---|---|
| 1 | content | `input[type=text]` `name="title"` | required, `maxLength=500`, label + hint |
| 2 | date and time | `input[type=datetime-local]` `name="remindAtLocal"` | required, label + hint stating the zone |
| 3 | importance | `input[type=checkbox]` `name="important"` | inline label |
| 4 | optional link | `select` `name="taskId"` | empty option is a real choice, then the owner's open tasks |
| 5 | save | `button[type=submit]` `.task-command-primary` | cancel is `ConfirmDialog`'s own, rendered after |

Plus a hidden `name="locale"`, an `sr-only` `role="status"` progress region, and
an error `role="alert"` at the foot of the form. **Four named inputs and one
hidden field — five in total, asserted as a closed set** so a sixth cannot
arrive unrecorded.

The dialog is the fourth consumer of `ConfirmDialog` with the
`task-command-dialog-form` modifier; openness is derived from `pending`, never
closed by an effect.

### The modal's real limits — measured, and one of them is a constraint

| Breakpoint | Width | Height bound | Scroll container |
|---|---|---|---|
| desktop | `.task-command-dialog` `min(100%, 460px)`; with the form modifier `min(100%, 520px)` | **none** | **none** |
| ≤ 640px | `100%`, bottom sheet | `max-height: 92vh` | `overflow-y: auto` |

**The desktop dialog has no height bound and no scroll container.** The backdrop
centres it in a 20px-padded fixed grid, so a body taller than the viewport is
clipped with no way to reach what falls off. Today's five groups fit; a
recurrence control plus a preview of the next occurrences plausibly will not.

**This is recorded now so slice 2R.3 inherits it as a constraint rather than
discovering it as a defect.** `2R-MOBILE-002` names the phone, but the
unbounded breakpoint is the **desktop** one, and the requirement has to be
satisfied on both.

---

## 5. `2R-FOUNDATION-004` — one authority is named, and a second is reported

### The contract

| | |
|---|---|
| **Resolver** | `resolveOwnerTimeZone` — `src/lib/time/owner-timezone.ts` |
| **Rule** | `isSupportedTimeZone`: constructs an `Intl.DateTimeFormat` **and** contains `/` or is exactly `UTC`; otherwise `defaultAgentPreferences.timezone` |
| **Server Component accessor** | `getOwnerTimeZone` — `src/features/profile/owner-timezone.ts`, `cache()`-memoised per request |
| **Established by** | the local-day-correction initiative, whose own census found and collapsed four private answers |

### `2R-TZ-SECOND-AUTHORITY` — the defect, reported as this requirement requires

**There is a second authority. It is reachable. Two of its call sites are the
reminders surface this phase builds on.**

Seven files resolve the owner's zone inline instead of through the contract,
across eight call sites:

| File | Rule applied |
|---|---|
| `src/app/[locale]/app/reminders/page.tsx:78` | `typeof === "string" && !== ""` |
| `src/features/reminders/actions.ts:173` (reschedule) | the same |
| `src/features/reminders/actions.ts:314` (create) | the same |
| `src/app/[locale]/app/history/page.tsx:63` | the same |
| `src/app/[locale]/app/work/cancelled/page.tsx:39` | `?? default` — accepts **any** non-null value |
| `src/features/chat/actions.ts:276` | `?? default` |
| `src/features/daily-cycle/task-detail-projection.ts:110` | `typeof === "string" && !== ""` |
| `src/features/daily-cycle/work-projection.ts:168` | the same |

**Where the two rules disagree.** A bare abbreviation — `EST` is the clean
example — constructs an `Intl.DateTimeFormat` without complaint and **carries no
daylight-saving rule**. The contract refuses it and falls back; the eight sites
accept it and compute in a silently fixed offset. Both halves are *executed* in
the guard rather than argued, and the guard also asserts that the two rules
agree on `America/Sao_Paulo`, so the finding is about the values that hurt and
not a general disagreement.

**Why it is reachable rather than theoretical.** Read live:

```sql
select con.conname, pg_get_constraintdef(con.oid) as def
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public' and rel.relname = 'profiles';
```

Three constraints: `profiles_locale_check`, `profiles_pkey`,
`profiles_user_id_fkey`. **There is no check constraint on
`profiles.timezone`.** The database-side writer
`public.save_profile_and_preferences` stores `p_profile ->> 'timezone'`
unvalidated, so the *only* enforcement of the IANA rule is `profileSchema`'s
`ianaTimezone` in a Server Action. A caller that reaches the RPC directly stores
what it likes.

**What the hosted data says today**, so the severity is not overstated:

```sql
select timezone, count(*) from public.profiles group by timezone order by timezone;
```

`America/Sao_Paulo` × 2. **No stored value currently diverges**, and the two
rules agree on it exactly.

### Classification, stated precisely

It is **one source of truth** (`profiles.timezone`) and **one declared default**
(`defaultAgentPreferences.timezone`), with **two implementations of the
validation rule**. It is therefore not a second *source*; it is a second
*authority over what a valid zone is*, which is the thing a wall-clock feature
depends on.

**Destination:** this is a **stop condition** — implementation plan §5 row 7,
and `2R-FOUNDATION-004`'s own *"any second path is reported as a defect"*. It is
reported here and **built on by nothing**. The owner's decision is required
before slice 2R.1 resolves a recurrence instant through either rule. The
recommendation, and the two alternatives, are in §8.

---

## 6. `2R-FOUNDATION-005` — zero product behaviour changed

The slice's diff is `docs/`, one new guard, the inversions the declaration guard
needed, and ADR-133. Asserted as properties rather than as a claim about a diff:

- the reminder creation contract still declares exactly `locale`, `title`,
  `remindAtLocal`, `important`, `taskId`, and **no** recurrence field;
- the reminder command union still declares exactly `snooze`, `reschedule`,
  `cancel`, `restore`, `edit`;
- the deployed command boundary still admits exactly those five `kind` values;
- `reminders` still has twelve columns;
- no migration filename names this phase, and the count is still **100**.

---

## 7. `2R-FOUNDATION-006` — the automation rows, re-read whatever their count

**The probe was checked before the product**, because *"rows gone"* and *"probe
blind"* are indistinguishable from a zero. One statement, both facts:

```sql
select
  (select count(*) from auth.users)                                   as auth_users,
  (select count(*) from public.profiles)                              as profiles,
  (select count(*) from public.entries)                               as entries,
  (select count(*) from public.tasks)                                 as tasks,
  (select count(*) from public.reminders)                             as reminders,
  (select count(*) from public.automation_category_policies)          as automation_category_policies,
  (select count(*) from public.automation_calibration_observations)   as calibration_observations,
  (select count(*) from public.notifications)                         as notifications;
```

| table | rows | audit §10.2 / §10.3 said |
|---|---|---|
| `auth.users` | 2 | 2 |
| `profiles` | 2 | 2 |
| `entries` | 1 | 1 |
| `tasks` | 6 | 6 |
| `reminders` | **1** | 1 |
| `automation_category_policies` | **0** | **0** |
| `automation_calibration_observations` | **2** | 2 |
| `notifications` | 51 | not recorded |

And the rows themselves:

```sql
select category, state, created_at, updated_at from public.automation_category_policies order by category;
```

→ `[]`.

**Verdict: audit §10.3 is CONFIRMED, not corrected.** The table holds zero rows,
so all six categories resolve to `suggest_only` by the computed default, exactly
as §10.3 recorded after the owner undid their 2026-08-20 opt-in. **No stop
condition is reached on this requirement.** Nothing was written to make the
sentence true, and nothing needed to be.

**The instruction that outlived every count this table has had:**
**read the rows, never a document** — including this one. It has moved twice in
three days.

---

## 8. The stop condition, and what the owner is being asked

**Stop condition 7 is reached: a second timezone authority exists.** Slice 2R.0
is complete and merged; **slice 2R.1 does not start until this is answered.**

Three options, with the recommendation first.

| | option | cost | consequence |
|---|---|---|---|
| **A** | **Slice 2R.1 resolves every recurrence instant through the contract (`resolveOwnerTimeZone`), and the eight inline sites are left exactly as they are** — recorded as `2R-TZ-SECOND-AUTHORITY` with **operations / a separate small initiative** as its destination, alongside `OD-2R-9`'s two proved defects | **zero added days** | The phase satisfies `2R-TIME-005` — *"every surface showing an occurrence resolves the zone through the single path"* — for everything it builds, and does not widen into repairing eight pre-existing call sites it did not create. The defect stays named, with a destination, and is not discharged by being understood |
| B | Repair all eight sites inside Phase 2R | **+0.5 to +1 day**, and it touches `chat`, `history`, `work` and `daily-cycle` — four surfaces with no relationship to recurrence | Makes the phase a container for accumulated debt, which is the standing instruction's exact prohibition. It would also need its own journeys, because four of the eight are rendered surfaces |
| C | Halt Phase 2R until the second authority is repaired under its own initiative | the phase's whole critical path, ~12 days, waiting on unrelated work | Defensible only if the divergence could produce a wrong recurrence instant, and it cannot once option A is taken: the recurrence engine would read the contract, not the lax path |

**Recommendation: A.** The reason is not budget. Option A makes the *new* code
correct by construction and leaves the *old* code exactly as correct as it was
this morning — while naming the defect, its mechanism, its reachability and its
destination, so nobody can later mistake it for something this phase absorbed.
Option B is how a phase becomes two things. Option C spends twelve days to
prevent a divergence that option A already prevents, on data where no stored
value diverges.

**Whichever is chosen, one thing is not optional and is not in the phase's
gift:** `profiles.timezone` has no database-side constraint. That is worth a
check constraint, and a check constraint is a **migration** — which Phase 2R
does not have and must not take. It is named here, routed to the same
destination, and **not** quietly folded in.

---

## 9. What this slice deliberately did not do

No product code. No migration, created or applied. No hosted write, no fixture,
no residue. No deploy. No AI call and no BYOK credit. No browser run — none is
required by any of the six requirements, and inventing one would be a journey
against a surface this slice did not change. No change to the heartbeat, quiet
hours, the daily cap, the 24-hour cooldown or any automation category. Signup
stays closed and the rollout gate is untouched. Push HTTP 403 is not resumed.
`2P-ACCESS-005` stays **NOT EXECUTED — OWNER WAIVED**, and nothing here is
screen-reader evidence.

---

## 10. Classification

> **Corrected at closeout (slice 2R.5).** Five of these six rows read **built**
> until the traceability generator refused them. They are declared `baseline` —
> they ask for a property to be *measured and recorded*, not for behaviour to be
> added — and the contract's §1 is unambiguous: *"`baseline` may never be
> recorded as `built`."* Classifying a property that already held as newly built
> claims a change that did not happen. Only `2R-FOUNDATION-005` is declared
> `build`, and only it stays `built`. **The evidence in each row is unchanged;
> only the class it was filed under was wrong.**


| Requirement | Class | Evidence |
|---|---|---|
| `2R-FOUNDATION-001` | **baseline** | §2 — three independent reads, closed column list, delegated artifact scan, non-vacuity control |
| `2R-FOUNDATION-002` | **baseline** | §3 — ten clauses observed live on `pg_proc.prosrc` and re-asserted against the migration that defines the function, with three absent-clause controls |
| `2R-FOUNDATION-003` | **baseline** | §4 — five groups asserted **by position**, four named inputs as a closed set, and the dialog's real height limits at both breakpoints |
| `2R-FOUNDATION-004` | **baseline** | §5 — the contract named; the second authority enumerated as eight call sites; the divergence executed; reachability proved from `pg_constraint`; destination recorded |
| `2R-FOUNDATION-005` | **built** | §6 — the write path, the command union, the deployed boundary and the migration count all asserted unchanged |
| `2R-FOUNDATION-006` | **baseline** | §7 — live re-read with a probe control in the same statement; audit §10.3 **confirmed** |

**Six of seventy-three classified. Zero unclassified in this slice's scope.**

**One stop condition reached — `2R-FOUNDATION-004`, plan §5 row 7.** It is
reported rather than absorbed, and slice 2R.1 waits on the owner's answer to §8.
The other slice-2R.0 stop condition, `2R-FOUNDATION-006`, was **not** reached:
the hosted automation rows confirm the audit.
