# Phase 2S — Slice 2S.0 acceptance record

**Measure the ground this phase will stand on, and change nothing.**

- **Authorization:** implementation of slices 2S.0 … 2S.4, **ADR-138**
  (2026-08-24), over the package ADR-136 authorized and the ten decisions
  ADR-137 signed. ADR-138 authorizes construction; **it does not authorize
  closure**, which stays the owner's, twice — `2S-MOBILE-003` in slice 2S.3 and a
  closing checkpoint before slice 2S.4's report may become an ADR.
- **Requirements:** `2S-FOUNDATION-001` … `-007` (7 of 99).
- **Migrations:** **none created, none spent.** 101 local = 101 hosted, parity
  `202608230101`, unchanged by this slice. Budget stays **1 allocated · 0 spent ·
  0 created**.
- **Baseline:** `main` **`2006b1340c0a61cd42f46394275820262099df47`**, worktree
  clean, zero open pull requests, signup closed, rollout gate **25 pass · 3 fail
  · 2 owner-signature**.
- **Product behaviour changed: none.** No route, component, Server Action, RPC,
  schema, policy, grant, copy string or rendered control is altered. The slice's
  diff adds one test file and one record.
- **Hosted writes: none.** Every hosted statement below is a `select`, each is
  reproduced with its exact SQL, and **no fixture was planted** — so no residue
  can exist and none is claimed.
- **AI calls: none. BYOK credit spent: none.**

Executed by `src/lib/closeout/phase-2s-foundation.test.ts`.

**No stop condition was reached.** All six premises of PRD §1 reproduce **in
direction**. Three reproduce differently **in magnitude or in precision**, and
each is corrected forward below rather than absorbed — §7 states what each costs
the requirement set.

---

## 1. `2S-FOUNDATION-001` — the ledger, re-measured

```sql
select
  (select count(*) from public.notifications),
  (select count(*) filter (where status='unread') from public.notifications),
  (select count(*) filter (where status='read') from public.notifications),
  (select count(*) filter (where status='dismissed') from public.notifications),
  (select count(distinct user_id) from public.notifications);
```

| | measured 2026-08-24 | PRD §1 said |
|---|---|---|
| notifications | **57** | 57 ✅ |
| unread | **57** | — |
| read | **0** | 0 ✅ |
| dismissed | **0** | 0 ✅ |
| distinct owners | **1** | — |
| `dedupe_key` null | **0** | — |
| distinct `dedupe_key` | **57** | — |

Every row carries a distinct key, so nothing in the ledger is a duplicate of
anything else in it.

By type:

| type | n | first | last | distinct local days | distinct destinations |
|---|---|---|---|---|---|
| `task_stale` | **54** | `2026-08-06 16:00:00Z` | `2026-08-24 15:00:00Z` | 18 | 1 |
| `task_overdue` | **3** | `2026-08-15 15:00:00Z` | `2026-08-15 15:00:00Z` | 1 | 1 |

By local day, in `America/Sao_Paulo`:

```sql
with per_day as (
  select (created_at at time zone 'America/Sao_Paulo')::date as local_day, count(*) as n
  from public.notifications group by 1)
select count(*), min(n), max(n), min(local_day), max(local_day),
       (select count(*) from per_day where n <> 3)
from per_day;
```

**19 days · min 3 · max 3 · 2026-08-06 → 2026-08-24 · days not equal to three: 0.**

### Correction 1 — the date range, and it is the PRD's, not the finding's

PRD §1 states the rate as *"exactly 3 per day, **2026-08-17 → 2026-08-24**,
unbroken"*. The measured range is **2026-08-06 → 2026-08-24**, and it is
**nineteen** days rather than the eight that range spans or the eighteen the
PRD's own body names.

Both of the PRD's other numbers survive: 54 `task_stale` did fall on **18**
distinct local days, and the missing nineteenth is **2026-08-15**, the one day
whose three notices were `task_overdue` instead. So the product has spoken
**exactly three times a day, every day, for nineteen consecutive days, without a
single exception** — which is a stronger statement of the same defect than the
PRD made.

**Magnitude, not direction.** The measurement is corrected forward and the phase
does not stop.

---

## 2. `2S-FOUNDATION-002` — the cadence rules, from the deployed function

Read from `pg_get_functiondef(p.oid)` on `public.run_user_heartbeat` — the
deployed authority, not a migration file. `SECURITY DEFINER`, `search_path=""`,
9 327 characters. `public.run_all_heartbeats` likewise, 1 365 characters.

**Candidate predicate — `task_stale`:**

```sql
from public.tasks task
where not in_quiet_hours
  and task.user_id = p_user_id
  and task.status not in ('completed','cancelled','deferred','waiting')
  and task.due_at is null
  and task.updated_at < now() - make_interval(
    days => case task.manual_priority
              when 'urgent' then 0 when 'high' then 2 when 'low' then 15 else 7 end)
```

**Dedupe keys, all three types:**

| type | key | carries the local date? |
|---|---|---|
| `task_overdue` | `'overdue:' \|\| task.id \|\| ':' \|\| local_date` | **yes** |
| `task_stale` | `'stale:' \|\| task.id \|\| ':' \|\| local_date` | **yes** |
| `reminder` | `'reminder:' \|\| reminder.id` | **no** |

**Rank:** `task_stale` 1 · `task_overdue` 2/3/4 by `manual_priority` · `reminder`
2, or 3 when important. Ordering is `order by rank desc, event_time asc,
dedupe_key`, limited to `available_slots`.

### Correction 2 — the suppression has TWO clauses and a constraint, not one

PRD §1 and handoff §128 both quote a **single** clause: the 24-hour window that
never reads `status`. The deployed function has **three layers**:

```sql
), pending as (
  select candidate.*
  from candidates candidate
  where not exists (                       -- (A) exact key, NO time bound
    select 1 from public.notifications notification
    where notification.user_id = p_user_id
      and notification.dedupe_key = candidate.dedupe_key)
  and not exists (                          -- (B) 24h cooldown, TASK TYPES ONLY
    select 1 from public.notifications notification
    where candidate.type in ('task_overdue', 'task_stale')
      and notification.user_id = p_user_id
      and notification.created_at > now() - interval '24 hours'
      and notification.dedupe_key like
        split_part(candidate.dedupe_key, ':', 1) || ':' ||
        split_part(candidate.dedupe_key, ':', 2) || ':%')
), limited as (
  select pending.* from pending
  order by rank desc, event_time asc, dedupe_key
  limit available_slots
), inserted as (
  insert into public.notifications (...)
  select ... from limited
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing   -- (C)
  returning dedupe_key)
```

- **(A)** is unbounded in time and exact on the key. Because a task key carries
  the **local date**, tomorrow's key differs and (A) does not stop it. Because a
  **reminder** key does not, (A) makes a reminder notice permanently once-only.
  *That is why the ledger holds zero `reminder` rows repeating and 54
  `task_stale` rows that do.*
- **(B)** is the clause the PRD quotes, and it is **scoped to the two task
  types** — a detail the quote omits.
- **(C)** is a unique constraint underneath both.

**Neither (A) nor (B) reads `status`.** That half of the PRD's finding — the one
the whole phase rests on — is **exactly right**, and is asserted in the test over
a bounded slice of the function body so a `status` elsewhere in a 1 500-line
migration cannot mask it.

**Precision, not direction.** But it is load-bearing: **slice 2S.1 cannot design
a backoff against the PRD's quote alone**, because a backoff that only widens (B)
would still be defeated by the date inside the key, and one that changes the key
would collide with (A) and (C). §7 records that as a design constraint the next
slice inherits.

**Local authority:** the deployed body is byte-equivalent to
`supabase/migrations/202608040073_account_lifecycle_admin.sql:490`. The test
re-asserts every clause above against that file, with two absent-clause controls
so a loose match cannot pass.

**What is NOT proved here.** Nothing about behaviour. Quiet hours, the daily cap,
the 24-hour cooldown, the per-user lock and batch failure isolation are recorded
as text and are re-proved **by calling `run_user_heartbeat`** in slice 2S.1 —
`2S-CADENCE-004` … `-007`. Slice 2R.1 matched substrings against `prosrc` and it
proved nothing about behaviour; slice 2R.4 called the function twenty-six times
and found a real defect. This record does not repeat 2R.1's mistake by claiming
otherwise.

---

## 3. `2S-FOUNDATION-003` — the surface's controls, enumerated from the component

`src/app/[locale]/app/notifications/page.tsx`, 130 lines.

| control | where | destination | rendered when |
|---|---|---|---|
| **Abrir** | row | `href={item.action_url}` — the row's own value, uncomputed | `item.action_url` is truthy |
| **Lida** | row | `<form action={markNotification}>` with `value="read"` fixed in a hidden input | `item.status === "unread"` only |
| preferences link | header | `settingsSectionHref(locale, "notifications")` | always |
| pagination | footer | `?page` | always |

**Exactly two row controls**, asserted as a closed set by counting
`className="row-action"`, with two negative controls: no `value="dismissed"`
anywhere, and no suppression vocabulary anywhere.

The read control is gated on the row being unread — `R-24`, a control whose only
outcome would be a no-op is not offered. **Slice 2S.2 must preserve that property
when it adds verbs beside it.**

---

## 4. `2S-FOUNDATION-004` — `dismissed` is unreachable, and the census finds the caller first

Census over **every** non-test `.ts`/`.tsx` file under `src/`, not a guessed
directory:

| caller | status it sends |
|---|---|
| `src/app/[locale]/app/notifications/page.tsx` | `"read"` |

**Exactly one**, and the assertion is written caller-count-first on purpose: a
scan that found *no* callers would satisfy *"nothing sends `dismissed`"*
vacuously. Phase 2R paid for that shape of control and this file will not repeat
it.

Both halves of the defect, together:

- `src/features/agent/actions.ts:501` still accepts `z.enum(["read","dismissed"])`;
- `page.tsx:73` still filters `.neq("status", "dismissed")`.

**A filter guarding a state nothing in the product can produce. Reproduces
exactly as the PRD states.**

---

## 5. `2S-FOUNDATION-005` — push, re-read whatever it says

```sql
select count(*) from public.notification_deliveries;
```

**0.**

**Stop condition 2 is NOT reached.** Push has not begun working, `OD-2S-6` A
stands, and this phase stays in-app only. `2S-TRUST-008` continues to refuse the
*claim* that push works — including in this record, which states only that the
table is empty.

---

## 6. `2S-FOUNDATION-006` — the subjects, re-read live

The stale-candidate predicate, run as itself against the deployed data:

```sql
select count(*), min(updated_at), string_agg(distinct status, ','),
       string_agg(distinct coalesce(manual_priority,'<null>'), ',')
from public.tasks task
where task.status not in ('completed','cancelled','deferred','waiting')
  and task.due_at is null
  and task.updated_at < now() - make_interval(
    days => case task.manual_priority when 'urgent' then 0 when 'high' then 2
                                      when 'low' then 15 else 7 end);
```

**3 candidates · all `inbox` · all `manual_priority` NULL · oldest `updated_at`
`2026-07-30 15:01:19Z`.** Reproduces PRD §1 exactly.

Total tasks in the database: **7**, statuses `inbox` and `cancelled` — read as
`postgres`, so no RLS policy is hiding a row from this count.

### Correction 3 — three notices in production already point at nothing

Joining each notice's subject id back to `public.tasks`:

| key kind | notices | distinct subjects | subject status |
|---|---|---|---|
| `stale` | 54 | 3 | `inbox` — all present |
| `overdue` | 3 | 3 | **the task does not exist** |

```sql
select count(*) from public.notifications n
where split_part(n.dedupe_key,':',1)='overdue'
  and not exists (select 1 from public.tasks t
                  where t.id::text = split_part(n.dedupe_key,':',2));
-- 3
```

The three `task_overdue` notices from 2026-08-15 name subjects that are **gone**.
Zero `stale` notices have that problem.

**This is inert today and becomes live in slice 2S.1.** The destination is
currently `/…/app/tasks` — a list, which resolves for any notice at all. The
moment `2S-REACH-001` points a notice at **its subject**, those three rows become
links to a task that does not exist.

**`2S-REACH-004` is therefore not a defensive hypothesis. It has three rows of
live evidence, and slice 2S.1 must ship its fallback in the same change that
creates the need for it** — not after.

---

## 7. What the next slice inherits from these corrections

| # | correction | direction? | what it costs |
|---|---|---|---|
| 1 | the ledger's range is 19 days from 2026-08-06, not 8 from 2026-08-17 | no — magnitude | nothing structural. The defect is **larger** than stated: 3/day for 19 days with zero exceptions |
| 2 | suppression is **(A) exact-key, unbounded** + **(B) 24h, task-types-only** + **(C) a unique constraint** | no — precision | **load-bearing.** A backoff that only widens (B) is defeated by the date inside the key; one that changes the key collides with (A) and (C). Slice 2S.1 designs against all three |
| 3 | three `overdue` notices already name deleted subjects | no — the PRD did not measure it | `2S-REACH-004` gains live evidence and must ship **with** `2S-REACH-001`, not after it |

**One further precision, recorded because a requirement rests on it.**
`2S-TRUST-005` reads *"the heartbeat remains the only writer of
`notifications`"*. Literally there are **two**, writing different things:

| writer | operation |
|---|---|
| `run_user_heartbeat` | **INSERT** — the only producer of rows |
| `markNotification` (`agent/actions.ts:517`) | **UPDATE** of `status`/`read_at` — the only mutator of disposition |

Readers: `page.tsx:73`, `question-surfacing-data.ts:86` and `:91`.

**Stop condition 3 asks for a second *producer*, and there is none.** The
requirement's sentence is loose, its intent is met, and saying so now is cheaper
than discovering at closeout that it was classified against a sentence nobody
could check.

---

## 8. Stop conditions, each checked

| # | condition | result |
|---|---|---|
| 2 | `notification_deliveries` non-zero | **not reached** — 0 |
| 3 | a second **producer** of `notifications` | **not reached** — one INSERT path |
| 4 | the live ledger contradicts PRD §1 **in direction** | **not reached** — all six premises reproduce; three differ in magnitude or precision and are corrected forward |
| 1 | a second migration | **not reached** — none created |
| 12 | push resumed, repaired or claimed | **not reached** — this record claims nothing |

**Slice 2S.1 may start.**

---

## 9. Classification

**Read by `scripts/generate-phase-2s-traceability.mjs` at slice 2S.4.** The
header shape is fixed by the traceability contract — Phase 2R's generator
classified three requirements twice by reading a four-column transition table
whose second column was not the class, so only a table beginning
`| Requirement | Class |` is parsed.

**Six of the seven are `baseline` and are recorded as `baseline`.** The PRD
declares them so, and `2S-CLOSE-003` refuses a `baseline` recorded as `built`
because Phase 2R stated that rule in prose and nothing read it until five
requirements had been misfiled since its first slice. This is that phase's first
slice, and the rule is applied at it.

| Requirement | Class | Evidence |
|---|---|---|
| `2S-FOUNDATION-001` | **baseline** | §1 — counts by type, status and local day taken live at the slice's own baseline; 19 unbroken days at exactly 3/day, zero exceptions; the PRD's date range corrected forward |
| `2S-FOUNDATION-002` | **baseline** | §2 — the candidate predicate, all three dedupe keys, the rank ordering and **three** suppression layers quoted from `pg_get_functiondef` and re-asserted against `202608040073:490` with two absent-clause controls; behaviour deliberately not claimed |
| `2S-FOUNDATION-003` | **baseline** | §3 — every control enumerated from the component with its destination, asserted as a **closed set** with two negative controls |
| `2S-FOUNDATION-004` | **baseline** | §4 — a census over every non-test source file finds exactly one caller sending exactly `"read"`; the assertion is caller-count-first so an empty scan cannot pass it vacuously |
| `2S-FOUNDATION-005` | **baseline** | §5 — `notification_deliveries` read live: **0**. Stop condition 2 not reached, and nothing here claims push works |
| `2S-FOUNDATION-006` | **baseline** | §6 — the stale predicate run as itself: 3 candidates, all `inbox`, oldest `updated_at` 2026-07-30; plus the unmeasured finding that **three `overdue` notices already name deleted subjects** |
| `2S-FOUNDATION-007` | **built** | §7 and the slice's own diff — one test file and one record; migration count asserted at 101 with no `phase_2s` file; the application-layer writer census asserted as a closed set of one |
